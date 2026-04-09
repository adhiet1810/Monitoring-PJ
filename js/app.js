/* ==========================================================
   PJ Dashboard — app.js
   Filters, aggregation, rendering, events
   ========================================================== */

let DATA = null;

/* ── Initialization ─────────────────────────────────────── */

async function loadData() {
  const spinner = document.getElementById('loadingSpinner');
  const progressText = document.getElementById('progressText');
  spinner.style.display = 'flex';

  try {
    DATA = await fetchAllData((msg) => {
      if (progressText) progressText.textContent = msg;
    });
    spinner.style.display = 'none';
    init();
  } catch (err) {
    spinner.style.display = 'none';
    document.querySelector('main').innerHTML = `
      <div style="text-align:center;padding:60px 20px;color:var(--red)">
        <h2>⚠️ Gagal memuat data</h2>
        <p style="color:var(--muted);margin-top:12px">${err.message}</p>
        <button class="btn" onclick="loadData()" style="margin-top:20px">🔄 Coba Lagi</button>
      </div>`;
  }
}

function init() {
  // Show UI elements hidden during loading
  document.getElementById('toolbar').style.display = 'flex';
  document.getElementById('titlePJ').style.display = 'block';
  document.getElementById('grandTotal').style.display = 'flex';
  document.getElementById('titleKloter').style.display = 'block';

  populateFilters();
  render();

  // Filter event listeners
  document.getElementById('pjSelect').addEventListener('change', render);
  document.getElementById('kloterSelect').addEventListener('change', render);
  document.getElementById('statusSelect').addEventListener('change', render);
  document.getElementById('btnReset').addEventListener('click', () => {
    document.getElementById('pjSelect').value = 'all';
    document.getElementById('kloterSelect').value = 'all';
    document.getElementById('statusSelect').value = 'all';
    render();
  });
}

function populateFilters() {
  // PJ dropdown
  const pjs = new Set();
  DATA.kloters.forEach(k => k.nasabah.forEach(n => pjs.add(n.pj)));
  const pjSelect = document.getElementById('pjSelect');
  [...pjs].sort().forEach(pj => {
    pjSelect.innerHTML += `<option value="${pj}">${pj}</option>`;
  });

  // Kloter dropdown
  const kloterSelect = document.getElementById('kloterSelect');
  DATA.kloters.forEach(k => {
    kloterSelect.innerHTML += `<option value="${k.sheet_name}">${k.kloter_name}</option>`;
  });
}


/* ── Rendering ──────────────────────────────────────────── */

function render() {
  renderPJSummary();
  renderKloterList();
  renderMacet();
}

function getFilters() {
  return {
    pj: document.getElementById('pjSelect').value,
    kloter: document.getElementById('kloterSelect').value,
    status: document.getElementById('statusSelect').value,
  };
}


/* ── PJ Summary Cards ───────────────────────────────────── */

function buildPJAggregates(filters) {
  const agg = {};
  DATA.kloters.forEach(k => {
    if (filters.kloter !== 'all' && k.sheet_name !== filters.kloter) return;
    k.nasabah.forEach(n => {
      if (filters.status !== 'all' && n.overall_status !== filters.status) return;
      if (filters.pj !== 'all' && n.pj !== filters.pj) return;
      if (!agg[n.pj]) agg[n.pj] = {
        settled: 0, partial: 0, remaining: 0, macet: 0,
        totalPinjaman: 0, totalRemaining: 0, totalPaid: 0,
        totalTransferInggi: 0, totalProfitPJ: 0,
        remainingTransferInggi: 0, remainingProfitPJ: 0,
        nasabahCount: 0,
      };
      agg[n.pj][n.overall_status] = (agg[n.pj][n.overall_status] || 0) + 1;
      agg[n.pj].totalPinjaman += n.pinjaman;
      agg[n.pj].totalRemaining += n.total_remaining;
      agg[n.pj].totalPaid += n.total_paid;
      agg[n.pj].totalTransferInggi += (n.total_transfer_inggi || 0);
      agg[n.pj].totalProfitPJ += (n.total_profit_pj || 0);
      agg[n.pj].remainingTransferInggi += (n.remaining_transfer_inggi || 0);
      agg[n.pj].remainingProfitPJ += (n.remaining_profit_pj || 0);
      agg[n.pj].nasabahCount++;
    });
  });
  return agg;
}

