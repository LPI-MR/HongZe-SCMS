// ===== warehouse / customs 模块脚本（保税报关节点子模块）=====
// 公共导航栏由 /common/fetch.js 加载；数据持久化到 PostgreSQL：
// 读经 HZDB 内存缓存（/api/bootstrap），写经 PUT /api/customs-records 全量替换
(function () {
  'use strict';

  // 本页对应的导航路径（与 navbar.html 中 data-path 一致）
  const NAV_PATH = '仓储管理 / 保税报关';

  // 设置导航栏选中态
  function setActiveNav() {
    const navbar = document.getElementById('navbar');
    if (!navbar) return;

    navbar.querySelectorAll('.active').forEach(el => el.classList.remove('active'));

    const item = navbar.querySelector(`[data-path="${NAV_PATH}"]`);
    if (item) {
      item.classList.add('active');
      const group = item.closest('.nav-group');
      if (group) group.classList.add('open');
    }
  }

  const navbar = document.getElementById('navbar');
  if (navbar && navbar.children.length) {
    setActiveNav();
  } else {
    document.addEventListener('navbar:loaded', setActiveNav, { once: true });
  }

  /* ==================== 数据层（仓库，与其他子模块共享 key） ==================== */

  // 仓库主数据（供应商）：boot 时经 HZDB.ready() 从数据库装载
  let suppliers = [];

  /* ==================== 工具函数 ==================== */

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function fmtTime(ts) {
    const d = new Date(ts);
    const p = n => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }

  function todayStr() { return fmtTime(Date.now()); }

  // 解析库存量文本 → 吨（支持 万吨 / 吨 / 公斤 / kg / t，纯数字视为吨）
  function parseTon(str) {
    if (str == null) return NaN;
    const m = String(str).replace(/,/g, '').match(/(-?[\d.]+)\s*(万吨|公斤|kg|吨|t)?/i);
    if (!m) return NaN;
    const n = parseFloat(m[1]);
    if (!isFinite(n)) return NaN;
    const u = (m[2] || '').toLowerCase();
    if (u === '万吨') return n * 10000;
    if (u === '公斤' || u === 'kg') return n / 1000;
    return n;
  }

  // 吨 → 展示文本（≥1千吨显示万吨，最多 2 位小数；否则显示吨）
  function fmtTon(t) {
    if (!isFinite(t)) return '—';
    if (t >= 1000) {
      const w = Math.round(t / 100) / 100;
      return (w % 1 ? String(w) : w.toFixed(0)) + '万吨';
    }
    return Math.round(t) + '吨';
  }

  /* ==================== 出入库流水（只读：报关出库核销） ==================== */

  // 出入库流水（与库存管理子模块共享数据表，本页只读）：boot 时从数据库装载
  let ioRecords = [];

  /* ==================== 保税报关节点（保税物流仓库专用） ==================== */

  const CD_THRESHOLD = 20000; // 单品类完成报关门槛（2万吨）

  // 报关记录（与库存管理子模块共享数据表）：boot 时从数据库装载
  let cdRecords = [];

  // 保税仓库分品类报关台账：
  // stock 在库 / declared 已报关累计 / exported 报关出库（出库只允许从已报关出）
  // avail 已报关未出库（= 可出库）/ undeclared 未报关在库（= 在库 - 可出库）
  function cdSummary(sup) {
    const stock = {};
    (sup.stacks || []).forEach(t => {
      const o = (t.ore || '').trim();
      if (!o) return;
      const v = parseTon(t.tonnage);
      if (isFinite(v)) stock[o] = (stock[o] || 0) + v;
    });
    const declared = {};
    cdRecords.forEach(r => {
      if (r.supId !== sup.id) return;
      const o = (r.ore || '').trim();
      if (!o) return;
      declared[o] = (declared[o] || 0) + (Number(r.tons) || 0);
    });
    const exported = {};
    ioRecords.forEach(r => {
      if (r.supId !== sup.id || r.type !== 'out') return;
      const o = (r.ore || '').trim();
      if (!o) return;
      exported[o] = (exported[o] || 0) + (Number(r.tons) || 0);
    });
    return Object.keys(Object.assign({}, stock, declared, exported)).map(o => {
      const s = stock[o] || 0;
      const d = declared[o] || 0;
      const avail = Math.max(0, d - (exported[o] || 0));   // 已报关未出库
      return {
        ore: o, stock: s, declared: d, exported: exported[o] || 0,
        avail, undeclared: Math.max(0, s - avail)
      };
    }).sort((a, b) => b.undeclared - a.undeclared);
  }

  // 某保税仓库某品类可出库量（已报关未出库）
  function cdAvail(sup, ore) {
    const row = cdSummary(sup).find(r => r.ore === ore);
    return row ? row.avail : 0;
  }

  // 报关流水：报关登记 + 该仓库出库（视为报关出库），最近 30 条
  function cdFlow(sup) {
    const recs = [];
    cdRecords.forEach(r => {
      if (r.supId !== sup.id) return;
      recs.push({ ts: r.createdAt, type: 'cd', ore: r.ore, tons: Number(r.tons) || 0, note: r.note, date: r.date });
    });
    ioRecords.forEach(r => {
      if (r.supId !== sup.id || r.type !== 'out') return;
      recs.push({ ts: r.createdAt, type: 'out', ore: r.ore, tons: Number(r.tons) || 0, note: r.note, date: r.date, steel: r.steel || '' });
    });
    return recs.sort((a, b) => b.ts - a.ts).slice(0, 30);
  }

  function renderCustoms() {
    const body = document.getElementById('customs-body');
    if (!body) return;
    const bonded = suppliers.filter(s => s.type === '保税物流');
    if (!bonded.length) {
      body.innerHTML = '<div class="empty-state">暂无保税物流仓库，报关节点用于保税货物分品类报关台账</div>';
      return;
    }
    body.innerHTML = bonded.map(s => {
      const rows = cdSummary(s);
      const sum = k => rows.reduce((a, r) => a + r[k], 0);
      const trs = rows.length ? rows.map(r => {
        const pct = Math.min(100, Math.round(r.undeclared / CD_THRESHOLD * 100));
        const badge = r.undeclared >= CD_THRESHOLD
          ? '<span class="cd-badge ok">可完成报关</span>'
          : r.undeclared > 0
            ? `<span class="cd-badge warn">未达门槛 · 差 ${fmtTon(CD_THRESHOLD - r.undeclared)}</span>`
            : r.avail > 0
              ? `<span class="cd-badge done">已报关待出库 ${fmtTon(r.avail)}</span>`
              : '<span class="cd-badge">已出清</span>';
        return `
        <tr>
          <td class="st-name">${esc(r.ore)}</td>
          <td class="num">${fmtTon(r.stock)}</td>
          <td class="num ok">${r.declared ? fmtTon(r.declared) : '—'}</td>
          <td class="num">${r.exported ? fmtTon(r.exported) : '—'}</td>
          <td class="num ok">${r.avail ? fmtTon(r.avail) : '—'}</td>
          <td class="cd-status">
            <div class="cd-progress-wrap"><div class="cd-progress${pct >= 100 ? ' full' : ''}"><i style="width:${pct}%"></i></div><span class="cd-progress-txt">${fmtTon(r.undeclared)} / ${fmtTon(CD_THRESHOLD)}</span></div>
            ${badge}
          </td>
          <td><button type="button" class="io-btn ghost cd-row-add" data-id="${esc(s.id)}" data-ore="${esc(r.ore)}">登记</button></td>
        </tr>`;
      }).join('') : '<tr><td colspan="7" class="io-empty">该仓库暂无垛位库存</td></tr>';

      // 报关流水：报关登记（报）+ 保税出库（出，自动核销已报关量）
      const flow = cdFlow(s);
      const flowHtml = flow.length
        ? flow.map(f => `
          <div class="io-rec">
            <span class="io-rec-type ${f.type}">${f.type === 'cd' ? '报' : '出'}</span>
            <span class="io-rec-ore">${esc(f.ore)}</span>
            <span class="io-rec-ton">${f.type === 'cd' ? '+' : '-'}${fmtTon(f.tons)}</span>
            <span class="io-rec-sup">${esc(f.date)} · ${f.type === 'cd' ? '报关登记' : '报关出库'}</span>
            <span class="io-rec-note">${[f.steel ? '提 ' + f.steel : '', f.note || ''].filter(Boolean).map(s => esc(s)).join(' · ')}</span>
          </div>`).join('')
        : '<div class="io-empty">暂无报关流水，登记报关或报关出库后自动生成</div>';

      return `
      <div class="cd-warehouse">
        <div class="cd-wh-head">
          <span class="cd-wh-name">${esc(s.name)}</span>
          <span class="cd-wh-kpis">
            <span>在库 <b>${fmtTon(sum('stock'))}</b></span>
            <span>已报关 <b class="ok">${fmtTon(sum('declared'))}</b></span>
            <span>可出库 <b class="ok">${fmtTon(sum('avail'))}</b></span>
            <span>未报关 <b class="warn">${fmtTon(sum('undeclared'))}</b></span>
          </span>
          <button type="button" class="io-btn in cd-add" data-id="${esc(s.id)}">＋ 报关登记</button>
        </div>
        <table class="stack-table cd-table">
          <thead><tr><th>品类</th><th>在库量</th><th>已报关</th><th>报关出库</th><th>可出库</th><th>未报关 / 2万吨门槛</th><th>操作</th></tr></thead>
          <tbody>${trs}</tbody>
        </table>
        <div class="io-sub-title">报关流水（登记 / 报关出库）</div>
        <div class="io-records">${flowHtml}</div>
      </div>`;
    }).join('');
  }

  /* ---- 报关登记弹窗 ---- */

  const modalMask = document.getElementById('modal-mask');
  const cdModal = document.getElementById('cd-modal');
  const cdForm = document.getElementById('cd-form');
  let cdSupId = null;

  function openCdModal(supId, ore) {
    closeDetail();
    cdSupId = supId;
    const sup = suppliers.find(x => x.id === supId);
    const ores = [];
    if (sup) {
      (sup.stacks || []).forEach(t => {
        const o = (t.ore || '').trim();
        if (o && !ores.includes(o)) ores.push(o);
      });
      cdRecords.forEach(r => {
        if (r.supId !== sup.id) return;
        const o = (r.ore || '').trim();
        if (o && !ores.includes(o)) ores.push(o);
      });
    }
    document.getElementById('cd-ore').innerHTML =
      ores.map(o => `<option value="${esc(o)}">${esc(o)}</option>`).join('');
    cdForm.reset();
    if (ore && ores.includes(ore)) document.getElementById('cd-ore').value = ore;
    document.getElementById('cd-date').value = todayStr();
    modalMask.hidden = false;
    cdModal.hidden = false;
    document.body.classList.add('drawer-open');
    updateCdHint();
  }

  function closeCdModal() {
    cdModal.hidden = true;
    modalMask.hidden = true;
    document.body.classList.remove('drawer-open');
  }

  function closeDetail() {
    modalMask.hidden = true;
    cdModal.hidden = true;
    document.body.classList.remove('drawer-open');
  }

  function cdUndeclared(sup, ore) {
    const row = cdSummary(sup).find(r => r.ore === ore);
    return row ? row.undeclared : 0;
  }

  function updateCdHint() {
    const sup = suppliers.find(x => x.id === cdSupId);
    const ore = document.getElementById('cd-ore').value;
    const hint = document.getElementById('cd-hint');
    if (!sup || !ore) { hint.textContent = ''; return; }
    const u = cdUndeclared(sup, ore);
    const t = Number(document.getElementById('cd-ton').value);
    const after = Math.max(0, u - (isFinite(t) ? t : 0));
    hint.textContent = `「${ore}」未报关 ${fmtTon(u)}${u >= CD_THRESHOLD ? '，已达 2万吨门槛' : `，未达 2万吨门槛（还差 ${fmtTon(CD_THRESHOLD - u)}）`}，本次登记后剩余未报关 ${fmtTon(after)}`;
  }

  cdForm.addEventListener('submit', async e => {
    e.preventDefault();
    const sup = suppliers.find(x => x.id === cdSupId);
    const ore = document.getElementById('cd-ore').value.trim();
    const tons = Number(document.getElementById('cd-ton').value);
    const date = document.getElementById('cd-date').value || todayStr();
    const note = document.getElementById('cd-note').value.trim();

    if (!sup) return;
    if (!ore) { document.getElementById('cd-ore').focus(); return; }
    if (!isFinite(tons) || tons <= 0) { document.getElementById('cd-ton').focus(); return; }
    const u = cdUndeclared(sup, ore);
    if (tons > u) {
      alert(`报关失败：「${ore}」未报关量仅 ${fmtTon(u)}，不能登记 ${fmtTon(tons)}`);
      return;
    }
    cdRecords.push({
      supId: sup.id, ore, tons: Math.round(tons * 10) / 10,
      date, note, createdAt: Date.now()
    });
    if (!await HZDB.put('customsRecords', cdRecords)) {
      cdRecords.pop();       // 保存失败回滚，弹窗保留供重试
      return;
    }
    renderAll();
    closeCdModal();
  });

  ['cd-ore', 'cd-ton'].forEach(id => {
    document.getElementById(id).addEventListener('input', updateCdHint);
    document.getElementById(id).addEventListener('change', updateCdHint);
  });

  document.getElementById('customs-body').addEventListener('click', e => {
    const row = e.target.closest('.cd-row-add');
    if (row) { openCdModal(row.getAttribute('data-id'), row.getAttribute('data-ore')); return; }
    const add = e.target.closest('.cd-add');
    if (add) openCdModal(add.getAttribute('data-id'));
  });

  document.getElementById('cd-close').addEventListener('click', closeCdModal);
  document.getElementById('cd-cancel').addEventListener('click', closeCdModal);

  modalMask.addEventListener('click', closeDetail);

  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    if (!cdModal.hidden) closeCdModal();
  });

  /* ==================== 渲染 & 跨页同步 ==================== */

  function renderAll() {
    renderCustoms();
  }

  /* ==================== 初始化 ==================== */

  async function boot() {
    await HZDB.ready();
    suppliers = HZDB.get('warehouses') || [];
    ioRecords = HZDB.get('ioRecords') || [];
    cdRecords = HZDB.get('customsRecords') || [];
    renderAll();
  }

  boot();
})();
