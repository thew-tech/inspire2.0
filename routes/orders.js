const express = require('express');
const router = express.Router();
const { check } = require('express-validator');
const { auth, authorize } = require('../middleware/auth');
const {
  createOrder,
  getOrders,
  getOrder,
  updateOrder,
  deleteOrder,
  getOrderStats,
} = require('../controllers/orderController');

// Validation rules
const orderValidation = [
  check('customer.name', 'Customer name is required').notEmpty(),
  check('customer.email', 'Valid customer email is required').isEmail(),
  check('items', 'Order items are required').isArray({ min: 1 }),
];

// @route   GET /api/orders/stats
// @desc    Get order stats
// @access  Private
router.get('/stats', auth, getOrderStats);

// @route   POST /api/orders
// @desc    Create a new order
// @access  Private
router.post('/', auth, orderValidation, createOrder);

// @route   GET /api/orders
// @desc    Get all orders
// @access  Private
router.get('/', auth, getOrders);

// @route   GET /api/orders/:id
// @desc    Get a single order
// @access  Private
router.get('/:id', auth, getOrder);

// @route   PUT /api/orders/:id
// @desc    Update an order
// @access  Private
router.put('/:id', auth, updateOrder);

// @route   DELETE /api/orders/:id
// @desc    Delete an order
// @access  Private
router.delete('/:id', auth, deleteOrder);

module.exports = router;
