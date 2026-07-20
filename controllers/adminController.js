const User = require('../models/User');
const Property = require('../models/Property');
const Inspection = require('../models/Inspection');
const { validationResult } = require('express-validator');

// @desc    Get admin dashboard statistics
// @route   GET /api/admin/dashboard/stats
// @access  Private/Admin
exports.getDashboardStats = async (req, res) => {
  try {
    // Get total counts
    const totalProperties = await Property.countDocuments();
    const totalInspections = await Inspection.countDocuments();
    const totalInspectors = await User.countDocuments({ role: 'inspector' });
    
    // Get inspection statistics
    const inspectionStats = await Inspection.aggregate([
      {
        $group: {
          _id: null,
          totalInspections: { $sum: 1 },
          passedInspections: {
            $sum: { $cond: [{ $eq: ['$result', 'pass'] }, 1, 0] },
          },
          failedInspections: {
            $sum: { $cond: [{ $eq: ['$result', 'fail'] }, 1, 0] },
          },
          pendingInspections: {
            $sum: { $cond: [{ $eq: ['$status', 'scheduled'] }, 1, 0] },
          },
          completedInspections: {
            $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] },
          },
          averageScore: { $avg: '$score' },
        },
      },
    ]);

    // Get active inspectors count
    const activeInspectors = await User.countDocuments({ 
      role: 'inspector', 
      isActive: true 
    });

    const stats = inspectionStats[0] || {
      totalInspections: 0,
      passedInspections: 0,
      failedInspections: 0,
      pendingInspections: 0,
      completedInspections: 0,
      averageScore: 0,
    };

    res.status(200).json({
      success: true,
      stats: {
        totalProperties,
        totalInspections: stats.totalInspections,
        passedInspections: stats.passedInspections,
        failedInspections: stats.failedInspections,
        pendingInspections: stats.pendingInspections,
        completedInspections: stats.completedInspections,
        activeInspectors,
        totalInspectors,
        averageScore: Math.round(stats.averageScore || 0),
      },
    });
  } catch (error) {
    console.error('Get dashboard stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching dashboard statistics',
      error: error.message,
    });
  }
};

// @desc    Get all properties across the system
// @route   GET /api/admin/properties
// @access  Private/Admin
exports.getAllProperties = async (req, res) => {
  try {
    const { search, state, city, status, page = 1, limit = 50 } = req.query;

    const query = {};

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { propertyId: { $regex: search, $options: 'i' } },
        { address: { $regex: search, $options: 'i' } },
      ];
    }

    if (state) query.state = state;
    if (city) query.city = city;
    if (status) query.status = status;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const properties = await Property.find(query)
      .populate('owner', 'fullName email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Property.countDocuments(query);

    // Transform data to match admin portal format
    const transformedProperties = properties.map(property => ({
      id: property.propertyId || property._id,
      _id: property._id,
      name: property.name,
      buildings: property.buildings || 0,
      units: property.units || 0,
      address: property.address,
      city: property.city,
      state: property.state,
      zip: property.zipCode,
      status: property.status,
      owner: property.owner,
      createdAt: property.createdAt,
      updatedAt: property.updatedAt,
    }));

    res.status(200).json({
      success: true,
      properties: transformedProperties,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    console.error('Get all properties error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching properties',
      error: error.message,
    });
  }
};

