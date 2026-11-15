// ===== warehouse 模块脚本（仓储管理）=====
// 公共导航栏由 /common/fetch.js 加载；数据持久化到 PostgreSQL：
// 读经 HZDB 内存缓存（/api/bootstrap），写经 PUT /api/warehouses 等全量替换
(function () {
  'use strict';

  // 本页对应的导航路径（与 navbar.html 中 data-path 一致）
  const NAV_PATH = '仓储管理 / 库存管理';

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

  /* ==================== 数据层 ==================== */

  // 仓库主数据（供应商）：boot 时经 HZDB.ready() 从数据库装载
  let suppliers = [];

  /* ==================== 渲染 ==================== */

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

  // KPI：仓库总数 / 当前总库存 / 今日入库 / 今日出库（与进销存台账联动）
  function renderKpi() {
    const grid = document.getElementById('kpi-grid');
    if (!grid) return;
    const totalStock = suppliers.reduce((sum, s) => sum + (s.stacks || []).reduce((s2, t) => {
      const v = parseTon(t.tonnage);
      return isFinite(v) ? s2 + v : s2;
    }, 0), 0);
    const tRecs = ioRecords.filter(r => r.date === todayStr());
    const tin = tRecs.filter(r => r.type === 'in').reduce((a, r) => a + (Number(r.tons) || 0), 0);
    const tout = tRecs.filter(r => r.type === 'out').reduce((a, r) => a + (Number(r.tons) || 0), 0);

    const cards = [
      { label: '仓库总数', value: suppliers.length, cls: 'blue' },
      { label: '当前总库存', value: fmtTon(totalStock), cls: '' },
      { label: '今日入库', value: '+' + fmtTon(tin), cls: 'green' },
      { label: '今日出库', value: '-' + fmtTon(tout), cls: 'orange' }
    ];

    grid.innerHTML = cards.map(c => `
      <div class="kpi-card ${c.cls}">
        <div class="kpi-info">
          <div class="kpi-label">${esc(c.label)}</div>
          <div class="kpi-value">${c.value}</div>
        </div>
      </div>
    `).join('');
  }

  // 品类总计：跨仓库合计库存 + 可提货（非保税库存 + 保税已报关未出库）
  function renderTotal() {
    const table = document.getElementById('total-table');
    if (!table) return;
    const byOre = {};
    suppliers.forEach(s => {
      const bonded = s.type === '保税物流';
      const availMap = {};
      if (bonded) cdSummary(s).forEach(r => { availMap[r.ore] = r.avail; });
      (s.stacks || []).forEach(t => {
        const o = (t.ore || '').trim() || '未分类';
        const v = parseTon(t.tonnage);
        if (!isFinite(v)) return;
        if (!byOre[o]) byOre[o] = { stock: 0, avail: 0 };
        byOre[o].stock += v;
        // 可提货：非保税直接计库存；保税只计已报关未出库
        byOre[o].avail += bonded ? (availMap[o] || 0) : v;
      });
    });
    const rows = Object.keys(byOre).map(o => ({ ore: o, stock: byOre[o].stock, avail: byOre[o].avail }))
      .sort((a, b) => b.stock - a.stock);
    const tStock = rows.reduce((a, r) => a + r.stock, 0);
    const tAvail = rows.reduce((a, r) => a + r.avail, 0);
    table.innerHTML = `
      <thead><tr><th>品类</th><th>总库存（全仓库）</th><th>可提货</th></tr></thead>
      <tbody>
        ${rows.length ? rows.map(r => `
        <tr>
          <td class="st-name">${esc(r.ore)}</td>
          <td class="num">${fmtTon(r.stock)}</td>
          <td class="num ok">${r.avail ? fmtTon(r.avail) : '—'}</td>
        </tr>`).join('') : '<tr><td colspan="3" class="io-empty">暂无垛位库存数据</td></tr>'}
        <tr class="io-total">
          <td>总计</td>
          <td class="num">${fmtTon(tStock)}</td>
          <td class="num ok">${fmtTon(tAvail)}</td>
        </tr>
      </tbody>`;
  }

  function renderAll() {
    renderKpi();
    renderTotal();
    renderStock();
  }

  /* ==================== 仓库库存实时总览 ==================== */

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

  // 渲染库存看板：按仓库分组、按品类汇总垛位库存（编辑分垛保存后自动刷新）
  function renderStock() {
    const grid = document.getElementById('stock-grid');
    if (!grid) return;

    const cards = suppliers.map(s => {
      const byOre = {};
      let total = 0;
      (s.stacks || []).forEach(t => {
        const ore = (t.ore || '').trim() || '未分类';
        const v = parseTon(t.tonnage);
        if (isFinite(v)) {
          byOre[ore] = (byOre[ore] || 0) + v;
          total += v;
        } else if (!(ore in byOre)) {
          byOre[ore] = NaN;  // 有垛位但库存量缺失/无法识别的品类，仍展示
        }
      });

      const rows = Object.keys(byOre)
        .map(ore => ({ ore, v: byOre[ore] }))
        .sort((a, b) => (isFinite(b.v) ? b.v : -1) - (isFinite(a.v) ? a.v : -1));
      const maxV = rows.reduce((m, r) => Math.max(m, isFinite(r.v) ? r.v : 0), 0);

      // 该仓库当日出入库合计 + 分品类今日出入（进销存联动展示）
      const tRecs = ioRecords.filter(r => r.date === todayStr() && r.supId === s.id);
      const todayByOre = {};
      tRecs.forEach(r => {
        const o = (r.ore || '').trim() || '未分类';
        if (!todayByOre[o]) todayByOre[o] = { tin: 0, tout: 0 };
        if (r.type === 'in') todayByOre[o].tin += Number(r.tons) || 0;
        else todayByOre[o].tout += Number(r.tons) || 0;
      });
      const tin = tRecs.filter(r => r.type === 'in').reduce((a, r) => a + (Number(r.tons) || 0), 0);
      const tout = tRecs.filter(r => r.type === 'out').reduce((a, r) => a + (Number(r.tons) || 0), 0);

      // 保税仓库：只有已报关未出库的量可出库——品类行实时显示「可出库 / 未报关」
      const bonded = s.type === '保税物流';
      const availSum = bonded ? cdSummary(s).reduce((a, r) => a + r.avail, 0) : 0;

      const rowsHtml = rows.length ? rows.map(r => {
        const pct = isFinite(r.v) && maxV ? Math.round(r.v / maxV * 100) : 0;
        const t = todayByOre[r.ore] || { tin: 0, tout: 0 };
        const avail = bonded ? cdAvail(s, r.ore) : 0;
        const noOut = bonded && !avail;
        const availTxt = bonded
          ? ` · 可出库 <b class="avail${avail ? '' : ' zero'}">${fmtTon(avail)}</b> · 未报关 <b class="und">${fmtTon(Math.max(0, (isFinite(r.v) ? r.v : 0) - avail))}</b>`
          : '';
        return `
        <div class="ore-row">
          <span class="ore-name">${esc(r.ore)}</span>
          <span class="ore-bar"><i style="width:${pct}%"></i></span>
          <span class="ore-val ${isFinite(r.v) ? '' : 'empty'}">${fmtTon(r.v)}</span>
          <span class="ore-acts">
            <button type="button" class="ore-act in" data-sup="${esc(s.id)}" data-ore="${esc(r.ore)}" title="该品类入库">入</button>
            <button type="button" class="ore-act out${noOut ? ' off' : ''}" data-sup="${esc(s.id)}" data-ore="${esc(r.ore)}" title="${noOut ? '保税货物：无可出库量，请先报关' : '该品类出库'}">出</button>
          </span>
          <span class="ore-today${!t.tin && !t.tout && !bonded ? ' none' : ''}">今日入 <b class="tin">${fmtTon(t.tin)}</b> · 今日出 <b class="tout">${fmtTon(t.tout)}</b>${availTxt}</span>
        </div>`;
      }).join('') : '<div class="stock-empty">暂无垛位库存数据</div>';

      return `
      <div class="stock-card${bonded ? ' bonded' : ''}">
        <div class="stock-head">
          <div class="stock-name">${esc(s.name)}</div>
          <div class="stock-meta">
            ${s.scale ? `<span class="stock-scale">${esc(s.scale)}</span>` : ''}
            ${bonded ? `<span class="stock-avail">可出库 <b>${fmtTon(availSum)}</b></span>` : ''}
            <span class="stock-total">合计 <b>${fmtTon(total)}</b></span>
          </div>
        </div>
        <div class="ore-list">${rowsHtml}</div>
        <div class="stock-today"><span>今日入库 <b class="tin">${fmtTon(tin)}</b></span><span>今日出库 <b class="tout">${fmtTon(tout)}</b></span></div>
        <div class="stock-foot">
          <button type="button" class="stock-edit" data-id="${esc(s.id)}">调整库存</button>
        </div>
      </div>`;
    }).join('');

    grid.innerHTML = cards || '<div class="empty-state">暂无仓库数据，请先在「供应商列表」子模块中添加仓库</div>';
  }

  // 品类行「入 / 出」→ 预填仓库与品类直接登记；保税品类无可出库量时拦截出库；
  // 「调整库存」→ 跳转供应商子模块编辑
  document.getElementById('stock-grid').addEventListener('click', e => {
    const act = e.target.closest('.ore-act');
    if (act) {
      if (act.classList.contains('out') && act.classList.contains('off')) {
        alert(`「${act.getAttribute('data-ore')}」无可出库量（已报关未出库为 0），保税货物需先在「保税报关节点」登记报关`);
        return;
      }
      openIoModal(act.classList.contains('out') ? 'out' : 'in', {
        supId: act.getAttribute('data-sup'),
        ore: act.getAttribute('data-ore')
      });
      return;
    }
    const btn = e.target.closest('.stock-edit');
    if (!btn) return;
    // 分垛明细统一在「供应商列表」子模块维护：跳转并自动打开该仓库的编辑抽屉
    location.href = '/warehouse/suppliers.html?edit=' + encodeURIComponent(btn.getAttribute('data-id'));
  });

  /* ==================== 进销存台账（入库 / 出库 / 每日盘点） ==================== */

  // 出入库流水（与进销存台账子模块共享数据表）：boot 时从数据库装载
  let ioRecords = [];

  /* ---- 矿石品名库（品类联想输入 + 自定义维护） ---- */

  // 品名库：boot 时从数据库装载（/api/ore-catalog）
  let oreCatalog = [];

  function todayStr() { return fmtTime(Date.now()); }

  // 垛位库存写回格式：万吨保留 3 位小数（吨取整），保证小批量出入库不丢精度
  function fmtStackTon(t) {
    if (!isFinite(t)) t = 0;
    if (t >= 1000) {
      const w = Math.round(Math.round(t) / 10) / 1000;
      return (w % 1 ? String(w) : w.toFixed(0)) + '万吨';
    }
    return Math.max(0, Math.round(t)) + '吨';
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

  /* ---- 入库 / 出库登记弹窗 ---- */

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
    if (oreModal.hidden) {
      modalMask.hidden = true;
      document.body.classList.remove('drawer-open');
    }
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

  // 登记弹窗按钮（台账工具栏已迁移至「进销存台账」子模块 io.html）
  document.getElementById('io-close').addEventListener('click', closeIoModal);
  document.getElementById('io-cancel').addEventListener('click', closeIoModal);

  /* ---- 矿石品类管理弹窗 ---- */

  const oreModal = document.getElementById('ore-modal');

  function openOreModal() {
    closeIoModal();
    renderOreCatalog();
    modalMask.hidden = false;
    oreModal.hidden = false;
    document.body.classList.add('drawer-open');
    document.getElementById('ore-new').focus();
  }

  function closeOreModal() {
    oreModal.hidden = true;
    if (ioModal.hidden) {
      modalMask.hidden = true;
      document.body.classList.remove('drawer-open');
    }
  }

  // 品名列表：品名库（可删除）+ 垛位在用品类（标记「在库」，仅展示）
  function renderOreCatalog() {
    const box = document.getElementById('ore-catalog');
    if (!box) return;
    const stackOres = [];
    suppliers.forEach(s => (s.stacks || []).forEach(t => {
      const o = (t.ore || '').trim();
      if (o && !oreCatalog.includes(o) && !stackOres.includes(o)) stackOres.push(o);
    }));
    const item = (o, canDel) => `
      <div class="ore-item">
        <span class="ore-item-name">${esc(o)}</span>
        ${canDel
          ? `<button type="button" class="ore-item-del" data-ore="${esc(o)}" title="从品名库移除">✕</button>`
          : '<span class="ore-item-tag">在库</span>'}
      </div>`;
    const html = oreCatalog.map(o => item(o, true)).join('') + stackOres.map(o => item(o, false)).join('');
    box.innerHTML = html || '<div class="io-empty">暂无品名，先在上方添加</div>';
  }

  async function addOre() {
    const input = document.getElementById('ore-new');
    const name = input.value.trim();
    if (!name) { input.focus(); return; }
    if (!oreCatalog.includes(name)) {
      oreCatalog.push(name);
      renderOreCatalog();
      if (!await HZDB.put('oreCatalog', oreCatalog)) {
        oreCatalog.pop();        // 保存失败回滚
        renderOreCatalog();
      }
    }
    input.value = '';
    input.focus();
  }

  document.getElementById('ore-manage').addEventListener('click', () => openOreModal());
  document.getElementById('ore-close').addEventListener('click', closeOreModal);
  document.getElementById('ore-add').addEventListener('click', addOre);
  document.getElementById('ore-new').addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); addOre(); }
  });
  document.getElementById('ore-catalog').addEventListener('click', async e => {
    const del = e.target.closest('.ore-item-del');
    if (!del) return;
    const prev = oreCatalog.slice();
    oreCatalog = oreCatalog.filter(o => o !== del.getAttribute('data-ore'));
    renderOreCatalog();
    if (!await HZDB.put('oreCatalog', oreCatalog)) {
      oreCatalog = prev;         // 保存失败回滚
      renderOreCatalog();
    }
  });

  /* ==================== 保税报关节点（保税物流仓库专用） ==================== */

  // 报关记录（与保税报关子模块共享数据表，本页只读）：boot 时从数据库装载
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

  /* ---- 报关登记弹窗已迁移至「保税报关」子模块（customs.js） ---- */

  // 供应商新增 / 编辑抽屉已迁移至「供应商列表」子模块（suppliers.js）


  /* ==================== 弹窗遮罩（出入库 / 品类 / 报关弹窗共用） ==================== */

  const modalMask = document.getElementById('modal-mask');

  // 关闭全部弹窗（弹窗打开前调用，避免叠层）
  function closeDetail() {
    modalMask.hidden = true;
    ioModal.hidden = true;
    oreModal.hidden = true;
    document.body.classList.remove('drawer-open');
  }

  modalMask.addEventListener('click', closeDetail);

  // Esc 依次关闭出入库 / 品类 / 报关弹窗
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    if (!ioModal.hidden) closeIoModal();
    else if (!oreModal.hidden) closeOreModal();
  });

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
