const express = require('express');
const { body } = require('express-validator');
const notificationController = require('../controllers/notificationController');
const { auth } = require('../middleware/auth');

const router = express.Router();

// All routes require authentication
router.use(auth);

// @route   GET /api/notifications
// @desc    Get all notifications for logged-in user
// @access  Private
router.get('/', notificationController.getNotifications);

// @route   GET /api/notifications/unread-count
// @desc    Get unread notification count
// @access  Private
router.get('/unread-count', notificationController.getUnreadCount);

// @route   PATCH /api/notifications/read-all
// @desc    Mark all notifications as read
// @access  Private
router.patch('/read-all', notificationController.markAllAsRead);

// @route   PATCH /api/notifications/:id/read
// @desc    Mark notification as read
// @access  Private
router.patch('/:id/read', notificationController.markAsRead);

// @route   DELETE /api/notifications/all
// @desc    Delete all notifications
// @access  Private
router.delete('/all', notificationController.deleteAllNotifications);

// @route   DELETE /api/notifications/:id
// @desc    Delete a notification
// @access  Private
router.delete('/:id', notificationController.deleteNotification);

// @route   POST /api/notifications
// @desc    Create a notification (for testing/admin)
// @access  Private
router.post(
  '/',
  [
    body('title')
      .trim()
      .notEmpty()
      .withMessage('Title is required'),
    body('message')
      .trim()
      .notEmpty()
      .withMessage('Message is required'),
    body('type')
      .optional()
      .isIn(['info', 'success', 'warning', 'error', 'inspection', 'order', 'asset'])
      .withMessage('Invalid notification type'),
  ],
  notificationController.createNotification
);

module.exports = router;
