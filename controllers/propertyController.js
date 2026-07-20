const Property = require('../models/Property');
const Building = require('../models/Building');
const Unit = require('../models/Unit');
const { validationResult } = require('express-validator');

// Location data for dropdowns
const locationData = {
  "United States": {
    "Alaska": ["Anchorage", "Fairbanks", "Juneau", "Sitka", "Ketchikan"],
    "New York": ["New York City", "Buffalo", "Rochester", "Albany", "Syracuse"],
    "California": ["Los Angeles", "San Francisco", "San Diego", "Sacramento", "San Jose"],
    "Texas": ["Houston", "Dallas", "Austin", "San Antonio", "Fort Worth"],
    "Florida": ["Miami", "Orlando", "Tampa", "Jacksonville", "Fort Lauderdale"],
  },
  "Canada": {
    "Ontario": ["Toronto", "Ottawa", "Mississauga", "Hamilton", "London"],
    "Quebec": ["Montreal", "Quebec City", "Laval", "Gatineau", "Longueuil"],
    "British Columbia": ["Vancouver", "Victoria", "Surrey", "Burnaby", "Richmond"],
    "Alberta": ["Calgary", "Edmonton", "Red Deer", "Lethbridge", "Medicine Hat"],
  },
  "United Kingdom": {
    "England": ["London", "Manchester", "Birmingham", "Liverpool", "Leeds"],
    "Scotland": ["Edinburgh", "Glasgow", "Aberdeen", "Dundee", "Inverness"],
    "Wales": ["Cardiff", "Swansea", "Newport", "Wrexham", "Barry"],
    "Northern Ireland": ["Belfast", "Derry", "Lisburn", "Newry", "Bangor"],
  },
  "Australia": {
    "New South Wales": ["Sydney", "Newcastle", "Wollongong", "Central Coast", "Coffs Harbour"],
    "Victoria": ["Melbourne", "Geelong", "Ballarat", "Bendigo", "Shepparton"],
    "Queensland": ["Brisbane", "Gold Coast", "Sunshine Coast", "Cairns", "Townsville"],
    "Western Australia": ["Perth", "Fremantle", "Mandurah", "Bunbury", "Geraldton"],
  },
};

// @desc    Get dropdown data for property form
// @route   GET /api/properties/dropdown-data
// @access  Public
exports.getDropdownData = async (req, res) => {
  try {
    const countries = Object.keys(locationData);
    const states = {};
    const cities = {};

    for (const country of countries) {
      states[country] = Object.keys(locationData[country]);
      cities[country] = locationData[country];
    }

    res.status(200).json({
      success: true,
      data: {
        countries,
        states,
        cities,
      },
    });
  } catch (error) {
    console.error('Get dropdown data error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching dropdown data',
      error: error.message,
    });
  }
};

// @desc    Create multiple properties
// @route   POST /api/properties/bulk
// @access  Private
exports.createBulkProperties = async (req, res) => {
  try {
    const { properties } = req.body;

    if (!properties || !Array.isArray(properties) || properties.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Properties array is required',
      });
    }

    const createdProperties = [];
    const errors = [];

    for (let i = 0; i < properties.length; i++) {
      const { propertyId, name, address, city, state, zipCode, country, buildings, units } = properties[i];

      // Validate required fields (propertyId is now optional)
      if (!name || !address || !city || !state || !zipCode) {
        errors.push({
          index: i,
          propertyId: propertyId || `Property ${i + 1}`,
          message: 'Missing required fields',
        });
        continue;
      }

      let finalPropertyId = propertyId;
      if (!finalPropertyId) {
        finalPropertyId = `PRP-${Date.now().toString().slice(-6)}${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}`;
      }

      // Check if property ID already exists
      const existingProperty = await Property.findOne({ propertyId: finalPropertyId });
      if (existingProperty) {
        errors.push({
          index: i,
          propertyId: finalPropertyId,
          message: 'Property ID already exists',
        });
        continue;
      }

      try {
        const property = new Property({
          propertyId: finalPropertyId,
          name,
          address,
          city,
          state,
          zipCode,
          country: country || 'United States',
          buildings: buildings || 0,
          units: units || 0,
          owner: req.userId,
        });

        await property.save();
        createdProperties.push(property);
      } catch (err) {
        errors.push({
          index: i,
          propertyId,
          message: err.message,
        });
      }
    }

    if (createdProperties.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No properties were created',
        errors,
      });
    }

    res.status(201).json({
      success: true,
      message: `${createdProperties.length} properties created successfully`,
      properties: createdProperties,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    console.error('Create bulk properties error:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating properties',
      error: error.message,
    });
  }
};

