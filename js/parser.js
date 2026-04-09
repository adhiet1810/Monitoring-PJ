/* ==========================================================
   PJ Dashboard — parser.js
   Google Sheets API fetch, kloter parsing, settlement logic
   ========================================================== */

/* ── API Fetching ───────────────────────────────────────── */

async function fetchSheetList() {
  const url = `${CONFIG.BASE_URL}/${CONFIG.SHEET_ID}?key=${CONFIG.API_KEY}&fields=sheets.properties.title`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch sheet list: ${res.status}`);
  const data = await res.json();
  return data.sheets.map(s => s.properties.title);
}

async function fetchSheetData(sheetName) {
  const range = encodeURIComponent(`'${sheetName}'`);
  const url = `${CONFIG.BASE_URL}/${CONFIG.SHEET_ID}/values/${range}?key=${CONFIG.API_KEY}&valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=FORMATTED_STRING`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${sheetName}: ${res.status}`);
  const data = await res.json();
  return data.values || [];
}

async function fetchAllData(progressCallback) {
  // Step 1: Get all sheet names
  if (progressCallback) progressCallback('Mengambil daftar sheet...');
  const allSheets = await fetchSheetList();

  // Step 2: Filter kloter sheets
  const kloterSheets = allSheets.filter(name => KLOTER_SHEET_REGEX.test(name));
  const hasMacet = allSheets.includes(MACET_SHEET);

  // Step 3: Fetch all kloter sheets in parallel
  const kloters = [];
  const total = kloterSheets.length + (hasMacet ? 1 : 0);
  let done = 0;

  const kloterPromises = kloterSheets.map(async (sheetName) => {
    const rows = await fetchSheetData(sheetName);
    done++;
    if (progressCallback) progressCallback(`Memproses ${done}/${total} sheet...`);
    return { sheetName, rows };
  });

  const kloterResults = await Promise.all(kloterPromises);

  // Parse each kloter
  for (const { sheetName, rows } of kloterResults) {
    const parsed = parseKloterSheet(sheetName, rows);
    if (parsed) kloters.push(parsed);
  }

  // Sort kloters chronologically
  kloters.sort((a, b) => a.sortKey.localeCompare(b.sortKey));

  // Step 4: Fetch macet data
  let macet = [];
  if (hasMacet) {
    const macetRows = await fetchSheetData(MACET_SHEET);
    done++;
    if (progressCallback) progressCallback(`Memproses ${done}/${total} sheet...`);
    macet = parseMacetSheet(macetRows);
  }

  // Step 5: Flag macet nasabah in kloter data
  flagMacetInKloters(kloters, macet);

  return { kloters, macet };
}


/* ── Kloter Sheet Parser ────────────────────────────────── */

