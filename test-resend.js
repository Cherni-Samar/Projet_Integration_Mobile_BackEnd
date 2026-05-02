require('dotenv').config();
const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);

// ⚠️ En mode test Resend, on ne peut envoyer qu'à l'adresse du compte
// Adresse du compte Resend détectée : hammemi.ghofrane@esprit.tn
const TEST_EMAIL = 'hammemi.ghofrane@esprit.tn';

async function test() {
  console.log('🔑 Clé Resend:', process.env.RESEND_API_KEY ? process.env.RESEND_API_KEY.substring(0, 15) + '...' : 'MANQUANTE');
  console.log('📧 Envoi vers:', TEST_EMAIL);

  try {
    const result = await resend.emails.send({
      from: 'E-Team RH <onboarding@resend.dev>',
      to: TEST_EMAIL,
      subject: '✅ Test Resend — E-Team fonctionne sur Render',
      html: `
        <div style="font-family:sans-serif;padding:25px;border:3px solid #CCFF00;border-radius:12px;max-width:500px;">
          <h2 style="color:#000;">🎉 Resend fonctionne !</h2>
          <p>Le système email de E-Team est maintenant opérationnel sur Render.</p>
          <p>Les candidats recevront leurs emails correctement.</p>
          <p style="color:#888;font-size:12px;">Test — ${new Date().toLocaleString('fr-FR')}</p>
        </div>
      `
    });

    if (result.error) {
      console.log('❌ ERREUR Resend:', JSON.stringify(result.error));
    } else {
      console.log('✅ EMAIL ENVOYÉ via Resend !');
      console.log('   ID:', result.data.id);
      console.log('   → Vérifie ta boite mail :', TEST_EMAIL);
    }
  } catch (e) {
    console.log('❌ Exception:', e.message);
  }
}

test();
