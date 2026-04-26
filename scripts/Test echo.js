// =============================================================
//  FICHIER DE TEST - Agent Echo
//  Lance avec : node test_echo.js
// =============================================================

const { analyserMessage } = require('./agents/Echoagent');

// Couleurs pour le terminal
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m',
};

const log = (color, ...args) => console.log(color, ...args, colors.reset);

async function runTests() {
  console.log('\n' + '='.repeat(60));
  log(colors.bold + colors.cyan, '🤖 TEST DE L\'AGENT ECHO');
  console.log('='.repeat(60) + '\n');

  const testMessages = [
    {
      label: "🔴 Test SPAM",
      message: "FÉLICITATIONS !!! Vous avez GAGNÉ 50.000€ ! Cliquez ici MAINTENANT pour réclamer votre prix : bit.ly/gain-argent-facile"
    },
    {
      label: "🚨 Test CRITIQUE",
      message: "URGENT - Le serveur de production est tombé en panne à 14h30. Tous les clients ne peuvent plus accéder à l'application. Besoin d'une intervention immédiate de l'équipe DevOps."
    },
    {
      label: "📋 Test NORMALE",
      message: "Bonjour équipe, je voulais vous rappeler que notre réunion hebdomadaire est prévue vendredi à 10h. N'oubliez pas de préparer vos points d'avancement. Merci !"
    },
    {
      label: "📝 Test LONG (résumé)",
      message: `Bonjour à tous,

      Suite à notre réunion de jeudi dernier concernant le nouveau projet CRM, voici un récapitulatif de ce qui a été décidé :

      Premièrement, nous avons validé le choix technologique : nous allons utiliser Salesforce pour la gestion des clients existants et HubSpot pour les nouveaux prospects. L'intégration entre les deux systèmes sera gérée par l'équipe IT avec l'aide d'un consultant externe.

      Deuxièmement, concernant le budget, un montant de 150,000 DT a été alloué pour le Q1. Marie-Claire du département Finance a confirmé que les fonds sont disponibles. La répartition sera : 60% pour les licences logicielles, 30% pour la formation et 10% pour les imprévus.

      Troisièmement, le planning prévisionnel est le suivant : installation et configuration en janvier, formation des équipes en février, déploiement progressif en mars. Karim sera le chef de projet et Sonia sera la référente technique.

      Quatrièmement, une réunion de suivi est planifiée le premier lundi de chaque mois. La prochaine est donc le 6 janvier à 9h dans la salle de conférence B.

      N'hésitez pas à me contacter pour toute question.
      Cordialement, Ahmed`
    }
  ];

  for (const test of testMessages) {
    log(colors.yellow, `\n${'─'.repeat(50)}`);
    log(colors.bold, test.label);
    console.log(`Message : "${test.message.substring(0, 80)}..."`);
    log(colors.yellow, `${'─'.repeat(50)}`);

    try {
      const resultat = await analyserMessage(test.message);
      if (resultat.success) {
        log(colors.green, '✅ Analyse réussie :');
        console.log(resultat.analyse);
      } else {
        log(colors.red, '❌ Erreur :', resultat.error);
      }
    } catch (err) {
      log(colors.red, '❌ Exception :', err.message);
    }
  }

  console.log('\n' + '='.repeat(60));
  log(colors.green + colors.bold, '✅ Tests terminés !');
  console.log('='.repeat(60) + '\n');
}

// Vérifier que OPENAI_API_KEY est défini
require('dotenv').config();
if (!process.env.OPENAI_API_KEY) {
  log(colors.red, '❌ ERREUR : OPENAI_API_KEY manquant dans le fichier .env');
  log(colors.yellow, '💡 Ajoute cette ligne dans ton .env : OPENAI_API_KEY=sk-...');
  process.exit(1);
}

runTests().catch(console.error);