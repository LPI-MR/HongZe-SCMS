// ===== 门户页通用模板脚本（建设中模块的统一门户） =====
// 用法：
//   1. 页面 <body data-portal="port">（模块键见下方 PORTALS 表）
//   2. 页面静态骨架：portal-hero（标题条）+ portal-stats 统计区
//      + portal-features 规划能力区 + portal-note 建设说明
//   3. 引入本脚本：<script src="/common/portal.js"></script>
// 样式由 /css/common.css 门户组件段提供，门户页无需独立 css。
// 统计卡口径：读取全站共享数据（合同 / 矿山 / 航次），只读聚合、不写入。
(function () {
  'use strict';

  // 各模块门户配置：规划能力清单（建设范围说明，非已上线功能）
  const PORTALS = {
    railway: {
      features: [
        ['供应商档案', '铁路供应商资质、线路与运力信息维护'],
        ['运价管理', '铁路运输价格与附加费标准台账'],
        ['计划衔接', '与合同、矿山模块打通，编排铁路发运计划'],
        ['执行跟踪', '在途铁路运输状态跟踪与异常记录']
      ]
    },
    transfer: {
      features: [
        ['站点档案', '中转站点基础信息与归属关系维护'],
        ['库存台账', '站点货物入库、存储与出库流水管理'],
        ['作业记录', '站点倒短、混配等作业记录台账'],
        ['链路衔接', '与港口、仓储模块打通，串联物流链路']
      ]
    },
    warehouse: {
      features: [
        ['仓库档案', '仓库基础信息、库区库位与容量维护'],
        ['出入库台账', '货物入库、出库流水与结存管理'],
        ['库存盘点', '周期盘点与差异处理记录'],
        ['单据衔接', '与合同、海运模块打通，关联货物权属']
      ]
    },
    fleet: {
      features: [
        ['车辆档案', '车队车辆、司机与运力资质维护'],
        ['调度台账', '汽运任务派单与执行状态管理'],
        ['运费结算', '汽运运费计算与对账台账'],
        ['链路衔接', '与港口、中转站点模块打通，衔接短驳环节']
      ]
    },
    steel: {
      features: [
        ['钢厂档案', '钢厂客户基础信息与采购偏好维护'],
        ['采购计划', '钢厂采购需求计划与执行进度管理'],
        ['合同衔接', '与合同管理模块打通，关联供货合同'],
        ['收货台账', '钢厂收货、验收与结算记录']
      ]
    },
    customers: {
      features: [
        ['客户档案', '客户基础信息、资质证照与合作状态维护'],
        ['往来记录', '客户沟通、拜访与业务往来记录'],
        ['合作分析', '客户交易规模与履约表现分析'],
        ['业务衔接', '与合同、业务管理模块打通，关联客户订单']
      ]
    },
    'price-index': {
      features: [
        ['指数采集', '汽运、火运与铁矿石价格指数采集入库'],
        ['走势分析', '指数历史走势与同比环比分析'],
        ['预警提醒', '价格波动阈值预警与提醒推送'],
        ['数据衔接', '为合同定价与成本测算提供指数参考']
      ]
    },
    business: {
      features: [
        ['订单台账', '业务订单创建、跟踪与全流程管理'],
        ['执行跟踪', '订单执行状态与节点管理'],
        ['结算管理', '订单结算与应收应付台账'],
        ['模块衔接', '与合同、运输模块打通，闭环业务链路']
      ]
    },
    transport: {
      features: [
        ['调度台账', '多式联运任务创建与车辆调度管理'],
        ['在途跟踪', '运输任务执行状态与在途跟踪'],
        ['运力协同', '与汽运车队、铁路供应商协同排运'],
        ['链路衔接', '与海运、港口模块打通，衔接全程物流链路']
      ]
    },
    analytics: {
      features: [
        ['调度分析', '运输任务量、准点率与运力利用率分析'],
        ['财务分析', '收入、成本与毛利多维分析'],
        ['报表导出', '经营报表配置与一键导出'],
        ['数据打通', '汇聚合同、矿山、海运等模块数据统一分析']
      ]
    }
  };

  // ===== 门户页导航高亮：当前页面文件名 → 菜单路径 =====
  // 共用页（价格指数 / 数据分析）包含全部入口路径，取第一个匹配项高亮
  const PAGE_NAV = {
    'railway.html': ['铁路供应商管理'],
    'transfer.html': ['中转站点管理'],
    'warehouse.html': ['仓储管理'],
    'fleet.html': ['汽运车队'],
    'steel.html': ['钢厂管理'],
    'customers.html': ['客户管理'],
    'price-index.html': ['价格指数管理 / 汽运价格指数', '价格指数管理 / 火运价格指数', '价格指数管理 / 铁矿石价格指数'],
    'business.html': ['业务管理'],
    'transport.html': ['运输调度管理'],
    'analytics.html': ['数据分析 / 调度数据分析', '数据分析 / 财务数据分析']
  };

  // 导航栏选中态（与各模块 setActiveNav 模式一致；支持二级菜单展开父组）
  function setActiveNav() {
    const navbar = document.getElementById('navbar');
    if (!navbar) return;

    // 兼容无后缀 clean URL（/analytics/analytics → analytics.html），与 fetch.js currentPage() 约定一致
    let page = location.pathname.split('/').pop() || '';
    if (page && page.indexOf('.') === -1) page += '.html';
    const paths = PAGE_NAV[page];
    if (!paths) return;

    navbar.querySelectorAll('.nav-item.active, .nav-sub-item.active')
      .forEach(el => el.classList.remove('active'));

    const labelOf = el => {
      const label = el.querySelector('.label');
      return el.dataset.path || (label ? label.textContent.trim() : '');
    };

    // 一级菜单优先匹配
    const top = Array.prototype.find.call(
      navbar.querySelectorAll('.nav-item'),
      it => paths.indexOf(labelOf(it)) !== -1
    );
    if (top) {
      top.classList.add('active');
      return;
    }

    // 二级菜单匹配：高亮第一个子项并展开父组
    const sub = Array.prototype.find.call(
      navbar.querySelectorAll('.nav-sub-item'),
      it => paths.indexOf(it.dataset.path || '') !== -1
    );
    if (sub) {
      sub.classList.add('active');
      const group = sub.closest('.nav-group');
      if (group) group.classList.add('open');
    }
  }

  function bindNavHighlight() {
    const navbar = document.getElementById('navbar');
    if (navbar && navbar.children.length) {
      setActiveNav();
    } else {
      // 导航栏为异步加载：等待 navbar:loaded 事件
      document.addEventListener('navbar:loaded', setActiveNav, { once: true });
    }
  }

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

  // 渲染规划能力清单
  function renderFeatures(features) {
    const box = document.getElementById('portalFeatures');
    if (!box) return;
    box.innerHTML = features.map((f, i) =>
      '<div class="portal-feature">' +
        '<span class="feature-idx">' + (i + 1) + '</span>' +
        '<span class="feature-info">' +
          '<span class="feature-title">' + esc(f[0]) + '</span>' +
          '<span class="feature-desc">' + esc(f[1]) + '</span>' +
        '</span>' +
      '</div>'
    ).join('');
  }

  // 渲染系统数据概览（真实聚合，只读）
  function renderStats() {
    const box = document.getElementById('portalStats');
    if (!box) return;

    const contracts = Array.isArray(loadJSON('hz_contracts', [])) ? loadJSON('hz_contracts', []) : [];
    const mines = Array.isArray(loadJSON('hz_mines', [])) ? loadJSON('hz_mines', []) : [];
    const voyages = Array.isArray(loadJSON('hz_ocean_voyages', [])) ? loadJSON('hz_ocean_voyages', []) : [];

    const stats = [
      { label: '在管合同', value: contracts.length + ' 份' },
      { label: '在用矿山', value: mines.filter(m => m.status === 'active').length + ' 座' },
      { label: '海运航次', value: voyages.length + ' 个' }
    ];

    box.innerHTML = stats.map(s =>
      '<div class="stat-card">' +
        '<div class="stat-label">' + esc(s.label) + '</div>' +
        '<div class="stat-value">' + esc(s.value) + '</div>' +
        '<div class="stat-note">来自已上线模块的实时数据</div>' +
      '</div>'
    ).join('');
  }

  function init() {
    const key = document.body.dataset.portal;
    const cfg = PORTALS[key];
    if (!cfg) return;   // 未配置模块键的页面保持静态骨架
    renderFeatures(cfg.features);
    renderStats();
    bindNavHighlight();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
