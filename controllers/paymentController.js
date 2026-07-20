const axios = require('axios');
const crypto = require('crypto');
const { validationResult } = require('express-validator');
const IAPPurchase = require('../models/IAPPurchase');

const DEFAULT_PRODUCT_ID = process.env.IAP_REPORT_PRODUCT_ID || 'com.inspire.report.unlock';
const APPLE_VERIFY_PRODUCTION_URL = 'https://buy.itunes.apple.com/verifyReceipt';
const APPLE_VERIFY_SANDBOX_URL = 'https://sandbox.itunes.apple.com/verifyReceipt';

const normalizePlatform = (platform) => {
    const normalized = String(platform || '').toLowerCase();
    return normalized === 'ios' || normalized === 'android' ? normalized : '';
};

const buildApplePayload = (receiptData) => {
    const payload = {
        'receipt-data': receiptData,
        'exclude-old-transactions': true,
    };

    if (process.env.APPLE_SHARED_SECRET) {
        payload.password = process.env.APPLE_SHARED_SECRET;
    }

    return payload;
};

const validateAppleReceipt = async (receiptData) => {
    const payload = buildApplePayload(receiptData);

    const prodResponse = await axios.post(APPLE_VERIFY_PRODUCTION_URL, payload, {
        timeout: 15000,
        headers: { 'Content-Type': 'application/json' },
    });

    // 21007 = sandbox receipt sent to production endpoint
    if (prodResponse?.data?.status === 21007) {
        const sandboxResponse = await axios.post(APPLE_VERIFY_SANDBOX_URL, payload, {
            timeout: 15000,
            headers: { 'Content-Type': 'application/json' },
        });

        return {
            response: sandboxResponse.data,
            environment: 'Sandbox',
        };
    }

    return {
        response: prodResponse.data,
        environment: 'Production',
    };
};

const selectLatestApplePurchase = (appleResponse, productId) => {
    const receipt = appleResponse?.receipt || {};
    const latestReceiptInfo = Array.isArray(appleResponse?.latest_receipt_info)
        ? appleResponse.latest_receipt_info
        : [];
    const inApp = Array.isArray(receipt.in_app) ? receipt.in_app : [];

    const candidates = [...latestReceiptInfo, ...inApp]
        .filter((entry) => entry?.product_id === productId)
        .filter((entry) => !entry?.cancellation_date)
        .sort((a, b) => Number(b?.purchase_date_ms || 0) - Number(a?.purchase_date_ms || 0));

    return candidates[0] || null;
};

const hasUserEntitlement = async (userId, productId = DEFAULT_PRODUCT_ID) => {
    const entitlement = await IAPPurchase.findOne({
        userId,
        productId,
        status: { $in: ['verified', 'restored'] },
    })
        .sort({ createdAt: -1 })
        .lean();

    return Boolean(entitlement);
};

