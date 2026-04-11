/* ==========================================================
   PJ Dashboard — config.js
   API configuration, constants, and shared helpers
   ========================================================== */

const CONFIG = {
  SHEET_ID: '1ANwgbJdxvSY4rB71njLUQvz7IBZYNTIOjfQk7rDAS2Q',
  API_KEY:  'AIzaSyBmY0s92IXmpmErmRoTyoSlH3oKQYAU5M4',
  BASE_URL: 'https://sheets.googleapis.com/v4/spreadsheets',
};

/* Sheet name regex: matches "Kloter 1 July 2025", "Kloter 3 Maret 2026", etc. */
const KLOTER_SHEET_REGEX = /^Kloter\s+\d+\s+\w+\s+\d{4}$/i;

/* Macet sheet */
const MACET_SHEET = 'Sheet5';

/* Known PJs — kept for reference/colour mapping only.
   Parser auto-detects any PJ from the sheet, so new names (e.g. Vanny)
   appear without needing an edit here. */
const KNOWN_PJS = new Set([
  'Marianingsih', 'Rani Nurrani', 'Inggi', 'Dewi', 'Dessry', 'Vanny'
]);

/* Statuses considered as "paid" */
const PAID_STATUSES = new Set([
  '✅ Lunas', '🚀 Lunas Dipercepat', '⚠️ Terlambat'
]);

const LUNAS_SET = new Set(['✅ Lunas', '🚀 Lunas Dipercepat']);

/* Known macet nasabah (name lowercase, PJ) — excluded from kloter obligations */
const MACET_LOOKUP = new Set(['denny susanto|Dewi']);

/* Indonesian month map for display names */
const MONTH_MAP = {
  'january': 'Januari', 'february': 'Februari', 'march': 'Maret',
  'april': 'April', 'may': 'Mei', 'june': 'Juni',
  'july': 'Juli', 'august': 'Agustus', 'september': 'September',
  'october': 'Oktober', 'november': 'November', 'december': 'Desember',
  'jan': 'Januari', 'feb': 'Februari', 'mar': 'Maret',
  'apr': 'April', 'mei': 'Mei', 'jun': 'Juni',
  'jul': 'Juli', 'aug': 'Agustus', 'sep': 'September',
  'oct': 'Oktober', 'nov': 'November', 'dec': 'Desember',
};

/* Installment block layout — each block is 10 columns starting from column K (index 10) */
const INSTALLMENT_START_COL = 10;  // column K
const INSTALLMENT_BLOCK_SIZE = 10;
const MAX_INSTALLMENT_BLOCKS = 4;

/* Installment column offsets within each block */
const INST_OFFSET = {
  JATUH_TEMPO:  0,
  TGL_BAYAR:    1,
  JUMLAH_BAYAR: 2,
  STATUS:       3,
  POKOK:        4,
  PROFIT_INGGI: 5,
  PROFIT_PJ:    6,
  DENDA:        7,
  DENDA_INGGI:  8,
  DENDA_PJ:     9,
};

/* ── Shared Helpers ─────────────────────────────────────── */

function currency(n) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency', currency: 'IDR', maximumFractionDigits: 0
  }).format(n || 0);
}

function toNum(val) {
  if (val == null || val === '') return 0;
  if (typeof val === 'number') return val;
  const cleaned = String(val).replace(/[Rp\s.,]/g, '').replace(/,/g, '');
  return parseFloat(cleaned) || 0;
}

function parseDate(val) {
  if (!val) return '';
  const s = String(val).trim();
  // Handle serial date numbers (Excel-style)
  if (typeof val === 'number' || /^\d{5}$/.test(s)) {
    const serial = typeof val === 'number' ? val : parseInt(s);
    const epoch = new Date(1899, 11, 30);
    epoch.setDate(epoch.getDate() + serial);
    return epoch.toISOString().slice(0, 10);
  }
  // Handle DD/MM/YYYY (from Google Sheets FORMATTED_STRING)
  const ddmmyyyy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (ddmmyyyy) {
    const [_, d, m, y] = ddmmyyyy;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  // Handle Date() string from Sheets
  if (s.startsWith('Date(')) {
    const m = s.match(/Date\((\d+),(\d+),(\d+)\)/);
    if (m) {
      const [_, y, mo, d] = m;
      return `${y}-${String(+mo + 1).padStart(2, '0')}-${d.padStart(2, '0')}`;
    }
  }
  // ISO string date (YYYY-MM-DD)
  if (s.includes('-') && /^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return '';
}

function deriveKloterDisplayName(sheetName) {
  // "Kloter 1 July 2025" → "Kloter 1 Juli 2025"
  const parts = sheetName.split(/\s+/);
  if (parts.length >= 4) {
    const monthEn = parts[2].toLowerCase();
    const monthId = MONTH_MAP[monthEn] || parts[2];
    return `${parts[0]} ${parts[1]} ${monthId} ${parts[3]}`;
  }
  return sheetName;
}
