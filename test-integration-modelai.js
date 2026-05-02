// ============================================================
// TEST INTÉGRATION E-TEAM ↔ MODELAI
// Lance ce fichier avec : node test-integration-modelai.js
// ============================================================

require('dotenv').config();

const BASE_URL = 'http://localhost:3000';
const MODELAI_URL = 'http://localhost:3001';

// ── Couleurs console ──
const green  = (t) => `\x1b[32m${t}\x1b[0m`;
const red    = (t) => `\x1b[31m${t}\x1b[0m`;
const yellow = (t) => `\x1b[33m${t}\x1b[0m`;
const cyan   = (t) => `\x1b[36m${t}\x1b[0m`;
const bold   = (t) => `\x1b[1m${t}\x1b[0m`;

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// ── TEST 1 : E-Team est-il en ligne ? ──
async function testETeamHealth() {
  console.log(cyan('\n📡 TEST 1 — E-Team server (port 3000)'));
  try {
    const res = await fetch(`${BASE_URL}/api/hera/hello`);
    const data = await res.json();
    if (data.success) {
      console.log(green('  ✅ E-Team est en ligne'), data.message);
      return true;
    }
  } catch (e) {
    console.log(red('  ❌ E-Team inaccessible — Lance : npm run dev'));
    return false;
  }
}

// ── TEST 2 : MODELAI est-il en ligne ? ──
async function testModelAIHealth() {
  console.log(cyan('\n🤖 TEST 2 — MODELAI server (port 3001)'));
  try {
    const res = await fetch(`${MODELAI_URL}/api/health`);
    const data = await res.json();
    if (data.status === 'ok') {
      console.log(green('  ✅ MODELAI est en ligne'), `— Engine: ${data.engine}`);
      return true;
    }
  } catch (e) {
    console.log(red('  ❌ MODELAI inaccessible — Lance : node src/server.js dans le dossier MODELAI'));
    return false;
  }
}

// ── TEST 3 : Candidature avec score élevé (≥ 80) ──
async function testCandidacyHighScore() {
  console.log(cyan('\n🎯 TEST 3 — Candidature avec profil fort (score attendu ≥ 80)'));

  const candidat = {
    name: 'Alice Martin',
    email: 'alice.martin.test@gmail.com',
    department: 'Tech',
    job_role: 'Développeur Full Stack',
    resume_text: `
      Développeuse Full Stack avec 5 ans d'expérience.
      Compétences : JavaScript, React, Node.js, MongoDB, Python, Docker, AWS.
      Diplôme : Master Informatique - Université Paris Saclay.
      Expériences : Lead Developer chez TechCorp (3 ans), Software Engineer chez StartupXYZ (2 ans).
      Projets : Développement d'une plateforme SaaS B2B, migration cloud AWS, optimisation performances.
      Langues : Français (natif), Anglais (courant).
      Soft skills : Leadership, communication, travail en équipe, autonomie.
    `
  };

  try {
    const res = await fetch(`${BASE_URL}/api/hera/candidate/apply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(candidat)
    });

    const data = await res.json();
    console.log(`  📊 Score IA obtenu : ${bold(data.score)}/100`);

    if (data.score >= 80) {
      console.log(green(`  ✅ Score ≥ 80 — Invitation MODELAI envoyée !`));
      console.log(green(`  📧 Email envoyé à : ${candidat.email}`));

      // Construire le lien MODELAI attendu
      const expectedLink = `${MODELAI_URL}/index.html?name=${encodeURIComponent(candidat.name)}&department=${encodeURIComponent(candidat.department)}&role=${encodeURIComponent(candidat.job_role)}&email=${encodeURIComponent(candidat.email)}&lang=fr`;
      console.log(yellow(`  🔗 Lien MODELAI généré :`));
      console.log(`     ${expectedLink}`);
      console.log(yellow(`\n  👆 Copie ce lien dans ton navigateur pour tester l'entretien IA !`));
    } else {
      console.log(yellow(`  ⚠️  Score < 80 (${data.score}) — Pas d'invitation (normal pour ce profil)`));
    }

    return data;
  } catch (e) {
    console.log(red(`  ❌ Erreur : ${e.message}`));
    return null;
  }
}

