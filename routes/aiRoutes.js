const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const aiController = require('../controllers/aiController');
const { uploadBase64Image, uploadImage, uploadMultipleImages } = require('../utils/cloudinaryUpload');

// Multer Config for local storage
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/');
    },
    filename: (req, file, cb) => {
        cb(null, `img-${Date.now()}${path.extname(file.originalname)}`);
    }
});

// Multer for memory storage (for Cloudinary uploads)
const memoryStorage = multer.memoryStorage();
const uploadMemory = multer({
    storage: memoryStorage,
    limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

const upload = multer({ storage });

// Routes
router.post('/inspect', upload.single('image'), aiController.inspectImage);
router.get('/reports/:fileName', aiController.getReport);

/**
 * Upload image to Cloudinary
 * POST /api/ai/upload-image
 * Body: { image: base64 string or file, folder?: string }
 */
router.post('/upload-image', (req, res, next) => {
    uploadMemory.single('image')(req, res, (err) => {
        if (err) {
            console.error('Multer upload error:', err);
            if (err instanceof multer.MulterError) {
                return res.status(400).json({ success: false, message: `Upload error: ${err.message}` });
            }
            return res.status(500).json({ success: false, message: `Server upload error: ${err.message}` });
        }
        next();
    });
}, async (req, res) => {
    try {
        console.log('Received upload request');
        let result;

        if (req.file) {
            console.log('Processing file upload:', req.file.originalname, 'Size:', req.file.size);
            // File uploaded via multipart form
            const base64 = req.file.buffer.toString('base64');
            const dataUri = `data:${req.file.mimetype};base64,${base64}`;
            result = await uploadBase64Image(dataUri, req.file.originalname?.split('.')[0] || 'deficiency', {
                folder: req.body.folder || 'nspire-inspections/deficiencies',
            });
        } else if (req.body.image) {
            console.log('Processing base64 upload');
            // Base64 image in body
            result = await uploadBase64Image(req.body.image, `deficiency_${Date.now()}`, {
                folder: req.body.folder || 'nspire-inspections/deficiencies',
            });
        } else {
            console.error('No image data found in request');
            return res.status(400).json({
                success: false,
                message: 'No image provided. Send either a file or base64 image.'
            });
        }

        if (result.success) {
            console.log('Upload successful:', result.url);
            res.json({
                success: true,
                data: {
                    url: result.url,
                    publicId: result.publicId,
                    width: result.width,
                    height: result.height,
                }
            });
        } else {
            console.error('Cloudinary upload failing:', result.error);
            res.status(500).json({
                success: false,
                message: result.error || 'Failed to upload image to Cloudinary'
            });
        }
    } catch (error) {
        console.error('Critical image upload error:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Internal server error processing upload'
        });
    }
});

/**
 * Upload multiple images to Cloudinary
 * POST /api/ai/upload-images
 * Body: { images: [base64 strings], folder?: string }
 */
router.post('/upload-images', async (req, res) => {
    try {
        const { images, folder } = req.body;

        if (!images || !Array.isArray(images) || images.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'No images provided. Send an array of base64 images.'
            });
        }

        const results = await uploadMultipleImages(images, {
            folder: folder || 'nspire-inspections/deficiencies',
        });

        const successfulUploads = results.filter(r => r.success);
        const failedUploads = results.filter(r => !r.success);

        res.json({
            success: failedUploads.length === 0,
            data: {
                uploaded: successfulUploads.map(r => ({
                    url: r.url,
                    publicId: r.publicId,
                })),
                failed: failedUploads.length,
                total: images.length,
            }
        });
    } catch (error) {
        console.error('Multiple image upload error:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Internal server error'
        });
    }
});

module.exports = router;
