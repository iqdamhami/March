/**
 * إنشاء / تحديث حساب المسؤول الافتراضي
 * التشغيل: node config/seed-admin.js
 * أو: npm run seed-admin
 *
 * القيم الافتراضية (غيّرها في .env قبل الإنتاج):
 *   ADMIN_EMAIL=admin@march.local
 *   ADMIN_PASSWORD=Admin@MARCH2026
 *   ADMIN_NAME=مدير المنصة
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const bcrypt = require('bcryptjs');
const db = require('./db');

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@march.local';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Admin@MARCH2026';
const ADMIN_NAME = process.env.ADMIN_NAME || 'مدير المنصة';

async function seedAdmin() {
  if (ADMIN_PASSWORD.length < 8) {
    console.error('خطأ: ADMIN_PASSWORD يجب أن تكون 8 أحرف على الأقل');
    process.exit(1);
  }

  try {
    const salt = await bcrypt.genSalt(12);
    const password_hash = await bcrypt.hash(ADMIN_PASSWORD, salt);

    const existing = await db.query('SELECT id, role FROM users WHERE email = $1', [ADMIN_EMAIL]);

    if (existing.rows.length > 0) {
      await db.query(
        `UPDATE users
         SET password_hash = $1,
             full_name = $2,
             role = 'admin',
             approval_status = 'approved',
             is_active = TRUE,
             email_verified = TRUE,
             updated_at = NOW()
         WHERE email = $3`,
        [password_hash, ADMIN_NAME, ADMIN_EMAIL]
      );
      console.log('✓ تم تحديث حساب المسؤول الموجود');
    } else {
      await db.query(
        `INSERT INTO users (email, password_hash, full_name, role, approval_status, is_active, email_verified)
         VALUES ($1, $2, $3, 'admin', 'approved', TRUE, TRUE)`,
        [ADMIN_EMAIL, password_hash, ADMIN_NAME]
      );
      console.log('✓ تم إنشاء حساب المسؤول بنجاح');
    }

    console.log('----------------------------------------');
    console.log('  البريد:     ' + ADMIN_EMAIL);
    console.log('  كلمة المرور: ' + ADMIN_PASSWORD);
    console.log('  الدور:       admin');
    console.log('----------------------------------------');
    console.log('⚠ غيّر كلمة المرور فوراً في بيئة الإنتاج عبر .env');
  } catch (err) {
    console.error('فشل إنشاء حساب المسؤول:', err.message);
    if (err.code === 'ECONNREFUSED') {
      console.error('تأكد من تشغيل PostgreSQL وصحة DATABASE_URL في .env');
    }
    process.exit(1);
  } finally {
    await db.pool.end();
  }
}

seedAdmin();
