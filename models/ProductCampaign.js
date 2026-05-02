const mongoose = require('mongoose');

const productCampaignSchema = new mongoose.Schema({
  productUrl: {
    type: String,
    required: true,
    trim: true
  },
  productData: {
    title: String,
    description: String,
    price: String,
    images: [String],
    features: [String],
    category: String,
    brand: String,
    scrapedAt: Date
  },
  status: {
    type: String,
    enum: ['active', 'paused', 'stopped'],
    default: 'active'
  },
  frequency: {
    type: String,
    enum: ['daily', '3days', 'weekly'],
    default: '3days'
  },
  platforms: [{
    type: String,
    enum: ['linkedin', 'mastodon'],
    default: ['linkedin']
  }],
  lastPostAt: Date,
  nextPostAt: Date,
  postsGenerated: {
    type: Number,
    default: 0
  },
  totalEngagement: {
    likes: { type: Number, default: 0 },
    shares: { type: Number, default: 0 },
    comments: { type: Number, default: 0 }
  },
  settings: {
    postStyle: {
      type: String,
      enum: ['professional', 'casual', 'technical', 'emotional'],
      default: 'professional'
    },
    includeImage: {
      type: Boolean,
      default: true
    },
    autoPost: {
      type: Boolean,
      default: true
    }
  }
}, {
  timestamps: true
});

// Index for efficient queries
productCampaignSchema.index({ status: 1, nextPostAt: 1 });
productCampaignSchema.index({ createdAt: -1 });

// Method to check if it's time to post
productCampaignSchema.methods.isTimeToPost = function() {
  if (this.status !== 'active') return false;
  if (!this.nextPostAt) return true; // First post
  return new Date() >= this.nextPostAt;
};

// Method to calculate next post time
productCampaignSchema.methods.calculateNextPostTime = function() {
  const now = new Date();
  let hoursToAdd;

  switch (this.frequency) {
    case 'daily':
      hoursToAdd = 24;
      break;
    case '3days':
      hoursToAdd = 72;
      break;
    case 'weekly':
      hoursToAdd = 168;
      break;
    default:
      hoursToAdd = 72;
  }

  return new Date(now.getTime() + hoursToAdd * 60 * 60 * 1000);
};

// Method to update after posting
productCampaignSchema.methods.updateAfterPost = async function() {
  this.lastPostAt = new Date();
  this.nextPostAt = this.calculateNextPostTime();
  this.postsGenerated += 1;
  await this.save();
};

// Static method to get active campaigns ready to post
productCampaignSchema.statics.getReadyToPost = async function() {
  const now = new Date();
  return this.find({
    status: 'active',
    $or: [
      { nextPostAt: { $lte: now } },
      { nextPostAt: null }
    ]
  });
};

module.exports = mongoose.model('ProductCampaign', productCampaignSchema);
