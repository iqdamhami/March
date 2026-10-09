-- ============================================================
-- MARCH EOI Cycle II - Database Schema
-- Compatible with PostgreSQL 14+ / SQLite 3.35+
-- ============================================================

-- Enable UUID extension (PostgreSQL)
-- CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ------------------------------------------------------------
-- 1. Users (المستخدمون - باحثون / ممثلو مؤسسات)
-- ------------------------------------------------------------
CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email           VARCHAR(255) NOT NULL UNIQUE,
    password_hash   VARCHAR(255) NOT NULL,
    full_name       VARCHAR(200) NOT NULL,
    phone           VARCHAR(30),
    role            VARCHAR(30) NOT NULL DEFAULT 'researcher'
                    CHECK (role IN ('researcher', 'admin', 'reviewer')),
    approval_status VARCHAR(20) NOT NULL DEFAULT 'pending'
                    CHECK (approval_status IN ('pending', 'approved', 'rejected')),
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    email_verified  BOOLEAN NOT NULL DEFAULT FALSE,
    verification_token VARCHAR(100),
    reset_token     VARCHAR(100),
    reset_token_expires TIMESTAMPTZ,
    last_login_at   TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);

-- ------------------------------------------------------------
-- 2. Institutions (المؤسسات الأكاديمية / البحثية)
-- ------------------------------------------------------------
CREATE TABLE institutions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name_ar         VARCHAR(300) NOT NULL,
    name_en         VARCHAR(300),
    country         VARCHAR(100) NOT NULL,
    city            VARCHAR(100),
    type            VARCHAR(50) NOT NULL
                    CHECK (type IN ('university', 'research_institute', 'hospital', 'ngo', 'other')),
    website         VARCHAR(300),
    official_email  VARCHAR(255),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------
-- 3. User ↔ Institution (علاقة انتماء)
-- ------------------------------------------------------------
CREATE TABLE user_institutions (
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    institution_id  UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
    position_title  VARCHAR(150),
    is_primary      BOOLEAN DEFAULT TRUE,
    PRIMARY KEY (user_id, institution_id)
);

-- ------------------------------------------------------------
-- 4. Research Axes (المحاور البحثية)
-- ------------------------------------------------------------
CREATE TABLE research_axes (
    id              SERIAL PRIMARY KEY,
    code            VARCHAR(20) NOT NULL UNIQUE,  -- 'axis1', 'axis2'
    title_ar        VARCHAR(300) NOT NULL,
    title_en        VARCHAR(300),
    description_ar  TEXT,
    guidelines_url  VARCHAR(500)
);

INSERT INTO research_axes (code, title_ar, title_en, guidelines_url) VALUES
('axis1',
 'تطبيق وتقييم تكنولوجيا المعلومات لدمج بيانات الصحة والمناخ',
 'IT for integrating health and climate data',
 'https://docs.google.com/document/d/1XcH_E79Ck3pFF8KkcppF2JIEHW0QinKp/edit'),
('axis2',
 'الممارسات والأساليب لجعل عمليات الرعاية الصحية أكثر استدامة بيئياً',
 'Practices for environmentally sustainable healthcare operations',
 'https://docs.google.com/document/d/1YLvbdA4AzI3rsqAfVZX8AvStVlYrupWc/edit');