function parseKloterSheet(sheetName, rows) {
  if (!rows || rows.length < 8) return null;

  // Metadata: Row 3 (index 2) and Row 4 (index 3)
  const row3 = rows[2] || [];
  const row4 = rows[3] || [];

  const kloterNameRaw = row3[1] || sheetName;  // B3
  const periodeMulai  = parseDate(row3[3]);     // D3
  const totalModal    = toNum(row3[5]);         // F3

  const jumlahNasabah   = toNum(row4[1]);       // B4
  const jatuhTempoAkhir = parseDate(row4[3]);   // D4
  const totalKeuntungan = toNum(row4[5]);       // F4

  // Derive display name from sheet tab name (more reliable)
  const kloterName = deriveKloterDisplayName(sheetName);

  // Sort key for chronological ordering
  const sortKey = deriveSortKey(sheetName);

  // Row 6 (index 5): installment section headers — detect block count
  const row6 = rows[5] || [];
  let installmentBlocks = 0;
  for (let c = INSTALLMENT_START_COL; c < row6.length; c += INSTALLMENT_BLOCK_SIZE) {
    if (row6[c] && String(row6[c]).toUpperCase().includes('ANGSURAN')) {
      installmentBlocks++;
    }
  }
  installmentBlocks = Math.max(installmentBlocks, 1);
  installmentBlocks = Math.min(installmentBlocks, MAX_INSTALLMENT_BLOCKS);

  // Collect installment section headers for month labels
  const monthLabels = [];
  for (let b = 0; b < installmentBlocks; b++) {
    const col = INSTALLMENT_START_COL + b * INSTALLMENT_BLOCK_SIZE;
    monthLabels.push(row6[col] ? String(row6[col]).trim() : `ANGSURAN BULAN ${b + 1}`);
  }

  // Parse nasabah rows starting from row 8 (index 7)
  const nasabahList = [];
  for (let r = 7; r < rows.length; r++) {
    const row = rows[r] || [];
    const noVal = toNum(row[0]);    // A: No
    const nama = (row[1] || '').toString().trim();
    const pj = (row[2] || '').toString().trim();

    // Validate: must have valid number (1–200), known PJ, and a name
    if (noVal < 1 || noVal > 200) continue;
    if (!KNOWN_PJS.has(pj)) continue;
    if (!nama || nama.length < 2) continue;

    const pinjaman     = toNum(row[3]);   // D: Jumlah Pinjaman
    const tenor        = toNum(row[4]);   // E: Tenor
    const angsuranBulan = toNum(row[5]);  // F: Angsuran/Bulan
    const totalAngsuran = toNum(row[6]);  // G: Total Angsuran
    const totalProfit   = toNum(row[7]);  // H: Total Profit
    const tglMulai      = parseDate(row[8]);  // I: Tgl Mulai
    const jtAkhir       = parseDate(row[9]);  // J: Jatuh Tempo Akhir

    // Parse installments
    const installments = [];
    for (let b = 0; b < installmentBlocks; b++) {
      const base = INSTALLMENT_START_COL + b * INSTALLMENT_BLOCK_SIZE;
      const jatuhTempo  = parseDate(row[base + INST_OFFSET.JATUH_TEMPO]);
      const tglBayar    = parseDate(row[base + INST_OFFSET.TGL_BAYAR]);
      const jumlahBayar = toNum(row[base + INST_OFFSET.JUMLAH_BAYAR]);
      const status      = (row[base + INST_OFFSET.STATUS] || '').toString().trim();
      const pokok       = toNum(row[base + INST_OFFSET.POKOK]);
      const profitInggi = toNum(row[base + INST_OFFSET.PROFIT_INGGI]);
      const profitPJ    = toNum(row[base + INST_OFFSET.PROFIT_PJ]);
      const denda       = toNum(row[base + INST_OFFSET.DENDA]);
      const dendaInggi  = toNum(row[base + INST_OFFSET.DENDA_INGGI]);
      const dendaPJ     = toNum(row[base + INST_OFFSET.DENDA_PJ]);

      // Transfer Inggi = Pokok + Profit Inggi + Denda Inggi
      const transferInggi = pokok + profitInggi + dendaInggi;

      installments.push({
        bulan: b + 1,
        month_label: monthLabels[b] || `ANGSURAN BULAN ${b + 1}`,
        jatuh_tempo: jatuhTempo,
        tgl_bayar: tglBayar,
        jumlah_bayar: jumlahBayar,
        status: status || 'Belum Bayar',
        pokok, profit_inggi: profitInggi, profit_pj: profitPJ,
        denda, denda_inggi: dendaInggi, denda_pj: dendaPJ,
        transfer_inggi: transferInggi,
      });
    }

    // Filter out empty trailing installments (no status, no payment, no due date)
    // Find the last "real" installment (has a status, payment, or due date)
    let lastActiveIdx = -1;
    for (let idx = installments.length - 1; idx >= 0; idx--) {
      const inst = installments[idx];
      if (inst.status !== 'Belum Bayar' || inst.jatuh_tempo || inst.jumlah_bayar > 0) {
        lastActiveIdx = idx;
        break;
      }
    }
    // Keep up to lastActiveIdx+1 or tenor, whichever is greater
    const keepCount = Math.max(tenor, lastActiveIdx + 1);
    const finalInstallments = installments.slice(0, keepCount);

    // Compute settlement and totals
    const computed = computeSettlement(finalInstallments, totalAngsuran, pinjaman, tenor);

    nasabahList.push({
      no: noVal, nama, pj, pinjaman, tenor, angsuran_bulan: angsuranBulan,
      total_angsuran: totalAngsuran, total_profit: totalProfit,
      tgl_mulai: tglMulai, jatuh_tempo_akhir: jtAkhir,
      installments: finalInstallments,
      ...computed,
    });
  }

  return {
    sheet_name: sheetName,
    kloter_name: kloterName,
    sortKey,
    periode_mulai: periodeMulai,
    jatuh_tempo_akhir: jatuhTempoAkhir,
    total_modal: totalModal,
    total_keuntungan: totalKeuntungan,
    jumlah_nasabah: jumlahNasabah || nasabahList.length,
    nasabah: nasabahList,
  };
}


