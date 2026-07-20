const express = require('express');
const router = express.Router();
const { auth, authorize } = require('../middleware/auth');
const {
  getDashboardStats,
  getAllProperties,
  getAllInspections,
  debugInspection,
  getInspectionForManagement,
  getAllInspectors,
  createProperty,
  updateProperty,
  deleteProperty,
  updateUserStatus,
  deleteUser,
  getSystemStats,
} = require('../controllers/adminController');

// @route   GET /api/admin/dashboard/stats
// @desc    Get admin dashboard statistics
// @access  Private/Admin
router.get('/dashboard/stats', auth, authorize('admin', 'management', 'supervisor'), getDashboardStats);

// @route   GET /api/admin/properties
// @desc    Get all properties across the system
// @access  Private/Admin
router.get('/properties', auth, authorize('admin', 'management', 'supervisor'), getAllProperties);

// @route   POST /api/admin/properties
// @desc    Create a new property (admin)
// @access  Private/Admin
router.post('/properties', auth, authorize('admin', 'management', 'supervisor'), createProperty);

// @route   PUT /api/admin/properties/:id
// @desc    Update any property (admin)
// @access  Private/Admin
router.put('/properties/:id', auth, authorize('admin', 'management', 'supervisor'), updateProperty);

// @route   DELETE /api/admin/properties/:id
// @desc    Delete any property (admin)
// @access  Private/Admin
router.delete('/properties/:id', auth, authorize('admin', 'management', 'supervisor'), deleteProperty);

// @route   GET /api/admin/inspections
// @desc    Get all inspections across the system
// @access  Private/Admin
router.get('/inspections', auth, authorize('admin', 'management', 'supervisor'), getAllInspections);

// @route   GET /api/admin/inspections/:id/debug
// @desc    Debug inspection data
// @access  Private/Admin
router.get('/inspections/:id/debug', auth, authorize('admin', 'management', 'supervisor'), debugInspection);

// @route   GET /api/admin/inspections/:id/test
// @desc    Test route to verify admin routes are working
// @access  Private/Admin
router.get('/inspections/:id/test', auth, authorize('admin', 'management', 'supervisor'), (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Admin inspection route is working',
    inspectionId: req.params.id,
    user: req.user?.fullName || 'Unknown',
    timestamp: new Date().toISOString()
  });
});

// @route   GET /api/admin/inspections/:id
// @desc    Get single inspection for management
// @access  Private/Admin
router.get('/inspections/:id', auth, authorize('admin', 'management', 'supervisor'), getInspectionForManagement);

// @route   GET /api/admin/inspectors
// @desc    Get all inspectors with their details
// @access  Private/Admin
router.get('/inspectors', auth, authorize('admin', 'management', 'supervisor'), getAllInspectors);

// @route   PUT /api/admin/users/:id/status
// @desc    Update user status (activate/deactivate)
// @access  Private/Admin
router.put('/users/:id/status', auth, authorize('admin', 'management', 'supervisor'), updateUserStatus);

// @route   DELETE /api/admin/users/:id
// @desc    Delete a user
// @access  Private/Admin
router.delete('/users/:id', auth, authorize('admin', 'management', 'supervisor'), deleteUser);

// @route   GET /api/admin/system/stats
// @desc    Get comprehensive system statistics
// @access  Private/Admin
router.get('/system/stats', auth, authorize('admin', 'management', 'supervisor'), getSystemStats);

module.exports = router;