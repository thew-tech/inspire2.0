const mongoose = require('mongoose');

// Flexible schema for AI-generated findings
const findingSchema = new mongoose.Schema({
  area: String,
  category: String,
  location: String,
  severity: {
    type: String,
    enum: ['life-threatening', 'severe', 'moderate', 'minor', 'low', 'medium', 'high'],
    default: 'minor',
  },
  description: String,
  recommendation: String,
  imageUrl: String,
  nspireCode: String,
  status: {
    type: String,
    enum: ['open', 'in-progress', 'resolved', 'verified'],
    default: 'open',
  },
}, { strict: false });

const deficiencySchema = new mongoose.Schema({
  category: {
    type: String,
    enum: ['site', 'building-exterior', 'building-systems', 'common-areas', 'unit', 'General'],
  },
  subCategory: {
    type: String,
  },
  description: {
    type: String,
  },
  severity: {
    type: String,
    enum: ['life-threatening', 'severe', 'moderate', 'minor', 'low', 'medium', 'high'],
    default: 'minor',
  },
  status: {
    type: String,
    enum: ['open', 'in-progress', 'resolved', 'verified'],
    default: 'open',
  },
  photos: [{
    url: String,
    caption: String,
    uploadedAt: { type: Date, default: Date.now },
  }],
  notes: String,
  resolvedAt: Date,
  resolvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
}, { strict: false });

const inspectionSchema = new mongoose.Schema(
  {
    inspectionId: {
      type: String,
      required: [true, 'Inspection ID is required'],
      unique: true,
      trim: true,
    },
    property: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Property',
      required: true,
    },
    building: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Building',
    },
    unit: {
      type: mongoose.Schema.Types.Mixed, // Can be ObjectId or string for AI inspections
      ref: 'Unit',
    },
    inspectionType: {
      type: String,
      enum: ['full', 'follow-up', 'special', 'pre-negative', 'hud', 'general', 'ai'],
      default: 'full',
    },
    inspectionLevel: {
      type: String,
      enum: ['property', 'building', 'unit', 'site', 'common-area', '100', '50', 'random'],
      default: 'property',
    },
    inspector: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    scheduledDate: {
      type: Date,
      required: true,
    },
    completedDate: {
      type: Date,
      default: null,
    },
    status: {
      type: String,
      enum: ['scheduled', 'in-progress', 'completed', 'cancelled', 'pending-review'],
      default: 'scheduled',
    },
    score: {
      type: Number,
      min: 0,
      max: 100,
      default: null,
    },
    complianceScore: {
      type: Number,
      min: 0,
      max: 100,
      default: null,
    },
    result: {
      type: String,
      enum: ['pass', 'fail', 'pending', 'not-scored', 'compliant', 'non-compliant'],
      default: 'pending',
    },
    deficiencies: [deficiencySchema],
    findings: {
      type: Array,
      default: [],
    },
    notes: {
      type: String,
      default: '',
    },
    purpose: {
      type: String,
      trim: true,
    },
    hudPreNegative: {
      type: Boolean,
      default: false,
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
    // In-App Purchase tracking
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
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
    updatedAt: {
      type: Date,
      default: Date.now,
    },
    // Sharing functionality
    shareToken: {
      type: String,
      default: null,
    },
    shareExpiry: {
      type: Date,
      default: null,
    },
    isShared: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
inspectionSchema.index({ property: 1, status: 1 });
inspectionSchema.index({ inspector: 1, status: 1 });
inspectionSchema.index({ scheduledDate: 1 });
inspectionSchema.index({ shareToken: 1 });
inspectionSchema.index({ shareToken: 1, isShared: 1, shareExpiry: 1 });

module.exports = mongoose.model('Inspection', inspectionSchema);
