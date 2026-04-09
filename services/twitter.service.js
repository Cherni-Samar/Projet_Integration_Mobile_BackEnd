// services/twitter.service.js
const { TwitterApi } = require('twitter-api-v2');

class TwitterService {
  constructor() {
    this.client = new TwitterApi({
      appKey: process.env.TWITTER_API_KEY,
      appSecret: process.env.TWITTER_API_SECRET,
      accessToken: process.env.TWITTER_ACCESS_TOKEN,
      accessSecret: process.env.TWITTER_ACCESS_TOKEN_SECRET,
    });
  }

  async post(message) {
    try {
      const tweet = await this.client.v2.tweet(message);
      console.log('✅ Publié sur Twitter !');
      console.log('📎 Tweet ID:', tweet.data.id);
      return { success: true, postId: tweet.data.id };
    } catch (error) {
      console.error('❌ Erreur Twitter:', error);
      return { success: false, error: error.message };
    }
  }
}

module.exports = new TwitterService();