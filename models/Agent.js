const mongoose = require('mongoose');

const agentSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  
  displayName: {
    type: String,
    required: true,
    trim: true
  },
  
  description: {
    type: String,
    trim: true
  },
  
  avatar: {
    type: String,
    trim: true
  },
  
  energy: {
    type: Number,
    default: 0,
    min: 0,
    max: 1000
  },
  
  maxEnergy: {
    type: Number,
    default: 200,
    min: 0,
    max: 1000
  },
  
  status: {
    type: String,
    enum: ['active', 'inactive', 'maintenance'],
    default: 'active'
  },
  
  readyStatus: {
    type: String,
    enum: ['ready', 'busy', 'offline'],
    default: 'ready'
  },
  
  specialties: [{
    type: String,
    trim: true
  }],
  
  lastActivity: {
    type: Date,
    default: Date.now
  },
  
  stats: {
    tasksCompleted: { type: Number, default: 0 },
    energyUsed: { type: Number, default: 0 },
    uptime: { type: Number, default: 0 }
  },
  
  createdAt: {
    type: Date,
    default: Date.now
  },
  
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Update the updatedAt field before saving
agentSchema.pre('save', function() {
  this.updatedAt = Date.now();
});

// Methods
agentSchema.methods.useEnergy = function(amount) {
  const MINIMUM_ENERGY = 2;
  const availableEnergy = this.energy - MINIMUM_ENERGY;
  
  if (availableEnergy >= amount) {
    this.energy -= amount;
    this.stats.energyUsed += amount;
    return true;
  }
  return false;
};

agentSchema.methods.addEnergy = function(amount) {
  this.energy = Math.min(this.maxEnergy, this.energy + amount);
};

agentSchema.methods.getEnergyPercentage = function() {
  return Math.round((this.energy / this.maxEnergy) * 100);
};

agentSchema.methods.isReady = function() {
  const MINIMUM_ENERGY = 2;
  return this.status === 'active' && this.readyStatus === 'ready' && this.energy > MINIMUM_ENERGY;
};

module.exports = mongoose.model('Agent', agentSchema);