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
    // Champs pour la vérification email
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
    // Champs pour r��initialisation de mot de passe
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
    timestamps: true
  }
);

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