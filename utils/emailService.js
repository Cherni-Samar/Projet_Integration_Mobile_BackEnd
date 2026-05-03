const nodemailer = require('nodemailer');

// ══════════════════════════════════════════════════════════════
// TRANSPORT EMAIL
// Brevo REST API (HTTP) → fonctionne sur Render vers TOUTES adresses
// SMTP Gmail → fallback local uniquement
// ══════════════════════════════════════════════════════════════

const createTransporter = () => {
  return nodemailer.createTransport({
    host: process.env.EMAIL_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.EMAIL_PORT) || 587,
    secure: false,
    auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
    tls: { rejectUnauthorized: false }
  });
};

async function sendEmail({ from, to, subject, html }) {
  console.log(`[EMAIL] Sending to: ${to}`);

  // ── Brevo REST API (pas de SDK, juste fetch HTTP) ──
  if (process.env.BREVO_API_KEY) {
    const fetch = (...args) => import('node-fetch').then(m => m.default(...args));
    const senderEmail = process.env.EMAIL_USER || 'noreply@e-team.com';
    const body = JSON.stringify({
      sender:      { name: 'E-Team RH', email: senderEmail },
      to:          [{ email: to }],
      subject:     subject,
      htmlContent: html
    });
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method:  'POST',
      headers: {
        'accept':       'application/json',
        'content-type': 'application/json',
        'api-key':      process.env.BREVO_API_KEY
      },
      body
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || JSON.stringify(data));
    console.log(`[EMAIL] Sent successfully via Brevo: ${to} — ID: ${data.messageId || 'ok'}`);
    return { messageId: data.messageId || 'brevo-ok', accepted: [to] };
  }

  // ── SMTP Gmail (fallback local) ──
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    throw new Error('BREVO_API_KEY ou EMAIL_USER/PASS manquant');
  }
  const transporter = createTransporter();
  await transporter.verify();
  const info = await transporter.sendMail({ from, to, subject, html });
  console.log(`[EMAIL] Sent successfully via SMTP: ${to} — ID: ${info.messageId}`);
  return { messageId: info.messageId, accepted: info.accepted };
}


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


