const Captcha = require('../models/Captcha');
const connectDB = require('../config/database');

// In-memory fallback store for when database is unavailable
const captchaFallbackStore = new Map();

// Clean up expired captchas from fallback store
const cleanupExpiredCaptchas = () => {
  const now = Date.now();
  for (const [key, value] of captchaFallbackStore.entries()) {
    if (value.expires < now) {
      captchaFallbackStore.delete(key);
    }
  }
};

// Generate unique captcha ID
const generateCaptchaId = () => {
  return `captcha_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
};

// Generate random captcha text
const generateCaptchaText = () => {
  const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let text = '';
  for (let i = 0; i < 5; i++) {
    text += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return text;
};

// Generate simple SVG captcha (no external dependencies)
const generateSimpleSVG = (text) => {
  const width = 180;
  const height = 70;
  const fontSize = 32;
  const textColor = '#0E7490';
  const bgColor = '#ffffff';
  
  // Generate random positions and rotations for each character
  let textElements = '';
  const charWidth = width / (text.length + 1);
  
  for (let i = 0; i < text.length; i++) {
    const x = charWidth * (i + 1);
    const y = height / 2 + fontSize / 3;
    const rotation = (Math.random() - 0.5) * 30; // -15 to +15 degrees
    const yOffset = (Math.random() - 0.5) * 10; // -5 to +5 pixels
    
    textElements += `<text 
      x="${x}" 
      y="${y + yOffset}" 
      font-size="${fontSize}" 
      font-weight="bold" 
      fill="${textColor}" 
      font-family="Arial, sans-serif"
      text-anchor="middle"
      transform="rotate(${rotation} ${x} ${y + yOffset})"
    >${text[i]}</text>`;
  }
  
  // Add some noise lines
  let noiseLines = '';
  for (let i = 0; i < 3; i++) {
    const x1 = Math.random() * width;
    const y1 = Math.random() * height;
    const x2 = Math.random() * width;
    const y2 = Math.random() * height;
    noiseLines += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${textColor}" stroke-width="1" opacity="0.3"/>`;
  }
  
  // Include viewBox and preserveAspectRatio so SVG scales correctly on mobile/Safari
  // and add inline style to make it behave like a responsive image when used as a data URL.
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet" style="display:block;max-width:100%;height:auto;">
  <rect width="${width}" height="${height}" fill="${bgColor}"/>
  ${noiseLines}
  ${textElements}
