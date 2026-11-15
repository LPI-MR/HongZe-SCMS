// ===== mine 模块脚本（矿山管理 · 三板块重构版） =====
// 板块结构：矿山介绍（叙事卡片 + 沉浸式详情弹层）/ 基础信息（事实看板） / 产品详情（产品矩阵）
// 公共导航栏由 /common/fetch.js 加载；数据持久化到 PostgreSQL（经 hz-db.js 走 /api/mines 全量替换），本模块为权威数据源
// 信息隔离原则（PRD 3）：介绍板块仅叙事 + 图片；结构化事实归基础信息；产品明细归产品详情
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

  // 导航栏为异步加载：已加载则直接设置，否则等待 navbar:loaded 事件
  const navbar = document.getElementById('navbar');
  if (navbar && navbar.children.length) {
    setActiveNav();
  } else {
    document.addEventListener('navbar:loaded', setActiveNav, { once: true });
  }

  const $ = id => document.getElementById(id);

  // ===== 枚举常量（PRD 4.2：mine_type / status 枚举值定义） =====
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

  // ===== 数据装载 =====
  // 矿山列表：[{id, mine_code, mine_name, short_name, mine_type, main_products,
  //   province, city, district, address, longitude, latitude, annual_capacity, reserve,
  //   ore_grade, operator, contact_person, contact_phone, status, remark,
  //   commissioned_year, intro, img_prompt, tagline, hero_prompt, story, gallery,
  //   img_url, hero_url, gallery_urls, img_credit, products_ext, partners, created_at, updated_at, created_by}]
  // boot 时经 HZDB.ready()（/api/bootstrap 全量装载）同步读取缓存
  let mines = [];

  // products_ext 条目：{name, category, spec, output, unit, grade, impurity, size, moisture, application, desc}
  //   category 为业务大类（铁矿石/铝·锂/铜/冶金煤/钾盐/镍/锰/工业矿物），用于分类分组展示
  //   unit 为产量单位（默认 万吨/年；锂 万吨LCE/年、金 万盎司/年），跨单位不混算占比
  // 图片字段：img_url（列表图）/ hero_url（详情顶部图）/ gallery_urls（正文配图 URL 数组），
  //   已本地化为 /mine/assets/ 下的真实影像（来源 Wikimedia Commons / NASA，下载自公开图库）；
  //   为空时回退 prompt 走生成 API（用户自建矿山场景）
  // partners 条目：{name, type(steel/trader/other), scale, scale_value(降序排序用), period, status(lt/spot/strategic), remark}

  // 用户自建矿山的介绍板块默认回退值
  const DEFAULT_TAGLINE = '矿山的自然与人文';
  const DEFAULT_HERO_PROMPT = 'aerial satellite view of an open pit mine site, terraced benches and haul roads, realistic satellite photography';
  const DEFAULT_GALLERY = [
    'open pit mining site with heavy machinery at golden hour, realistic photography',
    'mining operation landscape with haul roads, realistic photography'
  ];

  // 用户自建矿山：介绍板块字段缺失时补默认回退值（不触碰业务数据）
  function backfillIntroDefaults(m) {
    if (m.tagline == null) m.tagline = DEFAULT_TAGLINE;
    if (!m.hero_prompt) m.hero_prompt = DEFAULT_HERO_PROMPT;
    if (!Array.isArray(m.gallery) || !m.gallery.length) m.gallery = DEFAULT_GALLERY.slice();
    if (!Array.isArray(m.story) || !m.story.length) {
      const p = m.intro || m.remark || '';
      m.story = p ? [{ h: '关于这座矿山', p: p }] : [];
    }
    return m;
  }

  // 统一持久化：全量写回数据库（PUT /api/mines 全量替换语义）
  // 失败时 HZDB 已 toast 错误提示并返回 false，页面内存现场保留，调用方中断后可直接重试
  async function save() {
    return HZDB.put('mines', mines);
  }

  function genId() {
    return 'm' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  // 矿山编号生成：M- + 4位流水号（Q-MINE-01 建议默认规则；正式环境由后端生成）
  function genCode(seq) {
    if (seq == null) {
      // 取现有最大流水号 +1
      seq = mines.reduce((max, m) => {
        const n = /^M-(\d+)$/.exec(m.mine_code || '');
        return n ? Math.max(max, Number(n[1])) : max;
      }, 0) + 1;
    }
    return 'M-' + String(seq).padStart(4, '0');
  }

  // ===== 工具函数 =====
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  // 产能千分位（1 位小数以内）
  function fmtNum(n) {
    return Number(n || 0).toLocaleString('zh-CN', { maximumFractionDigits: 1 });
  }

  // main_products 字符串 → 数组
  function productsOf(m) {
    return String(m.main_products || '').split(',').map(s => s.trim()).filter(Boolean);
  }

  // 运营年限：当前年份 − 投产年份（未登记投产年份返回 null）
  function operatingYears(m) {
    const y = Number(m.commissioned_year);
    if (!y || !Number.isInteger(y)) return null;
    const years = new Date().getFullYear() - y;
    return years >= 0 ? years : null;
  }

  // 经纬度格式化：117.85° E · 22.66° S；未登记返回提示
  function coordText(m) {
    if (m.longitude == null || m.latitude == null || m.longitude === '' || m.latitude === '') return '未登记';
    const lon = Number(m.longitude);
    const lat = Number(m.latitude);
    if (isNaN(lon) || isNaN(lat)) return '未登记';
    return Math.abs(lon).toFixed(2) + '° ' + (lon >= 0 ? 'E' : 'W') +
      ' · ' + Math.abs(lat).toFixed(2) + '° ' + (lat >= 0 ? 'N' : 'S');
  }

  // ===== 矿山配图（文本生成图片服务） =====
  // 卡片图 landscape_4_3；弹层 Hero / 实拍图 landscape_16_9（全宽沉浸）
  const IMG_API = 'https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image';
  const IMG_SIZE = 'landscape_4_3';
  const IMG_HERO_SIZE = 'landscape_16_9';
  const IMG_FALLBACK_PROMPT = 'open pit mine site, terraced benches, mining machinery, clear blue sky, realistic photography';

  function mineImgUrl(prompt, size) {
    return IMG_API + '?prompt=' + encodeURIComponent(prompt || IMG_FALLBACK_PROMPT) +
      '&image_size=' + (size || IMG_SIZE);
  }

  // 图源优先级（v7）：真实图源 URL 字段优先（Wikimedia Commons / NASA 直链），
  // 为空时回退 prompt 走生成 API（用户自建矿山场景），保证任意矿山都有图可显
  function imgUrlOr(url, prompt, size) {
    return url || mineImgUrl(prompt, size);
  }

  // 图片加载失败：隐藏图片露出占位底色，保持卡片结构稳定
  function bindImgError(img) {
    img.addEventListener('error', () => img.classList.add('img-error'));
  }

  // ===== 排序（三板块统一：按总产量 annual_capacity 从高到低，空值按 0 排末位） =====
  function sortedMines() {
    return mines.slice().sort((a, b) =>
      (Number(b.annual_capacity) || 0) - (Number(a.annual_capacity) || 0));
  }

  // ===== 板块一：矿山介绍卡片（纯叙事：名称 + 简介 + 图片 + 查看详情） =====
  function renderIntro() {
    const grid = $('introGrid');
    if (!grid) return;

    const list = sortedMines();
    if (!list.length) {
      grid.innerHTML = '<div class="tab-empty">暂无矿山数据，可在「基础信息」板块新增</div>';
      return;
    }

    grid.innerHTML = list.map(m =>
      '<article class="intro-card">' +
        '<div class="intro-media">' +
          '<img src="' + esc(imgUrlOr(m.img_url, m.img_prompt)) + '" alt="' + esc(m.mine_name) + '矿山实景" loading="lazy" decoding="async" />' +
        '</div>' +
        '<div class="intro-body">' +
          '<h3 class="intro-name">' + esc(m.mine_name) + '</h3>' +
          '<p class="intro-text">' + esc(m.intro || '暂无简介。') + '</p>' +
          '<div class="intro-foot">' +
            '<button class="intro-more" type="button" data-id="' + esc(m.id) + '">查看详情 ›</button>' +
          '</div>' +
        '</div>' +
      '</article>'
    ).join('');

    grid.querySelectorAll('.intro-media img').forEach(bindImgError);
  }

  // ===== 板块一：矿山介绍详情弹层（沉浸式：Hero 卫星影像 + 视差 + 纯叙事正文） =====
  // 禁项（PRD 3）：地理位置文字、产能数据、产品列表、状态标签等结构化内容一律不出现
  const introMask = $('introModalMask');
  const imHero = $('imHeroImg');
  const imHeroBlur = $('imHeroBlur');   // 渐进虚化副本（与主图同源，CSS mask 控制淡入）
  const imBody = $('introBody');
  let lastFocus = null;   // 关闭后焦点还原到触发按钮

  // 组装弹层正文：导语 + 文章分节 + 实拍图（前两节后各穿插一张）
  function buildIntroArticle(m) {
    const CN = ['一', '二', '三'];
    let sections, lead;
    if (Array.isArray(m.story) && m.story.length) {
      lead = m.intro || '';
      sections = m.story;
    } else {
      lead = '';
      const p = m.intro || m.remark || '暂无介绍，可在「基础信息」板块补充简介。';
      sections = [{ h: '关于这座矿山', p: p }];
    }
    const galleryUrls = Array.isArray(m.gallery_urls) && m.gallery_urls.length ? m.gallery_urls : null;
    const gallery = Array.isArray(m.gallery) && m.gallery.length ? m.gallery : DEFAULT_GALLERY;
    // 取图：真实图源 URL 优先，超出部分回退 prompt 生成
    const figUrl = idx => (galleryUrls && galleryUrls[idx]) ? galleryUrls[idx]
      : mineImgUrl(gallery[idx], IMG_HERO_SIZE);

    let html = '<div class="im-inner">';
    if (lead) html += '<p class="im-lead">' + esc(lead) + '</p>';

    let figIdx = 0;
    // 图文节奏：第 2、4 节后各穿插一张实拍图（叙事—图—叙事—图—收尾）
    sections.forEach((s, i) => {
      // 按空行拆分为多段（story 中以 \n\n 分段，\n 为同段内换行）
      const paras = String(s.p || '').split(/\n\s*\n/).map(t => t.trim()).filter(Boolean);
      html += '<section class="im-section"><h3>' + esc(s.h || '') + '</h3>' +
        paras.map(t => '<p>' + esc(t).replace(/\n/g, '<br>') + '</p>').join('') +
        '</section>';
      // 守卫只看回退源是否存在：figUrl 内部已实现「真实图源优先、超出回退生成」
      if ((i === 1 || i === 3) && (gallery[figIdx] || (galleryUrls && galleryUrls[figIdx]))) {
        html += '<figure class="im-figure">' +
          '<img src="' + esc(figUrl(figIdx)) + '" alt="矿山现场影像" loading="lazy" decoding="async" />' +
          '<figcaption>现场影像 · ' + (CN[figIdx] || figIdx + 1) + '</figcaption>' +
        '</figure>';
        figIdx++;
      }
    });
    // 正文末尾：真实图源来源说明（一行小字）
    if (m.img_credit) html += '<p class="im-credit">' + esc(m.img_credit) + '</p>';
    html += '</div>';
    return html;
  }

  function openIntroModal(m) {
    const heroSrc = imgUrlOr(m.hero_url, m.hero_prompt, IMG_HERO_SIZE);
    imHero.src = heroSrc;
    imHeroBlur.src = heroSrc;
    imHero.alt = m.mine_name + '矿区高空影像';
    $('imTitle').textContent = m.mine_name || '';
    $('imTagline').textContent = m.tagline || DEFAULT_TAGLINE;
    imBody.innerHTML = buildIntroArticle(m);
    bindImgError(imHero);
    bindImgError(imHeroBlur);
    imBody.querySelectorAll('img').forEach(bindImgError);

    lastFocus = document.activeElement;
    introMask.hidden = false;
    // 滚动重置必须在显示之后执行：display:none 下 scrollTop 赋值无效
    imBody.scrollTop = 0;
    document.body.style.overflow = 'hidden';   // 锁定页面滚动
    $('introModalClose').focus();
  }

  function closeIntroModal() {
    introMask.hidden = true;
    document.body.style.overflow = '';
    if (lastFocus && typeof lastFocus.focus === 'function') lastFocus.focus();
    lastFocus = null;
  }

  function initIntroModal() {
    // 关闭：× 按钮 / 遮罩空白 / ESC
    $('introModalClose').addEventListener('click', closeIntroModal);
    introMask.addEventListener('click', e => {
      if (e.target === introMask) closeIntroModal();
    });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && !introMask.hidden) closeIntroModal();
    });

    // 卡片「查看详情」事件委托
    $('introGrid').addEventListener('click', e => {
      const btn = e.target.closest('.intro-more');
      if (!btn) return;
      const m = mines.find(x => x.id === btn.dataset.id);
      if (m) openIntroModal(m);
    });
  }

  // ===== 板块二：矿山事实卡（运营档案：关键指标 + 矿区位置 + 运营信息） =====
  // 信息隔离（PRD 3）：产品与产能字段全部移出本板块，归产品详情板块
  function renderFacts() {
    const wrap = $('factList');
    if (!wrap) return;

    const list = sortedMines();
    const cnt = $('factCount');
    if (cnt) cnt.textContent = list.length;
    if (!list.length) {
      wrap.innerHTML = '<div class="tab-empty">暂无矿山数据，点击右上角「新增矿山」添加</div>';
      return;
    }

    wrap.innerHTML = list.map((m, idx) => {
      const active = m.status === 'active';
      const opYears = operatingYears(m);
      const reserve = (m.reserve != null && m.reserve !== '') ? fmtNum(m.reserve) : null;
      const no = String(idx + 1).padStart(2, '0');

      return '<article class="fact-card" data-id="' + esc(m.id) + '">' +
        '<header class="fact-head">' +
          '<span class="fact-no" aria-hidden="true">' + no + '</span>' +
          '<h3 class="fact-name">' + esc(m.mine_name) + '</h3>' +
          '<span class="fact-code">NO. ' + esc(m.mine_code) + '</span>' +
          '<span class="status-tag ' + esc(m.status) + '">' + esc(STATUS[m.status] || m.status) + '</span>' +
          '<div class="fact-acts">' +
            '<button class="row-act edit" type="button">编辑</button>' +
            '<button class="row-act toggle' + (active ? '' : ' on') + '" type="button">' + (active ? '停用' : '启用') + '</button>' +
          '</div>' +
        '</header>' +
        '<div class="fact-sec-label">KEY FIGURES · 关键运营指标</div>' +
        '<div class="fact-metrics">' +
          '<div class="metric primary"><span class="metric-label">运营年限</span>' +
            '<span class="metric-value">' + (opYears != null ? opYears : '—') + '<i class="metric-unit">' + (opYears === 0 ? '投产首年' : '年') + '</i></span></div>' +
          '<div class="metric"><span class="metric-label">投产年份</span>' +
            '<span class="metric-value">' + (m.commissioned_year || '—') + '</span></div>' +
          '<div class="metric"><span class="metric-label">保有储量</span>' +
            '<span class="metric-value">' + (reserve != null ? reserve : '—') + '<i class="metric-unit">' + (reserve != null ? '万吨' : '') + '</i></span></div>' +
          '<div class="metric"><span class="metric-label">开采类型</span>' +
            '<span class="metric-value txt">' + esc(MINE_TYPES[m.mine_type] || m.mine_type || '—') + '</span></div>' +
        '</div>' +
        '<div class="fact-grid">' +
          '<div class="fact-block"><span class="fact-block-label">LOCATION · 矿区位置</span>' +
            '<div class="fact-line"><span class="line-label">州省 / 国别</span><span class="line-value">' + (esc(m.province) || '—') + '</span></div>' +
            '<div class="fact-line"><span class="line-label">矿区区域</span><span class="line-value">' + (esc(m.city) || '—') + '</span></div>' +
            '<div class="fact-line"><span class="line-label">详细位置</span><span class="line-value">' + (esc(m.address) || '—') + '</span></div>' +
            '<div class="fact-line"><span class="line-label">坐标</span><span class="line-value fact-coord">' + coordText(m) + '</span></div>' +
          '</div>' +
          '<div class="fact-block"><span class="fact-block-label">OPERATOR · 运营信息</span>' +
            '<div class="fact-line"><span class="line-label">运营主体</span><span class="line-value">' + (esc(m.operator) || '—') + '</span></div>' +
            '<div class="fact-line"><span class="line-label">联系人</span><span class="line-value">' + (esc(m.contact_person) || '—') + '</span></div>' +
            '<div class="fact-line"><span class="line-label">联系电话</span><span class="line-value">' + (esc(m.contact_phone) || '—') + '</span></div>' +
            '<div class="fact-line"><span class="line-label">备注</span><span class="line-value">' + (esc(m.remark) || '—') + '</span></div>' +
          '</div>' +
        '</div>' +
      '</article>';
    }).join('');
  }

  // 事实卡操作：编辑 / 停用启用（事件委托）
  function initFactActions() {
    const wrap = $('factList');
    if (!wrap) return;

    wrap.addEventListener('click', e => {
      const card = e.target.closest('.fact-card[data-id]');
      if (!card) return;
      const m = mines.find(x => x.id === card.dataset.id);
      if (!m) return;

      // 编辑：打开抽屉并回填
      if (e.target.closest('.row-act.edit')) {
        openEditor(m);
        return;
      }

      // 停用 / 启用：软删除，二次确认（MINE-06）
      const toggleBtn = e.target.closest('.row-act.toggle');
      if (toggleBtn) {
        const toActive = m.status !== 'active';
        const ok = confirm((toActive ? '确定启用' : '确定停用') +
          '矿山「' + (m.short_name || m.mine_name) + '」吗？' +
          (toActive ? '' : '停用后该矿山将不再出现在后续模块的下拉选项中。'));
        if (!ok) return;

        m.status = toActive ? 'active' : 'inactive';
        m.updated_at = Date.now();
        save();
        renderAll();
      }
    });
  }

  // ===== 板块三：产品详情（条形图 + 按矿/按类分组产品卡 + 参数弹层） =====
  // 产品明细：优先 products_ext（v7 完整矩阵，含 unit 单位），自建矿山回退 main_products
  function extProductsOf(m) {
    if (Array.isArray(m.products_ext) && m.products_ext.length) {
      return m.products_ext.map(p => ({
        name: p.name || '',
        category: p.category || '',
        spec: p.spec || '',
        output: p.output != null ? p.output : null,
        unit: p.unit || '万吨/年',
        grade: p.grade || '',
        impurity: p.impurity || '',
        size: p.size || '',
        moisture: p.moisture || '',
        application: p.application || '',
        desc: p.desc || ''
      }));
    }
    return productsOf(m).map(name => ({ name: name, category: '', spec: '', output: null, unit: '万吨/年', grade: '', impurity: '', size: '', moisture: '', application: '', desc: '' }));
  }

  // ===== 产品详情扩展模块：合作伙伴（v12：价格参考模块已移除） =====
  const PARTNER_TYPES = { steel: '钢铁企业', trader: '矿石贸易商', other: '其他' };
  const PARTNER_STATUS = { lt: '长协', spot: '现货', strategic: '战略' };

  // 来源/备注 hover 气泡（FR-03 共享交互）：悬停或键盘聚焦展示，ESC 失焦收起
  function tipHtml(text, label) {
    return '<span class="ref-tip" tabindex="0" aria-label="' + label + '">' +
      '<i aria-hidden="true">ⓘ</i><span class="ref-tip-bubble">' + esc(text) + '</span></span>';
  }

  // 气泡防裁剪定位（FR-03/E5）：
  // 垂直——滚动容器顶缘放不下且下方空间更大时翻转到图标下方；
  // 水平——气泡右缘锚定图标右侧向左展开（width:max-content），首列卡片较窄时
  //       会越过滚动容器左缘（overflow-y:auto 使 overflow-x 计算为 auto 而被裁切），
  //       按「图标右缘到容器左缘」的可用距离收窄气泡宽度；先定宽再测高（宽度影响换行行数）
  function placeTip(tip) {
    const bubble = tip.querySelector('.ref-tip-bubble');
    const scroller = tip.closest('#productGroups');
    if (!bubble || !scroller) return;
    const sr = scroller.getBoundingClientRect();
    const ir = tip.getBoundingClientRect();
    bubble.style.maxWidth = Math.max(120, Math.min(280, ir.right + 8 - sr.left - 2)) + 'px';
    const aboveRoom = ir.top - sr.top;
    const need = bubble.offsetHeight + 16;
    bubble.classList.toggle('below', aboveRoom < need && (sr.bottom - ir.bottom) > aboveRoom);
  }

  // 合作伙伴条目规范化（容错同上），按 scale_value 降序（缺值排后，稳定排序保持原序）
  function partnersOf(m) {
    if (!Array.isArray(m.partners) || !m.partners.length) return null;
    const rows = m.partners.filter(p => p && p.name).map(p => ({
      name: p.name,
      type: PARTNER_TYPES[p.type] ? p.type : 'other',
      scale: p.scale || '',
      scaleValue: Number(p.scale_value),
      period: p.period || '',
      status: PARTNER_STATUS[p.status] ? p.status : '',
      remark: p.remark || ''
    }));
    if (!rows.length) return null;
    rows.sort((a, b) => {
      const va = isNaN(a.scaleValue) ? -Infinity : a.scaleValue;
      const vb = isNaN(b.scaleValue) ? -Infinity : b.scaleValue;
      return vb - va;
    });
    return rows;
  }

  // 合作伙伴模块 HTML（无有效数据返回空串 → 模块整体不渲染）
  function partnersHtml(m) {
    const rows = partnersOf(m);
    if (!rows) return '';
    const body = rows.map(p =>
      '<tr>' +
        '<td><span class="partner-name">' + esc(p.name) + '</span>' + (p.remark ? tipHtml(p.remark, '合作备注') : '') + '</td>' +
        '<td><span class="partner-type ' + p.type + '">' + PARTNER_TYPES[p.type] + '</span></td>' +
        '<td class="partner-scale">' + (esc(p.scale) || '—') + '</td>' +
        '<td>' + (esc(p.period) || '—') + '</td>' +
        '<td>' + (p.status ? '<span class="partner-status ' + p.status + '">' + PARTNER_STATUS[p.status] + '</span>' : '—') + '</td>' +
      '</tr>'
    ).join('');
    return '<section class="prod-sec">' +
      '<header class="prod-sec-head">' +
        '<h4 class="prod-sec-title">合作伙伴</h4>' +
        '<span class="prod-sec-note">下游客户 · 钢铁企业与矿石贸易商</span>' +
        '<span class="prod-sec-extra">' + rows.length + ' 家</span>' +
      '</header>' +
      '<div class="partner-wrap"><table class="partner-table">' +
        '<thead><tr><th>企业名称</th><th>类型</th><th>合作规模</th><th>合作周期</th><th>状态</th></tr></thead>' +
        '<tbody>' + body + '</tbody>' +
      '</table></div>' +
    '</section>';
  }

  // 产品详情板块当前聚焦的矿山 id（数据变更后保持选中；无效时回退产量最高矿）
  let curMineId = null;

  function renderProducts() {
    const list = sortedMines();
    const chips = $('mineChips');
    const groups = $('productGroups');
    if (!chips || !groups) return;
    if (!list.length) {
      chips.innerHTML = '';
      groups.innerHTML = '<div class="tab-empty">暂无产品数据</div>';
      return;
    }

    // —— 选中矿山：数据变更后尽量保持；无效/未选时默认产量最高矿 ——
    if (!list.some(m => m.id === curMineId)) curMineId = list[0].id;
    const cur = list.find(m => m.id === curMineId) || list[0];

    // —— 矿山切换 chips（名称 + 产品数，选中态高亮） ——
    chips.innerHTML = list.map(m => {
      const on = m.id === curMineId;
      return '<button class="mine-chip' + (on ? ' on' : '') + '" type="button" data-id="' + esc(m.id) +
        '" aria-pressed="' + (on ? 'true' : 'false') + '">' +
        '<span>' + esc(m.mine_name) + '</span><i>' + extProductsOf(m).length + ' 项</i></button>';
    }).join('');

    // —— 单矿聚焦：矿头 banner + 分类折叠分组 ——
    const capNum = Number(cur.annual_capacity) || 0;
    const ps = extProductsOf(cur);

    // 类内占比分母：同 category 且同 unit 的产品产量合计（跨单位不混算）
    const denomOf = p => ps.filter(x => x.category === p.category && x.unit === p.unit)
      .reduce((s, x) => s + (x.output != null ? (Number(x.output) || 0) : 0), 0);

    // 固定分类顺序（业务规则，不可调整）；固定外分类（如必和必拓「镍」）按种子顺序追加在后
    const CAT_ORDER = {
      '力拓': ['铁矿石', '铜', '铝·锂', '工业矿物'],
      '必和必拓': ['铁矿石', '钾盐', '铜', '冶金煤'],
      '淡水河谷': ['铁矿石', '铜', '镍', '锰']
    };
    const fixedCats = CAT_ORDER[cur.short_name] || [];
    const catOrder = fixedCats.filter(c => ps.some(p => (p.category || '其他产品') === c));
    ps.forEach(p => {
      const c = p.category || '其他产品';
      if (catOrder.indexOf(c) < 0) catOrder.push(c);
    });

    // 品类构成摘要：铁矿石×7 · 铜×3 …（最多展示 4 类，超出以省略号收尾）
    const catSummary = catOrder.slice(0, 4).map(cat =>
      esc(cat) + '×' + ps.filter(p => (p.category || '其他产品') === cat).length
    ).join(' · ') + (catOrder.length > 4 ? ' …' : '');

    // 默认展开产量合计最大的分类组（其余折叠），首屏聚焦关键产品
    let maxCat = catOrder[0] || null;
    let maxSum = -1;
    catOrder.forEach(cat => {
      const sum = ps.filter(p => (p.category || '其他产品') === cat)
        .reduce((s, x) => s + (x.output != null ? (Number(x.output) || 0) : 0), 0);
      if (sum > maxSum) { maxSum = sum; maxCat = cat; }
    });

    const cards = p => {
      const out = p.output != null ? (Number(p.output) || 0) : null;
      const denom = denomOf(p);
      const siblings = ps.filter(x => x.category === p.category && x.unit === p.unit && x.output != null).length;
      // 类内有可比产品才显示占比，避免跨单位失真
      const share = (out != null && denom > 0 && siblings > 1) ? Math.round(out / denom * 100) : null;
      return '<article class="prod-card" role="button" tabindex="0" data-mine-id="' + esc(cur.id) +
        '" data-prod-name="' + esc(p.name) + '" aria-label="查看 ' + esc(p.name || '产品') + ' 参数详情">' +
        '<div class="prod-card-top"><span class="prod-name">' + (esc(p.name) || '—') + '</span>' +
        '<span class="prod-cat">' + (esc(p.spec) || '—') + '</span></div>' +
        '<div class="prod-output">' + (out != null ? fmtNum(out) : '—') + '<i>' + esc(p.unit || '万吨/年') + '</i></div>' +
        '<div class="prod-share">' +
          '<div class="prod-share-track"><div class="prod-share-bar" style="width:' + (share != null ? share : 0) + '%"></div></div>' +
          '<span class="prod-share-num">' + (share != null ? share + '%' : '—') + '</span>' +
        '</div>' +
        '<div class="prod-more"><span>点击查看参数</span><i aria-hidden="true">›</i></div>' +
      '</article>';
    };

    // 分类折叠分组：默认仅产量最大组展开，组头可点击切换
    const catSections = catOrder.map(cat => {
      const items = ps.filter(p => (p.category || '其他产品') === cat);
      const open = cat === maxCat;
      return '<section class="prod-cat-group' + (open ? ' open' : '') + '">' +
        '<button class="prod-cat-head" type="button" aria-expanded="' + (open ? 'true' : 'false') + '">' +
          '<i class="prod-cat-chevron" aria-hidden="true">▾</i>' +
          '<span class="prod-cat-name">' + esc(cat) + '</span>' +
          '<i class="prod-cat-count">' + items.length + ' 项产品</i>' +
        '</button>' +
        '<div class="prod-cat-body"' + (open ? '' : ' hidden') + '>' +
          '<div class="prod-cards">' + items.map(cards).join('') + '</div>' +
        '</div>' +
      '</section>';
    }).join('');

    groups.innerHTML = '<section class="prod-group">' +
      '<header class="prod-group-head">' +
        '<div class="prod-group-title">' +
          '<h3 class="prod-group-name">' + esc(cur.mine_name) + '</h3>' +
          '<span class="prod-group-summary">' + catSummary + '</span>' +
        '</div>' +
        '<div class="prod-group-side">' +
          '<button class="btn btn-ghost prod-add-btn" type="button" data-act="add-product" data-mine-id="' + esc(cur.id) + '">＋ 新增产品</button>' +
          '<span class="prod-group-total">' + fmtNum(capNum) + '<i>万吨/年</i></span>' +
        '</div>' +
      '</header>' +
      (catSections || '<div class="tab-empty">暂无产品明细</div>') +
      partnersHtml(cur) +
    '</section>';
  }

  // 切换聚焦矿山（chips / 条形图行共用）；id 无效时忽略
  function selectMine(id) {
    if (!id || id === curMineId) return;
    if (!mines.some(m => m.id === id)) return;
    curMineId = id;
    renderProducts();
  }

  // 折叠组头点击：展开 / 收起该分类组（同步 aria-expanded 与 chevron 旋转）
  function toggleCatGroup(head) {
    const group = head.closest('.prod-cat-group');
    if (!group) return;
    const body = group.querySelector('.prod-cat-body');
    const open = group.classList.toggle('open');
    head.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (body) body.hidden = !open;
  }

  // ===== 产品参数弹层（居中浮层：品位大字 + 参数网格 + 专业描述） =====
  // 打开：产品卡点击 / 键盘 Enter；关闭：× / 遮罩 / ESC（PRD 6）
  const prodMask = $('prodModalMask');
  const prodBody = $('prodModalBody');
  let prodLastFocus = null;   // 关闭后焦点还原到触发的产品卡

  function openProdModal(mine, p, denom) {
    const out = p.output != null ? (Number(p.output) || 0) : null;
    const share = (out != null && denom > 0) ? Math.round(out / denom * 100) : null;
    const meta = [p.category, mine.mine_name + ' 出产'].filter(Boolean).join(' · ');
    // 品位大字标签动态化：铁矿类显示「品位」，其他品类显示「品位 / 纯度」
    const isIron = (p.category || '').indexOf('铁') >= 0;
    // 值为空的参数自动跳过（非铁矿产品无水分等字段时不渲染空行）
    const cell = (label, value) => value
      ? '<div class="pm-cell"><span class="pm-cell-label">' + label + '</span>' +
        '<span class="pm-cell-value">' + esc(value) + '</span></div>'
      : '';

    prodBody.innerHTML =
      '<header class="pm-head">' +
        '<span class="pm-cat">' + esc(meta) + '</span>' +
        '<h3 class="pm-title" id="pmTitle">' + (esc(p.name) || '—') + '</h3>' +
      '</header>' +
      '<div class="pm-grade">' +
        '<span class="pm-grade-label">' + (isIron ? '品位' : '品位 / 纯度') + '</span>' +
        '<span class="pm-grade-value' + (p.grade ? '' : ' empty') + '">' + (esc(p.grade) || '—') + '</span>' +
      '</div>' +
      '<div class="pm-grid">' +
        cell('主要杂质 / 成分', p.impurity) +
        cell('粒度 / 规格', p.size) +
        cell('水分', p.moisture) +
        cell('适用工艺 / 应用', p.application) +
        cell('规格', p.spec) +
        cell('产量', out != null ? fmtNum(out) + ' ' + (p.unit || '万吨/年') : '') +
        cell('类内占比', share != null ? share + '%' : '') +
      '</div>' +
      (p.desc ? '<p class="pm-desc">' + esc(p.desc) + '</p>' : '') +
      '<div class="pm-actions">' +
        '<button class="btn btn-primary" type="button" data-act="edit-product" data-mine-id="' + esc(mine.id) + '" data-prod-name="' + esc(p.name) + '">编辑产品</button>' +
      '</div>';

    prodLastFocus = document.activeElement;
    prodMask.hidden = false;
    document.body.style.overflow = 'hidden';   // 锁定页面滚动
    $('prodModalClose').focus();
  }

  function closeProdModal() {
    prodMask.hidden = true;
    document.body.style.overflow = '';
    if (prodLastFocus && typeof prodLastFocus.focus === 'function') prodLastFocus.focus();
    prodLastFocus = null;
  }

  // 由产品卡 DOM 解析矿山与产品数据（含类内占比分母）
  function openProdModalFromCard(card) {
    const mine = mines.find(x => x.id === card.dataset.mineId);
    if (!mine) return;
    const ps = extProductsOf(mine);
    const p = ps.find(x => x.name === card.dataset.prodName);
    if (!p) return;
    // 类内占比分母：同 category 且同 unit 的产品产量合计（跨单位不混算）
    const denom = ps.filter(x => x.category === p.category && x.unit === p.unit)
      .reduce((s, x) => s + (x.output != null ? (Number(x.output) || 0) : 0), 0);
    openProdModal(mine, p, denom);
  }

  function initProdModal() {
    $('prodModalClose').addEventListener('click', closeProdModal);
    prodMask.addEventListener('click', e => {
      if (e.target === prodMask) closeProdModal();
    });
    document.addEventListener('keydown', e => {
      if (e.key !== 'Escape') return;
      if (!prodMask.hidden) { closeProdModal(); return; }
      // 来源/备注气泡聚焦时 ESC 收起（FR-03）
      const tip = document.activeElement;
      if (tip && tip.classList && tip.classList.contains('ref-tip')) tip.blur();
    });

    // 产品矩阵区事件委托：产品卡开弹层 / 折叠组头切换（两者互不嵌套）
    const groups = $('productGroups');
    // 气泡展示前定位：悬停 / 键盘聚焦时先测空间再显示（FR-03/E5）
    groups.addEventListener('mouseover', e => {
      const tip = e.target.closest('.ref-tip');
      if (tip) placeTip(tip);
    });
    groups.addEventListener('focusin', e => {
      const tip = e.target.closest('.ref-tip');
      if (tip) placeTip(tip);
    });
    groups.addEventListener('click', e => {
      const card = e.target.closest('.prod-card');
      if (card) { openProdModalFromCard(card); return; }
      const head = e.target.closest('.prod-cat-head');
      if (head) toggleCatGroup(head);
      const addBtn = e.target.closest('[data-act="add-product"]');
      if (addBtn) openProdEditor(addBtn.dataset.mineId, null);
    });
    groups.addEventListener('keydown', e => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const card = e.target.closest('.prod-card');
      if (card) {
        e.preventDefault();
        openProdModalFromCard(card);
      }
    });

    // 参数弹层「编辑产品」：先关弹层再开抽屉，避免弹层内容与数据不同步
    prodBody.addEventListener('click', e => {
      const btn = e.target.closest('[data-act="edit-product"]');
      if (!btn) return;
      const mineId = btn.dataset.mineId;
      const name = btn.dataset.prodName;
      closeProdModal();
      openProdEditor(mineId, name);
    });

    // 矿山切换 chips：切换聚焦矿山（chips 为固定主视觉，不随内容滚动）
    $('mineChips').addEventListener('click', e => {
      const chip = e.target.closest('.mine-chip');
      if (chip) selectMine(chip.dataset.id);
    });
  }

  // ===== 全量重渲染（新增/编辑/停用后统一走这里，三板块数据天然联动） =====
  function renderAll() {
    renderIntro();
    renderFacts();
    renderProducts();
  }

  // ===== 顶部标签页切换（分段控件 + 滑动指示块 + 会话记忆 + 深链 ?tab=） =====
  const TAB_KEYS = ['intro', 'info', 'products'];
  const TAB_STORE = 'hz_mine_tab';
  let curTab = 'intro';

  function switchTab(tab, opts) {
    if (TAB_KEYS.indexOf(tab) < 0) tab = 'intro';
    curTab = tab;

    document.querySelectorAll('.tabs-seg .seg-btn').forEach(btn => {
      const on = btn.dataset.tab === tab;
      btn.classList.toggle('active', on);
      btn.setAttribute('aria-selected', on ? 'true' : 'false');
      btn.tabIndex = on ? 0 : -1;
    });

    document.querySelectorAll('.tabs-pane').forEach(pane => {
      pane.classList.toggle('active', pane.id === 'pane' + tab.charAt(0).toUpperCase() + tab.slice(1));
    });

    const idx = TAB_KEYS.indexOf(tab);
    const indicator = $('segIndicator');
    if (indicator) indicator.style.transform = 'translateX(' + idx * 100 + '%)';

    if (!opts || !opts.silent) {
      try { sessionStorage.setItem(TAB_STORE, tab); } catch (e) { /* 忽略 */ }
    }
  }

  function initTabs() {
    const seg = $('tabsSeg');
    if (!seg) return;

    // 初始标签：?tab= 深链 > 会话记忆 > 默认第一个（矿山介绍）
    const fromUrl = new URLSearchParams(location.search).get('tab');
    let stored = null;
    try { stored = sessionStorage.getItem(TAB_STORE); } catch (e) { /* 忽略 */ }
    switchTab(fromUrl || stored || 'intro', { silent: true });

    seg.addEventListener('click', e => {
      const btn = e.target.closest('.seg-btn');
      if (btn) switchTab(btn.dataset.tab);
    });

    // 键盘方向键循环切换（tablist 交互约定）
    seg.addEventListener('keydown', e => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      const idx = TAB_KEYS.indexOf(curTab);
      const next = e.key === 'ArrowRight'
        ? TAB_KEYS[(idx + 1) % TAB_KEYS.length]
        : TAB_KEYS[(idx - 1 + TAB_KEYS.length) % TAB_KEYS.length];
      switchTab(next);
      const btn = seg.querySelector('.seg-btn[data-tab="' + next + '"]');
      if (btn) btn.focus();
      e.preventDefault();
    });
  }

  // ===== 新增 / 编辑抽屉（两组：基础信息 / 矿区位置） =====
  // 产品与产能字段归产品详情板块维护，编辑保存不触碰（PRD 7）
  let editingId = null;        // 正在编辑的矿山 id；null = 新增
  let tipTimer = null;

  function showTip(msg) {
    const tip = $('formTip');
    tip.textContent = msg;
    tip.hidden = false;
    clearTimeout(tipTimer);
    tipTimer = setTimeout(() => { tip.hidden = true; }, 4000);
  }

  function openEditor(m) {
    editingId = m ? m.id : null;
    $('editorTitle').textContent = m ? '编辑矿山（' + (m.mine_code || m.mine_name) + '）' : '新增矿山';

    $('fMineName').value = m ? (m.mine_name || '') : '';
    $('fShortName').value = m ? (m.short_name || '') : '';
    $('fMineType').value = m ? (m.mine_type || 'iron') : 'iron';
    $('fOperator').value = m ? (m.operator || '') : '';
    $('fContactPerson').value = m ? (m.contact_person || '') : '';
    $('fContactPhone').value = m ? (m.contact_phone || '') : '';
    $('fCommissionedYear').value = m && m.commissioned_year ? m.commissioned_year : '';
    $('fStatus').value = m ? (m.status || 'active') : 'active';
    $('fRemark').value = m ? (m.remark || '') : '';
    $('fProvince').value = m ? (m.province || '') : '';
    $('fCity').value = m ? (m.city || '') : '';
    $('fAddress').value = m ? (m.address || '') : '';
    $('fLongitude').value = m && m.longitude != null ? m.longitude : '';
    $('fLatitude').value = m && m.latitude != null ? m.latitude : '';

    $('formTip').hidden = true;
    $('editorMask').hidden = false;
    $('fMineName').focus();
  }

  function closeEditor() {
    $('editorMask').hidden = true;
    editingId = null;
  }

  // 收集抽屉表单并校验；通过返回数据对象，失败返回 null 并提示
  // 仅收集基础信息与矿区位置字段，不含产品与产能（保持数据层原值）
  function collectForm() {
    const name = $('fMineName').value.trim();
    const province = $('fProvince').value.trim();
    const city = $('fCity').value.trim();

    if (!name) { showTip('请填写矿山名称'); $('fMineName').focus(); return null; }
    if (!province) { showTip('请填写州省 / 国别'); $('fProvince').focus(); return null; }
    if (!city) { showTip('请填写矿区区域'); $('fCity').focus(); return null; }

    // 矿山名称唯一（uk_mine_name；编辑时排除自身）
    const dup = mines.find(m => m.mine_name === name && m.id !== editingId);
    if (dup) { showTip('矿山名称「' + name + '」已存在（' + dup.mine_code + '），请修改'); return null; }

    // 经纬度校验：可为空；填写时必须在有效范围内（WGS84）
    const lon = $('fLongitude').value.trim();
    const lat = $('fLatitude').value.trim();
    let longitude = null;
    let latitude = null;
    if (lon !== '') {
      longitude = Number(lon);
      if (isNaN(longitude) || longitude < -180 || longitude > 180) {
        showTip('经度需在 -180 ~ 180 之间'); $('fLongitude').focus(); return null;
      }
    }
    if (lat !== '') {
      latitude = Number(lat);
      if (isNaN(latitude) || latitude < -90 || latitude > 90) {
        showTip('纬度需在 -90 ~ 90 之间'); $('fLatitude').focus(); return null;
      }
    }

    // 投产年份：可为空；填写时需为 1900-2035 的整数
    const yearRaw = $('fCommissionedYear').value.trim();
    let commissionedYear = null;
    if (yearRaw !== '') {
      commissionedYear = Number(yearRaw);
      if (!Number.isInteger(commissionedYear) || commissionedYear < 1900 || commissionedYear > 2035) {
        showTip('投产年份需为 1900-2035 之间的整数');
        $('fCommissionedYear').focus();
        return null;
      }
    }

    return {
      mine_name: name,
      short_name: $('fShortName').value.trim(),
      mine_type: $('fMineType').value,
      commissioned_year: commissionedYear,
      province: province,
      city: city,
      address: $('fAddress').value.trim(),
      longitude: longitude,
      latitude: latitude,
      operator: $('fOperator').value.trim(),
      contact_person: $('fContactPerson').value.trim(),
      contact_phone: $('fContactPhone').value.trim(),
      status: $('fStatus').value,
      remark: $('fRemark').value.trim()
    };
  }

  async function saveEditor() {
    const data = collectForm();
    if (!data) return;

    if (editingId) {
      const old = mines.find(m => m.id === editingId);
      if (!old) { showTip('数据已被删除，请刷新页面'); return; }
      // 编辑仅更新基础与位置字段；products_ext / main_products /
      // annual_capacity / ore_grade 不在 data 中，Object.assign 保持原值
      Object.assign(old, data);
      old.updated_at = Date.now();
    } else {
      // 新增矿山：产品与产能字段置空默认值（排序按 0 排末位），后续由产品板块维护
      Object.assign(data, {
        id: genId(),
        mine_code: genCode(),
        main_products: '',
        annual_capacity: null,
        reserve: null,
        ore_grade: '',
        products_ext: [],
        created_at: Date.now(),
        updated_at: Date.now(),
        created_by: 'admin'   // Q-MINE-06：默认管理员可编辑
      });
      backfillIntroDefaults(data);   // 介绍板块字段补默认回退值
      mines.push(data);
    }

    if (!await save()) return;
    closeEditor();
    renderAll();
  }

  function initEditor() {
    // 新增矿山入口（基础信息板块工具条）
    $('addMineBtn').addEventListener('click', () => openEditor(null));

    $('editorSave').addEventListener('click', saveEditor);
    $('editorCancel').addEventListener('click', closeEditor);
    $('editorClose').addEventListener('click', closeEditor);
    $('editorMask').addEventListener('click', e => {
      if (e.target === $('editorMask')) closeEditor();
    });
  }

  // ===== 产品编辑抽屉（产品详情板块：新增 / 编辑各矿山产品明细） =====
  // 数据写入 mine.products_ext（权威存储），保存后 renderAll() 实时同步矿山 chips、产品列表与卡片
  let prodEditMineId = null;   // 正在编辑的产品所属矿山 id
  let prodEditName = null;     // 编辑时的原产品名；null = 新增
  let prodTipTimer = null;

  function showProdTip(msg) {
    const tip = $('prodFormTip');
    tip.textContent = msg;
    tip.hidden = false;
    clearTimeout(prodTipTimer);
    prodTipTimer = setTimeout(() => { tip.hidden = true; }, 4000);
  }

  function openProdEditor(mineId, prodName) {
    const mine = mines.find(m => m.id === mineId);
    if (!mine) return;
    prodEditMineId = mineId;
    prodEditName = prodName || null;
    $('prodEditorTitle').textContent = (prodName ? '编辑产品' : '新增产品') + '（' + (mine.short_name || mine.mine_name) + '）';

    // 编辑时回填原产品（经 extProductsOf 统一兜底）；unit 缺省回退 万吨/年，产量空回空串
    const p = prodName ? extProductsOf(mine).find(x => x.name === prodName) : null;
    $('pfName').value = p ? (p.name || '') : '';
    $('pfCategory').value = p ? (p.category || '') : '';
    $('pfSpec').value = p ? (p.spec || '') : '';
    $('pfOutput').value = p && p.output != null ? p.output : '';
    $('pfUnit').value = p ? (p.unit || '万吨/年') : '万吨/年';
    $('pfGrade').value = p ? (p.grade || '') : '';
    $('pfImpurity').value = p ? (p.impurity || '') : '';
    $('pfSize').value = p ? (p.size || '') : '';
    $('pfMoisture').value = p ? (p.moisture || '') : '';
    $('pfApplication').value = p ? (p.application || '') : '';
    $('pfDesc').value = p ? (p.desc || '') : '';

    $('prodFormTip').hidden = true;
    $('prodEditorMask').hidden = false;
    $('pfName').focus();
  }

  function closeProdEditor() {
    $('prodEditorMask').hidden = true;
    prodEditMineId = null;
    prodEditName = null;
  }

  async function saveProdEditor() {
    const mine = mines.find(m => m.id === prodEditMineId);
    if (!mine) { showProdTip('矿山数据已被删除，请刷新页面'); return; }

    // 收集 11 个 pf* 字段原始值（pfOutput 保留字符串，交由校验层判断数值合法性）
    const raw = {
      name: $('pfName').value.trim(),
      category: $('pfCategory').value.trim(),
      spec: $('pfSpec').value.trim(),
      output: $('pfOutput').value.trim(),
      unit: $('pfUnit').value,
      grade: $('pfGrade').value.trim(),
      impurity: $('pfImpurity').value.trim(),
      size: $('pfSize').value.trim(),
      moisture: $('pfMoisture').value.trim(),
      application: $('pfApplication').value.trim(),
      desc: $('pfDesc').value.trim()
    };

    // 现有产品名列表（重名校验用）：products_ext 优先；自建矿山回退 main_products 拆名
    const existingNames = (Array.isArray(mine.products_ext) && mine.products_ext.length)
      ? mine.products_ext.map(p => p.name)
      : productsOf(mine);

    const res = MineProductData.validateProduct(raw, existingNames, prodEditName);
    if (!res.ok) {
      showProdTip(res.message);
      $(res.field === 'output' ? 'pfOutput' : 'pfName').focus();
      return;
    }

    // 权威源迁移：老数据仅有 main_products 回退名单时先物化到 products_ext，
    // 防止新增条目后回退名单被挤掉（products_ext 一旦非空即成为唯一展示来源）
    if (!Array.isArray(mine.products_ext) || !mine.products_ext.length) {
      mine.products_ext = productsOf(mine).map(name => ({ name: name, category: '', spec: '', output: null, unit: '万吨/年', grade: '', impurity: '', size: '', moisture: '', application: '', desc: '' }));
    }

    if (prodEditName) {
      const idx = mine.products_ext.findIndex(p => p.name === prodEditName);
      if (idx < 0) { showProdTip('原产品已被删除，请刷新页面'); return; }
      mine.products_ext[idx] = res.data;
    } else {
      mine.products_ext.push(res.data);
    }

    mine.updated_at = Date.now();
    if (!await save()) return;
    closeProdEditor();
    renderAll();
  }

  function initProdEditor() {
    $('prodEditorSave').addEventListener('click', saveProdEditor);
    $('prodEditorCancel').addEventListener('click', closeProdEditor);
    $('prodEditorClose').addEventListener('click', closeProdEditor);
    $('prodEditorMask').addEventListener('click', e => {
      if (e.target === $('prodEditorMask')) closeProdEditor();
    });
  }

  // ===== 导出 Excel：导出全部矿山（MINE-08，按总产量降序） =====
  function initExport() {
    const btn = $('exportBtn');
    if (!btn) return;

    btn.addEventListener('click', () => {
      if (!mines.length) {
        alert('暂无矿山数据可导出');
        return;
      }
      if (!window.XLSX) {
        alert('导出组件加载失败，请刷新页面后重试');
        return;
      }

      if (!confirm('将导出全部 ' + mines.length + ' 座矿山，是否继续？')) return;

      const list = sortedMines();

      const headers = [
        '序号', '矿山编号', '矿山名称', '简称', '矿山类型', '主流产品', '投产年份',
        '州省/国别', '矿区区域', '区域补充', '详细位置',
        '经度', '纬度', '年产能（万吨/年）', '保有储量（万吨）', '品位',
        '运营主体', '联系人', '联系电话', '状态', '创建时间', '创建人', '备注'
      ];

      const rows = list.map((m, i) => [
        i + 1,
        m.mine_code, m.mine_name, m.short_name || '', MINE_TYPES[m.mine_type] || m.mine_type,
        m.main_products, m.commissioned_year || '',
        m.province, m.city, m.district || '', m.address || '',
        m.longitude != null ? m.longitude : '', m.latitude != null ? m.latitude : '',
        Number(m.annual_capacity || 0), Number(m.reserve || 0), m.ore_grade || '',
        m.operator || '', m.contact_person || '', m.contact_phone || '',
        STATUS[m.status] || m.status, fmtTime(m.created_at), m.created_by || '', m.remark || ''
      ]);

      const ws = XLSX.utils.aoa_to_sheet([headers].concat(rows));

      // 列宽设置（字符数）
      ws['!cols'] = [
        { wch: 6 }, { wch: 12 }, { wch: 26 }, { wch: 12 }, { wch: 12 }, { wch: 24 }, { wch: 10 },
        { wch: 14 }, { wch: 14 }, { wch: 12 }, { wch: 32 },
        { wch: 10 }, { wch: 10 }, { wch: 16 }, { wch: 16 }, { wch: 16 },
        { wch: 22 }, { wch: 12 }, { wch: 16 }, { wch: 8 }, { wch: 18 }, { wch: 10 }, { wch: 30 }
      ];

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, '矿山台账');

      const d = new Date();
      const stamp = d.getFullYear() +
        String(d.getMonth() + 1).padStart(2, '0') +
        String(d.getDate()).padStart(2, '0');
      XLSX.writeFile(wb, '矿山台账_' + stamp + '.xlsx');
    });
  }

  // 时间格式化：YYYY-MM-DD HH:mm（导出用）
  function fmtTime(ts) {
    if (!ts) return '—';
    const d = new Date(ts);
    if (isNaN(d.getTime())) return '—';
    const p = n => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) +
      ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }

  // ===== 初始化 =====
  async function boot() {
    await HZDB.ready();          // 启动遮罩 + /api/bootstrap 全量装载（失败可点重试）
    mines = HZDB.get('mines');   // 同步读取数据库缓存（未装载时为空数组兜底）
    if (!Array.isArray(mines)) mines = [];

    initTabs();
    initEditor();
    initFactActions();
    initExport();
    initIntroModal();
    initProdModal();
    initProdEditor();
    renderAll();          // 从数据库缓存恢复数据并渲染三板块

    // 详情编辑直达：?edit=<id> 自动切到「基础信息」板块并打开对应编辑抽屉
    const editId = new URLSearchParams(location.search).get('edit');
    if (editId) {
      const m = mines.find(x => x.id === editId);
      if (m) {
        switchTab('info');
        openEditor(m);
      }
    }
  }
  boot();
})();