// @desc    Create a new property
// @route   POST /api/properties
// @access  Private
exports.createProperty = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation Error',
        errors: errors.array().map((e) => e.msg),
      });
    }

    const { propertyId, name, address, city, state, zipCode, country, buildings, units } = req.body;

    let finalPropertyId = propertyId;
    if (!finalPropertyId) {
      finalPropertyId = `PRP-${Date.now().toString().slice(-6)}${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}`;
    }

    // Check if property ID already exists
    const existingProperty = await Property.findOne({ propertyId: finalPropertyId });
    if (existingProperty) {
      return res.status(400).json({
        success: false,
        message: 'Property ID already exists',
      });
    }

    const property = new Property({
      propertyId: finalPropertyId,
      name,
      address,
      city,
      state,
      zipCode,
      country: country || 'United States',
      buildings,
      units,
      owner: req.userId,
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

// @desc    Get all properties for user
// @route   GET /api/properties
// @access  Private
exports.getProperties = async (req, res) => {
  try {
    const { search, state, city, status, page = 1, limit = 10 } = req.query;

    const query = { owner: req.userId };

    // Search by name or property ID
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { propertyId: { $regex: search, $options: 'i' } },
      ];
    }

    if (state) query.state = state;
    if (city) query.city = city;
    if (status) query.status = status;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const properties = await Property.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Property.countDocuments(query);

    res.status(200).json({
      success: true,
      properties,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    console.error('Get properties error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching properties',
      error: error.message,
    });
  }
};

// @desc    Get a single property
// @route   GET /api/properties/:id
// @access  Private
exports.getProperty = async (req, res) => {
  try {
    const id = req.params.id;
    let property = null;

    // 1. Try finding by MongoDB _id (if valid ObjectId format)
    if (id.match(/^[0-9a-fA-F]{24}$/)) {
      property = await Property.findOne({
        _id: id,
        owner: req.userId,
      });
    }

    // 2. Try finding by custom propertyId field if not found by _id
    if (!property) {
      property = await Property.findOne({
        propertyId: id,
        owner: req.userId,
      });
    }

    if (!property) {
      return res.status(404).json({
        success: false,
        message: 'Property not found',
      });
    }

    res.status(200).json({
      success: true,
      property,
    });
  } catch (error) {
    console.error('Get property error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching property',
      error: error.message,
    });
  }
};

