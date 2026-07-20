const User = require('../models/User');
const PendingUser = require('../models/PendingUser');
const Captcha = require('../models/Captcha');
const { verifyCaptchaHelper } = require('./captchaController');
const jwt = require('jsonwebtoken');
const { validationResult } = require('express-validator');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
let Resend;
try { Resend = require('resend').Resend; } catch(e) {}

// Generate JWT Token
const generateToken = (id, role) => {
  return jwt.sign({ id, role }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRE || '7d',
  });
};

// Generate 6-digit OTP
const generateOTP = () => {
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  console.log('====================================');
  console.log(`🔑 OTP GENERATED (check email): ${otp}`);
  console.log('====================================');
  return otp;
};

// ── Email HTML template ──
const buildEmailHTML = (otp, type) => `
  <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
    <div style="background:#0D6A8D;padding:20px;text-align:center">
      <h1 style="color:white;margin:0">INSPIRE</h1>
    </div>
    <div style="padding:30px;background:#f9f9f9">
      <h2 style="color:#333">${type === 'verification' ? 'Email Verification' : 'Password Reset'}</h2>
      <p style="color:#666">Your OTP code is:</p>
      <div style="background:#0D6A8D;color:white;font-size:32px;font-weight:bold;padding:15px 30px;text-align:center;border-radius:8px;letter-spacing:5px">
        ${otp}
      </div>
      <p style="color:#666;margin-top:20px">This code will expire in 10 minutes.</p>
      <p style="color:#999;font-size:12px">If you didn't request this, please ignore this email.</p>
    </div>
  </div>
`;

// ── Send OTP via Resend (preferred) ──
const sendViaResend = async (email, otp, type) => {
  if (!Resend || !process.env.RESEND_API_KEY) throw new Error('Resend not configured');
  const resend = new Resend(process.env.RESEND_API_KEY);
  const subject = type === 'verification' ? 'INSPIRE - Verify Your Email' : 'INSPIRE - Password Reset OTP';
  const { error } = await resend.emails.send({
    from: process.env.RESEND_FROM || 'INSPIRE <onboarding@resend.dev>',
    to: [email],
    subject,
    html: buildEmailHTML(otp, type),
  });
  if (error) throw new Error(error.message);
  console.log('✅ Email sent via Resend to:', email);
};

// ── Send OTP via SMTP (fallback) ──
const sendViaSMTP = async (email, otp, type) => {
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT) || 587,
    secure: false,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
  const subject = type === 'verification' ? 'INSPIRE - Verify Your Email' : 'INSPIRE - Password Reset OTP';
  const result = await transporter.sendMail({
    from: `"INSPIRE" <${process.env.SMTP_USER}>`,
    to: email, subject, html: buildEmailHTML(otp, type),
  });
  console.log('✅ Email sent via SMTP. MessageId:', result.messageId);
  return result;
};

// ── Main sendOTPEmail (tries Resend first, falls back to SMTP) ──
const sendOTPEmail = async (email, otp, type = 'verification') => {
  console.log(`Sending ${type} OTP to:`, email);
  // Try Resend first (if API key set)
  if (process.env.RESEND_API_KEY) {
    try {
      await sendViaResend(email, otp, type);
      return;
    } catch (resendErr) {
      console.warn('Resend failed, falling back to SMTP:', resendErr.message);
    }
  }
  // Fallback: SMTP
  try {
    await sendViaSMTP(email, otp, type);
  } catch (error) {
    console.error('SMTP also failed:', error.message);
    throw error;
  }
};

