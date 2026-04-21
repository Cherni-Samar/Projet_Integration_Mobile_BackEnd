const express = require("express");
const router = express.Router();

const inboxController = require("../controllers/emailController");
const optionalAuth = require("../middleware/optionalAuthMiddleware");

router.use(optionalAuth);

// 📩 Receive
router.post("/receive", inboxController.receiveEmail);

// 📥 Get all
router.get("/", inboxController.getEmails);

// ⏳ Pending
router.get("/pending", inboxController.getPending);

// 📧 Get one
router.get("/:id", inboxController.getEmailById);

// ✅ Mark read
router.patch("/:id/read", inboxController.markAsRead);

// ❌ Delete
router.delete("/:id", inboxController.deleteEmail);

module.exports = router;