const sendWelcomeEmail = async (email, name, password) => {
  try {
    const transporter = createTransporter();

    const mailOptions = {
      from: `"E-Team RH" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: '🚀 Bienvenue chez E-Team : Vos accès collaborateur',
      html: `
        <div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; max-width: 600px; margin: auto; border: 1px solid #eee; border-radius: 20px; padding: 0; overflow: hidden; color: #1a1a1a; background-color: #ffffff;">
          
          <!-- Header Noir -->
          <div style="background-color: #0A0A0A; padding: 40px; text-align: center;">
            <span style="font-size: 28px; font-weight: bold; color: #CCFF00; letter-spacing: 2px;">E-TEAM</span>
            <p style="color: #ffffff; font-size: 14px; margin-top: 10px; opacity: 0.8;">DEPARTMENT AS A SERVICE</p>
          </div>
          
          <div style="padding: 40px;">
            <h2 style="font-size: 22px; color: #000; margin-top: 0;">Bienvenue dans l'équipe, ${name} ! 🎉</h2>
            
            <p style="font-size: 16px; line-height: 1.6; color: #444;">
              Nous sommes ravis de vous accueillir. Votre compte collaborateur a été configuré par notre agent RH <b>Hera</b>. Vous pouvez dès à présent accéder à votre espace pour gérer vos congés et consulter vos documents.
            </p>
            
            <!-- Box des identifiants -->
            <div style="background-color: #f8f9fa; border: 1px solid #e1e1e1; padding: 25px; border-radius: 12px; margin: 30px 0;">
              <p style="margin: 0 0 15px 0; font-size: 13px; text-transform: uppercase; letter-spacing: 1px; color: #666; font-weight: bold;">Vos accès sécurisés :</p>
              
              <p style="margin: 8px 0; font-size: 15px; color: #333;">
                <b>📧 Email :</b> <span style="color: #000;">${email}</span>
              </p>
              <p style="margin: 8px 0; font-size: 15px; color: #333;">
                <b>🔑 Mot de passe :</b> <span style="color: #000; font-family: monospace; font-size: 18px; background: #eee; padding: 2px 6px; border-radius: 4px;">${password}</span>
              </p>
              
              <div style="text-align: center; margin-top: 25px;">
                <a href="http://localhost:4200/login" 
                   style="display: inline-block; background-color: #0A0A0A; color: #CCFF00; padding: 14px 30px; border-radius: 8px; text-decoration: none; font-weight: bold; font-size: 14px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
                  Se connecter à mon Espace
                </a>
              </div>
            </div>

            <p style="font-size: 13px; color: #888; font-style: italic; text-align: center;">
              Pour votre sécurité, nous vous conseillons de modifier ce mot de passe lors de votre première connexion.
            </p>
          </div>

          <!-- Footer -->
          <div style="background-color: #F4F4F4; padding: 20px; text-align: center; border-top: 1px solid #eee;">
            <p style="margin: 0; color: #999; font-size: 11px;">
              © 2026 E-Team Intelligence RH - Message Automatique<br>
              Besoin d'aide ? Contactez Dexo, votre administrateur système.
            </p>
          </div>
        </div>
      `
    };

    const info = await transporter.sendMail(mailOptions);
    console.log(`✅ MAIL : Bienvenue envoyé avec succès à ${email} (MDP: ${password})`);
    return true;
  } catch (error) { 
    console.error('❌ ERREUR NODEMAILER (Welcome):', error.message); 
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
    const info = await sendEmail({
      from: `"E-Team RH" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: 'Confirmation de réception : Votre candidature chez E-Team',
      html: `
        <div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; max-width: 600px; margin: auto; border: 1px solid #eee; border-radius: 15px; padding: 30px; color: #1a1a1a;">
          <div style="text-align: center; margin-bottom: 25px;">
            <span style="font-size: 22px; font-weight: bold; color: #000; letter-spacing: 1px;">E-TEAM</span>
          </div>
          <h2 style="font-size: 18px; color: #333;">Bonjour ${name},</h2>
          <p style="font-size: 15px; line-height: 1.6; color: #555;">
            Nous vous confirmons avoir bien reçu votre candidature pour rejoindre nos équipes.
          </p>
          <div style="background-color: #f9f9f9; border-left: 4px solid #ccc; padding: 20px; margin: 25px 0;">
            <p style="margin: 0; font-size: 14px; color: #666; line-height: 1.5;">
              <b>Statut actuel :</b> Étude de votre dossier.<br>
              Votre profil est actuellement examiné par notre département RH.
            </p>
          </div>
          <p style="font-size: 15px; line-height: 1.6; color: #555;">
            Si votre profil est retenu, vous recevrez une invitation pour un entretien.
          </p>
          <p style="font-size: 15px; margin-top: 30px; color: #000; font-weight: bold;">Merci de votre intérêt pour E-Team.</p>
          <hr style="border: 0; border-top: 1px solid #eee; margin: 30px 0;">
          <p style="text-align: center; color: #aaa; font-size: 11px;">© 2026 E-Team - Gestion des Talents.</p>
        </div>
      `
    });
    console.log(`[EMAIL] Confirmation sent to: ${email}`);
    return true;
  } catch (e) {
    console.error(`[EMAIL] Confirmation failed to ${email}: ${e.message}`);
    return false;
  }
};
// ✅ RECYCLAGE DE TON ANCIEN MAIL
const sendGroupMeetingInvitation = async (email, details) => {
  try {
    const transporter = createTransporter();
    
    const htmlContent = `
      <div style="font-family: 'Inter', Arial, sans-serif; max-width: 600px; margin: auto; border: 1px solid #e1e1e1; border-radius: 12px; overflow: hidden; color: #333;">
        <div style="background-color: #0A0A0A; padding: 30px; text-align: center;">
          <h1 style="color: #CCFF00; margin: 0; font-size: 24px; letter-spacing: 1px;">BIENVENUE CHEZ E-TEAM</h1>
        </div>
        
        <div style="padding: 30px; line-height: 1.6;">
          <h2 style="color: #000; margin-top: 0;">Félicitations ${details.name} !</h2>
          
          <p>Vous faites officiellement partie de l'aventure E-Team. Pour votre intégration, nous vous invitons à une <b>Session de rencontre avec toute l'équipe</b>.</p>
          
          <p>C'est le moment idéal pour faire connaissance avec vos futurs collègues et découvrir notre environnement de travail.</p>

          <div style="background-color: #F8F9FA; border-left: 4px solid #CCFF00; padding: 20px; margin: 25px 0; border-radius: 8px;">
            <p style="margin: 0; font-weight: bold; color: #000; text-transform: uppercase; font-size: 12px;">📅 Date de rencontre :</p>
            <p style="margin: 5px 0 15px 0; font-size: 16px;">${details.interview_date}</p>

            <p style="margin: 0; font-weight: bold; color: #000; text-transform: uppercase; font-size: 12px;">🔗 Lien de la session d'équipe :</p>
            <p style="margin: 10px 0 0 0;">
              <a href="${details.meeting_link}" 
                 style="background-color: #000; color: #CCFF00; padding: 10px 20px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
                Rejoindre le Meet d'équipe
              </a>
            </p>
          </div>

          <p>Préparez votre plus beau sourire, on a hâte de vous voir !</p>
          
          <p style="margin-bottom: 0;">À très vite,</p>
          <p style="margin-top: 5px; font-weight: bold; color: #A855F7;">Hera, Dexo & Toute la Team</p>
        </div>
      </div>
    `;

    await transporter.sendMail({
      from: `"Hera (E-Team RH)" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: '🚀 Bienvenue ! Votre session de rencontre avec l\'équipe',
      html: htmlContent
    });

    console.log(`📧 MAIL : Bienvenue et Meet collectif envoyé à ${email}`);
    return true;
  } catch (e) { return false; }
};
const sendInterviewInvitation = async (email, details) => {
  try {
    const info = await sendEmail({
      from: `"E-Team RH" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: 'Invitation à votre entretien - E-Team',
      html: `
        <div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; max-width: 600px; margin: auto; color: #1a1a1a; background-color: #ffffff; border: 1px solid #e1e1e1;">
          <div style="background-color: #0A0A0A; padding: 36px; text-align: center;">
            <span style="font-size: 26px; font-weight: bold; color: #CCFF00; letter-spacing: 2px;">E-TEAM</span>
          </div>
          <div style="padding: 40px 36px;">
            <h2 style="font-size: 20px; color: #000; margin-top: 0; font-weight: 600;">Félicitations ${details.name},</h2>
            <p style="font-size: 15px; line-height: 1.7; color: #444;">
              Votre candidature a été analysée et votre profil a obtenu un score de
              <strong style="color: #000;">${details.score}/100</strong>.
              Vous êtes sélectionné(e) pour passer à l'étape suivante du processus de recrutement.
            </p>
            <p style="font-size: 15px; line-height: 1.7; color: #444;">
              Nous vous invitons à un entretien individuel en ligne d'une durée de 10 à 15 minutes.
            </p>
            <div style="background-color: #f8f9fa; border-left: 4px solid #CCFF00; padding: 24px; margin: 28px 0;">
              <p style="margin: 0 0 6px 0; font-weight: bold; color: #000; text-transform: uppercase; font-size: 11px; letter-spacing: 1px;">Date prévue</p>
              <p style="margin: 0 0 24px 0; font-size: 16px; color: #333; font-weight: 500;">${details.interview_date}</p>
              <p style="margin: 0 0 12px 0; font-weight: bold; color: #000; text-transform: uppercase; font-size: 11px; letter-spacing: 1px;">Accéder à votre entretien</p>
              <div style="text-align: center; margin-top: 8px;">
                <a href="${details.meeting_link}"
                   style="display: inline-block; background-color: #CCFF00; color: #000; padding: 14px 32px; text-decoration: none; font-weight: bold; font-size: 15px; letter-spacing: 0.5px;">
                  Démarrer l'entretien
                </a>
              </div>
            </div>
            <div style="border: 1px solid #e8e8e8; padding: 20px; margin-bottom: 28px;">
              <p style="margin: 0 0 12px 0; font-weight: bold; color: #000; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px;">Avant de commencer</p>
              <ul style="margin: 0; padding-left: 18px; color: #555; font-size: 14px; line-height: 2;">
                <li>Autorisez l'accès à votre microphone</li>
                <li>Choisissez un endroit calme</li>
                <li>L'entretien comporte 12 questions en 4 phases</li>
              </ul>
            </div>
            <p style="font-size: 13px; color: #888;">Ce lien est personnel. Ne le partagez pas.</p>
            <p style="margin-bottom: 4px; font-size: 15px; color: #000;">Cordialement,</p>
            <p style="margin-top: 0; font-weight: bold; color: #000;">L'équipe RH — E-Team</p>
          </div>
          <div style="background-color: #f4f4f4; padding: 18px; text-align: center; border-top: 1px solid #eee;">
            <p style="margin: 0; color: #999; font-size: 11px;">© 2026 E-Team — Message automatique</p>
          </div>
        </div>`
    });
    console.log(`[EMAIL] Interview invitation sent to: ${email}`);
    return true;
  } catch (e) {
    console.error(`[EMAIL] Interview invitation failed to ${email}: ${e.message}`);
    return false;
  }
};

