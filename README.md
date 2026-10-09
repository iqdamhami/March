# MARCH EOI Cycle II – موقع ويب متكامل

منصة تقديم طلبات إبداء الاهتمام (EOI) لمنصة MARCH – الدورة الثانية.

---

## هيكل الملفات وأماكن وضعها

```
march-website/
│
├── index.html                 ← الصفحة الرئيسية (ضعها في جذر الموقع)
├── css/
│   └── style.css              ← التصميم الموحد لجميع الصفحات
├── js/
│   ├── main.js                ← تفاعل عام (قائمة جوال، عدّاد، FAQ)
│   └── auth.js                ← مكتبة الاتصال بالـ API + الجلسات
│
├── pages/
│   ├── call.html              ← عن الدعوة
│   ├── axes.html              ← المحاور البحثية
│   ├── apply.html             ← كيفية التقديم + نموذج EOI
│   ├── faq.html               ← الأسئلة الشائعة
│   ├── contact.html           ← اتصل بنا
│   ├── login.html             ← تسجيل الدخول
│   ├── register.html          ← إنشاء حساب آمن
│   ├── dashboard.html         ← لوحة تحكم المستخدم (محمية)
│   └── climate.html           ← بيانات المناخ + تكامل طقس العرب
│
└── backend/                   ← خادم Node.js / Express
    ├── package.json
    ├── server.js              ← نقطة التشغيل الرئيسية
    ├── .env.example           ← انسخه إلى .env وعدّل القيم
    ├── config/
    │   ├── db.js              ← اتصال PostgreSQL
    │   └── schema.sql         ← جداول قاعدة البيانات والعلاقات
    ├── middleware/
    │   └── auth.js            ← JWT + حماية المسارات
    └── routes/
        ├── auth.js            ← /api/auth/register | login | me
        ├── eoi.js             ← /api/eoi (تقديم ومتابعة الطلبات)
        └── weather.js         ← /api/weather (مناخ + إعدادات Widget)
```

---

## 1. الوظائف التفاعلية المضافة

| الوظيفة | الملف | الوصف |
|---------|-------|-------|
| قائمة جوال (Hamburger) | `js/main.js` | فتح/إغلاق القائمة على الشاشات الصغيرة |
| عدّاد تنازلي حي | `js/main.js` | حتى 9 أكتوبر 2026 |
| Accordion للـ FAQ | `js/main.js` | فتح/إغلاق الأسئلة |
| التحقق من النماذج | `js/main.js` + صفحات auth | رسائل خطأ فورية |
| نظام الجلسات | `js/auth.js` | JWT في localStorage |
| لوحة التحكم | `pages/dashboard.html` | عرض طلبات المستخدم |
| بيانات المناخ | `pages/climate.html` | اختيار مدينة + عرض طقس |

---

## 2. نظام التسجيل وإنشاء الحساب الآمن

### الحماية المطبّقة
- **تشفير كلمات المرور**: bcrypt (12 rounds)
- **JWT** لمدة 7 أيام
- **Rate limiting**: 10 محاولات / 15 دقيقة على مسارات auth
- **التحقق من المدخلات** (express-validator):
  - بريد إلكتروني صالح
  - كلمة مرور: 8+ أحرف، حرف كبير + صغير + رقم
  - اسم بدون رموز خطرة
- رسائل خطأ واضحة بالعربية (`VALIDATION_ERROR`, `EMAIL_EXISTS`, `INVALID_CREDENTIALS`...)
- Helmet لأمان الهيدرز
- سجل تدقيق (audit_logs)

### التشغيل
```bash
cd backend
cp .env.example .env
# عدّل DATABASE_URL و JWT_SECRET
npm install
# أنشئ قاعدة البيانات ونفّذ schema.sql
npm run seed-admin   # إنشاء حساب المسؤول
npm run dev
```

### حساب المسؤول (Admin)

بعد تنفيذ `npm run seed-admin`:

| الحقل | القيمة الافتراضية |
|--------|-------------------|
| **البريد (Username)** | `admin@march.local` |
| **كلمة المرور** | `Admin@MARCH2026` |
| **الدور** | `admin` |

يمكن تغييرها من ملف `.env`:
```
ADMIN_EMAIL=admin@march.local
ADMIN_PASSWORD=Admin@MARCH2026
ADMIN_NAME=مدير المنصة
```

