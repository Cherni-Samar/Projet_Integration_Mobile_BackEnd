// =============================================================
//  SERVICE - Recruitment Management
// =============================================================

const Employee = require('../../models/Employee');
const Candidate = require('../../models/Candidate');
const JobOffer = require('../../models/JobOffer');
const Task = require('../../models/Task');
const mongoose = require('mongoose');
const mailService = require('../../utils/emailService');
const heraAgent = require('../hera.agent');
const timo = require('../../controllers/timoController');

class RecruitmentService {
  
  /**
   * Get all candidates sorted by AI score
   * @returns {Promise<Object>} Candidates result
   */
  static async getAllCandidates() {
    const candidates = await Candidate.find().sort({ score_ia: -1 });
    return { success: true, candidates };
  }
  
  /**
   * Process a new candidacy application
   * @param {Object} candidacyData - Candidacy data
   * @param {Object} file - Uploaded file (if any)
   * @returns {Promise<Object>} Candidacy processing result
   */
  static async processCandidacy(candidacyData, file = null) {
    console.log('📩 BODY CANDIDATURE:', candidacyData);
    console.log('📎 FILE CANDIDATURE:', file);

    const name = candidacyData.name;
    const email = candidacyData.email;
    const department = candidacyData.department || 'Profil E-Team';
    const resume_text = candidacyData.resume_text || '';
    const resume_url = file ? file.path : null;

    if (!name || !email) {
      return {
        success: false,
        error: 'name/email manquants',
        received: candidacyData,
      };
    }

    // AI Analysis of candidate
    const analysis = await heraAgent.analyzeCandidate(
      resume_text || `Candidat pour ${department}`,
      department
    );

    const score = Number(analysis.score) || 0;

    let meeting_link = null;
    let status = 'applied';

    // High score candidates get automatic interview scheduling
    if (score >= 80) {
      meeting_link = `https://meet.jit.si/ETeam_Interview_${name.replace(/\s+/g, '_')}`;
      status = 'interview_scheduled';

      try {
        await timo.autoPlanMeeting(name, 'Interview');
      } catch (e) {
        console.warn('⚠️ Timo ignoré:', e.message);
      }

      try {
        await mailService.sendInterviewInvitation(email, {
          name,
          meeting_link,
        });
      } catch (e) {
        console.warn('⚠️ Mail interview ignoré:', e.message);
      }
    } else {
      try {
        await mailService.sendCandidacyConfirmation(email, name);
      } catch (e) {
        console.warn('⚠️ Mail confirmation ignoré:', e.message);
      }
    }

    const candidate = await Candidate.create({
      name,
      email,
      department,
      status,
      score_ia: score,
      resume_text,
      resume_url,
      meeting_link,
      source: 'linkedin_echo',
      job_offer_id: mongoose.isValidObjectId(candidacyData.job_offer_id) 
        ? candidacyData.job_offer_id 
        : null,
    });

    return {
      success: true,
      message: 'Candidature envoyée avec succès',
      score,
      meeting_link,
      candidate,
    };
  }
  
  /**
   * Hire a candidate and create employee profile
   * @param {string} candidateId - Candidate ID to hire
   * @returns {Promise<Object>} Hiring result
   */
  static async hireCandidate(candidateId) {
    const candidate = await Candidate.findById(candidateId);

    if (!candidate) {
      return { 
        success: false, 
        message: "Candidat non trouvé",
        statusCode: 404 
      };
    }

    // 1. Create Employee profile
    const newEmployee = await Employee.create({
      name: candidate.name,
      email: candidate.email,
      status: 'active',
      role: "Collaborateur",
      department: candidate.department || "Tech",
      leave_balance: { annual: 25, sick: 10, urgent: 3 }
    });

    // 2. Schedule onboarding meeting with anti-collision logic
    let suggestedDate = new Date();
    // Start scheduling from tomorrow at 14:00
    suggestedDate.setDate(suggestedDate.getDate() + 1);
    suggestedDate.setHours(14, 0, 0, 0);

    let isSlotOccupied = true;
    
    while (isSlotOccupied) {
      // Check if a meeting task already exists at this time
      const conflict = await Task.findOne({ 
        deadline: suggestedDate,
        category: 'meeting'
      });

      if (conflict) {
        // If occupied, shift by 1 hour
        console.log(`⚠️ Slot ${suggestedDate.toLocaleString()} occupé par "${conflict.title}", décalage...`);
        suggestedDate.setHours(suggestedDate.getHours() + 1);

        // If we exceed 17h, move to next day at 14h
        if (suggestedDate.getHours() >= 17) {
          suggestedDate.setDate(suggestedDate.getDate() + 1);
          suggestedDate.setHours(14, 0, 0, 0);
        }
      } else {
        // Slot is free!
        isSlotOccupied = false;
      }
    }

    // 3. Create task for Timo (calendar blocking)
    await Task.create({
      title: `Onboarding : ${newEmployee.name}`,
      description: `Session d'intégration officielle pour le nouveau collaborateur ${newEmployee.name}.`,
      deadline: suggestedDate,
      category: 'meeting',
      priority: 'high',
      status: 'todo',
      userId: 'current_user'
    });

    // 4. Send notification email
    const formattedDate = suggestedDate.toLocaleString('fr-FR', {
      weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit'
    });

    await mailService.sendGroupMeetingInvitation(candidate.email, {
      name: candidate.name,
      interview_date: formattedDate,
      meeting_link: "https://meet.jit.si/ETeam_Discovery_Session"
    });

    // 5. Remove candidate from recruitment list
    await Candidate.findByIdAndDelete(candidateId);

    return { 
      success: true, 
      message: "Embauche réussie. Timo a planifié le RDV.",
      plannedDate: formattedDate 
    };
  }
  
