/**
 * Contact inquiries — إرسال استفسار + عرض ردود الإدارة للمستفسر
 */
const express = require('express');
const { body, validationResult } = require('express-validator');
const db = require('../config/db');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

router.post(
  '/',
  [
    body('name').trim().isLength({ min: 2, max: 200 }).withMessage('الاسم مطلوب'),
    body('email').isEmail().withMessage('بريد غير صالح').normalizeEmail(),
    body('subject').trim().isLength({ min: 2, max: 100 }).withMessage('الموضوع مطلوب'),
    body('message').trim().isLength({ min: 5, max: 5000 }).withMessage('نص الاستفسار مطلوب'),
    body('institution').optional({ checkFalsy: true }).trim().isLength({ max: 300 }),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'يوجد أخطاء في المدخلات',
        code: 'VALIDATION_ERROR',
        details: errors.array().map((e) => ({ field: e.path, message: e.msg })),
      });
    }

    const { name, email, subject, message, institution } = req.body;
    try {
      // ربط بالمستخدم إن وُجد نفس البريد
      const u = await db.query('SELECT id FROM users WHERE email = $1', [email]);
      const userId = u.rows[0]?.id || null;

      const result = await db.query(
        `INSERT INTO contact_inquiries (name, email, institution, subject, message, user_id, status)
         VALUES ($1, $2, $3, $4, $5, $6, 'new')
         RETURNING id, created_at`,
        [name, email, institution || null, subject, message, userId]
      );

      res.status(201).json({
        success: true,
        message: 'تم إرسال استفسارك. ستظهر أي ردود من الإدارة في حسابك عند استخدام نفس البريد.',
        data: result.rows[0],
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ success: false, error: 'تعذر إرسال الاستفسار', code: 'SERVER_ERROR' });
    }
  }
);

// استفسارات وردود المستخدم المسجّل (بنفس البريد)
router.get('/my', authenticate, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT id, subject, message, status, admin_reply, replied_at, created_at
       FROM contact_inquiries
       WHERE email = $1 OR user_id = $2
       ORDER BY created_at DESC`,
      [req.user.email, req.user.id]
    );
    res.json({ success: true, data: { inquiries: result.rows } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'خطأ في جلب الرسائل', code: 'SERVER_ERROR' });
  }
});

module.exports = router;