// @desc    Register a new user (Signup)
// @route   POST /api/auth/register
// @access  Public
exports.signup = async (req, res) => {
  try {
    const { fullName, email, password, role, captchaId, captchaCode } = req.body;

    // Verify captcha if provided
    if (captchaId && captchaCode) {
      const captchaResult = await verifyCaptchaHelper(captchaId, captchaCode);

      if (!captchaResult.success) {
        return res.status(400).json({
          success: false,
          message: captchaResult.message,
        });
      }
    }

    // Check if user already exists
    let existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'Email already registered. Please login or use a different email.',
      });
    }

    // ── EMAIL VERIFICATION BYPASSED FOR TESTING ──
    // Directly create verified user — no OTP step
    const newUser = new User({
      fullName,
      email: email.toLowerCase(),
      password,
      role,
      isEmailVerified: true,  // auto-verified
      isActive: true,
      lastLogin: new Date(),
    });
    await newUser.save();

    const token = generateToken(newUser._id, newUser.role);

    console.log('✅ User registered (verification bypassed):', newUser.email);

    res.status(201).json({
      success: true,
      message: 'Account created successfully. You can now log in.',
      requiresVerification: false,
      token,
      user: {
        id: newUser._id,
        fullName: newUser.fullName,
        email: newUser.email,
        role: newUser.role,
      },
    });
  } catch (error) {
    console.error('Signup error:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating account. Please try again.',
      error: error.message,
    });
  }
};

// @desc    Login user
// @route   POST /api/auth/login
// @access  Public
exports.login = async (req, res) => {
  try {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation Error',
        errors: errors.array().map((e) => e.msg),
      });
    }

    const { email, password, rememberMe, role } = req.body;

    // Find user by email and get password field
    const user = await User.findOne({ email }).select('+password');

    console.log('Login attempt for:', email);
    console.log('User found:', user ? {
      id: user._id,
      email: user.email,
      isEmailVerified: user.isEmailVerified,
      isActive: user.isActive,
      role: user.role
    } : 'No user found');

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password',
      });
    }

    // Check if user is active
    if (!user.isActive) {
      return res.status(403).json({
        success: false,
        message: 'Your account has been deactivated. Please contact support.',
      });
    }

    // ── EMAIL VERIFICATION CHECK BYPASSED FOR TESTING ──
    // if (!user.isEmailVerified) {
    //   return res.status(403).json({
    //     success: false,
    //     message: 'Please verify your email before logging in.',
    //     requiresVerification: true,
    //     email: user.email,
    //   });
    // }

    // Check password
    console.log('Checking password for user:', user.email);
    const isPasswordMatch = await user.matchPassword(password);
    console.log('Password match result:', isPasswordMatch);

    if (!isPasswordMatch) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password',
      });
    }

    // Role-based access control - verify user role matches requested portal
    if (role) {
      const allowedRolesMap = {
        'inspector': ['inspector', 'property-manager'],
        'management': ['management', 'supervisor', 'admin'],
        'asset-manager': ['asset-manager', 'admin'],
        'other': ['other', 'order', 'admin'],
      };

      const allowedRoles = allowedRolesMap[role] || [role];

      if (!allowedRoles.includes(user.role)) {
        return res.status(403).json({
          success: false,
          message: `Access denied. Your account role (${user.role}) does not have permission to access the ${role} portal.`,
        });
      }
    }

    // Update last login
    user.lastLogin = new Date();
    user.rememberMe = rememberMe || false;
    await user.save();

    // Generate token
    const token = generateToken(user._id, user.role);

    res.status(200).json({
      success: true,
      message: 'Login successful',
      token,
      user: {
        id: user._id,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
        lastLogin: user.lastLogin,
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Error during login. Please try again.',
      error: error.message,
    });
  }
};

// @desc    Test SMTP configuration
// @route   POST /api/auth/test-smtp
// @access  Public (for debugging)
exports.testSMTP = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email is required for testing'
      });
    }

    console.log('Testing SMTP configuration...');

    // Test the transporter
    const transporter = createTransporter();

    try {
      await transporter.verify();
      console.log('SMTP connection verified successfully');
    } catch (verifyError) {
      console.error('SMTP verification failed:', verifyError);
      return res.status(500).json({
        success: false,
        message: 'SMTP configuration is invalid',
        error: verifyError.message
      });
    }

    // Send test email
    try {
      await sendOTPEmail(email, '123456', 'verification');

      res.status(200).json({
        success: true,
        message: 'Test email sent successfully! Check your inbox.'
      });
    } catch (sendError) {
      console.error('Test email sending failed:', sendError);
      res.status(500).json({
        success: false,
        message: 'Failed to send test email',
        error: sendError.message
      });
    }

  } catch (error) {
    console.error('SMTP test error:', error);
    res.status(500).json({
      success: false,
      message: 'Error testing SMTP configuration',
      error: error.message
    });
  }
};

