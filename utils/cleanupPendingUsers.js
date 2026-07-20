const PendingUser = require('../models/PendingUser');

/**
 * Cleanup expired pending user registrations
 * This function removes pending users whose OTP has expired
 * Can be called periodically or on server startup
 */
const cleanupExpiredPendingUsers = async () => {
  try {
    const result = await PendingUser.deleteMany({
      emailVerificationExpires: { $lt: new Date() }
    });
    
    if (result.deletedCount > 0) {
      console.log(`Cleaned up ${result.deletedCount} expired pending user registrations`);
    }
    
    return result.deletedCount;
  } catch (error) {
    console.error('Error cleaning up expired pending users:', error);
    return 0;
  }
};

module.exports = {
  cleanupExpiredPendingUsers
};