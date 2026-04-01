const nodemailer = require('nodemailer');

// Configuration du transporteur email
const createTransporter = () => {
  return nodemailer.createTransport({
    host: process.env.EMAIL_HOST || 'smtp.gmail.com',
    port: process.env.EMAIL_PORT || 587,
    secure: false,
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });
};

// Envoyer un email de vérification
const sendVerificationEmail = async (email, code) => {
  try {
    const transporter = createTransporter();

    const mailOptions = {
      from: `"E-Team" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: 'Code de vérification E-Team',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body {
              font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
              background-color: #f5f5f5;
              margin: 0;
              padding: 0;
            }
            .container {
              max-width: 600px;
              margin: 40px auto;
              background-color: white;
              border-radius: 16px;
              padding: 40px;
              box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
            }
            .header {
              text-align: center;
              margin-bottom: 30px;
            }
            .logo {
              font-size: 32px;
              font-weight: bold;
              color: #CDFF00;
              text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.1);
            }
            .code-box {
              background: linear-gradient(135deg, #CDFF00 0%, #A855F7 100%);
              padding: 20px;
              border-radius: 12px;
              text-align: center;
              margin: 30px 0;
            }
            .code {
              font-size: 36px;
              font-weight: bold;
              letter-spacing: 8px;
              color: #000;
              text-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
            }
            .content {
              color: #333;
              line-height: 1.6;
            }
            .content h2 {
              color: #000;
            }
            .footer {
              text-align: center;
              margin-top: 30px;
              color: #666;
              font-size: 14px;
              border-top: 1px solid #eee;
              padding-top: 20px;
            }
            .highlight {
              color: #CDFF00;
              font-weight: bold;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <div class="logo">E-Team</div>
            </div>
            <div class="content">
              <h2>Code de vérification</h2>
              <p>Bonjour,</p>
              <p>Bienvenue sur <strong>E-Team</strong> ! Voici votre code de vérification pour créer votre compte :</p>
              <div class="code-box">
                <div class="code">${code}</div>
              </div>
              <p>Ce code est valable pendant <strong>10 minutes</strong>.</p>
              <p>Si vous n'avez pas demandé ce code, ignorez cet email.</p>
            </div>
            <div class="footer">
              <p>© 2026 <span class="highlight">E-Team</span> - Department as a Service</p>
              <p style="font-size: 12px; color: #999; margin-top: 10px;">
                Transformez votre entreprise avec l'IA 🚀
              </p>
            </div>
          </div>
        </body>
        </html>
      `,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('✅ Email de vérification envoyé:', info.messageId);
    return true;
  } catch (error) {
    console.error('❌ Erreur envoi email:', error);
    throw new Error('Erreur lors de l\'envoi de l\'email');
  }
};

// Envoyer un email de réinitialisation de mot de passe
const sendPasswordResetEmail = async (email, code) => {
  try {
    const transporter = createTransporter();

    const mailOptions = {
      from: `"E-Team" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: 'Réinitialisation de votre mot de passe',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body {
              font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
              background-color: #f5f5f5;
              margin: 0;
              padding: 0;
            }
            .container {
              max-width: 600px;
              margin: 40px auto;
              background-color: white;
              border-radius: 16px;
              padding: 40px;
              box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
            }
            .header {
              text-align: center;
              margin-bottom: 30px;
            }
            .logo {
              font-size: 32px;
              font-weight: bold;
              color: #CDFF00;
              text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.1);
            }
            .code-box {
              background: linear-gradient(135deg, #CDFF00 0%, #A855F7 100%);
              padding: 20px;
              border-radius: 12px;
              text-align: center;
              margin: 30px 0;
            }
            .code {
              font-size: 36px;
              font-weight: bold;
              letter-spacing: 8px;
              color: #000;
              text-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
            }
            .content {
              color: #333;
              line-height: 1.6;
            }
            .content h2 {
              color: #000;
            }
            .warning {
              background-color: #FFF3CD;
              border-left: 4px solid #FFC107;
              padding: 15px;
              margin: 20px 0;
              border-radius: 4px;
            }
            .footer {
              text-align: center;
              margin-top: 30px;
              color: #666;
              font-size: 14px;
              border-top: 1px solid #eee;
              padding-top: 20px;
            }
            .highlight {
              color: #CDFF00;
              font-weight: bold;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <div class="logo">🔐 E-Team</div>
            </div>
            <div class="content">
              <h2>Réinitialisation de mot de passe</h2>
              <p>Bonjour,</p>
              <p>Vous avez demandé la réinitialisation de votre mot de passe <strong>E-Team</strong>. Voici votre code de sécurité :</p>
              <div class="code-box">
                <div class="code">${code}</div>
              </div>
              <p>Ce code est valable pendant <strong>10 minutes</strong>.</p>
              <div class="warning">
                <strong>⚠️ Attention :</strong> Si vous n'avez pas demandé cette réinitialisation, ignorez cet email. Votre mot de passe restera inchangé et votre compte est sécurisé.
              </div>
            </div>
            <div class="footer">
              <p>© 2026 <span class="highlight">E-Team</span> - Department as a Service</p>
              <p style="font-size: 12px; color: #999; margin-top: 10px;">
                Sécurité et innovation au service de votre entreprise 🛡️
              </p>
            </div>
          </div>
        </body>
        </html>
      `,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('✅ Email de réinitialisation envoyé:', info.messageId);
    return true;
  } catch (error) {
    console.error('❌ Erreur envoi email:', error);
    throw new Error('Erreur lors de l\'envoi de l\'email');
  }
};

// Envoyer un email de bienvenue après vérification
const sendWelcomeEmail = async (email, name) => {
  try {
    const transporter = createTransporter();

    const mailOptions = {
      from: `"E-Team" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: '🎉 Bienvenue sur E-Team !',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body {
              font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
              background-color: #f5f5f5;
              margin: 0;
              padding: 0;
            }
            .container {
              max-width: 600px;
              margin: 40px auto;
              background-color: white;
              border-radius: 16px;
              padding: 40px;
              box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
            }
            .header {
              text-align: center;
              margin-bottom: 30px;
            }
            .logo {
              font-size: 36px;
              font-weight: bold;
              color: #CDFF00;
              text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.1);
            }
            .hero {
              background: linear-gradient(135deg, #CDFF00 0%, #A855F7 100%);
              padding: 30px;
              border-radius: 12px;
              text-align: center;
              margin: 30px 0;
            }
            .hero h1 {
              font-size: 28px;
              color: #000;
              margin: 0;
            }
            .content {
              color: #333;
              line-height: 1.6;
            }
            .features {
              background-color: #f9f9f9;
              padding: 20px;
              border-radius: 8px;
              margin: 20px 0;
            }
            .features ul {
              list-style: none;
              padding: 0;
            }
            .features li {
              padding: 10px 0;
              padding-left: 30px;
              position: relative;
            }
            .features li:before {
              content: "✓";
              position: absolute;
              left: 0;
              color: #CDFF00;
              font-weight: bold;
              font-size: 20px;
            }
            .cta {
              text-align: center;
              margin: 30px 0;
            }
            .button {
              display: inline-block;
              background-color: #000;
              color: #CDFF00;
              padding: 15px 40px;
              border-radius: 8px;
              text-decoration: none;
              font-weight: bold;
            }
            .footer {
              text-align: center;
              margin-top: 30px;
              color: #666;
              font-size: 14px;
              border-top: 1px solid #eee;
              padding-top: 20px;
            }
            .highlight {
              color: #CDFF00;
              font-weight: bold;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <div class="logo">🚀 E-Team</div>
            </div>
            <div class="hero">
              <h1>Bienvenue ${name || ''} ! 🎉</h1>
            </div>
            <div class="content">
              <p>Votre compte <strong>E-Team</strong> est maintenant actif !</p>
              <p>Vous avez accès à notre marketplace d'agents IA pour transformer votre entreprise :</p>
              
              <div class="features">
                <ul>
                  <li>Agents spécialisés par département</li>
                  <li>Automatisation intelligente</li>
                  <li>Collaboration en temps réel</li>
                  <li>Analyses et rapports avancés</li>
                </ul>
              </div>

              <div class="cta">
                <a href="#" class="button">Explorer la Marketplace</a>
              </div>

              <p style="margin-top: 30px;">
                Besoin d'aide ? Notre équipe est là pour vous accompagner.
              </p>
            </div>
            <div class="footer">
              <p>© 2026 <span class="highlight">E-Team</span> - Department as a Service</p>
              <p style="font-size: 12px; color: #999; margin-top: 10px;">
                L'avenir de votre entreprise commence maintenant 💼
              </p>
            </div>
          </div>
        </body>
        </html>
      `,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('✅ Email de bienvenue envoyé:', info.messageId);
    return true;
  } catch (error) {
    console.error('❌ Erreur envoi email:', error);
    return false;
  }
};
const sendLeaveNotification = async (email, details) => {
  try {
    const transporter = createTransporter();
    const isApproved = details.status === 'approved';
    
    const mailOptions = {
      from: `"Hera (E-Team RH)" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: `Mise à jour de votre demande de congé : ${isApproved ? '✅ Approuvée' : '❌ Refusée'}`,
      html: `
        <div style="font-family: sans-serif; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
          <h2 style="color: ${isApproved ? '#2ecc71' : '#e74c3c'}">Bonjour ${details.employee_name},</h2>
          <p>Votre demande de congé pour la période du <strong>${details.start_date}</strong> au <strong>${details.end_date}</strong> a été <strong>${isApproved ? 'approuvée' : 'refusée'}</strong>.</p>
          <p><strong>Motif de la décision :</strong> ${details.reason_decision}</p>
          <p>Nombre de jours : ${details.days}</p>
          <hr>
          <p style="font-size: 12px; color: #777;">Ceci est un message automatique de Hera, votre agent RH.</p>
        </div>
      `
    };
    await transporter.sendMail(mailOptions);
    return true;
  } catch (error) {
    console.error('❌ Erreur mail congé:', error);
    return false;
  }
};
module.exports = {
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendWelcomeEmail,
  sendLeaveNotification,
};