// @desc    Verify IAP receipt/token and unlock entitlement
// @route   POST /api/payments/verify-iap
// @access  Private
exports.verifyIAP = async (req, res) => {
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
            inspectionId,
            productId = DEFAULT_PRODUCT_ID,
            platform,
            receiptData,
            transactionId,
            originalTransactionId,
            isRestore = false,
        } = req.body || {};

        if (productId !== DEFAULT_PRODUCT_ID) {
            return res.status(400).json({
                success: false,
                message: 'Invalid product identifier.',
                isReportUnlocked: false,
            });
        }

        const normalizedPlatform = normalizePlatform(platform);
        if (!normalizedPlatform) {
            return res.status(400).json({
                success: false,
                message: 'Invalid platform. Expected ios or android.',
                isReportUnlocked: false,
            });
        }

        if (normalizedPlatform !== 'ios') {
            return res.status(400).json({
                success: false,
                message: 'This endpoint currently validates iOS receipts only.',
                isReportUnlocked: false,
            });
        }

        if (!receiptData) {
            return res.status(400).json({
                success: false,
                message: 'Missing iOS receipt data.',
                isReportUnlocked: false,
            });
        }

        const { response: appleData, environment } = await validateAppleReceipt(receiptData);

        if (appleData?.status !== 0) {
            return res.status(400).json({
                success: false,
                message: `Apple receipt validation failed with status ${appleData?.status}.`,
                isReportUnlocked: false,
            });
        }

        const purchaseEntry = selectLatestApplePurchase(appleData, productId);
        if (!purchaseEntry) {
            return res.status(400).json({
                success: false,
                message: 'No matching non-consumable purchase found in the receipt.',
                isReportUnlocked: false,
            });
        }

        const finalTransactionId = String(
            purchaseEntry.transaction_id || transactionId || ''
        ).trim();
        const finalOriginalTransactionId = String(
            purchaseEntry.original_transaction_id || originalTransactionId || finalTransactionId
        ).trim();

        if (!finalTransactionId) {
            return res.status(400).json({
                success: false,
                message: 'Receipt did not include a valid transaction id.',
                isReportUnlocked: false,
            });
        }

        const duplicateTransaction = await IAPPurchase.findOne({
            platform: normalizedPlatform,
            transactionId: finalTransactionId,
        }).lean();

        if (duplicateTransaction && String(duplicateTransaction.userId) !== String(req.userId)) {
            return res.status(409).json({
                success: false,
                message: 'This transaction is already linked to a different account.',
                isReportUnlocked: false,
            });
        }

        const purchaseDate = purchaseEntry?.purchase_date_ms
            ? new Date(Number(purchaseEntry.purchase_date_ms))
            : new Date();

        const receiptHash = crypto
            .createHash('sha256')
            .update(String(receiptData))
            .digest('hex');

        await IAPPurchase.findOneAndUpdate(
            {
                userId: req.userId,
                platform: normalizedPlatform,
                productId,
            },
            {
                userId: req.userId,
                platform: normalizedPlatform,
                productId,
                inspectionId: inspectionId ? String(inspectionId) : undefined,
                transactionId: finalTransactionId,
                originalTransactionId: finalOriginalTransactionId,
                purchaseDate,
                environment,
                status: isRestore ? 'restored' : 'verified',
                receiptHash,
                rawValidation: {
                    appleStatus: appleData.status,
                    bundleId: appleData?.receipt?.bundle_id,
                    environment,
                },
            },
            {
                upsert: true,
                new: true,
                setDefaultsOnInsert: true,
            }
        );

        return res.status(200).json({
            success: true,
            message: isRestore ? 'Purchase restored successfully.' : 'Purchase verified successfully.',
            isReportUnlocked: true,
        });
    } catch (error) {
        console.error('verifyIAP error:', error?.response?.data || error);
        return res.status(500).json({
            success: false,
            message: 'Failed to verify purchase receipt.',
            isReportUnlocked: false,
        });
    }
};

// @desc    Check report entitlement
// @route   GET /api/payments/check-unlock/:inspectionId
// @access  Private
exports.checkUnlockStatus = async (req, res) => {
    try {
        const isReportUnlocked = await hasUserEntitlement(req.userId, DEFAULT_PRODUCT_ID);

        return res.status(200).json({
            success: true,
            isReportUnlocked,
            inspectionId: req.params.inspectionId || null,
        });
    } catch (error) {
        console.error('checkUnlockStatus error:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to check report unlock status.',
            isReportUnlocked: false,
        });
    }
};

// @desc    Get current user entitlement history
// @route   GET /api/payments/entitlements
// @access  Private
exports.getEntitlements = async (req, res) => {
    try {
        const purchases = await IAPPurchase.find({ userId: req.userId })
            .sort({ createdAt: -1 })
            .select('platform productId status transactionId purchaseDate environment inspectionId createdAt')
            .lean();

        return res.status(200).json({
            success: true,
            purchases,
            isReportUnlocked: purchases.some(
                (purchase) => purchase.productId === DEFAULT_PRODUCT_ID && ['verified', 'restored'].includes(purchase.status)
            ),
        });
    } catch (error) {
        console.error('getEntitlements error:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to load purchase history.',
        });
    }
};