// @desc    Get current logged-in user
// @route   GET /api/auth/me
// @access  Private
exports.getMe = async (req, res) => {
  try {
    const user = await User.findById(req.userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    res.status(200).json({
      success: true,
      user: {
        id: user._id,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
        isActive: user.isActive,
        lastLogin: user.lastLogin,
        createdAt: user.createdAt,
      },
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching user data',
      error: error.message,
    });
  }
};

// @desc    Logout user
// @route   POST /api/auth/logout
// @access  Private
exports.logout = async (req, res) => {
  try {
    res.status(200).json({
      success: true,
      message: 'Logged out successfully',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error during logout',
      error: error.message,
    });
  }
};

// @desc    Verify token
// @route   POST /api/auth/verify-token
// @access  Private
exports.verifyToken = async (req, res) => {
  try {
    const user = await User.findById(req.userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    res.status(200).json({
      success: true,
      message: 'Token is valid',
      user: {
        id: user._id,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    res.status(401).json({
      success: false,
      message: 'Invalid token',
      error: error.message,
    });
  }
};

// @desc    Social login (Google/Facebook) via Clerk
// @route   POST /api/auth/social-login
// @access  Public
exports.socialLogin = async (req, res) => {
  try {
    const { email, fullName, portal, provider, role } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email is required',
      });
    }

    // Find or create user
    let user = await User.findOne({ email: email.toLowerCase() });

    if (user) {
      // User exists - check if they can access the requested portal
      const allowedRolesMap = {
        'inspector': ['inspector', 'property-manager'],
        'management': ['management', 'supervisor', 'admin'],
        'other': ['other', 'order', 'admin'],
      };

      const userRequestedRole = role || 'inspector';
      const allowedRoles = allowedRolesMap[userRequestedRole] || [userRequestedRole];

      // Allow admin users to access any portal
      if (user.role !== 'admin' && !allowedRoles.includes(user.role)) {
        return res.status(403).json({
          success: false,
          message: `Your account role (${user.role}) does not have permission to access the ${portal} portal. Please select the correct portal.`,
        });
      }

      // Check if user is active
      if (!user.isActive) {
        return res.status(403).json({
          success: false,
          message: 'Your account has been deactivated. Please contact support.',
        });
      }

      // Update last login and social provider info
      user.lastLogin = new Date();
      user.socialProvider = provider;
      if (fullName && !user.fullName) {
        user.fullName = fullName;
      }
      await user.save();

    } else {
      // Create new user with social login
      const userRole = role || 'inspector';

      user = new User({
        fullName: fullName || email.split('@')[0],
        email: email.toLowerCase(),
        password: `social_${provider}_${Date.now()}_${Math.random().toString(36).slice(2)}`, // Random password for social users
        role: userRole,
        socialProvider: provider,
        isEmailVerified: true, // Social logins are considered verified
        isActive: true,
        lastLogin: new Date(),
      });

      await user.save();
    }

    // Generate token
    const token = generateToken(user._id, user.role);

    res.status(200).json({
      success: true,
      message: 'Social login successful',
      token,
      user: {
        id: user._id,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
        lastLogin: user.lastLogin,
      },
    });
  } catch (error) {
    console.error('Social login error:', error);
    res.status(500).json({
      success: false,
      message: 'Error during social login. Please try again.',
      error: error.message,
    });
  }
};

// @desc    Send OTP for password reset
// @route   POST /api/auth/forgot-password
// @access  Public
exports.forgotPassword = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation Error',
        errors: errors.array().map((e) => e.msg),
      });
    }

    const { email } = req.body;

    const user = await User.findOne({ email: email.toLowerCase() });

    if (!user) {
      // Don't reveal that email doesn't exist for security
      return res.status(200).json({
        success: true,
        message: 'If an account exists with this email, you will receive an OTP shortly.',
      });
    }

    // Generate OTP
    const otp = generateOTP();
    const otpExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Save OTP to user
    user.passwordResetOTP = otp;
    user.passwordResetExpires = otpExpires;
    await user.save();

    // Send OTP email
    try {
      await sendOTPEmail(email, otp, 'reset');
    } catch (emailError) {
      console.error('Email sending error:', emailError);
      // Still return success to not reveal email existence
    }

    res.status(200).json({
      success: true,
      message: 'If an account exists with this email, you will receive an OTP shortly.',
    });
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({
      success: false,
      message: 'Error processing request. Please try again.',
      error: error.message,
    });
  }
};

