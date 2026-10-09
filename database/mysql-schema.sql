-- MARCH EOI – MySQL schema (utf8mb4)
-- استيراد: mysql -u USER -p DB_NAME < database/mysql-schema.sql

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

CREATE TABLE IF NOT EXISTS users (
  id CHAR(36) NOT NULL PRIMARY KEY,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  full_name VARCHAR(200) NOT NULL,
  phone VARCHAR(30) DEFAULT NULL,
  role VARCHAR(30) NOT NULL DEFAULT 'researcher',
  approval_status VARCHAR(20) NOT NULL DEFAULT 'pending',
  is_active TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_login_at DATETIME DEFAULT NULL,
  INDEX idx_users_approval (approval_status),
  INDEX idx_users_role (role)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS eoi_applications (
  id CHAR(36) NOT NULL PRIMARY KEY,
  reference_number VARCHAR(40) NOT NULL UNIQUE,
  user_id CHAR(36) NOT NULL,
  institution_name VARCHAR(300) NOT NULL,
  country VARCHAR(100) NOT NULL,
  city VARCHAR(100) DEFAULT NULL,
  axis_code VARCHAR(20) NOT NULL,
  project_title VARCHAR(500) NOT NULL,
  summary TEXT NOT NULL,
  estimated_budget DECIMAL(12,2) DEFAULT NULL,
  climate_relevance TEXT DEFAULT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'draft',
  reviewer_notes TEXT DEFAULT NULL,
  submitted_at DATETIME DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_eoi_user (user_id),
  INDEX idx_eoi_status (status),
  CONSTRAINT fk_eoi_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS contact_inquiries (
  id CHAR(36) NOT NULL PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  email VARCHAR(255) NOT NULL,
  institution VARCHAR(300) DEFAULT NULL,
  subject VARCHAR(200) NOT NULL,
  message TEXT NOT NULL,
  user_id CHAR(36) DEFAULT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'new',
  admin_reply TEXT DEFAULT NULL,
  replied_at DATETIME DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_inq_email (email),
  INDEX idx_inq_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS meta (
  meta_key VARCHAR(64) NOT NULL PRIMARY KEY,
  meta_value VARCHAR(255) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO meta (meta_key, meta_value) VALUES ('eoi_seq', '0')
  ON DUPLICATE KEY UPDATE meta_value = meta_value;

SET FOREIGN_KEY_CHECKS = 1;
