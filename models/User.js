const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: [true, 'Email requis'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [
        /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/,
        'Email invalide'
      ]
    },
    password: {
      type: String,
      required: [true, 'Mot de passe requis'],
      minlength: [6, 'Le mot de passe doit contenir au moins 6 caractères']
    },
    name: {
      type: String,
      trim: true,
      default: null
    },

    // --- NOUVEAUX CHAMPS STARTUP E-TEAM ---

    // Type d'entreprise (Rempli lors de l'onboarding pour la recommandation)
    businessType: {
      type: String,
      enum: ['Marketing', 'Retail', 'Tech', 'Healthcare', 'Consulting', null],
      default: null
    },

    // Système de Crédits (Usage Credits)
    credits: {
      type: Number,
      default: 10 // On offre 10 crédits à l'inscription pour le "Free Trial"
    },

    // Système de Recrutement (Liste des agents activés par l'utilisateur)
    // Exemple: ['finance', 'planning']
    activeAgents: [{
      type: String
    }],

    // Statistiques pour le Dashboard
    tasksCompletedCount: {
      type: Number,
      default: 0
    },

    // Gestion de l'abonnement (Membership)
    subscriptionStatus: {
      type: String,
      enum: ['none', 'free_trial', 'active', 'expired'],
      default: 'free_trial'
    },
    
    stripeCustomerId: {
      type: String,
      default: null
    },

    // --- CHAMPS DE SÉCURITÉ ET VÉRIFICATION ---
    
    isEmailVerified: {
      type: Boolean,
      default: false
    },
    emailVerificationCode: {
      type: String,
      default: null
    },
    emailVerificationExpires: {
      type: Date,
      default: null
    },
    resetPasswordCode: {
      type: String,
      default: null
    },
    resetPasswordExpires: {
      type: Date,
      default: null
    },
    lastLoginAt: {
      type: Date,
      default: null
    }
  },
  {
    timestamps: true // Crée automatiquement createdAt et updatedAt
  }
);

/**
 * Méthode pour nettoyer l'objet JSON avant de l'envoyer au Frontend (Flutter)
 * Supprime les mots de passe et les codes de sécurité
 */
userSchema.methods.toJSON = function () {
  const user = this.toObject();
  delete user.password;
  delete user.resetPasswordCode;
  delete user.resetPasswordExpires;
  delete user.emailVerificationCode;
  delete user.emailVerificationExpires;
  return user;
};

module.exports = mongoose.model('User', userSchema);