function renderPJSummary() {
  const filters = getFilters();
  const agg = buildPJAggregates(filters);
  const container = document.getElementById('pjSummary');

  const sorted = Object.entries(agg).sort((a, b) => b[1].nasabahCount - a[1].nasabahCount);

  container.innerHTML = sorted.map(([pj, s]) => {
    const kloterMacet = s.macet || 0;
    const total = s.settled + s.partial + s.remaining + kloterMacet;
    const pct = total > 0 ? Math.round(s.settled / total * 100) : 0;
    const isActive = filters.pj === pj;
    return `
      <div class="pj-card ${isActive ? 'active' : ''}" data-pj="${pj}">
        <h3>👔 ${pj}</h3>
        <div class="stat-row"><span class="label">Total Transaksi</span><span class="value">${total}</span></div>
        <div class="stat-row"><span class="label">Lunas</span><span class="value" style="color:var(--green)">${s.settled}</span></div>
        <div class="stat-row"><span class="label">Sebagian</span><span class="value" style="color:var(--orange)">${s.partial}</span></div>
        <div class="stat-row"><span class="label">Belum Bayar</span><span class="value" style="color:var(--red)">${s.remaining}</span></div>
        ${kloterMacet ? `<div class="stat-row"><span class="label">Macet</span><span class="value" style="color:#fff;background:#2c2420;padding:1px 8px;border-radius:10px">${kloterMacet}</span></div>` : ''}
        <div class="stat-row"><span class="label">Transfer Inggi (sudah)</span><span class="value" style="color:var(--blue)">${currency(s.totalTransferInggi)}</span></div>
        <div class="stat-row"><span class="label">Transfer Inggi (belum)</span><span class="value" style="color:#7c3aed">${currency(s.remainingTransferInggi)}</span></div>
        <div class="stat-row"><span class="label">Profit PJ (sudah)</span><span class="value" style="color:var(--green)">${currency(s.totalProfitPJ)}</span></div>
        <div class="stat-row"><span class="label">Profit PJ (belum)</span><span class="value" style="color:#059669">${currency(s.remainingProfitPJ)}</span></div>
        <div class="stat-row"><span class="label">Sisa Outstanding</span><span class="value" style="color:var(--accent)">${currency(s.totalRemaining)}</span></div>
        <div class="progress-bar"><div class="fill ${pct >= 80 ? 'green' : 'orange'}" style="width:${pct}%"></div></div>
        <div style="font-size:0.75rem;color:var(--muted);text-align:right;margin-top:4px">${pct}% lunas</div>
      </div>`;
  }).join('');

  // Click to filter by PJ
  container.querySelectorAll('.pj-card').forEach(card => {
    card.addEventListener('click', () => {
      const sel = document.getElementById('pjSelect');
      const pj = card.dataset.pj;
      sel.value = sel.value === pj ? 'all' : pj;
      render();
    });
  });

  // Grand total
  const gt = Object.values(agg).reduce((acc, s) => ({
    settled: acc.settled + s.settled,
    partial: acc.partial + s.partial,
    remaining: acc.remaining + s.remaining,
    totalRemaining: acc.totalRemaining + s.totalRemaining,
    totalPaid: acc.totalPaid + s.totalPaid,
    totalTransferInggi: acc.totalTransferInggi + (s.totalTransferInggi || 0),
    totalProfitPJ: acc.totalProfitPJ + (s.totalProfitPJ || 0),
    remainingTransferInggi: acc.remainingTransferInggi + (s.remainingTransferInggi || 0),
    remainingProfitPJ: acc.remainingProfitPJ + (s.remainingProfitPJ || 0),
    macetAmount: acc.macetAmount + (s.macetAmount || 0),
  }), { settled: 0, partial: 0, remaining: 0, totalRemaining: 0, totalPaid: 0, totalTransferInggi: 0, totalProfitPJ: 0, remainingTransferInggi: 0, remainingProfitPJ: 0, macetAmount: 0 });

  document.getElementById('grandTotal').innerHTML = `
    <div>
      <div class="label">Total Seluruh PJ</div>
      <div style="font-size:0.85rem;color:var(--muted);margin-top:4px">
        <span class="pill pill-settled">${gt.settled} Lunas</span>
        <span class="pill pill-partial">${gt.partial} Sebagian</span>
        <span class="pill pill-remaining">${gt.remaining} Belum</span>
      </div>
    </div>
    <div style="text-align:center">
      <div style="font-size:1.1rem;font-weight:600;color:var(--blue)">${currency(gt.totalTransferInggi)}</div>
      <div style="font-size:0.78rem;color:var(--muted)">transfer Inggi (sudah)</div>
    </div>
    <div style="text-align:center">
      <div style="font-size:1.1rem;font-weight:600;color:#7c3aed">${currency(gt.remainingTransferInggi)}</div>
      <div style="font-size:0.78rem;color:var(--muted)">transfer Inggi (belum)</div>
    </div>
    <div style="text-align:center">
      <div style="font-size:1.1rem;font-weight:600;color:var(--green)">${currency(gt.totalProfitPJ + gt.remainingProfitPJ)}</div>
      <div style="font-size:0.78rem;color:var(--muted)">profit PJ (total)</div>
      <div style="font-size:0.72rem;color:var(--muted)">${currency(gt.totalProfitPJ)} sudah + ${currency(gt.remainingProfitPJ)} belum</div>
    </div>
    <div style="text-align:right">
      <div class="value">${currency(gt.totalRemaining)}</div>
      <div style="font-size:0.78rem;color:var(--muted)">sisa outstanding</div>
    </div>`;
}


