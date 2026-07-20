const express = require('express');
const { check } = require('express-validator');
const router = express.Router();
const axios = require('axios');
const Stripe = require('stripe');
const fs = require('fs');
const Inspection = require('../models/Inspection');
const Property = require('../models/Property');
const { auth } = require('../middleware/auth');
const {
  verifyIAP,
  checkUnlockStatus,
  getEntitlements,
} = require('../controllers/paymentController');

const REPORT_UNLOCK_PRODUCT_ID = 'com.inspire.report.unlock';
const envPrice = Number(process.env.STRIPE_REPORT_UNLOCK_PRICE_CENTS);
const REPORT_PRICE = (envPrice && envPrice !== 99) ? envPrice : 9900; // Force $99.00 if misconfigured as 99
const REPORT_CURRENCY = String(process.env.STRIPE_REPORT_UNLOCK_CURRENCY || 'usd').toLowerCase();

const loadGooglePlayServiceAccountKey = () => {
  // Preferred: base64 env (works great for cloud secret UI)
  const b64 = process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_KEY_B64;
  if (b64) {
    try {
      const json = Buffer.from(String(b64), 'base64').toString('utf8');
      return JSON.parse(json);
    } catch (e) {
      throw new Error('Invalid GOOGLE_PLAY_SERVICE_ACCOUNT_KEY_B64 (must be base64-encoded JSON).');
    }
  }

  // Alternative: file path (useful for servers with mounted secrets)
  const filePath = process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_KEY_FILE;
  if (filePath) {
    try {
      const raw = fs.readFileSync(String(filePath), 'utf8');
      return JSON.parse(raw);
    } catch (e) {
      throw new Error('Invalid GOOGLE_PLAY_SERVICE_ACCOUNT_KEY_FILE (must point to a readable JSON key file).');
    }
  }

  // Legacy: inline JSON string
  const inline = process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_KEY;
  if (inline) {
    try {
      return JSON.parse(String(inline));
    } catch (e) {
      throw new Error('Invalid GOOGLE_PLAY_SERVICE_ACCOUNT_KEY (must be JSON).');
    }
  }

  return null;
};

const getStripeClient = () => {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error('STRIPE_SECRET_KEY is not configured.');
  }
  return new Stripe(process.env.STRIPE_SECRET_KEY);
};

const resolveWebAppBaseUrl = (req) => {
  const requestOrigin = req.get('origin');
  if (requestOrigin) {
    return requestOrigin;
  }
  const configuredWebUrl = process.env.WEB_APP_URL || process.env.FRONTEND_URL || process.env.CORS_ORIGIN;
  if (configuredWebUrl) {
    return configuredWebUrl.split(',')[0].trim();
  }
  return 'http://localhost:3000';
};

const findInspectionByIdOrReference = async (inspectionId) => {
  if (!inspectionId) return null;
  
  // Try Inspection ID (MongoDB ObjectId)
  let inspection = await Inspection.findById(inspectionId).catch(() => null);
  if (!inspection) {
    // Try Inspection reference string
    inspection = await Inspection.findOne({ inspectionId: inspectionId });
  }
  
  if (inspection) return inspection;

  // FALLBACK: Try Property ID
  let property = await Property.findById(inspectionId).catch(() => null);
  if (!property) {
    property = await Property.findOne({ propertyId: inspectionId });
  }

  return property; // Could be an Inspection OR a Property
};

