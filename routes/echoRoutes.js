// =============================================================
//  ROUTES EXPRESS - Agent Echo
// =============================================================

const express = require("express");
const router = express.Router();
const echoController = require("../controllers/echoController");

// ─── Message Analysis ────────────────────────────────────────
router.post("/analyser",             echoController.analyser);
router.post("/full-analysis",        echoController.fullAnalysis);
router.post("/auto-reply",           echoController.autoReply);
router.post("/response-suggestions", echoController.responseSuggestions);
router.post("/check-escalation",     echoController.checkEscalation);
router.post("/filter-noise",         echoController.filterNoise);
router.post("/extract-tasks",        echoController.extractTasks);
router.post("/batch",                echoController.batch);
router.post("/batch-advanced",       echoController.batchAdvanced);
router.post("/send-to-hera",         echoController.sendToHera);

// ─── Document Management ─────────────────────────────────────
router.post("/classify-document",                    echoController.classifyDocument);
router.post("/classify",                             echoController.classifyDocument);
router.post("/save-document",                        echoController.saveDocument);
router.post("/documents",                            echoController.saveDocument);
router.get("/documents/category/:category",          echoController.getDocumentsByCategory);
router.get("/documents/:category",                   echoController.getDocumentsByCategory);
router.get("/documents/content/:documentId",         echoController.getDocumentContent);
router.get("/document-content/:documentId",          echoController.getDocumentContent);

// ─── Task Management ─────────────────────────────────────────
router.post("/extract-save-tasks",       echoController.extractAndSaveTasks);
router.get("/tasks",                     echoController.getTasks);
router.patch("/tasks/:taskId/status",    echoController.updateTaskStatus);
router.delete("/tasks/:taskId",          echoController.deleteTask);

// ─── Dashboard / Email ───────────────────────────────────────
router.get("/stats",             echoController.getStats);
router.get("/emails",            echoController.getEmails);
router.get("/pending",           echoController.getPending);
router.patch("/emails/:id/read", echoController.markEmailRead);
router.delete("/emails/:id",     echoController.deleteEmail);

// ─── System ──────────────────────────────────────────────────
router.delete("/memoire", echoController.resetMemoire);
router.get("/sante",      echoController.sante);

module.exports = router;