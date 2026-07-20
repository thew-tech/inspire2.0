const mongoose = require('mongoose');

const maintenanceRecordSchema = new mongoose.Schema({
  date: {
    type: Date,
    required: true,
  },
  type: {
    type: String,
    enum: ['routine', 'repair', 'replacement', 'upgrade'],
    required: true,
  },
  description: {
    type: String,
    required: true,
  },
  cost: {
    type: Number,
    default: 0,
  },
  performedBy: {
    type: String,
  },
  notes: String,
});

const assetSchema = new mongoose.Schema(
  {
    assetId: {
      type: String,
      unique: true,
      trim: true,
    },
    name: {
      type: String,
      required: [true, 'Asset name is required'],
      trim: true,
    },
    category: {
      type: String,
      required: [true, 'Category is required'],
      enum: ['IT', 'Infrastructure', 'Security', 'Furniture', 'Vehicles', 'Equipment', 'Other'],
    },
    description: {
      type: String,
      trim: true,
    },
    location: {
      building: String,
      floor: String,
      room: String,
      area: String,
    },
    value: {
      type: Number,
      default: 0,
      min: 0,
    },
    purchaseDate: {
      type: Date,
    },
    purchasePrice: {
      type: Number,
      min: 0,
    },
    warrantyExpiry: {
      type: Date,
    },
    status: {
      type: String,
      enum: ['active', 'inactive', 'maintenance', 'retired', 'disposed'],
      default: 'active',
    },
    condition: {
      type: String,
      enum: ['excellent', 'good', 'fair', 'poor'],
      default: 'good',
    },
    serialNumber: {
      type: String,
      trim: true,
    },
    manufacturer: {
      type: String,
      trim: true,
    },
    model: {
      type: String,
      trim: true,
    },
    maintenanceSchedule: {
      frequency: {
        type: String,
        enum: ['weekly', 'monthly', 'quarterly', 'semi-annual', 'annual', 'as-needed'],
        default: 'as-needed',
      },
      lastMaintenance: Date,
      nextMaintenance: Date,
    },
    maintenanceHistory: [maintenanceRecordSchema],
    assignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    notes: String,
    tags: [String],
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

// Indexes
assetSchema.index({ assetId: 1 });
assetSchema.index({ category: 1, status: 1 });
assetSchema.index({ createdBy: 1 });

// Auto-generate asset ID
assetSchema.pre('save', async function (next) {
  if (this.isNew && !this.assetId) {
    const count = await this.constructor.countDocuments();
    this.assetId = `AST-${String(count + 1).padStart(3, '0')}`;
  }
  next();
});

module.exports = mongoose.model('Asset', assetSchema);
