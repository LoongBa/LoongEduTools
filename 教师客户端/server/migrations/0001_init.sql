-- D03 §3.1 + §3.2 · D1 schema S1
CREATE TABLE IF NOT EXISTS teachers (
  id            TEXT PRIMARY KEY,
  openid        TEXT UNIQUE,
  phone         TEXT UNIQUE,
  password_hash TEXT,
  name          TEXT,
  grade         TEXT,
  subject       TEXT,
  agree_terms   INTEGER DEFAULT 0,
  license_level INTEGER DEFAULT 1,
  status        TEXT DEFAULT 'active',
  created_at    TEXT,
  updated_at    TEXT
);

CREATE TABLE IF NOT EXISTS licenses (
  license_key   TEXT PRIMARY KEY,
  teacher_id    TEXT,
  license_level INTEGER,
  machine_quota INTEGER DEFAULT 3,
  status        TEXT DEFAULT 'unused',
  bound_at      TEXT,
  created_at    TEXT
);

CREATE TABLE IF NOT EXISTS classroom_licenses (
  id            TEXT PRIMARY KEY,
  teacher_id    TEXT,
  semester      TEXT,
  license_level INTEGER,
  expires_at    TEXT,
  machine_count INTEGER DEFAULT 0,
  machines      TEXT DEFAULT '[]',
  status        TEXT DEFAULT 'valid',
  created_at    TEXT,
  UNIQUE(teacher_id, semester)
);

CREATE TABLE IF NOT EXISTS packages (
  package_id    TEXT PRIMARY KEY,
  version       TEXT,
  package_type  TEXT,
  name          TEXT,
  required_license_level INTEGER,
  min_shell_version TEXT,
  size_bytes    INTEGER,
  checksum      TEXT,
  r2_key        TEXT,
  is_latest     INTEGER DEFAULT 1,
  released_at   TEXT
);

CREATE TABLE IF NOT EXISTS reports (
  id            TEXT PRIMARY KEY,
  teacher_id    TEXT,
  day           TEXT,
  data          TEXT,
  created_at    TEXT
);

CREATE INDEX IF NOT EXISTS idx_licenses_teacher ON licenses(teacher_id);
CREATE INDEX IF NOT EXISTS idx_classroom_teacher_sem ON classroom_licenses(teacher_id, semester);
CREATE INDEX IF NOT EXISTS idx_reports_teacher_day ON reports(teacher_id, day);
