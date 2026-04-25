// @ts-nocheck
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

/**
 * Génère une attestation de travail en PDF
 */
exports.generateAttestationPDF = async (employee, details) => {
  return new Promise((resolve, reject) => {
    try {
      // Créer le dossier storage si nécessaire
      const storageDir = path.join(__dirname, '../storage/docs');
      if (!fs.existsSync(storageDir)) {
        fs.mkdirSync(storageDir, { recursive: true });
      }

      // Nom du fichier
      const filename = `attestation_${employee.name.replace(/\s/g, '_')}_${Date.now()}.pdf`;
      const filepath = path.join(storageDir, filename);

      // Créer le document PDF
      const doc = new PDFDocument({ margin: 50 });
      const stream = fs.createWriteStream(filepath);

      doc.pipe(stream);

      // ═══════════════════════════════════════════════════════════
      // HEADER - Logo et informations entreprise
      // ═══════════════════════════════════════════════════════════
      doc.fontSize(10)
         .fillColor('#666666')
         .text('E-TEAM', 50, 50)
         .text('123 Avenue de l\'Innovation', 50, 65)
         .text('75001 Paris, France', 50, 80)
         .text('contact@e-team.com', 50, 95);

      // Date du document (en haut à droite)
      const today = new Date().toLocaleDateString('fr-FR', {
        day: '2-digit',
        month: 'long',
        year: 'numeric'
      });
      doc.text(`Paris, le ${today}`, 400, 50, { align: 'right', width: 150 });

      // ═══════════════════════════════════════════════════════════
      // TITRE - Centré avec ligne de soulignement
      // ═══════════════════════════════════════════════════════════
      doc.moveDown(4);
      
      const pageWidth = doc.page.width;
      const titleText = 'ATTESTATION DE TRAVAIL';
      const titleFontSize = 18;
      
      doc.fontSize(titleFontSize)
         .fillColor('#000000')
         .font('Helvetica-Bold');
      
      // Calculer la largeur du texte pour le centrer parfaitement
      const titleWidth = doc.widthOfString(titleText);
      const titleX = (pageWidth - titleWidth) / 2;
      
      doc.text(titleText, titleX, doc.y, { width: titleWidth, align: 'center' });
      
      // Ligne de soulignement centrée sous le titre
      const lineY = doc.y + 5;
      const lineStartX = titleX;
      const lineEndX = titleX + titleWidth;
      doc.moveTo(lineStartX, lineY)
         .lineTo(lineEndX, lineY)
         .stroke();

      doc.moveDown(2.5);

      // ═══════════════════════════════════════════════════════════
      // CORPS DU DOCUMENT
      // ═══════════════════════════════════════════════════════════
      doc.fontSize(12)
         .font('Helvetica')
         .fillColor('#333333');

      doc.text('Je soussigné(e), représentant légal de la société E-TEAM, atteste par la présente que :', {
        align: 'justify',
        lineGap: 5
      });

      doc.moveDown(1.5);

      // Informations de l'employé
      doc.font('Helvetica-Bold')
         .text(`Nom et Prénom : `, { continued: true })
         .font('Helvetica')
         .text(employee.name);

      doc.font('Helvetica-Bold')
         .text(`Poste occupé : `, { continued: true })
         .font('Helvetica')
         .text(employee.role || 'Employé');

      doc.font('Helvetica-Bold')
         .text(`Département : `, { continued: true })
         .font('Helvetica')
         .text(employee.department || 'Non spécifié');

      // Date d'embauche
      const hireDate = employee.hire_date 
        ? new Date(employee.hire_date).toLocaleDateString('fr-FR')
        : 'Non spécifiée';
      
      doc.font('Helvetica-Bold')
         .text(`Date d'embauche : `, { continued: true })
         .font('Helvetica')
         .text(hireDate);

      doc.moveDown(1.5);

      // Texte principal
      doc.font('Helvetica')
         .text(
           `Est employé(e) au sein de notre entreprise depuis le ${hireDate} en qualité de ${employee.role || 'employé(e)'}.`,
           { align: 'justify', lineGap: 5 }
         );

      doc.moveDown(1);

      // Raison de l'attestation (si fournie)
      if (details.reason) {
        doc.text(
          `Cette attestation est délivrée à l'intéressé(e) pour servir et valoir ce que de droit, notamment pour : ${details.reason}.`,
          { align: 'justify', lineGap: 5 }
        );
      } else {
        doc.text(
          `Cette attestation est délivrée à l'intéressé(e) pour servir et valoir ce que de droit.`,
          { align: 'justify', lineGap: 5 }
        );
      }

      doc.moveDown(3);

      // ═══════════════════════════════════════════════════════════
      // SIGNATURE - Alignée à droite
      // ═══════════════════════════════════════════════════════════
      const signatureX = 350;
      const signatureWidth = 200;
      
      doc.fontSize(11)
         .font('Helvetica-Bold')
         .text('Fait à Paris,', signatureX, doc.y, { width: signatureWidth, align: 'left' });
      
      doc.font('Helvetica')
         .fontSize(11)
         .text(`Le ${today}`, signatureX, doc.y + 5, { width: signatureWidth, align: 'left' });

      doc.moveDown(1);
      doc.font('Helvetica')
         .fontSize(11)
         .text('Le Directeur des Ressources Humaines', signatureX, doc.y + 10, { width: signatureWidth, align: 'left' });
      
      doc.moveDown(3);
      doc.font('Helvetica-Oblique')
         .fontSize(10)
         .text('(Signature et cachet)', signatureX, doc.y + 10, { width: signatureWidth, align: 'left' });

      // ═══════════════════════════════════════════════════════════
      // FOOTER
      // ═══════════════════════════════════════════════════════════
      doc.fontSize(8)
         .fillColor('#999999')
         .text(
           'E-TEAM - SAS au capital de 100 000€ - SIRET: 123 456 789 00012 - APE: 6201Z',
           50,
           doc.page.height - 50,
           { align: 'center' }
         );

      // Finaliser le PDF
      doc.end();

      // Attendre que le fichier soit écrit
      stream.on('finish', () => {
        resolve({ filepath, filename });
      });

      stream.on('error', (err) => {
        reject(err);
      });

    } catch (error) {
      reject(error);
    }
  });
};