// @desc    Update a property
// @route   PUT /api/properties/:id
// @access  Private
exports.updateProperty = async (req, res) => {
  try {
    const { propertyId, name, address, city, state, zipCode, country, buildings, units, status, buildingDetails } = req.body;

    if (propertyId) {
      const existingProperty = await Property.findOne({ propertyId, _id: { $ne: req.params.id } });
      if (existingProperty) {
        return res.status(400).json({
          success: false,
          message: 'Property ID already exists',
        });
      }
    }

    const updateData = {
      updatedAt: Date.now(),
    };
    if (propertyId !== undefined) updateData.propertyId = propertyId;
    if (name !== undefined) updateData.name = name;
    if (address !== undefined) updateData.address = address;
    if (city !== undefined) updateData.city = city;
    if (state !== undefined) updateData.state = state;
    if (zipCode !== undefined) updateData.zipCode = zipCode;
    if (country !== undefined) updateData.country = country;
    if (buildings !== undefined) updateData.buildings = buildings;
    if (units !== undefined) updateData.units = units;
    if (status !== undefined) updateData.status = status;
    if (buildingDetails !== undefined) updateData.buildingDetails = buildingDetails;

    const property = await Property.findOneAndUpdate(
      { _id: req.params.id, owner: req.userId },
      updateData,
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

// @desc    Delete a property
// @route   DELETE /api/properties/:id
// @access  Private
exports.deleteProperty = async (req, res) => {
  try {
    const property = await Property.findOneAndDelete({
      _id: req.params.id,
      owner: req.userId,
    });

    if (!property) {
      return res.status(404).json({
        success: false,
        message: 'Property not found',
      });
    }

    // Also delete associated buildings and units
    await Building.deleteMany({ property: req.params.id });
    await Unit.deleteMany({ property: req.params.id });

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

// @desc    Get all properties (for management - all users)
// @route   GET /api/properties/all
// @access  Private (Management only)
exports.getAllProperties = async (req, res) => {
  try {
    const { search, state, city, status, page = 1, limit = 10 } = req.query;

    const query = {};

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { propertyId: { $regex: search, $options: 'i' } },
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

    res.status(200).json({
      success: true,
      properties,
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

// @desc    Set property ready for inspection
// @route   PATCH /api/properties/:id/ready
// @access  Private
exports.setReadyForInspection = async (req, res) => {
  try {
    const property = await Property.findOneAndUpdate(
      { _id: req.params.id, owner: req.userId },
      { status: 'ready-for-inspection', updatedAt: Date.now() },
      { new: true }
    );

    if (!property) {
      return res.status(404).json({
        success: false,
        message: 'Property not found',
      });
    }

    res.status(200).json({
      success: true,
      message: 'Property marked as ready for inspection',
      property,
    });
  } catch (error) {
    console.error('Set ready for inspection error:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating property status',
      error: error.message,
    });
  }
};

// @desc    Get property stats
// @route   GET /api/properties/stats
// @access  Private
exports.getPropertyStats = async (req, res) => {
  try {
    const userId = req.userId;

    const stats = await Property.aggregate([
      { $match: { owner: userId } },
      {
        $group: {
          _id: null,
          totalProperties: { $sum: 1 },
          totalBuildings: { $sum: '$buildings' },
          totalUnits: { $sum: '$units' },
          activeProperties: {
            $sum: { $cond: [{ $eq: ['$status', 'active'] }, 1, 0] },
          },
          readyForInspection: {
            $sum: { $cond: [{ $eq: ['$status', 'ready-for-inspection'] }, 1, 0] },
          },
        },
      },
    ]);

    res.status(200).json({
      success: true,
      stats: stats[0] || {
        totalProperties: 0,
        totalBuildings: 0,
        totalUnits: 0,
        activeProperties: 0,
        readyForInspection: 0,
      },
    });
  } catch (error) {
    console.error('Get property stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching property stats',
      error: error.message,
    });
  }
};
// @desc    Toggle property hold status
// @route   PATCH /api/properties/:id/hold
// @access  Private
exports.holdProperty = async (req, res) => {
  try {
    const property = await Property.findOne({ _id: req.params.id, owner: req.userId });

    if (!property) {
      return res.status(404).json({
        success: false,
        message: 'Property not found',
      });
    }

    // Toggle status between 'hold' and 'active' (or previous state)
    const newStatus = property.status === 'hold' ? 'active' : 'hold';
    property.status = newStatus;
    property.updatedAt = Date.now();

    await property.save();

    res.status(200).json({
      success: true,
      message: `Property status updated to ${newStatus}`,
      property,
    });
  } catch (error) {
    console.error('Hold property error:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating property status',
      error: error.message,
    });
  }
};