⚠ **في الإنتاج:** غيّر كلمة المرور فوراً ولا تستخدم القيم الافتراضية.

تسجيل الدخول من: `pages/login.html` بنفس البريد وكلمة المرور.

---

## 3. بنية قاعدة البيانات

الملف: `backend/config/schema.sql`

### الجداول الرئيسية والعلاقات

```
users ─────────┬──────── user_institutions ──────── institutions
               │
               └──────── eoi_applications ──────── research_axes
                              │
                              └──── eoi_attachments

contact_inquiries
climate_data_cache
audit_logs
```

| الجدول | الغرض |
|--------|-------|
| `users` | الباحثون والمسؤولون |
| `institutions` | الجامعات والمعاهد |
| `user_institutions` | انتماء المستخدم لمؤسسة |
| `research_axes` | المحوران (axis1, axis2) |
| `eoi_applications` | طلبات إبداء الاهتمام + سير الحالة |
| `eoi_attachments` | المرفقات |
| `contact_inquiries` | استفسارات التواصل |
| `climate_data_cache` | كاش بيانات المناخ |
| `audit_logs` | سجل العمليات الأمنية |

### حالات الطلب (status)
`draft` → `submitted` → `under_review` → `shortlisted` / `rejected` / `invited_full`

---

## 4. واجهات API

| Method | Endpoint | حماية | الوصف |
|--------|----------|-------|-------|
| POST | `/api/auth/register` | عامة | إنشاء حساب |
| POST | `/api/auth/login` | عامة | تسجيل دخول |
| GET | `/api/auth/me` | JWT | الملف الشخصي |
| POST | `/api/eoi` | JWT | تقديم/حفظ EOI |
| GET | `/api/eoi/my` | JWT | طلباتي |
| GET | `/api/eoi/:id` | JWT | تفاصيل طلب |
| GET | `/api/weather/locations` | عامة | قائمة مدن MENA |
| GET | `/api/weather/current/:key` | عامة | طقس موقع |
| GET | `/api/weather/widget-config` | عامة | إعدادات Widget طقس العرب |
| GET | `/api/health` | عامة | فحص الخدمة |

---

## 5. الربط مع طقس العرب (ArabiaWeather)

### الواقع التقني
- **لا يوجد Public REST API مجاني** موثّق من طقس العرب.
- التكامل الشرعي المتاح:
  1. **Widgets الرسمية**: https://widgets.arabiaweather.com/
  2. خدمات B2B تجارية (تتطلب اتفاقية).

### ما تم تنفيذه في الموقع
1. صفحة `climate.html` مع:
   - تنويه واضح عن المصدر الرسمي.
   - منطقة جاهزة للصق كود الـ Widget.
   - عرض توضيحي (Demo) عبر `/api/weather` يمكن استبداله لاحقاً.
2. Endpoint `/api/weather/widget-config` يُرجع خطوات التضمين.
3. جدول `climate_data_cache` جاهز لاستقبال بيانات حقيقية عند توفر مصدر مرخّص.

### كيفية إضافة Widget حقيقي
1. اذهب إلى https://widgets.arabiaweather.com/
2. اختر المدينة واللغة والحجم.
3. انسخ كود الـ embed.
4. الصقه داخل `#awWidgetContainer` في `pages/climate.html`.

### بدائل بيانات مناخية مفتوحة (للبحوث)
- [Open-Meteo](https://open-meteo.com/) – مجاني ومفتوح.
- NASA POWER / Giovanni.
- بعد اتفاقية مع طقس العرب يمكن استبدال الـ Demo في `routes/weather.js`.

---

## تشغيل سريع للواجهة فقط (بدون Backend)

افتح `index.html` مباشرة في المتصفح أو عبر Live Server.  
الصفحات الثابتة والعدّاد والـ FAQ تعمل بدون خادم.  
التسجيل ولوحة التحكم وبيانات المناخ تحتاج تشغيل الـ Backend.

---

## ملاحظات أمنية للإنتاج
- غيّر `JWT_SECRET` إلى قيمة عشوائية طويلة.
- استخدم HTTPS فقط.
- فعّل التحقق من البريد (email verification).
- ضع قاعدة البيانات خلف شبكة خاصة.
- راقب `audit_logs` بانتظام.
