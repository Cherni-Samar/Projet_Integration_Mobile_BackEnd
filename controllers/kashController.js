const Expense = require('../models/Expense');
const User = require('../models/User');
const Employee = require('../models/Employee');
const Reminder = require('../models/Reminder');
const Budget = require('../models/Budget');
const axios = require('axios');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const Groq = require('groq-sdk');
const emailSender = require('../services/shared/emailSender');
const financeService = require('../services/kash/finance.service');

const ENERGY_COST_ADD_EXPENSE = 5;
const ENERGY_COST_ANALYZE_RECEIPT = 10;

const GEMINI_MODEL_NAME = 'gemini-1.5-flash';

// Initialize Groq client at module level
let groqClient = null;
function getGroqClient() {
  if (!groqClient) {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      throw new Error('GROQ_API_KEY not configured');
    }
    groqClient = new Groq({ apiKey });
  }
  return groqClient;
}

let geminiModel;

function getGeminiModel() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY missing');

  if (!geminiModel) {
    // DO NOT add apiVersion here, let the latest SDK handle it
    const genAI = new GoogleGenerativeAI(apiKey);
    geminiModel = genAI.getGenerativeModel({ model: GEMINI_MODEL_NAME });
  }
  return geminiModel;
}

function parseDataUrl(dataUrl) {
  const match = /^data:([^;]+);base64,(.+)$/i.exec(dataUrl);
  if (!match) return null;
  return { mimeType: match[1], base64: match[2] };
}

function normalizeBase64String(value) {
  if (typeof value !== 'string') return '';
  return value.trim().replace(/\s+/g, '');
}

function inferMimeTypeFromBase64(base64) {
  const head = base64.slice(0, 24);
  if (head.startsWith('/9j/')) return 'image/jpeg';
  if (head.startsWith('iVBORw0KGgo')) return 'image/png';
  if (head.startsWith('R0lGOD')) return 'image/gif';
  if (head.startsWith('UklGR')) return 'image/webp';
  return 'image/png';
}

async function downloadImageAsBase64(imageUrl) {
  const url = typeof imageUrl === 'string' ? imageUrl.trim() : '';
  if (!url) return null;
  if (!/^https?:\/\//i.test(url)) {
    const err = new Error('imageUrl doit être http(s)');
    err.statusCode = 400;
    throw err;
  }

  try {
    const resp = await axios.get(url, { responseType: 'arraybuffer' });
    const mimeType = resp.headers?.['content-type'] || 'image/png';
    const base64 = Buffer.from(resp.data).toString('base64');
    return { mimeType, base64 };
  } catch (e) {
    const err = new Error("Impossible de télécharger l'image");
    err.statusCode = 400;
    throw err;
  }
}

async function coerceToGeminiInlineData({ imageUrl, imageBase64 }) {
  const candidateB64 = normalizeBase64String(imageBase64);
  if (candidateB64) {
    if (candidateB64.startsWith('data:')) {
      const parsed = parseDataUrl(candidateB64);
      if (!parsed) {
        const err = new Error('imageBase64 data URL invalide');
        err.statusCode = 400;
        throw err;
      }
      return { mimeType: parsed.mimeType, base64: normalizeBase64String(parsed.base64) };
    }
    return { mimeType: inferMimeTypeFromBase64(candidateB64), base64: candidateB64 };
  }

  const candidateUrl = typeof imageUrl === 'string' ? imageUrl.trim() : '';
  if (candidateUrl) {
    return downloadImageAsBase64(candidateUrl);
  }

  return null;
}

function safeJsonParse(text) {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch (e) {
    return { ok: false, error: e };
  }
}

function validateGeminiExtraction(payload) {
  if (!payload || typeof payload !== 'object') return { ok: false, message: 'payload invalide' };

  if (typeof payload.error === 'string' && payload.error) {
    return { ok: true, invalidDocument: true, error: payload.error };
  }

  const required = ['amount', 'currency', 'vendor', 'category', 'date'];
  for (const k of required) {
    if (!(k in payload)) return { ok: false, message: `champ manquant: ${k}` };
  }

  if (typeof payload.amount !== 'number' || !Number.isFinite(payload.amount)) {
    return { ok: false, message: 'amount invalide' };
  }

  const allowedCategories = ['SaaS', 'Marketing', 'Travel', 'Office', 'Salaries'];
  if (typeof payload.category !== 'string' || !allowedCategories.includes(payload.category)) {
    return { ok: false, message: 'category invalide' };
  }

  if (typeof payload.currency !== 'string' || !payload.currency.trim()) {
    return { ok: false, message: 'currency invalide' };
  }
  if (typeof payload.vendor !== 'string' || !payload.vendor.trim()) {
    return { ok: false, message: 'vendor invalide' };
  }
  if (typeof payload.date !== 'string' || !payload.date.trim()) {
    return { ok: false, message: 'date invalide' };
  }

  return { ok: true, invalidDocument: false };
}

