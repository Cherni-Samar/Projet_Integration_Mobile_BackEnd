const mongoose = require("mongoose");
const echoService = require("../services/echoService");
const autoReplyManager = require("../services/autoReplyManager");
const InboxEmail = require("../models/InboxEmail");
const inboxStatsService = require("../services/inboxStatsService");
const { emailToClient } = require("../utils/emailSerialize");

// 🔹 helper
const ownerFilter = (req) => {
  if (!req.user || !req.user.id) return {};
  return {
    $or: [
      { ownerId: null },
      { ownerId: new mongoose.Types.ObjectId(req.user.id) },
    ],
  };
};

// ==========================
// 📩 RECEIVE EMAIL
// ==========================

exports.receiveEmail = async (req, res) => {
  const { subject, sender, content } = req.body;

  if (!subject || !content) {
    return res.status(400).json({ success: false, message: "Subject et content requis" });
  }

  try {
    const ownerId = req.user?.id ? new mongoose.Types.ObjectId(req.user.id) : null;

    // 1. Enregistrement du mail
    const newEmail = await InboxEmail.create({
      subject,
      sender: sender || "unknown@email.com",
      content,
      receivedAt: new Date(),
      isRead: false,
      ownerId,
      source: "receive",
    });

    console.log(`📥 Nouveau mail de ${sender} reçu.`);

    // 2. ✅ APPEL À DEXO POUR L'ANALYSE DE PROJET (L'intelligence)
    // On importe le contrôleur Dexo ici
    const dexo = require('./dexoController'); 
    const projectData = await dexo.analyzeAndRouteEmail(newEmail._id);

    await inboxStatsService.syncMessageStatsCache();

    // 3. Réponse au client
    res.json({
      success: true,
      message: "Email reçu et analysé par le Superviseur Dexo",
      projectDetected: projectData ? projectData.title : "Aucun projet détecté",
      emailId: newEmail._id
    });

  } catch (error) {
    console.error("❌ Erreur receiveEmail:", error.message);
    res.status(500).json({ success: false, error: error.message });
  }
};
// ==========================
// 📥 GET ALL EMAILS
// ==========================
exports.getEmails = async (req, res) => {
  try {
    const filter = ownerFilter(req);
    const emails = await InboxEmail.find(filter)
      .sort({ receivedAt: -1 })
      .lean();

    res.json({
      success: true,
      emails: emails.map(emailToClient),
    });
  } catch (error) {
    res.status(500).json({ success: false });
  }
};

// ==========================
// ⏳ PENDING
// ==========================
exports.getPending = (req, res) => {
  const pending = autoReplyManager.getPendingStatus();
  res.json({ success: true, pending });
};

// ==========================
// 📧 GET ONE EMAIL
// ==========================
exports.getEmailById = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ success: false });
    }

    const email = await InboxEmail.findById(req.params.id);
    if (!email) return res.status(404).json({ success: false });

    res.json({ success: true, email: emailToClient(email) });
  } catch (error) {
    res.status(500).json({ success: false });
  }
};

// ==========================
// ✅ MARK READ
// ==========================
exports.markAsRead = async (req, res) => {
  try {
    await InboxEmail.findByIdAndUpdate(req.params.id, { isRead: true });
    res.json({ success: true });
  } catch {
    res.status(500).json({ success: false });
  }
};

// ==========================
// ❌ DELETE
// ==========================
exports.deleteEmail = async (req, res) => {
  try {
    await InboxEmail.findByIdAndDelete(req.params.id);
    await inboxStatsService.syncMessageStatsCache();
    res.json({ success: true });
  } catch {
    res.status(500).json({ success: false });
  }
};