  /**
   * Alternative hire candidate method (team onboarding version)
   * @param {string} candidateId - Candidate ID to hire
   * @returns {Promise<Object>} Hiring result
   */
  static async hireCandidateTeamOnboarding(candidateId) {
    const candidate = await Candidate.findById(candidateId);

    if (!candidate) {
      return { 
        success: false, 
        message: "Candidat non trouvé",
        statusCode: 404 
      };
    }

    // 1. Create Employee profile
    const newEmployee = await Employee.create({
      name: candidate.name,
      email: candidate.email,
      status: 'active',
      role: "Collaborateur",
      leave_balance: { annual: 25, sick: 10, urgent: 3 }
    });

    // 2. Prepare welcome session date (Friday 14h)
    const sessionDate = this.getNextSessionDate();
    const formattedDate = sessionDate.toLocaleDateString('fr-FR', {
      weekday: 'long', 
      day: 'numeric', 
      month: 'long', 
      hour: '2-digit', 
      minute: '2-digit'
    });
    
    // Schedule with Timo
    const date = await timo.autoPlanMeeting(newEmployee.name, "Onboarding");

    // 3. Send team meeting invitation
    await mailService.sendGroupMeetingInvitation(candidate.email, {
      name: candidate.name,
      interview_date: formattedDate,
      meeting_link: "https://meet.jit.si/ETeam_Discovery_Session_Team"
    });

    // 4. Remove candidate from recruitment list
    await Candidate.findByIdAndDelete(candidateId);

    console.log(`✅ ${candidate.name} est embauché. Mail de bienvenue envoyé.`);
    
    return { 
      success: true, 
      message: "Embauche réussie et mail d'équipe envoyé." 
    };
  }
  
  /**
   * Helper to calculate next Friday at 14h
   * @returns {Date} Next Friday at 14:00
   */
  static getNextSessionDate() {
    const now = new Date();
    const nextFriday = new Date();
    // Calculate days until Friday (5)
    nextFriday.setDate(now.getDate() + (5 - now.getDay() + 7) % 7);
    nextFriday.setHours(14, 0, 0, 0);
    
    // If we're already past Friday 14h, move to next Friday
    if (now > nextFriday) {
      nextFriday.setDate(nextFriday.getDate() + 7);
    }
    return nextFriday;
  }
  
  /**
   * Get candidate by ID
   * @param {string} candidateId - Candidate ID
   * @returns {Promise<Object>} Candidate result
   */
  static async getCandidateById(candidateId) {
    const candidate = await Candidate.findById(candidateId);
    
    if (!candidate) {
      return { 
        success: false, 
        message: "Candidat non trouvé",
        statusCode: 404 
      };
    }
    
    return { 
      success: true, 
      candidate 
    };
  }
  
  /**
   * Update candidate status
   * @param {string} candidateId - Candidate ID
   * @param {string} status - New status
   * @returns {Promise<Object>} Update result
   */
  static async updateCandidateStatus(candidateId, status) {
    const candidate = await Candidate.findByIdAndUpdate(
      candidateId, 
      { status }, 
      { new: true }
    );
    
    if (!candidate) {
      return { 
        success: false, 
        message: "Candidat non trouvé",
        statusCode: 404 
      };
    }
    
    return { 
      success: true, 
      message: "Statut mis à jour",
      candidate 
    };
  }
  
  /**
   * Create a new job offer
   * @param {Object} jobOfferData - Job offer data
   * @returns {Promise<Object>} Job offer creation result
   */
  static async createJobOffer(jobOfferData) {
    const jobOffer = await JobOffer.create(jobOfferData);
    
    return { 
      success: true, 
      message: "Offre d'emploi créée",
      jobOffer 
    };
  }
  
  /**
   * Get all job offers
   * @param {Object} filters - Optional filters
   * @returns {Promise<Object>} Job offers result
   */
  static async getJobOffers(filters = {}) {
    const jobOffers = await JobOffer.find(filters).sort({ createdAt: -1 });
    
    return { 
      success: true, 
      jobOffers 
    };
  }
}

module.exports = RecruitmentService;