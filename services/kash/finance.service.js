const Expense = require('../../models/Expense');
const User = require('../../models/User');
const Employee = require('../../models/Employee');
const Reminder = require('../../models/Reminder');
const Budget = require('../../models/Budget');
const axios = require('axios');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const Groq = require('groq-sdk');
const emailSender = require('../emailSender');

/**
 * Finance Service - Centralized business logic for Kash financial operations
 * Extracted from kashController.js for better separation of concerns
 */

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
    const genAI = new GoogleGenerativeAI(apiKey);
    geminiModel = genAI.getGenerativeModel({ model: GEMINI_MODEL_NAME });
  }
  return geminiModel;
}

// HELPER FUNCTIONS
// ============================================================================

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

    let cleanedText = responseText
      .replace(/```json\s*/gi, '')
      .replace(/```\s*/gi, '')
      .trim();

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

/**
 * Recalculate budget spent by summing all expenses matching each budget project
 */
async function recalculateBudgetSpent(userId) {
  try {
    const expenses = await Expense.find({ managerId: userId }).lean();
    const budgets = await Budget.find({ managerId: userId, isActive: true });
    
    if (!budgets || budgets.length === 0) {
      return budgets;
    }

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
 * Generate and send budget alert email
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

// SERVICE FUNCTIONS
// ============================================================================
/**
 * Analyze receipt via AI
 */
async function analyzeReceipt(userId, { imageUrl, imageBase64 }) {
  const inlineData = await coerceToGeminiInlineData({ imageUrl, imageBase64 });

  if (!inlineData) {
    const err = new Error('imageUrl ou imageBase64 requis');
    err.statusCode = 400;
    throw err;
  }

  // Atomic energy debit
  const updatedUser = await User.findOneAndUpdate(
    { _id: userId, energyBalance: { $gte: ENERGY_COST_ANALYZE_RECEIPT } },
    { $inc: { energyBalance: -ENERGY_COST_ANALYZE_RECEIPT } },
    { new: true }
  ).lean();

  if (!updatedUser) {
    const err = new Error("Énergie insuffisante pour l'analyse IA");
    err.statusCode = 403;
    err.requiredEnergy = ENERGY_COST_ANALYZE_RECEIPT;
    throw err;
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
      const err = new Error(validation.error || 'Invalid document');
      err.statusCode = 400;
      throw err;
    }

    return {
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
    };
  } catch (err) {
    // Rollback energy on Gemini failure
    await User.updateOne(
      { _id: userId },
      { $inc: { energyBalance: ENERGY_COST_ANALYZE_RECEIPT } }
    );
    throw err;
  }
}

/**
 * Add expense (save from analyzed receipt or manual entry)
 */
async function addExpense(userId, { amount, currency, vendor, category, date, description, employeeId }) {
  if (amount === undefined || amount === null || amount === '') {
    const err = new Error('amount requis');
    err.statusCode = 400;
    throw err;
  }

  const normalizedAmount = Number(amount);
  if (!Number.isFinite(normalizedAmount)) {
    const err = new Error('amount invalide');
    err.statusCode = 400;
    throw err;
  }

  // Atomic energy debit
  const updatedUser = await User.findOneAndUpdate(
    { _id: userId, energyBalance: { $gte: ENERGY_COST_ADD_EXPENSE } },
    { $inc: { energyBalance: -ENERGY_COST_ADD_EXPENSE } },
    { new: true }
  ).lean();

  if (!updatedUser) {
    const err = new Error('Énergie insuffisante pour ajouter une dépense');
    err.statusCode = 403;
    throw err;
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
      status: expenseStatus,
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

    return {
      success: true,
      message: budgetAlert ? budgetAlert.message : 'Dépense ajoutée',
      data: {
        expense,
        energyBalance: updatedUser.energyBalance,
        budgetAlert: budgetAlert || null,
      },
    };
  } catch (err) {
    // Rollback energy on expense creation failure
    await User.updateOne(
      { _id: userId },
      { $inc: { energyBalance: ENERGY_COST_ADD_EXPENSE } }
    );
    throw err;
  }
}

/**
 * Get all expenses for user
 */
async function getExpenses(userId) {
  const expenses = await Expense.find({ managerId: userId })
    .sort({ date: -1 })
    .limit(50)
    .lean();

  return {
    success: true,
    data: { expenses, total: expenses.length },
  };
}

/**
 * Get budget array for user
 */
async function getBudget(userId) {
  const budgets = await Budget.find({ managerId: userId, isActive: true });
  const expenses = await Expense.find({ managerId: userId }).lean();

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

  return {
    success: true,
    data: { budget: budgetsWithSpent }
  };
}

/**
 * Add or update a budget entry (legacy)
 */
async function setBudget(userId, { project, amount }) {
  if (!project || typeof project !== 'string' || !project.trim()) {
    const err = new Error('project requis et valide');
    err.statusCode = 400;
    throw err;
  }

  if (amount === undefined || amount === null) {
    const err = new Error('amount requis');
    err.statusCode = 400;
    throw err;
  }

  const normalizedAmount = Number(amount);
  if (!Number.isFinite(normalizedAmount) || normalizedAmount < 0) {
    const err = new Error('amount invalide (doit être >= 0)');
    err.statusCode = 400;
    throw err;
  }

  const user = await User.findById(userId);
  if (!user) {
    const err = new Error('User not found');
    err.statusCode = 404;
    throw err;
  }

  if (!Array.isArray(user.budget)) {
    user.budget = [];
  }

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

  return {
    success: true,
    message: 'Budget updated',
    data: { budget: user.budget },
  };
}

/**
 * Create a new budget entry using the Budget model
 */
async function createBudget(userId, { category, limit, currency }) {
  if (!category || typeof category !== 'string' || !category.trim()) {
    const err = new Error('category is required and must be a non-empty string');
    err.statusCode = 400;
    throw err;
  }

  const validCategories = ['SaaS', 'Marketing', 'Travel', 'Office', 'Salaries', 'Other'];
  const normalizedCategory = category.trim();
  
  if (!validCategories.includes(normalizedCategory)) {
    const err = new Error(`category must be one of: ${validCategories.join(', ')}`);
    err.statusCode = 400;
    throw err;
  }

  if (limit === undefined || limit === null) {
    const err = new Error('limit is required');
    err.statusCode = 400;
    throw err;
  }

  const normalizedLimit = Number(limit);
  if (!Number.isFinite(normalizedLimit) || normalizedLimit <= 0) {
    const err = new Error('limit must be a positive number');
    err.statusCode = 400;
    throw err;
  }

  const normalizedCurrency = (currency || 'TND').trim().toUpperCase();
  const validCurrencies = ['TND', 'USD', 'EUR'];
  
  if (!validCurrencies.includes(normalizedCurrency)) {
    const err = new Error(`currency must be one of: ${validCurrencies.join(', ')}`);
    err.statusCode = 400;
    throw err;
  }

  const existingBudget = await Budget.findOne({
    managerId: userId,
    category: normalizedCategory,
    isActive: true,
  });

  if (existingBudget) {
    const err = new Error(`Budget for ${normalizedCategory} already exists. Use PUT to update it.`);
    err.statusCode = 409;
    throw err;
  }

  const newBudget = await Budget.create({
    managerId: userId,
    category: normalizedCategory,
    limit: normalizedLimit,
    currency: normalizedCurrency,
    spent: 0,
    isActive: true,
  });

  console.log(`[Kash] Budget created: ${normalizedCategory} - ${normalizedLimit} ${normalizedCurrency}`);

  return {
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
  };
}
/**
 * Get all reminders for user
 */
async function getReminders(userId) {
  const reminders = await Reminder.find({ user: userId })
    .sort({ dueDate: 1 })
    .lean();

  return {
    success: true,
    data: { reminders },
  };
}

/**
 * Create a new reminder
 */
async function createReminder(userId, { title, amount, currency = 'TND', dueDate, notes = '', category = 'Other', vendor = '' }) {
  if (!title || typeof title !== 'string' || !title.trim()) {
    const err = new Error('title requis');
    err.statusCode = 400;
    throw err;
  }

  if (amount === undefined || amount === null) {
    const err = new Error('amount requis');
    err.statusCode = 400;
    throw err;
  }

  const normalizedAmount = Number(amount);
  if (!Number.isFinite(normalizedAmount) || normalizedAmount <= 0) {
    const err = new Error('amount invalide (doit être > 0)');
    err.statusCode = 400;
    throw err;
  }

  if (!dueDate) {
    const err = new Error('dueDate requis');
    err.statusCode = 400;
    throw err;
  }

  const reminder = await Reminder.create({
    user: userId,
    title: title.trim(),
    amount: normalizedAmount,
    currency: currency || 'TND',
    dueDate: new Date(dueDate),
    notes: notes || '',
    vendor: vendor || '',
    category: category || 'Other',
    status: 'pending',
  });

  return {
    success: true,
    message: 'Reminder created',
    data: { reminder },
  };
}

/**
 * Mark reminder as paid
 */
async function markReminderPaid(userId, reminderId) {
  if (!reminderId) {
    const err = new Error('Reminder ID requis');
    err.statusCode = 400;
    throw err;
  }

  const reminder = await Reminder.findOneAndUpdate(
    { _id: reminderId, user: userId },
    { status: 'paid', paidAt: new Date() },
    { new: true }
  );

  if (!reminder) {
    const err = new Error('Reminder not found');
    err.statusCode = 404;
    throw err;
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
  }

  return {
    success: true,
    message: 'Reminder marked as paid',
    data: { reminder },
  };
}

/**
 * Recalculate budget spent by re-summing all expenses
 */
async function recalculateBudgetForUser(userId) {
  const updatedBudgets = await recalculateBudgetSpent(userId);

  return {
    success: true,
    message: 'Budget spent recalculated successfully',
    data: {
      budget: updatedBudgets?.budget || [],
    },
  };
}

/**
 * Employee expense submission via file upload
 */
async function submitEmployeeExpense(employeeId, fileBuffer, mimeType) {
  // Read file and convert to base64
  const base64String = fileBuffer.toString('base64');

  // Prepare inline data for analysis
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
      const err = new Error(validation.message || 'Invalid document analysis');
      err.statusCode = 400;
      throw err;
    }

    if (validation.invalidDocument) {
      const err = new Error(validation.error || 'Invalid document');
      err.statusCode = 400;
      throw err;
    }
  } catch (err) {
    const error = new Error('Failed to analyze document: ' + err.message);
    error.statusCode = 502;
    throw error;
  }

  // Find the employee record
  const employee = await Employee.findById(employeeId).lean();
  if (!employee) {
    const err = new Error('Employee record not found');
    err.statusCode = 404;
    throw err;
  }

  // Find the employee's manager (CEO) by email
  if (!employee.manager_email) {
    const err = new Error('Manager email not configured for this employee');
    err.statusCode = 400;
    throw err;
  }

  const managerUser = await User.findOne({ email: employee.manager_email }).lean();
  if (!managerUser) {
    const err = new Error(`Manager (CEO) with email ${employee.manager_email} not found`);
    err.statusCode = 404;
    throw err;
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
      receiptUrl: null,
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
    }

    return {
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
    };
  } catch (err) {
    const error = new Error('Failed to save expense: ' + err.message);
    error.statusCode = 500;
    throw error;
  }
}
/**
 * Check if organization can afford to hire a new employee with given salary
 */
