const express = require('express');
const router = express.Router();

// In-memory mailbox (MVP) — enough for the Flutter inbox screens.
// If you later want persistence, we can back this by Mongo.
let emails = [
  {
    id: '1',
    subject: "Réunion d'équipe",
    sender: 'manager@company.com',
    content: "Réunion demain à 10h pour discuter de l'avancement du projet.",
    summary: 'Réunion demain 10h pour avancement projet',
    isUrgent: false,
    isSpam: false,
    priority: 'medium',
    actions: ['Préparer le rapport', 'Confirmer présence'],
    category: 'meeting',
    receivedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    isRead: false,
  },
  {
    id: '2',
    subject: 'URGENT : Problème serveur',
    sender: 'admin@system.com',
    content: 'Le serveur de production est en panne. Intervention immédiate requise.',
    summary: 'Panne serveur production, intervention immédiate',
    isUrgent: true,
    isSpam: false,
    priority: 'high',
    actions: ['Redémarrer le serveur', "Notifier l'équipe technique"],
    category: 'alert',
    receivedAt: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
    isRead: false,
  },
];

function computeCounts(list) {
  const urgentCount = list.filter((e) => e.isUrgent && !e.isRead && e.sender !== 'echo@e-team.com')
    .length;
  const spamCount = list.filter((e) => e.isSpam).length;
  const unreadCount = list.filter((e) => !e.isRead && e.sender !== 'echo@e-team.com').length;
  return { urgentCount, spamCount, unreadCount };
}

// GET /api/emails
router.get('/', (req, res) => {
  const { urgentCount, spamCount, unreadCount } = computeCounts(emails);
  return res.json({
    success: true,
    total: emails.length,
    urgentCount,
    spamCount,
    unreadCount,
    emails,
  });
});

// GET /api/emails/pending
// Kept for UI badge; no auto-reply scheduling in this backend.
router.get('/pending', (req, res) => {
  return res.json({
    success: true,
    pending: [],
    count: 0,
  });
});

// PATCH /api/emails/:id/read
router.patch('/:id/read', (req, res) => {
  const idx = emails.findIndex((e) => e.id === req.params.id);
  if (idx === -1) return res.status(404).json({ success: false, message: 'Email non trouvé' });
  emails[idx].isRead = true;
  return res.json({ success: true });
});

// DELETE /api/emails/:id
router.delete('/:id', (req, res) => {
  const idx = emails.findIndex((e) => e.id === req.params.id);
  if (idx === -1) return res.status(404).json({ success: false, message: 'Email non trouvé' });
  emails.splice(idx, 1);
  return res.json({ success: true });
});

// POST /api/emails/:id/reply
router.post('/:id/reply', (req, res) => {
  const { replyContent } = req.body || {};
  if (!replyContent || typeof replyContent !== 'string') {
    return res.status(400).json({ success: false, message: 'replyContent requis' });
  }

  const original = emails.find((e) => e.id === req.params.id);
  if (!original) return res.status(404).json({ success: false, message: 'Email non trouvé' });

  const replyEmail = {
    id: Date.now().toString(),
    subject: `Re: ${original.subject}`,
    sender: 'echo@e-team.com',
    content: replyContent,
    summary: 'Réponse manuelle',
    isUrgent: false,
    isSpam: false,
    priority: 'low',
    actions: [],
    category: 'reply',
    receivedAt: new Date().toISOString(),
    isRead: false,
    inReplyTo: original.id,
    to: original.sender,
  };

  emails.unshift(replyEmail);
  return res.json({ success: true, reply: replyEmail });
});

// POST /api/emails/receive
// Convenience endpoint to push new messages into the inbox.
router.post('/receive', (req, res) => {
  const { subject, sender, content } = req.body || {};
  if (!subject || !content) {
    return res.status(400).json({ success: false, message: 'subject et content requis' });
  }

  const newEmail = {
    id: Date.now().toString(),
    subject: String(subject),
    sender: sender ? String(sender) : 'unknown@email.com',
    content: String(content),
    summary: String(content).slice(0, 120),
    isUrgent: false,
    isSpam: false,
    priority: 'low',
    actions: [],
    category: 'inbox',
    receivedAt: new Date().toISOString(),
    isRead: false,
  };

  emails.unshift(newEmail);
  return res.json({ success: true, email: newEmail });
});

module.exports = router;