async function analyzeReceiptWithGemini({ inlineData }) {
  const model = getGeminiModel();

  const prompt = `Tu es Kash, un expert financier. Analyse cette image de reçu. 
  Retourne UNIQUEMENT un objet JSON avec ces champs: 
  amount (nombre), currency (string), vendor (string), category (SaaS, Marketing, Travel, Office, ou Salaries), date (ISO string), description (string).
  Si ce n'est pas un reçu, retourne {"error": "Invalid document"}.`;

  // Use the standard multimodal call
  const result = await model.generateContent([
    prompt,
    {
      inlineData: {
        data: inlineData.base64,
        mimeType: inlineData.mimeType
      }
    }
  ]);

  const response = await result.response;
  let text = response.text();
  
  // Clean potential markdown
  text = text.replace(/```json/g, '').replace(/```/g, '').trim();

  const parsed = safeJsonParse(text);
  if (!parsed.ok) throw new Error('Gemini returned invalid JSON: ' + text);

  return parsed.value;
}

/**
 * Analyze receipt via Mistral AI Vision API
 * Direct API call to api.mistral.ai/v1/chat/completions
 * Uses Pixtral model for vision capabilities
 */
async function analyzeReceiptWithMistral(base64String, mimeType) {
  const apiKey = process.env.MISTRAL_API_KEY;
  if (!apiKey) {
    throw new Error('MISTRAL_API_KEY not configured');
  }

  const prompt = `You are a financial OCR bot. Analyze this receipt and return ONLY a JSON object: {amount: number, currency: 'TND', vendor: string, category: string, date: string, description: string}.`;

  try {
    const response = await axios.post(
      'https://api.mistral.ai/v1/chat/completions',
      {
        model: 'pixtral-12b-latest',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: prompt,
              },
              {
                type: 'image_url',
                image_url: {
                  url: `data:${mimeType};base64,${base64String}`,
                },
              },
            ],
          },
        ],
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
      }
    );

    const responseText = response.data?.choices?.[0]?.message?.content || '';
    if (!responseText) {
      throw new Error('Empty response from Mistral API');
    }

    // Remove markdown JSON blocks
    let cleanedText = responseText
      .replace(/```json\s*/gi, '')
      .replace(/```\s*/gi, '')
      .trim();

    // Parse JSON directly
    const parsed = safeJsonParse(cleanedText);
    if (!parsed.ok) {
      throw new Error('Response parsing failed: ' + cleanedText);
    }

    return parsed.value;
  } catch (error) {
    throw new Error('Mistral API error: ' + error.message);
  }
}

/**
 * Analyze receipt via Gemini Vision API
 */
async function analyzeReceiptWithGemini(inlineData) {
  const model = getGeminiModel();
  
  const prompt = `Tu es Kash, un expert financier. Analyse cette image de reçu. 
  Retourne UNIQUEMENT un objet JSON avec ces champs: 
  amount (nombre), currency (string), vendor (string), category (SaaS, Marketing, Travel, Office, ou Salaries), date (ISO string), description (string).
  Si ce n'est pas un reçu, retourne {"error": "Invalid document"}.`;

  // Use the standard multimodal call
  const result = await model.generateContent([
    prompt,
    {
      inlineData: {
        data: inlineData.base64,
        mimeType: inlineData.mimeType
      }
    }
  ]);

  const geminiResponse = await result.response;
  let text = geminiResponse.text();
  
  // Clean potential markdown
  text = text.replace(/```json/g, '').replace(/```/g, '').trim();

  const parsed = safeJsonParse(text);
  if (!parsed.ok) throw new Error('Gemini returned invalid JSON: ' + text);

  return parsed.value;
}

/**
 * Analyze receipt via Mistral AI Vision API
 * Direct API call to api.mistral.ai/v1/chat/completions
 * Uses Pixtral model for vision capabilities
 */