async function checkHiringFeasibility(userId, salary) {
  if (!salary || isNaN(salary) || salary <= 0) {
    const err = new Error('Valid salary parameter required');
    err.statusCode = 400;
    throw err;
  }

  const salaryAmount = parseFloat(salary);

  try {
    const salariesBudget = await Budget.findOne({
      managerId: userId,
      category: 'Salaries',
      isActive: true,
    }).lean();

    if (!salariesBudget) {
      const err = new Error('Salaries budget not found. Please set up a Salaries budget first.');
      err.statusCode = 404;
      throw err;
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

    return response;
  } catch (err) {
    if (err.statusCode) throw err;
    const error = new Error(`Failed to check hiring feasibility: ${err.message}`);
    error.statusCode = 500;
    throw error;
  }
}

/**
 * Staffing cost analysis
 */
async function staffingCostAnalysis({ userId, department, currentCount, targetCount, missing, alreadyApprovedCost = 0 }) {
  if (!userId || !department || missing == null) {
    const err = new Error('userId, department et missing requis');
    err.statusCode = 400;
    throw err;
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
    return {
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
    };
  }

  const remaining =
    salariesBudget.limit -
    salariesBudget.spent -
    Number(alreadyApprovedCost || 0);
  const canAfford = remaining >= estimatedMonthlyCost;

  return {
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
  };
}

/**
 * Staffing allocation analysis
 */
async function staffingAllocationAnalysis({ userId, needs = [] }) {
  if (!userId || !Array.isArray(needs) || needs.length === 0) {
    const err = new Error('userId et needs requis');
    err.statusCode = 400;
    throw err;
  }

  const salariesBudget = await Budget.findOne({
    managerId: userId,
    category: 'Salaries',
    isActive: true,
  }).lean();

  if (!salariesBudget) {
    return {
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
    };
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

  return {
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
          : 'Kash bloque tous les recrutements : budget Salaires insuffisant.',
    },
  };
}

// EXPORTS
// ============================================================================

module.exports = {
  analyzeReceipt,
  addExpense,
  getExpenses,
  getBudget,
  setBudget,
  createBudget,
  getReminders,
  createReminder,
  markReminderPaid,
  recalculateBudgetForUser,
  submitEmployeeExpense,
  checkHiringFeasibility,
  staffingCostAnalysis,
  staffingAllocationAnalysis,
};