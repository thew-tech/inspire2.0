require('dotenv').config();
const express = require('express');
const cors = require('cors');
const connectDB = require('./config/database');
const errorHandler = require('./middleware/errorHandler');

// Import routes
const authRoutes = require('./routes/auth');
const propertyRoutes = require('./routes/properties');
const inspectionRoutes = require('./routes/inspections');
const orderRoutes = require('./routes/orders');
const assetRoutes = require('./routes/assets');
const userRoutes = require('./routes/users');
const adminRoutes = require('./routes/admin');
const aiRoutes = require('./routes/aiRoutes');
const captchaRoutes = require('./routes/captcha');
const notificationRoutes = require('./routes/notifications');
const deficiencyRoutes = require('./routes/deficiencies');
const paymentRoutes = require('./routes/payments');


// Initialize Express app
const app = express();

// Connect to MongoDB
connectDB();

// Middleware - Increase limit for base64 image uploads
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use('/uploads', express.static('uploads'));
app.use('/reports', express.static('reports'));


// CORS Configuration
const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost:5173',
  'https://nspire-five.vercel.app',
  'https://admininspire.vercel.app',
  'https://inspirebackend-eight.vercel.app',
  'https://inspireinspectionapp.com',
  process.env.CORS_ORIGIN
].filter(Boolean);

app.use(
  cors({
    origin: function (origin, callback) {
      // Allow requests with no origin (like mobile apps or curl requests)
      if (!origin) return callback(null, true);

      if (allowedOrigins.indexOf(origin) !== -1 || process.env.NODE_ENV === 'development') {
        callback(null, true);
      } else {
        callback(null, true); // Allow all origins for now
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  })
);

// Handle preflight requests
app.options('*', cors());

// Root route
app.get('/', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'INSPIRE Backend API',
    version: '1.0.0',
    endpoints: {
      health: '/api/health',
      auth: {
        signup: 'POST /api/auth/signup',
        login: 'POST /api/auth/login',
        me: 'GET /api/auth/me',
        logout: 'POST /api/auth/logout',
        verifyToken: 'POST /api/auth/verify-token',
      },
      properties: {
        create: 'POST /api/properties',
        createBulk: 'POST /api/properties/bulk',
        dropdownData: 'GET /api/properties/dropdown-data',
        list: 'GET /api/properties',
        get: 'GET /api/properties/:id',
        update: 'PUT /api/properties/:id',
        delete: 'DELETE /api/properties/:id',
        stats: 'GET /api/properties/stats',
      },
      inspections: {
        create: 'POST /api/inspections',
        list: 'GET /api/inspections',
        get: 'GET /api/inspections/:id',
        update: 'PUT /api/inspections/:id',
        complete: 'PATCH /api/inspections/:id/complete',
        delete: 'DELETE /api/inspections/:id',
        stats: 'GET /api/inspections/stats',
        request: 'POST /api/inspections/request',
        requests: 'GET /api/inspections/requests',
      },
      orders: {
        create: 'POST /api/orders',
        list: 'GET /api/orders',
        get: 'GET /api/orders/:id',
        update: 'PUT /api/orders/:id',
        delete: 'DELETE /api/orders/:id',
        stats: 'GET /api/orders/stats',
      },
      payments: {
        verify: 'POST /api/payments/verify-iap',
        checkUnlock: 'GET /api/payments/check-unlock/:inspectionId',
        entitlements: 'GET /api/payments/entitlements',
      },
      assets: {
        create: 'POST /api/assets',
        list: 'GET /api/assets',
        get: 'GET /api/assets/:id',
        update: 'PUT /api/assets/:id',
        delete: 'DELETE /api/assets/:id',
        maintenance: 'POST /api/assets/:id/maintenance',
        stats: 'GET /api/assets/stats',
      },
      users: {
        profile: 'PUT /api/users/profile',
        password: 'PUT /api/users/password',
        notifications: 'PUT /api/users/notifications',
        twoFactor: 'POST /api/users/2fa/toggle',
        list: 'GET /api/users',
      },
      admin: {
        dashboardStats: 'GET /api/admin/dashboard/stats',
        properties: 'GET /api/admin/properties',
        createProperty: 'POST /api/admin/properties',
        updateProperty: 'PUT /api/admin/properties/:id',
        deleteProperty: 'DELETE /api/admin/properties/:id',
        inspections: 'GET /api/admin/inspections',
        getInspection: 'GET /api/admin/inspections/:id',
        debugInspection: 'GET /api/admin/inspections/:id/debug',
        inspectors: 'GET /api/admin/inspectors',
        updateUserStatus: 'PUT /api/admin/users/:id/status',
        deleteUser: 'DELETE /api/admin/users/:id',
        systemStats: 'GET /api/admin/system/stats',
      },
    },
    timestamp: new Date().toISOString(),
  });
});

// Health check route
app.get('/api/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'INSPIRE Backend is running',
    timestamp: new Date().toISOString(),
  });
});