// @desc    Verify OTP for password reset
// @route   POST /api/auth/verify-otp
// @access  Public
exports.verifyOTP = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation Error',
        errors: errors.array().map((e) => e.msg),
      });
    }

    const { email, otp } = req.body;

    const user = await User.findOne({ email: email.toLowerCase() }).select('+passwordResetOTP +passwordResetExpires');

    if (!user) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired OTP',
      });
    }

    if (!user.passwordResetOTP || user.passwordResetOTP !== otp) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired OTP',
      });
    }

    if (user.passwordResetExpires < new Date()) {
      return res.status(400).json({
        success: false,
        message: 'OTP has expired. Please request a new one.',
      });
    }

    res.status(200).json({
      success: true,
      message: 'OTP verified successfully',
    });
  } catch (error) {
    console.error('Verify OTP error:', error);
    res.status(500).json({
      success: false,
      message: 'Error verifying OTP. Please try again.',
      error: error.message,
    });
  }
};

// @desc    Reset password with verified OTP
// @route   POST /api/auth/reset-password
// @access  Public
exports.resetPassword = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation Error',
        errors: errors.array().map((e) => e.msg),
      });
    }

    const { email, otp, newPassword } = req.body;

    const user = await User.findOne({ email: email.toLowerCase() }).select('+passwordResetOTP +passwordResetExpires +password');

    if (!user) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired OTP',
      });
    }

    if (!user.passwordResetOTP || user.passwordResetOTP !== otp) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired OTP',
      });
    }

    if (user.passwordResetExpires < new Date()) {
      return res.status(400).json({
        success: false,
        message: 'OTP has expired. Please request a new one.',
      });
    }

    // Update password
    user.password = newPassword;
    user.passwordResetOTP = undefined;
    user.passwordResetExpires = undefined;
    await user.save();

    res.status(200).json({
      success: true,
      message: 'Password reset successfully. You can now login with your new password.',
    });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({
      success: false,
      message: 'Error resetting password. Please try again.',
      error: error.message,
    });
  }
};

// @desc    Resend OTP for password reset
// @route   POST /api/auth/resend-reset-otp
// @access  Public
exports.resendResetOTP = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation Error',
        errors: errors.array().map((e) => e.msg),
      });
    }

    const { email } = req.body;

    const user = await User.findOne({ email: email.toLowerCase() });

    if (!user) {
      // Don't reveal that email doesn't exist for security
      return res.status(200).json({
        success: true,
        message: 'If an account exists with this email, you will receive a new OTP shortly.',
      });
    }

    // Generate new OTP
    const otp = generateOTP();
    const otpExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Save OTP to user
    user.passwordResetOTP = otp;
    user.passwordResetExpires = otpExpires;
    await user.save();

    // Send OTP email
    try {
      await sendOTPEmail(email, otp, 'reset');
    } catch (emailError) {
      console.error('Email sending error:', emailError);
      // Still return success to not reveal email existence
    }

    res.status(200).json({
      success: true,
      message: 'If an account exists with this email, you will receive a new OTP shortly.',
    });
  } catch (error) {
    console.error('Resend reset OTP error:', error);
    res.status(500).json({
      success: false,
      message: 'Error processing request. Please try again.',
      error: error.message,
    });
  }
};

