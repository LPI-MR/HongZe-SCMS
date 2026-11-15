// ===== warehouse / io 模块脚本（进销存台账子模块）=====
// 公共导航栏由 /common/fetch.js 加载；数据持久化到 PostgreSQL：
// 读经 HZDB 内存缓存（/api/bootstrap），写经 PUT /api/io-records 等全量替换
(function () {
  'use strict';

  // 本页对应的导航路径（与 navbar.html 中 data-path 一致）
  const NAV_PATH = '仓储管理 / 进销存台账';

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

  // 垛位库存写回格式：万吨保留 3 位小数（吨取整），保证小批量出入库不丢精度
  function fmtStackTon(t) {
    if (!isFinite(t)) t = 0;
    if (t >= 1000) {
      const w = Math.round(Math.round(t) / 10) / 1000;
      return (w % 1 ? String(w) : w.toFixed(0)) + '万吨';
    }
    return Math.max(0, Math.round(t)) + '吨';
  }

  function supplierName(id) {
    const s = suppliers.find(x => x.id === id);
    return s ? s.name : '未知仓库';
  }

  // 某仓库某品类剩余库存（吨）
  function oreStock(sup, ore) {
    return (sup.stacks || []).reduce((sum, t) => {
      if ((t.ore || '').trim() !== ore) return sum;
      const v = parseTon(t.tonnage);
      return isFinite(v) ? sum + v : sum;
    }, 0);
  }

  // 出入库联动垛位库存：入库并入首个同名品类垛位（无则新建垛位）；出库按垛顺序扣减。
  // 出库库存不足时返回 false（不改动任何数据）
  function applyIoToStacks(sup, ore, tons, type) {
    sup.stacks = Array.isArray(sup.stacks) ? sup.stacks : [];
    const matches = sup.stacks.filter(t => (t.ore || '').trim() === ore);
    if (type === 'in') {
      if (matches.length) {
        const t0 = matches[0];
        t0.tonnage = fmtStackTon((parseTon(t0.tonnage) || 0) + tons);
      } else {
        sup.stacks.push({ name: (sup.stacks.length + 1) + '号垛', ore, tonnage: fmtStackTon(tons), note: '' });
      }
      return true;
    }
    const have = matches.reduce((sum, t) => {
      const v = parseTon(t.tonnage);
      return isFinite(v) ? sum + v : sum;
    }, 0);
    if (have < tons) return false;
    let need = tons;
    matches.forEach(t => {
      if (need <= 0) return;
      const v = isFinite(parseTon(t.tonnage)) ? parseTon(t.tonnage) : 0;
      const cut = Math.min(v, need);
      t.tonnage = fmtStackTon(v - cut);
      need -= cut;
    });
    return true;
  }

  /* ==================== 进销存台账（入库 / 出库 / 每日盘点） ==================== */

  // 出入库流水：boot 时从数据库装载
  let ioRecords = [];

  /* ---- 矿石品名库（品类联想输入） ---- */

  // 品名库：boot 时从数据库装载（/api/ore-catalog，本页只读联想用）
  let oreCatalog = [];

  /* ---- 报关台账（只读：保税仓库出库校验用） ---- */

  // 报关记录（与保税报关子模块共享数据表，本页只读）：boot 时从数据库装载
  let cdRecords = [];

  // 保税仓库分品类报关台账：avail 已报关未出库（= 可出库）
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

  // 指定日期的出入库汇总
  function ioSummary(date) {
    const recs = ioRecords.filter(r => r.date === date);
    const sum = type => recs.filter(r => r.type === type)
      .reduce((s, r) => s + (Number(r.tons) || 0), 0);
    return { recs, inTons: sum('in'), outTons: sum('out') };
  }

  // 时:分（流水显示用）
  function fmtHM(ts) {
    const d = new Date(ts);
    if (isNaN(d.getTime())) return '';
    const p = n => String(n).padStart(2, '0');
    return p(d.getHours()) + ':' + p(d.getMinutes());
  }

  // 渲染进销存台账（当日 KPI + 分品类盘点表 + 提货钢厂汇总 + 流水明细），日期选择器联动
  function renderIo() {
    const dateInput = document.getElementById('io-date');
    if (!dateInput) return;
    if (!dateInput.value) dateInput.value = todayStr();
    const date = dateInput.value;
    const { recs, inTons, outTons } = ioSummary(date);

    const totalStock = suppliers.reduce((sum, s) => sum + (s.stacks || []).reduce((s2, t) => {
      const v = parseTon(t.tonnage);
      return isFinite(v) ? s2 + v : s2;
    }, 0), 0);

    document.getElementById('io-summary').innerHTML = `
      <div class="io-kpi"><div class="io-kpi-num">${fmtTon(totalStock)}</div><div class="io-kpi-label">当前剩余库存</div></div>
      <div class="io-kpi"><div class="io-kpi-num in">+${fmtTon(inTons)}</div><div class="io-kpi-label">${esc(date)} 入库合计</div></div>
      <div class="io-kpi"><div class="io-kpi-num out">-${fmtTon(outTons)}</div><div class="io-kpi-label">${esc(date)} 出库合计</div></div>
      <div class="io-kpi"><div class="io-kpi-num">${recs.length}</div><div class="io-kpi-label">当日流水笔数</div></div>`;

    // 当日分品类汇总
    const byOre = {};
    recs.forEach(r => {
      const o = (r.ore || '').trim() || '未分类';
      byOre[o] = byOre[o] || { in: 0, out: 0 };
      const v = Number(r.tons) || 0;
      if (r.type === 'in') byOre[o].in += v; else byOre[o].out += v;
    });
    const ores = Object.keys(byOre)
      .sort((a, b) => (byOre[b].in + byOre[b].out) - (byOre[a].in + byOre[a].out));

    document.getElementById('io-table').innerHTML = `
      <thead><tr><th>品类</th><th>入库</th><th>出库</th></tr></thead>
      <tbody>
        ${ores.length ? ores.map(o => `
          <tr>
            <td class="st-name">${esc(o)}</td>
            <td class="num ${byOre[o].in ? 'in' : ''}">${byOre[o].in ? fmtTon(byOre[o].in) : '—'}</td>
            <td class="num ${byOre[o].out ? 'out' : ''}">${byOre[o].out ? fmtTon(byOre[o].out) : '—'}</td>
          </tr>`).join('') + `
          <tr class="io-total">
            <td>合计</td>
            <td class="num in">${fmtTon(inTons)}</td>
            <td class="num out">${fmtTon(outTons)}</td>
          </tr>`
        : '<tr><td colspan="3" class="io-empty">该日暂无出入库记录</td></tr>'}
      </tbody>`;

    // 当日提货钢厂汇总：哪家钢厂提了多少、什么产品、什么时间、从哪个仓库提的
    const bySteel = {};
    recs.filter(r => r.type === 'out').forEach(r => {
      const k = (r.steel || '').trim() || '未填写钢厂';
      bySteel[k] = bySteel[k] || { total: 0, items: [] };
      const v = Number(r.tons) || 0;
      bySteel[k].total += v;
      bySteel[k].items.push({ ore: r.ore, tons: v, sup: supplierName(r.supId), hm: r.createdAt ? fmtHM(r.createdAt) : '' });
    });
    const steels = Object.keys(bySteel).sort((a, b) => bySteel[b].total - bySteel[a].total);
    document.getElementById('io-steel-table').innerHTML = `
      <thead><tr><th>提货钢厂</th><th>提货合计</th><th>提货明细（品类 · 数量 · 时间）</th></tr></thead>
      <tbody>
        ${steels.length ? steels.map(k => `
        <tr>
          <td class="st-name">${esc(k)}</td>
          <td class="num out">${fmtTon(bySteel[k].total)}</td>
          <td class="steel-items">${bySteel[k].items.map(i => `<span class="steel-item">${esc(i.ore)} <b>${fmtTon(i.tons)}</b>${i.sup ? ' · ' + esc(i.sup) : ''}${i.hm ? ' · ' + i.hm : ''}</span>`).join('')}</td>
        </tr>`).join('')
        : '<tr><td colspan="3" class="io-empty">当日暂无钢厂提货出库记录</td></tr>'}
      </tbody>`;

    // 当日流水明细（含关联订单号 / 提货钢厂 / 时间）
    document.getElementById('io-records').innerHTML = recs.length
      ? recs.slice().sort((a, b) => b.createdAt - a.createdAt).map(r => `
        <div class="io-rec ${r.type}">
          <span class="io-rec-type">${r.type === 'in' ? '入' : '出'}</span>
          <span class="io-rec-ore">${esc(r.ore)}</span>
          <span class="io-rec-ton">${r.type === 'in' ? '+' : '-'}${fmtTon(Number(r.tons) || 0)}</span>
          <span class="io-rec-sup">${esc(supplierName(r.supId))}</span>
          <span class="io-rec-note">${[r.createdAt ? fmtHM(r.createdAt) : '', r.order ? '单 ' + r.order : '', r.steel ? '提 ' + r.steel : '', r.note || ''].filter(Boolean).map(s => esc(s)).join(' · ')}</span>
        </div>`).join('')
      : '<div class="stock-empty">当日暂无流水记录</div>';
  }

  /* ---- 入库 / 出库登记弹窗 ---- */

  const modalMask = document.getElementById('modal-mask');
  const ioModal = document.getElementById('io-modal');
  const ioForm = document.getElementById('io-form');
  let ioType = 'in';

  function openIoModal(type, prefill) {
    closeDetail();
    ioType = type === 'out' ? 'out' : 'in';
    // 提货钢厂仅出库时显示
    document.getElementById('io-steel-item').style.display = ioType === 'out' ? '' : 'none';
    document.getElementById('io-title').textContent = ioType === 'in' ? '入库登记' : '出库登记';
    document.getElementById('io-submit').textContent = ioType === 'in' ? '确认入库' : '确认出库';

    // 仓库选项
    document.getElementById('io-sup').innerHTML = suppliers.map(s =>
      `<option value="${esc(s.id)}">${esc(s.name)}</option>`).join('');

    // 品类候选：品名库 + 全部仓库在库品类
    const oreSet = oreCatalog.slice();
    suppliers.forEach(s => (s.stacks || []).forEach(t => {
      const o = (t.ore || '').trim();
      if (o && !oreSet.includes(o)) oreSet.push(o);
    }));
    document.getElementById('io-ore-list').innerHTML =
      oreSet.map(o => `<option value="${esc(o)}"></option>`).join('');

    ioForm.reset();
    if (prefill && prefill.supId) document.getElementById('io-sup').value = prefill.supId;
    if (prefill && prefill.ore) document.getElementById('io-ore').value = prefill.ore;
    document.getElementById('io-date-in').value = todayStr();
    modalMask.hidden = false;
    ioModal.hidden = false;
    document.body.classList.add('drawer-open');
    updateIoHint();
    document.getElementById('io-ore').focus();
  }

  function closeIoModal() {
    ioModal.hidden = true;
    modalMask.hidden = true;
    document.body.classList.remove('drawer-open');
  }

  function closeDetail() {
    modalMask.hidden = true;
    ioModal.hidden = true;
    document.body.classList.remove('drawer-open');
  }

  // 品类 / 数量 / 仓库联动提示：出库时校验剩余库存；保税仓库出库只能从已报关出
  function updateIoHint() {
    const sup = suppliers.find(x => x.id === document.getElementById('io-sup').value);
    const ore = document.getElementById('io-ore').value.trim();
    const tons = Number(document.getElementById('io-ton').value);
    const hint = document.getElementById('io-hint');
    if (!sup || !ore) { hint.textContent = ''; return; }
    const stock = oreStock(sup, ore);
    const t = isFinite(tons) ? tons : 0;
    if (ioType === 'out' && sup.type === '保税物流') {
      const avail = cdAvail(sup, ore);
      hint.textContent = `「${ore}」保税货物：已报关未出库（可出库）${fmtTon(avail)}，未报关 ${fmtTon(Math.max(0, stock - avail))} 无法出库；本次出库 ${isFinite(tons) ? fmtTon(tons) : '—'} 后可出库余 ${fmtTon(Math.max(0, avail - t))}`;
      return;
    }
    hint.textContent = ioType === 'out'
      ? `「${ore}」当前库存 ${fmtTon(stock)}，出库 ${isFinite(tons) ? fmtTon(tons) : '—'} 后剩余 ${fmtTon(Math.max(0, stock - t))}`
      : `「${ore}」当前库存 ${fmtTon(stock)}，入库 ${isFinite(tons) ? fmtTon(tons) : '—'} 后共 ${fmtTon(stock + t)}`;
  }

  ['io-sup', 'io-ore', 'io-ton'].forEach(id => {
    document.getElementById(id).addEventListener('input', updateIoHint);
    document.getElementById(id).addEventListener('change', updateIoHint);
  });

  ioForm.addEventListener('submit', async e => {
    e.preventDefault();
    const sup = suppliers.find(x => x.id === document.getElementById('io-sup').value);
    const ore = document.getElementById('io-ore').value.trim();
    const tons = Number(document.getElementById('io-ton').value);
    const date = document.getElementById('io-date-in').value || todayStr();
    const order = (document.getElementById('io-order')?.value || '').trim();
    const steel = (document.getElementById('io-steel')?.value || '').trim();
    const note = document.getElementById('io-note').value.trim();

    if (!sup) { alert('请先在「供应商列表」子模块添加仓库'); return; }
    if (!ore) { document.getElementById('io-ore').focus(); return; }
    if (!isFinite(tons) || tons <= 0) { document.getElementById('io-ton').focus(); return; }

    // 保税仓库出库硬校验：只能出已报关未出库的量，未报关无法出库
    if (ioType === 'out' && sup.type === '保税物流') {
      const avail = cdAvail(sup, ore);
      if (tons > avail) {
        alert(`出库失败：「${ore}」为保税货物，已报关未出库仅 ${fmtTon(avail)}，未报关的 ${fmtTon(Math.max(0, oreStock(sup, ore) - avail))} 无法出库，请先登记报关`);
        return;
      }
    }

    // 回滚快照：流水与垛位库存分两次落库，任一失败则恢复内存现场，弹窗保留供重试
    const stacksSnapshot = JSON.stringify(sup.stacks || []);
    const ioCount = ioRecords.length;
    if (!applyIoToStacks(sup, ore, tons, ioType)) {
      alert(`出库失败：「${ore}」当前库存仅 ${fmtTon(oreStock(sup, ore))}，不足 ${fmtTon(tons)}`);
      return;
    }

    ioRecords.push({
      supId: sup.id, date, type: ioType, ore,
      tons: Math.round(tons * 10) / 10, order, steel, note, createdAt: Date.now()
    });
    if (!await HZDB.put('ioRecords', ioRecords) || !await HZDB.put('warehouses', suppliers)) {
      ioRecords.length = ioCount;
      sup.stacks = JSON.parse(stacksSnapshot);
      renderAll();
      return;
    }
    renderAll();
    closeIoModal();
  });

  // 工具栏：日期切换 / 录入 / 导出（箭头函数传参，避免事件对象误传）
  document.getElementById('io-date').addEventListener('change', renderIo);
  document.getElementById('io-add-in').addEventListener('click', () => openIoModal('in'));
  document.getElementById('io-add-out').addEventListener('click', () => openIoModal('out'));
  document.getElementById('io-close').addEventListener('click', closeIoModal);
  document.getElementById('io-cancel').addEventListener('click', closeIoModal);
  document.getElementById('io-export').addEventListener('click', () => exportIoCsv());

  modalMask.addEventListener('click', closeDetail);

  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    if (!ioModal.hidden) closeIoModal();
  });

  // 导出每日盘点表（CSV 带 BOM，Excel 打开不乱码）：分品类汇总 + 剩余库存 + 当日流水
  function exportIoCsv() {
    const date = document.getElementById('io-date').value || todayStr();
    const recs = ioRecords.filter(r => r.date === date).sort((a, b) => a.createdAt - b.createdAt);

    const rows = [['仓储每日盘点表'], ['盘点日期', date], []];
    rows.push(['品类', '入库(吨)', '出库(吨)']);
    const byOre = {};
    let tIn = 0, tOut = 0;
    recs.forEach(r => {
      const o = (r.ore || '').trim() || '未分类';
      byOre[o] = byOre[o] || { in: 0, out: 0 };
      const v = Number(r.tons) || 0;
      if (r.type === 'in') { byOre[o].in += v; tIn += v; } else { byOre[o].out += v; tOut += v; }
    });
    Object.keys(byOre).forEach(o => rows.push([o, byOre[o].in || '', byOre[o].out || '']));
    if (Object.keys(byOre).length) rows.push(['合计', tIn || '', tOut || '']);

    rows.push([]);
    rows.push(['当前剩余库存（仓库 × 品类）']);
    rows.push(['仓库', '品类', '剩余库存(吨)']);
    suppliers.forEach(s => {
      const m = {};
      (s.stacks || []).forEach(t => {
        const o = (t.ore || '').trim();
        if (!o) return;
        const v = parseTon(t.tonnage);
        if (isFinite(v)) m[o] = (m[o] || 0) + v;
      });
      Object.keys(m).forEach(o => rows.push([s.name, o, m[o]]));
    });

    rows.push([]);
    rows.push(['当日流水明细']);
    rows.push(['仓库', '类型', '品类', '数量(吨)', '关联订单号', '提货钢厂', '备注']);
    recs.forEach(r => rows.push([
      supplierName(r.supId), r.type === 'in' ? '入库' : '出库',
      r.ore, Number(r.tons) || 0, r.order || '', r.steel || '', r.note || ''
    ]));

    const csv = '\uFEFF' + rows.map(row =>
      row.map(v => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`).join(',')).join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `仓储盘点_${date}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  /* ==================== 渲染 & 跨页同步 ==================== */

  function renderAll() {
    renderIo();
  }

  /* ==================== 初始化 ==================== */

  async function boot() {
    await HZDB.ready();
    suppliers = HZDB.get('warehouses') || [];
    ioRecords = HZDB.get('ioRecords') || [];
    oreCatalog = HZDB.get('oreCatalog') || [];
    cdRecords = HZDB.get('customsRecords') || [];
    renderAll();
  }

  boot();
})();
