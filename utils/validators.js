// Email validation
const isValidEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

// Password validation
const isValidPassword = (password) => {
  // At least 8 characters, 1 uppercase, 1 lowercase, 1 number
  const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;
  return passwordRegex.test(password);
};

// Full name validation
const isValidFullName = (fullName) => {
  return fullName && fullName.trim().length >= 2;
};

// Role validation
const isValidRole = (role) => {
  const validRoles = ['inspector', 'property-manager', 'supervisor', 'management'];
  return validRoles.includes(role);
};

module.exports = {
  isValidEmail,
  isValidPassword,
  isValidFullName,
  isValidRole,
};