</svg>`;
};

// @desc    Generate CAPTCHA
// @route   GET /api/captcha/generate
// @access  Public
exports.generateCaptcha = async (req, res) => {
  try {
    // Generate captcha text
    const captchaText = generateCaptchaText();
    
    // Generate SVG
    const svgData = generateSimpleSVG(captchaText);

    // Generate unique ID for this captcha
    const captchaId = generateCaptchaId();
    
    // Try to store in database, fallback to memory if DB unavailable
    let storedInDB = false;
    try {
      await connectDB();
      const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes
      await Captcha.create({
        captchaId,
        text: captchaText.toUpperCase(),
        expiresAt,
      });
      storedInDB = true;
      console.log('Captcha stored in database');
    } catch (dbError) {
      // Fallback to in-memory storage
      console.warn('Database unavailable, using fallback storage:', dbError.message);
      cleanupExpiredCaptchas();
      captchaFallbackStore.set(captchaId, {
        text: captchaText.toUpperCase(),
        expires: Date.now() + 5 * 60 * 1000,
      });
    }

    // Convert SVG to base64 for easy display in mobile app
    const base64Svg = Buffer.from(svgData).toString('base64');

    res.status(200).json({
      success: true,
      captchaId,
      captchaImage: `data:image/svg+xml;base64,${base64Svg}`,
    });
  } catch (error) {
    console.error('Generate captcha error:', error);
    res.status(500).json({
      success: false,
      message: 'Error generating captcha',
      error: error.message,
    });
  }
};

// @desc    Verify CAPTCHA
// @route   POST /api/captcha/verify
// @access  Public
exports.verifyCaptcha = async (req, res) => {
  try {
    const { captchaId, captchaCode } = req.body;

    if (!captchaId || !captchaCode) {
      return res.status(400).json({
        success: false,
        message: 'Captcha ID and code are required',
      });
    }

    let storedCaptcha = null;
    let fromDB = false;

    // Try to find captcha in database first
    try {
      await connectDB();
      storedCaptcha = await Captcha.findOne({ captchaId });
      fromDB = true;
    } catch (dbError) {
      console.warn('Database unavailable, checking fallback storage:', dbError.message);
      // Fallback to in-memory storage
      cleanupExpiredCaptchas();
      const fallbackCaptcha = captchaFallbackStore.get(captchaId);
      if (fallbackCaptcha) {
        storedCaptcha = {
          text: fallbackCaptcha.text,
          expiresAt: new Date(fallbackCaptcha.expires),
        };
      }
    }

    if (!storedCaptcha) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired captcha. Please refresh and try again.',
      });
    }

    // Check expiration
    if (storedCaptcha.expiresAt < new Date()) {
      if (fromDB) {
        await Captcha.deleteOne({ captchaId }).catch(() => {});
      } else {
        captchaFallbackStore.delete(captchaId);
      }
      return res.status(400).json({
        success: false,
        message: 'Captcha has expired. Please refresh and try again.',
      });
    }

    // Verify captcha (case-insensitive)
    if (captchaCode.toUpperCase() !== storedCaptcha.text) {
      return res.status(400).json({
        success: false,
        message: 'Incorrect captcha code. Please try again.',
      });
    }

    // Remove used captcha
    if (fromDB) {
      await Captcha.deleteOne({ captchaId }).catch(() => {});
    } else {
      captchaFallbackStore.delete(captchaId);
    }

    res.status(200).json({
      success: true,
      message: 'Captcha verified successfully',
    });
  } catch (error) {
    console.error('Verify captcha error:', error);
    res.status(500).json({
      success: false,
      message: 'Error verifying captcha',
    });
  }
};

// Helper function to verify captcha (for use in other controllers)
exports.verifyCaptchaHelper = async (captchaId, captchaCode) => {
  if (!captchaId || !captchaCode) {
    return { success: false, message: 'Captcha ID and code are required' };
  }

  let storedCaptcha = null;
  let fromDB = false;

  // Try to find captcha in database first
  try {
    await connectDB();
    storedCaptcha = await Captcha.findOne({ captchaId });
    fromDB = true;
  } catch (dbError) {
    // Fallback to in-memory storage
    cleanupExpiredCaptchas();
    const fallbackCaptcha = captchaFallbackStore.get(captchaId);
    if (fallbackCaptcha) {
      storedCaptcha = {
        text: fallbackCaptcha.text,
        expiresAt: new Date(fallbackCaptcha.expires),
      };
    }
  }

  if (!storedCaptcha) {
    return { success: false, message: 'Invalid or expired captcha. Please refresh and try again.' };
  }

  // Check expiration
  if (storedCaptcha.expiresAt < new Date()) {
    if (fromDB) {
      await Captcha.deleteOne({ captchaId }).catch(() => {});
    } else {
      captchaFallbackStore.delete(captchaId);
    }
    return { success: false, message: 'Captcha has expired. Please refresh and try again.' };
  }

  // Verify captcha (case-insensitive)
  if (captchaCode.toUpperCase() !== storedCaptcha.text) {
    return { success: false, message: 'Incorrect captcha code. Please try again.' };
  }

  // Remove used captcha
  if (fromDB) {
    await Captcha.deleteOne({ captchaId }).catch(() => {});
  } else {
    captchaFallbackStore.delete(captchaId);
  }

  return { success: true, message: 'Captcha verified successfully' };
};

