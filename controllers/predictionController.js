// =============================================================
//  CONTROLLER - Daily CEO Challenge 🔮
//  1 défi/jour — choisir un agent — gagner = énergie
//  Features: Image challenge, variété, streaks, badges
// =============================================================

const User = require('../models/User');
const Agent = require('../models/Agent');
const Prediction = require('../models/Prediction');
const Employee = require('../models/Employee');
const Expense = require('../models/Expense');
const LeaveRequest = require('../models/LeaveRequest');
const SocialPost = require('../models/SocialPost');

const BASE_REWARD = 10;

// Badges par domaine
const BADGES = {
  hera: { name: 'Expert RH', emoji: '🏛️' },
  kash: { name: 'Maître Finance', emoji: '💰' },
  echo: { name: 'Génie Com', emoji: '📢' },
  dexo: { name: 'Archiviste', emoji: '📄' },
  timo: { name: 'Planificateur', emoji: '⏰' }
};

// =============================================================
//  GET /api/predictions/daily
// =============================================================
exports.getDailyChallenges = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ success: false, error: 'Non authentifié' });

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const existing = await Prediction.findOne({ userId, createdAt: { $gte: startOfDay } }).lean();

    if (existing) {
      return res.json({
        success: true,
        alreadyExists: true,
        alreadyAnswered: existing.status === 'answered',
        challenge: formatChallenge(existing)
      });
    }

    // Calculer le streak actuel
    const streak = await calculateStreak(userId);

    // Générer un nouveau défi
    const challenge = await generateDailyChallenge(userId, streak);

    res.json({
      success: true,
      alreadyExists: false,
      alreadyAnswered: false,
      streak,
      challenge: formatChallenge(challenge)
    });

  } catch (error) {
    console.error('❌ [PREDICTION] Error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
};

// =============================================================
//  POST /api/predictions/:id/answer
// =============================================================
exports.submitAnswer = async (req, res) => {
  try {
    const userId = req.user?.id;
    const { id } = req.params;
    const { answer, chosenAgent } = req.body;

    if (answer === undefined || answer === null) {
      return res.status(400).json({ success: false, error: 'Réponse requise (0, 1, 2 ou 3)' });
    }
    if (!chosenAgent || !['hera', 'echo', 'kash', 'dexo', 'timo'].includes(chosenAgent)) {
      return res.status(400).json({ success: false, error: 'Agent requis: hera, echo, kash, dexo ou timo' });
    }

    const prediction = await Prediction.findOne({ _id: id, userId });
    if (!prediction) return res.status(404).json({ success: false, error: 'Défi non trouvé' });
    if (prediction.status === 'answered') {
      return res.status(400).json({ success: false, error: 'Déjà répondu ! Revenez dans 24h.' });
    }

    const isCorrect = answer === prediction.correctAnswer;

    // Calculer la récompense avec bonus streak
    const streak = await calculateStreak(userId);
    let reward = 0;
    let streakMultiplier = 1;

    if (isCorrect) {
      if (streak >= 7) streakMultiplier = 3;
      else if (streak >= 3) streakMultiplier = 2;
      reward = BASE_REWARD * streakMultiplier;
    }

    // Badge du domaine
    const badge = isCorrect ? BADGES[prediction.domain] : null;

    prediction.userAnswer = answer;
    prediction.chosenAgent = chosenAgent;
    prediction.isCorrect = isCorrect;
    prediction.energyReward = reward;
    prediction.badge = badge;
    prediction.streakDay = isCorrect ? streak + 1 : 0;
    prediction.status = 'answered';
    prediction.answeredAt = new Date();
    await prediction.save();

    // Distribuer l'énergie
    if (isCorrect && reward > 0) {
      const agent = await Agent.findOne({ name: chosenAgent });
      if (agent) {
        agent.addEnergy(reward);
        await agent.save();
        console.log(`⚡ [PREDICTION] +${reward} énergie → ${agent.displayName} (streak ×${streakMultiplier})`);
      }
      await User.findByIdAndUpdate(userId, { $inc: { energyBalance: reward } });
    }

    res.json({
      success: true,
      result: {
        isCorrect,
        correctAnswer: prediction.correctAnswer,
        userAnswer: answer,
        chosenAgent,
        energyReward: reward,
        streakMultiplier,
        currentStreak: isCorrect ? streak + 1 : 0,
        badge,
        message: isCorrect
          ? `✅ Bravo ! +${reward} ⚡ pour ${chosenAgent.toUpperCase()} !${streakMultiplier > 1 ? ` (×${streakMultiplier} streak bonus !)` : ''}`
          : `❌ Raté ! La bonne réponse était l'option ${prediction.correctAnswer + 1}. Réessayez demain !`
      }
    });

  } catch (error) {
    console.error('❌ [PREDICTION] Submit error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
};

// =============================================================
//  GET /api/predictions/history
// =============================================================
exports.getHistory = async (req, res) => {
  try {
    const userId = req.user?.id;

    const predictions = await Prediction.find({ userId, status: 'answered' })
      .sort({ createdAt: -1 }).limit(30)
      .select('question domain chosenAgent isCorrect energyReward badge streakDay challengeType answeredAt')
      .lean();

    const total = predictions.length;
    const wins = predictions.filter(p => p.isCorrect).length;
    const totalEnergy = predictions.reduce((s, p) => s + (p.energyReward || 0), 0);
    const currentStreak = await calculateStreak(userId);
    const bestStreak = Math.max(...predictions.map(p => p.streakDay || 0), 0);

    // Badges collectionnés
    const badges = predictions.filter(p => p.badge).map(p => p.badge);
    const uniqueBadges = [...new Map(badges.map(b => [b.name, b])).values()];

    res.json({
      success: true,
      stats: {
        totalPlayed: total,
        wins,
        losses: total - wins,
        winRate: total > 0 ? Math.round((wins / total) * 100) : 0,
        totalEnergyEarned: totalEnergy,
        currentStreak,
        bestStreak,
        badges: uniqueBadges
      },
      history: predictions
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// =============================================================
//  GÉNÉRATEUR DE DÉFI QUOTIDIEN
// =============================================================
async function generateDailyChallenge(userId, streak) {
  // Alterner les domaines pour varier
  const domains = ['hera', 'kash', 'echo', 'dexo', 'timo'];
  const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0)) / 86400000);
  const domain = domains[dayOfYear % domains.length];

  let question, options, correctAnswer, challengeType = 'text';

  try {
    switch (domain) {
      case 'hera':
        ({ question, options, correctAnswer } = await generateHeraQuestion());
        break;
      case 'kash':
        ({ question, options, correctAnswer } = await generateKashQuestion());
        break;
      case 'echo':
        ({ question, options, correctAnswer, challengeType } = await generateEchoQuestion());
        break;
      case 'dexo':
        ({ question, options, correctAnswer } = await generateDexoQuestion());
        break;
      case 'timo':
        ({ question, options, correctAnswer } = await generateTimoQuestion());
        break;
    }
  } catch (err) {
    console.error(`❌ [PREDICTION] ${domain} question failed:`, err.message);
    question = 'Quel agent gère les ressources humaines dans E-Team ?';
    options = ['Kash', 'Héra', 'Écho', 'Dexo'];
    correctAnswer = 1;
  }

  const shuffled = shuffleWithAnswer(options, correctAnswer);

  return Prediction.create({
    userId, question, challengeType,
    options: shuffled.options,
    correctAnswer: shuffled.correctIndex,
    domain, streakDay: streak, status: 'pending'
  });
}

// ── HÉRA — Questions RH variées ─────────────────────────────
async function generateHeraQuestion() {
  const totalEmp = await Employee.countDocuments({ status: 'active' }).catch(() => 0);
  const pendingLeaves = await LeaveRequest.countDocuments({ status: 'pending' }).catch(() => 0);
  const approvedLeaves = await LeaveRequest.countDocuments({ status: 'approved' }).catch(() => 0);

  // Compter par département
  const deptCounts = await Employee.aggregate([
    { $match: { status: 'active' } },
    { $group: { _id: '$department', count: { $sum: 1 } } },
    { $sort: { count: -1 } }
  ]).catch(() => []);

  const topDept = deptCounts[0];

  const questions = [
    {
      question: `Combien d'employés actifs y a-t-il dans l'entreprise ?`,
      options: [`${Math.max(0, totalEmp - 5)}`, `${totalEmp}`, `${totalEmp + 3}`, `${totalEmp + 8}`],
      correctAnswer: 1
    },
    {
      question: `Combien de demandes de congé sont en attente ?`,
      options: [`${Math.max(0, pendingLeaves - 2)}`, `${pendingLeaves}`, `${pendingLeaves + 3}`, `${pendingLeaves + 5}`],
      correctAnswer: 1
    },
    {
      question: `Combien de congés ont été approuvés au total ?`,
      options: [`${Math.max(0, approvedLeaves - 3)}`, `${approvedLeaves}`, `${approvedLeaves + 4}`, `${approvedLeaves + 7}`],
      correctAnswer: 1
    }
  ];

  if (topDept) {
    const deptNames = deptCounts.map(d => d._id).filter(Boolean);
    if (deptNames.length >= 4) {
      // Mélanger les noms pour les options
      questions.push({
        question: `Quel département a le plus d'employés actifs ?`,
        options: deptNames.slice(0, 4),
        correctAnswer: 0
      });
    }
  }

  return questions[Math.floor(Math.random() * questions.length)];
}

// ── KASH — Questions Finance variées ────────────────────────
async function generateKashQuestion() {
  const expenses = await Expense.find().sort({ date: -1 }).limit(20).lean().catch(() => []);
  const total = expenses.reduce((s, e) => s + (e.amount || 0), 0);
  const rounded = Math.round(total);

  // Catégorie la plus dépensée
  const catCounts = {};
  expenses.forEach(e => {
    catCounts[e.category || 'Other'] = (catCounts[e.category || 'Other'] || 0) + (e.amount || 0);
  });
  const sortedCats = Object.entries(catCounts).sort((a, b) => b[1] - a[1]);
  const topCat = sortedCats[0];

  const questions = [
    {
      question: `Quel est le total des 20 dernières dépenses ?`,
      options: [`${rounded - 100} DT`, `${rounded} DT`, `${rounded + 100} DT`, `${rounded + 200} DT`],
      correctAnswer: 1
    },
    {
      question: `Combien de dépenses sont enregistrées au total ?`,
      options: [`${Math.max(0, expenses.length - 5)}`, `${expenses.length}`, `${expenses.length + 5}`, `${expenses.length + 10}`],
      correctAnswer: 1
    }
  ];

  if (topCat && sortedCats.length >= 3) {
    const catOptions = sortedCats.slice(0, 4).map(c => c[0]);
    while (catOptions.length < 4) catOptions.push('Other');
    questions.push({
      question: `Quelle catégorie de dépense est la plus élevée ?`,
      options: catOptions,
      correctAnswer: 0
    });
  }

  return questions[Math.floor(Math.random() * questions.length)];
}

// ── ÉCHO — Défi Image + questions texte ─────────────────────
async function generateEchoQuestion() {
  const postCount = await SocialPost.countDocuments().catch(() => 0);

  // Essayer le défi image
  const lastPost = await SocialPost.findOne({ 'image.url': { $exists: true, $ne: null } })
    .sort({ createdAt: -1 }).lean().catch(() => null);

  if (lastPost && lastPost.image && lastPost.image.url) {
    const realImage = lastPost.image.url;
    const theme = (lastPost.metadata?.hashtags || ['business']).slice(0, 2).join(' ');

    const fake1 = `https://image.pollinations.ai/prompt/${encodeURIComponent(theme + ' corporate blue design')}?width=400&height=400&seed=${Date.now()}`;
    const fake2 = `https://image.pollinations.ai/prompt/${encodeURIComponent(theme + ' startup green modern')}?width=400&height=400&seed=${Date.now() + 99}`;

    const images = [realImage, fake1, fake2];
    const shuffled = shuffleWithAnswer(images, 0);

    return {
      question: '🖼️ Quelle image a été publiée par Écho sur les réseaux sociaux ?',
      options: shuffled.options,
      correctAnswer: shuffled.correctIndex,
      challengeType: 'image'
    };
  }

  // Fallback : question texte sur le dernier post
  const lastTextPost = await SocialPost.findOne().sort({ createdAt: -1 }).lean().catch(() => null);

  if (lastTextPost) {
    const content = lastTextPost.content || '';
    const hashtags = lastTextPost.metadata?.hashtags || [];
    if (hashtags.length >= 2) {
      const fakeHashtags = ['Innovation', 'Leadership', 'Productivité', 'Digital', 'Startup', 'Growth'];
      const realTag = hashtags[0];
      const fakes = fakeHashtags.filter(h => h.toLowerCase() !== realTag.toLowerCase()).slice(0, 3);
      return {
        question: `Quel hashtag a été utilisé dans le dernier post d'Écho ?`,
        options: [`#${realTag}`, `#${fakes[0]}`, `#${fakes[1]}`, `#${fakes[2]}`],
        correctAnswer: 0,
        challengeType: 'text'
      };
    }
  }

  // Fallback simple
  return {
    question: `Combien de posts Écho a-t-il publiés au total ?`,
    options: [`${Math.max(0, postCount - 3)}`, `${postCount}`, `${postCount + 3}`, `${postCount + 6}`],
    correctAnswer: 1,
    challengeType: 'text'
  };
}

// ── DEXO — Questions Documents variées ──────────────────────
async function generateDexoQuestion() {
  let docCount = 0;
  let byConfidentiality = {};

  try {
    const Document = require('../models/Document');
    docCount = await Document.countDocuments().catch(() => 0);

    const docs = await Document.aggregate([
      { $group: { _id: '$confidentialityLevel', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]).catch(() => []);

    docs.forEach(d => { if (d._id) byConfidentiality[d._id] = d.count; });
  } catch (e) { /* model may not exist */ }

  const questions = [
    {
      question: `Combien de documents Dexo gère-t-il ?`,
      options: [`${Math.max(0, docCount - 5)}`, `${docCount}`, `${docCount + 5}`, `${docCount + 10}`],
      correctAnswer: 1
    }
  ];

  const levels = Object.keys(byConfidentiality);
  if (levels.length >= 3) {
    questions.push({
      question: `Quel niveau de confidentialité est le plus fréquent ?`,
      options: levels.slice(0, 4),
      correctAnswer: 0
    });
  }

  return questions[Math.floor(Math.random() * questions.length)];
}

// ── TIMO — Questions Planning ───────────────────────────────
async function generateTimoQuestion() {
  let taskCount = 0, meetCount = 0;

  try {
    const Task = require('../models/Task');
    taskCount = await Task.countDocuments().catch(() => 0);
    meetCount = await Task.countDocuments({ category: 'meeting' }).catch(() => 0);
  } catch (e) { /* model may not exist */ }

  const questions = [
    {
      question: `Combien de réunions Timo a-t-il planifiées ?`,
      options: [`${Math.max(0, meetCount - 2)}`, `${meetCount}`, `${meetCount + 3}`, `${meetCount + 5}`],
      correctAnswer: 1
    },
    {
      question: `Combien de tâches existent au total dans le système ?`,
      options: [`${Math.max(0, taskCount - 4)}`, `${taskCount}`, `${taskCount + 4}`, `${taskCount + 8}`],
      correctAnswer: 1
    }
  ];

  return questions[Math.floor(Math.random() * questions.length)];
}

// =============================================================
//  HELPERS
// =============================================================

// Calculer le streak (jours consécutifs de victoire)
async function calculateStreak(userId) {
  const recent = await Prediction.find({ userId, status: 'answered' })
    .sort({ createdAt: -1 }).limit(30).lean();

  let streak = 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (let i = 0; i < recent.length; i++) {
    const expectedDay = new Date(today);
    expectedDay.setDate(expectedDay.getDate() - (i + 1));
    expectedDay.setHours(0, 0, 0, 0);

    const predDate = new Date(recent[i].createdAt);
    predDate.setHours(0, 0, 0, 0);

    if (predDate.getTime() === expectedDay.getTime() && recent[i].isCorrect) {
      streak++;
    } else {
      break;
    }
  }
  return streak;
}

// Mélanger les options
function shuffleWithAnswer(options, correctIndex) {
  const correctValue = options[correctIndex];
  const shuffled = [...options];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return { options: shuffled, correctIndex: shuffled.indexOf(correctValue) };
}

// Formater le challenge pour la réponse API
function formatChallenge(c) {
  const base = {
    id: c._id,
    question: c.question,
    options: c.options,
    domain: c.domain,
    domainIcon: { hera: '🏛️', kash: '💰', echo: '📢', dexo: '📄', timo: '⏰' }[c.domain],
    challengeType: c.challengeType || 'text',
    status: c.status
  };
  if (c.status === 'answered') {
    base.isCorrect = c.isCorrect;
    base.correctAnswer = c.correctAnswer;
    base.userAnswer = c.userAnswer;
    base.chosenAgent = c.chosenAgent;
    base.energyReward = c.energyReward;
    base.badge = c.badge;
    base.streakDay = c.streakDay;
  }
  return base;
}