const sendOffboardingEmail = async (email, details) => {
  const riskColors = { low: '#28a745', medium: '#ffc107', high: '#dc3545' };
  const riskColor = riskColors[details.risk_level] || '#6c757d';
  try {
    const transporter = createTransporter();
    await transporter.sendMail({
      from: `"Hera RH - E-Team" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: `👋 Confirmation de votre départ - E-Team`,
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: auto; border: 1px solid #eee; padding: 25px; border-radius: 12px;">
          <h2 style="color: #000;">Bonjour ${details.employee_name},</h2>
          <p>Nous avons bien reçu votre lettre de démission et prenons acte de votre décision.</p>

          <div style="background-color: #f8f9fa; padding: 15px; border-radius: 8px; margin: 20px 0;">
            <p><b>📅 Dernier jour :</b> ${details.last_day || 'À confirmer'}</p>
            <p><b>📋 Préavis :</b> ${details.notice_period_days ? details.notice_period_days + ' jours' : 'À définir'}</p>
          </div>

          <p>${details.reply}</p>

          ${details.exit_interview_recommended ? `
          <div style="background-color: #e8f4fd; padding: 15px; border-radius: 8px; margin: 20px 0;">
            <p>🎤 <b>Entretien de départ :</b> Nous vous contacterons prochainement pour organiser un entretien de départ afin de recueillir vos retours.</p>
          </div>` : ''}

          <p>Nous vous souhaitons le meilleur pour la suite.<br><b>L'équipe RH E-Team — Hera IA</b></p>
        </div>`
    });
    console.log(`📧 MAIL Offboarding envoyé à ${email}`);
    return true;
  } catch (e) { console.error('Erreur sendOffboardingEmail:', e); return false; }
};
//mail offboarding 
// ✅ NOUVELLE FONCTION : Convocation envoyée à l'employé
// ✅ À AJOUTER : Convocation officielle signée par HERA
const sendHeraConvocation = async (email, details) => {
  try {
    const transporter = createTransporter();
    
    // ✅ SÉCURITÉ : Si Remote mais pas de lien, on en crée un basé sur le nom
    const finalLink = details.meeting_link || `https://meet.jit.si/ETeam_Meeting_${details.name.replace(/\s+/g, '_')}`;

    // ✅ LOGIQUE DE BLOC : On prépare le HTML pour le lieu ou le lien
    let locationHTML = "";
    if (details.mode === 'Remote') {
      locationHTML = `
        <p style="margin: 10px 0; color: #ffffff;">🔗 <b>Lien:</b> 
          <a href="${finalLink}" target="_blank" style="color: #CDFF00; text-decoration: underline; font-weight: bold;">
            Cliquer ici pour rejoindre (Jitsi)
          </a>
        </p>`;
    } else {
      locationHTML = `
        <p style="margin: 10px 0; color: #ffffff;">📍 <b>Lieu :</b> 
          <span style="color: #CDFF00; font-weight: bold;">Siège E-Team - 12 rue de l'IA, Paris</span>
        </p>`;
    }

    const mailOptions = {
      from: `"Hera (E-Team RH)" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: `✨ Confirmation de rendez-vous : ${details.type}`,
      html: `
        <div style="font-family: 'Inter', Arial, sans-serif; max-width: 600px; margin: auto; border-radius: 20px; overflow: hidden; background-color: #0A0A0A; color: #ffffff; border: 1px solid #333;">
          <div style="padding: 40px; text-align: center; background: linear-gradient(180deg, #1a1a1a 0%, #0A0A0A 100%);">
            <div style="font-size: 28px; font-weight: bold; color: #CCFF00; letter-spacing: 2px;">E-TEAM</div>
            <p style="font-size: 12px; color: #888; margin-top: 5px; text-transform: uppercase;">Service des Ressources Humaines</p>
          </div>

          <div style="padding: 40px; background-color: #ffffff; color: #1a1a1a;">
            <h2 style="margin-top: 0; font-size: 20px;">Bonjour ${details.name},</h2>
            <p style="font-size: 15px; line-height: 1.6; color: #444;">
              Votre demande de <b>${details.type}</b> a été traitée. Voici les détails de votre rendez-vous :
            </p>

            <div style="background-color: #0A0A0A; color: #ffffff; padding: 25px; border-radius: 15px; margin: 30px 0; border-left: 6px solid #CCFF00;">
              <p style="margin: 0 0 10px 0; font-size: 12px; text-transform: uppercase; color: #CCFF00; font-weight: bold; letter-spacing: 1px;">Détails du créneau</p>
              <p style="margin: 0; font-size: 18px; font-weight: bold;">${details.date}</p>
              <div style="margin-top: 15px; font-size: 14px;">
                ${locationHTML} <!-- ✅ Insertion propre du lien ou de l'adresse -->
              </div>
            </div>

            <p style="font-size: 14px; line-height: 1.6; color: #666;">
              ${details.mode === 'Remote' 
                ? "Il vous suffit de cliquer sur le lien jaune ci-dessus au moment du rendez-vous." 
                : "Merci de vous présenter à l'accueil muni d'une pièce d'identité."}
            </p>

            <div style="margin-top: 40px;">
              <p style="margin-bottom: 0; font-weight: bold;">Hera</p>
              <p style="margin-top: 5px; font-size: 12px; color: #888;">Votre Responsable RH Digitale</p>
            </div>
          </div>
        </div>`
    };

    await transporter.sendMail(mailOptions);
    return true;
  } catch (e) { return false; }
};

// ✅ AJOUTE CETTE FONCTION TOUT EN BAS DE utils/emailService.js
// ✅ 1. Définition de la fonction comme une constante (comme les autres)
const sendHeraDocumentEmail = async (toEmail, docData) => {
  try {
    console.log('[HERA] Préparation email pour:', toEmail);
    console.log('[HERA] Document:', docData.type);
    console.log('[HERA] PDF:', docData.pdfFilename);

    const transporter = createTransporter();

    // Composer le message selon le type de document
    let subject, htmlContent;

    if (docData.type === "Attestation de Travail") {
      subject = `Votre ${docData.type} - E-TEAM`;
      htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { 
              font-family: 'Helvetica Neue', Arial, sans-serif; 
              line-height: 1.6; 
              color: #0A0A0A; 
              margin: 0;
              padding: 0;
              background-color: #FFFFFF;
            }
            .container { 
              max-width: 600px; 
              margin: 0 auto; 
              padding: 0;
              background-color: #FFFFFF;
            }
            .header { 
              background-color: #0A0A0A;
              color: #FFFFFF; 
              padding: 40px 30px; 
              text-align: center;
              border-bottom: 4px solid #CCFF00;
            }
            .header h1 {
              margin: 0;
              font-size: 26px;
              font-weight: 700;
              letter-spacing: 0.5px;
            }
            .header p {
              margin: 10px 0 0 0;
              font-size: 14px;
              color: #CCFF00;
              font-weight: 500;
            }
            .content { 
              background: #FFFFFF; 
              padding: 40px 30px; 
            }
            .content h2 {
              color: #0A0A0A;
              margin-top: 0;
              font-size: 20px;
              font-weight: 600;
            }
            .content p {
              margin: 15px 0;
              color: #0A0A0A;
              font-size: 15px;
            }
            .info-box {
              background: #F5F5F5;
              border-left: 4px solid #CCFF00;
              padding: 20px;
              margin: 25px 0;
              border-radius: 4px;
            }
            .info-box strong {
              color: #0A0A0A;
              font-weight: 600;
            }
            .highlight {
              color: #0A0A0A;
              font-weight: 600;
            }
            .signature {
              margin-top: 35px;
              padding-top: 25px;
              border-top: 2px solid #F5F5F5;
            }
            .signature strong {
              color: #0A0A0A;
              font-size: 16px;
            }
            .signature em {
              color: #666666;
              font-style: normal;
              font-size: 13px;
            }
            .footer { 
              background-color: #0A0A0A;
              color: #FFFFFF;
              text-align: center; 
              padding: 25px 30px;
              font-size: 12px;
            }
            .footer p {
              margin: 5px 0;
              color: #CCCCCC;
            }
            .lime-accent {
              color: #CCFF00;
              font-weight: 600;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>MESSAGE DE HERA</h1>
              <p>Agent RH Intelligence Artificielle</p>
            </div>
            <div class="content">
              <h2>Bonjour ${docData.name},</h2>
              <p>Votre <span class="highlight">${docData.type}</span> a été générée par Dexo et est maintenant disponible.</p>
              ${docData.details.reason ? `
              <div class="info-box">
                <strong>Motif de la demande :</strong> ${docData.details.reason}
              </div>
              ` : ''}
              <p>Le document officiel est joint à cet email au format PDF.</p>
              <p>Cette attestation peut être utilisée pour toutes vos démarches administratives et légales.</p>
              <div class="signature">
                <p>Cordialement,</p>
                <p><strong>Hera</strong></p>
                <p><em>Agent RH IA - E-TEAM</em></p>
              </div>
            </div>
            <div class="footer">
              <p>Email automatique envoyé par <span class="lime-accent">Hera</span></p>
              <p>E-TEAM © 2026 - Tous droits réservés</p>
            </div>
          </div>
        </body>
        </html>
      `;
    } else if (docData.type === "Bulletin de Paie") {
      subject = `Votre ${docData.type} - ${docData.details.month}/${docData.details.year}`;
      htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { 
              font-family: 'Helvetica Neue', Arial, sans-serif; 
              line-height: 1.6; 
              color: #0A0A0A; 
              margin: 0;
              padding: 0;
              background-color: #FFFFFF;
            }
            .container { 
              max-width: 600px; 
              margin: 0 auto; 
              padding: 0;
              background-color: #FFFFFF;
            }
            .header { 
              background-color: #0A0A0A;
              color: #FFFFFF; 
              padding: 40px 30px; 
              text-align: center;
              border-bottom: 4px solid #CCFF00;
            }
            .header h1 {
              margin: 0;
              font-size: 26px;
              font-weight: 700;
              letter-spacing: 0.5px;
            }
            .header p {
              margin: 10px 0 0 0;
              font-size: 14px;
              color: #CCFF00;
              font-weight: 500;
            }
            .content { 
              background: #FFFFFF; 
              padding: 40px 30px; 
            }
            .content h2 {
              color: #0A0A0A;
              margin-top: 0;
              font-size: 20px;
              font-weight: 600;
            }
            .content p {
              margin: 15px 0;
              color: #0A0A0A;
              font-size: 15px;
            }
            .period-box {
              background: #F5F5F5;
              border: 2px solid #CCFF00;
              padding: 20px;
              margin: 25px 0;
              border-radius: 4px;
              text-align: center;
            }
            .period-box strong {
              color: #0A0A0A;
              font-size: 18px;
              font-weight: 700;
            }
            .warning-box {
              background: #FFF9E6;
              border-left: 4px solid #CCFF00;
              padding: 20px;
              margin: 25px 0;
              border-radius: 4px;
            }
            .warning-box strong {
              color: #0A0A0A;
              font-weight: 600;
            }
            .highlight {
              color: #0A0A0A;
              font-weight: 600;
            }
            .signature {
              margin-top: 35px;
              padding-top: 25px;
              border-top: 2px solid #F5F5F5;
            }
            .signature strong {
              color: #0A0A0A;
              font-size: 16px;
            }
            .signature em {
              color: #666666;
              font-style: normal;
              font-size: 13px;
            }
            .footer { 
              background-color: #0A0A0A;
              color: #FFFFFF;
              text-align: center; 
              padding: 25px 30px;
              font-size: 12px;
            }
            .footer p {
              margin: 5px 0;
              color: #CCCCCC;
            }
            .lime-accent {
              color: #CCFF00;
              font-weight: 600;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>MESSAGE DE HERA</h1>
              <p>Agent RH Intelligence Artificielle</p>
            </div>
            <div class="content">
              <h2>Bonjour ${docData.name},</h2>
              <p>Votre <span class="highlight">${docData.type}</span> est maintenant disponible.</p>
              <div class="period-box">
                <strong>Période : ${docData.details.month}/${docData.details.year}</strong>
              </div>
              <p>Le document est joint à cet email au format PDF.</p>
              <div class="warning-box">
                <strong>Document confidentiel</strong> - Conservez ce bulletin précieusement pour vos archives personnelles.
              </div>
              <p>Pour toute question concernant votre bulletin de paie, veuillez contacter le service des Ressources Humaines.</p>
              <div class="signature">
                <p>Cordialement,</p>
                <p><strong>Hera</strong></p>
                <p><em>Agent RH IA - E-TEAM</em></p>
              </div>
            </div>
            <div class="footer">
              <p>Email automatique envoyé par <span class="lime-accent">Hera</span></p>
              <p>E-TEAM © 2026 - Tous droits réservés</p>
            </div>
          </div>
        </body>
        </html>
      `;
    }

    // Envoyer l'email avec le PDF en pièce jointe
    const mailOptions = {
      from: '"Hera - Agent RH IA E-TEAM" <' + process.env.EMAIL_USER + '>',
      to: toEmail,
      subject: subject,
      html: htmlContent,
      attachments: [
        {
          filename: docData.pdfFilename,
          path: docData.pdfPath
        }
      ]
    };

    console.log('[HERA] Envoi en cours...');
    
    const info = await transporter.sendMail(mailOptions);
    
    console.log('[HERA] Email envoyé avec succès à', toEmail);
    console.log('[HERA] Message ID:', info.messageId);
    console.log('[HERA] Document attaché:', docData.pdfFilename);

    return true;
  } catch (error) {
    console.error('[HERA] Erreur envoi email:', error.message);
    console.error('[HERA] Stack:', error.stack);
    throw error;
  }
};

// ✅ 2. Export global unique (Regroupe tout ici)
module.exports = {
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendWelcomeEmail,
  sendLeaveNotification,
  sendStaffingAlert,
  sendCandidacyConfirmation,
  sendGroupMeetingInvitation,
  sendInterviewInvitation,
  sendOffboardingEmail,
  sendHeraConvocation,
  sendHeraDocumentEmail // Ajouté ici
};