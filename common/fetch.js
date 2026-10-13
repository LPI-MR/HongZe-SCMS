// ===== 公共导航栏加载脚本 =====
// 用法：
//   1. 页面侧边栏中放置容器：<div id="navbar"></div>
//   2. 引入本脚本：<script src="common/fetch.js"></script>
// 加载完成后：
//   - 绑定二级菜单展开/收起、选中态高亮等通用交互
//   - 派发 "navbar:navigate" 事件（detail.path 为菜单路径），由页面自行处理内容切换
// 注意：fetch 不支持 file:// 协议，请通过本地服务器（如 http://localhost:8000）访问

(function () {
  'use strict';

  // 基于脚本自身地址解析 navbar.html 实际位置，兼容任意子目录页面（如 /home/home.html）
  const NAVBAR_URL = document.currentScript && document.currentScript.src
    ? new URL('navbar.html', document.currentScript.src).href
    : 'common/navbar.html';

  function loadNavbar() {
    const container = document.getElementById('navbar');
    if (!container) return;

    fetch(NAVBAR_URL)
      .then(res => {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.text();
      })
      .then(html => {
        container.innerHTML = html;
        bindNavbar();
        // 通知页面导航栏已就绪（模块页可据此设置选中态）
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

    // 二级菜单展开/收起
    container.querySelectorAll('.nav-group > .nav-item.has-children').forEach(parent => {
      parent.addEventListener('click', () => {
        parent.closest('.nav-group').classList.toggle('open');
      });
    });

    // 点击选中态 + 通知页面切换内容
    container.querySelectorAll('.nav-item:not(.has-children), .nav-sub-item').forEach(item => {
      item.addEventListener('click', () => {
        container.querySelectorAll('.nav-item.active, .nav-sub-item.active')
          .forEach(el => el.classList.remove('active'));
        item.classList.add('active');

        const path = item.dataset.path || item.querySelector('.label').textContent;
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
