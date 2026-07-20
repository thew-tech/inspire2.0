const mongoose = require('mongoose');

const unitSchema = new mongoose.Schema(
  {
    unitId: {
      type: String,
      required: [true, 'Unit ID is required'],
      trim: true,
    },
    unitNumber: {
      type: String,
      required: [true, 'Unit number is required'],
      trim: true,
    },
    building: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Building',
      required: true,
    },
    property: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Property',
      required: true,
    },
    floor: {
      type: Number,
      default: 1,
    },
    bedrooms: {
      type: Number,
      default: 1,
    },
    bathrooms: {
      type: Number,
      default: 1,
    },
    squareFeet: {
      type: Number,
      default: 0,
    },
    status: {
      type: String,
      enum: ['occupied', 'vacant', 'under-maintenance', 'not-inspected', 'inspected'],
      default: 'not-inspected',
    },
    tenantName: {
      type: String,
      trim: true,
      default: null,
    },
    lastInspectionDate: {
      type: Date,
      default: null,
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
unitSchema.index({ building: 1, unitId: 1 }, { unique: true });

module.exports = mongoose.model('Unit', unitSchema);
