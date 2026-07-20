const Inspection = require('../models/Inspection');
const InspectionRequest = require('../models/InspectionRequest');
const Property = require('../models/Property');
const Unit = require('../models/Unit'); // Ensure Unit model is imported
const InspectionProgress = require('../models/InspectionProgress');
const InspectionUnitFlag = require('../models/InspectionUnitFlag');
const crypto = require('crypto');
const mongoose = require('mongoose');
const { validationResult } = require('express-validator');
const { selectNspireUnits } = require('../utils/nspireSampling');
const { broadcastProgressUpdate } = require('../utils/progressSocketHub');

// Generate unique inspection ID
const generateInspectionId = async () => {
  const count = await Inspection.countDocuments();
  return `INS-${Date.now().toString(36).toUpperCase()}-${String(count + 1).padStart(4, '0')}`;
};

const normalizeStringValue = (value) => String(value ?? '').trim();

const normalizeTokenValue = (value) =>
  normalizeStringValue(value).toLowerCase().replace(/[\s_-]+/g, '');

const normalizeUnitIdentifierValue = (value) => {
  const parts = normalizeStringValue(value).toLowerCase().split(',');
  return parts
    .map((part) => {
      const p = part.trim().replace(/^unit[\s_-]*/i, '').replace(/[\s_-]+/g, '');
      if (/^\d+$/.test(p)) {
        return p.replace(/^0+/, '') || '0';
      }
      return p;
    })
    .join(',');
};

const looksLikeBuildingLabel = (value) => {
  const label = normalizeStringValue(value);
  if (!label) {
    return false;
  }

  return /^b\d+$/i.test(label) || /^building[\s_-]?[a-z0-9]+$/i.test(label);
};

const PLACEHOLDER_UNIT_TOKENS = new Set([
  '',
  '-',
  'allunits',
  'allunit',
  'property',
  'unknown',
  'null',
  'undefined',
  'inside',
  'outside',
  'unit',
]);

const isPlaceholderUnitValue = (value) =>
  PLACEHOLDER_UNIT_TOKENS.has(normalizeTokenValue(value));

const PLACEHOLDER_BUILDING_TOKENS = new Set([
  '',
  '-',
  'allunits',
  'allunit',
  'property',
  'unknown',
  'null',
  'undefined',
]);

const isPlaceholderBuildingValue = (value) =>
  PLACEHOLDER_BUILDING_TOKENS.has(normalizeTokenValue(value));

const resolveCanonicalBuildingId = ({
  unitId,
  inspectionData,
  buildingId,
  building_id,
}) => {
  const explicitCandidates = [
    buildingId,
    building_id,
    inspectionData?.buildingId,
    inspectionData?.building,
    inspectionData?.buildingName,
  ];

  const explicitBuildingId = explicitCandidates
    .map((candidate) => normalizeStringValue(candidate))
    .find((candidate) => candidate && !isPlaceholderBuildingValue(candidate));

  if (explicitBuildingId) {
    return explicitBuildingId;
  }

  const fallbackUnitId = normalizeStringValue(unitId);
  if (fallbackUnitId && !isPlaceholderBuildingValue(fallbackUnitId)) {
    return fallbackUnitId;
  }

  return 'UNKNOWN-BUILDING';
};

