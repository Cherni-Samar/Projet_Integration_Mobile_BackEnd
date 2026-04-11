const Expense = require('../models/Expense');
const User = require('../models/User');
const Reminder = require('../models/Reminder');
const axios = require('axios');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const ENERGY_COST_ADD_EXPENSE = 5;
const ENERGY_COST_ANALYZE_RECEIPT = 10;

const GEMINI_MODEL_NAME = 'gemini-1.5-flash-latest';

let geminiModel;

function getGeminiModel() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    const err = new Error('GEMINI_API_KEY manquant côté serveur');
    err.statusCode = 500;
    throw err;
  }

  if (!geminiModel) {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
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

  const prompt =
    'Tu es Kash, un expert financier. Analyse cette image de facture/reçu. Extrais : amount (number), currency (ex: EUR), vendor (nom du magasin), category (SaaS, Marketing, Travel, Office, Salaries), date (format ISO). Si l\'image n\'est pas un document financier, renvoie {"error": "Invalid document"}.';

  console.log('🚀 Tentative avec gemini-1.5-flash-latest...');
  const result = await model.generateContent({
    generationConfig: {
      responseMimeType: 'application/json',
      temperature: 0,
    },
    contents: [
      {
        role: 'user',
        parts: [
          { text: prompt },
          { inlineData: { data: inlineData.base64, mimeType: inlineData.mimeType } },
        ],
      },
    ],
  });

  const text = result?.response?.text?.();
  if (!text || typeof text !== 'string') {
    const err = new Error('Réponse Gemini vide ou illisible');
    err.statusCode = 502;
    throw err;
  }

  const parsed = safeJsonParse(text);
  if (!parsed.ok) {
    const err = new Error('Réponse Gemini non-JSON (parsing impossible)');
    err.statusCode = 502;
    err.details = { raw: text };
    throw err;
  }

  return parsed.value;
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
 * GET /api/kash/budget
 */
exports.getBudget = async (req, res, next) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const user = await User.findById(userId).select('budget').lean();

    return res.status(200).json({
      success: true,
      data: { budget: user?.budget || [] },
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
      user.budget.push({ project, amount: normalizedAmount, spent: 0 });
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

    const { title, amount, currency = 'TND', dueDate, notes = '' } = req.body ?? {};

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

    return res.status(200).json({
      success: true,
      message: 'Reminder marked as paid',
      data: { reminder },
    });
  } catch (error) {
    next(error);
  }
};