// @desc    Send email verification OTP
// @route   POST /api/auth/send-verification-email
// @access  Public
exports.sendVerificationEmail = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation Error',
        errors: errors.array().map((e) => e.msg),
      });
    }

    const { email } = req.body;

    // Check if user already exists and is verified
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser && existingUser.isEmailVerified) {
      return res.status(400).json({
        success: false,
        message: 'Email is already verified. Please login.',
      });
    }

    // Look for pending user registration
    const pendingUser = await PendingUser.findOne({ email: email.toLowerCase() });

    if (!pendingUser) {
      return res.status(404).json({
        success: false,
        message: 'No pending registration found for this email. Please sign up again.',
      });
    }

    // Rate limiting: Don't allow resending too frequently (1 minute cooldown)
    const timeSinceLastUpdate = Date.now() - pendingUser.updatedAt.getTime();
    if (timeSinceLastUpdate < 60000) { // 1 minute
      return res.status(429).json({
        success: false,
        message: 'Please wait at least 1 minute before requesting a new code.',
      });
    }

    // Generate new OTP
    const otp = generateOTP();
    const otpExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Update pending user with new OTP
    pendingUser.emailVerificationOTP = otp;
    pendingUser.emailVerificationExpires = otpExpires;
    await pendingUser.save();

    // Send OTP email
    try {
      await sendOTPEmail(email, otp, 'verification');
    } catch (emailError) {
      console.error('Email sending error:', emailError);
      return res.status(500).json({
        success: false,
        message: 'Error sending verification email. Please try again.',
      });
    }

    res.status(200).json({
      success: true,
      message: 'Verification email sent successfully.',
    });
  } catch (error) {
    console.error('Send verification email error:', error);
    res.status(500).json({
      success: false,
      message: 'Error sending verification email. Please try again.',
      error: error.message,
    });
  }
};

// @desc    Verify email with OTP
// @route   POST /api/auth/verify-email
// @access  Public
exports.verifyEmail = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation Error',
        errors: errors.array().map((e) => e.msg),
      });
    }

    const { email, otp } = req.body;

    // First check if user already exists and is verified
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser && existingUser.isEmailVerified) {
      return res.status(400).json({
        success: false,
        message: 'Email is already verified. Please login.',
      });
    }

    // Look for pending user registration
    const pendingUser = await PendingUser.findOne({ email: email.toLowerCase() });

    if (!pendingUser) {
      return res.status(404).json({
        success: false,
        message: 'No pending registration found for this email. Please sign up again.',
      });
    }

    if (!pendingUser.emailVerificationOTP || pendingUser.emailVerificationOTP !== otp) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired OTP',
      });
    }

    if (pendingUser.emailVerificationExpires < new Date()) {
      return res.status(400).json({
        success: false,
        message: 'OTP has expired. Please request a new one.',
      });
    }

    // OTP is valid - create the actual user account
    console.log('Creating user after email verification for:', pendingUser.email);

    // Create user directly in database to avoid password re-hashing
    const userDoc = {
      fullName: pendingUser.fullName,
      email: pendingUser.email,
      password: pendingUser.password, // Already hashed in PendingUser
      role: pendingUser.role,
      isEmailVerified: true,
      isActive: true,
      lastLogin: null,
      socialProvider: null,
      notificationSettings: {
        email: true,
        inApp: true,
      },
      twoFactorEnabled: false,
      rememberMe: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // Insert directly to bypass pre-save hooks
    const result = await User.collection.insertOne(userDoc);
    const newUser = await User.findById(result.insertedId);

    console.log('User created successfully:', {
      id: newUser._id,
      email: newUser.email,
      isEmailVerified: newUser.isEmailVerified,
      role: newUser.role
    });

    // Remove the pending user registration
    await PendingUser.deleteOne({ _id: pendingUser._id });

    res.status(200).json({
      success: true,
      message: 'Email verified successfully! Your account has been created. You can now login.',
      user: {
        id: newUser._id,
        fullName: newUser.fullName,
        email: newUser.email,
        role: newUser.role,
        isEmailVerified: true,
      },
    });
  } catch (error) {
    console.error('Verify email error:', error);
    res.status(500).json({
      success: false,
      message: 'Error verifying email. Please try again.',
      error: error.message,
    });
  }
};

