// =============================================================
//  ROUTES - Agent Management & Energy System
// =============================================================

const express = require('express');
const router = express.Router();
const agentController = require('../controllers/agentController');

// Authentication middleware
const authMiddleware = require('../middleware/authMiddleware');

// ─────────────────────────────────────────────
// AGENT MANAGEMENT ROUTES
// ─────────────────────────────────────────────
router.post('/hire', authMiddleware, agentController.hireAgent); 

// Get user's active agents (My Agents page)
router.get('/my-agents', authMiddleware, agentController.getMyAgents);

// Get all agents with energy status (marketplace/browse)
router.get('/', agentController.getAllAgents);

// Get single agent
router.get('/:id', agentController.getAgent);

// Update agent energy
router.put('/:id/energy', agentController.updateAgentEnergy);

// Distribute energy among multiple agents
router.post('/distribute-energy', agentController.distributeEnergy);

// Initialize default agents (setup)
router.post('/initialize', agentController.initializeAgents);

// ─────────────────────────────────────────────
// ENERGY PURCHASE & MANAGEMENT ROUTES
// ─────────────────────────────────────────────

// Buy energy for user (requires authentication)
router.post('/buy-energy', authMiddleware, agentController.buyEnergy);

// Get user energy balance (requires authentication)
router.get('/energy/balance', authMiddleware, agentController.getEnergyBalance);

// Use user energy to power agents (requires authentication)
router.post('/power-agents', authMiddleware, agentController.powerAgents);

module.exports = router;