/* ── Kloter Detail List ─────────────────────────────────── */

function renderKloterList() {
  const filters = getFilters();
  const container = document.getElementById('kloterList');
  let html = '';

  DATA.kloters.forEach((k, ki) => {
    if (filters.kloter !== 'all' && k.sheet_name !== filters.kloter) return;

    let nasabah = k.nasabah;
    if (filters.pj !== 'all') nasabah = nasabah.filter(n => n.pj === filters.pj);
    if (filters.status !== 'all') nasabah = nasabah.filter(n => n.overall_status === filters.status);
    if (nasabah.length === 0) return;

    const settled = nasabah.filter(n => n.overall_status === 'settled');
    const partial = nasabah.filter(n => n.overall_status === 'partial');
    const remaining = nasabah.filter(n => n.overall_status === 'remaining');
    const macetInKloter = nasabah.filter(n => n.overall_status === 'macet');
    const totalOutstanding = nasabah.filter(n => n.overall_status !== 'macet').reduce((s, n) => s + n.total_remaining, 0);

    html += `
      <div class="kloter-section">
        <div class="kloter-header" data-idx="${ki}">
          <span class="arrow">▸</span>
          <h4>${k.kloter_name}</h4>
          <div class="kloter-stats">
            <span class="pill pill-settled">${settled.length}</span>
            <span class="pill pill-partial">${partial.length}</span>
            <span class="pill pill-remaining">${remaining.length}</span>
            ${macetInKloter.length > 0 ? `<span class="pill pill-macet">${macetInKloter.length}</span>` : ''}
          </div>
          <span class="kloter-amount">${currency(totalOutstanding)}</span>
        </div>
        <div class="kloter-body" data-idx="${ki}">`;

    // Obligation summary helper
    function obligationSummary(group, color) {
      const monthlyAngsuran = group.reduce((s, n) => s + (n.next_angsuran || 0), 0);
      const monthlyTI = group.reduce((s, n) => s + (n.next_transfer_inggi || 0), 0);
      const monthlyPPJ = group.reduce((s, n) => s + (n.next_profit_pj || 0), 0);
      const totalOut = group.reduce((s, n) => s + (n.total_remaining || 0), 0);
      const tiDone = group.reduce((s, n) => s + (n.total_transfer_inggi || 0), 0);
      const ppjDone = group.reduce((s, n) => s + (n.total_profit_pj || 0), 0);
      return `<div class="obligation-summary" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:6px 16px;padding:10px 14px;background:${color};border-radius:10px;margin-top:8px;font-size:0.82rem">
        <div><span style="color:var(--muted)">Tagihan Bulan Ini</span><br><b style="color:var(--accent);font-size:1.05rem">${currency(monthlyAngsuran)}</b></div>
        <div><span style="color:var(--muted)">Transfer Inggi (bulan ini)</span><br><b style="color:var(--blue)">${currency(monthlyTI)}</b></div>
        <div><span style="color:var(--muted)">Profit PJ (bulan ini)</span><br><b style="color:var(--green)">${currency(monthlyPPJ)}</b></div>
        <div><span style="color:var(--muted)">Total Sisa Outstanding</span><br><b style="color:var(--accent)">${currency(totalOut)}</b></div>
        <div><span style="color:var(--muted)">Transfer Inggi (sudah)</span><br><b style="color:var(--blue);opacity:0.7">${currency(tiDone)}</b></div>
        <div><span style="color:var(--muted)">Profit PJ (sudah)</span><br><b style="color:var(--green);opacity:0.7">${currency(ppjDone)}</b></div>
      </div>`;
    }

    // Belum Bayar
    if (remaining.length > 0) {
      html += `<div class="sub-section">
        <h5>🔴 Belum Bayar (${remaining.length})</h5>
        ${obligationSummary(remaining, 'var(--red-bg)')}
        ${renderNasabahList(remaining, false)}
      </div>`;
    }

    // Sebagian Bayar
    if (partial.length > 0) {
      html += `<div class="sub-section">
        <h5>🟠 Sebagian Bayar (${partial.length})</h5>
        ${obligationSummary(partial, 'var(--orange-bg)')}
        ${renderNasabahList(partial, false)}
      </div>`;
    }

    // Lunas
    if (settled.length > 0) {
      html += `<div class="sub-section">
        <h5>🟢 Lunas (${settled.length})</h5>
        ${renderNasabahList(settled, true)}
      </div>`;
    }

    // Macet in kloter
    if (macetInKloter.length > 0) {
      const macetTotal = macetInKloter.reduce((s, n) => s + (n.total_remaining || 0), 0);
      html += `<div class="sub-section" style="background:rgba(44,36,32,0.06);border-left:3px solid #2c2420">
        <h5>⚫ Kredit Macet (${macetInKloter.length}) — ${currency(macetTotal)}</h5>
        ${renderNasabahList(macetInKloter, false)}
      </div>`;
    }

    // Kloter summary
    const activeNasabah = nasabah.filter(n => n.overall_status !== 'macet');
    const kloterTISudah = activeNasabah.reduce((s, n) => s + (n.total_transfer_inggi || 0), 0);
    const kloterTIBelum = activeNasabah.reduce((s, n) => s + (n.remaining_transfer_inggi || 0), 0);
    const kloterPPJSudah = activeNasabah.reduce((s, n) => s + (n.total_profit_pj || 0), 0);
    const kloterPPJBelum = activeNasabah.reduce((s, n) => s + (n.remaining_profit_pj || 0), 0);
    html += `<div class="sub-section" style="background:#f0e8df">
        <div class="kloter-summary-grid" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:6px 16px;font-size:0.85rem">
          <div>
            <span style="color:var(--muted);font-size:0.78rem">Keuntungan</span><br>
            <b>${currency(k.total_keuntungan)}</b>
          </div>
          <div>
            <span style="color:var(--muted);font-size:0.78rem">Transfer Inggi</span><br>
            <span style="color:var(--blue);font-weight:600">${currency(kloterTISudah)}</span>
            <span style="font-size:0.75rem;color:var(--muted)"> sudah</span>
            ${kloterTIBelum > 0 ? `<br><span style="color:#7c3aed;font-weight:600">${currency(kloterTIBelum)}</span><span style="font-size:0.75rem;color:var(--muted)"> belum</span>` : ''}
          </div>
          <div>
            <span style="color:var(--muted);font-size:0.78rem">Profit PJ (total)</span><br>
            <b style="color:var(--green);font-size:1rem">${currency(kloterPPJSudah + kloterPPJBelum)}</b>
            <br><span style="font-size:0.75rem;color:var(--green)">${currency(kloterPPJSudah)} sudah</span>
            ${kloterPPJBelum > 0 ? ` <span style="font-size:0.75rem;color:#059669">+ ${currency(kloterPPJBelum)} belum</span>` : ''}
          </div>
          <div>
            <span style="color:var(--muted);font-size:0.78rem">Outstanding</span><br>
            <b style="color:var(--accent);font-size:1rem">${currency(totalOutstanding)}</b>
          </div>
        </div>
      </div>`;

    html += `</div></div>`;
  });

  container.innerHTML = html;

  // Accordion behavior
  container.querySelectorAll('.kloter-header').forEach(header => {
    header.addEventListener('click', () => {
      const idx = header.dataset.idx;
      const body = container.querySelector(`.kloter-body[data-idx="${idx}"]`);
      body.classList.toggle('open');
      header.classList.toggle('open');
    });
  });

  // Nasabah detail expand
  container.querySelectorAll('.nasabah-row.clickable').forEach(row => {
    row.addEventListener('click', () => {
      const detail = row.nextElementSibling;
      if (detail && detail.classList.contains('installment-detail')) {
        detail.classList.toggle('open');
      }
    });
  });
}


