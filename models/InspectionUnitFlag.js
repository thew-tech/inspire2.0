const mongoose = require('mongoose');

const inspectionUnitFlagSchema = new mongoose.Schema(
  {
    propertyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Property',
      required: true,
    },
    inspectorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    buildingId: {
      type: String,
      required: true,
      trim: true,
    },
    unitLabel: {
      type: String,
      required: true,
      trim: true,
    },
    normalizedUnitKey: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    isInspected: {
      type: Boolean,
      default: true,
    },
    inspectedAt: {
      type: Date,
      default: Date.now,
    },
    sourceInspectionType: {
      type: String,
      trim: true,
      default: '',
    },
    lastProgressId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'InspectionProgress',
      default: null,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  { timestamps: true }
);

inspectionUnitFlagSchema.index(
  { propertyId: 1, inspectorId: 1, buildingId: 1, normalizedUnitKey: 1 },
  { unique: true }
);
inspectionUnitFlagSchema.index({ propertyId: 1, inspectorId: 1, buildingId: 1, isInspected: 1 });

module.exports = mongoose.model('InspectionUnitFlag', inspectionUnitFlagSchema);
