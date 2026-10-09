/**
 * Climate / Weather Routes
 * 
 * ملاحظة مهمة حول طقس العرب (arabiaweather.com):
 * ------------------------------------------------
 * الموقع لا يوفر واجهة برمجة تطبيقات (Public REST API) مجانية عامة.
 * التكامل الشرعي المتاح حالياً:
 *   1. Widgets الرسمية: https://widgets.arabiaweather.com/
 *   2. خدمات B2B تجارية (SkyWatch, LandWatch...) تتطلب اتفاقية.
 *
 * هذا الملف يوفر:
 *   - Endpoint لعرض بيانات مناخية وهمية/مخزنة مسبقاً للعرض التوضيحي
 *   - هيكل جاهز لاستبدال المصدر لاحقاً بـ API مرخّص أو Open-Meteo
 *   - رابط/إعدادات لـ Widget طقس العرب للواجهة الأمامية
 */

const express = require('express');
const db = require('../config/db');

const router = express.Router();

// مواقع MENA شائعة للعرض
const MENA_LOCATIONS = [
  { key: 'amman', name_ar: 'عمّان', name_en: 'Amman', country: 'الأردن' },
  { key: 'beirut', name_ar: 'بيروت', name_en: 'Beirut', country: 'لبنان' },
  { key: 'riyadh', name_ar: 'الرياض', name_en: 'Riyadh', country: 'السعودية' },
  { key: 'cairo', name_ar: 'القاهرة', name_en: 'Cairo', country: 'مصر' },
  { key: 'dubai', name_ar: 'دبي', name_en: 'Dubai', country: 'الإمارات' },
  { key: 'baghdad', name_ar: 'بغداد', name_en: 'Baghdad', country: 'العراق' },
  { key: 'tunis', name_ar: 'تونس', name_en: 'Tunis', country: 'تونس' },
  { key: 'rabat', name_ar: 'الرباط', name_en: 'Rabat', country: 'المغرب' },
];

/**
 * بيانات مناخية توضيحية (تُستبدل لاحقاً بمصدر حقيقي)
 * في الإنتاج: يمكن استبدالها بـ Open-Meteo أو اتفاقية مع طقس العرب
 */
function getDemoClimateData(locationKey) {
  const base = {
    amman: { temp: 24, humidity: 45, condition: 'صافي', wind: 12, feels: 23 },
    beirut: { temp: 27, humidity: 65, condition: 'غائم جزئياً', wind: 18, feels: 28 },
    riyadh: { temp: 36, humidity: 15, condition: 'مشمس', wind: 22, feels: 35 },
    cairo: { temp: 31, humidity: 40, condition: 'صافي', wind: 15, feels: 32 },
    dubai: { temp: 34, humidity: 55, condition: 'غائم جزئياً', wind: 20, feels: 38 },
    baghdad: { temp: 33, humidity: 25, condition: 'مشمس', wind: 14, feels: 33 },
    tunis: { temp: 26, humidity: 60, condition: 'غائم', wind: 16, feels: 26 },
    rabat: { temp: 23, humidity: 70, condition: 'غائم جزئياً', wind: 19, feels: 22 },
  };
  return base[locationKey] || base.amman;
}

// ---------- قائمة المواقع ----------
router.get('/locations', (req, res) => {
  res.json({
    success: true,
    data: { locations: MENA_LOCATIONS },
    meta: {
      source_note: 'بيانات المواقع ثابتة. للطقس الحالي يُفضّل استخدام Widget طقس العرب.',
      widget_url: 'https://widgets.arabiaweather.com/',
    },
  });
});

// ---------- بيانات مناخية لموقع ----------
router.get('/current/:locationKey', async (req, res) => {
  const { locationKey } = req.params;
  const loc = MENA_LOCATIONS.find((l) => l.key === locationKey);

  if (!loc) {
    return res.status(404).json({
      success: false,
      error: 'الموقع غير موجود',
      code: 'LOCATION_NOT_FOUND',
    });
  }

  try {
    // محاولة جلب من الكاش أولاً
    const cached = await db.query(
      `SELECT payload, fetched_at, expires_at, source
       FROM climate_data_cache
       WHERE location_key = $1 AND data_type = 'current' AND expires_at > NOW()
       LIMIT 1`,
      [locationKey]
    ).catch(() => ({ rows: [] }));

    if (cached.rows.length > 0) {
      return res.json({
        success: true,
        data: {
          location: loc,
          weather: cached.rows[0].payload,
          source: cached.rows[0].source,
          cached: true,
          fetched_at: cached.rows[0].fetched_at,
        },
      });
    }

    // بيانات توضيحية (Demo)
    const weather = getDemoClimateData(locationKey);

    // حفظ في الكاش (ساعة واحدة)
    const expires = new Date(Date.now() + 60 * 60 * 1000);
    await db.query(
      `INSERT INTO climate_data_cache (location_key, location_name_ar, data_type, payload, source, expires_at)
       VALUES ($1, $2, 'current', $3, 'demo_placeholder', $4)
       ON CONFLICT (location_key, data_type)
       DO UPDATE SET payload = $3, fetched_at = NOW(), expires_at = $4, source = 'demo_placeholder'`,
      [locationKey, loc.name_ar, JSON.stringify(weather), expires]
    ).catch(() => {}); // تجاهل خطأ الكاش في حال عدم وجود الجدول بعد

    res.json({
      success: true,
      data: {
        location: loc,
        weather,
        source: 'demo_placeholder',
        cached: false,
        note: 'هذه بيانات توضيحية. للبيانات الحية استخدم Widget طقس العرب أو أبرم اتفاقية API.',
      },
      meta: {
        arabiaweather_widget: 'https://widgets.arabiaweather.com/',
        official_site: 'https://www.arabiaweather.com/',
      },
    });
  } catch (err) {
    console.error('Weather error:', err);
    res.status(500).json({
      success: false,
      error: 'حدث خطأ في جلب بيانات الطقس',
      code: 'SERVER_ERROR',
    });
  }
});

// ---------- إعدادات Widget طقس العرب للواجهة ----------
router.get('/widget-config', (req, res) => {
  res.json({
    success: true,
    data: {
      provider: 'ArabiaWeather',
      official_site: 'https://www.arabiaweather.com/',
      widgets_generator: 'https://widgets.arabiaweather.com/',
      integration_type: 'embed_widget',
      recommended: {
        description: 'استخدم مولد الـ Widgets الرسمي من طقس العرب لتضمين توقعات الطقس في صفحات الموقع',
        steps: [
          '1. اذهب إلى https://widgets.arabiaweather.com/',
          '2. اختر المدينة / المنطقة',
          '3. خصّص المظهر (عربي/إنجليزي، حجم، ألوان)',
          '4. انسخ كود الـ embed وضعه في الصفحة المطلوبة',
        ],
        note: 'لا يوجد Public REST API مجاني حالياً من طقس العرب. للبيانات التاريخية أو الـ API البرمجي يلزم التواصل التجاري معهم.',
      },
    },
  });
});

module.exports = router;
