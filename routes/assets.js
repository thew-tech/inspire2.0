const express = require('express');
const router = express.Router();
const { check } = require('express-validator');
const { auth, authorize } = require('../middleware/auth');
const {
  createAsset,
  getAssets,
  getAsset,
  updateAsset,
  deleteAsset,
  addMaintenanceRecord,
  getAssetStats,
} = require('../controllers/assetController');

// Validation rules
const assetValidation = [
  check('name', 'Asset name is required').notEmpty(),
  check('category', 'Category is required').notEmpty(),
];

const maintenanceValidation = [
  check('date', 'Maintenance date is required').notEmpty(),
  check('type', 'Maintenance type is required').notEmpty(),
  check('description', 'Description is required').notEmpty(),
];

// @route   GET /api/assets/stats
// @desc    Get asset stats
// @access  Private
router.get('/stats', auth, getAssetStats);

// @route   POST /api/assets
// @desc    Create a new asset
// @access  Private
router.post('/', auth, assetValidation, createAsset);

// @route   GET /api/assets
// @desc    Get all assets
// @access  Private
router.get('/', auth, getAssets);

// @route   GET /api/assets/:id
// @desc    Get a single asset
// @access  Private
router.get('/:id', auth, getAsset);

// @route   PUT /api/assets/:id
// @desc    Update an asset
// @access  Private
router.put('/:id', auth, updateAsset);

// @route   DELETE /api/assets/:id
// @desc    Delete an asset
// @access  Private
router.delete('/:id', auth, deleteAsset);

// @route   POST /api/assets/:id/maintenance
// @desc    Add maintenance record
// @access  Private
router.post('/:id/maintenance', auth, maintenanceValidation, addMaintenanceRecord);

module.exports = router;
