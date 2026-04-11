require('dotenv').config();
const mongoose = require('mongoose');

mongoose.connect(process.env.MONGODB_URI).then(async () => {
  const db = mongoose.connection.db;

  // 1. Supprimer toutes les alertes staffing
  const alerts = await db.collection('heraactions').deleteMany({ action_type: 'absence_alert' });
  console.log(`🗑️  ${alerts.deletedCount} alertes staffing supprimées`);

  // 2. Supprimer les job offers de recrutement
  const jobs = await db.collection('joboffers').deleteMany({ document_type: 'opening' });
  console.log(`🗑️  ${jobs.deletedCount} job offers supprimées`);

  // 3. Supprimer les emails de recrutement dans InboxEmail
  const emails = await db.collection('inboxemails').deleteMany({ category: { $in: ['recruitment', 'recrutement'] } });
  console.log(`🗑️  ${emails.deletedCount} emails de recrutement supprimés`);

  console.log('\n✅ Tout est propre. Redémarre le serveur (node app.js) pour le scénario complet !');
  await mongoose.disconnect();
});