// @desc    Get all inspections across the system
// @route   GET /api/admin/inspections
// @access  Private/Admin
exports.getAllInspections = async (req, res) => {
  try {
    const { search, status, dateFilter, page = 1, limit = 50 } = req.query;

    const query = {};

    if (status) query.status = status;
    
    if (dateFilter) {
      const startDate = new Date(dateFilter + '-01');
      const endDate = new Date(startDate.getFullYear(), startDate.getMonth() + 1, 0);
      query.scheduledDate = {
        $gte: startDate,
        $lte: endDate,
      };
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    let inspections = await Inspection.find(query)
      .populate('property', 'propertyId name address city state')
      .populate('inspector', 'fullName email')
      .sort({ scheduledDate: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    // Debug: Log the first inspection to see what data we have
    if (inspections.length > 0) {
      const sample = inspections[0];
      console.log('Sample inspection from DB:', {
        id: sample._id,
        findings: sample.findings?.length || 0,
        deficiencies: sample.deficiencies?.length || 0,
        sampleFinding: sample.findings?.[0],
        sampleDeficiency: sample.deficiencies?.[0],
        rawFindings: JSON.stringify(sample.findings).substring(0, 200),
        rawDeficiencies: JSON.stringify(sample.deficiencies).substring(0, 200)
      });
      
      // Count inspections with findings/deficiencies
      const withFindings = inspections.filter(i => i.findings && i.findings.length > 0).length;
      const withDeficiencies = inspections.filter(i => i.deficiencies && i.deficiencies.length > 0).length;
      const withImages = inspections.filter(i => 
        (i.findings && i.findings.some(f => f.imageUrl)) || 
        (i.deficiencies && i.deficiencies.some(d => d.photos && d.photos.length > 0))
      ).length;
      
      console.log('Inspection statistics:', {
        total: inspections.length,
        withFindings,
        withDeficiencies,
        withImages
      });
    }

    // Apply search filter after population
    if (search) {
      inspections = inspections.filter(inspection => {
        const searchLower = search.toLowerCase();
        return (
          inspection.property?.name?.toLowerCase().includes(searchLower) ||
          inspection.property?.propertyId?.toLowerCase().includes(searchLower) ||
          inspection.inspector?.fullName?.toLowerCase().includes(searchLower) ||
          inspection.inspectionId?.toLowerCase().includes(searchLower)
        );
      });
    }

    const total = await Inspection.countDocuments(query);

    // Transform data to match admin portal format - PRESERVE ORIGINAL FINDINGS AND DEFICIENCIES
    const transformedInspections = inspections.map(inspection => {
      const findings = inspection.findings || [];
      const deficiencies = inspection.deficiencies || [];
      const criticalCount = deficiencies.filter(d => d.severity === 'critical' || d.severity === 'life-threatening').length;
      const nonCriticalCount = deficiencies.filter(d => d.severity !== 'critical' && d.severity !== 'life-threatening').length;
      
      console.log(`Inspection ${inspection._id}: findings=${findings.length}, deficiencies=${deficiencies.length}, critical=${criticalCount}, nonCritical=${nonCriticalCount}`);
      
      return {
        _id: inspection._id,
        id: inspection.inspectionId || inspection._id,
        propertyName: inspection.property?.name || 'Unknown Property',
        property: {
          _id: inspection.property?._id,
          name: inspection.property?.name || 'Unknown Property'
        },
        unit: {
          _id: inspection.unit?._id || inspection._id,
          unitNumber: inspection.unit?.unitNumber || 'All Units'
        },
        inspector: {
          _id: inspection.inspector?._id,
          name: inspection.inspector?.fullName || 'Unknown Inspector'
        },
        propertyId: inspection.property?.propertyId || 'N/A',
        inspectorName: inspection.inspector?.fullName || 'Unknown Inspector',
        inspectionDate: inspection.scheduledDate?.toISOString().split('T')[0] || new Date().toISOString().split('T')[0],
        scheduledDate: inspection.scheduledDate?.toISOString() || new Date().toISOString(),
        score: inspection.score || 0,
        complianceScore: inspection.complianceScore || inspection.score || 0,
        status: inspection.result === 'pass' ? 'Passed' : 
                inspection.result === 'fail' ? 'Failed' : 
                inspection.status === 'completed' ? 'Pending Review' : 'Pending Review',
        result: inspection.result,
        findings: findings, // PRESERVE ORIGINAL FINDINGS WITH IMAGES
        deficiencies: deficiencies, // PRESERVE ORIGINAL DEFICIENCIES WITH PHOTOS
        notes: inspection.notes || '',
        criticalIssues: criticalCount,
        nonCriticalIssues: nonCriticalCount,
        reportUrl: '#',
        originalStatus: inspection.status,
      };
    });

    res.status(200).json({
      success: true,
      inspections: transformedInspections,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    console.error('Get all inspections error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching inspections',
      error: error.message,
    });
  }
};

// @desc    Debug inspection data
// @route   GET /api/admin/inspections/:id/debug
// @access  Private/Admin
exports.debugInspection = async (req, res) => {
  try {
    const inspection = await Inspection.findById(req.params.id);
    
    if (!inspection) {
      return res.status(404).json({
        success: false,
        message: 'Inspection not found',
      });
    }

    res.status(200).json({
      success: true,
      debug: {
        id: inspection._id,
        findings: {
          count: inspection.findings?.length || 0,
          data: inspection.findings || [],
          sample: inspection.findings?.[0] || null
        },
        deficiencies: {
          count: inspection.deficiencies?.length || 0,
          data: inspection.deficiencies || [],
          sample: inspection.deficiencies?.[0] || null
        },
        rawData: {
          findings: inspection.findings,
          deficiencies: inspection.deficiencies
        }
      }
    });
  } catch (error) {
    console.error('Debug inspection error:', error);
    res.status(500).json({
      success: false,
      message: 'Error debugging inspection',
      error: error.message,
    });
  }
};

// @desc    Get single inspection for management (with full data)
// @route   GET /api/admin/inspections/:id
// @access  Private/Admin
exports.getInspectionForManagement = async (req, res) => {
  try {
    const { id } = req.params;
    
    // Validate ObjectId format
    if (!id.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid inspection ID format',
      });
    }

    console.log('Fetching inspection for management:', id);

    const inspection = await Inspection.findById(id)
      .populate('property', 'propertyId name address city state zipCode buildings units')
      .populate('building', 'buildingId name floors totalUnits')
      .populate('unit', 'unitId unitNumber floor bedrooms bathrooms')
      .populate('inspector', 'fullName email')
      .populate('createdBy', 'fullName email');

    if (!inspection) {
      console.log('Inspection not found:', id);
      return res.status(404).json({
        success: false,
        message: 'Inspection not found',
      });
    }

    // Ensure findings and deficiencies are properly formatted for management portal
    const inspectionData = inspection.toObject();
    
    // If findings exist, ensure they have the correct structure for PDF generation
    if (inspectionData.findings && inspectionData.findings.length > 0) {
      inspectionData.findings = inspectionData.findings.map(finding => ({
        ...finding,
        // Ensure imageUrl is mapped to imageUri for compatibility with PDF service
        imageUri: finding.imageUrl || finding.imageUri,
        // Ensure all required fields are present
        id: finding.id || finding._id,
        location: finding.location || finding.room || 'Unknown',
        description: finding.description || finding.title || 'No description',
        severity: finding.severity || 'moderate',
        category: finding.category || 'general',
        nspireCode: finding.nspireCode || 'HS-12',
        recommendedAction: finding.recommendedAction || finding.recommendation || finding.comments || ''
      }));
    }

    // If deficiencies exist, ensure they have the correct structure
    if (inspectionData.deficiencies && inspectionData.deficiencies.length > 0) {
      inspectionData.deficiencies = inspectionData.deficiencies.map(deficiency => ({
        ...deficiency,
        // Ensure imageUrl is mapped to imageUri for compatibility
        imageUri: deficiency.photos?.[0]?.url || deficiency.imageUrl || deficiency.imageUri,
        // Ensure all required fields are present
        id: deficiency.id || deficiency._id,
        location: deficiency.location || deficiency.room || 'Unknown',
        description: deficiency.description || deficiency.title || 'No description',
        severity: deficiency.severity || 'moderate',
        category: deficiency.category || 'general',
        nspireCode: deficiency.nspireCode || 'HS-12'
      }));
    }

    console.log('Management inspection fetch:', {
      id: inspectionData._id,
      findings: inspectionData.findings?.length || 0,
      deficiencies: inspectionData.deficiencies?.length || 0,
      sampleFinding: inspectionData.findings?.[0],
      sampleDeficiency: inspectionData.deficiencies?.[0],
      findingsWithImages: inspectionData.findings?.filter(f => f.imageUri || f.imageUrl).length || 0,
      deficienciesWithImages: inspectionData.deficiencies?.filter(d => d.imageUri || d.imageUrl || (d.photos && d.photos.length > 0)).length || 0
    });

    res.status(200).json({
      success: true,
      inspection: inspectionData,
    });
  } catch (error) {
    console.error('Get management inspection error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching inspection for management',
      error: error.message,
    });
  }
};

// @desc    Get all inspectors with their details
// @route   GET /api/admin/inspectors
// @access  Private/Admin
exports.getAllInspectors = async (req, res) => {
  try {
    const { search, status, page = 1, limit = 50 } = req.query;

    const query = { role: 'inspector' };

    if (search) {
      query.$or = [
        { fullName: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
      ];
    }

    if (status) {
      query.isActive = status === 'Active';
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const inspectors = await User.find(query)
      .select('-password')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await User.countDocuments(query);

    // Get property assignments for each inspector
    const inspectorsWithStats = await Promise.all(
      inspectors.map(async (inspector) => {
        const assignedProperties = await Property.countDocuments({ owner: inspector._id });
        const lastInspection = await Inspection.findOne({ inspector: inspector._id })
          .sort({ scheduledDate: -1 })
          .select('scheduledDate');

        return {
          id: `INS-${inspector._id.toString().slice(-6).toUpperCase()}`,
          _id: inspector._id,
          name: inspector.fullName,
          email: inspector.email,
          phone: inspector.phone || '+1 (555) 000-0000',
          certificationLevel: inspector.certificationLevel || 'Junior',
          assignedProperties,
          status: inspector.isActive ? 'Active' : 'Inactive',
          hireDate: inspector.createdAt?.toISOString().split('T')[0] || '2023-01-01',
          lastInspection: lastInspection?.scheduledDate?.toISOString().split('T')[0] || 'Never',
          role: inspector.role,
          isActive: inspector.isActive,
        };
      })
    );

    res.status(200).json({
      success: true,
      inspectors: inspectorsWithStats,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    console.error('Get all inspectors error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching inspectors',
      error: error.message,
    });
  }
};

// @desc    Create a new property (admin)
// @route   POST /api/admin/properties
// @access  Private/Admin
exports.createProperty = async (req, res) => {
  try {
    const { propertyId, name, address, city, state, zipCode, buildings, units, ownerId } = req.body;

    // Check if property ID already exists
    const existingProperty = await Property.findOne({ propertyId });
    if (existingProperty) {
      return res.status(400).json({
        success: false,
        message: 'Property ID already exists',
      });
    }

    // Verify owner exists if provided
    let owner = req.userId; // Default to current admin user
    if (ownerId) {
      const ownerUser = await User.findById(ownerId);
      if (ownerUser) {
        owner = ownerId;
      }
    }

    const property = new Property({
      propertyId,
      name,
      address,
      city,
      state,
      zipCode,
      buildings: buildings || 0,
      units: units || 0,
      owner,
      status: 'active',
    });

    await property.save();

    res.status(201).json({
      success: true,
      message: 'Property created successfully',
      property,
    });
  } catch (error) {
    console.error('Create property error:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating property',
      error: error.message,
    });
  }
};

// @desc    Update any property (admin)
// @route   PUT /api/admin/properties/:id
// @access  Private/Admin
exports.updateProperty = async (req, res) => {
  try {
    const { name, address, city, state, zipCode, buildings, units, status } = req.body;

    const property = await Property.findByIdAndUpdate(
      req.params.id,
      {
        name,
        address,
        city,
        state,
        zipCode,
        buildings,
        units,
        status,
        updatedAt: Date.now(),
      },
      { new: true, runValidators: true }
    );

    if (!property) {
      return res.status(404).json({
        success: false,
        message: 'Property not found',
      });
    }

    res.status(200).json({
      success: true,
      message: 'Property updated successfully',
      property,
    });
  } catch (error) {
    console.error('Update property error:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating property',
      error: error.message,
    });
  }
};

// @desc    Delete any property (admin)
// @route   DELETE /api/admin/properties/:id
// @access  Private/Admin
exports.deleteProperty = async (req, res) => {
  try {
    const property = await Property.findByIdAndDelete(req.params.id);

    if (!property) {
      return res.status(404).json({
        success: false,
        message: 'Property not found',
      });
    }

    // Also delete associated inspections
    await Inspection.deleteMany({ property: req.params.id });

    res.status(200).json({
      success: true,
      message: 'Property deleted successfully',
    });
  } catch (error) {
    console.error('Delete property error:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting property',
      error: error.message,
    });
  }
};

// @desc    Update user status (activate/deactivate)
// @route   PUT /api/admin/users/:id/status
// @access  Private/Admin
exports.updateUserStatus = async (req, res) => {
  try {
    const { isActive } = req.body;

    const user = await User.findByIdAndUpdate(
      req.params.id,
      { isActive, updatedAt: Date.now() },
      { new: true }
    ).select('-password');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    res.status(200).json({
      success: true,
      message: `User ${isActive ? 'activated' : 'deactivated'} successfully`,
      user,
    });
  } catch (error) {
    console.error('Update user status error:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating user status',
      error: error.message,
    });
  }
};

