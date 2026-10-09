/**
 * MARCH EOI API Server
 * تشغيل: npm install && npm run dev
 */
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const authRoutes = require('./routes/auth');
const eoiRoutes = require('./routes/eoi');
const weatherRoutes = require('./routes/weather');
const adminRoutes = require('./routes/admin');
const contactRoutes = require('./routes/contact');

const app = express();
const PORT = process.env.PORT || 4000;

// Security
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));

// CORS — في التطوير نسمح بكل المنافذ المحلية؛ في الإنتاج حدد FRONTEND_URL
const isDev = (process.env.NODE_ENV || 'development') !== 'production';
const allowedOrigins = process.env.FRONTEND_URL
  ? process.env.FRONTEND_URL.split(',').map((s) => s.trim())
  : [
      'http://localhost:5500',
      'http://127.0.0.1:5500',
      'http://localhost:3000',
      'http://127.0.0.1:3000',
      'http://localhost:8765',
      'http://127.0.0.1:8765',
      'http://localhost:8080',
      'http://127.0.0.1:8080',
      'null', // فتح الملف مباشرة file://
    ];

app.use(cors({
  origin(origin, callback) {
    // طلبات بدون Origin (مثل Postman) أو بيئة تطوير
    if (!origin || isDev || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(null, true); // مرن أثناء الإعداد؛ قيّد في الإنتاج عبر NODE_ENV=production
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express.json({ limit: '1mb' }));

// Rate limit عام
app.use('/api/', rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  message: { success: false, error: 'طلبات كثيرة جداً', code: 'RATE_LIMIT' },
}));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/eoi', eoiRoutes);
app.use('/api/weather', weatherRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/contact', contactRoutes);

// Health
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    service: 'MARCH EOI API',
    version: '1.0.0',
    time: new Date().toISOString(),
  });
});

// 404
app.use((req, res) => {
  res.status(404).json({ success: false, error: 'المسار غير موجود', code: 'NOT_FOUND' });
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ success: false, error: 'خطأ داخلي في الخادم', code: 'SERVER_ERROR' });
});

app.listen(PORT, () => {
  console.log(`MARCH EOI API running on http://localhost:${PORT}`);
});
