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
    return res.status(400).json({
      success: false,
      message: "Subject et content requis",
    });
  }

  try {
    const fullMessage = `Sujet: ${subject}\n\n${content}`;

    const analysis = await echoService.sendTextMessage(
      fullMessage,
      sender || "unknown",
      "Analyse ce message. Réponds UNIQUEMENT avec JSON: summary, isUrgent, isSpam, priority, actions, category"
    );

    const ownerId = req.user?.id
      ? new mongoose.Types.ObjectId(req.user.id)
      : null;

    const newEmail = await InboxEmail.create({
      subject,
      sender: sender || "unknown@email.com",
      content,
      summary: analysis.summary || content.substring(0, 100),
      isUrgent: analysis.isUrgent === true,
      isSpam: analysis.isSpam === true,
      priority: analysis.priority || "medium",
      actions: Array.isArray(analysis.actions) ? analysis.actions : [],
      category: analysis.category || "inbox",
      receivedAt: new Date(),
      isRead: false,
      ownerId,
      source: "receive",
    });

    await inboxStatsService.syncMessageStatsCache();

    // ==========================
    // 🤖 AUTO REPLY
    // ==========================
    let autoReply = { sent: false };

    if (!newEmail.isSpam) {
      try {
        const senderName = sender ? sender.split("@")[0] : "Utilisateur";

        const reply = await echoService.sendTextMessage(
          fullMessage,
          sender,
          `Réponds pro. Commence par Bonjour ${senderName}`
        );

        const replyText =
          reply.fullResponse ||
          reply.summary ||
          "Bonjour, merci pour votre message.";

        const pendingDoc = await InboxEmail.create({
          subject: "Re: " + subject,
          sender: "echo@e-team.com",
          content: replyText,
          category: "auto_reply_pending",
          inReplyTo: newEmail._id,
          ownerId,
        });

        autoReplyManager.scheduleReply(
          { id: newEmail._id.toString() },
          analysis,
          replyText
        );

        autoReply = {
          pending: true,
          content: replyText,
          pendingEmailId: pendingDoc._id.toString(),
        };
      } catch (err) {
        autoReply = { error: err.message };
      }
    }

    res.json({
      success: true,
      email: emailToClient(newEmail),
      analysis,
      autoReply,
    });
  } catch (error) {
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