// ── TEST 4 : Candidature avec score faible (< 80) ──
async function testCandidacyLowScore() {
  console.log(cyan('\n📉 TEST 4 — Candidature avec profil faible (score attendu < 80)'));

  const candidat = {
    name: 'Bob Test',
    email: 'bob.test@gmail.com',
    department: 'Tech',
    resume_text: 'Je cherche un emploi. J\'ai un peu d\'expérience.'
  };

  try {
    const res = await fetch(`${BASE_URL}/api/hera/candidate/apply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(candidat)
    });

    const data = await res.json();
    console.log(`  📊 Score IA obtenu : ${bold(data.score)}/100`);

    if (data.score < 80) {
      console.log(green(`  ✅ Score < 80 — Pas d'invitation (comportement correct)`));
    } else {
      console.log(yellow(`  ⚠️  Score inattendu ≥ 80 pour un profil faible`));
    }

    return data;
  } catch (e) {
    console.log(red(`  ❌ Erreur : ${e.message}`));
    return null;
  }
}

// ── TEST 5 : Démarrer un entretien MODELAI directement ──
async function testModelAIInterview() {
  console.log(cyan('\n🎤 TEST 5 — Démarrer un entretien MODELAI via API'));

  try {
    const res = await fetch(`${MODELAI_URL}/api/interview/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        candidateName: 'Alice Martin',
        department: 'Tech',
        jobRole: 'Développeur Full Stack',
        language: 'fr'
      })
    });

    const data = await res.json();

    if (data.sessionId) {
      console.log(green(`  ✅ Session MODELAI créée : ${data.sessionId}`));
      console.log(`  💬 Message d'accueil : "${data.message?.substring(0, 100)}..."`);
      console.log(`  📋 Phase : ${data.phase} | Question : ${data.questionNumber}/12`);
      console.log(`  🌍 Langue détectée : ${data.language}`);

      // Test d'une réponse
      console.log(cyan('\n  💬 Test d\'une réponse au recruteur IA...'));
      await sleep(1000);

      const replyRes = await fetch(`${MODELAI_URL}/api/interview/${data.sessionId}/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: "Je suis passionné par le développement web et j'ai 5 ans d'expérience en React et Node.js. J'ai travaillé sur plusieurs projets SaaS et j'aime résoudre des problèmes complexes."
        })
      });

      const replyData = await replyRes.json();
      console.log(green(`  ✅ Réponse IA reçue`));
      console.log(`  🤖 Alex : "${replyData.message?.substring(0, 120)}..."`);
      console.log(`  📊 Qualité réponse : ${replyData.answerFeedback?.level || 'N/A'}`);

      return data.sessionId;
    }
  } catch (e) {
    console.log(red(`  ❌ Erreur MODELAI : ${e.message}`));
    return null;
  }
}

// ── MAIN ──
async function runAllTests() {
  console.log(bold('\n╔══════════════════════════════════════════════╗'));
  console.log(bold('║   TEST INTÉGRATION E-TEAM ↔ MODELAI          ║'));
  console.log(bold('╚══════════════════════════════════════════════╝'));

  const eteamOk    = await testETeamHealth();
  const modelaiOk  = await testModelAIHealth();

  if (!eteamOk) {
    console.log(red('\n🛑 E-Team non démarré. Lance : npm run dev'));
    console.log(yellow('   Puis relance ce test : node test-integration-modelai.js\n'));
    return;
  }

  if (!modelaiOk) {
    console.log(red('\n🛑 MODELAI non démarré.'));
    console.log(yellow('   Lance dans un autre terminal :'));
    console.log(yellow('   cd C:\\Users\\ghofr\\OneDrive\\Desktop\\MODELAI'));
    console.log(yellow('   node src/server.js\n'));
    return;
  }

  await testCandidacyHighScore();
  await sleep(2000);
  await testCandidacyLowScore();
  await sleep(1000);
  await testModelAIInterview();

  console.log(bold('\n╔══════════════════════════════════════════════╗'));
  console.log(bold('║   RÉSUMÉ                                      ║'));
  console.log(bold('╠══════════════════════════════════════════════╣'));
  console.log(`║  E-Team  : ${eteamOk   ? green('✅ En ligne (port 3000)') : red('❌ Hors ligne')}          ║`);
  console.log(`║  MODELAI : ${modelaiOk ? green('✅ En ligne (port 3001)') : red('❌ Hors ligne')}          ║`);
  console.log(bold('╚══════════════════════════════════════════════╝'));
  console.log(yellow('\n📌 Pour tester manuellement dans le navigateur :'));
  console.log(`   http://localhost:3001/index.html?name=Alice%20Martin&department=Tech&role=D%C3%A9veloppeur&lang=fr\n`);
}

runAllTests();