// @desc    Resend email verification OTP
// @route   POST /api/auth/resend-verification-otp
// @access  Public
exports.resendVerificationOTP = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation Error',
        errors: errors.array().map((e) => e.msg),
      });
    }

    const { email } = req.body;

    // Check if user already exists and is verified
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser && existingUser.isEmailVerified) {
      return res.status(400).json({
        success: false,
        message: 'Email is already verified. Please login.',
      });
    }

    // Look for pending user registration
    const pendingUser = await PendingUser.findOne({ email: email.toLowerCase() });

    if (!pendingUser) {
      return res.status(404).json({
        success: false,
        message: 'No pending registration found for this email. Please sign up again.',
      });
    }

    // Rate limiting: Don't allow resending too frequently (1 minute cooldown)
    const timeSinceLastUpdate = Date.now() - pendingUser.updatedAt.getTime();
    if (timeSinceLastUpdate < 60000) { // 1 minute
      return res.status(429).json({
        success: false,
        message: 'Please wait at least 1 minute before requesting a new code.',
      });
    }

    // Generate new OTP
    const otp = generateOTP();
    const otpExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Update pending user with new OTP
    pendingUser.emailVerificationOTP = otp;
    pendingUser.emailVerificationExpires = otpExpires;
    await pendingUser.save();

    // Send OTP email
    try {
      await sendOTPEmail(email, otp, 'verification');
    } catch (emailError) {
      console.error('Email sending error:', emailError);
      return res.status(500).json({
        success: false,
        message: 'Error sending verification email. Please try again.',
      });
    }

    res.status(200).json({
      success: true,
      message: 'New verification OTP sent successfully.',
    });
  } catch (error) {
    console.error('Resend verification OTP error:', error);
    res.status(500).json({
      success: false,
      message: 'Error sending verification email. Please try again.',
      error: error.message,
    });
  }
};


// @desc    Delete user account
// @route   DELETE /api/auth/delete-account
// @access  Private
exports.deleteAccount = async (req, res) => {
  try {
    const { password } = req.body;

    // Validate password is provided
    if (!password) {
      return res.status(400).json({
        success: false,
        message: 'Password is required to delete account',
      });
    }

    // Find user
    const user = await User.findById(req.userId).select('+password');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    // Verify password
    const isPasswordValid = await user.comparePassword(password);

    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Invalid password',
      });
    }

    // Delete all related data
    const Inspection = require('../models/Inspection');
    const Property = require('../models/Property');
    const Order = require('../models/Order');
    const Notification = require('../models/Notification');

    // Delete user's inspections
    await Inspection.deleteMany({ inspector: req.userId });

    // Delete user's properties (if they own any)
    await Property.deleteMany({ createdBy: req.userId });

    // Delete user's orders
    await Order.deleteMany({ user: req.userId });

    // Delete user's notifications
    await Notification.deleteMany({ user: req.userId });

    // Finally, delete the user account
    await User.findByIdAndDelete(req.userId);

    console.log(`Account deleted successfully for user: ${user.email}`);

    res.status(200).json({
      success: true,
      message: 'Account and all associated data deleted successfully',
    });

  } catch (error) {
    console.error('Delete account error:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting account',
      error: error.message,
    });
  }
};