/* ── Nasabah List Renderer ──────────────────────────────── */

function renderNasabahList(list, isSettledView) {
  const PAID = PAID_STATUSES;

  let html;
  if (isSettledView) {
    html = `<div class="nasabah-header">
      <span>Nama</span><span style="text-align:right">Total Angsuran</span><span style="text-align:right">Transfer Inggi</span><span style="text-align:right">Profit PJ</span><span style="text-align:right">Status</span>
    </div>`;
  } else {
    html = `<div class="nasabah-header nasabah-header-obligation">
      <span>Nama</span><span style="text-align:right">Tagihan Bulan Ini</span><span style="text-align:right">Transfer Inggi</span><span style="text-align:right">Profit PJ</span><span style="text-align:right">Jatuh Tempo</span><span style="text-align:right">Sisa Total</span>
    </div>`;
  }

  html += list.map(n => {
    const hasInstallments = n.installments && n.installments.length > 0;
    const actualTI = n.total_transfer_inggi || 0;
    const actualPPJ = n.total_profit_pj || 0;

    // Installment detail (expandable)
    let instHtml = '';
    if (hasInstallments) {
      const nextTI = n.next_transfer_inggi || 0;
      const nextPPJ = n.next_profit_pj || 0;
      instHtml = `<div class="installment-detail">
        <div class="inst-row inst-header">
          <span>Periode</span><span>Jatuh Tempo</span><span>Jumlah Bayar</span><span>Transfer Inggi</span><span>Profit PJ</span><span>Status</span>
        </div>
        ${n.installments.map(inst => {
          const isPaid = PAID.has(inst.status);
          const profitPJ = isPaid ? (inst.profit_pj || 0) + (inst.denda_pj || 0) : 0;
          const isUnpaid = !isPaid;
          return `
          <div class="inst-row${isUnpaid ? ' unpaid-row' : ''}">
            <span>${inst.month_label.replace('ANGSURAN ','')}</span>
            <span data-label="Jatuh Tempo">${inst.jatuh_tempo || '—'}</span>
            <span data-label="Bayar">${inst.jumlah_bayar ? currency(inst.jumlah_bayar) : '—'}</span>
            <span data-label="TI" style="color:${isPaid ? 'var(--blue)' : '#7c3aed'};${isUnpaid ? 'font-style:italic;opacity:0.8' : ''}">${isPaid ? currency(inst.transfer_inggi) : (nextTI > 0 ? '~' + currency(nextTI) : '—')}</span>
            <span data-label="PPJ" style="color:${isPaid ? 'var(--green)' : '#059669'};${isUnpaid ? 'font-style:italic;opacity:0.8' : ''}">${isPaid && profitPJ > 0 ? currency(profitPJ) : (nextPPJ > 0 ? '~' + currency(nextPPJ) : '—')}</span>
            <span data-label="Status">${instStatusPill(inst.status)}</span>
          </div>`;
        }).join('')}
        <div class="inst-row" style="border-top:1px solid var(--border);padding-top:6px;font-weight:600">
          <span>Total</span>
          <span></span>
          <span>${currency(n.total_paid)}${n.total_remaining > 0 ? `<br><span style="color:var(--accent);font-size:0.75rem;font-weight:400">sisa ${currency(n.total_remaining)}</span>` : ''}</span>
          <span style="color:var(--blue)">${currency(actualTI)}</span>
          <span style="color:var(--green)">${currency(actualPPJ)}</span>
          <span></span>
        </div>
      </div>`;
    }

    // Row based on view mode
    if (isSettledView) {
      return `
        <div class="nasabah-row nasabah-row-settled ${hasInstallments ? 'clickable' : ''}">
          <span class="nama">${n.nama}</span>
          <span class="amount" data-label="Total Angsuran">${currency(n.total_angsuran)}</span>
          <span class="amount" data-label="Transfer Inggi" style="color:var(--blue)">${currency(actualTI)}</span>
          <span class="amount" data-label="Profit PJ" style="color:var(--green)">${currency(actualPPJ)}</span>
          <span class="status-col" data-label="Status">${statusPill(n.overall_status)}</span>
        </div>
        ${instHtml}`;
    } else {
      const nextAng = n.next_angsuran || 0;
      const nextTI = n.next_transfer_inggi || 0;
      const nextPPJ = n.next_profit_pj || 0;
      const jt = n.next_jatuh_tempo || '—';
      const today = new Date().toISOString().slice(0, 10);
      const isOverdue = jt !== '—' && jt < today;
      return `
        <div class="nasabah-row nasabah-row-obligation ${hasInstallments ? 'clickable' : ''}">
          <span class="nama">${n.nama}</span>
          <span class="amount" data-label="Tagihan" style="font-weight:600;color:var(--accent)">${currency(nextAng)}</span>
          <span class="amount" data-label="TI" style="color:var(--blue)">${currency(nextTI)}</span>
          <span class="amount" data-label="PPJ" style="color:var(--green)">${currency(nextPPJ)}</span>
          <span class="amount${isOverdue ? ' overdue' : ''}" data-label="Jatuh Tempo">${jt !== '—' ? jt.slice(5) : '—'}</span>
          <span class="amount" data-label="Sisa" style="color:var(--muted);font-size:0.82rem">${n.total_remaining > 0 ? currency(n.total_remaining) : '—'}</span>
        </div>
        ${instHtml}`;
    }
  }).join('');
  return html;
}


