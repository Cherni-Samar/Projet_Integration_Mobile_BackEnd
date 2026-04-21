const mongoose = require('mongoose');

const DocumentSchema = new mongoose.Schema({
  // Informations de base
  filename: {
    type: String,
    required: true,
    trim: true
  },
  originalName: {
    type: String,
    required: true,
    trim: true
  },
  suggestedName: {
    type: String,
    trim: true
  },
 
  // Classification automatique
  category: {
    type: String,
    enum: ['contrats', 'factures', 'rapports', 'presentations', 'juridique', 'rh', 'technique', 'marketing', 'finance', 'autre'],
    default: 'autre'
  },
  subcategory: {
    type: String,
    trim: true
  },
 
  // Sécurité et accès
  confidentialityLevel: {
    type: String,
    enum: ['public', 'interne', 'confidentiel', 'secret'],
    default: 'interne'
  },
  accessRoles: [{
    type: String,
    enum: ['admin', 'manager', 'employee', 'hr', 'finance', 'legal', 'marketing', 'technical']
  }],
 
  // Métadonnées fichier
  filePath: {
    type: String,
    required: true
  },
  mimetype: {
    type: String,
    required: true
  },
  size: {
    type: Number,
    required: true
  },
  hash: {
    type: String,
    required: true,
    unique: true
  },
 
  // Tags et recherche
  tags: [{
    type: String,
    trim: true
  }],
  searchableContent: {
    type: String,
    text: true // Index de recherche textuelle
  },
 
  // Dates importantes
  uploadedAt: {
    type: Date,
    default: Date.now
  },
  lastModified: {
    type: Date,
    default: Date.now
  },
  expirationDate: {
    type: Date,
    default: null
  },
  lastAccessedAt: {
    type: Date,
    default: Date.now
  },
 
  // Utilisateurs
  uploadedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  lastModifiedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
 
  // Priorité et statut
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'critical'],
    default: 'medium'
  },
  status: {
    type: String,
    enum: ['active', 'archived', 'deleted', 'expired'],
    default: 'active'
  },
 
  // Versioning
  version: {
    type: Number,
    default: 1
  },
  parentDocument: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Document',
    default: null
  },
  isLatestVersion: {
    type: Boolean,
    default: true
  },
  versionComment: {
    type: String,
    trim: true
  },
 
  // Classification IA
  aiClassification: {
    confidence: {
      type: Number,
      min: 0,
      max: 1,
      default: 0
    },
    processedAt: {
      type: Date,
      default: Date.now
    },
    model: {
      type: String,
      default: 'dexo-agent-v1'
    }
  },
 
  // Détection de doublons
  duplicateInfo: {
    isDuplicate: {
      type: Boolean,
      default: false
    },
    similarityScore: {
      type: Number,
      min: 0,
      max: 1,
      default: 0
    },
    duplicateType: {
      type: String,
      enum: ['exact', 'near_duplicate', 'version', 'similar_content'],
      default: null
    },
    relatedDocuments: [{
      document: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Document'
      },
      similarity: {
        type: Number,
        min: 0,
        max: 1
      },
      reason: String
    }]
  },
 
  // Partage et permissions
  sharedWith: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    role: {
      type: String,
      enum: ['viewer', 'editor', 'admin']
    },
    sharedAt: {
      type: Date,
      default: Date.now
    },
    sharedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }
  }],
 
  // Workflow n8n
  n8nWorkflows: [{
    workflowName: String,
    triggeredAt: Date,
    status: {
      type: String,
      enum: ['pending', 'completed', 'failed']
    },
    result: mongoose.Schema.Types.Mixed
  }],
 
  // Métadonnées personnalisées
  customMetadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Index pour la recherche
DocumentSchema.index({
  filename: 'text',
  originalName: 'text',
  searchableContent: 'text',
  tags: 'text'
});

// Index pour les requêtes fréquentes
DocumentSchema.index({ category: 1, confidentialityLevel: 1 });
DocumentSchema.index({ uploadedBy: 1, status: 1 });
DocumentSchema.index({ expirationDate: 1, status: 1 });
DocumentSchema.index({ parentDocument: 1, version: -1 });

// Virtuals
DocumentSchema.virtual('isExpired').get(function() {
  return this.expirationDate && this.expirationDate < new Date();
});

