const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const pendingUserSchema = new mongoose.Schema(
  {
    fullName: {
      type: String,
      required: [true, 'Please provide a full name'],
      trim: true,
      minlength: [2, 'Full name must be at least 2 characters'],
    },
    email: {
      type: String,
      required: [true, 'Please provide an email'],
      unique: true,
      lowercase: true,
      match: [
        /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/,
        'Please provide a valid email',
      ],
    },
    password: {
      type: String,
      required: [true, 'Please provide a password'],
      minlength: [8, 'Password must be at least 8 characters'],
      maxlength: [128, 'Password cannot exceed 128 characters'],
    },
    role: {
      type: String,
      enum: ['inspector', 'management', 'other'],
      required: [true, 'Please select a role'],
    },
    emailVerificationOTP: {
      type: String,
      required: true,
    },
    emailVerificationExpires: {
      type: Date,
      required: true,
    },
    createdAt: {
      type: Date,
      default: Date.now,
      expires: 3600, // Document expires after 1 hour if not verified
    },
  },
  {
    timestamps: true,
  }
);

// Hash password before saving
pendingUserSchema.pre('save', async function (next) {
  // Only hash if password is modified
  if (!this.isModified('password')) {
    return next();
  }

  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Method to compare passwords
pendingUserSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

// Method to convert to User object
pendingUserSchema.methods.toUserObject = function () {
  return {
    fullName: this.fullName,
    email: this.email,
    password: this.password, // Already hashed
    role: this.role,
    isEmailVerified: true, // Will be verified when this method is called
    isActive: true,
    lastLogin: null,
    socialProvider: null,
  };
};

module.exports = mongoose.model('PendingUser', pendingUserSchema);