const { google } = require('googleapis');

class EmailCollector {
  constructor() {
    this.oauth2Client = new google.auth.OAuth2(
      process.env.GMAIL_CLIENT_ID,
      process.env.GMAIL_CLIENT_SECRET,
      'urn:ietf:wg:oauth:2.0:oob'
    );

    // Set credentials if refresh token is available
    if (process.env.GMAIL_REFRESH_TOKEN) {
      this.oauth2Client.setCredentials({
        refresh_token: process.env.GMAIL_REFRESH_TOKEN
      });
    }

    this.gmail = google.gmail({ version: 'v1', auth: this.oauth2Client });
  }

  /**
   * Fetch unread emails from CEO inbox - TEMPS RÉEL (emails récents seulement)
   * @param {number} maxResults - Maximum number of emails to fetch
   * @returns {Promise<Array>} Array of email metadata objects
   */
  async fetchUnreadEmails(maxResults = 50) {
    try {
      console.log('[EmailCollector] Fetching unread emails...');

      // Configuration temps réel
      const recentOnly = process.env.EMAIL_PROCESSING_RECENT_ONLY === 'true';
      const recentMinutes = parseInt(process.env.EMAIL_PROCESSING_RECENT_MINUTES) || 2;

      let query = 'is:unread';

      // Ajouter filtre de date pour emails récents seulement
      if (recentOnly) {
        const cutoffTime = new Date(Date.now() - (recentMinutes * 60 * 1000));
        const cutoffString = cutoffTime.toISOString().split('T')[0]; // Format YYYY-MM-DD
        query += ` after:${cutoffString}`;
        console.log(`[EmailCollector] Filtering emails newer than ${recentMinutes} minutes (after ${cutoffString})`);
      }

      // List unread messages with date filter
      const response = await this.gmail.users.messages.list({
        userId: 'me',
        q: query,
        maxResults: maxResults
      });

      const messages = response.data.messages || [];
      console.log(`[EmailCollector] Found ${messages.length} unread emails${recentOnly ? ' (recent only)' : ''}`);

      if (messages.length === 0) {
        return [];
      }

      // Fetch full details for each message
      const emailPromises = messages.map(msg => this.fetchEmailDetails(msg.id));
      const emails = await Promise.all(emailPromises);

      // Filtrage supplémentaire par date précise si activé
      let filteredEmails = emails;
      if (recentOnly) {
        const cutoffTime = new Date(Date.now() - (recentMinutes * 60 * 1000));
        filteredEmails = emails.filter(email => {
          const isRecent = email.receivedAt >= cutoffTime;
          if (!isRecent) {
            console.log(`[EmailCollector] Filtering out old email: ${email.subject} (received: ${email.receivedAt.toISOString()})`);
          }
          return isRecent;
        });
        console.log(`[EmailCollector] ${filteredEmails.length}/${emails.length} emails are recent (last ${recentMinutes} minutes)`);
      }

      // Filter out already processed emails
      const newEmails = await this.filterNewEmails(filteredEmails);
      console.log(`[EmailCollector] ${newEmails.length} new emails to process`);

      return newEmails;
    } catch (error) {
      console.error('[EmailCollector] Error fetching emails:', error.message);

      // Handle authentication errors
      if (error.code === 401 || error.code === 403) {
        console.error('[EmailCollector] Authentication error - check Gmail OAuth credentials');
        throw new Error('Gmail authentication failed');
      }

      // Retry logic for transient errors
      if (error.code >= 500) {
        console.log('[EmailCollector] Server error, will retry in next session');
      }

      throw error;
    }
  }

