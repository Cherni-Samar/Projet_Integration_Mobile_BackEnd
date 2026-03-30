const nodemailer = require('nodemailer');

class EmailSender {
  constructor() {
    this.transporter = nodemailer.createTransport({
      host: process.env.EMAIL_HOST || 'smtp.gmail.com',
      port: process.env.EMAIL_PORT || 587,
      secure: false,
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });
  }

  async sendEmail({ to, subject, content, from = 'echo@e-team.com' }) {
    try {
      const info = await this.transporter.sendMail({
        from: '"Agent Echo" <' + from + '>',
        to: to,
        subject: subject,
        text: content,
        html: content.replace(/\n/g, '<br>'),
      });
      
      console.log('📧 Email envoyé à ' + to);
      console.log('   Message ID: ' + info.messageId);
      return { success: true, messageId: info.messageId };
      
    } catch (error) {
      console.error('❌ Erreur envoi email:', error.message);
      return { success: false, error: error.message };
    }
  }
}

module.exports = new EmailSender();
