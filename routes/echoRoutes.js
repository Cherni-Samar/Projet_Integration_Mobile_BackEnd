const express = require('express');
const router = express.Router();

// Minimal endpoints used by the Flutter Echo screens.

// POST /api/echo/send-to-hera
router.post('/send-to-hera', async (req, res) => {
  const { subject, content, from } = req.body || {};

  if (!subject || !content) {
    return res.status(400).json({
      success: false,
      message: 'subject et content requis',
    });
  }

  // Stub success for now. If you want, we can forward this to your Hera controller
  // or persist it as an internal message.
  return res.json({
    success: true,
    message: 'Message reçu (stub).',
    data: {
      subject,
      content,
      from: from || 'echo@e-team.com',
    },
  });
});

// POST /api/echo/echo
// Placeholder: keep compatibility with the Front EchoService.sendTextMessage.
router.post('/echo', async (req, res) => {
  const { message, sender } = req.body || {};
  return res.json({
    success: true,
    summary: typeof message === 'string' ? message.slice(0, 120) : '',
    isUrgent: false,
    priority: 'low',
    actions: [],
    category: 'inbox',
    original: message,
    sender,
  });
});

module.exports = router;
