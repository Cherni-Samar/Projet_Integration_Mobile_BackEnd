const Expense = require('../models/Expense');
const User = require('../models/User');
const Employee = require('../models/Employee');
const Reminder = require('../models/Reminder');
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
    const user = await User.findById(userId);
    
    if (!user || !user.budget) {
      return user;
    }

    // Zero out all spent values first
    for (const budget of user.budget) {
      budget.spent = 0;
    }

    // Sum expenses by category and update matching budgets
    for (const budget of user.budget) {
      const totalSpent = expenses
        .filter(e => e.category === budget.project)
        .reduce((sum, e) => sum + (e.amount || 0), 0);
      
      budget.spent = totalSpent;
    }

    await user.save();
    console.log(`[Kash] Budget spent recalculated for user: ${userId}`);
    return user;
  } catch (err) {
    console.error(`[Kash] Error recalculating budget spent: ${err.message}`);
    throw err;
  }
}

/**
 * Generate and send budget alert email via Groq + nodemailer
 */
async function sendBudgetAlertEmail(user, matchedBudget, alertLevel, category) {
  try {
    const percentage = (matchedBudget.spent / matchedBudget.amount) * 100;
    
    let emailSubject = '';
    let emailContent = '';

    if (alertLevel === 'CRITICAL') {
      emailSubject = `🚨 CRITICAL: Budget "${matchedBudget.project}" Exceeded (${percentage.toFixed(0)}%)`;
      emailContent = `
Budget Alert - CRITICAL

Your budget for "${matchedBudget.project}" has EXCEEDED 100%:
- Budget Amount: ${matchedBudget.amount} DT
- Current Spent: ${matchedBudget.spent.toFixed(2)} DT
- Percentage: ${percentage.toFixed(2)}%

This project is now over budget. Please review your expenses and adjust your budget or spending accordingly.

Recent expense added: ${category}

---
Kash Financial Agent
e-team PIM System
      `;
    } else if (alertLevel === 'WARNING') {
      emailSubject = `⚠️ WARNING: Budget "${matchedBudget.project}" at ${percentage.toFixed(0)}%`;
      emailContent = `
Budget Alert - WARNING

Your budget for "${matchedBudget.project}" has reached 80%:
- Budget Amount: ${matchedBudget.amount} DT
- Current Spent: ${matchedBudget.spent.toFixed(2)} DT
- Percentage: ${percentage.toFixed(2)}%

Consider reviewing your spending to stay within budget.

Recent expense added: ${category}

---
Kash Financial Agent
e-team PIM System
      `;
    }

    const result = await emailSender.sendEmail({
      to: user.email,
      subject: emailSubject,
      content: emailContent,
      from: 'kash@e-team.com',
    });

    console.log(`[Kash Alert] ${alertLevel} email sent to: ${user.email}`);
    return result;
  } catch (err) {
    console.warn(`[Kash] Failed to send budget alert email: ${err.message}`);
    // Don't fail the expense creation if email sending fails
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
      const expense = await Expense.create({
        managerId: userId,
        employeeId: employeeId || null,
        amount: normalizedAmount,
        ...(currency !== undefined ? { currency } : {}),
        ...(vendor !== undefined ? { vendor } : {}),
        ...(category !== undefined ? { category } : {}),
        ...(date !== undefined ? { date } : {}),
        ...(description !== undefined ? { description } : {}),
      });

      // Recalculate budget spent dynamically instead of incrementing
      if (category) {
        try {
          const updatedUserForBudget = await recalculateBudgetSpent(userId);
          
          // Check if budget alert should be sent
          if (updatedUserForBudget && updatedUserForBudget.budget) {
            const matchedBudget = updatedUserForBudget.budget.find(b => b.project === category);
            
            if (matchedBudget && matchedBudget.amount > 0) {
              const percentage = (matchedBudget.spent / matchedBudget.amount) * 100;
              let alertLevel = null;
              
              if (percentage >= 100) {
                alertLevel = 'CRITICAL';
              } else if (percentage >= 80) {
                alertLevel = 'WARNING';
              }

              if (alertLevel) {
                await sendBudgetAlertEmail(updatedUserForBudget, matchedBudget, alertLevel, category);
              }
            }
          }
        } catch (budgetErr) {
          console.warn(`[Kash] Failed to recalculate budget: ${budgetErr.message}`);
          // Don't fail the expense creation if budget update fails
        }
      }

      return res.status(201).json({
        success: true,
        message: 'Dépense ajoutée',
        data: {
          expense,
          energyBalance: updatedUser.energyBalance,
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

    const [expenses, user] = await Promise.all([
      Expense.find({ managerId: userId }).lean(),
      User.findById(userId)
    ]);

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // Recalculate spent for each budget from real expenses
    if (user.budget && Array.isArray(user.budget)) {
      for (const budget of user.budget) {
        budget.spent = expenses
          .filter(e => e.category === budget.project)
          .reduce((sum, e) => sum + (e.amount || 0), 0);
      }
      await user.save();
    }

    return res.status(200).json({
      success: true,
      data: { budget: user.budget || [] }
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