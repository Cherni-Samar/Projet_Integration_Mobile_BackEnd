// =============================================================
//  ROUTES - Activity Log
// =============================================================

const express = require('express');
const router = express.Router();
const activityLogController = require('../controllers/activityLogController');

// Get recent activities
router.get('/', activityLogController.getActivities);

// Get activities by agent
router.get('/agent/:agentName', activityLogController.getActivitiesByAgent);

// Get activity statistics
router.get('/statistics', activityLogController.getStatistics);

// Mobile endpoints
router.get('/mobile/feed', activityLogController.getMobileFeed);
router.get('/mobile/dashboard', activityLogController.getMobileDashboard);

module.exports = router;