// One-time admin seed endpoint — requires SETUP_SECRET header
app.post('/api/setup-admin', async (req, res) => {
  const secret = req.headers['x-setup-secret'];
  if (!secret || secret !== process.env.SETUP_SECRET) {
    return res.status(403).json({ success: false, message: 'Forbidden' });
  }
  try {
    const User = require('./models/User');
    const email = process.env.ADMIN_EMAIL || 'admin@inspire.com';
    const password = process.env.ADMIN_PASSWORD || 'admin@123';
    const fullName = process.env.ADMIN_FULL_NAME || 'Admin';
    let admin = await User.findOne({ email }).select('+password');
    if (admin) {
      // Set plain password — pre('save') hook will hash it
      admin.password = password;
      admin.isEmailVerified = true;
      admin.isActive = true;
      admin.role = 'admin';
      await admin.save();
      return res.json({ success: true, message: 'Admin user updated', email });
    }
    // Create with plain password — pre('save') hook will hash it
    await User.create({
      fullName,
      email,
      password,
      role: 'admin',
      isEmailVerified: true,
      isActive: true,
      phone: '',
      language: 'English',
      timezone: 'America/New_York',
    });
    return res.json({ success: true, message: 'Admin user created', email });
  } catch (err) {
    console.error('setup-admin error:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
});

// Code of Reference viewer — used as clickable links in PDF reports
app.get('/api/code-ref', (req, res) => {
  const { code, ref } = req.query;
  const nspireCode = code ? String(code) : 'Reference';
  const refText = ref ? String(ref) : '';
  const escapedCode = nspireCode.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const escapedRef = refText.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapedCode} – NSPIRE Code of Reference</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; max-width: 860px; margin: 40px auto; padding: 20px 32px; line-height: 1.7; color: #1F2937; background: #F9FAFB; }
    h1 { color: #0E7490; font-size: 22pt; border-bottom: 3px solid #0E7490; padding-bottom: 10px; margin-bottom: 24px; }
    pre { white-space: pre-wrap; font-family: inherit; font-size: 11pt; background: #fff; padding: 24px; border: 1px solid #E5E7EB; border-radius: 8px; }
  </style>
</head>
<body>
  <h1>${escapedCode}</h1>
  <pre>${escapedRef}</pre>
</body>
</html>`;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(html);
});

// OAuth callback fallback — handles popup redirect when it lands on backend domain
app.get('/oauth-callback', (req, res) => {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>OAuth Callback</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; background: #E8F4F8; }
    .container { text-align: center; max-width: 400px; padding: 20px; }
    .spinner { width: 48px; height: 48px; border: 4px solid #006795; border-top-color: transparent; border-radius: 50%; animation: spin 1s linear infinite; margin: 0 auto 20px; }
    @keyframes spin { to { transform: rotate(360deg); } }
    .error { color: #dc2626; }
  </style>
</head>
<body>
  <div class="container">
    <div id="spinner" class="spinner"></div>
    <p id="message" style="color:#374151;font-weight:600;">Completing authentication...</p>
    <p id="submessage" style="color:#6b7280;font-size:0.875rem;margin-top:0.5rem;">This window will close automatically.</p>
  </div>
  <script>
    (async function() {
      try {
        const hash = new URLSearchParams(window.location.hash.substring(1));
        const search = new URLSearchParams(window.location.search);
        const state = search.get('state') || hash.get('state') || '';
        const accessToken = hash.get('access_token');
        const code = search.get('code');
        const [provider, portal] = state.split('_');

        if (!state) throw new Error('Invalid state parameter');

        let email = '';
        let fullName = '';

        if (provider === 'google' && accessToken) {
          const res = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
            headers: { Authorization: 'Bearer ' + accessToken }
          });
          const data = await res.json();
          email = data.email || '';
          fullName = data.name || (email.includes('@') ? email.split('@')[0] : email);
        } else if (provider === 'apple' && code) {
          window.opener?.postMessage({ type: 'oauth-success', provider: 'apple', code, portal }, '*');
          window.close();
          return;
        } else if (provider === 'facebook') {
          throw new Error('Facebook login must complete on the frontend. Please close this window and try again.');
        }

        if (!email) throw new Error('Could not retrieve email from provider');

        window.opener?.postMessage({
          type: 'oauth-success',
          provider,
          email,
          fullName: fullName || (email.includes('@') ? email.split('@')[0] : email),
          portal
        }, '*');

        window.close();
      } catch (err) {
        document.getElementById('spinner').style.display = 'none';
        document.getElementById('message').textContent = 'Authentication Error';
        document.getElementById('message').className = 'error font-semibold';
        document.getElementById('submessage').textContent = err.message || 'Failed to complete authentication';
        window.opener?.postMessage({ type: 'oauth-error', error: err.message }, '*');
      }
    })();
  </script>
</body>
</html>`;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(html);
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/properties', propertyRoutes);
app.use('/api/inspections', inspectionRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/assets', assetRoutes);
app.use('/api/users', userRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/captcha', captchaRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/deficiencies', deficiencyRoutes);
app.use('/api/payments', paymentRoutes);


// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found',
    path: req.originalUrl,
  });
});

// Error handling middleware (must be last)
app.use(errorHandler);

// Start server
const PORT = process.env.PORT || 5000;
const server = app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════╗
║   INSPIRE Backend Server Started       ║
║   Port: ${PORT}                          ║
║   Environment: ${process.env.NODE_ENV || 'development'}              ║
║   Database: ${process.env.MONGODB_URI}   ║
╚════════════════════════════════════════╝
  `);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
  console.error('Unhandled Rejection:', err);
  server.close(() => process.exit(1));
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
  process.exit(1);
});

module.exports = app;
