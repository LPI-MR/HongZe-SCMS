// ===== 公共导航栏加载脚本 =====
// 用法：
//   1. 页面侧边栏中放置容器：<div id="navbar"></div>
//   2. 引入本脚本：<script src="/common/fetch.js"></script>
// 加载完成后：
//   - 绑定二级菜单展开/收起、选中态高亮等通用交互
//   - 统一导航路由：点击菜单跳转到 NAV_ROUTES 中配置的页面
//   - 未配置路由的菜单派发 "navbar:navigate" 事件（detail.path），由页面自行处理
// 注意：fetch 不支持 file:// 协议，请通过本地服务器（如 http://localhost:8000）访问

(function () {
  'use strict';

  // 菜单路径 → 页面地址（根绝对路径，适配任意子目录页面）
  // 港口管理指向 ports/（真功能模块）；其余带序号模块由门户页承接
  const NAV_ROUTES = {
    '首页': '/index.html',
    '客户管理': '/customers/customers.html',
    '价格指数管理 / 汽运价格指数': '/price-index/price-index.html',
    '价格指数管理 / 火运价格指数': '/price-index/price-index.html',
    '价格指数管理 / 铁矿石价格指数': '/price-index/price-index.html',
    '业务管理': '/business/business.html',
    '矿山管理': '/mine/mine.html',
    '海运管理': '/ocean/ocean.html',
    '港口管理': '/ports/ports.html',
    '铁路供应商管理': '/railway/railway.html',
    '中转站点管理': '/transfer/transfer.html',
    '仓储管理': '/warehouse/warehouse.html',
    '汽运车队': '/fleet/fleet.html',
    '钢厂管理': '/steel/steel.html',
    '合同管理 / 数据看板': '/contracts/dashboard.html',
    '合同管理 / 合同台账': '/contracts/contracts.html',
    '合同管理 / 合同模板': '/contracts/templates.html',
    '运输调度管理': '/transport/transport.html',
    '运输调度管理 / 调度看板': '/transport/transport.html',
    '运输调度管理 / 信息录入': '/transport/transport-entry.html',
    '数据分析 / 调度数据分析': '/analytics/analytics.html',
    '数据分析 / 财务数据分析': '/analytics/analytics.html'
  };

  // 当前页面路径规范化（兼容本地服务器的无后缀 clean URL）
  function currentPage() {
    let p = location.pathname;
    if (p.charAt(p.length - 1) === '/') p += 'index.html';
    if (p.indexOf('.', p.lastIndexOf('/')) === -1) p += '.html';
    return p;
  }

  // ===== 导航组展开状态记忆（会话级）=====
  // 跳转/刷新后保持用户展开的菜单组，避免其他组自动折叠
  const SS_NAV_OPEN = 'hz_nav_open_groups';

  function getOpenGroups() {
    try {
      const v = JSON.parse(sessionStorage.getItem(SS_NAV_OPEN));
      return v && typeof v === 'object' ? v : {};
    } catch (e) {
      return {};
    }
  }

  function setOpenGroup(key, open) {
    const state = getOpenGroups();
    if (open) state[key] = true;
    else delete state[key];
    try {
      sessionStorage.setItem(SS_NAV_OPEN, JSON.stringify(state));
    } catch (e) { /* 存储不可用时忽略 */ }
  }

  function loadNavbar() {
    const container = document.getElementById('navbar');
    if (!container) return;

    fetch('/common/navbar.html')
      .then(res => {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.text();
      })
      .then(html => {
        container.innerHTML = html;
        bindNavbar();
        document.dispatchEvent(new CustomEvent('navbar:loaded'));
      })
      .catch(err => {
        console.error('[fetch.js] 导航栏加载失败：', err);
        container.innerHTML =
          '<div style="padding:16px;color:#F53F3F;font-size:14px;">导航栏加载失败，请通过本地服务器访问页面</div>';
      });
  }

  // ===== 导航通用交互绑定 =====
  function bindNavbar() {
    const container = document.getElementById('navbar');

    // 恢复各导航组的展开状态（跳转/刷新后不丢失）
    const openState = getOpenGroups();
    container.querySelectorAll('.nav-group').forEach(group => {
      const parent = group.querySelector('.nav-item.has-children');
      const label = parent && parent.querySelector('.label');
      const key = label ? label.textContent.trim() : '';
      if (key && openState[key]) group.classList.add('open');
    });

    // 二级菜单展开/收起（状态记忆）
    container.querySelectorAll('.nav-group > .nav-item.has-children').forEach(parent => {
      parent.addEventListener('click', () => {
        const group = parent.closest('.nav-group');
        const open = group.classList.toggle('open');
        const label = parent.querySelector('.label');
        setOpenGroup(label ? label.textContent.trim() : '', open);
      });
    });

    // 点击选中态 + 路由跳转
    container.querySelectorAll('.nav-item:not(.has-children), .nav-sub-item').forEach(item => {
      item.addEventListener('click', () => {
        container.querySelectorAll('.nav-item.active, .nav-sub-item.active')
          .forEach(el => el.classList.remove('active'));
        item.classList.add('active');

        const path = item.dataset.path || item.querySelector('.label').textContent;

        // 有路由的菜单：跳转对应页面（已在目标页时仅同步选中态）
        const route = NAV_ROUTES[path];
        if (route) {
          if (currentPage() !== route) {
            location.href = route;
          }
          return;
        }

        // 无路由的菜单：派发事件由页面自行处理（如 index 占位切换）
        document.dispatchEvent(new CustomEvent('navbar:navigate', { detail: { path } }));
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadNavbar);
  } else {
    loadNavbar();
  }
})();