/* ── Settlement & Transfer Logic ────────────────────────── */

function computeSettlement(installments, totalAngsuran, pinjaman, tenor) {
  const paid = installments.filter(i => PAID_STATUSES.has(i.status));
  const unpaid = installments.filter(i => !PAID_STATUSES.has(i.status));

  // Total paid amount (Lunas + Dipercepat + Terlambat)
  const totalPaid = paid.reduce((s, i) => s + i.jumlah_bayar, 0);
  let totalRemaining = Math.max(0, totalAngsuran - totalPaid);

  // Transfer Inggi & Profit PJ — only from truly paid installments
  const tiSudah = paid.reduce((s, i) => s + i.transfer_inggi, 0);
  const ppjSudah = paid.reduce((s, i) => s + (i.profit_pj || 0) + (i.denda_pj || 0), 0);

  // Gap between total angsuran and accumulated payments
  const gap = totalAngsuran > 0 ? (totalAngsuran - totalPaid) / totalAngsuran : 0;

  // Overall status
  let overallStatus;
  if (unpaid.length === 0) {
    overallStatus = 'settled';
  } else if (totalAngsuran > 0 && totalPaid >= totalAngsuran) {
    // Accumulated payments cover or exceed total — settled
    overallStatus = 'settled';
    totalRemaining = 0;
  } else if (gap >= 0 && gap < 0.10) {
    // Gap < 10%: early settlement with reduced interest (e.g. Dipercepat cases)
    overallStatus = 'settled';
    totalRemaining = 0;
  } else if (paid.length === 0) {
    overallStatus = 'remaining';
  } else {
    overallStatus = 'partial';
  }

  // Expected per-period values from actual paid installments or sheet formulas
  let tiPerPeriod, ppjPerPeriod;
  if (paid.length > 0) {
    const ref = paid[0];
    tiPerPeriod = ref.pokok + ref.profit_inggi;
    ppjPerPeriod = ref.profit_pj;
  } else {
    // Try sheet formula values
    const formulaInst = installments.find(i => i.pokok > 0);
    if (formulaInst) {
      tiPerPeriod = formulaInst.pokok + formulaInst.profit_inggi;
      ppjPerPeriod = formulaInst.profit_pj;
    } else {
      // Last resort: derive from pinjaman/tenor with 50/50 split
      const t = tenor || 1;
      const pokokPer = pinjaman / t;
      const profitPer = (totalAngsuran - pinjaman) / t;
      tiPerPeriod = pokokPer + profitPer / 2;
      ppjPerPeriod = profitPer / 2;
    }
  }

  let tiBelum = tiPerPeriod * unpaid.length;
  let ppjBelum = ppjPerPeriod * unpaid.length;

  if (overallStatus === 'settled') {
    tiBelum = 0;
    ppjBelum = 0;
    totalRemaining = 0;
  }

  // Next installment (for monthly obligation view)
  let nextAngsuran = 0, nextJatuhTempo = '', nextMonthLabel = '';
  let nextTransferInggi = 0, nextProfitPJ = 0;
  if (overallStatus !== 'settled') {
    const nextInst = installments.find(i => !PAID_STATUSES.has(i.status));
    if (nextInst) {
      nextAngsuran = nextInst.jumlah_bayar || (totalAngsuran / (tenor || 1));
      nextJatuhTempo = nextInst.jatuh_tempo || '';
      nextMonthLabel = nextInst.month_label || '';
      nextTransferInggi = Math.round(tiPerPeriod * 100) / 100;
      nextProfitPJ = Math.round(ppjPerPeriod * 100) / 100;
    }
  }

  return {
    overall_status: overallStatus,
    total_paid: Math.round(totalPaid * 100) / 100,
    total_remaining: Math.round(totalRemaining * 100) / 100,
    total_transfer_inggi: Math.round(tiSudah * 100) / 100,
    total_profit_pj: Math.round(ppjSudah * 100) / 100,
    remaining_transfer_inggi: Math.round(tiBelum * 100) / 100,
    remaining_profit_pj: Math.round(ppjBelum * 100) / 100,
    expected_transfer_inggi: Math.round((tiSudah + tiBelum) * 100) / 100,
    expected_profit_pj: Math.round((ppjSudah + ppjBelum) * 100) / 100,
    next_angsuran: nextAngsuran,
    next_jatuh_tempo: nextJatuhTempo,
    next_month_label: nextMonthLabel,
    next_transfer_inggi: nextTransferInggi,
    next_profit_pj: nextProfitPJ,
  };
}