async function analyzeReceiptWithMistral(base64String, mimeType) {
  const apiKey = process.env.MISTRAL_API_KEY;
  if (!apiKey) {
    throw new Error('MISTRAL_API_KEY not configured');
  }

  const prompt = `You are a financial OCR bot. Analyze this receipt and return ONLY a JSON object: {amount: number, currency: 'TND', vendor: string, category: string, date: string, description: string}.`;

  try {
    const response = await axios.post(
      'https://api.mistral.ai/v1/chat/completions',
      {
        model: 'pixtral-12b-latest',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: prompt,
              },
              {
                type: 'image_url',
                image_url: {
                  url: `data:${mimeType};base64,${base64String}`,
                },
              },
            ],
          },
        ],
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
      }
    );

    const responseText = response.data?.choices?.[0]?.message?.content || '';
    if (!responseText) {
      throw new Error('Empty response from Mistral API');
    }

    // Remove markdown JSON blocks
    let cleanedText = responseText
      .replace(/```json\s*/gi, '')
      .replace(/```\s*/gi, '')
      .trim();

    // Parse JSON directly
    const parsed = safeJsonParse(cleanedText);
    if (!parsed.ok) {
      throw new Error('Response parsing failed: ' + cleanedText);
    }

    return parsed.value;
  } catch (error) {
    console.log('FULL ERROR DATA:', JSON.stringify(error.response?.data, null, 2));
    if (error.response?.status) {
      throw new Error(`Mistral API error (${error.response.status}): ${error.response.data?.error?.message || error.message}`);
    }
    throw new Error(`Mistral API error: ${error.message}`);
  }
}
// HELPER FUNCTIONS
// ============================================================================

/**
 * Recalculate budget spent by summing all expenses matching each budget project
 * Fetches all expenses for userId, groups by category, updates budget.spent dynamically
 */
async function recalculateBudgetSpent(userId) {
  try {
    const expenses = await Expense.find({ managerId: userId }).lean();
    const budgets = await Budget.find({ managerId: userId, isActive: true });
    
    if (!budgets || budgets.length === 0) {
      return budgets;
    }

    // Update spent values for each budget from real expenses
    for (const budget of budgets) {
      const totalSpent = expenses
        .filter(e => e.category === budget.category)
        .reduce((sum, e) => sum + (e.amount || 0), 0);
      
      budget.spent = totalSpent;
      await budget.save();
    }

    console.log(`[Kash] Budget spent recalculated for user: ${userId}`);
    return budgets;
  } catch (err) {
    console.error(`[Kash] Error recalculating budget spent: ${err.message}`);
    throw err;
  }
}

/**
 * Generate and send budget alert email with flexible alert types
 */
async function sendBudgetAlertEmail(user, message, alertType, details) {
  try {
    let emailSubject = '';
    let emailContent = '';

    if (alertType === 'BUDGET_EXCEEDED') {
      const { category, budgetLimit, excess } = details;
      emailSubject = `🚨 ALERTE BUDGET : ${category} Dépassé (Excess: ${excess.toFixed(2)} DT)`;
      emailContent = `
ALERTE BUDGET - DÉPASSEMENT CRITIQUE

Votre budget pour la catégorie "${category}" a DÉPASSÉ la limite :
- Limite du budget : ${budgetLimit} DT
- Montant dépassé : ${excess.toFixed(2)} DT
- Total dépensé projeté : ${details.projectedSpent.toFixed(2)} DT

Cette catégorie est maintenant en dépassement. Veuillez examiner vos dépenses et ajuster votre budget ou vos dépenses en conséquence.

---
Kash Financial Agent
Système PIM e-team
      `;
    } else if (alertType === 'BUDGET_WARNING') {
      const { category, budgetLimit, percentage } = details;
      emailSubject = `⚠️ ALERTE BUDGET : ${category} à ${percentage}%`;
      emailContent = `
ALERTE BUDGET - ATTENTION

Votre budget pour "${category}" a atteint ${percentage}% :
- Limite du budget : ${budgetLimit} DT
- Total dépensé projeté : ${details.projectedSpent.toFixed(2)} DT
- Persentage utilisé : ${percentage}%

Considérez l'examen de vos dépenses pour rester dans les limites du budget.

---
Kash Financial Agent
Système PIM e-team
      `;
    } else {
      // Generic alert
      emailSubject = `Budget Alert: ${message}`;
      emailContent = message;
    }

    const result = await emailSender.sendEmail({
      to: user.email,
      subject: emailSubject,
      content: emailContent,
      from: 'kash@e-team.com',
    });

    console.log(`[Kash Alert] ${alertType} email sent to: ${user.email}`);
    return result;
  } catch (err) {
    console.warn(`[Kash] Failed to send budget alert email: ${err.message}`);
    return { success: false, error: err.message };
  }
}

