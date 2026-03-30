const express = require('express');
const router = express.Router();
const echoService = require('../services/echoService');
const autoReplyManager = require('../services/autoReplyManager');

let emails = [
  {
    id: '1',
    subject: 'Réunion d\'équipe',
    sender: 'manager@company.com',
    content: 'Réunion demain à 10h pour discuter de l\'avancement du projet.',
    summary: 'Réunion demain 10h pour avancement projet',
    isUrgent: false,
    isSpam: false,
    priority: 'medium',
    actions: ['Préparer le rapport', 'Confirmer présence'],
    category: 'meeting',
    receivedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    isRead: false
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
    actions: ['Redémarrer le serveur', 'Notifier l\'équipe technique'],
    category: 'alert',
    receivedAt: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
    isRead: false
  },
  {
    id: '3',
    subject: 'Gagnez 10000€ !',
    sender: 'spam@fake.com',
    content: 'Félicitations ! Vous avez gagné 10000€. Cliquez ici : http://fake-link.com',
    summary: 'Tentative d\'arnaque',
    isUrgent: false,
    isSpam: true,
    priority: 'low',
    actions: ['Supprimer', 'Ne pas ouvrir'],
    category: 'spam',
    receivedAt: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
    isRead: false
  },
  {
    id: '4',
    subject: 'Demande de congé',
    sender: 'employee@company.com',
    content: 'Je souhaite prendre 5 jours de congé à partir du 15 mai.',
    summary: 'Demande de congé 5 jours',
    isUrgent: false,
    isSpam: false,
    priority: 'low',
    actions: ['Valider la demande', 'Mettre à jour le planning'],
    category: 'hr',
    receivedAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    isRead: true
  }
];

