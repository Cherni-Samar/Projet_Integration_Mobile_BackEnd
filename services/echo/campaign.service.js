// services/echo/campaign.service.js
//
// Echo Campaign Service — product marketing campaign lifecycle management.
// Extracted from echoController.js for separation of concerns.
//
// Responsibilities:
//   - Start a new product campaign (scrape + create)
//   - Get the current active/paused campaign status
//   - Stop a campaign
//   - Toggle a campaign between active and paused
//   - Get full campaign history with optional status filter
//
// Does NOT handle:
//   - HTTP request/response (stays in echoController.js)
//   - Input validation (stays in echoController.js)
//   - Social post generation / publishing (productCampaignScheduler.service.js)
//   - Staffing alerts (staffing.service.js)
//   - Mobile dashboard queries (echoController.js — Phase 4H3)

const ProductCampaign = require('../../models/ProductCampaign');
const ProductScraperService = require('./productScraper.service');

// ─────────────────────────────────────────────────────────────────────────────
// startProductCampaign
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Start a new product marketing campaign.
 *
 * Steps:
 *   1. Check no active/paused campaign already exists for this productUrl
 *   2. Scrape product data from the URL
 *   3. Create the ProductCampaign record
 *
 * @param {object} params
 * @param {string}   params.productUrl   - Product page URL (required)
 * @param {string}   [params.frequency]  - '3days' | 'daily' | 'weekly' (default: '3days')
 * @param {string[]} [params.platforms]  - ['linkedin', 'mastodon'] (default: both)
 * @param {string}   [params.postStyle]  - 'professional' | 'casual' | 'technical' | 'emotional'
 * @param {boolean}  [params.includeImage] - Whether to include AI image (default: true)
 *
 * @returns {Promise<object>} Formatted campaign object for the API response
 * @throws  {Error} with statusCode 400 if an active campaign already exists
 * @throws  {Error} with statusCode 500 if scraping fails
 */