/* ── Status Pills ───────────────────────────────────────── */

function statusPill(status) {
  const map = {
    'settled': ['Lunas', 'pill-settled'],
    'partial': ['Sebagian', 'pill-partial'],
    'remaining': ['Belum', 'pill-remaining'],
    'macet': ['Macet', 'pill-macet'],
  };
  const [label, cls] = map[status] || ['?', ''];
  return `<span class="pill ${cls}">${label}</span>`;
}

function instStatusPill(status) {
  if (status.includes('Lunas')) return `<span class="pill pill-settled">${status}</span>`;
  if (status.includes('Terlambat')) return `<span class="pill pill-settled" style="opacity:0.8">${status}</span>`;
  if (status.includes('Kurang')) return `<span class="pill pill-partial">${status}</span>`;
  return `<span class="pill pill-remaining">${status}</span>`;
}


/* ── Macet Section ──────────────────────────────────────── */

function renderMacet() {
  const filters = getFilters();
  let macet = DATA.macet;
  if (filters.pj !== 'all') macet = macet.filter(m => m.pj === filters.pj);
  if (macet.length === 0) { document.getElementById('macetSection').innerHTML = ''; return; }

  const total = macet.reduce((s, m) => s + m.angsuran, 0);
  document.getElementById('macetSection').innerHTML = `
    <div class="macet-card">
      <h5>⚫ Nasabah Macet (${macet.length}) — Total: ${currency(total)}</h5>
      ${macet.map(m => `
        <div class="macet-row">
          <span>${m.nama}</span>
          <span>PJ: ${m.pj}</span>
          <span>${currency(m.angsuran)}</span>
          ${m.kloter ? `<span>Kloter ${m.kloter}</span>` : ''}
        </div>`).join('')}
    </div>`;
}


/* ── Boot ───────────────────────────────────────────────── */

document.addEventListener('DOMContentLoaded', loadData);
