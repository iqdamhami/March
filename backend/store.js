/**
 * مخزن بيانات محلي (ملف JSON) — لا يحتاج PostgreSQL
 * الملف: data/march-data.json
 */
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'march-data.json');

const defaultData = () => ({
  users: [],
  institutions: [],
  eoi_applications: [],
  contact_inquiries: [],
  research_axes: [
    {
      id: 1,
      code: 'axis1',
      title_ar: 'تطبيق وتقييم تكنولوجيا المعلومات لدمج بيانات الصحة والمناخ',
      title_en: 'IT for health and climate data',
      guidelines_url: 'https://docs.google.com/document/d/1XcH_E79Ck3pFF8KkcppF2JIEHW0QinKp/edit',
    },
    {
      id: 2,
      code: 'axis2',
      title_ar: 'الممارسات والأساليب لجعل عمليات الرعاية الصحية أكثر استدامة بيئياً',
      title_en: 'Sustainable healthcare operations',
      guidelines_url: 'https://docs.google.com/document/d/1YLvbdA4AzI3rsqAfVZX8AvStVlYrupWc/edit',
    },
  ],
  audit_logs: [],
  meta: { eoi_seq: 0 },
});

function ensure() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(defaultData(), null, 2), 'utf8');
  }
}

function read() {
  ensure();
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch {
    const d = defaultData();
    write(d);
    return d;
  }
}

function write(data) {
  ensure();
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
}

function nextEoiRef(data) {
  const year = new Date().getFullYear();
  data.meta = data.meta || { eoi_seq: 0 };
  data.meta.eoi_seq = (data.meta.eoi_seq || 0) + 1;
  return `MARCH-EOI-${year}-${String(data.meta.eoi_seq).padStart(4, '0')}`;
}

module.exports = {
  uuidv4,
  read,
  write,
  nextEoiRef,
  DATA_FILE,
};