DocumentSchema.virtual('isExpiringSoon').get(function() {
  if (!this.expirationDate) return false;
  const thirtyDaysFromNow = new Date();
  thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
  return this.expirationDate <= thirtyDaysFromNow && this.expirationDate > new Date();
});

DocumentSchema.virtual('fileExtension').get(function() {
  return this.filename.split('.').pop().toLowerCase();
});

DocumentSchema.virtual('sizeFormatted').get(function() {
  const bytes = this.size;
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
});

// Méthodes d'instance
DocumentSchema.methods.updateLastAccess = function() {
  this.lastAccessedAt = new Date();
  return this.save();
};

DocumentSchema.methods.createVersion = function(newContent, userId, comment) {
  // Marquer la version actuelle comme non-latest
  this.isLatestVersion = false;
 
  // Créer une nouvelle version
  const newVersion = new this.constructor({
    ...this.toObject(),
    _id: undefined,
    version: this.version + 1,
    parentDocument: this.parentDocument || this._id,
    isLatestVersion: true,
    versionComment: comment,
    lastModifiedBy: userId,
    lastModified: new Date(),
    searchableContent: newContent
  });
 
  return Promise.all([this.save(), newVersion.save()]);
};

DocumentSchema.methods.checkAccess = function(userId, userRoles = []) {
  // Vérifier si l'utilisateur a accès au document
  if (this.uploadedBy.toString() === userId.toString()) {
    return { hasAccess: true, reason: 'owner' };
  }
 
  // Vérifier les rôles d'accès
  const hasRoleAccess = this.accessRoles.some(role => userRoles.includes(role));
  if (hasRoleAccess) {
    return { hasAccess: true, reason: 'role' };
  }
 
  // Vérifier le partage direct
  const sharedAccess = this.sharedWith.find(share =>
    share.user.toString() === userId.toString()
  );
  if (sharedAccess) {
    return { hasAccess: true, reason: 'shared', role: sharedAccess.role };
  }
 
  return { hasAccess: false, reason: 'no_permission' };
};

// Méthodes statiques
DocumentSchema.statics.findExpired = function() {
  return this.find({
    expirationDate: { $lt: new Date() },
    status: 'active'
  });
};

DocumentSchema.statics.findExpiringSoon = function(days = 30) {
  const futureDate = new Date();
  futureDate.setDate(futureDate.getDate() + days);
 
  return this.find({
    expirationDate: {
      $gte: new Date(),
      $lte: futureDate
    },
    status: 'active'
  });
};

DocumentSchema.statics.searchDocuments = function(query, userRoles = [], userId = null) {
  const searchCriteria = {
    $text: { $search: query },
    status: 'active'
  };
 
  // Filtrer par accès utilisateur
  if (userId) {
    searchCriteria.$or = [
      { uploadedBy: userId },
      { accessRoles: { $in: userRoles } },
      { 'sharedWith.user': userId }
    ];
  }
 
  return this.find(searchCriteria, { score: { $meta: 'textScore' } })
    .sort({ score: { $meta: 'textScore' } });
};

DocumentSchema.statics.findDuplicates = function(hash, excludeId = null) {
  const criteria = { hash: hash };
  if (excludeId) {
    criteria._id = { $ne: excludeId };
  }
  return this.find(criteria);
};

// Middleware pre-save
DocumentSchema.pre('save', function() {
  if (this.isModified('searchableContent') || this.isModified('filename') || this.isModified('tags')) {
    // Mettre à jour lastModified
    this.lastModified = new Date();
  }
});

// Middleware post-save pour déclencher n8n
DocumentSchema.post('save', async function(doc) {
  try {
    // Déclencher workflow n8n si disponible
    if (process.env.N8N_URL && doc.isNew) {
      const axios = require('axios');
      await axios.post(`${process.env.N8N_URL}/document-saved`, {
        documentId: doc._id,
        filename: doc.filename,
        category: doc.category,
        confidentialityLevel: doc.confidentialityLevel,
        uploadedBy: doc.uploadedBy,
        timestamp: new Date().toISOString()
      }).catch(err => {
        console.error('❌ Erreur n8n webhook:', err.message);
      });
    }
  } catch (error) {
    console.error('❌ Erreur post-save middleware:', error.message);
  }
});

module.exports = mongoose.model('Document', DocumentSchema);