const mongoose = require('mongoose');

const buildingSchema = new mongoose.Schema(
  {
    buildingId: {
      type: String,
      required: [true, 'Building ID is required'],
      trim: true,
    },
    name: {
      type: String,
      required: [true, 'Building name is required'],
      trim: true,
    },
    property: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Property',
      required: true,
    },
    address: {
      type: String,
      trim: true,
    },
    floors: {
      type: Number,
      default: 1,
      min: [1, 'Must have at least 1 floor'],
    },
    totalUnits: {
      type: Number,
      required: [true, 'Number of units is required'],
      min: [1, 'Must have at least 1 unit'],
    },
    status: {
      type: String,
      enum: ['active', 'inactive', 'under-maintenance'],
      default: 'active',
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
    updatedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

// Compound unique index
buildingSchema.index({ property: 1, buildingId: 1 }, { unique: true });

module.exports = mongoose.model('Building', buildingSchema);