async function startProductCampaign({ productUrl, frequency, platforms, postStyle, includeImage }) {
  console.log(`🚀 [CAMPAIGN] Starting campaign for: ${productUrl}`);

  // ── 1. Duplicate check ────────────────────────────────────────────────────
  const existingCampaign = await ProductCampaign.findOne({
    productUrl,
    status: { $in: ['active', 'paused'] }
  });

  if (existingCampaign) {
    const err = new Error('Active campaign already exists for this product');
    err.statusCode = 400;
    err.campaign = existingCampaign;
    throw err;
  }

  // ── 2. Scrape product ─────────────────────────────────────────────────────
  const scrapeResult = await ProductScraperService.scrapeProduct(productUrl);

  if (!scrapeResult.success) {
    const err = new Error('Failed to scrape product');
    err.statusCode = 500;
    err.scrapeError = scrapeResult.error;
    throw err;
  }

  // ── 3. Create campaign ────────────────────────────────────────────────────
  const campaign = await ProductCampaign.create({
    productUrl,
    productData: scrapeResult.product,
    frequency: frequency || '3days',
    platforms: platforms || ['linkedin', 'mastodon'], // Post to both platforms by default
    status: 'active',
    settings: {
      postStyle: postStyle || 'professional',
      includeImage: includeImage !== false,
      autoPost: true
    }
  });

  console.log(`✅ [CAMPAIGN] Campaign created: ${campaign._id}`);

  return {
    id: campaign._id,
    productUrl: campaign.productUrl,
    productTitle: campaign.productData.title,
    status: campaign.status,
    frequency: campaign.frequency,
    platforms: campaign.platforms,
    nextPostAt: campaign.calculateNextPostTime(),
    createdAt: campaign.createdAt
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// getCampaignStatus
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get the most recent active or paused campaign.
 *
 * @returns {Promise<object|null>} Formatted campaign object, or null if none found
 */
async function getCampaignStatus() {
  const campaigns = await ProductCampaign.find({ status: { $in: ['active', 'paused'] } })
    .sort({ createdAt: -1 })
    .lean();

  if (campaigns.length === 0) {
    return null;
  }

  // Return the most recent active campaign
  const campaign = campaigns[0];

  return {
    id: campaign._id,
    productUrl: campaign.productUrl,
    productTitle: campaign.productData?.title,
    productImage: campaign.productData?.images?.[0],
    status: campaign.status,
    frequency: campaign.frequency,
    platforms: campaign.platforms,
    postsGenerated: campaign.postsGenerated,
    lastPostAt: campaign.lastPostAt,
    nextPostAt: campaign.nextPostAt,
    totalEngagement: campaign.totalEngagement,
    createdAt: campaign.createdAt
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// stopProductCampaign
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Stop a campaign by ID, or stop the most recent active campaign if no ID given.
 *
 * @param {string|undefined} campaignId - Optional campaign ObjectId
 *
 * @returns {Promise<object>} Formatted stopped campaign object
 * @throws  {Error} with statusCode 404 if no matching campaign found
 */
async function stopProductCampaign(campaignId) {
  let campaign;

  if (campaignId) {
    campaign = await ProductCampaign.findById(campaignId);
  } else {
    // Stop the most recent active campaign
    campaign = await ProductCampaign.findOne({ status: 'active' })
      .sort({ createdAt: -1 });
  }

  if (!campaign) {
    const err = new Error('No active campaign found');
    err.statusCode = 404;
    throw err;
  }

  campaign.status = 'stopped';
  await campaign.save();

  console.log(`🛑 [CAMPAIGN] Campaign stopped: ${campaign._id}`);

  return {
    id: campaign._id,
    productUrl: campaign.productUrl,
    status: campaign.status,
    postsGenerated: campaign.postsGenerated
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// toggleProductCampaign
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Toggle a campaign between active and paused.
 *
 * @param {string} campaignId - Campaign ObjectId (required)
 *
 * @returns {Promise<object>} Formatted campaign object with new status
 * @throws  {Error} with statusCode 404 if campaign not found
 */
async function toggleProductCampaign(campaignId) {
  const campaign = await ProductCampaign.findById(campaignId);

  if (!campaign) {
    const err = new Error('Campaign not found');
    err.statusCode = 404;
    throw err;
  }

  // Toggle between active and paused
  campaign.status = campaign.status === 'active' ? 'paused' : 'active';
  await campaign.save();

  console.log(`⏯️ [CAMPAIGN] Campaign ${campaign.status}: ${campaign._id}`);

  return {
    id: campaign._id,
    status: campaign.status
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// getCampaignHistory
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get all campaigns, optionally filtered by status.
 *
 * @param {object} params
 * @param {number} [params.limit=50]  - Maximum number of campaigns to return
 * @param {string} [params.status]    - Optional status filter ('active' | 'paused' | 'stopped')
 *
 * @returns {Promise<object[]>} Array of formatted campaign objects
 */
async function getCampaignHistory({ limit = 50, status } = {}) {
  // Build query
  const query = {};
  if (status) {
    query.status = status;
  }

  // Get all campaigns sorted by creation date (newest first)
  const campaigns = await ProductCampaign.find(query)
    .sort({ createdAt: -1 })
    .limit(parseInt(limit))
    .lean();

  // Format response
  return campaigns.map(campaign => ({
    id: campaign._id,
    productUrl: campaign.productUrl,
    productTitle: campaign.productData?.title || 'Unknown Product',
    productImage: campaign.productData?.images?.[0] || null,
    productPrice: campaign.productData?.price || 'N/A',
    productCategory: campaign.productData?.category || 'N/A',
    status: campaign.status,
    frequency: campaign.frequency,
    platforms: campaign.platforms,
    postsGenerated: campaign.postsGenerated || 0,
    lastPostAt: campaign.lastPostAt,
    nextPostAt: campaign.nextPostAt,
    totalEngagement: campaign.totalEngagement || 0,
    createdAt: campaign.createdAt,
    updatedAt: campaign.updatedAt
  }));
}

// ─────────────────────────────────────────────────────────────────────────────

module.exports = {
  startProductCampaign,
  getCampaignStatus,
  stopProductCampaign,
  toggleProductCampaign,
  getCampaignHistory,
};