router.post('/receive', async (req, res) => {
  const { subject, sender, content } = req.body;
  
  if (!subject || !content) {
    return res.status(400).json({ success: false, message: 'Subject et content requis' });
  }
  
  try {
    console.log('📧 Email reçu');
    console.log('   Sujet:', subject);
    console.log('   Expéditeur:', sender);
    
    const fullMessage = 'Sujet: ' + subject + '\n\n' + content;
    
    const analysis = await echoService.sendTextMessage(
      fullMessage,
      sender || 'unknown',
      "Analyse ce message. Réponds UNIQUEMENT avec ce format JSON: summary (résumé clair en une phrase), isUrgent (boolean), isSpam (boolean), priority (high/medium/low), actions (array de strings), category (meeting/alert/request/hr/spam/inbox)"
    );
    
    const newEmail = {
      id: Date.now().toString(),
      subject: subject,
      sender: sender || 'unknown@email.com',
      content: content,
      summary: analysis.summary || content.substring(0, 100),
      isUrgent: analysis.isUrgent === true,
      isSpam: analysis.isSpam === true,
      priority: analysis.priority || 'medium',
      actions: Array.isArray(analysis.actions) ? analysis.actions : [],
      category: analysis.category || 'inbox',
      receivedAt: new Date().toISOString(),
      isRead: false
    };
    
    emails.unshift(newEmail);
    console.log('✅ Email sauvegardé');
    
    let autoReply = { sent: false, message: '', pending: false, content: '' };
    
    if (!newEmail.isSpam) {
      console.log('🤖 Génération réponse automatique...');
      try {
        const senderName = sender ? sender.split('@')[0] : 'Utilisateur';
        const replyPrompt = "Tu es l'Agent Echo. Génère une réponse professionnelle pour cet email. Sois poli, concis et réponds directement. Commence par 'Bonjour " + senderName + ",' et termine par 'Cordialement, Agent Echo'.";
        
        const reply = await echoService.sendTextMessage(fullMessage, sender, replyPrompt);
        const replyText = reply.fullResponse || reply.summary || 'Bonjour, merci pour votre message. Je le traite. Cordialement, Agent Echo.';
        
        // Email de réponse en attente (affiché immédiatement)
        const pendingReplyEmail = {
          id: Date.now().toString(),
          subject: 'Re: ' + subject,
          sender: 'echo@e-team.com',
          content: replyText,
          summary: 'Reponse automatique (envoi dans 3 min)',
          isUrgent: false,
          isSpam: false,
          priority: 'low',
          actions: [],
          category: 'auto_reply_pending',
          receivedAt: new Date().toISOString(),
          isRead: false,
          inReplyTo: newEmail.id,
          to: sender,
          willSendIn: '3 minutes'
        };
        
        emails.unshift(pendingReplyEmail);
        
        // Planifier l'envoi réel
        autoReplyManager.scheduleReply(newEmail, analysis, replyText);
        
        autoReply = {
          sent: false,
          message: 'Reponse generee - envoi dans 3 minutes',
          pending: true,
          content: replyText,
          willSendIn: '3 minutes'
        };
        
        console.log('✅ Reponse generee et affichee (envoi dans 3 min)');
      } catch (err) {
        console.error('❌ Erreur reponse:', err.message);
        autoReply = { sent: false, message: 'Erreur: ' + err.message, pending: false };
      }
    } else {
      autoReply = { sent: false, message: 'Spam - pas de reponse', pending: false };
      console.log('⚠️ Spam - pas de reponse');
    }
    
    res.json({ 
      success: true, 
      email: newEmail,
      analysis: {
        summary: analysis.summary,
        isUrgent: analysis.isUrgent,
        isSpam: analysis.isSpam,
        priority: analysis.priority,
        actions: analysis.actions,
        category: analysis.category
      },
      autoReply: autoReply
    });
    
  } catch (error) {
    console.error('❌ Erreur:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/:id/reply', async (req, res) => {
  const { id } = req.params;
  const { replyContent, sendTo } = req.body;
  
  try {
    const email = emails.find(e => e.id === id);
    if (!email) {
      return res.status(404).json({ success: false, message: 'Email non trouve' });
    }
    
    const cancelled = autoReplyManager.cancelReply(id, 'Reponse manuelle envoyee');
    
    const replyEmail = {
      id: Date.now().toString(),
      subject: 'Re: ' + email.subject,
      sender: 'echo@e-team.com',
      content: replyContent,
      summary: 'Reponse manuelle',
      isUrgent: false,
      isSpam: false,
      priority: 'low',
      actions: [],
      category: 'reply',
      receivedAt: new Date().toISOString(),
      isRead: false,
      inReplyTo: email.id,
      to: sendTo || email.sender
    };
    
    emails.unshift(replyEmail);
    
    const emailSender = require('../services/emailSender');
    await emailSender.sendEmail({
      to: email.sender,
      subject: 'Re: ' + email.subject,
      content: replyContent,
      from: 'echo@e-team.com'
    });
    
    console.log('📧 Reponse manuelle envoyee (auto-reply annule: ' + cancelled + ')');
    
    res.json({
      success: true,
      message: 'Reponse envoyee',
      reply: replyEmail,
      autoReplyCancelled: cancelled
    });
    
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/', (req, res) => {
  const urgentCount = emails.filter(e => e.isUrgent && !e.isRead).length;
  const spamCount = emails.filter(e => e.isSpam).length;
  const unreadCount = emails.filter(e => !e.isRead).length;

  res.json({
    success: true,
    total: emails.length,
    urgentCount: urgentCount,
    spamCount: spamCount,
    unreadCount: unreadCount,
    emails: emails
  });
});

router.get('/pending', (req, res) => {
  const pending = autoReplyManager.getPendingStatus();
  res.json({
    success: true,
    pending: pending,
    count: pending.length
  });
});

router.get('/:id', (req, res) => {
  const email = emails.find(e => e.id === req.params.id);
  if (!email) return res.status(404).json({ success: false });
  res.json({ success: true, email: email });
});

router.patch('/:id/read', (req, res) => {
  const index = emails.findIndex(e => e.id === req.params.id);
  if (index === -1) return res.status(404).json({ success: false });
  emails[index].isRead = true;
  res.json({ success: true });
});

router.delete('/:id', (req, res) => {
  const index = emails.findIndex(e => e.id === req.params.id);
  if (index === -1) return res.status(404).json({ success: false });
  emails.splice(index, 1);
  res.json({ success: true });
});

module.exports = router;
