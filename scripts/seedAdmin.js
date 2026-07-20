require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const connectDB = require('../config/database');

const seedAdmin = async () => {
  try {
    // Connect to database
    await connectDB();
    console.log('Connected to database...');

    // Admin user data
    const adminData = {
      fullName: process.env.ADMIN_FULL_NAME || 'Admin',
      email: process.env.ADMIN_EMAIL || 'admin@inspire.com',
      password: process.env.ADMIN_PASSWORD || 'admin@123',
      role: 'admin',
      phone: '',
      language: 'English',
      timezone: 'America/New_York',
      notificationSettings: {
        email: true,
        inApp: true,
      },
      twoFactorEnabled: false,
      isActive: true,
      isEmailVerified: true,
    };

    // Check if admin already exists
    const existingAdmin = await User.findOne({ email: adminData.email });

    if (existingAdmin) {
      // Ensure isEmailVerified and isActive are set correctly
      existingAdmin.isEmailVerified = true;
      existingAdmin.isActive = true;
      await existingAdmin.save();
      console.log('Admin user already exists — ensured isEmailVerified=true and isActive=true');
      console.log('Email:', existingAdmin.email);
      console.log('Role:', existingAdmin.role);
    } else {
      // Create admin user
      const admin = await User.create(adminData);
      console.log('Admin user created successfully!');
      console.log('Email:', admin.email);
      console.log('Password: admin@123');
      console.log('Role:', admin.role);
    }

    // Close database connection
    await mongoose.connection.close();
    console.log('Database connection closed.');
    process.exit(0);
  } catch (error) {
    console.error('Error seeding admin user:', error.message);
    process.exit(1);
  }
};

// Run the seed function
seedAdmin();