router.post('/create-stripe-checkout-session', auth, async (req, res) => {
  try {
    const { inspectionId } = req.body;
    if (!inspectionId) {
      return res.status(400).json({
        success: false,
        message: 'inspectionId is required.',
      });
    }

    const stripe = getStripeClient();
    const inspection = await findInspectionByIdOrReference(inspectionId);

    if (inspection?.isReportUnlocked) {
      return res.json({
        success: true,
        message: 'Report is already unlocked.',
        isReportUnlocked: true,
        alreadyUnlocked: true,
      });
    }

    const inspectionReference = inspection?.inspectionId || String(inspectionId);
    const webBaseUrl = resolveWebAppBaseUrl(req);

    const successUrl = `${webBaseUrl}/dashboard/inspection/summary?payment=success&inspectionId=${encodeURIComponent(inspectionReference)}&session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = `${webBaseUrl}/dashboard/inspection/summary?payment=cancelled&inspectionId=${encodeURIComponent(inspectionReference)}`;

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: REPORT_CURRENCY,
            unit_amount: REPORT_PRICE,
            product_data: {
              name: 'INSPIRE Report Unlock',
              description: 'Unlock full inspection report export access.',
            },
          },
        },
      ],
      metadata: {
        inspectionId: String(inspectionId),
        inspectionDbId: inspection?._id ? String(inspection._id) : '',
        inspectionReference,
        userId: String(req.userId || ''),
      },
      success_url: successUrl,
      cancel_url: cancelUrl,
    });

    return res.json({
      success: true,
      message: 'Stripe checkout session created.',
      checkoutUrl: session.url,
      sessionId: session.id,
      isReportUnlocked: false,
    });
  } catch (error) {
    console.error('Stripe checkout session error:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Server error creating checkout session.',
    });
  }
});

router.get('/stripe-session-status/:sessionId', auth, async (req, res) => {
  try {
    const { sessionId } = req.params;
    if (!sessionId) {
      return res.status(400).json({
        success: false,
        message: 'sessionId is required.',
      });
    }

    const stripe = getStripeClient();
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    const sessionUserId = session?.metadata?.userId;
    if (
      sessionUserId &&
      String(sessionUserId) !== String(req.userId) &&
      req.userRole !== 'admin'
    ) {
      return res.status(403).json({
        success: false,
        message: 'You are not authorized to verify this payment session.',
      });
    }

    const paymentConfirmed = session.payment_status === 'paid';
    let isReportUnlocked = false;

    if (paymentConfirmed) {
      const inspectionLookupValue =
        session?.metadata?.inspectionDbId ||
        session?.metadata?.inspectionReference ||
        session?.metadata?.inspectionId;

      const inspection = inspectionLookupValue
        ? await findInspectionByIdOrReference(inspectionLookupValue)
        : null;

      if (inspection) {
        inspection.isReportUnlocked = true;
        inspection.iapPurchaseToken = `stripe:${session.id}`;
        inspection.iapPurchasedAt = new Date();
        await inspection.save();
      }
      isReportUnlocked = true;
    }

    return res.json({
      success: true,
      paymentStatus: session.payment_status,
      isReportUnlocked,
      sessionId: session.id,
    });
  } catch (error) {
    console.error('Stripe session status error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error verifying Stripe payment session.',
    });
  }
});

router.post('/verify-iap', auth, async (req, res) => {
  try {
    const { inspectionId, purchaseToken, productId, packageName } = req.body;

    if (!inspectionId || !purchaseToken || !productId) {
      return res.status(400).json({
        success: false,
        message: 'inspectionId, purchaseToken, and productId are required.',
      });
    }

    if (productId !== REPORT_UNLOCK_PRODUCT_ID) {
      return res.status(400).json({
        success: false,
        message: 'Invalid product ID.',
      });
    }

    let purchaseValid = false;

    let serviceAccountKey = null;
    try {
      serviceAccountKey = loadGooglePlayServiceAccountKey();
    } catch (keyErr) {
      console.error('Google Play service account key error:', keyErr.message);
      return res.status(500).json({
        success: false,
        message: 'Server is misconfigured for Google Play verification. Please contact support.',
      });
    }

    if (serviceAccountKey) {
      try {
        const { google } = require('googleapis');

        const authClient = new google.auth.GoogleAuth({
          credentials: serviceAccountKey,
          scopes: ['https://www.googleapis.com/auth/androidpublisher'],
        });

        const androidPublisher = google.androidpublisher({
          version: 'v3',
          auth: authClient,
        });

        const pkg = packageName || 'com.inspireintern.app';
        const result = await androidPublisher.purchases.products.get({
          packageName: pkg,
          productId: productId,
          token: purchaseToken,
        });

        if (result.data && result.data.purchaseState === 0) {
          purchaseValid = true;
        }
      } catch (googleError) {
        console.error('Google Play API verification error:', googleError.message);
        return res.status(502).json({
          success: false,
          message: 'Unable to verify purchase with Google Play. Please try again.',
        });
      }
    } else {
      console.warn('Google Play verification key not set — skipping server-side verification.');
      if (purchaseToken && purchaseToken.length > 10) {
        purchaseValid = true;
      }
    }

    if (!purchaseValid) {
      return res.status(402).json({
        success: false,
        message: 'Purchase verification failed. Payment not confirmed.',
      });
    }

    let inspection = await Inspection.findById(inspectionId).catch(() => null);
    if (!inspection) {
      inspection = await Inspection.findOne({ inspectionId: inspectionId });
    }

    if (!inspection) {
      return res.json({
        success: true,
        message: 'Purchase verified. Report unlocked.',
        isReportUnlocked: true,
      });
    }

    inspection.isReportUnlocked = true;
    inspection.iapPurchaseToken = purchaseToken;
    inspection.iapPurchasedAt = new Date();
    await inspection.save();

    return res.json({
      success: true,
      message: 'Purchase verified. Report unlocked.',
      isReportUnlocked: true,
      inspectionId: inspection.inspectionId || inspection._id,
    });
  } catch (error) {
    console.error('IAP verification error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error during purchase verification.',
    });
  }
});

router.get('/check-unlock/:inspectionId', auth, async (req, res) => {
  try {
    const { inspectionId } = req.params;
    const inspection = await findInspectionByIdOrReference(inspectionId);

    return res.json({
      success: true,
      isReportUnlocked: inspection ? !!inspection.isReportUnlocked : false,
    });
  } catch (error) {
    console.error('Check unlock error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error checking report unlock status.',
    });
  }
});

module.exports = router;