// services/dexo/document.service.js
//
// Dexo Document Service — PDF generation, document archiving, and delivery.
// Extracted from dexoService.js for separation of concerns.
//
// Responsibilities:
//   - Resolve employee record for document requests
//   - Generate PDF files via pdfGenerator (attestation / bulletin)
//   - Archive generated documents in the Document collection
//   - Log doc_request actions in HeraAction
//   - Send the generated PDF to the employee via email
//
// Does NOT handle:
//   - Strategic advice / onboarding chat (stays in dexoService.js)
//   - Project proposal analysis (stays in dexoService.js)
//   - Telegram / report sending (stays in report.service.js)
//   - CEO briefing (stays in briefing.service.js)
//   - Autonomous document classification / watching (stays in DexoAgent.js)

const crypto = require('crypto');
const fs = require('fs');

const Employee = require('../../models/Employee');
const Document = require('../../models/Document');
const HeraAction = require('../../models/HeraAction');
const pdfGenerator = require('../pdfGenerator');
const mailService = require('../../utils/emailService');

/**
 * Process a document generation request for an employee.
 *
 * Flow:
 *   1. Fetch employee by ID — throws "Employé non trouvé" if missing
 *   2. Generate PDF (attestation or bulletin) via pdfGenerator
 *      — throws "PDF_ERROR: <message>" on failure
 *   3. Hash the filename+timestamp, stat the file, persist Document record,
 *      create HeraAction audit log
 *      — throws "DOCUMENT_DB_ERROR: <message>" on failure
 *   4. Send the PDF to the employee's email
 *      — throws "EMAIL_ERROR: <message>" on failure
 *
 * @param {object} params
 * @param {string} params.employeeId  - MongoDB ObjectId of the employee
 * @param {string} params.docType     - 'attestation' | 'bulletin'
 * @param {object} params.details     - Extra metadata (reason, month, year, …)
 * @returns {Promise<{ docId: string, filename: string }>}
 */
async function processDocumentRequest({ employeeId, docType, details }) {
  console.log('📄 processDocumentRequest payload:', {
    employeeId,
    docType,
    details,
  });

  // ── 1. Employee lookup ──────────────────────────────────────────
  const employee = await Employee.findById(employeeId);
  if (!employee) throw new Error('Employé non trouvé');

  console.log('👤 Employee trouvé:', employee.email);

  // ── 2. PDF generation ───────────────────────────────────────────
  let pdfResult;
  try {
    pdfResult =
      docType === 'attestation'
        ? await pdfGenerator.generateAttestationPDF(employee, details)
        : await pdfGenerator.generateBulletinPDF(employee, details);

    console.log('✅ PDF généré:', pdfResult);
  } catch (e) {
    console.error('❌ Erreur PDF:', e);
    throw new Error('PDF_ERROR: ' + e.message);
  }

  // ── 3. Document archiving + HeraAction audit log ────────────────
  let newDoc;
  try {
    const fileHash = crypto
      .createHash('md5')
      .update(pdfResult.filename + Date.now())
      .digest('hex');

    const stats = fs.statSync(pdfResult.filepath);

    newDoc = await Document.create({
      filename: pdfResult.filename,
      originalName: docType === 'attestation' ? 'Attestation' : 'Bulletin',
      category: docType === 'attestation' ? 'rh' : 'finance',
      uploadedBy: employeeId,
      hash: fileHash,
      filePath: pdfResult.filepath,
      mimetype: 'application/pdf',
      size: stats.size,
      customMetadata: details || {},
    });

    console.log('✅ Document archivé:', newDoc._id);

    await HeraAction.create({
      ceo_id: employee.ceo_id,
      employee_id: employee._id,
      action_type: 'doc_request',
      triggered_by: 'employee',
      details: {
        document: docType,
        filename: pdfResult.filename,
        reason: details?.reason || null,
        documentId: newDoc._id,
      },
    });

    console.log('✅ Action Hera doc_request créée');
  } catch (e) {
    console.error('❌ Erreur Document DB / HeraAction:', e);
    throw new Error('DOCUMENT_DB_ERROR: ' + e.message);
  }

  // ── 4. Email delivery ───────────────────────────────────────────
  try {
    await mailService.sendHeraDocumentEmail(employee.email, {
      name: employee.name,
      type: 'Attestation de Travail',
      pdfFilename: pdfResult.filename,
      pdfPath: pdfResult.filepath,
      details,
    });

    console.log('✅ Email envoyé à:', employee.email);
  } catch (e) {
    console.error('❌ Erreur email:', e);
    throw new Error('EMAIL_ERROR: ' + e.message);
  }

  // ── Return ──────────────────────────────────────────────────────
  return {
    docId: newDoc._id,
    filename: pdfResult.filename,
  };
}

module.exports = {
  processDocumentRequest,
};
