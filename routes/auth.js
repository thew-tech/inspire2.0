const express = require('express');
const { body } = require('express-validator');
const authController = require('../controllers/authController');
const { auth } = require('../middleware/auth');

const router = express.Router();

// @route   POST /api/auth/signup
// @desc    Register a new user
// @access  Public
router.post(
  '/signup',
  [
    body('fullName')
      .trim()
      .notEmpty()
      .withMessage('Full name is required')
      .isLength({ min: 2, max: 100 })
      .withMessage('Full name must be between 2 and 100 characters')
      .matches(/^[a-zA-Z\s'-]+$/)
      .withMessage('Full name can only contain letters, spaces, hyphens, and apostrophes'),
    body('email')
      .isEmail()
      .withMessage('Please provide a valid email'),
    body('password')
      .isLength({ min: 8, max: 128 })
      .withMessage('Password must be between 8 and 128 characters')
      .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
      .withMessage('Password must contain uppercase, lowercase, and number'),
    body('role')
      .isIn(['inspector', 'management', 'manager', 'other', 'others'])
      .withMessage('Invalid role selected. Must be: inspector, management, or other'),
    body('role')
      .customSanitizer(value => {
        // Convert aliases to standard values
        if (value === 'manager') return 'management';
        if (value === 'others') return 'other';
        return value;
      }),
  ],
  authController.signup
);

// @route   POST /api/auth/login
// @desc    Login user
// @access  Public
router.post(
  '/login',
  [
    body('email')
      .isEmail()
      .withMessage('Please provide a valid email')
      .normalizeEmail(),
    body('password')
      .notEmpty()
      .withMessage('Password is required'),
    body('role')
      .optional()
      .isIn(['inspector', 'management', 'manager', 'other', 'others'])
      .withMessage('Invalid role. Must be: inspector, management, or other')
      .customSanitizer(value => {
        // Convert aliases to standard values
        if (value === 'manager') return 'management';
        if (value === 'others') return 'other';
        return value;
      }),
  ],
  authController.login
);

// @route   GET /api/auth/me
// @desc    Get current logged-in user
// @access  Private
router.get('/me', auth, authController.getMe);

// @route   POST /api/auth/logout
// @desc    Logout user
// @access  Private
router.post('/logout', auth, authController.logout);

// @route   POST /api/auth/verify-token
// @desc    Verify JWT token
// @access  Private
router.post('/verify-token', auth, authController.verifyToken);

// @route   POST /api/auth/social-login
// @desc    Social login (Google/Facebook) via Clerk
// @access  Public
router.post(
  '/social-login',
  [
    body('email')
      .isEmail()
      .withMessage('Please provide a valid email')
      .normalizeEmail(),
    body('portal')
      .optional()
      .isIn(['Inspector', 'Management', 'Other'])
      .withMessage('Invalid portal'),
    body('provider')
      .optional()
      .isIn(['google', 'facebook', 'apple'])
      .withMessage('Invalid provider'),
    body('role')
      .optional()
      .isIn(['inspector', 'management', 'manager', 'other', 'others'])
      .withMessage('Invalid role. Must be: inspector, management, or other')
      .customSanitizer(value => {
        // Convert aliases to standard values
        if (value === 'manager') return 'management';
        if (value === 'others') return 'other';
        return value;
      }),
  ],
  authController.socialLogin
);

// @route   POST /api/auth/forgot-password
// @desc    Send OTP for password reset
// @access  Public
router.post(
  '/forgot-password',
  [
    body('email')
      .isEmail()
      .withMessage('Please provide a valid email')
      .normalizeEmail(),
  ],
  authController.forgotPassword
);

// @route   POST /api/auth/verify-otp
// @desc    Verify OTP for password reset
// @access  Public
router.post(
  '/verify-otp',
  [
    body('email')
      .isEmail()
      .withMessage('Please provide a valid email')
      .normalizeEmail(),
    body('otp')
      .isLength({ min: 6, max: 6 })
      .withMessage('OTP must be 6 digits')
      .isNumeric()
      .withMessage('OTP must contain only numbers'),
  ],
  authController.verifyOTP
);

// @route   POST /api/auth/reset-password
// @desc    Reset password with verified OTP
// @access  Public
router.post(
  '/reset-password',
  [
    body('email')
      .isEmail()
      .withMessage('Please provide a valid email')
      .normalizeEmail(),
    body('otp')
      .isLength({ min: 6, max: 6 })
      .withMessage('OTP must be 6 digits')
      .isNumeric()
      .withMessage('OTP must contain only numbers'),
    body('newPassword')
      .isLength({ min: 8, max: 128 })
      .withMessage('Password must be between 8 and 128 characters')
      .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
      .withMessage('Password must contain uppercase, lowercase, number, and special character (@$!%*?&)'),
  ],
  authController.resetPassword
);

// @route   POST /api/auth/send-verification-email
// @desc    Send email verification OTP
// @access  Public
router.post(
  '/send-verification-email',
  [
    body('email')
      .isEmail()
      .withMessage('Please provide a valid email')
      .normalizeEmail(),
  ],
  authController.sendVerificationEmail
);

// @route   POST /api/auth/verify-email
// @desc    Verify email with OTP
// @access  Public
router.post(
  '/verify-email',
  [
    body('email')
      .isEmail()
      .withMessage('Please provide a valid email')
      .normalizeEmail(),
    body('otp')
      .isLength({ min: 6, max: 6 })
      .withMessage('OTP must be 6 digits')
      .isNumeric()
      .withMessage('OTP must contain only numbers'),
  ],
  authController.verifyEmail
);

// @route   POST /api/auth/resend-verification-otp
// @desc    Resend email verification OTP
// @access  Public
router.post(
  '/resend-verification-otp',
  [
    body('email')
      .isEmail()
      .withMessage('Please provide a valid email')
      .normalizeEmail(),
  ],
  authController.resendVerificationOTP
);

// @route   POST /api/auth/resend-reset-otp
// @desc    Resend OTP for password reset
// @access  Public
router.post(
  '/resend-reset-otp',
  [
    body('email')
      .isEmail()
      .withMessage('Please provide a valid email')
      .normalizeEmail(),
  ],
  authController.resendResetOTP
);

// @route   POST /api/auth/test-smtp
// @desc    Test SMTP configuration (for debugging)
// @access  Public
router.post(
  '/test-smtp',
  [
    body('email')
      .isEmail()
      .withMessage('Please provide a valid email')
      .normalizeEmail(),
  ],
  authController.testSMTP
);

module.exports = router;


// @route   DELETE /api/auth/delete-account
// @desc    Delete user account and all associated data
// @access  Private
router.delete('/delete-account', auth, authController.deleteAccount);