const generateBuildingInspectionId = () =>
  `BINS-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;

const resolveBuildingInspectionId = async ({
  propertyId,
  inspectorId,
  canonicalBuildingId,
  existingBuildingInspectionId,
}) => {
  const currentId = normalizeStringValue(existingBuildingInspectionId);
  if (currentId) {
    return currentId;
  }

  const existingSession = await InspectionProgress.findOne({
    propertyId,
    inspectorId,
    buildingInspectionId: { $exists: true, $nin: ['', null] },
    $or: [{ buildingId: canonicalBuildingId }, { unitId: canonicalBuildingId }],
  })
    .sort({ createdAt: 1 })
    .select('buildingInspectionId')
    .lean();

  if (existingSession?.buildingInspectionId) {
    return existingSession.buildingInspectionId;
  }

  return generateBuildingInspectionId();
};

const normalizeInspectionTypeBucket = (inspectionType) => {
  const normalized = normalizeStringValue(inspectionType).toLowerCase();

  if (normalized === 'inside') return 'inside';
  if (normalized === 'outside') return 'outside';
  if (normalized === 'unit' || normalized.startsWith('unit_') || normalized.startsWith('units')) {
    return 'units';
  }
  if (normalized.startsWith('report_draft_')) return 'drafts';

  return 'other';
};

const escapeRegexLiteral = (value = '') =>
  String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const normalizeInspectionTypeValue = (inspectionType) => {
  const raw = normalizeStringValue(inspectionType);
  if (!raw) {
    return '';
  }

  const lower = raw.toLowerCase();

  if (lower === 'outside') {
    return 'Outside';
  }

  if (lower === 'inside') {
    return 'Inside';
  }

  if (lower === 'unit') {
    return 'Unit';
  }

  if (lower.startsWith('unit_')) {
    const suffix = raw.slice(raw.indexOf('_') + 1).trim();
    return suffix ? `Unit_${suffix}` : 'Unit';
  }

  return raw;
};

const extractUnitSuffixFromInspectionType = (inspectionType) => {
  const token = normalizeStringValue(inspectionType);
  const tokenLower = token.toLowerCase();

  if (tokenLower === 'unit') {
    return '';
  }

  if (!tokenLower.startsWith('unit_')) {
    return '';
  }

  const suffix = token.slice(token.indexOf('_') + 1).trim();
  
  // Handle building-scoped format: unit_B1_Unit 001 -> extract "Unit 001"
  // Pattern: if suffix starts with a building-like prefix (B1_, B2_, Building 1_, etc.)
  // then strip it to get the actual unit label
  const buildingPrefixMatch = suffix.match(/^(B\d+|Building\s*\d+)_(.+)$/i);
  if (buildingPrefixMatch) {
    const unitPart = buildingPrefixMatch[2].trim();
    if (/^\d+$/.test(unitPart)) {
      return unitPart.replace(/^0+/, '') || '0';
    }
    return unitPart;
  }

  // Normalize numeric suffixes (e.g., "001" -> "1")
  if (/^\d+$/.test(suffix)) {
    return suffix.replace(/^0+/, '') || '0';
  }
  return suffix;
};

const extractInspectedUnitLabels = ({
  inspectionType,
  responses,
  inspectionData,
  canonicalBuildingId,
}) => {
  const inspectedUnits = new Map();

  const addCandidate = (candidate) => {
    const rawLabel = normalizeStringValue(candidate);
    if (!rawLabel || isPlaceholderUnitValue(rawLabel)) {
      return;
    }

    if (looksLikeBuildingLabel(rawLabel)) {
      return;
    }

    const normalizedUnit = normalizeUnitIdentifierValue(rawLabel);
    if (!normalizedUnit || PLACEHOLDER_UNIT_TOKENS.has(normalizedUnit)) {
      return;
    }

    if (!inspectedUnits.has(normalizedUnit)) {
      inspectedUnits.set(normalizedUnit, rawLabel);
    }
  };

  const normalizedInspectionType = normalizeStringValue(inspectionType);
  const normalizedInspectionTypeLower = normalizedInspectionType.toLowerCase();
  
  // Only process unit flags for inspections in the 'units' bucket
  const typeBucket = normalizeInspectionTypeBucket(normalizedInspectionType);
  if (typeBucket === 'outside' || typeBucket === 'inside') {
    if (inspectionData?.isComplete) {
      return [typeBucket.charAt(0).toUpperCase() + typeBucket.slice(1)];
    }
    return [];
  }

  if (typeBucket !== 'units') {
    return [];
  }

  const hasResponses =
    responses &&
    typeof responses === 'object' &&
    !Array.isArray(responses) &&
    Object.keys(responses).length > 0;

  if (normalizedInspectionTypeLower === 'unit' || normalizedInspectionTypeLower.startsWith('unit_')) {
    if (hasResponses) {
      addCandidate(extractUnitSuffixFromInspectionType(normalizedInspectionType));
      addCandidate(inspectionData?.currentUnit);
    }
  }

  const canonicalBuildingToken = normalizeTokenValue(canonicalBuildingId);
  const deficiencies = Array.isArray(inspectionData?.deficiencies)
    ? inspectionData.deficiencies
    : (Array.isArray(inspectionData?.findings) ? inspectionData.findings : []);

  deficiencies.forEach((deficiencyItem) => {
    if (!deficiencyItem || typeof deficiencyItem !== 'object') {
      return;
    }

    const explicitBuildingCandidates = [
      deficiencyItem?.buildingInspectionId,
      deficiencyItem?.building,
      deficiencyItem?.buildingName,
      deficiencyItem?.buildingId,
    ]
      .map((candidate) => normalizeTokenValue(candidate))
      .filter(Boolean);

    const hasExplicitBuilding = explicitBuildingCandidates.length > 0;
    const matchesBuilding =
      !canonicalBuildingToken ||
      !hasExplicitBuilding ||
      explicitBuildingCandidates.includes(canonicalBuildingToken);

    if (!matchesBuilding) {
      return;
    }

    addCandidate(deficiencyItem?._unit);
    addCandidate(deficiencyItem?.unit);
    addCandidate(deficiencyItem?.unitId);
    addCandidate(deficiencyItem?.currentUnit);
  });

  return Array.from(inspectedUnits.entries()).map(([, unitLabel]) => unitLabel);
};

const upsertInspectedUnitFlags = async ({
  propertyId,
  inspectorId,
  canonicalBuildingId,
  inspectionType,
  responses,
  inspectionData,
  progressId,
}) => {
  const buildingLabel = normalizeStringValue(canonicalBuildingId);
  if (!buildingLabel || isPlaceholderBuildingValue(buildingLabel)) {
    return [];
  }

  const inspectedUnitLabels = extractInspectedUnitLabels({
    inspectionType,
    responses,
    inspectionData,
    canonicalBuildingId: buildingLabel,
  });

  const typeBucket = normalizeInspectionTypeBucket(inspectionType);

  if (inspectedUnitLabels.length === 0) {
    return [];
  }

  const upsertOperations = inspectedUnitLabels
    .map((unitLabel) => {
      const normalizedUnitKey = normalizeUnitIdentifierValue(unitLabel);
      if (!normalizedUnitKey) {
        return null;
      }

      return {
        updateOne: {
          filter: {
            propertyId,
            inspectorId,
            buildingId: buildingLabel,
            normalizedUnitKey,
          },
          update: {
            $setOnInsert: {
              propertyId,
              inspectorId,
              buildingId: buildingLabel,
              normalizedUnitKey,
            },
            $set: {
              unitLabel: normalizeStringValue(unitLabel),
              isInspected: Boolean(inspectionData?.isComplete),
              inspectedAt: new Date(),
              sourceInspectionType: normalizeStringValue(inspectionType),
              lastProgressId: progressId || null,
              metadata:
                inspectionData && typeof inspectionData === 'object' && !Array.isArray(inspectionData)
                  ? {
                    buildingInspectionId: inspectionData.buildingInspectionId || null,
                    updatedAt: new Date().toISOString(),
                  }
                  : { updatedAt: new Date().toISOString() },
            },
          },
          upsert: true,
        },
      };
    })
    .filter(Boolean);

  if (upsertOperations.length === 0) {
    return [];
  }

  await InspectionUnitFlag.bulkWrite(upsertOperations, { ordered: false });
  return inspectedUnitLabels;
};

// @desc    Create a new inspection
// @route   POST /api/inspections
// @access  Private
exports.createInspection = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation Error',
        errors: errors.array().map((e) => e.msg),
      });
    }

    const {
      property,
      building,
      unit,
      inspectionType,
      inspectionLevel,
      scheduledDate,
      purpose,
      hudPreNegative,
      managementCompany,
      insuranceCompany,
      banker,
      notes,
    } = req.body;

    // Verify property exists
    const propertyExists = await Property.findById(property);
    if (!propertyExists) {
      return res.status(404).json({
        success: false,
        message: 'Property not found',
      });
    }

    const inspectionId = await generateInspectionId();

    const inspection = new Inspection({
      inspectionId,
      property,
      building,
      unit,
      inspectionType,
      inspectionLevel,
      inspector: req.userId,
      scheduledDate,
      purpose,
      hudPreNegative,
      managementCompany,
      insuranceCompany,
      banker,
      notes,
      createdBy: req.userId,
    });

    await inspection.save();

    res.status(201).json({
      success: true,
      message: 'Inspection created successfully',
      inspection,
    });
  } catch (error) {
    console.error('Create inspection error:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating inspection',
      error: error.message,
    });
  }
};

// @desc    Get all inspections for user
// @route   GET /api/inspections
// @access  Private
exports.getInspections = async (req, res) => {
  try {
    const { status, property, page = 1, limit = 10 } = req.query;

    const query = { inspector: req.userId };

    if (status) query.status = status;
    if (property) query.property = property;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const inspections = await Inspection.find(query)
      .populate('property', 'propertyId name address city state zipCode')
      .sort({ scheduledDate: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Inspection.countDocuments(query);

    res.status(200).json({
      success: true,
      inspections,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    console.error('Get inspections error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching inspections',
      error: error.message,
    });
  }
};

// @desc    Get a single inspection
// @route   GET /api/inspections/:id
// @access  Private
exports.getInspection = async (req, res) => {
  try {
    const inspection = await Inspection.findById(req.params.id)
      .populate('property', 'propertyId name address city state zipCode buildings units')
      .populate('building', 'buildingId name floors totalUnits')
      .populate('unit', 'unitId unitNumber floor bedrooms bathrooms')
      .populate('inspector', 'fullName email')
      .populate('createdBy', 'fullName email');

    if (!inspection) {
      return res.status(404).json({
        success: false,
        message: 'Inspection not found',
      });
    }

    res.status(200).json({
      success: true,
      inspection,
    });
  } catch (error) {
    console.error('Get inspection error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching inspection',
      error: error.message,
    });
  }
};

// @desc    Update an inspection
// @route   PUT /api/inspections/:id
// @access  Private
exports.updateInspection = async (req, res) => {
  try {
    const { status, score, result, deficiencies, notes, completedDate } = req.body;

    const updateData = {
      updatedAt: Date.now(),
    };

    if (status) updateData.status = status;
    if (score !== undefined) updateData.score = score;
    if (result) updateData.result = result;
    if (deficiencies) updateData.deficiencies = deficiencies;
    if (notes !== undefined) updateData.notes = notes;
    if (completedDate) updateData.completedDate = completedDate;

    const inspection = await Inspection.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    );

    if (!inspection) {
      return res.status(404).json({
        success: false,
        message: 'Inspection not found',
      });
    }

    res.status(200).json({
      success: true,
      message: 'Inspection updated successfully',
      inspection,
    });
  } catch (error) {
    console.error('Update inspection error:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating inspection',
      error: error.message,
    });
  }
};

// @desc    Complete an inspection
// @route   PATCH /api/inspections/:id/complete
// @access  Private
exports.completeInspection = async (req, res) => {
  try {
    const { score, complianceScore, result, deficiencies, findings, notes } = req.body;

    // Support both field naming conventions
    const finalScore = complianceScore || score || 0;
    const finalFindings = findings || deficiencies || [];

    const inspection = await Inspection.findByIdAndUpdate(
      req.params.id,
      {
        status: 'completed',
        completedDate: Date.now(),
        complianceScore: finalScore,
        score: finalScore,
        result: result || (finalScore >= 70 ? 'compliant' : 'non-compliant'),
        deficiencies: finalFindings,
        findings: finalFindings,
        notes,
        updatedAt: Date.now(),
      },
      { new: true }
    );

    if (!inspection) {
      return res.status(404).json({
        success: false,
        message: 'Inspection not found',
      });
    }

    // Update property's last inspection date
    await Property.findByIdAndUpdate(inspection.property, {
      lastInspectionDate: Date.now(),
    });

    res.status(200).json({
      success: true,
      message: 'Inspection completed successfully',
      inspection,
    });
  } catch (error) {
    console.error('Complete inspection error:', error);
    res.status(500).json({
      success: false,
      message: 'Error completing inspection',
      error: error.message,
    });
  }
};

// @desc    Delete an inspection
// @route   DELETE /api/inspections/:id
// @access  Private
exports.deleteInspection = async (req, res) => {
  try {
    const inspection = await Inspection.findByIdAndDelete(req.params.id);

    if (!inspection) {
      return res.status(404).json({
        success: false,
        message: 'Inspection not found',
      });
    }

    res.status(200).json({
      success: true,
      message: 'Inspection deleted successfully',
    });
  } catch (error) {
    console.error('Delete inspection error:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting inspection',
      error: error.message,
    });
  }
};

// @desc    Get inspection stats
// @route   GET /api/inspections/stats
// @access  Private
exports.getInspectionStats = async (req, res) => {
  try {
    const userId = req.userId;

    const stats = await Inspection.aggregate([
      { $match: { inspector: userId } },
      {
        $group: {
          _id: null,
          totalInspections: { $sum: 1 },
          completed: {
            $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] },
          },
          scheduled: {
            $sum: { $cond: [{ $eq: ['$status', 'scheduled'] }, 1, 0] },
          },
          inProgress: {
            $sum: { $cond: [{ $eq: ['$status', 'in-progress'] }, 1, 0] },
          },
          passed: {
            $sum: { $cond: [{ $eq: ['$result', 'pass'] }, 1, 0] },
          },
          failed: {
            $sum: { $cond: [{ $eq: ['$result', 'fail'] }, 1, 0] },
          },
          averageScore: { $avg: '$score' },
        },
      },
    ]);

    res.status(200).json({
      success: true,
      stats: stats[0] || {
        totalInspections: 0,
        completed: 0,
        scheduled: 0,
        inProgress: 0,
        passed: 0,
        failed: 0,
        averageScore: 0,
      },
    });
  } catch (error) {
    console.error('Get inspection stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching inspection stats',
      error: error.message,
    });
  }
};

// @desc    Generate shareable report link
// @route   POST /api/inspections/:id/share
// @access  Private
exports.generateShareableLink = async (req, res) => {
  try {
    const inspection = await Inspection.findById(req.params.id)
      .populate('property', 'propertyId name address city state zipCode')
      .populate('building', 'buildingId name')
      .populate('unit', 'unitId unitNumber')
      .populate('inspector', 'fullName email');

    if (!inspection) {
      return res.status(404).json({
        success: false,
        message: 'Inspection not found',
      });
    }

    // Generate a unique share token
    const crypto = require('crypto');
    const shareToken = crypto.randomBytes(32).toString('hex');

    // Update inspection with share token and expiry (30 days from now)
    const shareExpiry = new Date();
    shareExpiry.setDate(shareExpiry.getDate() + 30);

    await Inspection.findByIdAndUpdate(req.params.id, {
      shareToken,
      shareExpiry,
      isShared: true,
    });

    // Generate the shareable URL
    const baseUrl = process.env.FRONTEND_URL || 'https://nspire-five.vercel.app';
    const shareUrl = `${baseUrl}/shared-report/${shareToken}`;

    res.status(200).json({
      success: true,
      message: 'Shareable link generated successfully',
      shareUrl,
      expiresAt: shareExpiry,
    });
  } catch (error) {
    console.error('Generate shareable link error:', error);
    res.status(500).json({
      success: false,
      message: 'Error generating shareable link',
      error: error.message,
    });
  }
};

// @desc    Get shared report by token (public access)
// @route   GET /api/inspections/shared/:token
// @access  Public
exports.getSharedReport = async (req, res) => {
  try {
    const { token } = req.params;

    const inspection = await Inspection.findOne({
      shareToken: token,
      isShared: true,
      shareExpiry: { $gt: new Date() },
    })
      .populate('property', 'propertyId name address city state zipCode')
      .populate('building', 'buildingId name')
      .populate('unit', 'unitId unitNumber')
      .populate('inspector', 'fullName email');

    if (!inspection) {
      return res.status(404).json({
        success: false,
        message: 'Shared report not found or has expired',
      });
    }

    // Return only necessary data for public viewing
    const publicReport = {
      _id: inspection._id,
      inspectionId: inspection.inspectionId,
      property: inspection.property,
      building: inspection.building,
      unit: inspection.unit,
      inspector: {
        fullName: inspection.inspector?.fullName || 'N/A',
      },
      scheduledDate: inspection.scheduledDate,
      inspectionDate: inspection.inspectionDate,
      completedDate: inspection.completedDate,
      status: inspection.status,
      result: inspection.result,
      score: inspection.score,
      complianceScore: inspection.complianceScore,
      deficiencies: inspection.deficiencies,
      findings: inspection.findings,
      notes: inspection.notes,
      createdAt: inspection.createdAt,
    };

    res.status(200).json({
      success: true,
      inspection: publicReport,
    });
  } catch (error) {
    console.error('Get shared report error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching shared report',
      error: error.message,
    });
  }
};

// ============= INSPECTION REQUEST ENDPOINTS =============

// @desc    Create an inspection request
// @route   POST /api/inspections/request
// @access  Private
exports.createInspectionRequest = async (req, res) => {
  try {
    const {
      purpose,
      hudPreNegative,
      managementCompany,
      insuranceCompany,
      banker,
      buildings,
      units,
      state,
      city,
      zipCode,
    } = req.body;

    const request = new InspectionRequest({
      purpose,
      hudPreNegative,
      managementCompany,
      insuranceCompany,
      banker,
      buildings,
      units,
      state,
      city,
      zipCode,
      requestedBy: req.userId,
    });

    await request.save();

    res.status(201).json({
      success: true,
      message: 'Inspection request submitted successfully',
      request,
    });
  } catch (error) {
    console.error('Create inspection request error:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating inspection request',
      error: error.message,
    });
  }
};

// @desc    Get all inspection requests
// @route   GET /api/inspections/requests
// @access  Private
exports.getInspectionRequests = async (req, res) => {
  try {
    const { status, page = 1, limit = 10 } = req.query;

    const query = { requestedBy: req.userId };
    if (status) query.status = status;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const requests = await InspectionRequest.find(query)
      .populate('requestedBy', 'fullName email')
      .populate('assignedInspector', 'fullName email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await InspectionRequest.countDocuments(query);

    res.status(200).json({
      success: true,
      requests,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    console.error('Get inspection requests error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching inspection requests',
      error: error.message,
    });
  }
};
const { generateEnhancedNSPIREReport } = require('../utils/enhancedNspireReportGenerator');

// @desc    Generate NSPIRE PDF Report
// @route   GET /api/inspections/:id/nspire-pdf
// @access  Private
exports.generateNSPIREPDF = async (req, res) => {
  try {
    const { id } = req.params;
    const { includeImages = true, includeSummary = true, includeDeficiencies = true } = req.query;

    // Find the inspection with populated data
    const inspection = await Inspection.findById(id)
      .populate('property', 'name address city state zipCode buildings units contactName')
      .populate('inspector', 'fullName email')
      .lean();

    if (!inspection) {
      return res.status(404).json({
        success: false,
        message: 'Inspection not found',
      });
    }

    // Check if user has permission to view this inspection
    if (req.userRole !== 'admin' && req.userRole !== 'management' && inspection.inspector._id.toString() !== req.userId) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. You can only view your own inspections.',
      });
    }

    console.log('Generating NSPIRE PDF for inspection:', inspection.inspectionId);

    try {
      // Try to generate the PDF using enhanced NSPIRE format
      const pdfPath = await generateEnhancedNSPIREReport(inspection, {
        includeImages: includeImages === 'true',
        includeSummary: includeSummary === 'true',
        includeDeficiencies: includeDeficiencies === 'true',
        includeCertification: true
      });

      // Set headers for PDF download
      const filename = `INSPIRE_Report_${inspection.inspectionId}_${new Date().toISOString().split('T')[0]}.pdf`;

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Cache-Control', 'no-cache');

      // Stream the PDF file
      const fs = require('fs');
      const pdfStream = fs.createReadStream(pdfPath);

      pdfStream.pipe(res);

      // Clean up the temporary file after streaming
      pdfStream.on('end', () => {
        fs.unlink(pdfPath, (err) => {
          if (err) console.error('Error deleting temporary PDF:', err);
        });
      });

      pdfStream.on('error', (error) => {
        console.error('Error streaming PDF:', error);
        res.status(500).json({
          success: false,
          message: 'Error streaming PDF file',
        });
      });

    } catch (pdfError) {
      console.error('PDF generation failed, falling back to HTML:', pdfError.message);

      // Fallback: Return HTML content for client-side PDF generation
      const { generateNSPIREHTML, convertToNSPIREFormat } = require('../utils/nspireReportGenerator');
      const nspireReport = await convertToNSPIREFormat(inspection);
      const html = generateNSPIREHTML(nspireReport, {
        includeImages: includeImages === 'true',
        includeSummary: includeSummary === 'true',
        includeDeficiencies: includeDeficiencies === 'true',
        includeCertification: true
      });

      // Return HTML with instructions for client-side PDF generation
      res.status(200).json({
        success: true,
        message: 'PDF generation not available, returning HTML for client-side conversion',
        html: html,
        filename: `INSPIRE_Report_${inspection.inspectionId}_${new Date().toISOString().split('T')[0]}.pdf`
      });
    }

  } catch (error) {
    console.error('Generate NSPIRE PDF error:', error);
    res.status(500).json({
      success: false,
      message: 'Error generating NSPIRE PDF report',
      error: error.message,
    });
  }
};

// @desc    Preview NSPIRE Report HTML
// @route   GET /api/inspections/:id/nspire-preview
// @access  Private
exports.previewNSPIREReport = async (req, res) => {
  try {
    const { id } = req.params;

    // Find the inspection with populated data
    const inspection = await Inspection.findById(id)
      .populate('property', 'name address city state zipCode buildings units contactName')
      .populate('inspector', 'fullName email')
      .lean();

    if (!inspection) {
      return res.status(404).json({
        success: false,
        message: 'Inspection not found',
      });
    }

    // Check if user has permission to view this inspection
    if (req.userRole !== 'admin' && req.userRole !== 'management' && inspection.inspector._id.toString() !== req.userId) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. You can only view your own inspections.',
      });
    }

    const { generateEnhancedNSPIREHTML, convertToEnhancedNSPIREFormat } = require('../utils/enhancedNspireReportGenerator');

    // Convert to Enhanced NSPIRE format and generate HTML
    const nspireReport = await convertToEnhancedNSPIREFormat(inspection);
    const html = await generateEnhancedNSPIREHTML(nspireReport, {
      includeImages: true,
      includeSummaryPage: true,
      includeDetailedDeficiencies: true,
      includeCertification: true
    });

    res.setHeader('Content-Type', 'text/html');
    res.send(html);

  } catch (error) {
    console.error('Preview NSPIRE Report error:', error);
    res.status(500).json({
      success: false,
      message: 'Error generating NSPIRE report preview',
      error: error.message,
    });
  }
};

// @desc    Sample random units for NSPIRE inspection
// @route   POST /api/inspections/sample-units
// @access  Private
exports.sampleInspectionUnits = async (req, res) => {
  try {
    const { propertyId, totalUnits, seed } = req.body;

    // Validate inputs
    if (!propertyId) {
      return res.status(400).json({
        success: false,
        message: 'Property ID is required',
      });
    }

    // Find the property to ensure it exists
    const property = await Property.findById(propertyId);
    if (!property) {
      return res.status(404).json({
        success: false,
        message: 'Property not found',
      });
    }

    // Retrieve all units for the property
    let units = await Unit.find({ property: propertyId });

    // If no specific unit documents exist but the property has a unit count, 
    // generate placeholder units to satisfy the sampling requirement
    if (units.length === 0 && property.units > 0) {
      console.log(`Generating ${property.units} placeholder units for property ${propertyId}`);
      units = Array.from({ length: property.units }, (_, i) => ({
        _id: `temp-${i + 1}`,
        unitNumber: `${i + 1}`,
        status: 'occupied'
      }));
    }

    // Perform the NSPIRE sampling
    const samplingResult = selectNspireUnits(units, { seed });

    // Respond with the specific JSON structure required
    res.status(200).json({
      success: true,
      data: {
        primaryUnits: samplingResult.primaryUnits,
        alternateUnits: samplingResult.alternateUnits,
        sampleSize: samplingResult.sampleSize,
        universeSize: samplingResult.universeSize,
        seed: samplingResult.seedUsed
      }
    });

  } catch (error) {
    console.error('Sample inspection units error:', error);
    res.status(500).json({
      success: false,
      message: 'Error sampling inspection units',
      error: error.message,
    });
  }
};

// @desc    Generate PDF from provided JSON data
// @route   POST /api/inspections/generate-pdf
// @access  Private
exports.generatePDFFromData = async (req, res) => {
  try {
    const { inspectionData, reportType = 'nspire' } = req.body;

    // Validate input data
    if (!inspectionData) {
      return res.status(400).json({
        success: false,
        message: 'Inspection data is required',
      });
    }

    // Generate PDF based on report type
    let pdfBuffer;

    if (reportType === 'nspire') {
      const { generateEnhancedNSPIREReport } = require('../utils/enhancedNspireReportGenerator');
      pdfBuffer = await generateEnhancedNSPIREReport(inspectionData, {
        includeImages: req.query.includeImages !== 'false'
      });

      // Check if we got HTML instead of PDF (fallback case)
      const bufferString = pdfBuffer.toString('utf8', 0, 100);
      if (bufferString.includes('<!DOCTYPE html') || bufferString.includes('<html')) {
        console.log('Puppeteer failed, returning HTML fallback as JSON');
        // Return JSON with HTML content so frontend can handle it
        return res.status(200).json({
          success: true,
          message: 'PDF generation not available, returning HTML for client-side conversion',
          html: pdfBuffer.toString('utf8'),
          filename: `NSPIRE_Report_${inspectionData.inspectionNo || inspectionData.inspectionId || 'report'}_${new Date().toISOString().split('T')[0]}.pdf`
        });
      }
    } else {
      return res.status(400).json({
        success: false,
        message: 'Unsupported report type',
      });
    }

    if (!pdfBuffer) {
      return res.status(500).json({
        success: false,
        message: 'Failed to generate PDF report',
      });
    }

    // Generate filename with inspection details
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const inspectionNo = inspectionData.inspectionNo || inspectionData.inspectionId || `INSP-${Date.now().toString(36).toUpperCase()}`;
    const filename = `NSPIRE_Report_${inspectionNo}_${timestamp}.pdf`;

    // Send the PDF buffer directly
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    res.send(pdfBuffer);

  } catch (error) {
    console.error('Generate PDF from data error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate PDF report',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};


// @desc    Complete inspection by property ID (create or update)
// @route   POST /api/inspections/complete
// @access  Private
exports.completeInspectionByProperty = async (req, res) => {
  try {
    const requestPayload = req.body && typeof req.body === 'object' ? req.body : {};
    const inspectionData = requestPayload.inspectionData && typeof requestPayload.inspectionData === 'object'
      ? requestPayload.inspectionData
      : {};

    const propertyIdentifier =
      requestPayload.propertyId ||
      inspectionData.propertyId ||
      inspectionData.property?._id ||
      inspectionData.property?.id ||
      inspectionData.property?.propertyId;

    if (!propertyIdentifier) {
      return res.status(400).json({
        success: false,
        message: 'Property ID is required',
      });
    }

    let property = null;
    const normalizedPropertyIdentifier = String(propertyIdentifier).trim();

    // Verify property exists (support both Mongo ObjectId and business propertyId)
    if (mongoose.Types.ObjectId.isValid(normalizedPropertyIdentifier)) {
      property = await Property.findById(normalizedPropertyIdentifier);
    }

    if (!property) {
      property = await Property.findOne({ propertyId: normalizedPropertyIdentifier });
    }

    if (!property) {
      return res.status(404).json({
        success: false,
        message: 'Property not found',
      });
    }

    const propertyId = property._id;

    // Map category names to valid enum values
    const mapCategoryToEnum = (category) => {
      if (!category) return 'General';

      const lowerCategory = category.toLowerCase();

      // Site-related items
      if (lowerCategory.includes('address') || lowerCategory.includes('signage') ||
        lowerCategory.includes('parking') || lowerCategory.includes('sidewalk') ||
        lowerCategory.includes('fencing') || lowerCategory.includes('gate') ||
        lowerCategory.includes('retaining wall') || lowerCategory.includes('driveway')) {
        return 'site';
      }

      // Building exterior items
      if (lowerCategory.includes('roof') || lowerCategory.includes('chimney') ||
        lowerCategory.includes('foundation') || lowerCategory.includes('structural') ||
        lowerCategory.includes('door') || lowerCategory.includes('window') ||
        lowerCategory.includes('paint') || lowerCategory.includes('railings')) {
        return 'building-exterior';
      }

      // Building systems
      if (lowerCategory.includes('electrical') || lowerCategory.includes('hvac') ||
        lowerCategory.includes('heating') || lowerCategory.includes('ventilation') ||
        lowerCategory.includes('water heater') || lowerCategory.includes('elevator') ||
        lowerCategory.includes('fire safety') || lowerCategory.includes('carbon monoxide') ||
        lowerCategory.includes('leak') || lowerCategory.includes('drain')) {
        return 'building-systems';
      }

      // Common areas
      if (lowerCategory.includes('lighting') || lowerCategory.includes('egress') ||
        lowerCategory.includes('step') || lowerCategory.includes('stair') ||
        lowerCategory.includes('trash chute')) {
        return 'common-areas';
      }

      // Unit-specific items
      if (lowerCategory.includes('cabinet') || lowerCategory.includes('kitchen') ||
        lowerCategory.includes('restroom') || lowerCategory.includes('sink') ||
        lowerCategory.includes('ceiling') || lowerCategory.includes('floor') ||
        lowerCategory.includes('wall') || lowerCategory.includes('mold') ||
        lowerCategory.includes('grab bar') || lowerCategory.includes('call-for-aid')) {
        return 'unit';
      }

      // Default to General
      return 'General';
    };

    // Find existing inspection for this property or create new one
    let inspection = await Inspection.findOne({
      property: propertyId,
      inspector: req.userId
    }).sort({ createdAt: -1 });

    const parsedFinalScore = Number(
      inspectionData.complianceScore ?? inspectionData.finalScore
    );
    const finalScore = Number.isFinite(parsedFinalScore) ? parsedFinalScore : 85;

    const toArray = (value) => (Array.isArray(value) ? value : []);
    const isPlainObject = (value) => value && typeof value === 'object' && !Array.isArray(value);
    const normalizeMergeToken = (value) => String(value ?? '').trim().toLowerCase();

    const normalizeDeficiencySeverity = (value) => {
      const normalized = String(value ?? 'moderate')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, '-');

      const allowed = new Set(['life-threatening', 'severe', 'moderate', 'minor', 'low', 'medium', 'high']);
      return allowed.has(normalized) ? normalized : 'moderate';
    };

    const normalizeDeficiencyStatus = (value) => {
      const normalized = String(value ?? 'open')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, '-');

      const allowed = new Set(['open', 'in-progress', 'resolved', 'verified']);
      return allowed.has(normalized) ? normalized : 'open';
    };

    const buildFindingMergeKey = (finding) => {
      if (!isPlainObject(finding)) {
        return `primitive|${normalizeMergeToken(finding)}`;
      }

      const stableId = normalizeMergeToken(
        finding?.dedupeKey ||
        finding?.deficiencyQRId ||
        finding?.findingId ||
        finding?.id ||
        finding?._id ||
        ''
      );

      if (stableId && !['unknown', 'undefined', 'null'].includes(stableId)) {
        const buildingToken = normalizeMergeToken(
          finding?.buildingInspectionId ||
          finding?.building_id ||
          finding?.building ||
          finding?.buildingName ||
          finding?.buildingId ||
          finding?._unit ||
          ''
        );

        return `id|${stableId}|${buildingToken || 'unknown-building'}`;
      }

      const area = normalizeMergeToken(finding?._area || finding?.area || finding?.location || 'unknown-area');
      const building = normalizeMergeToken(
        finding?.buildingInspectionId ||
        finding?.building_id ||
        finding?.building ||
        finding?.buildingName ||
        finding?.buildingId ||
        ''
      );
      const unit = normalizeMergeToken(
        finding?._unit ||
        finding?.unit ||
        finding?.unitId ||
        finding?.unitNumber ||
        'unknown-unit'
      );
      const moduleId = normalizeMergeToken(
        finding?.itemId ||
        finding?.itemName ||
        finding?.module ||
        finding?.submodule ||
        'unknown-item'
      );
      const name = normalizeMergeToken(
        finding?.deficiency?.name ||
        finding?.deficiencyName ||
        finding?.name ||
        finding?.title ||
        (finding?.isGeneralComment ? 'general comment' : 'unknown-deficiency')
      );
      const detail = normalizeMergeToken(
        finding?.deficiency?.detail ||
        finding?.deficiencyDetails ||
        finding?.detail ||
        finding?.description ||
        ''
      );

      return `${area}|${building || 'unknown-building'}|${unit}|${moduleId}|${name}`;
    };

    const mergeFindingLists = (existingList = [], incomingList = []) => {
      const merged = new Map();

      const upsert = (entry) => {
        if (!isPlainObject(entry)) {
          return;
        }

        const key = buildFindingMergeKey(entry);
        const previous = merged.get(key) || {};
        merged.set(key, {
          ...previous,
          ...entry,
          dedupeKey: key,
        });
      };

      existingList.forEach(upsert);
      incomingList.forEach(upsert);

      return Array.from(merged.values());
    };

    const transformFindingToDeficiency = (def) => {
      const rawArea = def._area || def.area || def.category || '';
      const rawAreaToken = String(rawArea || '').toLowerCase();
      const isInsideOutside = rawAreaToken.includes('inside') || rawAreaToken.includes('outside');

      const resolvedBuilding =
        def.buildingInspectionId ||
        def.building_id ||
        def.building ||
        def.buildingName ||
        def.buildingId ||
        (isInsideOutside ? def._unit : '') ||
        '';

      const resolvedUnit =
        def._unit ||
        def.unit ||
        def.unitId ||
        def.unitNumber ||
        (isInsideOutside ? '-' : '');

      return {
        category: mapCategoryToEnum(def.category || def.area),
        subCategory: def.subCategory || def.area || def.category || def.title || '',
        description: def.description || def.deficiencyDetails || def.detail || '',
        severity: normalizeDeficiencySeverity(def.severity),
        status: normalizeDeficiencyStatus(def.status),
        notes: def.notes || def.comments || '',
        photos: def.imageUri || def.imageUrl ? [{
          url: def.imageUri || def.imageUrl,
          caption: def.title || def.deficiencyName || '',
          uploadedAt: new Date()
        }] : [],
        area: def._area || def.area || '',
        building: resolvedBuilding,
        unit: resolvedUnit,
        itemId: def.itemId || def.itemName || '',
        deficiencyQRId: def.deficiencyQRId || '',
      };
    };

    const incomingFindings = toArray(inspectionData.findings || inspectionData.deficiencies);
    const existingFindings = inspection
      ? toArray(inspection.findings && inspection.findings.length > 0
        ? inspection.findings
        : inspection.deficiencies)
      : [];

    const mergedFindings = mergeFindingLists(existingFindings, incomingFindings);

    // Transform deficiencies to match model schema
    const transformedDeficiencies = mergedFindings.map(transformFindingToDeficiency);

    if (inspection) {
      // Update existing inspection
      inspection.status = 'completed';
      inspection.completedDate = new Date();
      inspection.complianceScore = finalScore;
      inspection.score = finalScore;
      inspection.result = finalScore >= 70 ? 'compliant' : 'non-compliant';
      inspection.deficiencies = transformedDeficiencies;
      inspection.findings = mergedFindings;
      inspection.notes = inspectionData.notes || inspection.notes;
      inspection.updatedAt = new Date();

      await inspection.save();
    } else {
      // Create new inspection
      const inspectionId = await generateInspectionId();

      inspection = await Inspection.create({
        inspectionId,
        property: propertyId,
        inspector: req.userId,
        inspectionType: 'general', // Use lowercase enum value
        status: inspectionData.status || 'in-progress',
        scheduledDate: new Date(),
        completedDate: new Date(),
        complianceScore: finalScore,
        score: finalScore,
        result: finalScore >= 70 ? 'compliant' : 'non-compliant',
        deficiencies: transformedDeficiencies,
        findings: mergedFindings,
        notes: inspectionData.notes || '',
        createdBy: req.userId, // Required field
      });
    }

    // Update property's last inspection date
    await Property.findByIdAndUpdate(propertyId, {
      lastInspectionDate: new Date(),
    });

    res.status(200).json({
      success: true,
      message: 'Inspection completed and saved successfully',
      inspection,
    });
  } catch (error) {
    console.error('Complete inspection by property error:', error);
    res.status(500).json({
      success: false,
      message: 'Error completing inspection',
      error: error.message,
    });
  }
};
// @route   POST /api/inspections/progress
// @desc    Save partial progress for an inspection (Draft)
// @access  Private
exports.saveProgress = async (req, res) => {
  try {
    const {
      property_id,
      unit_id,
      inspection_type,
      responses,
      inspectionData,
      building_id,
      buildingId,
    } = req.body;

    const normalizedInspectionType = normalizeInspectionTypeValue(inspection_type);

    if (!property_id || !unit_id || !normalizedInspectionType) {
      return res.status(400).json({ msg: 'Property ID, unit ID, and inspection type are required' });
    }

    const canonicalBuildingId = resolveCanonicalBuildingId({
      unitId: unit_id,
      inspectionData,
      building_id,
      buildingId,
    });

    const isPlainObject = (value) => value && typeof value === 'object' && !Array.isArray(value);
    const isDraftProgress = String(normalizedInspectionType || '').toUpperCase().startsWith('REPORT_DRAFT_');

    const normalizeFindingToken = (value) => String(value ?? '').trim().toLowerCase();

    const buildFindingMergeKey = (finding, fallbackMeta = {}) => {
      if (!isPlainObject(finding)) {
        return `primitive|${normalizeFindingToken(finding)}`;
      }

      const stableId = normalizeFindingToken(
        finding?.dedupeKey ||
        finding?.deficiencyQRId ||
        finding?.findingId ||
        finding?.id ||
        finding?._id ||
        ''
      );

      if (stableId && !['unknown', 'undefined', 'null'].includes(stableId)) {
        return `id|${stableId}`;
      }

      const area = normalizeFindingToken(
        finding?._area || finding?.area || finding?.location || fallbackMeta?.area || 'unknown-area'
      );
      const unit = normalizeFindingToken(
        finding?._unit ||
        finding?.unit ||
        finding?.unitId ||
        finding?.unitNumber ||
        finding?.building ||
        finding?.buildingName ||
        fallbackMeta?.unit ||
        'unknown-unit'
      );
      const moduleId = normalizeFindingToken(
        finding?.itemId ||
        finding?.itemName ||
        finding?.module ||
        finding?.submodule ||
        'unknown-item'
      );
      const name = normalizeFindingToken(
        finding?.deficiency?.name ||
        finding?.deficiencyName ||
        finding?.name ||
        finding?.title ||
        (finding?.isGeneralComment ? 'general comment' : 'unknown-deficiency')
      );
      const detail = normalizeFindingToken(
        finding?.deficiency?.detail ||
        finding?.deficiencyDetails ||
        finding?.detail ||
        finding?.description ||
        ''
      );

      const building = normalizeFindingToken(
        finding?.building ||
        finding?.buildingId ||
        fallbackMeta?.buildingId ||
        (typeof canonicalBuildingId === 'string' ? canonicalBuildingId : '') ||
        ''
      );
      
      return `${area}|${building}|${unit}|${moduleId}|${name}`;
    };

    const mergeFindingArrays = (existingList = [], incomingList = [], fallbackMeta = {}) => {
      const merged = new Map();

      const upsert = (entry) => {
        if (!isPlainObject(entry)) {
          return;
        }

        // Migration: If finding has 'unknown' building, try to upgrade it to the current canonical building
        const currentBldg = normalizeFindingToken(entry?.building || entry?.buildingId || '');
        if ((!currentBldg || ['unknown', 'unknown-building'].includes(currentBldg)) && 
            canonicalBuildingId && !['UNKNOWN-BUILDING'].includes(String(canonicalBuildingId).toUpperCase())) {
          entry.building = canonicalBuildingId;
          entry.buildingId = canonicalBuildingId;
        }

        const key = buildFindingMergeKey(entry, fallbackMeta);
        const previous = merged.get(key) || {};
        const mergedEntry = {
          ...previous,
          ...entry,
          dedupeKey: key,
        };

        if (!mergedEntry._area && fallbackMeta?.area) {
          mergedEntry._area = fallbackMeta.area;
        }
        if (!mergedEntry._unit && fallbackMeta?.unit) {
          mergedEntry._unit = fallbackMeta.unit;
        }

        merged.set(key, mergedEntry);
      };

      // Order matters: process incoming (new) findings last so they overwrite older ones
      existingList.forEach(upsert);
      incomingList.forEach(upsert);

      return Array.from(merged.values());
    };

    const normalizeDraftInspectionData = (existingData = {}, incomingData = {}) => {
      const safeExisting = isPlainObject(existingData) ? existingData : {};
      const safeIncoming = isPlainObject(incomingData) ? incomingData : {};

      if (safeIncoming.deleted === true) {
        return {
          ...safeExisting,
          ...safeIncoming,
          deficiencies: [],
          findings: [],
        };
      }

      const fallbackMeta = {
        area: safeIncoming?.location || safeIncoming?.area || safeExisting?.location || safeExisting?.area || '',
        unit:
          safeIncoming?.unit ||
          safeIncoming?.buildingId ||
          safeExisting?.unit ||
          safeExisting?.buildingId ||
          unit_id ||
          '',
      };

      const existingDeficiencies = Array.isArray(safeExisting?.deficiencies) ? safeExisting.deficiencies : [];
      const existingFindings = Array.isArray(safeExisting?.findings) ? safeExisting.findings : [];
      const incomingDeficiencies = Array.isArray(safeIncoming?.deficiencies) ? safeIncoming.deficiencies : [];
      const incomingFindings = Array.isArray(safeIncoming?.findings) ? safeIncoming.findings : [];

      const mergedFindings = mergeFindingArrays(
        [...existingDeficiencies, ...existingFindings],
        [...incomingDeficiencies, ...incomingFindings],
        fallbackMeta
      );

      const mergedInspectionData = {
        ...safeExisting,
        ...safeIncoming,
        deficiencies: mergedFindings,
        findings: mergedFindings,
      };

      if (isPlainObject(safeExisting?.property) && isPlainObject(safeIncoming?.property)) {
        mergedInspectionData.property = {
          ...safeExisting.property,
          ...safeIncoming.property,
        };
      }

      return mergedInspectionData;
    };

    const enrichInspectionDataWithBuildingContext = (data, assignedBuildingInspectionId) => {
      if (!isPlainObject(data)) {
        return data;
      }

      return {
        ...data,
        buildingId: normalizeStringValue(data.buildingId || data.building || canonicalBuildingId),
        buildingInspectionId: assignedBuildingInspectionId,
      };
    };

    const normalizedPropertyId = normalizeStringValue(property_id);
    let resolvedPropertyId = normalizedPropertyId;

    if (!mongoose.Types.ObjectId.isValid(normalizedPropertyId)) {
      const property = await Property.findOne({ propertyId: normalizedPropertyId });
      if (property) {
        resolvedPropertyId = property._id;
      } else {
        return res.status(404).json({ success: false, msg: 'Property not found' });
      }
    }

    let progress = await InspectionProgress.findOne({
      propertyId: resolvedPropertyId,
      buildingId: canonicalBuildingId,
      unitId: unit_id,
      inspectionType: {
        $regex: new RegExp(`^${escapeRegexLiteral(normalizedInspectionType)}$`, 'i'),
      },
      inspectorId: req.userId
    }).sort({ updatedAt: -1 });

    const assignedBuildingInspectionId = await resolveBuildingInspectionId({
      propertyId: resolvedPropertyId,
      inspectorId: req.userId,
      canonicalBuildingId,
      existingBuildingInspectionId: progress?.buildingInspectionId || progress?.inspectionData?.buildingInspectionId,
    });

    if (progress) {
      progress.buildingId = canonicalBuildingId;
      progress.buildingInspectionId = assignedBuildingInspectionId;

      if (responses !== undefined) {
        if (
          isDraftProgress &&
          isPlainObject(progress.responses) &&
          isPlainObject(responses)
        ) {
          progress.responses = {
            ...progress.responses,
            ...responses,
          };
        } else {
          progress.responses = responses;
        }
      }

      if (inspectionData !== undefined) {
        if (isPlainObject(inspectionData)) {
          progress.inspectionData = enrichInspectionDataWithBuildingContext(
            normalizeDraftInspectionData(progress.inspectionData, inspectionData),
            assignedBuildingInspectionId
          );
        } else {
          progress.inspectionData = enrichInspectionDataWithBuildingContext(
            inspectionData,
            assignedBuildingInspectionId
          );
        }
      } else if (isPlainObject(progress.inspectionData)) {
        progress.inspectionData = enrichInspectionDataWithBuildingContext(
          progress.inspectionData,
          assignedBuildingInspectionId
        );
      }
    } else {
      const normalizedInspectionData =
        isDraftProgress && isPlainObject(inspectionData)
          ? normalizeDraftInspectionData({}, inspectionData)
          : (inspectionData || {});

      progress = new InspectionProgress({
        propertyId: resolvedPropertyId,
        buildingId: canonicalBuildingId,
        buildingInspectionId: assignedBuildingInspectionId,
        unitId: unit_id,
        inspectionType: normalizedInspectionType,
        inspectorId: req.userId,
        responses: responses || {},
        inspectionData: enrichInspectionDataWithBuildingContext(
          normalizedInspectionData,
          assignedBuildingInspectionId
        )
      });
    }

    try {
      await progress.save();
    } catch (saveError) {
      if (saveError.code === 11000) {
        // Handle legacy index collision (propertyId_1_unitId_1_inspectionType_1_inspectorId_1)
        console.warn('Handling legacy index collision for InspectionProgress:', saveError.message);
        
        // Find the conflicting document and update it instead
        const existingConflict = await InspectionProgress.findOne({
          propertyId: resolvedPropertyId,
          unitId: unit_id,
          inspectorId: req.userId,
          inspectionType: {
            $regex: new RegExp(`^${escapeRegexLiteral(normalizedInspectionType)}$`, 'i'),
          }
        });

        if (existingConflict) {
          existingConflict.buildingId = canonicalBuildingId;
          existingConflict.responses = progress.responses;
          existingConflict.inspectionData = progress.inspectionData;
          progress = await existingConflict.save();
        } else {
          throw saveError; // Re-throw if we still can't find it
        }
      } else {
        throw saveError; // Re-throw other validation/save errors
      }
    }

    try {
      await upsertInspectedUnitFlags({
        propertyId: resolvedPropertyId,
        inspectorId: req.userId,
        canonicalBuildingId: progress.buildingId || canonicalBuildingId,
        inspectionType: progress.inspectionType || normalizedInspectionType,
        responses: progress.responses || {},
        inspectionData: progress.inspectionData || {},
        progressId: progress._id,
      });
    } catch (unitFlagError) {
      console.error('Unit inspection flag upsert failed:', unitFlagError.message);
    }

    try {
      broadcastProgressUpdate({
        userId: req.userId,
        propertyId: resolvedPropertyId,
        buildingId: progress.buildingId || canonicalBuildingId,
        inspectionType: progress.inspectionType || normalizedInspectionType,
        responses: progress.responses || {},
        updatedAt: progress.updatedAt ? progress.updatedAt.toISOString() : new Date().toISOString(),
      });
    } catch (socketError) {
      console.error('Progress socket broadcast failed:', socketError.message);
    }

    res.json({
      success: true,
      msg: 'Progress saved',
      inspectionType: progress.inspectionType || normalizedInspectionType,
      buildingId: progress.buildingId || canonicalBuildingId,
      buildingInspectionId: progress.buildingInspectionId,
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
};

// @route   GET /api/inspections/buildings/:propertyId
// @desc    Get all inspected buildings for a property grouped by backend-assigned building inspection ID
// @access  Private
exports.getInspectedBuildings = async (req, res) => {
  try {
    const { propertyId } = req.params;

    if (!propertyId) {
      return res.status(400).json({
        success: false,
        message: 'Property ID is required',
      });
    }

    const progressRecords = await InspectionProgress.find({
      propertyId,
      inspectorId: req.userId,
    })
      .sort({ updatedAt: -1 })
      .lean();

    const groupedBuildings = new Map();

    progressRecords.forEach((record) => {
      const inferredBuildingId = resolveCanonicalBuildingId({
        unitId: record.unitId,
        inspectionData: record.inspectionData,
        buildingId: record.buildingId,
      });

      const buildingInspectionId =
        normalizeStringValue(record.buildingInspectionId || record.inspectionData?.buildingInspectionId) ||
        `LEGACY-${normalizeStringValue(propertyId)}-${normalizeStringValue(inferredBuildingId)}`;

      if (!groupedBuildings.has(buildingInspectionId)) {
        groupedBuildings.set(buildingInspectionId, {
          buildingInspectionId,
          buildingId: inferredBuildingId,
          propertyId: normalizeStringValue(propertyId),
          inspectionTypes: [],
          inside: null,
          outside: null,
          units: [],
          drafts: [],
          other: [],
          lastUpdatedAt: record.updatedAt,
        });
      }

      const grouped = groupedBuildings.get(buildingInspectionId);
      const inspectionType = normalizeStringValue(record.inspectionType);

      if (!grouped.inspectionTypes.includes(inspectionType)) {
        grouped.inspectionTypes.push(inspectionType);
      }

      const recordPayload = {
        progressId: record._id,
        inspectionType,
        unitId: record.unitId,
        buildingId: inferredBuildingId,
        buildingInspectionId,
        responses: record.responses || {},
        inspectionData: record.inspectionData || {},
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
      };

      const typeBucket = normalizeInspectionTypeBucket(inspectionType);
      if (typeBucket === 'inside') {
        grouped.inside = recordPayload;
      } else if (typeBucket === 'outside') {
        grouped.outside = recordPayload;
      } else if (typeBucket === 'units') {
        grouped.units.push(recordPayload);
      } else if (typeBucket === 'drafts') {
        grouped.drafts.push(recordPayload);
      } else {
        grouped.other.push(recordPayload);
      }

      if (!grouped.lastUpdatedAt || new Date(record.updatedAt) > new Date(grouped.lastUpdatedAt)) {
        grouped.lastUpdatedAt = record.updatedAt;
      }
    });

    const buildings = Array.from(groupedBuildings.values()).sort(
      (a, b) => new Date(b.lastUpdatedAt).getTime() - new Date(a.lastUpdatedAt).getTime()
    );

    return res.status(200).json({
      success: true,
      propertyId,
      totalBuildings: buildings.length,
      buildings,
    });
  } catch (err) {
    console.error(err.message);
    return res.status(500).send('Server Error');
  }
};

// @route   GET /api/inspections/unit-status
// @desc    Get backend-managed inspected unit flags for a property building
// @access  Private
exports.getUnitInspectionStatus = async (req, res) => {
  try {
    const { property_id, building_id } = req.query;

    if (!property_id || !building_id) {
      return res.status(400).json({
        success: false,
        message: 'Property ID and building ID are required',
      });
    }

    const normalizedPropertyId = normalizeStringValue(property_id);
    let resolvedPropertyId = normalizedPropertyId;

    if (!mongoose.Types.ObjectId.isValid(normalizedPropertyId)) {
      const property = await Property.findOne({ propertyId: normalizedPropertyId });
      if (property) {
        resolvedPropertyId = property._id;
      } else {
        return res.status(200).json({ success: true, statuses: [], unitStatusMap: {} });
      }
    }

    const canonicalBuildingId = resolveCanonicalBuildingId({
      unitId: building_id,
      buildingId: building_id,
    });

    let unitFlags = await InspectionUnitFlag.find({
      propertyId: resolvedPropertyId,
      inspectorId: req.userId,
      buildingId: canonicalBuildingId,
      isInspected: true,
    })
      .sort({ inspectedAt: -1, updatedAt: -1 })
      .lean();

    if (unitFlags.length === 0) {
      const progressRecords = await InspectionProgress.find({
        propertyId: resolvedPropertyId,
        inspectorId: req.userId,
      }).lean();

      const targetBuildingToken = normalizeTokenValue(canonicalBuildingId);

      for (const record of progressRecords) {
        const recordBuildingId = resolveCanonicalBuildingId({
          unitId: record.unitId,
          inspectionData: record.inspectionData,
          buildingId: record.buildingId,
        });

        if (normalizeTokenValue(recordBuildingId) !== targetBuildingToken) {
          continue;
        }

        await upsertInspectedUnitFlags({
          propertyId: resolvedPropertyId,
          inspectorId: req.userId,
          canonicalBuildingId,
          inspectionType: record.inspectionType,
          responses: record.responses || {},
          inspectionData: record.inspectionData || {},
          progressId: record._id,
        });
      }

      unitFlags = await InspectionUnitFlag.find({
        propertyId: resolvedPropertyId,
        inspectorId: req.userId,
        buildingId: canonicalBuildingId,
        isInspected: true,
      })
        .sort({ inspectedAt: -1, updatedAt: -1 })
        .lean();
    }

    const unitStatusMap = new Map();
    unitFlags
      .filter((flag) => {
        const bucket = normalizeInspectionTypeBucket(flag.sourceInspectionType);
        return bucket === 'units' || bucket === 'outside' || bucket === 'inside';
      })
      .forEach((flag) => {
        const rawKey = flag.normalizedUnitKey || flag.unitLabel;
        const normalizedUnitKey = normalizeUnitIdentifierValue(rawKey);
        
        // Skip multi-unit lists or placeholder strings that contain commas to ensure clean progress counts
        if (normalizedUnitKey && !normalizedUnitKey.includes(',')) {
          // If we have multiple records for the same unit, prioritize the one that is inspected
          const existing = unitStatusMap.get(normalizedUnitKey);
          const isInspected = Boolean(flag.isInspected);
          
          if (!existing || isInspected) {
            unitStatusMap.set(normalizedUnitKey, {
              unitLabel: normalizeStringValue(flag.unitLabel),
              normalizedUnitKey,
              isInspected,
              inspectedAt: flag.inspectedAt || flag.updatedAt || flag.createdAt || null,
              sourceInspectionType: normalizeStringValue(flag.sourceInspectionType),
            });
          }
        }
      });

    const statuses = Array.from(unitStatusMap.values());

    return res.status(200).json({
      success: true,
      propertyId: normalizeStringValue(property_id),
      buildingId: canonicalBuildingId,
      statuses,
      unitStatusMap: Object.fromEntries(unitStatusMap),
    });
  } catch (err) {
    console.error(err.message);
    return res.status(500).send('Server Error');
  }
};

// @route   GET /api/inspections/progress
// @desc    Get partial progress for an inspection (Draft)
// @access  Private
exports.getProgress = async (req, res) => {
  try {
    const {
      property_id,
      unit_id,
      inspection_type,
      draft_only,
      inspection_type_prefix,
      include_property,
    } = req.query;
    const normalizedInspectionType = normalizeInspectionTypeValue(inspection_type);

    // If no specific unit/type requested, return all (or property-scoped) progress for user
    if (!unit_id && !inspection_type) {
      const progressQuery = { inspectorId: req.userId };

      if (property_id) {
        const normalizedPropertyId = normalizeStringValue(property_id);
        let resolvedPropertyId = normalizedPropertyId;

        // If not a valid ObjectId, try to find the property by its propertyId field
        if (!mongoose.Types.ObjectId.isValid(normalizedPropertyId)) {
          const property = await Property.findOne({ propertyId: normalizedPropertyId });
          if (property) {
            resolvedPropertyId = property._id;
          } else {
            return res.status(200).json({ success: true, progress: [] });
          }
        }
        progressQuery.propertyId = resolvedPropertyId;
      }

      if (req.query.building_id) {
        progressQuery.buildingId = resolveCanonicalBuildingId({
          unitId: req.query.building_id,
          buildingId: req.query.building_id,
        });
      }

      const shouldFetchDraftOnly = String(draft_only || '').toLowerCase() === 'true';
      const inspectionTypePrefixToken = normalizeStringValue(inspection_type_prefix);

      if (shouldFetchDraftOnly) {
        progressQuery.inspectionType = {
          $gte: 'REPORT_DRAFT_',
          $lt: 'REPORT_DRAFT_\uffff',
        };
      } else if (inspectionTypePrefixToken) {
        progressQuery.inspectionType = {
          $gte: inspectionTypePrefixToken,
          $lt: `${inspectionTypePrefixToken}\uffff`,
        };
      }

      const shouldPopulateProperty = String(include_property || '').toLowerCase() === 'true';

      let queryBuilder = InspectionProgress.find(progressQuery)
        .sort({ updatedAt: -1 })
        .lean();

      if (shouldPopulateProperty) {
        queryBuilder = queryBuilder.populate('propertyId');
      }

      const allProgress = await queryBuilder;

      return res.status(200).json({ success: true, progress: allProgress });
    }

    if (!property_id || !unit_id || !normalizedInspectionType) {
      return res.status(400).json({ msg: 'Property ID, unit ID, and inspection type are required' });
    }

    const normalizedPropertyId = normalizeStringValue(property_id);
    let resolvedPropertyId = normalizedPropertyId;

    if (!mongoose.Types.ObjectId.isValid(normalizedPropertyId)) {
      const property = await Property.findOne({ propertyId: normalizedPropertyId });
      if (property) {
        resolvedPropertyId = property._id;
      } else {
        return res.status(200).json({
          items: {},
          inspectionData: {},
          buildingId: resolveCanonicalBuildingId({ unitId: unit_id }),
          buildingInspectionId: null,
        });
      }
    }

    const canonicalBuildingId = resolveCanonicalBuildingId({
      unitId: req.query.building_id || unit_id,
      buildingId: req.query.building_id,
    });

    const progress = await InspectionProgress.findOne({
      propertyId: resolvedPropertyId,
      buildingId: canonicalBuildingId,
      unitId: unit_id,
      inspectionType: {
        $regex: new RegExp(`^${escapeRegexLiteral(normalizedInspectionType)}$`, 'i'),
      },
      inspectorId: req.userId
    }).sort({ updatedAt: -1 });

    if (!progress) {
      return res.json({
        items: {},
        inspectionData: {},
        buildingId: resolveCanonicalBuildingId({ unitId: unit_id }),
        buildingInspectionId: null,
      });
    }

    res.json({
      items: progress.responses || {},
      inspectionData: progress.inspectionData || {},
      buildingId: progress.buildingId || resolveCanonicalBuildingId({
        unitId: progress.unitId,
        inspectionData: progress.inspectionData,
      }),
      buildingInspectionId: progress.buildingInspectionId || progress.inspectionData?.buildingInspectionId || null,
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
};

// @route   POST /api/inspections/generate-excel
// @desc    Generate a fancy Excel report from provided JSON data
// @access  Private
exports.generateExcelFromData = async (req, res) => {
  try {
    const { data } = req.body;
    if (!data) {
      return res.status(400).json({ success: false, message: 'Report data is required' });
    }

    const { generateFancyExcel } = require('../utils/excelGenerator');
    const buffer = await generateFancyExcel(data);

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=Inspection_Report_${data.metadata?.inspectionNo || 'Draft'}.xlsx`);
    
    return res.send(buffer);
  } catch (error) {
    console.error('Excel generation error:', error);
    return res.status(500).json({
      success: false,
      message: 'Error generating Excel report',
      error: error.message,
    });
  }
};