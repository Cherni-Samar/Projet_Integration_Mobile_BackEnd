// services/echo/social.service.js
//
// Echo Social Service — product link configuration and social/mobile
// dashboard query logic.
// Extracted from echoController.js for separation of concerns.
//
// Responsibilities:
//   - Read / update / delete ECHO_PRODUCT_LINK env var
//   - Build mobile config summary (product link + LinkedIn status + post counts)
//   - Build mobile dashboard stats (SocialPost aggregations)
//   - Build posts metrics for the command center UI
//
// Does NOT handle:
//   - HTTP request/response (stays in echoController.js)
//   - Input validation (stays in echoController.js)
//   - getMobilePosts pagination (stays in echoController.js — not in scope)
//   - mobileForcePost (stays in echoController.js — not in scope)
//   - Campaign logic (campaign.service.js)
//   - Staffing alerts (staffing.service.js)

const SocialPost = require('../../models/SocialPost');
const linkedinService = require('./linkedin.service');

// ─── Private helper ───────────────────────────────────────────────────────────

/**
 * Validate a product link URL string.
 * Returns true only if the value is a non-empty string with http: or https: protocol.
 *
 * @param {string|null} link
 * @returns {boolean}
 */
function _isValidProductLink(link) {
  if (!link || typeof link !== 'string' || link.trim() === '') return false;
  try {
    const url = new URL(link.trim());
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Product link configuration
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get current product link configuration.
 * Reads ECHO_PRODUCT_LINK from process.env.
 *
 * @returns {{ productLink: string|null, isConfigured: boolean, isValid: boolean, timestamp: string }}
 */
function getProductLinkConfig() {
  const productLink = process.env.ECHO_PRODUCT_LINK || null;

  // Validate the current link
  let isValid = false;
  if (productLink && productLink.trim() !== '') {
    try {
      const url = new URL(productLink.trim());
      isValid = (url.protocol === 'http:' || url.protocol === 'https:');
    } catch {
      isValid = false;
    }
  }

  return {
    productLink: productLink,
    isConfigured: !!productLink && productLink.trim() !== '',
    isValid: isValid,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Update product link configuration (config endpoint — French messages).
 * Sets ECHO_PRODUCT_LINK in process.env at runtime.
 *
 * Caller must validate that productLink is a non-empty string before calling.
 * URL format validation is done here and throws typed errors for 400 responses.
 *
 * @param {string} productLink - Raw URL string from request body
 * @returns {{ productLink: string, isConfigured: boolean, isValid: boolean, timestamp: string }}
 * @throws {Error} statusCode 400 — invalid protocol
 * @throws {Error} statusCode 400 — invalid URL format
 */
function updateProductLinkConfig(productLink) {
  // Validate URL format
  try {
    const url = new URL(productLink.trim());
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      const err = new Error('Le lien doit utiliser le protocole HTTP ou HTTPS');
      err.statusCode = 400;
      throw err;
    }
  } catch (e) {
    if (e.statusCode === 400) throw e;
    const err = new Error('Format d\'URL invalide');
    err.statusCode = 400;
    err.details = e.message;
    throw err;
  }

  // Update environment variable (runtime only)
  process.env.ECHO_PRODUCT_LINK = productLink.trim();

  console.log(`✅ [ECHO] Product link updated: ${productLink.trim()}`);

  return {
    productLink: productLink.trim(),
    isConfigured: true,
    isValid: true,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Delete product link configuration.
 * Clears ECHO_PRODUCT_LINK in process.env.
 *
 * @returns {{ productLink: null, isConfigured: boolean, isValid: boolean, timestamp: string }}
 */
function deleteProductLinkConfig() {
  // Clear environment variable
  process.env.ECHO_PRODUCT_LINK = '';

  console.log('🗑️ [ECHO] Product link configuration cleared');

  return {
    productLink: null,
    isConfigured: false,
    isValid: false,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Update product link for mobile endpoint (English messages, includes status field).
 * Sets ECHO_PRODUCT_LINK in process.env at runtime.
 *
 * Caller must validate that productLink is a non-empty string before calling.
 * URL format validation is done here and throws typed errors for 400 responses.
 *
 * @param {string} productLink - Raw URL string from request body
 * @returns {{ productLink: string, isConfigured: boolean, isValid: boolean, status: string }}
 * @throws {Error} statusCode 400 — invalid protocol
 * @throws {Error} statusCode 400 — invalid URL format
 */
function updateMobileProductLink(productLink) {
  // Validate URL format
  try {
    const url = new URL(productLink.trim());
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      const err = new Error('URL must use HTTP or HTTPS protocol');
      err.statusCode = 400;
      throw err;
    }
  } catch (e) {
    if (e.statusCode === 400) throw e;
    const err = new Error('Invalid URL format');
    err.statusCode = 400;
    throw err;
  }

  // Update environment variable
  process.env.ECHO_PRODUCT_LINK = productLink.trim();

  console.log(`✅ [ECHO MOBILE] Product link updated: ${productLink.trim()}`);

  return {
    productLink: productLink.trim(),
    isConfigured: true,
    isValid: true,
    status: 'active',
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Mobile config
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get mobile-friendly configuration summary.
 * Reads product link, LinkedIn status, and recent post counts.
 *
 * @returns {Promise<{ productLink: object, socialMedia: object, stats: object }>}
 */
async function getMobileConfig() {
  const productLink = process.env.ECHO_PRODUCT_LINK || null;

  // Validate the current link
  let isValid = false;
  if (productLink && productLink.trim() !== '') {
    try {
      const url = new URL(productLink.trim());
      isValid = (url.protocol === 'http:' || url.protocol === 'https:');
    } catch {
      isValid = false;
    }
  }

  // Get recent posts count
  const recentPostsCount = await SocialPost.countDocuments({
    createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } // Last 7 days
  });

  // Get LinkedIn status
  let linkedinStatus = 'disconnected';
  try {
    const hasToken = !!linkedinService.accessToken;
    linkedinStatus = hasToken ? 'connected' : 'disconnected';
  } catch {
    linkedinStatus = 'error';
  }

  return {
    productLink: {
      url: productLink,
      isConfigured: !!productLink && productLink.trim() !== '',
      isValid: isValid,
      status: isValid ? 'active' : 'inactive'
    },
    socialMedia: {
      linkedin: {
        status: linkedinStatus,
        lastPost: null // Will be populated later
      },
      mastodon: {
        status: 'active' // Assuming mastodon is always active
      }
    },
    stats: {
      recentPosts: recentPostsCount,
      totalPosts: await SocialPost.countDocuments(),
      postsWithLinks: await SocialPost.countDocuments({ 'productLink.isIncluded': true })
    }
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Mobile dashboard
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get mobile dashboard stats.
 * Runs 8 parallel SocialPost queries and formats the result.
 *
 * @returns {Promise<object>} The full `data` object (no success/timestamp wrapper —
 *   those are added by the controller).
 */
async function getMobileDashboard() {
  const now = new Date();
  const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const last7days = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const last30days = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  // Get various stats
  const [
    totalPosts,
    postsLast24h,
    postsLast7days,
    postsLast30days,
    postsWithLinks,
    linkedinPosts,
    mastodonPosts,
    recentPosts
  ] = await Promise.all([
    SocialPost.countDocuments(),
    SocialPost.countDocuments({ createdAt: { $gte: last24h } }),
    SocialPost.countDocuments({ createdAt: { $gte: last7days } }),
    SocialPost.countDocuments({ createdAt: { $gte: last30days } }),
    SocialPost.countDocuments({ 'productLink.isIncluded': true }),
    SocialPost.countDocuments({ 'platforms.name': 'linkedin' }),
    SocialPost.countDocuments({ 'platforms.name': 'mastodon' }),
    SocialPost.find().sort({ createdAt: -1 }).limit(5).lean()
  ]);

  // Get product link status
  const productLink = process.env.ECHO_PRODUCT_LINK || null;
  let productLinkStatus = 'inactive';
  if (productLink && productLink.trim() !== '') {
    try {
      const url = new URL(productLink.trim());
      productLinkStatus = (url.protocol === 'http:' || url.protocol === 'https:') ? 'active' : 'invalid';
    } catch {
      productLinkStatus = 'invalid';
    }
  }

  // Format recent posts for mobile
  const formattedRecentPosts = recentPosts.map(post => ({
    id: post._id,
    content: post.content.substring(0, 100) + '...',
    platforms: post.platforms.map(p => p.name),
    createdAt: post.createdAt,
    hasProductLink: post.productLink?.isIncluded || false
  }));

  return {
    overview: {
      totalPosts,
      postsLast24h,
      postsLast7days,
      postsLast30days,
      postsWithLinks,
      linkInclusionRate: totalPosts > 0 ? Math.round((postsWithLinks / totalPosts) * 100) : 0
    },
    platforms: {
      linkedin: {
        name: 'LinkedIn',
        icon: '💼',
        posts: linkedinPosts,
        status: 'active'
      },
      mastodon: {
        name: 'Mastodon',
        icon: '🐘',
        posts: mastodonPosts,
        status: 'active'
      }
    },
    productLink: {
      url: productLink,
      status: productLinkStatus,
      isConfigured: !!productLink && productLink.trim() !== ''
    },
    recentActivity: formattedRecentPosts
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Posts metrics
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get posts metrics for the mobile command center UI.
 * Runs 8 parallel SocialPost queries + one full collection load for engagement.
 *
 * @returns {Promise<object>} The full `data` object (no success/timestamp wrapper —
 *   those are added by the controller).
 */
async function getPostsMetrics() {
  const now = new Date();
  const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const last7days = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  // Get posts metrics
  const [
    totalPosts,
    postsLast24h,
    successfulPosts,
    failedPosts,
    postsWithLinks,
    linkedinPosts,
    mastodonPosts,
    recentPosts
  ] = await Promise.all([
    SocialPost.countDocuments(),
    SocialPost.countDocuments({ createdAt: { $gte: last24h } }),
    SocialPost.countDocuments({ 'platforms.status': 'success' }),
    SocialPost.countDocuments({ 'platforms.status': 'failed' }),
    SocialPost.countDocuments({ 'productLink.isIncluded': true }),
    SocialPost.countDocuments({ 'platforms.name': 'linkedin', 'platforms.status': 'success' }),
    SocialPost.countDocuments({ 'platforms.name': 'mastodon', 'platforms.status': 'success' }),
    SocialPost.find()
      .sort({ createdAt: -1 })
      .limit(10)
      .lean()
  ]);

  // Calculate engagement stats
  const allPosts = await SocialPost.find().lean();
  const totalLikes = allPosts.reduce((sum, post) => sum + (post.stats?.likes || 0), 0);
  const totalShares = allPosts.reduce((sum, post) => sum + (post.stats?.shares || 0), 0);
  const totalComments = allPosts.reduce((sum, post) => sum + (post.stats?.comments || 0), 0);

  // Format recent activity for mobile
  const recentActivity = recentPosts.map(post => {
    const platforms = post.platforms || [];
    const linkedinPlatform = platforms.find(p => p.name === 'linkedin');
    const mastodonPlatform = platforms.find(p => p.name === 'mastodon');

    return {
      id: post._id,
      title: post.content.substring(0, 50) + '...',
      description: `Published ${platforms.length} platform(s)`,
      timestamp: post.createdAt,
      status: platforms.some(p => p.status === 'success') ? 'success' : 'failed',
      platforms: {
        linkedin: linkedinPlatform ? {
          status: linkedinPlatform.status,
          url: linkedinPlatform.url
        } : null,
        mastodon: mastodonPlatform ? {
          status: mastodonPlatform.status,
          url: mastodonPlatform.url
        } : null
      },
      hasProductLink: post.productLink?.isIncluded || false,
      stats: post.stats || { likes: 0, shares: 0, comments: 0 }
    };
  });

  return {
    // Top metrics (for the cards at the top)
    metrics: {
      totalPosts: {
        value: totalPosts,
        label: 'POSTS',
        icon: 'post',
        color: '#9C27B0' // Purple to match your theme
      },
      successRate: {
        value: totalPosts > 0 ? Math.round((successfulPosts / totalPosts) * 100) : 0,
        label: 'SUCCESS',
        icon: 'check',
        color: '#4CAF50' // Green
      },
      engagement: {
        value: totalLikes + totalShares + totalComments,
        label: 'ENGAGEMENT',
        icon: 'trending',
        color: '#FF9800' // Orange
      }
    },

    // Operational metrics (for the cards below)
    operational: {
      postsPublished: {
        value: successfulPosts,
        label: 'POSTS PUBLISHED',
        icon: 'check_circle',
        color: '#9C27B0'
      },
      postsFailed: {
        value: failedPosts,
        label: 'POSTS FAILED',
        icon: 'error',
        color: '#F44336'
      },
      postsLast24h: {
        value: postsLast24h,
        label: 'LAST 24H',
        icon: 'schedule',
        color: '#2196F3'
      },
      withProductLink: {
        value: postsWithLinks,
        label: 'WITH LINK',
        icon: 'link',
        color: '#4CAF50'
      }
    },

    // Platform breakdown
    platforms: {
      linkedin: {
        name: 'LinkedIn',
        icon: '💼',
        posts: linkedinPosts,
        status: 'active'
      },
      mastodon: {
        name: 'Mastodon',
        icon: '🐘',
        posts: mastodonPosts,
        status: 'active'
      }
    },

    // Recent activity (matching your UI format)
    recentActivity: recentActivity,

    // Summary stats
    summary: {
      totalPosts,
      successfulPosts,
      failedPosts,
      postsWithLinks,
      linkInclusionRate: totalPosts > 0 ? Math.round((postsWithLinks / totalPosts) * 100) : 0,
      totalEngagement: totalLikes + totalShares + totalComments,
      averageEngagement: totalPosts > 0 ? Math.round((totalLikes + totalShares + totalComments) / totalPosts) : 0
    }
  };
}

// ─────────────────────────────────────────────────────────────────────────────

module.exports = {
  getProductLinkConfig,
  updateProductLinkConfig,
  deleteProductLinkConfig,
  updateMobileProductLink,
  getMobileConfig,
  getMobileDashboard,
  getPostsMetrics,
};