  /**
   * Fetch detailed information for a single email
   * @param {string} messageId - Gmail message ID
   * @returns {Promise<Object>} Email metadata object
   */
  async fetchEmailDetails(messageId) {
    try {
      const response = await this.gmail.users.messages.get({
        userId: 'me',
        id: messageId,
        format: 'full'
      });

      const message = response.data;
      const headers = message.payload.headers;

      // Extract email metadata
      const emailData = {
        emailId: message.id,
        sender: {
          address: this.getHeader(headers, 'From').match(/<(.+)>/)?.[1] || this.getHeader(headers, 'From'),
          name: this.getHeader(headers, 'From').match(/^(.+?)\s*</)?.[1] || this.getHeader(headers, 'From')
        },
        subject: this.getHeader(headers, 'Subject') || '(No Subject)',
        body: this.extractBody(message.payload),
        receivedAt: new Date(parseInt(message.internalDate)),
        attachments: this.extractAttachments(message.payload),
        threadId: message.threadId
      };

      return emailData;
    } catch (error) {
      console.error(`[EmailCollector] Error fetching email ${messageId}:`, error.message);
      throw error;
    }
  }

  /**
   * Get header value by name
   * @param {Array} headers - Email headers array
   * @param {string} name - Header name
   * @returns {string} Header value
   */
  getHeader(headers, name) {
    const header = headers.find(h => h.name.toLowerCase() === name.toLowerCase());
    return header ? header.value : '';
  }

  /**
   * Extract email body from payload
   * @param {Object} payload - Gmail message payload
   * @returns {string} Email body text
   */
  extractBody(payload) {
    let body = '';

    if (payload.body && payload.body.data) {
      body = Buffer.from(payload.body.data, 'base64').toString('utf-8');
    } else if (payload.parts) {
      // Multi-part message
      for (const part of payload.parts) {
        if (part.mimeType === 'text/plain' && part.body.data) {
          body += Buffer.from(part.body.data, 'base64').toString('utf-8');
        } else if (part.mimeType === 'text/html' && !body && part.body.data) {
          // Fallback to HTML if no plain text
          body = Buffer.from(part.body.data, 'base64').toString('utf-8');
        } else if (part.parts) {
          // Nested parts
          body += this.extractBody(part);
        }
      }
    }

    // Clean up HTML tags if present
    body = body.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

    // Limit body length
    if (body.length > 10000) {
      body = body.substring(0, 10000) + '... [truncated]';
    }

    return body;
  }

  /**
   * Extract attachment metadata from payload
   * @param {Object} payload - Gmail message payload
   * @returns {Array} Array of attachment objects
   */
  extractAttachments(payload) {
    const attachments = [];

    if (payload.parts) {
      for (const part of payload.parts) {
        if (part.filename && part.body.attachmentId) {
          attachments.push({
            filename: part.filename,
            size: part.body.size,
            mimeType: part.mimeType
          });
        }
      }
    }

    return attachments;
  }

  /**
   * Filter out emails that have already been processed.
   * Stateless — returns all emails for processing (no DB filtering).
   * @param {Array} emails - Array of email metadata objects
   * @returns {Promise<Array>} Array of new emails
   */
  async filterNewEmails(emails) {
    console.log(`[EmailCollector] Processing all ${emails.length} unread emails (no database filtering)`);
    return emails;
  }

  /**
   * Mark email as read in Gmail (optional)
   * @param {string} messageId - Gmail message ID
   */
  async markAsRead(messageId) {
    try {
      await this.gmail.users.messages.modify({
        userId: 'me',
        id: messageId,
        requestBody: {
          removeLabelIds: ['UNREAD']
        }
      });
      console.log(`[EmailCollector] Marked email ${messageId} as read`);
    } catch (error) {
      console.error(`[EmailCollector] Error marking email as read:`, error.message);
    }
  }

  /**
   * Test Gmail connection
   * @returns {Promise<boolean>} True if connection successful
   */
  async testConnection() {
    try {
      const response = await this.gmail.users.getProfile({
        userId: 'me'
      });
      console.log(`[EmailCollector] Connected to Gmail account: ${response.data.emailAddress}`);
      return true;
    } catch (error) {
      console.error('[EmailCollector] Connection test failed:', error.message);
      return false;
    }
  }
}

module.exports = new EmailCollector();