// ============================================================================
// EXPORTED FUNCTIONS
// ============================================================================

/**
 * Analyze receipt via Gemini AI
 * POST /api/kash/analyze
 */
exports.analyzeReceipt = async (req, res, next) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const { imageUrl, imageBase64 } = req.body ?? {};
    const result = await financeService.analyzeReceipt(userId, { imageUrl, imageBase64 });
    res.json(result);
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message,
        ...(error.requiredEnergy && { requiredEnergy: error.requiredEnergy })
      });
    }
    next(error);
  }
};

/**
 * Add expense (save from analyzed receipt or manual entry)
 * POST /api/kash/add
 */
exports.addExpense = async (req, res, next) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const { amount, currency, vendor, category, date, description, employeeId } = req.body ?? {};
    const result = await financeService.addExpense(userId, { amount, currency, vendor, category, date, description, employeeId });
    res.status(201).json(result);
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message,
      });
    }
    next(error);
  }
};

/**
 * Get all expenses for user (limit 50, sorted by date desc)
 * GET /api/kash/expenses
 */
exports.getExpenses = async (req, res, next) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const result = await financeService.getExpenses(userId);
    res.json(result);
  } catch (error) {
    next(error);
  }
};

/**
 * Get budget array for user
 * Calculates spent dynamically from real expenses in database
 * GET /api/kash/budget
 */
exports.getBudget = async (req, res, next) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const result = await financeService.getBudget(userId);
    res.json(result);
  } catch (error) {
    next(error);
  }
};

/**
 * Add or update a budget entry
 * POST /api/kash/budget
 */
exports.setBudget = async (req, res, next) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const { project, amount } = req.body ?? {};
    const result = await financeService.setBudget(userId, { project, amount });
    res.json(result);
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message,
      });
    }
    next(error);
  }
};

/**
 * Create a new budget entry using the Budget model
 * POST /api/kash/budget/create
 * Body: { category, limit, currency }
 */
exports.createBudget = async (req, res, next) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const { category, limit, currency } = req.body ?? {};
    const result = await financeService.createBudget(userId, { category, limit, currency });
    res.status(201).json(result);
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message,
      });
    }
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: 'Budget for this category already exists',
      });
    }
    next(error);
  }
};

/**
 * Get all reminders for user (sorted by dueDate asc)
 * GET /api/kash/reminders
 */
exports.getReminders = async (req, res, next) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const result = await financeService.getReminders(userId);
    res.json(result);
  } catch (error) {
    next(error);
  }
};

/**
 * Create a new reminder
 * POST /api/kash/reminders
 */
exports.createReminder = async (req, res, next) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const { title, amount, currency = 'TND', dueDate, notes = '', category = 'Other', vendor = '' } = req.body ?? {};
    const result = await financeService.createReminder(userId, { title, amount, currency, dueDate, notes, category, vendor });
    res.status(201).json(result);
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message,
      });
    }
    next(error);
  }
};

/**
 * Mark reminder as paid
 * PATCH /api/kash/reminders/:id/mark-paid
 */
exports.markReminderPaid = async (req, res, next) => {
  try {
    const userId = req.user?.id;
    const { id } = req.params;

    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const result = await financeService.markReminderPaid(userId, id);
    res.json(result);
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message,
      });
    }
    next(error);
  }
};

/**
 * Recalculate budget spent by re-summing all expenses
 * POST /api/kash/recalculate-budget
 * Returns updated budget array
 */
exports.recalculateBudget = async (req, res, next) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const result = await financeService.recalculateBudgetForUser(userId);
    res.json(result);
  } catch (error) {
    next(error);
  }
};

/**
 * Employee expense submission via file upload
 * POST /api/kash/employee/upload
 * Requires: employee JWT token + multipart file (image/PDF)
 * 
 * Process:
 * 1. Accept image/PDF file via multer
 * 2. Convert to base64
 * 3. Analyze with Gemini AI
 * 4. Find employee's manager_email from Employee collection
 * 5. Find User (CEO) with that email to get managerId
 * 6. Save expense to Expense collection
 * 7. Trigger budget alert if needed
 */
