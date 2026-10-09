/**
 * Auth Routes - تسجيل وإنشاء حساب آمن
 * POST /api/auth/register
 * POST /api/auth/login
 * GET  /api/auth/me
 */
const express = require('express');
const bcrypt = require('bcryptjs');
const { body, validationResult } = require('express-validator');
const rateLimit = require('express-rate-limit');
const db = require('../config/db');
const { authenticate, signToken } = require('../middleware/auth');

const router = express.Router();

// Rate limiting لحماية من الهجمات
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 دقيقة
  max: 10,
  message: {
    success: false,
    error: 'تجاوزت الحد المسموح من المحاولات. حاول لاحقاً',
    code: 'RATE_LIMIT',
  },
});

// ---------- Validation Rules ----------
const registerRules = [
  body('email')
    .isEmail().withMessage('البريد الإلكتروني غير صالح')
    .normalizeEmail()
    .isLength({ max: 255 }).withMessage('البريد طويل جداً'),
  body('password')
    .isLength({ min: 8 }).withMessage('كلمة المرور يجب أن تكون 8 أحرف على الأقل')
    .matches(/[A-Z]/).withMessage('كلمة المرور يجب أن تحتوي على حرف كبير واحد على الأقل')
    .matches(/[a-z]/).withMessage('كلمة المرور يجب أن تحتوي على حرف صغير واحد على الأقل')
    .matches(/[0-9]/).withMessage('كلمة المرور يجب أن تحتوي على رقم واحد على الأقل'),
  body('full_name')
    .trim()
    .isLength({ min: 3, max: 200 }).withMessage('الاسم يجب أن يكون بين 3 و 200 حرف')
    .matches(/^[\u0600-\u06FFa-zA-Z\s.'-]+$/).withMessage('الاسم يحتوي على أحرف غير مسموحة'),
  body('phone')
    .optional({ checkFalsy: true })
    .matches(/^\+?[0-9\s-]{8,20}$/).withMessage('رقم الهاتف غير صالح'),
];

const loginRules = [
  body('email').isEmail().withMessage('البريد الإلكتروني غير صالح').normalizeEmail(),
  body('password').notEmpty().withMessage('كلمة المرور مطلوبة'),
];

function handleValidation(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: 'يوجد أخطاء في المدخلات',
      code: 'VALIDATION_ERROR',
      details: errors.array().map((e) => ({
        field: e.path,
        message: e.msg,
      })),
    });
  }
  return null;
}

// ---------- REGISTER ----------
router.post('/register', authLimiter, registerRules, async (req, res) => {
  const validationError = handleValidation(req, res);
  if (validationError) return;

  const { email, password, full_name, phone } = req.body;

  try {
    // تحقق من عدم وجود البريد مسبقاً
    const existing = await db.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rows.length > 0) {
      return res.status(409).json({
        success: false,
        error: 'هذا البريد الإلكتروني مسجّل مسبقاً',
        code: 'EMAIL_EXISTS',
      });
    }

    const salt = await bcrypt.genSalt(12);
    const password_hash = await bcrypt.hash(password, salt);

    const result = await db.query(
      `INSERT INTO users (email, password_hash, full_name, phone, role, approval_status, is_active)
       VALUES ($1, $2, $3, $4, 'researcher', 'pending', FALSE)
       RETURNING id, email, full_name, role, approval_status, created_at`,
      [email, password_hash, full_name, phone || null]
    );

    const user = result.rows[0];

    await db.query(
      `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, ip_address)
       VALUES ($1, 'REGISTER', 'user', $1, $2)`,
      [user.id, req.ip]
    );

    // لا يُمنح توكن حتى موافقة المسؤول
    res.status(201).json({
      success: true,
      message: 'تم إرسال طلب إنشاء الحساب. بانتظار موافقة إدارة المنصة قبل تسجيل الدخول.',
      data: {
        user: {
          id: user.id,
          email: user.email,
          full_name: user.full_name,
          role: user.role,
          approval_status: user.approval_status,
        },
        pending_approval: true,
        token: null,
      },
    });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({
      success: false,
      error: 'حدث خطأ أثناء إنشاء الحساب. حاول لاحقاً',
      code: 'SERVER_ERROR',
    });
  }
});

// ---------- LOGIN ----------
router.post('/login', authLimiter, loginRules, async (req, res) => {
  const validationError = handleValidation(req, res);
  if (validationError) return;

  const { email, password } = req.body;

  try {
    const result = await db.query(
      'SELECT id, email, password_hash, full_name, role, is_active, approval_status FROM users WHERE email = $1',
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        success: false,
        error: 'البريد الإلكتروني أو كلمة المرور غير صحيحة',
        code: 'INVALID_CREDENTIALS',
      });
    }

    const user = result.rows[0];

    if (user.approval_status === 'pending') {
      return res.status(403).json({
        success: false,
        error: 'حسابك بانتظار موافقة الإدارة. لن تتمكن من الدخول حتى تتم الموافقة.',
        code: 'PENDING_APPROVAL',
      });
    }

    if (user.approval_status === 'rejected') {
      return res.status(403).json({
        success: false,
        error: 'تم رفض طلب إنشاء هذا الحساب. تواصل مع الإدارة للاستفسار.',
        code: 'ACCOUNT_REJECTED',
      });
    }

    if (!user.is_active) {
      return res.status(403).json({
        success: false,
        error: 'هذا الحساب معطّل. تواصل مع الإدارة',
        code: 'ACCOUNT_DISABLED',
      });
    }

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      return res.status(401).json({
        success: false,
        error: 'البريد الإلكتروني أو كلمة المرور غير صحيحة',
        code: 'INVALID_CREDENTIALS',
      });
    }

    // تحديث آخر تسجيل دخول
    await db.query('UPDATE users SET last_login_at = NOW() WHERE id = $1', [user.id]);

    const token = signToken({ id: user.id, email: user.email, role: user.role });

    await db.query(
      `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, ip_address)
       VALUES ($1, 'LOGIN', 'user', $1, $2)`,
      [user.id, req.ip]
    );

    res.json({
      success: true,
      message: 'تم تسجيل الدخول بنجاح',
      data: {
        user: {
          id: user.id,
          email: user.email,
          full_name: user.full_name,
          role: user.role,
        },
        token,
      },
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({
      success: false,
      error: 'حدث خطأ أثناء تسجيل الدخول',
      code: 'SERVER_ERROR',
    });
  }
});

// ---------- ME (الملف الشخصي) ----------
router.get('/me', authenticate, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT id, email, full_name, phone, role, email_verified, last_login_at, created_at
       FROM users WHERE id = $1`,
      [req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'المستخدم غير موجود',
        code: 'NOT_FOUND',
      });
    }

    res.json({
      success: true,
      data: { user: result.rows[0] },
    });
  } catch (err) {
    console.error('Me error:', err);
    res.status(500).json({
      success: false,
      error: 'حدث خطأ في جلب البيانات',
      code: 'SERVER_ERROR',
    });
  }
});

module.exports = router;
