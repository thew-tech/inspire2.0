const express = require('express');
const router = express.Router();
const { check } = require('express-validator');
const { auth, authorize } = require('../middleware/auth');
const {
  createProperty,
  createBulkProperties,
  getProperties,
  getProperty,
  updateProperty,
  deleteProperty,
  getAllProperties,
  setReadyForInspection,
  getPropertyStats,
  getDropdownData,
  holdProperty,
} = require('../controllers/propertyController');

// Validation rules
const propertyValidation = [
  check('propertyId', 'Property ID must be a string').optional(),
  check('name', 'Property name is required').notEmpty(),
  check('address', 'Address is required').notEmpty(),
  check('city', 'City is required').notEmpty(),
  check('state', 'State is required').notEmpty(),
  check('zipCode', 'Zip code is required').notEmpty(),
  check('buildings', 'Number of buildings is required').optional().isInt({ min: 0 }),
  check('units', 'Number of units is required').optional().isInt({ min: 0 }),
];

// @route   GET /api/properties/dropdown-data
// @desc    Get dropdown data for property form (countries, states, cities)
// @access  Public
router.get('/dropdown-data', getDropdownData);

// @route   POST /api/properties/bulk
// @desc    Create multiple properties at once
// @access  Private
router.post('/bulk', auth, createBulkProperties);

// @route   POST /api/properties
// @desc    Create a new property
// @access  Private
router.post('/', auth, propertyValidation, createProperty);

// @route   GET /api/properties
// @desc    Get all properties for user
// @access  Private
router.get('/', auth, getProperties);

// @route   GET /api/properties/stats
// @desc    Get property stats
// @access  Private
router.get('/stats', auth, getPropertyStats);

// @route   GET /api/properties/all
// @desc    Get all properties (management)
// @access  Private (Management only)
router.get('/all', auth, authorize('management', 'supervisor'), getAllProperties);

// @route   GET /api/properties/:id
// @desc    Get a single property
// @access  Private
router.get('/:id', auth, getProperty);

// @route   PUT /api/properties/:id
// @desc    Update a property
// @access  Private
router.put('/:id', auth, updateProperty);

// @route   DELETE /api/properties/:id
// @desc    Delete a property
// @access  Private
router.delete('/:id', auth, deleteProperty);

// @route   PATCH /api/properties/:id/ready
// @desc    Set property ready for inspection
// @access  Private
router.patch('/:id/ready', auth, setReadyForInspection);

// @route   PATCH /api/properties/:id/hold
// @desc    Toggle property hold status
// @access  Private
router.patch('/:id/hold', auth, holdProperty);

module.exports = router;
