const mongoose = require('mongoose');

const inspectionRequestSchema = new mongoose.Schema(
  {
    requestId: {
      type: String,
      required: [true, 'Request ID is required'],
      unique: true,
      trim: true,
    },
    purpose: {
      type: String,
      required: [true, 'Purpose is required'],
      trim: true,
    },
    hudPreNegative: {
      type: String,
      trim: true,
    },
    managementCompany: {
      type: String,
      trim: true,
    },
    insuranceCompany: {
      type: String,
      trim: true,
    },
    banker: {
      type: String,
      trim: true,
    },
    buildings: {
      type: Number,
      required: true,
      min: 1,
    },
    units: {
      type: Number,
      required: true,
      min: 1,
    },
    state: {
      type: String,
      required: true,
      trim: true,
    },
    city: {
      type: String,
      trim: true,
    },
    zipCode: {
      type: String,
      required: true,
      trim: true,
    },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected', 'scheduled', 'completed'],
      default: 'pending',
    },
    requestedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    assignedInspector: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    scheduledDate: Date,
    notes: String,
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

// Auto-generate request ID
inspectionRequestSchema.pre('save', async function (next) {
  if (this.isNew && !this.requestId) {
    const count = await this.constructor.countDocuments();
    this.requestId = `REQ-${String(count + 1).padStart(5, '0')}`;
  }
  next();
});

module.exports = mongoose.model('InspectionRequest', inspectionRequestSchema);
