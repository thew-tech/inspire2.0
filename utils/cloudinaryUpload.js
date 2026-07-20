const cloudinary = require('cloudinary').v2;

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

/**
 * Upload image to Cloudinary
 * @param {string} imagePath - Local file path or base64 data URI
 * @param {object} options - Upload options
 * @returns {Promise<object>} - Cloudinary upload result
 */
const uploadImage = async (imagePath, options = {}) => {
  try {
    const defaultOptions = {
      folder: 'nspire-inspections',
      resource_type: 'image',
      transformation: [
        { width: 1200, height: 1200, crop: 'limit' },
        { quality: 'auto:good' },
        { fetch_format: 'auto' },
      ],
    };

    const uploadOptions = { ...defaultOptions, ...options };
    const result = await cloudinary.uploader.upload(imagePath, uploadOptions);

    return {
      success: true,
      url: result.secure_url,
      publicId: result.public_id,
      width: result.width,
      height: result.height,
      format: result.format,
      bytes: result.bytes,
    };
  } catch (error) {
    console.error('Cloudinary upload error:', error);
    return {
      success: false,
      error: error.message,
    };
  }
};

/**
 * Upload base64 image to Cloudinary
 * @param {string} base64Data - Base64 encoded image data
 * @param {string} filename - Original filename for context
 * @param {object} options - Upload options
 * @returns {Promise<object>} - Cloudinary upload result
 */
const uploadBase64Image = async (base64Data, filename = 'image', options = {}) => {
  try {
    // Ensure data URI format
    let dataUri = base64Data;
    if (!base64Data.startsWith('data:')) {
      dataUri = `data:image/jpeg;base64,${base64Data}`;
    }

    const defaultOptions = {
      folder: 'nspire-inspections',
      public_id: `${filename}_${Date.now()}`,
      resource_type: 'image',
      transformation: [
        { width: 1200, height: 1200, crop: 'limit' },
        { quality: 'auto:good' },
        { fetch_format: 'auto' },
      ],
    };

    const uploadOptions = { ...defaultOptions, ...options };
    const result = await cloudinary.uploader.upload(dataUri, uploadOptions);

    return {
      success: true,
      url: result.secure_url,
      publicId: result.public_id,
      width: result.width,
      height: result.height,
      format: result.format,
      bytes: result.bytes,
    };
  } catch (error) {
    console.error('Cloudinary base64 upload error:', error);
    return {
      success: false,
      error: error.message,
    };
  }
};

/**
 * Upload multiple images to Cloudinary
 * @param {Array} images - Array of image paths or base64 data
 * @param {object} options - Upload options
 * @returns {Promise<Array>} - Array of upload results
 */
const uploadMultipleImages = async (images, options = {}) => {
  const results = [];
  
  for (let i = 0; i < images.length; i++) {
    const image = images[i];
    let result;
    
    if (image.startsWith('data:') || image.length > 500) {
      // Likely base64 data
      result = await uploadBase64Image(image, `deficiency_${i + 1}`, options);
    } else {
      // File path
      result = await uploadImage(image, options);
    }
    
    results.push(result);
  }
  
  return results;
};

/**
 * Delete image from Cloudinary
 * @param {string} publicId - Cloudinary public ID
 * @returns {Promise<object>} - Delete result
 */
const deleteImage = async (publicId) => {
  try {
    const result = await cloudinary.uploader.destroy(publicId);
    return {
      success: result.result === 'ok',
      result: result.result,
    };
  } catch (error) {
    console.error('Cloudinary delete error:', error);
    return {
      success: false,
      error: error.message,
    };
  }
};

/**
 * Generate optimized URL for image
 * @param {string} publicId - Cloudinary public ID
 * @param {object} options - Transformation options
 * @returns {string} - Optimized image URL
 */
const getOptimizedUrl = (publicId, options = {}) => {
  const defaultOptions = {
    width: 800,
    height: 600,
    crop: 'limit',
    quality: 'auto:good',
    fetch_format: 'auto',
  };

  const transformOptions = { ...defaultOptions, ...options };
  return cloudinary.url(publicId, transformOptions);
};

/**
 * Get thumbnail URL for image
 * @param {string} publicId - Cloudinary public ID
 * @returns {string} - Thumbnail URL
 */
const getThumbnailUrl = (publicId) => {
  return cloudinary.url(publicId, {
    width: 150,
    height: 150,
    crop: 'fill',
    quality: 'auto:low',
    fetch_format: 'auto',
  });
};

module.exports = {
  cloudinary,
  uploadImage,
  uploadBase64Image,
  uploadMultipleImages,
  deleteImage,
  getOptimizedUrl,
  getThumbnailUrl,
};
