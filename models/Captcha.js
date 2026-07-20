const mongoose = require('mongoose');

const captchaSchema = new mongoose.Schema({
  captchaId: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  text: {
    type: String,
    required: true,
  },
  expiresAt: {
    type: Date,
    required: true,
    index: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

// Create TTL index to automatically delete expired captchas
captchaSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const Captcha = mongoose.model('Captcha', captchaSchema);

module.exports = Captcha;
