require('dotenv').config();
const mongoose = require('mongoose');

mongoose.connect(process.env.MONGODB_URI).then(async () => {
  console.log('✅ Connecté à MongoDB');
  
  const db = mongoose.connection.db;
  
  // 1. Vérifier les documents HeraAction avec created_at invalide
  const allActions = await db.collection('heraactions').find({}).toArray();
  console.log('\n📋 Total HeraActions:', allActions.length);
  
  const badActions = allActions.filter(a => !(a.created_at instanceof Date));
  console.log('⚠️  HeraActions avec created_at invalide:', badActions.length);
  if (badActions.length > 0) {
    for (const b of badActions.slice(0, 5)) {
      console.log('  ID:', b._id, 'type:', b.action_type, 'created_at:', b.created_at, 'typeof:', typeof b.created_at);
    }
  }

  // 2. Vérifier les effectifs par département
  const Employee = require('./models/Employee');
  const DEPTS = ['Tech', 'Design', 'Marketing', 'RH', 'Finance', 'Support'];
  const LIMITS = { Tech: 20, Design: 10, Marketing: 15, RH: 5, Finance: 8, Support: 12 };
  
  console.log('\n📊 Effectifs par département:');
  for (const d of DEPTS) {
    const count = await Employee.countDocuments({ department: d, status: 'active' });
    const seuil = Math.floor(LIMITS[d] * 0.8);
    const sousEffectif = count < seuil;
    console.log(`  ${d}: ${count}/${LIMITS[d]} (seuil=${seuil}) → ${sousEffectif ? '🔴 SOUS-EFFECTIF' : '🟢 OK'}`);
  }

  // 3. Vérifier les alertes d'aujourd'hui
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  try {
    const todayAlerts = await db.collection('heraactions').find({
      action_type: 'absence_alert',
      created_at: { $gte: today }
    }).toArray();
    console.log('\n📧 Alertes envoyées aujourd\'hui:', todayAlerts.length);
    for (const a of todayAlerts) {
      console.log('  -', a.details?.department, 'à', a.created_at);
    }
  } catch (err) {
    console.error('❌ Erreur requête alertes:', err.message);
  }

  await mongoose.disconnect();
  console.log('\n✅ Terminé');
});
