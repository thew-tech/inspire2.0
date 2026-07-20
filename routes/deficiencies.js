/**
 * Deficiency API Routes
 * 
 * Provides endpoints for fetching NSPIRE deficiency data.
 */

const express = require('express');
const router = express.Router();
const {
    INSIDE_LOCATIONS,
    OUTSIDE_LOCATIONS,
    DEFICIENCY_DATA,
    getDeficiencyCategories,
    searchDeficiencies,
    getDeficienciesByCategory,
    getDeficiencyById,
} = require('../utils/deficiencyData');

/**
 * @route   GET /api/deficiencies
 * @desc    Get all deficiencies
 * @access  Public
 */
router.get('/', (req, res) => {
    try {
        const { search, category } = req.query;

        let deficiencies = DEFICIENCY_DATA;

        if (search) {
            deficiencies = searchDeficiencies(search);
        } else if (category) {
            deficiencies = getDeficienciesByCategory(category);
        }

        res.json({
            success: true,
            count: deficiencies.length,
            data: deficiencies,
        });
    } catch (error) {
        console.error('Error fetching deficiencies:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch deficiencies',
        });
    }
});

/**
 * @route   GET /api/deficiencies/categories
 * @desc    Get all deficiency categories
 * @access  Public
 */
router.get('/categories', (req, res) => {
    try {
        const categories = getDeficiencyCategories();

        res.json({
            success: true,
            count: categories.length,
            data: categories,
        });
    } catch (error) {
        console.error('Error fetching categories:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch categories',
        });
    }
});

/**
 * @route   GET /api/deficiencies/locations
 * @desc    Get all location options (inside and outside)
 * @access  Public
 */
router.get('/locations', (req, res) => {
    try {
        res.json({
            success: true,
            data: {
                inside: INSIDE_LOCATIONS,
                outside: OUTSIDE_LOCATIONS,
            },
        });
    } catch (error) {
        console.error('Error fetching locations:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch locations',
        });
    }
});

/**
 * @route   GET /api/deficiencies/:id
 * @desc    Get deficiency by ID
 * @access  Public
 */
router.get('/:id', (req, res) => {
    try {
        const deficiency = getDeficiencyById(req.params.id);

        if (!deficiency) {
            return res.status(404).json({
                success: false,
                error: 'Deficiency not found',
            });
        }

        res.json({
            success: true,
            data: deficiency,
        });
    } catch (error) {
        console.error('Error fetching deficiency:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch deficiency',
        });
    }
});

module.exports = router;