-- ------------------------------------------------------------
-- 5. EOI Applications (طلبات إبداء الاهتمام)
-- ------------------------------------------------------------
CREATE TABLE eoi_applications (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reference_number    VARCHAR(30) NOT NULL UNIQUE,  -- e.g. MARCH-EOI-2026-0001
    user_id             UUID NOT NULL REFERENCES users(id),
    institution_id      UUID NOT NULL REFERENCES institutions(id),
    axis_id             INTEGER NOT NULL REFERENCES research_axes(id),
    
    project_title       VARCHAR(500) NOT NULL,
    summary             TEXT NOT NULL,                -- 250-400 كلمة
    estimated_budget    DECIMAL(12,2) CHECK (estimated_budget > 0 AND estimated_budget <= 100000),
    duration_months     INTEGER NOT NULL DEFAULT 12,
    
    -- Status workflow
    status              VARCHAR(30) NOT NULL DEFAULT 'draft'
                        CHECK (status IN (
                            'draft',           -- مسودة
                            'submitted',       -- مُقدَّم
                            'under_review',    -- قيد المراجعة
                            'shortlisted',     -- مرشّح للمقترح الكامل
                            'rejected',        -- مرفوض
                            'invited_full'     -- مدعو للمقترح الكامل
                        )),
    
    submitted_at        TIMESTAMPTZ,
    reviewed_at         TIMESTAMPTZ,
    reviewer_notes      TEXT,
    
    -- Climate context (اختياري - مرتبط ببيانات الطقس)
    target_countries    TEXT[],                     -- دول التركيز
    climate_relevance   TEXT,                       -- كيف يرتبط المشروع بالمناخ
    
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_eoi_user ON eoi_applications(user_id);
CREATE INDEX idx_eoi_status ON eoi_applications(status);
CREATE INDEX idx_eoi_axis ON eoi_applications(axis_id);
CREATE INDEX idx_eoi_ref ON eoi_applications(reference_number);

-- ------------------------------------------------------------
-- 6. EOI Attachments (المرفقات)
-- ------------------------------------------------------------
CREATE TABLE eoi_attachments (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    eoi_id          UUID NOT NULL REFERENCES eoi_applications(id) ON DELETE CASCADE,
    file_name       VARCHAR(255) NOT NULL,
    file_path       VARCHAR(500) NOT NULL,
    file_type       VARCHAR(50),
    file_size_kb    INTEGER,
    uploaded_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------
-- 7. Contact Inquiries (استفسارات التواصل)
-- ------------------------------------------------------------
CREATE TABLE contact_inquiries (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            VARCHAR(200) NOT NULL,
    email           VARCHAR(255) NOT NULL,
    institution     VARCHAR(300),
    subject         VARCHAR(100) NOT NULL,
    message         TEXT NOT NULL,
    status          VARCHAR(20) DEFAULT 'new'
                    CHECK (status IN ('new', 'replied', 'closed')),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------
-- 8. Climate Data Cache (ذاكرة مؤقتة لبيانات المناخ)
--    تُملأ من Widget طقس العرب أو من مصدر مرخّص لاحقاً
-- ------------------------------------------------------------
CREATE TABLE climate_data_cache (
    id              SERIAL PRIMARY KEY,
    location_key    VARCHAR(100) NOT NULL,          -- e.g. 'amman', 'beirut', 'riyadh'
    location_name_ar VARCHAR(150),
    data_type       VARCHAR(50) NOT NULL,            -- 'current', 'forecast_5d', 'climate_summary'
    payload         JSONB NOT NULL,                 -- البيانات الخام
    source          VARCHAR(50) DEFAULT 'arabiaweather_widget',
    fetched_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at      TIMESTAMPTZ NOT NULL,
    UNIQUE(location_key, data_type)
);

CREATE INDEX idx_climate_location ON climate_data_cache(location_key);

-- ------------------------------------------------------------
-- 9. Audit Log (سجل التدقيق)
-- ------------------------------------------------------------
CREATE TABLE audit_logs (
    id              BIGSERIAL PRIMARY KEY,
    user_id         UUID REFERENCES users(id),
    action          VARCHAR(100) NOT NULL,
    entity_type     VARCHAR(50),
    entity_id       UUID,
    ip_address      INET,
    user_agent      TEXT,
    details         JSONB,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------
-- Views مفيدة
-- ------------------------------------------------------------
CREATE OR REPLACE VIEW v_eoi_summary AS
SELECT 
    e.id,
    e.reference_number,
    e.project_title,
    e.status,
    e.estimated_budget,
    e.submitted_at,
    u.full_name AS applicant_name,
    u.email AS applicant_email,
    i.name_ar AS institution_name,
    i.country,
    a.code AS axis_code,
    a.title_ar AS axis_title
FROM eoi_applications e
JOIN users u ON e.user_id = u.id
JOIN institutions i ON e.institution_id = i.id
JOIN research_axes a ON e.axis_id = a.id;

-- ------------------------------------------------------------
-- Migration: Account approval + inquiry replies
-- ------------------------------------------------------------
ALTER TABLE users ADD COLUMN IF NOT EXISTS approval_status VARCHAR(20) NOT NULL DEFAULT 'pending'
  CHECK (approval_status IN ('pending', 'approved', 'rejected'));

-- Admins created by seed should be approved
-- UPDATE users SET approval_status = 'approved' WHERE role = 'admin';

ALTER TABLE contact_inquiries ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id);
ALTER TABLE contact_inquiries ADD COLUMN IF NOT EXISTS admin_reply TEXT;
ALTER TABLE contact_inquiries ADD COLUMN IF NOT EXISTS replied_at TIMESTAMPTZ;
ALTER TABLE contact_inquiries ADD COLUMN IF NOT EXISTS replied_by UUID REFERENCES users(id);

CREATE INDEX IF NOT EXISTS idx_users_approval ON users(approval_status);
CREATE INDEX IF NOT EXISTS idx_inquiries_email ON contact_inquiries(email);
CREATE INDEX IF NOT EXISTS idx_inquiries_status ON contact_inquiries(status);
