// =============================================================
//  ROUTES EXPRESS - Agent Echo
//  Ces routes exposent l'agent Echo via une API REST
// =============================================================

const express = require("express");
const router = express.Router();
const echoAgent = require("../agents/Echoagent");
const { analyserMessage, reinitialiserMemoire } = echoAgent;

console.log('echoAgent loaded:', echoAgent);

// ─────────────────────────────────────────────
//  POST /api/echo/analyser
//  Analyse un seul message
//
//  Body: { "message": "Bonjour, notre serveur est tombé en panne !" }
// ─────────────────────────────────────────────
router.post("/analyser", async (req, res) => {
  try {
    const { message } = req.body;

    if (!message || message.trim() === "") {
      return res.status(400).json({
        success: false,
        error: "Le champ 'message' est requis",
      });
    }

    console.log(`📨 Nouveau message reçu (${message.length} caractères)`);

    console.log('Type of analyserMessage:', typeof analyserMessage);
    console.log('analyserMessage:', analyserMessage);

    const resultat = await analyserMessage(message);

    res.json(resultat);
  } catch (error) {
    console.error("❌ Erreur route /analyser:", error);
    res.status(500).json({
      success: false,
      error: "Erreur interne du serveur",
      details: error.message,
    });
  }
});

// ─────────────────────────────────────────────
//  POST /api/echo/batch
//  Analyse plusieurs messages en une seule fois
//
//  Body: { "messages": ["msg1", "msg2", "msg3"] }
// ─────────────────────────────────────────────
router.post("/batch", async (req, res) => {
  try {
    const { messages } = req.body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({
        success: false,
        error: "Le champ 'messages' doit être un tableau non vide",
      });
    }

    if (messages.length > 10) {
      return res.status(400).json({
        success: false,
        error: "Maximum 10 messages par lot",
      });
    }

    console.log(`📦 Lot de ${messages.length} messages reçus`);

    // Analyser chaque message en parallèle
    const resultats = await Promise.all(
      messages.map((msg, index) =>
        analyserMessage(msg).then((r) => ({ index, message: msg.substring(0, 50) + "...", ...r }))
      )
    );

    res.json({
      success: true,
      total: messages.length,
      resultats,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("❌ Erreur route /batch:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});
// Route pour qu'Echo envoie un email à Hera
router.post('/send-to-hera', async (req, res) => {
  const { subject, content, from } = req.body;
  
  try {
    // Appeler l'API Hera pour recevoir l'email
    const response = await fetch('http://localhost:3000/api/hera/receive-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        subject: subject,
        sender: from || 'echo@e-team.com',
        content: content,
        type: 'email_from_echo'
      })
    });
    
    const result = await response.json();
    
    res.json({
      success: true,
      message: 'Email envoyé à Hera',
      result: result
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});
// ─────────────────────────────────────────────
//  DELETE /api/echo/memoire
//  Réinitialise la mémoire de l'agent (nouvelle session)
// ─────────────────────────────────────────────
router.delete("/memoire", async (req, res) => {
  try {
    const result = await reinitialiserMemoire();
    res.json({ success: true, ...result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ─────────────────────────────────────────────
//  GET /api/echo/sante
//  Vérifie que l'agent Echo fonctionne correctement
// ─────────────────────────────────────────────
router.get("/sante", (req, res) => {
  res.json({
    status: "✅ Agent Echo opérationnel",
    outils: ["detecter_spam", "calculer_priorite", "resumer_conversation", "categoriser_message"],
    version: "1.0.0",
    timestamp: new Date().toISOString(),
  });
});

module.exports = router;