/**
 * Génère un bulletin de paie en PDF (simplifié)
 */
exports.generateBulletinPDF = async (employee, details) => {
  return new Promise((resolve, reject) => {
    try {
      const storageDir = path.join(__dirname, '../storage/docs');
      if (!fs.existsSync(storageDir)) {
        fs.mkdirSync(storageDir, { recursive: true });
      }

      const filename = `bulletin_${employee.name.replace(/\s/g, '_')}_${details.month}_${details.year}.pdf`;
      const filepath = path.join(storageDir, filename);

      const doc = new PDFDocument({ margin: 50 });
      const stream = fs.createWriteStream(filepath);

      doc.pipe(stream);

      // Header
      doc.fontSize(10)
         .fillColor('#666666')
         .text('E-TEAM', 50, 50)
         .text('Bulletin de Paie', 50, 65);

      doc.text(`Période: ${details.month}/${details.year}`, 400, 50, { align: 'right' });

      // Titre - Centré avec ligne de soulignement
      doc.moveDown(3);
      
      const pageWidth = doc.page.width;
      const bulletinTitle = 'BULLETIN DE SALAIRE';
      const bulletinFontSize = 16;
      
      doc.fontSize(bulletinFontSize)
         .fillColor('#000000')
         .font('Helvetica-Bold');
      
      // Calculer la largeur du texte pour le centrer parfaitement
      const bulletinTitleWidth = doc.widthOfString(bulletinTitle);
      const bulletinTitleX = (pageWidth - bulletinTitleWidth) / 2;
      
      doc.text(bulletinTitle, bulletinTitleX, doc.y, { width: bulletinTitleWidth, align: 'center' });
      
      // Ligne de soulignement centrée
      const bulletinLineY = doc.y + 5;
      doc.moveTo(bulletinTitleX, bulletinLineY)
         .lineTo(bulletinTitleX + bulletinTitleWidth, bulletinLineY)
         .stroke();

      doc.moveDown(2.5);

      // Informations employé
      doc.fontSize(11)
         .font('Helvetica-Bold')
         .text('SALARIÉ', 50, doc.y);
      
      doc.font('Helvetica')
         .fontSize(10)
         .text(`Nom: ${employee.name}`, 50, doc.y + 5)
         .text(`Poste: ${employee.role || 'Employé'}`, 50, doc.y + 5)
         .text(`Département: ${employee.department || 'N/A'}`, 50, doc.y + 5);

      doc.moveDown(2);

      // Informations de paie (exemple simplifié)
      doc.font('Helvetica-Bold')
         .fontSize(11)
         .text('RÉMUNÉRATION', 50, doc.y);

      doc.font('Helvetica')
         .fontSize(10)
         .text('Salaire de base: 3000.00 €', 50, doc.y + 5)
         .text('Cotisations sociales: -600.00 €', 50, doc.y + 5)
         .text('─────────────────────────', 50, doc.y + 5);

      doc.font('Helvetica-Bold')
         .text('NET À PAYER: 2400.00 €', 50, doc.y + 5);

      doc.moveDown(3);

      doc.fontSize(8)
         .fillColor('#999999')
         .font('Helvetica')
         .text('Document généré automatiquement par E-TEAM', 50, doc.y + 20, { align: 'center' });

      doc.end();

      stream.on('finish', () => {
        resolve({ filepath, filename });
      });

      stream.on('error', (err) => {
        reject(err);
      });

    } catch (error) {
      reject(error);
    }
  });
};