exports.submitEmployeeExpense = async (req, res, next) => {
  try {
    const employeeId = req.employee?.id;

    if (!employeeId) {
      return res.status(401).json({
        success: false,
        message: 'Employee token required'
      });
    }

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'File (image or PDF) is required'
      });
    }

    const result = await financeService.submitEmployeeExpense(employeeId, req.file.buffer, req.file.mimetype || 'image/png');
    res.status(201).json(result);
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message,
      });
    }
    next(error);
  }
};

/**
 * Check if organization can afford to hire a new employee with given salary
 * GET /api/kash/check-hiring?salary=3000
 */
exports.checkHiringFeasibility = async (req, res, next) => {
  try {
    const userId = req.user?.id;
    const { salary } = req.query;

    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const result = await financeService.checkHiringFeasibility(userId, salary);
    res.json(result);
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message,
      });
    }
    next(error);
  }
};
exports.staffingCostAnalysis = async (req, res) => {
  try {
    const result = await financeService.staffingCostAnalysis(req.body);
    res.json(result);
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({
        success: false,
        message: err.message,
      });
    }
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
};
exports.staffingAllocationAnalysis = async (req, res) => {
  try {
    const { userId, needs = [] } = req.body;

    if (!userId || !Array.isArray(needs) || needs.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'userId et needs requis',
      });
    }

    const salariesBudget = await Budget.findOne({
      managerId: userId,
      category: 'Salaries',
      isActive: true,
    }).lean();

    if (!salariesBudget) {
      return res.json({
        success: true,
        allocation: {
          approved: [],
          blocked: needs.map(n => ({
            department: n.department,
            requested: Number(n.missing || 0),
            blocked: Number(n.missing || 0),
            reason: 'Aucun budget Salaries trouvé',
          })),
          budget: null,
          recommendation: 'Créer un budget Salaries avant de recruter.',
        },
      });
    }

    const priorities = {
      Tech: 5,
      Finance: 4,
      Operations: 3,
      Marketing: 2,
      Other: 1,
    };

    let remainingBudget = salariesBudget.limit - salariesBudget.spent;

    const enrichedNeeds = [];

    for (const need of needs) {
      const department = need.department;
      const missing = Number(need.missing || 0);

      if (!department || missing <= 0) continue;

      const employees = await Employee.find({
        ceo_id: userId,
        department,
        status: 'active',
      })
        .select('+salary')
        .lean();

      const salaries = employees
        .map(e => Number(e.salary || 0))
        .filter(s => s > 0);

      const avgSalary =
        salaries.length > 0
          ? salaries.reduce((sum, s) => sum + s, 0) / salaries.length
          : 2500;

      enrichedNeeds.push({
        department,
        requested: missing,
        avgSalary,
        priority: priorities[department] || priorities.Other,
      });
    }

    // priorité 1 : donner au moins 1 recrutement aux départements critiques
    enrichedNeeds.sort((a, b) => b.priority - a.priority);

    const approved = [];
    const blocked = [];

    for (const need of enrichedNeeds) {
      let approvedCount = 0;

      for (let i = 0; i < need.requested; i++) {
        if (remainingBudget >= need.avgSalary) {
          approvedCount += 1;
          remainingBudget -= need.avgSalary;
        } else {
          break;
        }
      }

      if (approvedCount > 0) {
        approved.push({
          department: need.department,
          requested: need.requested,
          approved: approvedCount,
          avgSalary: need.avgSalary,
          estimatedCost: approvedCount * need.avgSalary,
          priority: need.priority,
        });
      }

      const blockedCount = need.requested - approvedCount;

      if (blockedCount > 0) {
        blocked.push({
          department: need.department,
          requested: need.requested,
          blocked: blockedCount,
          avgSalary: need.avgSalary,
          missingBudget: Math.max(0, need.avgSalary * blockedCount - remainingBudget),
          reason: 'Budget Salaries insuffisant',
          priority: need.priority,
        });
      }
    }

    return res.json({
      success: true,
      allocation: {
        approved,
        blocked,
        budget: {
          limit: salariesBudget.limit,
          spent: salariesBudget.spent,
          initialRemaining: salariesBudget.limit - salariesBudget.spent,
          finalRemaining: remainingBudget,
          currency: salariesBudget.currency,
        },
        recommendation:
          approved.length > 0
            ? `Kash recommande de lancer ${approved.reduce((s, a) => s + a.approved, 0)} recrutement(s) selon la priorité métier.`
            : 'Kash bloque tous les recrutements : budget Salaries insuffisant.',
      },
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
};