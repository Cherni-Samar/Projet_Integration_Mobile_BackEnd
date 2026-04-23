const mongoose = require('mongoose');

const socialPostSchema = new mongoose.Schema({
  content: {
    type: String,
    required: true
  },
  image: {
    url: String,
    type: {
      type: String,
      enum: ['ai-generated', 'original', 'none'],
      default: 'none'
    },
    source: String
  },
  platforms: [{
    name: {
      type: String,
      enum: ['linkedin', 'mastodon'],
      required: true
    },
    postId: String,
    url: String,
    status: {
      type: String,
      enum: ['success', 'failed', 'pending'],
      default: 'pending'
    },
    error: String,
    publishedAt: Date
  }],
  productLink: {
    url: String,
    position: Number,
    isIncluded: {
      type: Boolean,
      default: false
    }
  },
  metadata: {
    generatedBy: {
      type: String,
      default: 'echo-autonomous'
    },
    isForced: {
      type: Boolean,
      default: false
    },
    contentLength: Number,
    hashtags: [String],
    mentions: [String]
  },
  stats: {
    likes: {
      type: Number,
      default: 0
    },
    shares: {
      type: Number,
      default: 0
    },
    comments: {
      type: Number,
      default: 0
    },
    impressions: {
      type: Number,
      default: 0
    }
  }
}, {
  timestamps: true
});

socialPostSchema.index({ createdAt: -1 });
socialPostSchema.index({ 'platforms.name': 1 });
socialPostSchema.index({ 'productLink.isIncluded': 1 });

socialPostSchema.virtual('mobileFormat').get(function() {
  return {
    id: this._id,
    content: this.content.substring(0, 100) + (this.content.length > 100 ? '...' : ''),
    fullContent: this.content,
    image: this.image ? {
      url: this.image.url,
      type: this.image.type,
      source: this.image.source
    } : null,
    platforms: this.platforms.map(p => ({
      name: p.name,
      status: p.status,
      url: p.url,
      publishedAt: p.publishedAt
    })),
    hasProductLink: this.productLink.isIncluded,
    productLinkUrl: this.productLink.url,
    createdAt: this.createdAt,
    isForced: this.metadata.isForced,
    stats: this.stats
  };
});

socialPostSchema.statics.logPost = async function(postData) {
  try {
    const post = new this(postData);
    await post.save();
    return post;
  } catch (error) {
    console.error('Error logging social post:', error);
    throw error;
  }
};

socialPostSchema.methods.updatePlatformStatus = async function(platformName, status, data = {}) {
  const platform = this.platforms.find(p => p.name === platformName);
  if (platform) {
    platform.status = status;
    if (data.postId) platform.postId = data.postId;
    if (data.url) platform.url = data.url;
    if (data.error) platform.error = data.error;
    if (status === 'success') platform.publishedAt = new Date();
    
    await this.save();
  }
  return this;
};

module.exports = mongoose.model('SocialPost', socialPostSchema);
