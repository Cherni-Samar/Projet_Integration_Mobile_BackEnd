const Expense = require('../models/Expense');
const User = require('../models/User');
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
    // Standard SDK initialization (let the SDK pick the API version)
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
  // Remove whitespace/newlines often present in base64 payloads
  return value.trim().replace(/\s+/g, '');
}

function inferMimeTypeFromBase64(base64) {
  const head = base64.slice(0, 24);
  // JPEG: /9j/...
  if (head.startsWith('/9j/')) return 'image/jpeg';
  // PNG: iVBORw0KGgo...
  if (head.startsWith('iVBORw0KGgo')) return 'image/png';
  // GIF: R0lGOD...
  if (head.startsWith('R0lGOD')) return 'image/gif';
  // WEBP: UklGR...
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

exports.addExpense = async (req, res, next) => {
  try {
    const managerId = req.user?.id;

    if (!managerId) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized',
      });
    }

    const {
      employeeId = null,
      amount,
      currency,
      vendor,
      category,
      description,
      receiptUrl,
      status,
      isSubscription,
      date,
    } = req.body ?? {};

    if (amount === undefined || amount === null || amount === '') {
      return res.status(400).json({
        success: false,
        message: 'amount requis',
      });
    }

    const normalizedAmount = Number(amount);
    if (!Number.isFinite(normalizedAmount)) {
      return res.status(400).json({
        success: false,
        message: 'amount invalide',
      });
    }

    // 1) Déduire l'énergie de manière atomique (refuse si insuffisant)
    const updatedManager = await User.findOneAndUpdate(
      { _id: managerId, energyBalance: { $gte: ENERGY_COST_ADD_EXPENSE } },
      { $inc: { energyBalance: -ENERGY_COST_ADD_EXPENSE } },
      { new: true }
    ).lean();

    if (!updatedManager) {
      return res.status(403).json({
        success: false,
        message: "Énergie insuffisante pour ajouter une dépense",
      });
    }

    // 2) Créer la dépense
    try {
      const expense = await Expense.create({
        managerId,
        employeeId,
        amount: normalizedAmount,
        ...(currency !== undefined ? { currency } : {}),
        ...(vendor !== undefined ? { vendor } : {}),
        ...(category !== undefined ? { category } : {}),
        ...(description !== undefined ? { description } : {}),
        ...(receiptUrl !== undefined ? { receiptUrl } : {}),
        ...(status !== undefined ? { status } : {}),
        ...(isSubscription !== undefined ? { isSubscription } : {}),
        ...(date !== undefined ? { date } : {}),
      });

      return res.status(201).json({
        success: true,
        message: 'Dépense ajoutée',
        data: {
          expense,
          energyBalance: updatedManager.energyBalance,
        },
      });
    } catch (err) {
      // Rollback best-effort: recréditer l'énergie si la création de dépense échoue
      await User.updateOne(
        { _id: managerId },
        { $inc: { energyBalance: ENERGY_COST_ADD_EXPENSE } }
      );
      throw err;
    }
  } catch (error) {
    next(error);
  }
};

// POST /api/kash/analyze
exports.analyzeReceipt = async (req, res, next) => {
  const managerId = req.user?.id;

  try {
    if (!managerId) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized',
      });
    }

    const { imageUrl, imageBase64 } = req.body ?? {};
    const inlineData = await coerceToGeminiInlineData({ imageUrl, imageBase64 });

    if (!inlineData) {
      return res.status(400).json({
        success: false,
        message: 'imageUrl ou imageBase64 requis',
      });
    }

    // Débit énergie (atomique) avant analyse, rollback si erreur
    const updatedManager = await User.findOneAndUpdate(
      { _id: managerId, energyBalance: { $gte: ENERGY_COST_ANALYZE_RECEIPT } },
      { $inc: { energyBalance: -ENERGY_COST_ANALYZE_RECEIPT } },
      { new: true }
    ).lean();

    if (!updatedManager) {
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
        message: "Analyse terminée. Validez avant enregistrement.",
        data: {
          extracted: {
            amount: extracted.amount,
            currency: extracted.currency,
            vendor: extracted.vendor,
            category: extracted.category,
            date: extracted.date,
            description: typeof extracted.description === 'string' ? extracted.description : '',
          },
          energyBalance: updatedManager.energyBalance,
        },
      });
    } catch (err) {
      await User.updateOne(
        { _id: managerId },
        { $inc: { energyBalance: ENERGY_COST_ANALYZE_RECEIPT } }
      );
      throw err;
    }
  } catch (error) {
    next(error);
  }
};