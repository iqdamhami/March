/**
 * Admin API — صلاحيات المسؤول
 * جميع المسارات تتطلب JWT + role=admin
 */
const express = require('express');
const { body, validationResult } = require('express-validator');
const db = require('../config/db');
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate, requireRole('admin'));

// ---------- المستخدمون ----------
router.get('/users', async (req, res) => {
  try {
    const status = req.query.approval_status; // pending | approved | rejected | all
    let q = `SELECT id, email, full_name, phone, role, approval_status, is_active,
                    last_login_at, created_at
             FROM users WHERE role != 'admin'`;
    const params = [];
    if (status && status !== 'all') {
      params.push(status);
      q += ` AND approval_status = $1`;
    }
    q += ' ORDER BY created_at DESC';
    const result = await db.query(q, params);
    res.json({ success: true, data: { users: result.rows } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'خطأ في جلب المستخدمين', code: 'SERVER_ERROR' });
  }
});

router.patch('/users/:id/approval', async (req, res) => {
  const { status } = req.body; // approved | rejected
  if (!['approved', 'rejected'].includes(status)) {
    return res.status(400).json({
      success: false,
      error: 'الحالة يجب أن تكون approved أو rejected',
      code: 'VALIDATION_ERROR',
    });
  }
  try {
    const result = await db.query(
      `UPDATE users
       SET approval_status = $1, is_active = $2, updated_at = NOW()
       WHERE id = $3 AND role != 'admin'
       RETURNING id, email, full_name, approval_status`,
      [status, status === 'approved', req.params.id]
    );
    if (!result.rows.length) {
      return res.status(404).json({ success: false, error: 'المستخدم غير موجود', code: 'NOT_FOUND' });
    }
    await db.query(
      `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details)
       VALUES ($1, $2, 'user', $3, $4)`,
      [req.user.id, status === 'approved' ? 'USER_APPROVE' : 'USER_REJECT', req.params.id, JSON.stringify({ status })]
    );
    res.json({
      success: true,
      message: status === 'approved' ? 'تمت الموافقة على الحساب' : 'تم رفض الحساب',
      data: { user: result.rows[0] },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'خطأ في تحديث الحالة', code: 'SERVER_ERROR' });
  }
});

// ---------- طلبات EOI ----------
router.get('/eoi', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT e.id, e.reference_number, e.project_title, e.status, e.estimated_budget,
              e.summary, e.submitted_at, e.created_at, e.reviewer_notes,
              u.full_name AS applicant_name, u.email AS applicant_email,
              i.name_ar AS institution_name, i.country,
              a.code AS axis_code, a.title_ar AS axis_title
       FROM eoi_applications e
       JOIN users u ON e.user_id = u.id
       JOIN institutions i ON e.institution_id = i.id
       JOIN research_axes a ON e.axis_id = a.id
       ORDER BY e.created_at DESC`
    );
    res.json({ success: true, data: { applications: result.rows } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'خطأ في جلب الطلبات', code: 'SERVER_ERROR' });
  }
});

router.patch('/eoi/:id/status', async (req, res) => {
  const allowed = ['under_review', 'shortlisted', 'rejected', 'invited_full', 'submitted'];
  const { status, reviewer_notes } = req.body;
  if (!allowed.includes(status)) {
    return res.status(400).json({
      success: false,
      error: 'حالة غير صالحة',
      code: 'VALIDATION_ERROR',
    });
  }
  try {
    const result = await db.query(
      `UPDATE eoi_applications
       SET status = $1, reviewer_notes = COALESCE($2, reviewer_notes),
           reviewed_at = NOW(), updated_at = NOW()
       WHERE id = $3
       RETURNING id, reference_number, status`,
      [status, reviewer_notes || null, req.params.id]
    );
    if (!result.rows.length) {
      return res.status(404).json({ success: false, error: 'الطلب غير موجود', code: 'NOT_FOUND' });
    }
    await db.query(
      `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details)
       VALUES ($1, 'EOI_STATUS', 'eoi_application', $2, $3)`,
      [req.user.id, req.params.id, JSON.stringify({ status })]
    );
    res.json({ success: true, message: 'تم تحديث حالة الطلب', data: { application: result.rows[0] } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'خطأ في التحديث', code: 'SERVER_ERROR' });
  }
});

router.delete('/eoi/:id', async (req, res) => {
  try {
    const result = await db.query(
      `DELETE FROM eoi_applications WHERE id = $1 RETURNING id, reference_number`,
      [req.params.id]
    );
    if (!result.rows.length) {
      return res.status(404).json({ success: false, error: 'الطلب غير موجود', code: 'NOT_FOUND' });
    }
    await db.query(
      `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details)
       VALUES ($1, 'EOI_DELETE', 'eoi_application', $2, $3)`,
      [req.user.id, req.params.id, JSON.stringify(result.rows[0])]
    );
    res.json({ success: true, message: 'تم حذف الطلب', data: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'خطأ في الحذف', code: 'SERVER_ERROR' });
  }
});

// ---------- الاستفسارات ----------
router.get('/inquiries', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT id, name, email, institution, subject, message, status,
              admin_reply, replied_at, created_at
       FROM contact_inquiries
       ORDER BY created_at DESC`
    );
    res.json({ success: true, data: { inquiries: result.rows } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'خطأ في جلب الاستفسارات', code: 'SERVER_ERROR' });
  }
});

router.post('/inquiries/:id/reply', [
  body('reply').trim().isLength({ min: 2, max: 5000 }).withMessage('الرد مطلوب'),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: 'الرد غير صالح',
      code: 'VALIDATION_ERROR',
      details: errors.array(),
    });
  }
  try {
    const result = await db.query(
      `UPDATE contact_inquiries
       SET admin_reply = $1, replied_at = NOW(), replied_by = $2, status = 'replied'
       WHERE id = $3
       RETURNING id, email, subject, admin_reply, replied_at, status`,
      [req.body.reply, req.user.id, req.params.id]
    );
    if (!result.rows.length) {
      return res.status(404).json({ success: false, error: 'الاستفسار غير موجود', code: 'NOT_FOUND' });
    }
    res.json({
      success: true,
      message: 'تم حفظ الرد وسيظهر للمستفسر عند تسجيل الدخول بنفس البريد',
      data: { inquiry: result.rows[0] },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'خطأ في إرسال الرد', code: 'SERVER_ERROR' });
  }
});

module.exports = router;
