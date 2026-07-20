const express = require('express');
const router = express.Router();
const { check } = require('express-validator');
const { auth, authorize } = require('../middleware/auth');
const {
  updateProfile,
  changePassword,
  updateNotificationSettings,
  toggleTwoFactor,
  getUsers,
} = require('../controllers/userController');

// Validation rules
const profileValidation = [
  check('email', 'Please include a valid email').optional().isEmail(),
];

// @route   PUT /api/users/profile
// @desc    Update user profile
// @access  Private
router.put('/profile', auth, profileValidation, updateProfile);

// @route   PUT /api/users/password
// @desc    Change password
// @access  Private
router.put('/password', auth, changePassword);

// @route   PUT /api/users/notifications
// @desc    Update notification settings
// @access  Private
router.put('/notifications', auth, updateNotificationSettings);

// @route   POST /api/users/2fa/toggle
// @desc    Toggle two-factor authentication
// @access  Private
router.post('/2fa/toggle', auth, toggleTwoFactor);

// @route   GET /api/users
// @desc    Get all users (admin only)
// @access  Private/Admin
router.get('/', auth, authorize('management', 'supervisor', 'admin'), getUsers);

// @route   GET /api/users/others
// @desc    Get all non-inspector users (for other portal)
// @access  Private
router.get('/others', auth, getUsers);

module.exports = router;