/* ── Macet Sheet Parser ─────────────────────────────────── */

function parseMacetSheet(rows) {
  // Row 2 (index 1) = headers: No, PJ, Nasabah, Angsuran, Bunga, Kloter
  // Data starts at row 3 (index 2)
  const macet = [];
  for (let r = 2; r < rows.length; r++) {
    const row = rows[r] || [];
    const no = toNum(row[0]);
    const pj = (row[1] || '').toString().trim();
    const nama = (row[2] || '').toString().trim();
    const angsuran = toNum(row[3]);
    const bunga = toNum(row[4]);
    const kloter = toNum(row[5]);

    if (!nama || nama === 'TOTAL' || !pj) continue;

    // Only keep Denny susanto (per user request)
    const key = `${nama.toLowerCase()}|${pj}`;
    if (!MACET_LOOKUP.has(key)) continue;

    macet.push({ pj, nama, angsuran, bunga, kloter });
  }
  return macet;
}


/* ── Flag Macet in Kloters ──────────────────────────────── */

function flagMacetInKloters(kloters, macet) {
  const macetKeys = new Set(macet.map(m => `${m.nama.toLowerCase().trim()}|${m.pj.trim()}`));

  for (const k of kloters) {
    for (const n of k.nasabah) {
      const key = `${n.nama.toLowerCase().trim()}|${n.pj.trim()}`;
      if (macetKeys.has(key) && n.overall_status !== 'settled') {
        n.is_macet = true;
        n.overall_status = 'macet';
        n.remaining_transfer_inggi = 0;
        n.remaining_profit_pj = 0;
        n.expected_transfer_inggi = n.total_transfer_inggi;
        n.expected_profit_pj = n.total_profit_pj;
      }
    }
  }
}


/* ── Helpers ─────────────────────────────────────────────── */

function deriveSortKey(sheetName) {
  // "Kloter 1 July 2025" → "2025-07-01"
  const monthOrder = {
    'january':1,'february':2,'march':3,'april':4,'may':5,'june':6,
    'july':7,'august':8,'september':9,'october':10,'november':11,'december':12,
    'jan':1,'feb':2,'mar':3,'apr':4,'mei':5,'jun':6,
    'jul':7,'aug':8,'sep':9,'sept':9,'oct':10,'okt':10,'nov':11,'dec':12,'des':12,
    'januari':1,'februari':2,'maret':3,'april':4,'juni':6,
    'juli':7,'agustus':8,'oktober':10,'desember':12,
  };
  const parts = sheetName.split(/\s+/);
  if (parts.length >= 4) {
    const num = parts[1];
    const month = monthOrder[parts[2].toLowerCase()] || 1;
    const year = parts[3];
    return `${year}-${String(month).padStart(2, '0')}-${String(num).padStart(2, '0')}`;
  }
  return sheetName;
}
