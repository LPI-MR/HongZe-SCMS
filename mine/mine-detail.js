// ===== mine 模块脚本（矿山管理 · 详情页） =====
// 依据 URL ?id= 参数渲染矿山完整信息；右侧 SVG 世界示意位置图；下方 Tab 占位
// 数据来源：localStorage hz_mines（由列表页 mine.js 维护，本页只读 + 跳转编辑）
(function () {
  'use strict';

  // 本页对应的导航位置：矿山管理（一级菜单）
  const NAV_PATH = '矿山管理';

  // 设置导航栏选中态：一级「矿山管理」高亮
  function setActiveNav() {
    const navbar = document.getElementById('navbar');
    if (!navbar) return;

    navbar.querySelectorAll('.nav-item.active, .nav-sub-item.active')
      .forEach(el => el.classList.remove('active'));

    navbar.querySelectorAll('.nav-item').forEach(item => {
      const label = item.querySelector('.label');
      const path = item.dataset.path || (label ? label.textContent.trim() : '');
      if (path === NAV_PATH) item.classList.add('active');
    });
  }

  const navbar = document.getElementById('navbar');
  if (navbar && navbar.children.length) {
    setActiveNav();
  } else {
    document.addEventListener('navbar:loaded', setActiveNav, { once: true });
  }

  // ===== 枚举常量（与列表页 mine.js 保持一致） =====
  const MINE_TYPES = {
    coal: '煤矿',
    iron: '铁矿',
    nonferrous: '有色金属矿',
    nonmetal: '非金属矿',
    other: '其他'
  };

  const STATUS = {
    active: '在用',
    inactive: '停用'
  };

  // ===== 数据层 =====
  function loadJSON(key, fallback) {
    try {
      const v = JSON.parse(localStorage.getItem(key));
      return v == null ? fallback : v;
    } catch (e) {
      return fallback;
    }
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function fmtTime(ts) {
    if (!ts) return '—';
    const d = new Date(ts);
    if (isNaN(d.getTime())) return '—';
    const p = n => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) +
      ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }

  function fmtNum(n) {
    return Number(n || 0).toLocaleString('zh-CN', { maximumFractionDigits: 1 });
  }

  function productsOf(m) {
    return String(m.main_products || '').split(',').map(s => s.trim()).filter(Boolean);
  }

  // 从 URL 取矿山 id
  const mineId = new URLSearchParams(location.search).get('id');

  const $ = id => document.getElementById(id);

  // 当前矿山对象（render 时缓存，供分组浮窗实时取数）
  let currentMine = null;

  function render() {
    const mines = loadJSON('hz_mines', []);
    const m = mineId && mines.find(x => x.id === mineId);

    if (!m) {
      // 未找到矿山：给出明确空态，避免白屏
      currentMine = null;
      $('dName').textContent = '未找到该矿山';
      $('dCode').textContent = '可能已被删除或链接参数有误';
      $('editBtn').hidden = true;
      return;
    }
    currentMine = m;

    // 顶部
    $('dName').textContent = m.mine_name || '—';
    $('dCode').textContent = m.mine_code || '';
    const st = $('dStatus');
    st.hidden = false;
    st.className = 'status-tag ' + (m.status || '');
    st.textContent = STATUS[m.status] || m.status || '—';

    // 基础信息
    $('dMineName').textContent = m.mine_name || '—';
    $('dShortName').textContent = m.short_name || '—';
    $('dMineType').textContent = MINE_TYPES[m.mine_type] || m.mine_type || '—';
    $('dOperator').textContent = m.operator || '—';
    $('dContactPerson').textContent = m.contact_person || '—';
    $('dContactPhone').textContent = m.contact_phone || '—';

    // 地理位置
    $('dProvince').textContent = m.province || '—';
    $('dCity').textContent = m.city || '—';
    $('dDistrict').textContent = m.district || '—';
    $('dAddress').textContent = m.address || '—';
    $('dLongitude').textContent = m.longitude != null ? m.longitude : '—';
    $('dLatitude').textContent = m.latitude != null ? m.latitude : '—';

    // 产品与产能
    const ps = productsOf(m);
    $('dProducts').innerHTML = ps.length
      ? '<span class="product-tags">' +
        ps.map(p => '<span class="product-tag">' + esc(p) + '</span>').join('') +
        '</span>'
      : '—';
    $('dCapacity').textContent = m.annual_capacity != null ? fmtNum(m.annual_capacity) : '—';
    $('dReserve').textContent = m.reserve != null ? fmtNum(m.reserve) : '—';
    $('dOreGrade').textContent = m.ore_grade || '—';
    $('dCreatedAt').textContent = fmtTime(m.created_at);
    $('dCreatedBy').textContent = m.created_by || '—';

    // 备注
    $('dRemark').textContent = m.remark || '—';

    // 位置图 + 坐标注释
    renderGeoMap(m);
    $('geoCoord').textContent =
      (m.longitude != null && m.latitude != null)
        ? '经度 ' + m.longitude + '° / 纬度 ' + m.latitude + '°（WGS84，用于海运距离推算）'
        : '未登记经纬度，可在编辑中补充（用于地图展示与海运距离推算）';

    // 编辑按钮：跳转列表页并打开编辑抽屉（列表页支持 ?edit=id 直达）
    $('editBtn').addEventListener('click', () => {
      location.href = '/mine/mine.html?edit=' + encodeURIComponent(m.id);
    });
  }

  // ===== SVG 世界示意位置图（零依赖，等距圆柱投影） =====
  // 经度 -180~180 → x 0~1000；纬度 75~-60 → y 0~520
  function renderGeoMap(m) {
    const svg = $('geoMap');
    const W = 1000;
    const H = 520;
    const LON0 = -180;
    const LAT_TOP = 75;
    const LAT_BOTTOM = -60;
    const x = lon => ((lon - LON0) / 360) * W;
    const y = lat => ((LAT_TOP - lat) / (LAT_TOP - LAT_BOTTOM)) * H;

    const parts = [];

    // 经纬网格（每 30°，弱化不抢焦点）
    for (let lon = -150; lon <= 150; lon += 30) {
      parts.push('<line x1="' + x(lon) + '" y1="0" x2="' + x(lon) + '" y2="' + H + '" stroke="#E5E6EB" stroke-width="1"/>');
    }
    for (let lat = 60; lat >= -60; lat -= 30) {
      parts.push('<line x1="0" y1="' + y(lat) + '" x2="' + W + '" y2="' + y(lat) + '" stroke="#E5E6EB" stroke-width="1"/>');
    }
    // 赤道略深
    parts.push('<line x1="0" y1="' + y(0) + '" x2="' + W + '" y2="' + y(0) + '" stroke="#C9CDD4" stroke-width="1"/>');

    // 大洲淡标注（方位参考）
    const continents = [
      ['亚洲', 90, 45], ['欧洲', 20, 52], ['非洲', 20, 0],
      ['北美洲', -100, 45], ['南美洲', -60, -10], ['大洋洲', 134, -25]
    ];
    continents.forEach(([name, lon, lat]) => {
      parts.push('<text x="' + x(lon) + '" y="' + y(lat) + '" text-anchor="middle" font-size="16" fill="#C9CDD4">' + name + '</text>');
    });

    // 当前矿山位置：脉冲圈 + 实心点 + 名称
    if (m.longitude != null && m.latitude != null) {
      const px = x(Number(m.longitude));
      const py = y(Number(m.latitude));
      const inX = px >= 0 && px <= W;
      const inY = py >= 0 && py <= H;
      if (inX && inY) {
        parts.push(
          '<circle class="geo-pulse" cx="' + px + '" cy="' + py + '" r="12" fill="rgba(64,128,255,0.35)"/>' +
          '<circle cx="' + px + '" cy="' + py + '" r="7" fill="#4080FF" stroke="#FFFFFF" stroke-width="2"/>'
        );
        // 标签位置防出界
        const tx = Math.min(Math.max(px, 60), W - 60);
        const labelAbove = py > 40;
        parts.push('<text x="' + tx + '" y="' + (labelAbove ? py - 18 : py + 26) +
          '" text-anchor="middle" font-size="18" font-weight="600" fill="#1D2129">' +
          esc(m.short_name || m.mine_name || '') + '</text>');
      }
    } else {
      // 未登记坐标：提示文案
      parts.push('<text x="' + (W / 2) + '" y="' + (H / 2) + '" text-anchor="middle" font-size="18" fill="#86909C">该矿山未登记经纬度</text>');
    }

    svg.innerHTML = parts.join('');
  }

  // ===== Tab 页签切换（本期均为占位面板） =====
  function initTabs() {
    const TAB_TEXT = {
      cargo: '暂无关联数据：关联货物批次列表将由「货物批次」模块对接本矿山主数据后展示（接口占位）',
      transport: '暂无关联数据：关联运输计划列表将由「运输调度」模块对接本矿山主数据后展示（接口占位）'
    };

    document.querySelectorAll('.detail-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.detail-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        $('tabPanel').textContent = TAB_TEXT[tab.dataset.tab] || '';
      });
    });
  }

  // ===== 分组点击浮窗（居中 modal，展示分组更细的完整字段） =====
  const SECTION_TITLES = {
    basic: '基础信息',
    geo: '地理位置',
    product: '产品与产能',
    remark: '备注'
  };

  // 浮窗字段行：label 定宽 + value 弹性；value 为空时显示 —（文本须先经 esc）
  function fieldRow(label, value) {
    const v = (value == null || value === '') ? '—' : value;
    return '<div class="modal-field"><span class="mf-label">' + esc(label) + '</span>' +
      '<span class="mf-value">' + v + '</span></div>';
  }

  function statusHtml(m) {
    return '<span class="status-tag ' + esc(m.status || '') + '">' +
      esc(STATUS[m.status] || m.status || '—') + '</span>';
  }

  function productsHtml(m) {
    const ps = productsOf(m);
    if (!ps.length) return '';
    return '<span class="product-tags">' +
      ps.map(p => '<span class="product-tag">' + esc(p) + '</span>').join('') +
      '</span>';
  }

  // 组装分组对应的完整字段行（数据与页面渲染同源，打开时实时读取）
  function buildSectionRows(key, m) {
    if (key === 'basic') {
      return [
        fieldRow('矿山编号', esc(m.mine_code || '')),
        fieldRow('矿山名称', esc(m.mine_name || '')),
        fieldRow('矿山简称', esc(m.short_name || '')),
        fieldRow('矿山类型', esc(MINE_TYPES[m.mine_type] || m.mine_type || '')),
        fieldRow('开采/运营主体', esc(m.operator || '')),
        fieldRow('联系人', esc(m.contact_person || '')),
        fieldRow('联系电话', esc(m.contact_phone || '')),
        fieldRow('状态', statusHtml(m)),
        fieldRow('创建人', esc(m.created_by || '')),
        fieldRow('创建时间', esc(fmtTime(m.created_at))),
        fieldRow('最近更新', esc(fmtTime(m.updated_at)))
      ];
    }
    if (key === 'geo') {
      return [
        fieldRow('所在省份', esc(m.province || '')),
        fieldRow('所在城市', esc(m.city || '')),
        fieldRow('所在区县', esc(m.district || '')),
        fieldRow('详细地址', esc(m.address || '')),
        fieldRow('经度（WGS84）', m.longitude != null ? esc(String(m.longitude)) : ''),
        fieldRow('纬度（WGS84）', m.latitude != null ? esc(String(m.latitude)) : ''),
        fieldRow('坐标说明', 'WGS84 体系，用于看板分布展示与海运距离推算')
      ];
    }
    if (key === 'product') {
      return [
        fieldRow('主流产品（全部）', productsHtml(m)),
        fieldRow('年产能（万吨/年）', m.annual_capacity != null ? esc(fmtNum(m.annual_capacity)) : ''),
        fieldRow('保有储量（万吨）', m.reserve != null ? esc(fmtNum(m.reserve)) : ''),
        fieldRow('品位 / 品位范围', esc(m.ore_grade || '')),
        fieldRow('创建人 / 创建时间', esc((m.created_by || '—') + ' · ' + fmtTime(m.created_at)))
      ];
    }
    // remark
    return [
      fieldRow('备注', esc(m.remark || '')),
      fieldRow('创建人 / 创建时间', esc((m.created_by || '—') + ' · ' + fmtTime(m.created_at))),
      fieldRow('最近更新', esc(fmtTime(m.updated_at)))
    ];
  }

  function openSection(key) {
    if (!currentMine) return;
    $('sectionModalTitle').textContent = SECTION_TITLES[key] || '详情';
    $('sectionModalBody').innerHTML = buildSectionRows(key, currentMine).join('');
    $('sectionModalMask').hidden = false;
  }

  function closeSectionModal() {
    $('sectionModalMask').hidden = true;
  }

  function initSectionModal() {
    // 四个分组卡片：点击 / Enter / Space 均可打开对应浮窗
    document.querySelectorAll('.detail-section[data-section]').forEach(sec => {
      const key = sec.dataset.section;
      sec.addEventListener('click', () => openSection(key));
      sec.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          openSection(key);
        }
      });
    });

    // 关闭：× 按钮 / 点击遮罩空白区 / ESC
    $('sectionModalClose').addEventListener('click', closeSectionModal);
    $('sectionModalMask').addEventListener('click', e => {
      if (e.target === $('sectionModalMask')) closeSectionModal();
    });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && !$('sectionModalMask').hidden) closeSectionModal();
    });
  }

  // ===== 返回列表 =====
  $('backBtn').addEventListener('click', () => {
    location.href = '/mine/mine.html';
  });

  initTabs();
  initSectionModal();
  render();
})();
