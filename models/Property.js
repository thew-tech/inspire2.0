const mongoose = require('mongoose');

const propertySchema = new mongoose.Schema(
  {
    propertyId: {
      type: String,
      unique: true,
      trim: true,
    },
    name: {
      type: String,
      required: [true, 'Property name is required'],
      trim: true,
    },
    country: {
      type: String,
      trim: true,
      default: 'United States'
    },
    address: {
      type: String,
      required: [true, 'Address is required'],
      trim: true,
    },
    city: {
      type: String,
      required: [true, 'City is required'],
      trim: true,
    },
    state: {
      type: String,
      required: [true, 'State is required'],
      trim: true,
    },
    zipCode: {
      type: String,
      required: [true, 'Zip code is required'],
      trim: true,
    },
    buildings: {
      type: Number,
      default: 0,
      min: [0, 'Cannot have negative buildings'],
    },
    units: {
      type: Number,
      default: 0,
      min: [0, 'Cannot have negative units'],
    },
    buildingDetails: [
      {
        buildingId: { type: String, trim: true },
        totalUnits: { type: Number, default: 0 },
        unitsForInspection: { type: Number, default: 0 },
      },
    ],
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    status: {
      type: String,
      enum: ['active', 'inactive', 'pending', 'ready-for-inspection', 'hold'],
      default: 'active',
    },
    lastInspectionDate: {
      type: Date,
      default: null,
    },
    nextInspectionDate: {
      type: Date,
      default: null,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
    isReportUnlocked: {
      type: Boolean,
      default: false,
    },
    iapPurchaseToken: {
      type: String,
      default: null,
    },
    iapPurchasedAt: {
      type: Date,
      default: null,
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

// Index for faster queries
propertySchema.index({ owner: 1, state: 1, city: 1 });
propertySchema.index({ propertyId: 1 });

module.exports = mongoose.model('Property', propertySchema);
