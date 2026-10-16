// ===== 首页逻辑：真实数据聚合 + 模块入口 + 趋势图 + 最新动态 =====
// 数据层沿用全站约定：localStorage 键名与各模块保持一致（只读，不写入）
(function () {
  'use strict';

  // localStorage 安全读取（与各模块约定一致）
  function loadJSON(key, fallback) {
    try {
      const v = JSON.parse(localStorage.getItem(key));
      return v == null ? fallback : v;
    } catch (e) {
      return fallback;
    }
  }

  // XSS 防护：动态文案统一转义
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  // 时间戳 → YYYY-MM-DD（矿山动态用）
  function fmtDate(ts) {
    if (!ts) return '';
    const d = new Date(Number(ts));
    if (isNaN(d.getTime())) return '';
    return d.getFullYear() + '-' +
      String(d.getMonth() + 1).padStart(2, '0') + '-' +
      String(d.getDate()).padStart(2, '0');
  }

  // ===== 问候条 =====
  function renderGreet() {
    const h = new Date().getHours();
    const title =
      h < 6 ? '凌晨好' :
      h < 9 ? '早上好' :
      h < 12 ? '上午好' :
      h < 14 ? '中午好' :
      h < 18 ? '下午好' : '晚上好';
    document.getElementById('greetTitle').textContent = title + '，欢迎回来';

    const now = new Date();
    const weeks = ['日', '一', '二', '三', '四', '五', '六'];
    document.getElementById('greetDate').textContent =
      now.getFullYear() + '年' + (now.getMonth() + 1) + '月' + now.getDate() + '日' +
      ' 星期' + weeks[now.getDay()];
  }

  // ===== 数字滚动动画（沿用全站规范：800ms 三次方缓出 + 千分位）=====
  function animateValue(el, target, format) {
    const duration = 800;
    const start = performance.now();
    function frame(now) {
      const p = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      el.textContent = format(Math.round(target * eased));
      if (p < 1) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  const wan = v => v.toLocaleString('zh-CN');   // 千分位整数

  // ===== KPI 聚合（口径与各模块台账统计卡保持一致）=====
  function renderKpis(contracts, mines, voyages) {
    // 合同总金额：全部合同金额合计（与合同台账合计口径一致）
    const totalAmount = contracts.reduce((s, c) => s + (Number(c.amount) || 0), 0);
    const executing = contracts.filter(c => c.status === '履行中').length;

    // 矿山：在用 / 总数
    const minesActive = mines.filter(m => m.status === 'active').length;

    // 航次：在途（装船中 + 在途）/ 总数
    const sailing = voyages.filter(v => v.status === 'loading' || v.status === 'sailing').length;

    const cards = [
      {
        id: 'kpiAmount',
        target: Math.round(totalAmount / 10000),
        format: v => '¥' + wan(v),
        unit: '万',
        note: '履行中 ' + executing + ' 份 / 共 ' + contracts.length + ' 份'
      },
      {
        id: 'kpiContracts',
        target: contracts.length,
        format: wan,
        unit: '份',
        note: '已完成 ' + contracts.filter(c => c.status === '已完成').length + ' 份'
      },
      {
        id: 'kpiMines',
        target: minesActive,
        format: wan,
        unit: '座',
        note: '共 ' + mines.length + ' 座矿山'
      },
      {
        id: 'kpiVoyages',
        target: sailing,
        format: wan,
        unit: '个',
        note: '共 ' + voyages.length + ' 个航次'
      }
    ];

    cards.forEach(c => {
      const el = document.getElementById(c.id);
      if (!el) return;
      const note = document.getElementById(c.id + 'Note');
      if (note) note.textContent = c.note;
      if (c.target > 0) {
        animateValue(el, c.target, c.format);
      } else {
        el.textContent = c.format(0);
      }
      const unit = document.getElementById(c.id + 'Unit');
      if (unit) unit.textContent = c.unit;
    });
  }

  // ===== 业务模块入口（已上线模块直达功能页，其余进入门户页）=====
  const MODULES = [
    { name: '矿山管理', desc: '四大矿山档案与产能台账', href: '/mine/mine.html', live: true, tone: 'blue',
      path: 'M3 20L10 6l4 7 3-4 4 11z' },
    { name: '海运管理', desc: '航次台账与在途跟踪', href: '/ocean/ocean.html', live: true, tone: 'green',
      path: 'M4 13h16l-2 5H6z M8 13V8h8v5 M12 8V4 M2 21c1.5-1.2 3-1.2 4.5 0s3 1.2 4.5 0 3-1.2 4.5 0 3 1.2 4.5 0' },
    { name: '港口管理', desc: '装卸港口与作业台账', href: '/port/port.html', live: false, tone: 'orange',
      path: 'M5 21V5h11 M5 9h8 M16 5l5 4v3 M19 12v4 M19 16a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z' },
    { name: '铁路供应商管理', desc: '铁路运力与供应商档案', href: '/railway/railway.html', live: false, tone: 'purple',
      path: 'M5 3h14v11H5z M5 9h14 M9 14l-3 6 M15 14l3 6 M9 11.5h.01 M15 11.5h.01' },
    { name: '中转站点管理', desc: '中转站点与库存衔接', href: '/transfer/transfer.html', live: false, tone: 'blue',
      path: 'M6 6a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z M18 6a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z M12 20.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z M8.2 7.4l2.8 8.2 M15.8 7.4L13 15.6 M8.5 6h7' },
    { name: '仓储管理', desc: '仓库库存与出入库台账', href: '/warehouse/warehouse.html', live: false, tone: 'green',
      path: 'M3 21V9l9-6 9 6v12 M7 21v-6h10v6 M7 18h10 M3 21h18' },
    { name: '汽运车队', desc: '车队运力与调度台账', href: '/fleet/fleet.html', live: false, tone: 'orange',
      path: 'M2 6h12v11H2z M14 10h4l3 3.5V17h-7 M6.5 18.5a1.8 1.8 0 1 0 0-.01 M17 18.5a1.8 1.8 0 1 0 0-.01' },
    { name: '钢厂管理', desc: '钢厂客户与采购计划', href: '/steel/steel.html', live: false, tone: 'purple',
      path: 'M3 21V10l6 4v-4l6 4V6h6v15z M7 21v-3 M12 21v-3 M17 21v-3' }
  ];

  function renderModules() {
    const grid = document.getElementById('moduleGrid');
    if (!grid) return;
    grid.innerHTML = MODULES.map(m =>
      '<a class="module-card" href="' + esc(m.href) + '" title="' + esc(m.name) + '">' +
        '<span class="module-icon ' + m.tone + '">' +
          '<svg viewBox="0 0 24 24"><path d="' + m.path + '"/></svg>' +
        '</span>' +
        '<span class="module-info">' +
          '<span class="module-name">' + esc(m.name) + '</span>' +
          '<span class="module-desc">' + esc(m.desc) + '</span>' +
        '</span>' +
        '<span class="module-flag ' + (m.live ? 'live">已上线' : 'build">建设中') + '</span>' +
      '</a>'
    ).join('');
  }

  // ===== 合同金额趋势（近 6 个月，按 signDate 月份聚合，零依赖 SVG）=====
  function renderTrend(contracts) {
    const wrap = document.getElementById('trendChart');
    if (!wrap) return;

    // 近 6 个月键（YYYY-MM）
    const now = new Date();
    const months = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push(d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'));
    }
    const sums = months.map(m => ({ m, total: 0 }));
    contracts.forEach(c => {
      const k = String(c.signDate || '').slice(0, 7);
      const hit = sums.find(s => s.m === k);
      if (hit) hit.total += Number(c.amount) || 0;
    });

    const max = Math.max.apply(null, sums.map(s => s.total));
    if (max <= 0) {
      wrap.innerHTML = '<div class="trend-empty">近 6 个月暂无新签合同数据</div>';
      return;
    }

    // 画布：720 × 240，底部留月份标签区
    const W = 720, H = 240, base = 196, top = 24;
    const innerL = 16, innerR = 16;
    const slot = (W - innerL - innerR) / sums.length;
    const barW = 40;

    let svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="近 6 个月合同金额趋势">';
    // 横向网格线（3 条）
    [0.25, 0.5, 0.75].forEach(r => {
      const y = base - (base - top) * r;
      svg += '<line x1="' + innerL + '" y1="' + y + '" x2="' + (W - innerR) + '" y2="' + y +
        '" stroke="#F2F3F5" stroke-width="1"/>';
    });
    // 基线
    svg += '<line x1="' + innerL + '" y1="' + base + '" x2="' + (W - innerR) + '" y2="' + base +
      '" stroke="#E5E6EB" stroke-width="1"/>';

    sums.forEach((s, i) => {
      const cx = innerL + slot * i + slot / 2;
      const h = Math.max((s.total / max) * (base - top), 4);   // 有数据的最小可见高度
      const y = base - h;
      const valWan = (s.total / 10000).toFixed(1).replace(/\.0$/, '');
      svg += '<rect class="trend-bar" x="' + (cx - barW / 2) + '" y="' + y +
        '" width="' + barW + '" height="' + h + '" rx="4"><title>' +
        esc(s.m + '：¥' + valWan + ' 万') + '</title></rect>';
      // 数值标签
      svg += '<text x="' + cx + '" y="' + (y - 8) + '" text-anchor="middle" font-size="12" fill="#4E5969">' +
        esc(valWan) + '</text>';
      // 月份标签
      svg += '<text x="' + cx + '" y="' + (base + 22) + '" text-anchor="middle" font-size="12" fill="#86909C">' +
        esc(Number(s.m.slice(5)) + '月') + '</text>';
    });
    svg += '</svg>';
    wrap.innerHTML = svg;
  }

  // ===== 最新动态（合同 / 矿山 / 航次 最近记录合并倒序，不追踪删除事件）=====
  function renderActivity(contracts, mines, voyages) {
    const list = document.getElementById('activityList');
    if (!list) return;

    const items = [];
    contracts.forEach(c => {
      if (!c.signDate) return;
      items.push({ time: c.signDate, tone: 'blue', text: '签订合同「' + (c.name || c.code) + '」' });
    });
    mines.forEach(m => {
      const t = fmtDate(m.created_at);
      if (!t) return;
      items.push({ time: t, tone: 'green', text: '录入矿山「' + (m.short_name || m.mine_name) + '」' });
    });
    voyages.forEach(v => {
      if (!v.sail_date) return;
      items.push({
        time: v.sail_date, tone: 'orange',
        text: '「' + v.vessel_name + '」离港 ' + v.load_port + ' → ' + v.discharge_port
      });
    });

    // 时间均为 YYYY-MM-DD，字符串倒序即可
    items.sort((a, b) => b.time.localeCompare(a.time));

    if (!items.length) {
      list.innerHTML = '<li class="activity-empty">暂无动态数据</li>';
      return;
    }

    list.innerHTML = items.slice(0, 8).map(it =>
      '<li class="activity-item">' +
        '<span class="activity-dot ' + it.tone + '"></span>' +
        '<span class="activity-text">' + esc(it.text) + '</span>' +
        '<span class="activity-time">' + esc(it.time.slice(5)) + '</span>' +
      '</li>'
    ).join('');
  }

  // ===== KPI 卡点击进入对应模块 =====
  function bindKpiNav() {
    const map = { kpiAmount: '/contracts/contracts.html', kpiContracts: '/contracts/contracts.html',
      kpiMines: '/mine/mine.html', kpiVoyages: '/ocean/ocean.html' };
    Object.keys(map).forEach(id => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('click', () => { location.href = map[id]; });
    });
  }

  // ===== 初始化 =====
  function init() {
    renderGreet();

    // 数据层只读聚合；异常时按空数据处理，保证首页可渲染
    const contracts = loadJSON('hz_contracts', []);
    const mines = loadJSON('hz_mines', []);
    const voyages = loadJSON('hz_ocean_voyages', []);
    const arr = x => Array.isArray(x) ? x : [];

    renderKpis(arr(contracts), arr(mines), arr(voyages));
    renderModules();
    renderTrend(arr(contracts));
    renderActivity(arr(contracts), arr(mines), arr(voyages));
    bindKpiNav();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
