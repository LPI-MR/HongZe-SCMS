// ===== contracts 模块 · 数据看板脚本 =====
// 公共导航栏由 /common/fetch.js 加载；本脚本负责导航高亮与 KPI 统计
// KPI 数据实时汇总自合同台账（localStorage: hz_contracts）
(function () {
  'use strict';

  // 本页对应的导航位置：合同管理 → 数据看板
  const NAV_PATH = '合同管理';
  const NAV_SUB = NAV_PATH + ' / 数据看板';

  // 设置导航栏选中态：一级「合同管理」高亮并展开，二级「数据看板」高亮
  function setActiveNav() {
    const navbar = document.getElementById('navbar');
    if (!navbar) return;

    navbar.querySelectorAll('.nav-item.active, .nav-sub-item.active')
      .forEach(el => el.classList.remove('active'));

    navbar.querySelectorAll('.nav-item').forEach(item => {
      const label = item.querySelector('.label');
      const path = item.dataset.path || (label ? label.textContent.trim() : '');
      if (path !== NAV_PATH) return;

      item.classList.add('active');

      const group = item.closest('.nav-group');
      if (group) {
        group.classList.add('open');
        group.querySelectorAll('.nav-sub-item').forEach(sub => {
          if ((sub.dataset.path || '') === NAV_SUB) sub.classList.add('active');
        });
      }
    });
  }

  // 导航栏为异步加载：已加载则直接设置，否则等待 navbar:loaded 事件
  const navbar = document.getElementById('navbar');
  if (navbar && navbar.children.length) {
    setActiveNav();
  } else {
    document.addEventListener('navbar:loaded', setActiveNav, { once: true });
  }

  // ===== KPI 统计 =====
  // 数据来源与合同台账一致：localStorage hz_contracts
  function loadContracts() {
    try {
      const v = JSON.parse(localStorage.getItem('hz_contracts'));
      return Array.isArray(v) ? v : [];
    } catch (e) {
      return [];
    }
  }

  // 数字滚动动画（与首页一致：800ms 缓动 + 千分位）
  function animateValue(el, target) {
    const prefix = el.dataset.prefix || '';
    const duration = 800;
    const start = performance.now();
    function frame(now) {
      const p = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      el.textContent = prefix + Math.round(target * eased).toLocaleString('zh-CN');
      if (p < 1) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  function renderKpis() {
    const list = loadContracts();

    // 金额与货量统计
    const total = list.reduce((s, c) => s + (Number(c.amount) || 0), 0);
    const quantity = list.reduce((s, c) => s + (Number(c.quantity) || 0), 0);

    animateValue(document.getElementById('kpiCount'), list.length);
    animateValue(document.getElementById('kpiAmount'), total);
    animateValue(document.getElementById('kpiQuantity'), quantity);
  }

  // ===== 合同类型分布（SVG 环形图）=====
  // 各类型占比 = 份数 / 总数；颜色与公共设计变量保持一致
  const TYPE_COLORS = {
    '采购合同': '#4080FF',
    '销售合同': '#FF7D00',
    '运输合同': '#00B42A',
    '服务合同': '#722ED1'
  };
  const TYPE_FALLBACK_COLOR = '#86909C';

  function renderTypeChart() {
    const svg = document.getElementById('typePie');
    const legend = document.getElementById('typeLegend');
    const list = loadContracts();
    const total = list.length;

    // 无数据：灰色空环 + 空状态文案
    if (!total) {
      svg.innerHTML =
        '<circle cx="60" cy="60" r="45" fill="none" stroke="#E5E6EB" stroke-width="24"/>' +
        '<text class="pie-center-label" x="60" y="57" text-anchor="middle">合同总数</text>' +
        '<text class="pie-center-value" x="60" y="76" text-anchor="middle">0</text>';
      legend.innerHTML = '<div class="legend-empty">暂无合同数据，请先在合同台账中登记</div>';
      return;
    }

    // 统计各类型份数
    const counts = {};
    list.forEach(c => {
      const t = c.type || '其他';
      counts[t] = (counts[t] || 0) + 1;
    });
    const entries = Object.entries(counts);

    // 生成扇区：circle stroke-dasharray 分段，负向偏移依次拼接，从 12 点方向开始
    const r = 45;
    const C = 2 * Math.PI * r;
    let offset = 0;
    const sectors = entries.map(([type, n]) => {
      const len = (n / total) * C;
      const color = TYPE_COLORS[type] || TYPE_FALLBACK_COLOR;
      const seg =
        '<circle cx="60" cy="60" r="' + r + '" fill="none" stroke="' + color + '" stroke-width="24"' +
        ' stroke-dasharray="' + len.toFixed(2) + ' ' + (C - len).toFixed(2) + '"' +
        ' stroke-dashoffset="' + (-offset).toFixed(2) + '" transform="rotate(-90 60 60)"/>';
      offset += len;
      return seg;
    });

    // 中心显示合同总数
    sectors.push(
      '<text class="pie-center-label" x="60" y="57" text-anchor="middle">合同总数</text>' +
      '<text class="pie-center-value" x="60" y="76" text-anchor="middle">' + total + '</text>'
    );
    svg.innerHTML = sectors.join('');

    // 图例：色点 + 类型名 + 份数与占比（按份数降序）
    entries.sort((a, b) => b[1] - a[1]);
    legend.innerHTML = entries.map(([type, n]) => {
      const color = TYPE_COLORS[type] || TYPE_FALLBACK_COLOR;
      const pct = ((n / total) * 100).toFixed(1);
      return (
        '<div class="legend-item">' +
        '<span class="dot" style="background:' + color + '"></span>' +
        '<span class="name">' + type + '</span>' +
        '<span class="val">' + n + ' 份 · ' + pct + '%</span>' +
        '</div>'
      );
    }).join('');
  }

  // ===== 月度签约趋势（近 6 个月柱状图）=====
  // 生成近 n 个月 'YYYY-MM' 序列（含当月）
  function recentMonths(n) {
    const arr = [];
    const now = new Date();
    for (let i = n - 1; i >= 0; i--) {
      const t = new Date(now.getFullYear(), now.getMonth() - i, 1);
      arr.push(t.getFullYear() + '-' + String(t.getMonth() + 1).padStart(2, '0'));
    }
    return arr;
  }

  // 金额千分位
  function fmtMoney(n) {
    return Math.round(n).toLocaleString('zh-CN');
  }

  // 通用柱状图：values 高度按最大值归一化，柱顶显示数值，底部月份标签
  function renderBarChart(elId, values, labels, titles, fmt) {
    const box = document.getElementById(elId);
    const max = Math.max.apply(null, values.concat([0]));
    box.innerHTML = values.map((v, i) => {
      const h = max > 0 ? (v / max) * 100 : 0;
      return (
        '<div class="bar-col" title="' + titles[i] + '">' +
        '<div class="bar-value">' + fmt(v) + '</div>' +
        '<div class="bar-track"><div class="bar" style="height:' + h.toFixed(1) + '%"></div></div>' +
        '<div class="bar-label">' + labels[i] + '</div>' +
        '</div>'
      );
    }).join('');
  }

  function renderSignCharts() {
    const list = loadContracts();
    const months = recentMonths(6);
    const monthOf = c => (c.signDate || '').slice(0, 7);

    const counts = months.map(m => list.filter(c => monthOf(c) === m).length);
    renderBarChart('signCountChart', counts, months.map(m => m.slice(5) + '月'), months, v => String(v));
  }

  // ===== 月度收付款现金流对比（近 6 个月双柱状图）=====
  // 双柱：蓝 = 已收款 Σreceived，橙 = 已付款 Σpaid（按签订月份归集，共用同一归一化基准）
  function renderCashflowChart() {
    const list = loadContracts();
    const months = recentMonths(6);
    const monthOf = c => (c.signDate || '').slice(0, 7);

    const inflow = months.map(m =>
      list.reduce((s, c) => s + (monthOf(c) === m ? (Number(c.received) || 0) : 0), 0));
    const outflow = months.map(m =>
      list.reduce((s, c) => s + (monthOf(c) === m ? (Number(c.paid) || 0) : 0), 0));

    const max = Math.max.apply(null, inflow.concat(outflow, [0]));
    const box = document.getElementById('cashflowChart');
    box.innerHTML = months.map((m, i) => {
      const hIn = max > 0 ? (inflow[i] / max) * 100 : 0;
      const hOut = max > 0 ? (outflow[i] / max) * 100 : 0;
      return (
        '<div class="bar-col" title="' + m + '：已收 ¥' + fmtMoney(inflow[i]) +
        ' · 已付 ¥' + fmtMoney(outflow[i]) + '">' +
        '<div class="bar-pair">' +
        '<div class="bar-track"><div class="bar in" style="height:' + hIn.toFixed(1) + '%"></div></div>' +
        '<div class="bar-track"><div class="bar out" style="height:' + hOut.toFixed(1) + '%"></div></div>' +
        '</div>' +
        '<div class="bar-label">' + m.slice(5) + '月</div>' +
        '</div>'
      );
    }).join('');
  }

  // ===== 回款占比（双段环形图）=====
  // 已回款（蓝）= Σ已收款；未回款（橙）= 合同总金额 − 已回款
  function renderPayChart() {
    const svg = document.getElementById('payPie');
    const legend = document.getElementById('payLegend');
    const list = loadContracts();
    const total = list.reduce((s, c) => s + (Number(c.amount) || 0), 0);
    const received = Math.min(list.reduce((s, c) => s + (Number(c.received) || 0), 0), total);
    const outstanding = Math.max(total - received, 0);

    if (!total) {
      svg.innerHTML =
        '<circle cx="60" cy="60" r="45" fill="none" stroke="#E5E6EB" stroke-width="24"/>' +
        '<text class="pie-center-label" x="60" y="57" text-anchor="middle">回款率</text>' +
        '<text class="pie-center-value" x="60" y="76" text-anchor="middle">—</text>';
      legend.innerHTML = '<div class="legend-empty">暂无合同数据，请先在合同台账中登记</div>';
      return;
    }

    const rate = (received / total) * 100;
    const r = 45;
    const C = 2 * Math.PI * r;
    const lenA = (received / total) * C;

    svg.innerHTML =
      '<circle cx="60" cy="60" r="' + r + '" fill="none" stroke="#4080FF" stroke-width="24"' +
      ' stroke-dasharray="' + lenA.toFixed(2) + ' ' + (C - lenA).toFixed(2) + '" transform="rotate(-90 60 60)"/>' +
      '<circle cx="60" cy="60" r="' + r + '" fill="none" stroke="#FF7D00" stroke-width="24"' +
      ' stroke-dasharray="' + (C - lenA).toFixed(2) + ' ' + lenA.toFixed(2) + '"' +
      ' stroke-dashoffset="' + (-lenA).toFixed(2) + '" transform="rotate(-90 60 60)"/>' +
      '<text class="pie-center-label" x="60" y="57" text-anchor="middle">回款率</text>' +
      '<text class="pie-center-value" x="60" y="76" text-anchor="middle">' + rate.toFixed(1) + '%</text>';

    legend.innerHTML =
      '<div class="legend-item">' +
      '<span class="dot" style="background:#4080FF"></span>' +
      '<span class="name">已回款</span>' +
      '<span class="val">¥' + received.toLocaleString('zh-CN') + ' · ' + rate.toFixed(1) + '%</span>' +
      '</div>' +
      '<div class="legend-item">' +
      '<span class="dot" style="background:#FF7D00"></span>' +
      '<span class="name">未回款</span>' +
      '<span class="val">¥' + outstanding.toLocaleString('zh-CN') + ' · ' + (100 - rate).toFixed(1) + '%</span>' +
      '</div>';
  }

  // ===== 履约预警 =====
  // 规则（只评估「履行中」合同，已终止/已完成不预警）：
  //   高：已到期未结项（终止时间 < 今天）
  //   高：到期未回款（终止时间 < 今天 且 应收未收 > 0）
  //   中：30 天内到期（0 ≤ 距终止时间 ≤ 30 天）
  function renderWarnList() {
    const list = loadContracts();
    const DAY = 24 * 60 * 60 * 1000;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const warns = [];
    list.forEach(c => {
      if (c.status !== '履行中' || !c.endDate) return;
      const end = new Date(c.endDate + 'T00:00:00');
      if (isNaN(end)) return;
      const days = Math.floor((end - today) / DAY);
      const due = (Number(c.amount) || 0) - (Number(c.received) || 0);

      const reasons = [];
      let level = '';
      if (days < 0) {
        reasons.push('已到期未结项');
        level = 'high';
        if (due > 0) reasons.push('到期未回款 ¥' + fmtMoney(due));
      } else if (days <= 30) {
        reasons.push(days + ' 天内到期');
        level = 'mid';
        if (due > 0) reasons.push('待回款 ¥' + fmtMoney(due));
      }
      if (!reasons.length) return;

      warns.push({ level, name: c.name || '未命名合同', no: c.no || '—',
                   reason: reasons.join(' · '), end: c.endDate, days });
    });

    // 高危在前，同级按到期日升序（最紧急的排最前）
    warns.sort((a, b) =>
      (a.level === 'high' ? 0 : 1) - (b.level === 'high' ? 0 : 1) || a.days - b.days);

    document.getElementById('warnCount').textContent =
      warns.length ? '共 ' + warns.length + ' 条' : '';

    const box = document.getElementById('warnTable');
    if (!warns.length) {
      box.innerHTML = '<div class="warn-empty">暂无履约风险</div>';
      return;
    }
    box.innerHTML = warns.map(w => (
      '<div class="warn-row">' +
      '<span class="warn-tag ' + w.level + '">' + (w.level === 'high' ? '高' : '中') + '</span>' +
      '<div class="warn-info">' +
      '<div class="warn-name">' + esc(w.name) + ' <span class="warn-no">' + esc(w.no) + '</span></div>' +
      '<div class="warn-reason">' + esc(w.reason) + '</div>' +
      '</div>' +
      '<div class="warn-date">到期 ' + esc(w.end) + '</div>' +
      '</div>'
    )).join('');
  }

  // HTML 转义（合同名称等文本内容防注入）
  function esc(s) {
    return String(s).replace(/[&<>"']/g, m => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[m]));
  }

  renderKpis();
  renderTypeChart();
  renderSignCharts();
  renderCashflowChart();
  renderPayChart();
  renderWarnList();

  // 启动后从同步服务器拉取最新台账数据并刷新看板（服务器不可达时保持本地数据）
  if (window.HZ_SYNC) {
    HZ_SYNC.pull().then(function (remote) {
      if (!remote) return;
      try {
        localStorage.setItem('hz_contracts', JSON.stringify(remote.contracts || []));
      } catch (e) { /* 存储不可用时忽略，本次仍以拉取到的数据渲染 */ }
      renderKpis();
      renderTypeChart();
      renderSignCharts();
      renderCashflowChart();
      renderPayChart();
      renderWarnList();
    });
  }
})();
