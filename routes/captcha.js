const express = require('express');
const { body } = require('express-validator');
const captchaController = require('../controllers/captchaController');

const router = express.Router();

// @route   GET /api/captcha/generate
// @desc    Generate a new CAPTCHA image
// @access  Public
router.get('/generate', captchaController.generateCaptcha);

// @route   POST /api/captcha/verify
// @desc    Verify CAPTCHA code
// @access  Public
router.post(
  '/verify',
  [
    body('captchaId')
      .notEmpty()
      .withMessage('Captcha ID is required'),
    body('captchaCode')
      .notEmpty()
      .withMessage('Captcha code is required')
      .isLength({ min: 5, max: 5 })
      .withMessage('Captcha code must be 5 characters'),
  ],
  captchaController.verifyCaptcha
);

module.exports = router;
