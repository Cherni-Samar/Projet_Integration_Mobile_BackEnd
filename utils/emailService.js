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

// 1. Uniquement pour la création de compte
const sendWelcomeEmail = async (email, name) => {
  try {
    const transporter = createTransporter();
    const mailOptions = {
      from: `"E-Team" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: '🎉 Bienvenue sur E-Team !',
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: auto;">
          <h1 style="color: #CDFF00;">Bienvenue ${name} ! 🚀</h1>
          <p>Votre compte est activé. Vous pouvez maintenant gérer vos agents IA.</p>
        </div>
      `
    };
    const info = await transporter.sendMail(mailOptions);
    console.log('✅ Email de BIENVENUE envoyé:', info.messageId);
    return true;
  } catch (error) { console.error('❌ Erreur welcome email:', error); return false; }
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
// 2. ✅ NOUVELLE FONCTION : Alerte de recrutement entre agents
const sendStaffingAlert = async (targetEmail, details) => {
  try {
    const transporter = createTransporter();
    const mailOptions = {
      from: `"Hera (RH Service)" <${process.env.EMAIL_USER}>`,
      to: targetEmail,
      subject: `📢 ALERTE : Besoin de recrutement - ${details.department}`,
      html: `
        <div style="font-family: 'Inter', sans-serif; border: 1px solid #eee; padding: 20px; border-radius: 10px;">
          <h2 style="color: #A855F7;">Note de Service RH</h2>
          <p>L'agent <b>Hera</b> a détecté un manque d'effectif dans le département : <b>${details.department}</b>.</p>
          <p style="background: #f9f9f9; padding: 15px; border-left: 4px solid #CDFF00;">
             "${details.message}"
          </p>
          <p><i>Capacité actuelle : ${details.count}/${details.max}</i></p>
          <hr>
          <p style="font-size: 11px; color: #999;">Communication Inter-Agents E-Team</p>
        </div>
      `
    };
    const info = await transporter.sendMail(mailOptions);
    console.log(`📡 ALERTE STAFFING ENVOYÉE (Dept: ${details.department})`);
    return true;
  } catch (error) { console.error('❌ Erreur alerte staffing:', error); return false; }
};
// 1. Pour confirmer la réception simple
const sendCandidacyConfirmation = async (email, name) => {
  try {
    const transporter = createTransporter();
    await transporter.sendMail({
      from: `"E-Team RH" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: 'Candidature reçue - E-Team',
      html: `<p>Bonjour ${name},</p><p>Nous avons bien reçu votre candidature.</p>`
    });
    console.log(`📧 MAIL : Confirmation de réception envoyée à ${email}`); // ✅ LOG
    return true;
  } catch (e) { 
    console.error("❌ ERREUR NODEMAILER (Confirmation):", e.message); // ✅ LOG ERREUR
    return false; 
  }
};

const sendCandidacyInvitation = async (email, details) => {
  try {
    const transporter = createTransporter();
    
    const htmlContent = `
      <div style="font-family: 'Inter', Arial, sans-serif; max-width: 600px; margin: auto; border: 1px solid #e1e1e1; border-radius: 12px; overflow: hidden; color: #333;">
        <div style="background-color: #0A0A0A; padding: 30px; text-align: center;">
          <h1 style="color: #CCFF00; margin: 0; font-size: 24px; letter-spacing: 1px;">E-TEAM RH</h1>
        </div>
        
        <div style="padding: 30px; line-height: 1.6;">
          <h2 style="color: #000; margin-top: 0;">Bonjour ${details.name},</h2>
          
          <p>Nous avons le plaisir de vous informer que votre profil a retenu toute notre attention après une première analyse de votre candidature.</p>
          
          <p>Dans le cadre de notre processus de sélection innovant, nous souhaiterions vous inviter à une <b>Session d'Échange Collective</b>. Ce moment nous permettra de faire connaissance et de vous présenter plus en détail la culture de <b>E-Team</b> ainsi que les enjeux du poste.</p>

          <div style="background-color: #F8F9FA; border-left: 4px solid #CCFF00; padding: 20px; margin: 25px 0; border-radius: 8px;">
            <p style="margin: 0; font-weight: bold; color: #000; text-transform: uppercase; font-size: 12px;">📅 Date de la session :</p>
            <p style="margin: 5px 0 15px 0; font-size: 16px;">${details.interview_date}</p>

            <p style="margin: 0; font-weight: bold; color: #000; text-transform: uppercase; font-size: 12px;">🔗 Lien de la visioconférence :</p>
            <p style="margin: 10px 0 0 0;">
              <a href="${details.meeting_link}" 
                 style="background-color: #000; color: #CCFF00; padding: 10px 20px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
                Rejoindre la réunion (Jitsi)
              </a>
            </p>
          </div>

          <p>Nous vous recommandons de vous connecter quelques minutes à l'avance et de vous assurer du bon fonctionnement de votre micro et caméra.</p>
          
          <p>Dans l'attente de cet échange,</p>
          
          <p style="margin-bottom: 0;">Cordialement,</p>
          <p style="margin-top: 5px; font-weight: bold; color: #A855F7;">L'équipe Recrutement Hera IA</p>
        </div>
        
        <div style="background-color: #F4F4F4; padding: 15px; text-align: center; font-size: 11px; color: #999;">
          Ceci est un message automatique envoyé par le service RH de E-Team.
        </div>
      </div>
    `;

    await transporter.sendMail({
      from: `"Hera (E-Team RH)" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: '📅 Invitation : Session de rencontre collective - E-Team',
      html: htmlContent
    });

    console.log(`📧 MAIL : Invitation envoyée avec succès à ${email}`);
    return true;
  } catch (e) {
    console.error("❌ ERREUR NODEMAILER (Invitation):", e.message);
    return false;
  }
};

module.exports = {
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendWelcomeEmail,
  sendLeaveNotification,
  sendStaffingAlert,
  sendCandidacyConfirmation,
  sendCandidacyInvitation
};