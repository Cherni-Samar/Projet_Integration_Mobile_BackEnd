require('dotenv').config();
const groqAgent = require('./services/groqAgent');

async function test() {
  console.log('🧪 Test Groq Agent...\n');
  
  if (!process.env.GROQ_API_KEY) {
    console.error('❌ GROQ_API_KEY manquante dans .env');
    console.log('Ajoute cette ligne dans .env:');
    console.log('GROQ_API_KEY=gsk_ta_clé_ici');
    return;
  }
  
  console.log('✅ Clé API Groq trouvée');
  console.log('📝 Analyse en cours...\n');
  
  console.log('1️⃣ Test message normal:');
  const normal = await groqAgent.analyze("Bonjour, comment puis-je vous aider aujourd'hui ?");
  console.log('Résultat:', normal);
  console.log('');
  
  console.log('2️⃣ Test message spam:');
  const spam = await groqAgent.analyze("Gagnez 10000€ par jour ! Cliquez ici !");
  console.log('Résultat:', spam);
  console.log('');
  
  console.log('3️⃣ Test message promotion:');
  const promo = await groqAgent.analyze("Profitez de notre offre spéciale -50% sur tous les produits");
  console.log('Résultat:', promo);
  
  console.log('\n✅ Tests terminés');
}

test().catch(console.error);