// @desc    Delete a user
// @route   DELETE /api/admin/users/:id
// @access  Private/Admin
exports.deleteUser = async (req, res) => {
  try {
    const user = await User.findByIdAndDelete(req.params.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    // Reassign or delete associated data
    await Property.updateMany({ owner: req.params.id }, { owner: null });
    await Inspection.updateMany({ inspector: req.params.id }, { inspector: null });

    res.status(200).json({
      success: true,
      message: 'User deleted successfully',
    });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting user',
      error: error.message,
    });
  }
};

// @desc    Get comprehensive system statistics
// @route   GET /api/admin/system/stats
// @access  Private/Admin
exports.getSystemStats = async (req, res) => {
  try {
    const [
      totalUsers,
      totalProperties,
      totalInspections,
      usersByRole,
      propertiesByState,
      inspectionsByMonth,
    ] = await Promise.all([
      User.countDocuments(),
      Property.countDocuments(),
      Inspection.countDocuments(),
      User.aggregate([
        { $group: { _id: '$role', count: { $sum: 1 } } },
      ]),
      Property.aggregate([
        { $group: { _id: '$state', count: { $sum: 1 } } },
      ]),
      Inspection.aggregate([
        {
          $group: {
            _id: {
              year: { $year: '$scheduledDate' },
              month: { $month: '$scheduledDate' },
            },
            count: { $sum: 1 },
          },
        },
        { $sort: { '_id.year': -1, '_id.month': -1 } },
        { $limit: 12 },
      ]),
    ]);

    res.status(200).json({
      success: true,
      stats: {
        totalUsers,
        totalProperties,
        totalInspections,
        usersByRole,
        propertiesByState,
        inspectionsByMonth,
      },
    });
  } catch (error) {
    console.error('Get system stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching system statistics',
      error: error.message,
    });
  }
};