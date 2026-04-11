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
// 3. ✅ Invitation entretien (score > 70)
const sendCandidacyInvitation = async (email, details) => {
  try {
    const transporter = createTransporter();
    const mailOptions = {
      from: `"Hera (E-Team RH)" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: `🎉 Félicitations ${details.name} ! Entretien programmé chez E-Team`,
      html: `
        <div style="font-family: 'Inter', sans-serif; max-width: 600px; margin: auto; border: 1px solid #eee; border-radius: 16px; overflow: hidden;">
          <div style="background: linear-gradient(135deg, #0A0A0A 0%, #1A1A1A 100%); padding: 30px; text-align: center;">
            <div style="color: #CDFF00; font-size: 28px; font-weight: bold;">🚀 E-TEAM</div>
            <p style="color: #888; margin-top: 8px;">Département as a Service</p>
          </div>
          <div style="padding: 30px; background: white;">
            <h2 style="color: #2ecc71;">Félicitations ${details.name} ! 🎉</h2>
            <p>Votre candidature a été analysée par notre IA <strong>Hera</strong> et votre profil nous intéresse !</p>
            <div style="background: #f0fff0; border-left: 4px solid #2ecc71; padding: 15px; border-radius: 8px; margin: 20px 0;">
              <p style="margin: 0;"><strong>📊 Score IA :</strong> <span style="color: #2ecc71; font-size: 20px; font-weight: bold;">${details.score || 'Élevé'}%</span></p>
            </div>
            <div style="background: #f8f8f8; padding: 20px; border-radius: 12px; margin: 20px 0;">
              <h3 style="margin-top: 0;">📅 Votre entretien</h3>
              <p><strong>Date :</strong> ${details.interview_date}</p>
              <p><strong>Lien visio :</strong> <a href="${details.meeting_link}" style="color: #A855F7;">${details.meeting_link}</a></p>
            </div>
            <p>Nous avons hâte de vous rencontrer !</p>
          </div>
          <div style="background: #f5f5f5; padding: 15px; text-align: center; font-size: 12px; color: #999;">
            © 2026 E-Team — Analyse IA par Hera 🤖
          </div>
        </div>
      `
    };
    await transporter.sendMail(mailOptions);
    console.log(`✅ Email d'invitation envoyé à ${email}`);
    return true;
  } catch (error) { console.error('❌ Erreur mail invitation:', error); return false; }
};

// 4. ✅ Confirmation simple (score <= 70)
const sendCandidacyConfirmation = async (email, name) => {
  try {
    const transporter = createTransporter();
    const mailOptions = {
      from: `"Hera (E-Team RH)" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: `📩 Candidature reçue — Merci ${name} !`,
      html: `
        <div style="font-family: 'Inter', sans-serif; max-width: 600px; margin: auto; border: 1px solid #eee; border-radius: 16px; overflow: hidden;">
          <div style="background: linear-gradient(135deg, #0A0A0A 0%, #1A1A1A 100%); padding: 30px; text-align: center;">
            <div style="color: #CDFF00; font-size: 28px; font-weight: bold;">🚀 E-TEAM</div>
            <p style="color: #888; margin-top: 8px;">Département as a Service</p>
          </div>
          <div style="padding: 30px; background: white;">
            <h2>Merci ${name} ! 👋</h2>
            <p>Nous avons bien reçu votre candidature. Notre IA <strong>Hera</strong> a analysé votre profil.</p>
            <div style="background: #fff8e1; border-left: 4px solid #FFC107; padding: 15px; border-radius: 8px; margin: 20px 0;">
              <p style="margin: 0;">Votre candidature est en cours d'étude par notre équipe RH. Nous reviendrons vers vous prochainement.</p>
            </div>
            <p>En attendant, n'hésitez pas à consulter nos autres offres sur notre page LinkedIn.</p>
          </div>
          <div style="background: #f5f5f5; padding: 15px; text-align: center; font-size: 12px; color: #999;">
            © 2026 E-Team — Analyse IA par Hera 🤖
          </div>
        </div>
      `
    };
    await transporter.sendMail(mailOptions);
    console.log(`✅ Email de confirmation envoyé à ${email}`);
    return true;
  } catch (error) { console.error('❌ Erreur mail confirmation:', error); return false; }
};

module.exports = {
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendWelcomeEmail,
  sendLeaveNotification,
  sendStaffingAlert,
  sendCandidacyInvitation,
  sendCandidacyConfirmation,
};