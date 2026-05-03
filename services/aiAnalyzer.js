const Groq = require('groq-sdk');

class AIAnalyzer {
  constructor() {
    this.groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
    this.model = 'llama-3.3-70b-versatile';
    this.importanceThreshold = parseInt(process.env.EMAIL_IMPORTANCE_THRESHOLD) || 70;
  }

  /**
   * Analyze email importance using Groq AI
   * @param {Object} emailData - Email metadata object
   * @returns {Promise<Object>} Analysis results
   */
  async analyzeEmail(emailData) {
    try {
      console.log(`[AIAnalyzer] Analyzing email: ${emailData.subject}`);

      const prompt = this.buildAnalysisPrompt(emailData);

      const completion = await this.groq.chat.completions.create({
        messages: [
          {
            role: 'system',
            content: 'You are an AI assistant analyzing emails for a CEO. Respond only with valid JSON.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        model: this.model,
        temperature: 0.3,
        max_tokens: 1000,
        response_format: { type: 'json_object' }
      });

      const responseText = completion.choices[0]?.message?.content || '{}';
      const analysis = this.parseAnalysisResponse(responseText);

      console.log(`[AIAnalyzer] Analysis complete - Score: ${analysis.importanceScore}, Important: ${analysis.isImportant}`);

      return analysis;
    } catch (error) {
      console.error('[AIAnalyzer] Error analyzing email:', error.message);

      // Default to important for safety if AI fails
      return {
        importanceScore: 75,
        importanceLevel: 'high',
        isImportant: true,
        topic: 'unknown',
        category: 'other',
        actionItems: [],
        deadlines: [],
        suggestedResponsiblePerson: 'default',
        analysisError: error.message
      };
    }
  }

  /**
   * Build analysis prompt for Groq
   * @param {Object} emailData - Email metadata
   * @returns {string} Formatted prompt
   */
  buildAnalysisPrompt(emailData) {
    const cleanBody = this.cleanEmailBody(emailData.body);

    return `You are an AI assistant analyzing emails for a CEO. Analyze the following email and provide a structured assessment.

EMAIL DETAILS:
From: ${emailData.sender.name} <${emailData.sender.address}>
Subject: ${emailData.subject}
Received: ${emailData.receivedAt.toISOString()}
Body Preview: ${cleanBody.substring(0, 1500)}

ANALYSIS INSTRUCTIONS:
1. Importance Score (0-100): Rate how important this email is for the CEO
   - 90-100: Critical/Urgent (requires immediate CEO attention)
   - 70-89: Important (requires attention within 24 hours)
   - 50-69: Moderate (can wait 2-3 days)
   - 30-49: Low priority (informational, can be delegated)
   - 0-29: Very low priority (newsletters, automated notifications, spam)

2. Topic: Extract the MAIN subject/topic from the email content (be specific, max 60 characters)

3. Category: Choose the MOST APPROPRIATE category:
   - urgent_meeting, contract_review, financial_matter, partnership_proposal,
   - customer_complaint, sales_opportunity, hr_matter, technical_issue,
   - marketing_campaign, general_inquiry, newsletter, notification, spam, other

4. Action Items: List specific actions required (if any)

5. Deadlines: Extract any mentioned deadlines or time-sensitive information

6. Suggested Responsible Person:
   - finance_team, legal_team, hr_team, operations_team, sales_team,
   - marketing_team, it_team, customer_service, default

IMPORTANT RULES:
- Newsletters/marketing/promotional → category "newsletter", score 10-30
- Social media notifications → category "notification", score 20-40
- Spam/promotional → category "spam", score 0-20
- Always provide a specific topic, never use "unknown"

RESPOND IN THIS EXACT JSON FORMAT:
{
  "importanceScore": <number 0-100>,
  "topic": "<specific topic extracted from email>",
  "category": "<category>",
  "actionItems": ["<action 1>", "<action 2>"],
  "deadlines": [{"description": "<deadline description>", "date": "<ISO date if extractable>"}],
  "suggestedResponsiblePerson": "<team>",
  "reasoning": "<brief explanation of the importance score>"
}`;
  }

  /**
   * Clean email body from HTML tags and extract meaningful text
   * @param {string} body - Raw email body
   * @returns {string} Cleaned text
   */
  cleanEmailBody(body) {
    if (!body) return '';
    let cleaned = body.replace(/<[^>]*>/g, ' ');
    cleaned = cleaned.replace(/\s+/g, ' ');
    cleaned = cleaned.replace(/[^\w\s.,!?@-]/g, ' ');
    return cleaned.trim();
  }

  /**
   * Parse Groq response into structured analysis
   * @param {string} responseText - Raw AI response
   * @returns {Object} Parsed analysis object
   */
  parseAnalysisResponse(responseText) {
    try {
      const parsed = JSON.parse(responseText);

      const importanceScore = Math.max(0, Math.min(100, parseInt(parsed.importanceScore) || 50));

      let importanceLevel;
      if (importanceScore < 50) {
        importanceLevel = 'low';
      } else if (importanceScore < 75) {
        importanceLevel = 'medium';
      } else {
        importanceLevel = 'high';
      }

      // isImportant = true for medium and high
      const isImportant = importanceLevel === 'medium' || importanceLevel === 'high';

      return {
        importanceScore,
        importanceLevel,
        isImportant,
        topic: parsed.topic || 'Unknown',
        category: this.validateCategory(parsed.category),
        actionItems: Array.isArray(parsed.actionItems) ? parsed.actionItems : [],
        deadlines: Array.isArray(parsed.deadlines) ? parsed.deadlines : [],
        suggestedResponsiblePerson: parsed.suggestedResponsiblePerson || 'default',
        reasoning: parsed.reasoning || ''
      };
    } catch (error) {
      console.error('[AIAnalyzer] Error parsing AI response:', error.message);
      console.error('[AIAnalyzer] Raw response:', responseText);

      return {
        importanceScore: 70,
        importanceLevel: 'medium',
        isImportant: true,
        topic: 'Parse Error',
        category: 'other',
        actionItems: [],
        deadlines: [],
        suggestedResponsiblePerson: 'default',
        reasoning: 'Failed to parse AI response'
      };
    }
  }

  /**
   * Validate category value
   * @param {string} category - Category from AI
   * @returns {string} Valid category
   */
  validateCategory(category) {
    const validCategories = [
      'urgent_meeting', 'contract_review', 'financial_matter',
      'partnership_proposal', 'customer_complaint', 'sales_opportunity',
      'hr_matter', 'technical_issue', 'marketing_campaign',
      'general_inquiry', 'newsletter', 'notification', 'spam', 'other'
    ];
    return validCategories.includes(category) ? category : 'other';
  }

  /**
   * Batch analyze multiple emails in parallel
   * @param {Array} emails - Array of email metadata objects
   * @returns {Promise<Array>} Array of analysis results
   */
  async analyzeEmailsBatch(emails) {
    console.log(`[AIAnalyzer] Batch analyzing ${emails.length} emails`);

    const analysisPromises = emails.map(email =>
      this.analyzeEmail(email).catch(error => {
        console.error(`[AIAnalyzer] Failed to analyze email ${email.emailId}:`, error.message);
        return {
          importanceScore: 75,
          importanceLevel: 'high',
          isImportant: true,
          topic: 'Analysis Failed',
          category: 'other',
          actionItems: [],
          deadlines: [],
          suggestedResponsiblePerson: 'default',
          error: error.message
        };
      })
    );

    return await Promise.all(analysisPromises);
  }

  /**
   * Test Groq connection
   * @returns {Promise<boolean>} True if connection successful
   */
  async testConnection() {
    try {
      const completion = await this.groq.chat.completions.create({
        messages: [{ role: 'user', content: 'Respond with only the word "OK" if you can read this.' }],
        model: this.model,
        temperature: 0,
        max_tokens: 10
      });

      const response = completion.choices[0]?.message?.content || '';
      console.log('[AIAnalyzer] Groq connection test successful:', response);
      return true;
    } catch (error) {
      console.error('[AIAnalyzer] Groq connection test failed:', error.message);
      return false;
    }
  }
}

module.exports = new AIAnalyzer();
