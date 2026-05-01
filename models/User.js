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
   // ✅ NOUVEAU : Vision stratégique de l'entreprise (Onboarding)
    companyVision: {
      type: String,
      default: ""
    },

    // ✅ Vérifier si l'utilisateur a complété l'onboarding DEXO
    onboardingCompleted: {
      type: Boolean,
      default: false
    },

    // ✅ NOUVEAU : Réglages des effectifs cibles (Vision du CEO)
    // C'est ici que Dexo enregistre les chiffres du chat
    workforceSettings: [
      {
        department: { type: String, required: true }, // 'Tech', 'Design', 'Marketing', etc.
        targetCount: { type: Number, default: 0 },    // L'objectif du patron
        currentCount: { type: Number, default: 0 }    // L'état réel (calculé par Hera)
      }
    ],
    // Système de Crédits (Usage Credits)
    credits: {
      type: Number,
      default: 10 // On offre 10 crédits à l'inscription pour le "Free Trial"
    },

    // Système de Recrutement (Liste des agents activés par l'utilisateur)
    // Exemple: ['finance', 'planning']
    activeAgents: {
      type: [String],
      default: []
    },

    subscriptionPlan: {
      type: String,
      enum: ['free', 'basic', 'premium'],
      default: 'free'
    },

    maxAgentsAllowed: {
      type: Number,
      enum: [1, 3, 5],
      default: 1
    },

    energyBalance: {
      type: Number,
      default: 0,
      min: 0
    },

    totalEnergyPurchased: {
      type: Number,
      default: 0,
      min: 0
    },

    lastEnergyPurchase: {
      type: Date,
      default: null
    },

    // Budget Management for Kash Financial Agent
    budget: [
      {
        project: { type: String, required: true },
        amount: { type: Number, required: true, min: 0 },
        spent: { type: Number, default: 0, min: 0 }
      }
    ],

    // Prevent double-crediting the same Stripe PaymentIntent
    processedPaymentIntents: {
      type: [String],
      default: []
    },

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
  delete user.processedPaymentIntents;
  return user;
};

module.exports = mongoose.model('User', userSchema);