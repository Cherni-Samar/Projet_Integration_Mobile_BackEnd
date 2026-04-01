const { OpenAI } = require('openai');

class Speech {
  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }

  async transcribe(audioBase64, format = 'mp3') {
    try {
      const audioBuffer = Buffer.from(audioBase64, 'base64');
      const file = new File([audioBuffer], `audio.${format}`, { type: `audio/${format}` });
      
      const transcription = await this.openai.audio.transcriptions.create({
        file: file,
        model: 'whisper-1',
        language: 'fr',
      });
      
      return {
        success: true,
        text: transcription.text,
      };
    } catch (error) {
      console.error('❌ Erreur:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }
}

module.exports = new Speech();