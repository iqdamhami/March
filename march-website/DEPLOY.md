# نشر منصة MARCH على سيرفر عام (PHP + MySQL + SMTP)

هذا المسار مناسب للاستضافة المشتركة وcPanel ومعظم السيرفرات التي تدعم PHP وMySQL، بنفس أسلوب حزمة WEFE.

## ما الذي يتحقق بعد النشر؟

- أي مشترك من أي مكان يسجّل أو يرسل استفساراً → يُحفظ في **قاعدة بيانات السيرفر**
- المسؤول يرد من لوحة الإدارة → يظهر الرد في حساب المشترك + **إيميل** (إن وُجد SMTP)
- عند الموافقة على حساب → إشعار بريد للمستخدم
- إن تعذّر الوصول للـ API تعمل الواجهة بوضع محلي تجريبي فقط

---

## 1) إنشاء قاعدة MySQL

```sql
CREATE DATABASE march_eoi CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'march_user'@'localhost' IDENTIFIED BY 'STRONG_PASSWORD';
GRANT ALL PRIVILEGES ON march_eoi.* TO 'march_user'@'localhost';
FLUSH PRIVILEGES;
```

استيراد الجداول:

```bash
mysql -u march_user -p march_eoi < database/mysql-schema.sql
```

(من لوحة cPanel: Import لملف `database/mysql-schema.sql`)

---

## 2) إعداد الـ API

```bash
cp api/config.example.php api/config.php
```

عدّل في `api/config.php`:

- بيانات MySQL
- `base_url` مثل `https://your-domain.com`
- SMTP (مضيف، منفذ، مستخدم، كلمة مرور، from_email)
- `admin_email` / `admin_password` / `setup_key`

**لا ترفع `config.php` إلى مستودع عام.**

---

## 3) رفع الملفات

ارفع محتويات `march-website` إلى جذر الموقع أو مجلد فرعي (مثل `/public_html` أو `/march`).

تأكد أن:

- PHP 8+ مع امتداد PDO MySQL
- `mod_rewrite` مفعّل (لـ `api/.htaccess`) أو استخدم:
  `https://your-domain.com/api/index.php?r=health`

---

## 4) إنشاء حساب المسؤول

مرة واحدة فقط:

```
https://your-domain.com/api/seed.php?key=YOUR_SETUP_KEY
```

أو من الطرفية:

```bash
php api/seed.php YOUR_SETUP_KEY
```

ثم **احذف** `api/seed.php` من السيرفر.

بيانات الدخول الافتراضية (ما لم تغيّرها في config):

- البريد: `admin@march.local`
- كلمة المرور: `Admin@MARCH2026`

---

## 5) اختبار

1. `https://your-domain.com/api/index.php?r=health` → `"success": true`
2. افتح الموقع → إنشاء حساب باحث
3. دخول الأدمن → موافقة الحساب (يصل إيميل إن SMTP مضبوط)
4. استفسار من «اتصل بنا» → رد من الإدارة → يظهر في لوحة المستخدم ويُرسل بالبريد

---

## 6) توجيه الواجهة (اختياري)

الواجهة تجرب تلقائياً:

1. `window.MARCH_API_BASE` إن وُجد  
2. `/api/index.php?r=...` على نفس النطاق  
3. `http://localhost:4000/api`  
4. localStorage

لتثبيت عنوان API يدوياً في الصفحات:

```html
<script>
  window.MARCH_API_BASE = 'https://your-domain.com/api/index.php?r=';
</script>
```

ملاحظة: عند استخدام الشكل `?r=` يجب أن تكون القيمة تنتهي بحيث يُلحق المسار بعد `r=` — التطبيق الحالي يبني `.../api/index.php?r=auth/login` تلقائياً عبر المرشحين في `auth.js`.

---

## 7) بديل Node (VPS)

ما زال متاحاً:

```bash
cd backend
node server-local.js
```

مع ضبط `MARCH_API_BASE` إلى `http://SERVER_IP:4000/api`

---

## أمان سريع

- [ ] HTTPS
- [ ] كلمة مرور DB وSMTP قوية
- [ ] تغيير كلمة الأدمن بعد أول دخول
- [ ] حذف `seed.php`
- [ ] `config.php` غير قابل للتنزيل العام
- [ ] `debug => false` في الإنتاج
