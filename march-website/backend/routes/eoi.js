/**
 * EOI Applications Routes
 * POST   /api/eoi          - إنشاء / تقديم طلب
 * GET    /api/eoi/my       - طلباتي
 * GET    /api/eoi/:id      - تفاصيل طلب
 * PATCH  /api/eoi/:id      - تحديث مسودة
 */
const express = require('express');
const { body, validationResult } = require('express-validator');
const { v4: uuidv4 } = require('uuid');
const db = require('../config/db');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

const eoiRules = [
  body('project_title')
    .trim()
    .isLength({ min: 10, max: 500 }).withMessage('عنوان المشروع يجب أن يكون بين 10 و 500 حرف'),
  body('summary')
    .trim()
    .isLength({ min: 200, max: 3000 }).withMessage('الملخص يجب أن يكون بين 200 و 3000 حرف تقريباً'),
  body('axis_code')
    .isIn(['axis1', 'axis2']).withMessage('يجب اختيار محور صالح (axis1 أو axis2)'),
  body('estimated_budget')
    .optional({ checkFalsy: true })
    .isFloat({ min: 1000, max: 100000 }).withMessage('الميزانية يجب أن تكون بين 1,000 و 100,000 دولار'),
  body('institution_name')
    .trim()
    .isLength({ min: 3, max: 300 }).withMessage('اسم المؤسسة مطلوب'),
  body('country')
    .trim()
    .isLength({ min: 2, max: 100 }).withMessage('الدولة مطلوبة'),
];

function handleValidation(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: 'يوجد أخطاء في المدخلات',
      code: 'VALIDATION_ERROR',
      details: errors.array().map((e) => ({ field: e.path, message: e.msg })),
    });
  }
  return null;
}

// توليد رقم مرجعي فريد
async function generateReference() {
  const year = new Date().getFullYear();
  const countResult = await db.query(
    `SELECT COUNT(*)::int AS cnt FROM eoi_applications WHERE reference_number LIKE $1`,
    [`MARCH-EOI-${year}-%`]
  );
  const seq = String((countResult.rows[0].cnt || 0) + 1).padStart(4, '0');
  return `MARCH-EOI-${year}-${seq}`;
}

// ---------- CREATE / SUBMIT ----------
router.post('/', authenticate, eoiRules, async (req, res) => {
  if (handleValidation(req, res)) return;

  const {
    project_title,
    summary,
    axis_code,
    estimated_budget,
    institution_name,
    country,
    city,
    climate_relevance,
    target_countries,
    submit = false, // true = تقديم نهائي، false = مسودة
  } = req.body;

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');

    // إيجاد أو إنشاء المؤسسة
    let instResult = await client.query(
      `SELECT id FROM institutions WHERE name_ar = $1 AND country = $2 LIMIT 1`,
      [institution_name, country]
    );
    let institutionId;
    if (instResult.rows.length === 0) {
      const newInst = await client.query(
        `INSERT INTO institutions (name_ar, country, city, type)
         VALUES ($1, $2, $3, 'university') RETURNING id`,
        [institution_name, country, city || null]
      );
      institutionId = newInst.rows[0].id;
    } else {
      institutionId = instResult.rows[0].id;
    }

    // ربط المستخدم بالمؤسسة
    await client.query(
      `INSERT INTO user_institutions (user_id, institution_id, is_primary)
       VALUES ($1, $2, TRUE)
       ON CONFLICT (user_id, institution_id) DO NOTHING`,
      [req.user.id, institutionId]
    );

    // المحور
    const axisResult = await client.query(
      `SELECT id FROM research_axes WHERE code = $1`,
      [axis_code]
    );
    if (axisResult.rows.length === 0) {
      throw new Error('Invalid axis');
    }
    const axisId = axisResult.rows[0].id;

    const ref = await generateReference();
    const status = submit ? 'submitted' : 'draft';
    const submittedAt = submit ? new Date() : null;

    const eoiResult = await client.query(
      `INSERT INTO eoi_applications (
         reference_number, user_id, institution_id, axis_id,
         project_title, summary, estimated_budget, status, submitted_at,
         climate_relevance, target_countries
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       RETURNING id, reference_number, status, created_at`,
      [
        ref,
        req.user.id,
        institutionId,
        axisId,
        project_title,
        summary,
        estimated_budget || null,
        status,
        submittedAt,
        climate_relevance || null,
        target_countries || null,
      ]
    );

    await client.query(
      `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, ip_address)
       VALUES ($1, $2, 'eoi_application', $3, $4)`,
      [req.user.id, submit ? 'EOI_SUBMIT' : 'EOI_DRAFT', eoiResult.rows[0].id, req.ip]
    );

    await client.query('COMMIT');

    res.status(201).json({
      success: true,
      message: submit
        ? 'تم تقديم طلب إبداء الاهتمام بنجاح'
        : 'تم حفظ المسودة بنجاح',
      data: eoiResult.rows[0],
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('EOI create error:', err);
    res.status(500).json({
      success: false,
      error: 'حدث خطأ أثناء حفظ الطلب',
      code: 'SERVER_ERROR',
    });
  } finally {
    client.release();
  }
});

// ---------- MY APPLICATIONS ----------
router.get('/my', authenticate, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT e.id, e.reference_number, e.project_title, e.status,
              e.estimated_budget, e.submitted_at, e.created_at,
              a.code AS axis_code, a.title_ar AS axis_title,
              i.name_ar AS institution_name
       FROM eoi_applications e
       JOIN research_axes a ON e.axis_id = a.id
       JOIN institutions i ON e.institution_id = i.id
       WHERE e.user_id = $1
       ORDER BY e.created_at DESC`,
      [req.user.id]
    );

    res.json({
      success: true,
      data: { applications: result.rows },
    });
  } catch (err) {
    console.error('My EOI error:', err);
    res.status(500).json({
      success: false,
      error: 'حدث خطأ في جلب الطلبات',
      code: 'SERVER_ERROR',
    });
  }
});

// ---------- GET ONE ----------
router.get('/:id', authenticate, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT e.*, a.code AS axis_code, a.title_ar AS axis_title,
              i.name_ar AS institution_name, i.country
       FROM eoi_applications e
       JOIN research_axes a ON e.axis_id = a.id
       JOIN institutions i ON e.institution_id = i.id
       WHERE e.id = $1 AND e.user_id = $2`,
      [req.params.id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'الطلب غير موجود أو ليس لديك صلاحية عليه',
        code: 'NOT_FOUND',
      });
    }

    res.json({ success: true, data: { application: result.rows[0] } });
  } catch (err) {
    console.error('Get EOI error:', err);
    res.status(500).json({
      success: false,
      error: 'حدث خطأ',
      code: 'SERVER_ERROR',
    });
  }
});

module.exports = router;
