const Asset = require('../models/Asset');
const { validationResult } = require('express-validator');

// @desc    Create a new asset
// @route   POST /api/assets
// @access  Private
exports.createAsset = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation Error',
        errors: errors.array().map((e) => e.msg),
      });
    }

    const {
      assetId,
      name,
      category,
      description,
      location,
      value,
      purchaseDate,
      purchasePrice,
      warrantyExpiry,
      status,
      condition,
      serialNumber,
      manufacturer,
      model,
      maintenanceSchedule,
      notes,
      tags,
    } = req.body;

    // Generate assetId if not provided
    const finalAssetId = assetId || `AST-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

    // Handle location - can be string or object
    let locationData = location;
    if (typeof location === 'string') {
      locationData = { building: location, area: location };
    }

    const asset = new Asset({
      assetId: finalAssetId,
      name,
      category,
      description,
      location: locationData,
      value: value || 0,
      purchaseDate,
      purchasePrice,
      warrantyExpiry,
      status,
      condition,
      serialNumber,
      manufacturer,
      model,
      maintenanceSchedule,
      notes,
      tags,
      createdBy: req.userId,
    });

    await asset.save();

    res.status(201).json({
      success: true,
      message: 'Asset created successfully',
      asset,
    });
  } catch (error) {
    console.error('Create asset error:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating asset',
      error: error.message,
    });
  }
};

// @desc    Get all assets
// @route   GET /api/assets
// @access  Private
exports.getAssets = async (req, res) => {
  try {
    const { status, category, search, page = 1, limit = 10 } = req.query;

    const query = { createdBy: req.userId };

    if (status) query.status = status;
    if (category) query.category = category;
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { assetId: { $regex: search, $options: 'i' } },
      ];
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const assets = await Asset.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Asset.countDocuments(query);

    res.status(200).json({
      success: true,
      assets,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    console.error('Get assets error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching assets',
      error: error.message,
    });
  }
};

// @desc    Get a single asset
// @route   GET /api/assets/:id
// @access  Private
exports.getAsset = async (req, res) => {
  try {
    const asset = await Asset.findById(req.params.id)
      .populate('createdBy', 'fullName email')
      .populate('assignedTo', 'fullName email');

    if (!asset) {
      return res.status(404).json({
        success: false,
        message: 'Asset not found',
      });
    }

    res.status(200).json({
      success: true,
      asset,
    });
  } catch (error) {
    console.error('Get asset error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching asset',
      error: error.message,
    });
  }
};

// @desc    Update an asset
// @route   PUT /api/assets/:id
// @access  Private
exports.updateAsset = async (req, res) => {
  try {
    const {
      name,
      category,
      description,
      location,
      value,
      status,
      condition,
      serialNumber,
      manufacturer,
      model,
      maintenanceSchedule,
      notes,
      tags,
      assignedTo,
    } = req.body;

    const updateData = {
      name,
      category,
      description,
      location,
      value,
      status,
      condition,
      serialNumber,
      manufacturer,
      model,
      maintenanceSchedule,
      notes,
      tags,
      assignedTo,
      updatedAt: Date.now(),
    };

    // Remove undefined values
    Object.keys(updateData).forEach(
      (key) => updateData[key] === undefined && delete updateData[key]
    );

    const asset = await Asset.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    );

    if (!asset) {
      return res.status(404).json({
        success: false,
        message: 'Asset not found',
      });
    }

    res.status(200).json({
      success: true,
      message: 'Asset updated successfully',
      asset,
    });
  } catch (error) {
    console.error('Update asset error:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating asset',
      error: error.message,
    });
  }
};

// @desc    Delete an asset
// @route   DELETE /api/assets/:id
// @access  Private
exports.deleteAsset = async (req, res) => {
  try {
    const asset = await Asset.findByIdAndDelete(req.params.id);

    if (!asset) {
      return res.status(404).json({
        success: false,
        message: 'Asset not found',
      });
    }

    res.status(200).json({
      success: true,
      message: 'Asset deleted successfully',
    });
  } catch (error) {
    console.error('Delete asset error:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting asset',
      error: error.message,
    });
  }
};

// @desc    Add maintenance record
// @route   POST /api/assets/:id/maintenance
// @access  Private
exports.addMaintenanceRecord = async (req, res) => {
  try {
    const { date, type, description, cost, performedBy, notes } = req.body;

    const asset = await Asset.findById(req.params.id);

    if (!asset) {
      return res.status(404).json({
        success: false,
        message: 'Asset not found',
      });
    }

    asset.maintenanceHistory.push({
      date,
      type,
      description,
      cost,
      performedBy,
      notes,
    });

    asset.maintenanceSchedule.lastMaintenance = date;
    asset.updatedAt = Date.now();

    await asset.save();

    res.status(200).json({
      success: true,
      message: 'Maintenance record added successfully',
      asset,
    });
  } catch (error) {
    console.error('Add maintenance record error:', error);
    res.status(500).json({
      success: false,
      message: 'Error adding maintenance record',
      error: error.message,
    });
  }
};

// @desc    Get asset stats
// @route   GET /api/assets/stats
// @access  Private
exports.getAssetStats = async (req, res) => {
  try {
    const userId = req.userId;

    const stats = await Asset.aggregate([
      { $match: { createdBy: userId } },
      {
        $group: {
          _id: null,
          totalAssets: { $sum: 1 },
          active: {
            $sum: { $cond: [{ $eq: ['$status', 'active'] }, 1, 0] },
          },
          maintenance: {
            $sum: { $cond: [{ $eq: ['$status', 'maintenance'] }, 1, 0] },
          },
          inactive: {
            $sum: { $cond: [{ $eq: ['$status', 'inactive'] }, 1, 0] },
          },
          totalValue: { $sum: '$value' },
        },
      },
    ]);

    res.status(200).json({
      success: true,
      stats: stats[0] || {
        totalAssets: 0,
        active: 0,
        maintenance: 0,
        inactive: 0,
        totalValue: 0,
      },
    });
  } catch (error) {
    console.error('Get asset stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching asset stats',
      error: error.message,
    });
  }
};
