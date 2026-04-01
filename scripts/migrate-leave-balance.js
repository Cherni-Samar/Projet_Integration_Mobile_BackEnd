const mongoose = require('mongoose');

async function migrate() {
  try {
    // Connexion (sans les options obsolètes)
    await mongoose.connect('mongodb://localhost:27017/e-team');
    console.log('✅ Connecté à MongoDB\n');

    // Trouve l'employé
    const employee = await mongoose.connection.db
      .collection('employees')
      .findOne({ email: 'eya.mosbahi@esprit.tn' });

    if (!employee) {
      console.log('❌ Employé non trouvé');
      await mongoose.connection.close();
      process.exit(1);
    }

    console.log('📊 AVANT :');
    console.log('   leave_balance:', employee.leave_balance);

    // Vérifie si déjà migré
    if (typeof employee.leave_balance === 'object' && employee.leave_balance.annual !== undefined) {
      console.log('\n⏭️  Déjà migré ! Rien à faire.\n');
      await mongoose.connection.close();
      process.exit(0);
    }

    // Ancien solde
    const oldBalance = typeof employee.leave_balance === 'number' 
      ? employee.leave_balance 
      : 60;

    // Mise à jour
    const result = await mongoose.connection.db
      .collection('employees')
      .updateOne(
        { _id: employee._id },
        {
          $set: {
            leave_balance: {
              annual: oldBalance,  // Garde les 60 jours en annual
              sick: 10,
              urgent: 3
            },
            leave_balance_used: {
              annual: 0,
              sick: 0,
              urgent: 0
            },
            leave_balance_year: 2025,
            updated_at: new Date()
          }
        }
      );

    if (result.modifiedCount === 1) {
      console.log('\n✅ APRÈS :');
      console.log('   leave_balance: {');
      console.log(`     annual: ${oldBalance},`);
      console.log('     sick: 10,');
      console.log('     urgent: 3');
      console.log('   }');
      console.log('   leave_balance_used: { annual: 0, sick: 0, urgent: 0 }');
      console.log('   leave_balance_year: 2025');
      console.log('\n✅ Migration terminée avec succès !\n');
    } else {
      console.log('\n⚠️  Aucune modification effectuée\n');
    }

    await mongoose.connection.close();
    process.exit(0);

  } catch (error) {
    console.error('\n❌ ERREUR:', error.message);
    console.error(error.stack);
    await mongoose.connection.close();
    process.exit(1);
  }
}

migrate();