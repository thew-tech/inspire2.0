const express = require('express');
const router = express.Router();
const { check } = require('express-validator');
const { auth, authorize } = require('../middleware/auth');
const {
  createInspection,
  getInspections,
  getInspection,
  updateInspection,
  completeInspection,
  deleteInspection,
  getInspectionStats,
  createInspectionRequest,
  getInspectionRequests,
  generateShareableLink,
  getSharedReport,
  generateNSPIREPDF,
  previewNSPIREReport,
  sampleInspectionUnits,
  generatePDFFromData,
  completeInspectionByProperty,
  saveProgress,
  getProgress,
  getInspectedBuildings,
  getUnitInspectionStatus,
  generateExcelFromData
} = require('../controllers/inspectionController');

// Validation rules
const inspectionValidation = [
  check('property', 'Property ID is required').notEmpty(),
  check('scheduledDate', 'Scheduled date is required').notEmpty(),
];

const requestValidation = [
  check('purpose', 'Purpose is required').notEmpty(),
  check('buildings', 'Number of buildings is required').isInt({ min: 1 }),
  check('units', 'Number of units is required').isInt({ min: 1 }),
  check('state', 'State is required').notEmpty(),
  check('zipCode', 'Zip code is required').notEmpty(),
];

// @route   GET /api/inspections/stats
// @desc    Get inspection stats
// @access  Private
router.get('/stats', auth, getInspectionStats);

// @route   GET /api/inspections/progress
// @desc    Get saved inspection progress
// @access  Private
router.get('/progress', auth, getProgress);

// @route   GET /api/inspections/buildings/:propertyId
// @desc    Get all inspected buildings for a property grouped by backend building inspection ID
// @access  Private
router.get('/buildings/:propertyId', auth, getInspectedBuildings);

// @route   GET /api/inspections/unit-status
// @desc    Get backend-managed inspected unit statuses for a property building
// @access  Private
router.get('/unit-status', auth, getUnitInspectionStatus);

// @route   POST /api/inspections/progress
// @desc    Save inspection progress draft
// @access  Private
router.post('/progress', auth, saveProgress);

// @route   PUT /api/inspections/progress
// @desc    Update inspection progress draft (upsert)
// @access  Private
router.put('/progress', auth, saveProgress);

// @route   GET /api/inspections/shared/:token
// @desc    Get shared report by token (public access)
// @access  Public
router.get('/shared/:token', getSharedReport);

// @route   POST /api/inspections
// @desc    Create a new inspection
// @access  Private
router.post('/', auth, inspectionValidation, createInspection);

// @route   GET /api/inspections
// @desc    Get all inspections for user
// @access  Private
router.get('/', auth, getInspections);

// @route   GET /api/inspections/:id
// @desc    Get a single inspection
// @access  Private
router.get('/:id', auth, getInspection);

// @route   GET /api/inspections/:id/nspire-pdf
// @desc    Generate and download NSPIRE PDF report
// @access  Private
router.get('/:id/nspire-pdf', auth, generateNSPIREPDF);

// @route   GET /api/inspections/:id/nspire-preview
// @desc    Preview NSPIRE report HTML
// @access  Private
router.get('/:id/nspire-preview', auth, previewNSPIREReport);

// @route   PUT /api/inspections/complete
// @desc    Complete inspection by property ID (create or update)
// @access  Private
router.put('/complete', auth, completeInspectionByProperty);

// @route   PUT /api/inspections/:id
// @desc    Update an inspection
// @access  Private
router.put('/:id', auth, updateInspection);

// @route   PATCH /api/inspections/:id/complete
// @desc    Complete an inspection
// @access  Private
router.patch('/:id/complete', auth, completeInspection);

// @route   POST /api/inspections/:id/share
// @desc    Generate shareable report link
// @access  Private
router.post('/:id/share', auth, generateShareableLink);

// @route   DELETE /api/inspections/:id
// @desc    Delete an inspection
// @access  Private
router.delete('/:id', auth, deleteInspection);

// @route   POST /api/inspections/sample-units
// @desc    Sample random units for NSPIRE inspection
// @access  Private
router.post('/sample-units', auth, sampleInspectionUnits);

// @route   POST /api/inspections/generate-excel
// @desc    Generate a fancy Excel report from provided JSON data
// @access  Private
router.post('/generate-excel', auth, generateExcelFromData);

// @route   POST /api/inspections/generate-pdf
// @desc    Generate PDF from provided JSON data
// @access  Private
router.post('/generate-pdf', auth, generatePDFFromData);

// @route   POST /api/inspections/complete
// @desc    Complete inspection by property ID (create or update)
// @access  Private
router.post('/complete', auth, completeInspectionByProperty);

// ============= INSPECTION REQUEST ROUTES =============

// @route   POST /api/inspections/request
// @desc    Create an inspection request
// @access  Private
router.post('/request', auth, requestValidation, createInspectionRequest);

// @route   GET /api/inspections/requests
// @desc    Get all inspection requests
// @access  Private
router.get('/requests', auth, getInspectionRequests);

module.exports = router;
