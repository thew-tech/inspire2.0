const mongoose = require('mongoose');

const inspectionProgressSchema = new mongoose.Schema({
  propertyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Property',
    required: true,
  },
  buildingId: {
    type: String,
    trim: true,
    default: '',
  },
  buildingInspectionId: {
    type: String,
    trim: true,
    default: '',
  },
  unitId: {
    type: String, // String since buildingId or unit name might be a string
    required: true,
  },
  inspectionType: {
    type: String, // "Outside", "Inside", "Unit", etc.
    required: true,
  },
  inspectorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  inspectionData: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  responses: {
    type: mongoose.Schema.Types.Mixed, // flexible dictionary mapping itemId -> 'No OD' | 'OD' | 'N/A'
    default: {}
  }
}, { timestamps: true });

// Ensure one progress per property+unit+type per inspector
inspectionProgressSchema.index({ propertyId: 1, buildingId: 1, unitId: 1, inspectionType: 1, inspectorId: 1 }, { unique: true, name: 'progress_building_scoped_unique' });
inspectionProgressSchema.index({ propertyId: 1, inspectorId: 1, buildingId: 1 });
inspectionProgressSchema.index({ buildingInspectionId: 1 });
inspectionProgressSchema.index({ inspectorId: 1, propertyId: 1, updatedAt: -1 });
inspectionProgressSchema.index({ inspectorId: 1, inspectionType: 1, updatedAt: -1 });

module.exports = mongoose.model('InspectionProgress', inspectionProgressSchema);
