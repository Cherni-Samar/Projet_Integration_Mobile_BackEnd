const TelegramBot = require('node-telegram-bot-api');
const cron = require('node-cron');
const gTTS = require('gtts');
const path = require('path');
const fs = require('fs');

module.exports = { runAutomatedVocalBriefing };