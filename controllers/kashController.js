const Expense = require('../models/Expense');
const User = require('../models/User');
const Employee = require('../models/Employee');
const Reminder = require('../models/Reminder');
const Budget = require('../models/Budget');
const axios = require('axios');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const Groq = require('groq-sdk');
const emailSender = require('../services/emailSender');

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
    const inlineData = await coerceToGeminiInlineData({ imageUrl, imageBase64 });

    if (!inlineData) {
      return res.status(400).json({ success: false, message: 'imageUrl ou imageBase64 requis' });
    }

    // Atomic energy debit
    const updatedUser = await User.findOneAndUpdate(
      { _id: userId, energyBalance: { $gte: ENERGY_COST_ANALYZE_RECEIPT } },
      { $inc: { energyBalance: -ENERGY_COST_ANALYZE_RECEIPT } },
      { new: true }
    ).lean();

    if (!updatedUser) {
      return res.status(403).json({
        success: false,
        message: "Énergie insuffisante pour l'analyse IA",
        requiredEnergy: ENERGY_COST_ANALYZE_RECEIPT,
      });
    }

    try {
      const extracted = await analyzeReceiptWithGemini({ inlineData });
      const validation = validateGeminiExtraction(extracted);

      if (!validation.ok) {
        const err = new Error(`Réponse Gemini invalide: ${validation.message}`);
        err.statusCode = 502;
        throw err;
      }

      if (validation.invalidDocument) {
        return res.status(400).json({
          success: false,
          message: validation.error || 'Invalid document',
        });
      }

      return res.status(200).json({
        success: true,
        message: 'Analyse terminée. Validez avant enregistrement.',
        data: {
          extracted: {
            amount: extracted.amount,
            currency: extracted.currency,
            vendor: extracted.vendor,
            category: extracted.category,
            date: extracted.date,
            description: typeof extracted.description === 'string' ? extracted.description : '',
          },
          energyBalance: updatedUser.energyBalance,
        },
      });
    } catch (err) {
      // Rollback energy on Gemini failure
      await User.updateOne(
        { _id: userId },
        { $inc: { energyBalance: ENERGY_COST_ANALYZE_RECEIPT } }
      );
      throw err;
    }
  } catch (error) {
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

    if (amount === undefined || amount === null || amount === '') {
      return res.status(400).json({ success: false, message: 'amount requis' });
    }

    const normalizedAmount = Number(amount);
    if (!Number.isFinite(normalizedAmount)) {
      return res.status(400).json({ success: false, message: 'amount invalide' });
    }

    // Atomic energy debit
    const updatedUser = await User.findOneAndUpdate(
      { _id: userId, energyBalance: { $gte: ENERGY_COST_ADD_EXPENSE } },
      { $inc: { energyBalance: -ENERGY_COST_ADD_EXPENSE } },
      { new: true }
    ).lean();

    if (!updatedUser) {
      return res.status(403).json({
        success: false,
        message: 'Énergie insuffisante pour ajouter une dépense',
      });
    }

    try {
      // Check budget constraint if category is provided
      let expenseStatus = 'pending';
      let budgetAlert = null;

      if (category) {
        try {
          const budget = await Budget.findOne({
            managerId: userId,
            category: category,
            isActive: true,
          });

          if (budget && budget.limit > 0) {
            const newSpent = budget.spent + normalizedAmount;

            if (newSpent > budget.limit) {
              // Budget exceeded - flag the expense
              expenseStatus = 'flagged';
              budgetAlert = {
                type: 'BUDGET_EXCEEDED',
                message: `Attention : Budget ${category} dépassé !`,
                details: {
                  category,
                  budgetLimit: budget.limit,
                  currentSpent: budget.spent,
                  newAmount: normalizedAmount,
                  projectedSpent: newSpent,
                  excess: newSpent - budget.limit,
                },
              };
              console.log(`[Kash] Budget exceeded for ${category}: ${newSpent} > ${budget.limit}`);
            } else if (newSpent > budget.limit * 0.8) {
              // Budget approaching limit - warning
              budgetAlert = {
                type: 'BUDGET_WARNING',
                message: `Attention : Vous avez atteint ${((newSpent / budget.limit) * 100).toFixed(0)}% du budget ${category}`,
                details: {
                  category,
                  budgetLimit: budget.limit,
                  currentSpent: budget.spent,
                  newAmount: normalizedAmount,
                  projectedSpent: newSpent,
                  percentage: ((newSpent / budget.limit) * 100).toFixed(2),
                },
              };
            }
          }
        } catch (budgetCheckErr) {
          console.warn(`[Kash] Failed to check budget: ${budgetCheckErr.message}`);
          // Don't fail expense creation if budget check fails
        }
      }

      const expense = await Expense.create({
        managerId: userId,
        employeeId: employeeId || null,
        amount: normalizedAmount,
        ...(currency !== undefined ? { currency } : {}),
        ...(vendor !== undefined ? { vendor } : {}),
        ...(category !== undefined ? { category } : {}),
        ...(date !== undefined ? { date } : {}),
        ...(description !== undefined ? { description } : {}),
        status: expenseStatus, // Set status based on budget check
      });

      // Update budget spent if category exists
      if (category) {
        try {
          await Budget.findOneAndUpdate(
            {
              managerId: userId,
              category: category,
              isActive: true,
            },
            { $inc: { spent: normalizedAmount } },
            { new: true }
          );
          console.log(`[Kash] Updated budget spent for ${category}: +${normalizedAmount}`);
        } catch (budgetUpdateErr) {
          console.warn(`[Kash] Failed to update budget spent: ${budgetUpdateErr.message}`);
        }
      }

      // Send budget alert email if needed
      if (budgetAlert) {
        try {
          const user = await User.findById(userId);
          if (user) {
            await sendBudgetAlertEmail(user, budgetAlert.message, budgetAlert.type, budgetAlert.details);
          }
        } catch (emailErr) {
          console.warn(`[Kash] Failed to send budget alert email: ${emailErr.message}`);
        }
      }

      // Recalculate budget spent dynamically for user dashboard
      if (category) {
        try {
          await recalculateBudgetSpent(userId);
        } catch (budgetErr) {
          console.warn(`[Kash] Failed to recalculate budget: ${budgetErr.message}`);
        }
      }

      return res.status(201).json({
        success: true,
        message: budgetAlert ? budgetAlert.message : 'Dépense ajoutée',
        data: {
          expense,
          energyBalance: updatedUser.energyBalance,
          budgetAlert: budgetAlert || null,
        },
      });
    } catch (err) {
      // Rollback energy on expense creation failure
      await User.updateOne(
        { _id: userId },
        { $inc: { energyBalance: ENERGY_COST_ADD_EXPENSE } }
      );
      throw err;
    }
  } catch (error) {
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

    const expenses = await Expense.find({ managerId: userId })
      .sort({ date: -1 })
      .limit(50)
      .lean();

    return res.status(200).json({
      success: true,
      data: { expenses, total: expenses.length },
    });
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

    // Fetch budgets from Budget collection (new system)
    const budgets = await Budget.find({ managerId: userId, isActive: true });

    // Fetch expenses to calculate spent amounts
    const expenses = await Expense.find({ managerId: userId }).lean();

    // Calculate spent for each budget from real expenses
    const budgetsWithSpent = budgets.map(budget => {
      const spent = expenses
        .filter(e => e.category === budget.category)
        .reduce((sum, e) => sum + (e.amount || 0), 0);

      return {
        id: budget._id,
        category: budget.category,
        limit: budget.limit,
        spent: spent,
        currency: budget.currency,
        createdAt: budget.createdAt,
        updatedAt: budget.updatedAt,
      };
    });

    return res.status(200).json({
      success: true,
      data: { budget: budgetsWithSpent }
    });
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

    if (!project || typeof project !== 'string' || !project.trim()) {
      return res.status(400).json({ success: false, message: 'project requis et valide' });
    }

    if (amount === undefined || amount === null) {
      return res.status(400).json({ success: false, message: 'amount requis' });
    }

    const normalizedAmount = Number(amount);
    if (!Number.isFinite(normalizedAmount) || normalizedAmount < 0) {
      return res.status(400).json({ success: false, message: 'amount invalide (doit être >= 0)' });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // Initialize budget array if not exists
    if (!Array.isArray(user.budget)) {
      user.budget = [];
    }

    // Find or create budget entry
    const existingIndex = user.budget.findIndex((b) => b.project === project);
    if (existingIndex >= 0) {
      user.budget[existingIndex].amount = normalizedAmount;
    } else {
      user.budget.push({
        project: project.trim(),
        amount: normalizedAmount,
        spent: 0,
      });
    }

    await user.save();

    return res.status(200).json({
      success: true,
      message: 'Budget updated',
      data: { budget: user.budget },
    });
  } catch (error) {
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

    // Validate category
    if (!category || typeof category !== 'string' || !category.trim()) {
      return res.status(400).json({
        success: false,
        message: 'category is required and must be a non-empty string',
      });
    }

    const validCategories = ['SaaS', 'Marketing', 'Travel', 'Office', 'Salaries', 'Other'];
    const normalizedCategory = category.trim();
    
    if (!validCategories.includes(normalizedCategory)) {
      return res.status(400).json({
        success: false,
        message: `category must be one of: ${validCategories.join(', ')}`,
      });
    }

    // Validate limit
    if (limit === undefined || limit === null) {
      return res.status(400).json({ success: false, message: 'limit is required' });
    }

    const normalizedLimit = Number(limit);
    if (!Number.isFinite(normalizedLimit) || normalizedLimit <= 0) {
      return res.status(400).json({
        success: false,
        message: 'limit must be a positive number',
      });
    }

    // Validate currency
    const normalizedCurrency = (currency || 'TND').trim().toUpperCase();
    const validCurrencies = ['TND', 'USD', 'EUR'];
    
    if (!validCurrencies.includes(normalizedCurrency)) {
      return res.status(400).json({
        success: false,
        message: `currency must be one of: ${validCurrencies.join(', ')}`,
      });
    }

    // Check if budget already exists for this category and manager
    const existingBudget = await Budget.findOne({
      managerId: userId,
      category: normalizedCategory,
      isActive: true,
    });

    if (existingBudget) {
      return res.status(409).json({
        success: false,
        message: `Budget for ${normalizedCategory} already exists. Use PUT to update it.`,
      });
    }

    // Create new budget
    const newBudget = await Budget.create({
      managerId: userId,
      category: normalizedCategory,
      limit: normalizedLimit,
      currency: normalizedCurrency,
      spent: 0,
      isActive: true,
    });

    console.log(`[Kash] Budget created: ${normalizedCategory} - ${normalizedLimit} ${normalizedCurrency}`);

    return res.status(201).json({
      success: true,
      message: 'Budget created successfully',
      data: {
        budget: {
          id: newBudget._id,
          category: newBudget.category,
          limit: newBudget.limit,
          spent: newBudget.spent,
          currency: newBudget.currency,
          createdAt: newBudget.createdAt,
        },
      },
    });
  } catch (error) {
    if (error.code === 11000) {
      // Duplicate key error
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

    const reminders = await Reminder.find({ user: userId })
      .sort({ dueDate: 1 })
      .lean();

    return res.status(200).json({
      success: true,
      data: { reminders },
    });
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

    if (!title || typeof title !== 'string' || !title.trim()) {
      return res.status(400).json({ success: false, message: 'title requis' });
    }

    if (amount === undefined || amount === null) {
      return res.status(400).json({ success: false, message: 'amount requis' });
    }

    const normalizedAmount = Number(amount);
    if (!Number.isFinite(normalizedAmount) || normalizedAmount <= 0) {
      return res.status(400).json({ success: false, message: 'amount invalide (doit être > 0)' });
    }

    if (!dueDate) {
      return res.status(400).json({ success: false, message: 'dueDate requis' });
    }

    const reminder = await Reminder.create({
      user: userId,
      title: title.trim(),
      amount: normalizedAmount,
      currency: currency || 'TND',
      dueDate: new Date(dueDate),
      notes: notes || '',
      category: category || 'Other',
      vendor: vendor || '',
      status: 'pending',
    });

    return res.status(201).json({
      success: true,
      message: 'Reminder created',
      data: { reminder },
    });
  } catch (error) {
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

    if (!id) {
      return res.status(400).json({ success: false, message: 'Reminder ID requis' });
    }

    const reminder = await Reminder.findOneAndUpdate(
      { _id: id, user: userId },
      { status: 'paid', paidAt: new Date() },
      { new: true }
    );

    if (!reminder) {
      return res.status(404).json({ success: false, message: 'Reminder not found' });
    }

    // Auto-create Expense when manually marking reminder as paid
    try {
      await Expense.create({
        managerId: userId,
        amount: reminder.amount,
        currency: reminder.currency,
        vendor: reminder.vendor || reminder.title,
        category: reminder.category || 'Other',
        date: new Date(),
        description: `Auto-generated from reminder: ${reminder.title}`
      });
      console.log(`[Kash] Auto-created expense for reminder: ${reminder._id}`);
    } catch (expenseErr) {
      console.warn(`[Kash] Failed to auto-create expense for reminder ${reminder._id}: ${expenseErr.message}`);
      // Don't fail the API call if auto-expense creation fails
    }

    return res.status(200).json({
      success: true,
      message: 'Reminder marked as paid',
      data: { reminder },
    });
  } catch (error) {
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

    const updatedUser = await recalculateBudgetSpent(userId);

    return res.status(200).json({
      success: true,
      message: 'Budget spent recalculated successfully',
      data: {
        budget: updatedUser?.budget || [],
      },
    });
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

    // Check if file was uploaded
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'File (image or PDF) is required'
      });
    }

    // Read file and convert to base64
    const fileBuffer = req.file.buffer;
    const base64String = fileBuffer.toString('base64');
    const mimeType = req.file.mimetype || 'image/png';

    // Prepare inline data for Gemini
    const inlineData = {
      base64: normalizeBase64String(base64String),
      mimeType: mimeType
    };

    // Analyze receipt with Mistral AI Pixtral
    let extracted;
    try {
      extracted = await analyzeReceiptWithMistral(base64String, mimeType);
      const validation = validateGeminiExtraction(extracted);

      if (!validation.ok) {
        return res.status(400).json({
          success: false,
          message: validation.message || 'Invalid document analysis'
        });
      }

      if (validation.invalidDocument) {
        return res.status(400).json({
          success: false,
          message: validation.error || 'Invalid document'
        });
      }
    } catch (err) {
      return res.status(502).json({
        success: false,
        message: 'Failed to analyze document: ' + err.message
      });
    }

    // Find the employee record
    const employee = await Employee.findById(employeeId).lean();
    if (!employee) {
      return res.status(404).json({
        success: false,
        message: 'Employee record not found'
      });
    }

    // Find the employee's manager (CEO) by email
    if (!employee.manager_email) {
      return res.status(400).json({
        success: false,
        message: 'Manager email not configured for this employee'
      });
    }

    const managerUser = await User.findOne({ email: employee.manager_email }).lean();
    if (!managerUser) {
      return res.status(404).json({
        success: false,
        message: `Manager (CEO) with email ${employee.manager_email} not found`
      });
    }

    const managerId = managerUser._id;

    // Create expense record
    try {
      const expense = await Expense.create({
        managerId: managerId,
        employeeId: employeeId,
        amount: extracted.amount,
        currency: extracted.currency || 'USD',
        vendor: extracted.vendor || 'Unknown',
        category: extracted.category || 'Other',
        description: extracted.description || '',
        receiptUrl: null, // Could store file URL if using cloud storage
        status: 'pending',
        date: extracted.date ? new Date(extracted.date) : new Date(),
      });

      // Recalculate budget spent for the manager
      try {
        const updatedManager = await recalculateBudgetSpent(managerId);
        
        // Check if budget alert should be sent
        if (updatedManager && updatedManager.budget) {
          const category = extracted.category || 'Other';
          const matchedBudget = updatedManager.budget.find(b => b.project === category);
          
          if (matchedBudget && matchedBudget.amount > 0) {
            const percentage = (matchedBudget.spent / matchedBudget.amount) * 100;
            let alertLevel = null;
            
            if (percentage >= 100) {
              alertLevel = 'CRITICAL';
            } else if (percentage >= 80) {
              alertLevel = 'WARNING';
            }

            if (alertLevel) {
              await sendBudgetAlertEmail(updatedManager, matchedBudget, alertLevel, category);
            }
          }
        }
      } catch (budgetErr) {
        console.warn(`[Kash] Failed to recalculate budget for manager: ${budgetErr.message}`);
        // Don't fail expense creation if budget update fails
      }

      return res.status(201).json({
        success: true,
        message: 'Expense submitted successfully',
        data: {
          expense: {
            id: expense._id,
            amount: expense.amount,
            currency: expense.currency,
            vendor: expense.vendor,
            category: expense.category,
            description: expense.description,
            date: expense.date,
            status: expense.status,
          }
        }
      });
    } catch (err) {
      return res.status(500).json({
        success: false,
        message: 'Failed to save expense: ' + err.message
      });
    }
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

    // Check if file was uploaded
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'File (image or PDF) is required'
      });
    }

    // Read file and convert to base64
    const fileBuffer = req.file.buffer;
    const base64String = fileBuffer.toString('base64');
    const mimeType = req.file.mimetype || 'image/png';

    // Prepare inline data for Gemini
    const inlineData = {
      base64: normalizeBase64String(base64String),
      mimeType: mimeType
    };

    // Analyze receipt with Mistral AI Pixtral
    let extracted;
    try {
      extracted = await analyzeReceiptWithMistral(base64String, mimeType);
      const validation = validateGeminiExtraction(extracted);

      if (!validation.ok) {
        return res.status(400).json({
          success: false,
          message: validation.message || 'Invalid document analysis'
        });
      }

      if (validation.invalidDocument) {
        return res.status(400).json({
          success: false,
          message: validation.error || 'Invalid document'
        });
      }
    } catch (err) {
      return res.status(502).json({
        success: false,
        message: 'Failed to analyze document: ' + err.message
      });
    }

    // Find the employee record
    const employee = await Employee.findById(employeeId).lean();
    if (!employee) {
      return res.status(404).json({
        success: false,
        message: 'Employee record not found'
      });
    }

    // Find the employee's manager (CEO) by email
    if (!employee.manager_email) {
      return res.status(400).json({
        success: false,
        message: 'Manager email not configured for this employee'
      });
    }

    const managerUser = await User.findOne({ email: employee.manager_email }).lean();
    if (!managerUser) {
      return res.status(404).json({
        success: false,
        message: `Manager (CEO) with email ${employee.manager_email} not found`
      });
    }

    const managerId = managerUser._id;

    // Create expense record
    try {
      const expense = await Expense.create({
        managerId: managerId,
        employeeId: employeeId,
        amount: extracted.amount,
        currency: extracted.currency || 'USD',
        vendor: extracted.vendor || 'Unknown',
        category: extracted.category || 'Other',
        description: extracted.description || '',
        receiptUrl: null, // Could store file URL if using cloud storage
        status: 'pending',
        date: extracted.date ? new Date(extracted.date) : new Date(),
      });

      // Recalculate budget spent for the manager
      try {
        const updatedManager = await recalculateBudgetSpent(managerId);
        
        // Check if budget alert should be sent
        if (updatedManager && updatedManager.budget) {
          const category = extracted.category || 'Other';
          const matchedBudget = updatedManager.budget.find(b => b.project === category);
          
          if (matchedBudget && matchedBudget.amount > 0) {
            const percentage = (matchedBudget.spent / matchedBudget.amount) * 100;
            let alertLevel = null;
            
            if (percentage >= 100) {
              alertLevel = 'CRITICAL';
            } else if (percentage >= 80) {
              alertLevel = 'WARNING';
            }

            if (alertLevel) {
              await sendBudgetAlertEmail(updatedManager, matchedBudget, alertLevel, category);
            }
          }
        }
      } catch (budgetErr) {
        console.warn(`[Kash] Failed to recalculate budget for manager: ${budgetErr.message}`);
        // Don't fail expense creation if budget update fails
      }

      return res.status(201).json({
        success: true,
        message: 'Expense submitted successfully',
        data: {
          expense: {
            id: expense._id,
            amount: expense.amount,
            currency: expense.currency,
            vendor: expense.vendor,
            category: expense.category,
            description: expense.description,
            date: expense.date,
            status: expense.status,
          }
        }
      });
    } catch (err) {
      return res.status(500).json({
        success: false,
        message: 'Failed to save expense: ' + err.message
      });
    }
  } catch (error) {
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

    if (!salary || isNaN(salary) || salary <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Valid salary parameter required',
      });
    }

    const salaryAmount = parseFloat(salary);

    try {
      // Find the Salaries budget for this user
      const salariesBudget = await Budget.findOne({
        managerId: userId,
        category: 'Salaries',
        isActive: true,
      }).lean();

      if (!salariesBudget) {
        return res.status(404).json({
          success: false,
          message: 'Salaries budget not found. Please set up a Salaries budget first.',
        });
      }

      const remainingBudget = salariesBudget.limit - salariesBudget.spent;
      const canAfford = remainingBudget >= salaryAmount;

      const response = {
        success: true,
        canAfford,
        salary: salaryAmount,
        budgetDetails: {
          category: salariesBudget.category,
          totalBudget: salariesBudget.limit,
          spent: salariesBudget.spent,
          remaining: remainingBudget,
          currency: salariesBudget.currency,
        },
        message: canAfford
          ? `✅ Organization can afford to hire (Remaining budget: ${remainingBudget.toFixed(2)} ${salariesBudget.currency})`
          : `❌ Organization cannot afford this salary (Shortfall: ${(salaryAmount - remainingBudget).toFixed(2)} ${salariesBudget.currency})`,
        hiring: {
          feasible: canAfford,
          projectedNewSpent: salariesBudget.spent + salaryAmount,
          percentageAfterHiring: (((salariesBudget.spent + salaryAmount) / salariesBudget.limit) * 100).toFixed(2),
        },
      };

      if (!canAfford) {
        response.suggestion = `Consider reducing salary to ${remainingBudget.toFixed(2)} ${salariesBudget.currency} or increasing the Salaries budget.`;
      }

      return res.status(200).json(response);
    } catch (err) {
      return res.status(500).json({
        success: false,
        message: `Failed to check hiring feasibility: ${err.message}`,
      });
    }
  } catch (error) {
    next(error);
  }
};
exports.staffingCostAnalysis = async (req, res) => {
  try {
const {
  userId,
  department,
  currentCount,
  targetCount,
  missing,
  alreadyApprovedCost = 0,
} = req.body;
    if (!userId || !department || missing == null) {
      return res.status(400).json({
        success: false,
        message: 'userId, department et missing requis',
      });
    }

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
    ? salaries.reduce((sum, salary) => sum + salary, 0) / salaries.length
    : 2500;

const estimatedMonthlyCost = avgSalary * Number(missing);

    const salariesBudget = await Budget.findOne({
      managerId: userId,
      category: 'Salaries',
      isActive: true,
    }).lean();

    if (!salariesBudget) {
      return res.json({
        success: true,
        analysis: {
          department,
          currentCount,
          targetCount,
          missing,
          avgSalary,
          estimatedMonthlyCost,
          canAfford: false,
          recommendation:
            'Aucun budget Salaries trouvé. Kash recommande de créer un budget salaires avant de recruter.',
        },
      });
    }

const remaining =
  salariesBudget.limit -
  salariesBudget.spent -
  Number(alreadyApprovedCost || 0);
      const canAfford = remaining >= estimatedMonthlyCost;

    return res.json({
      success: true,
      analysis: {
        department,
        currentCount,
        targetCount,
        missing,
        avgSalary,
        estimatedMonthlyCost,
        budgetLimit: salariesBudget.limit,
        budgetSpent: salariesBudget.spent,
        budgetRemaining: remaining,
        alreadyApprovedCost: Number(alreadyApprovedCost || 0),
        canAfford,
        recommendation: canAfford
          ? `Budget OK pour recruter ${missing} profil(s) en ${department}.`
          : `Budget insuffisant pour ${department}. Manque estimé : ${(estimatedMonthlyCost - remaining).toFixed(2)} ${salariesBudget.currency}.`,
      },
    });
  } catch (err) {
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