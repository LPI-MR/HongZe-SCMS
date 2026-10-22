/* ============================================================
   钢厂管理模块 · 邯郸/武安地区钢厂档案维护
   布局与仓储管理/汽运车队保持一致（KPI 卡 / 卡片列表 / 详情弹窗 / 编辑抽屉）
   数据暂存 localStorage，接口就绪后仅替换 load/save 即可
   ============================================================ */
(function () {
  'use strict';

  var STORE_KEY = 'hzwl_steels_v2';
  var REV_KEY = 'hzwl_steels_v2_rev';
  var DATA_REV = 2; // 公开资料（产品/矿石需求）数据版本，升级后自动刷新固定钢厂对应字段

  var STEEL_TYPES = {
    '长期合作': 'core',
    '稳定合作': 'stable',
    '潜在合作': 'potential'
  };

  /* ==================== 数据层 ==================== */

  function load() {
    try {
      var raw = localStorage.getItem(STORE_KEY);
      var list = raw ? JSON.parse(raw) : null;
      if (!Array.isArray(list)) {
        list = seed();
      } else {
        // 合并：新版本 seed 中新增的钢厂自动追加，保留用户已有记录与编辑
        var ids = {};
        list.forEach(function (s) { ids[s.id] = 1; });
        seed().forEach(function (s) {
          if (!ids[s.id]) list.push(s);
        });
        // 资料版本升级：刷新固定钢厂的"主要产品/矿石需求"公开资料，其余编辑保留
        var rev = parseInt(localStorage.getItem(REV_KEY) || '0', 10);
        if (rev < DATA_REV) {
          var seedById = {};
          seed().forEach(function (s) { seedById[s.id] = s; });
          list.forEach(function (s) {
            var sd = seedById[s.id];
            if (sd) { s.products = sd.products; s.oreDemand = sd.oreDemand; }
          });
          try { localStorage.setItem(REV_KEY, String(DATA_REV)); } catch (e) { /* 忽略 */ }
        }
      }
      save(list);
      return normalize(list);
    } catch (e) {
      return seed();
    }
  }

  function save(list) {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(list)); } catch (e) { /* 忽略存储异常 */ }
  }

  // 初始钢厂档案（资料来源：企业官网、年报/评级报告、河北省工信厅、人民网/河北日报等公开报道）
  // 矿石需求：标注"估算"的为按产能推算值，采购联系人需线下补充
  function seed() {
    var now = Date.now();
    return [
      {
        id: 'steel-001',
        name: '河北普阳钢铁有限公司',
        type: '长期合作',
        contact: '',
        phone: '',
        address: '河北省邯郸武安市阳邑镇东500米',
        capacity: '600万吨/年（铁、钢、材配套）',
        oreDemand: '约950万吨/年（按产能估算）：进口矿以澳矿PB粉/块、FMG混合粉为主，配加邯邢本地磁铁精粉及巴西矿、块矿球团',
        nature: '中外合资',
        founded: '1992年',
        regTime: '1992-10-05',
        regCapital: '4.56亿美元（45600万美元）',
        regAddress: '河北省邯郸武安市阳邑镇',
        products: '中厚板（高强钢、耐磨钢、容器钢、管线钢、船板·八国船级社认证、风塔钢、桥梁钢、模具钢）、热轧卷板（硅钢基料、马口铁基料、汽车大梁钢、车轮钢）、冷轧带钢（无取向硅钢、镀锌铝镁、彩涂）',
        intro: '始建于1992年，位于邯郸太行山东麓、革命老区武安市阳邑镇，毗邻青兰高速与309国道，具有年产铁、钢、材各600万吨的生产能力，是河北省知名的中厚板生产基地——拥有5条中厚板生产线，可生产6—120mm厚度钢板，产量约占全国中厚板总产量的10%；2024年完成粗钢485万吨、铁水336万吨，总资产980亿元，环保绩效A级企业，自2005年连年上榜中国企业500强，并与东北大学国家重点实验室合作研发高附加值品种钢。',
        remark: '',
        createdAt: now
      },
      {
        id: 'steel-002',
        name: '邯郸钢铁集团有限责任公司（河钢邯钢）',
        type: '稳定合作',
        contact: '',
        phone: '',
        address: '河北省邯郸市复兴区（邯钢新区位于涉县）',
        capacity: '优质钢产能1105万吨/年',
        oreDemand: '约1750万吨/年（估算）：以力拓、淡水河谷、必和必拓、FMG四大矿山长协进口矿为主，配加河钢矿业自产铁精粉（资源掌控量39亿吨）',
        nature: '国有企业（河钢集团核心企业）',
        founded: '1958年',
        regTime: '1995-12-28',
        regCapital: '25亿元（250000万元）',
        regAddress: '邯郸市复兴路232号',
        products: '超低碳家电板（黑色家电深冲件）、汽车用钢、管线钢、优特钢、重轨、优质中板（品种钢为主）',
        intro: '河钢集团核心企业，1958年建厂，现有职工1.8万人，优质钢产能1105万吨/年，是国家重要的精品板材和优特钢生产基地，培育了汽车用钢、家电用钢、优特钢、重轨、优质中板、管线钢、特种气体等系列品牌产品；原复兴区老厂（炼铁产能707万吨/年、炼钢产能595万吨/年）已于2022年12月退城关停，产能整体转移至涉县邯钢新区。',
        remark: '',
        createdAt: now
      },
      {
        id: 'steel-003',
        name: '新兴铸管股份有限公司',
        type: '稳定合作',
        contact: '',
        phone: '',
        address: '河北省武安市上洛阳村北（2672厂区）',
        capacity: '武安本部产品总产能约300万吨/年',
        oreDemand: '2024年实际采购铁矿石约1332万吨：进口矿约75%自用，其余经进口代理对外分销；配加国产精粉',
        nature: '央企控股上市公司（新兴际华集团）',
        founded: '20世纪70年代',
        regTime: '1997-05-24',
        regCapital: '约39.63亿元（396318.23万元）',
        regAddress: '河北省武安市上洛阳村北（二六七二厂区）',
        products: '球墨铸铁管、管铸件、钢格板（产量居世界首位、国内市占30%以上）、优特钢（斗齿钢国内市占前3、外贸高强合金）、热轧带肋钢筋',
        intro: '深交所上市央企（股票代码000778），国务院国资委监管的新兴际华集团核心企业，是全球球墨铸铁管及管铸件研发制造商和竞争力较强的钢铁产品研发制造商。武安本部拥有1280m³钢铁高炉等3座高炉、2座80吨转炉及3条轧钢生产线，配套80万吨铸管生产线，产品总产能约300万吨；截至2024年末铸管年产能300万吨、管铸件年产能20万吨，生产基地遍布河北、安徽、湖北等区域。',
        remark: '',
        createdAt: now
      },
      {
        id: 'steel-004',
        name: '武安市裕华钢铁有限公司',
        type: '稳定合作',
        contact: '',
        phone: '0310-5752935',
        address: '河北省邯郸武安市上团城乡崇义四街村北',
        capacity: '',
        oreDemand: '自有矿山配套（集团矿业板块），外购以进口澳矿PB粉、巴西混矿为主，配加邯邢本地磁铁精粉',
        nature: '民营企业',
        founded: '2003年',
        regTime: '2003-03-28',
        regCapital: '10亿元（100000万元）',
        regAddress: '河北省邯郸武安市上团城乡崇义四街村北',
        products: '钢坯、热轧带肋钢筋（HRB400/HRB400E/HRB500）、热轧优质线材、热轧卷板',
        intro: '成立于2003年3月，占地约3800余亩，现有固定资产650亿元、员工3万余人（集团口径），旗下设有钢铁冶炼、矿山资源、金融投资、国际贸易、循环经济、生态旅游、环保科技、铁路物流等多个板块；系河北省重点钢铁企业、省钢铁协会副会长单位、中国钢铁工业协会会员单位，国家工信部第一批"钢铁规范管理"认定企业。',
        remark: '电话为公司公开登记电话，采购专线待补充',
        createdAt: now
      },
      {
        id: 'steel-005',
        name: '河北文安钢铁集团有限公司',
        type: '潜在合作',
        contact: '',
        phone: '',
        address: '河北省邯郸武安市',
        capacity: '年轧材约300万吨',
        oreDemand: '自有邯邢文辉矿业（西石门、玉石洼铁矿）供应磁铁精粉，不足部分外购进口粉矿',
        nature: '民营企业',
        founded: '1993年',
        regTime: '2003-12-26',
        regCapital: '约65.36亿元（653635万元）',
        regAddress: '河北省邯郸武安市',
        products: '热轧带钢（110万吨/年）、热轧光圆钢筋、热轧圆盘条、高速线材（80万吨/年）',
        intro: '始建于1993年，现有职工5000余人，已形成集矿山开采、烧结、炼铁、炼钢、轧钢于一体的钢铁联合企业；拥有200㎡烧结机1台、108㎡烧结机2台，510m³高炉2座、1080m³高炉1座、50吨转炉2座，以及年产80万吨高速线材生产线1条、110万吨热轧带钢生产线2条；正在实施产能减量置换升级改造优特钢项目（总投资69.7亿元，建设1430m³高炉、120吨转炉及1450热轧生产线）。',
        remark: '',
        createdAt: now
      },
      {
        id: 'steel-006',
        name: '河北永洋特钢集团有限公司',
        type: '潜在合作',
        contact: '',
        phone: '',
        address: '河北省邯郸市永年区永年特钢工业园区',
        capacity: '年产量400多万吨（2021年粗钢102万吨）',
        oreDemand: '约160万吨/年（按粗钢产量估算）：进口粉矿为主，配加邯邢本地磁铁精粉',
        nature: '民营企业',
        founded: '1993年',
        regTime: '1993-06-15',
        regCapital: '4.17亿元（41700万元）',
        regAddress: '河北省邯郸市永年区',
        products: '轻轨、重轨、起重机钢轨、矿用支护型钢、H型钢、弹簧扁钢',
        intro: '成立于1993年，位于邯郸市永年区永年特钢工业园区，占地500多公顷（6000余亩），员工4000余人，年产量400多万吨，是全国规模最大、品种最多、规格最全的轻轨、重轨、矿山专用钢材生产基地，钢轨、起重机轨、矿工钢行业国家标准制定企业；累计投资13亿元引进活性焦脱硫脱硝干法一体化治理等环保工艺，达到钢铁行业超低排放标准；2021年实现销售收入79.43亿元。',
        remark: '',
        createdAt: now
      },
      {
        id: 'steel-007',
        name: '天津铁厂有限公司（天铁）',
        type: '潜在合作',
        contact: '',
        phone: '',
        address: '河北省邯郸市涉县更乐镇（冀·津循环经济示范区天铁工业区）',
        capacity: '炼铁304万吨、炼钢125万吨（升级改造后）',
        oreDemand: '约480万吨/年（按炼铁产能估算）：以进口矿为主（经天津港/曹妃甸港到港短倒），配加国产精粉',
        nature: '国有企业（天津市属法人独资）',
        founded: '1990年',
        regTime: '1990-03-05',
        regCapital: '约70.1亿元（701039.48万元，实缴）',
        regAddress: '河北省邯郸市涉县更乐镇',
        products: '生铁、钢锭、钢坯、特钢商品卷',
        intro: '注册于邯郸涉县的天津市属大型钢铁联合企业，地处冀·津（涉县·天铁）循环经济产业示范区，员工6800余人；正在实施装备升级改造项目，一期建设1780m³高炉、110吨转炉、110吨LF精炼炉及方坯连铸机，项目完成后炼铁产能304万吨、炼钢产能125万吨；特钢板材品种拓宽项目形成年产特钢商品卷150万吨能力，另建有投资12亿元、年产氧气5.37亿立方米的制氧中心。',
        remark: '',
        createdAt: now
      },
      {
        id: 'steel-008',
        name: '河北太行钢铁集团有限公司',
        type: '潜在合作',
        contact: '',
        phone: '13785088578',
        address: '河北省邯郸武安市徘徊镇顺义庄村南（南洺河工业园）',
        capacity: '炼铁268万吨、炼钢280万吨（设计产能）',
        oreDemand: '约430万吨/年（按炼铁产能估算）：进口澳矿为主，配套球团链篦机回转窑使用进口精粉制球团',
        nature: '民营企业',
        founded: '2013年',
        regTime: '2013-09-02',
        regCapital: '21.8亿元（218000万元）',
        regAddress: '河北省邯郸武安市徘徊镇顺义庄村南',
        products: 'ESP无头轧制薄带钢（以热代冷，最薄约0.7mm）、热轧板卷',
        intro: '位于武安市工业园区南洺河工业园，总资产200亿元、在职员工7000余人，高新技术企业、制造业单项冠军、绿色工厂。新厂区一期总投资约130亿元，2019年7月动工、2021年7月全线投产，占地4700亩，主要装备包括300㎡带式烧结机2台、球团链篦机回转窑1座等；尤其从欧洲引进的ESP生产线实现薄板"以热代冷"，工艺、设备、环保全部按世界一流技术水平装备；达产后年设计产能炼铁268万吨、炼钢280万吨，可实现营业收入149亿元、利税33亿元。',
        remark: '电话为公司公开登记电话，采购专线待补充',
        createdAt: now
      },
      {
        id: 'steel-009',
        name: '冀南钢铁集团有限公司',
        type: '潜在合作',
        contact: '',
        phone: '',
        address: '河北省邯郸武安市上团城镇兴凯街东侧',
        capacity: '炼钢产能315万吨（二期置换升级中）',
        oreDemand: '约430万吨/年（按置换后产能估算）：集团自有矿山配套，外购以进口澳矿、巴西矿为主，配加邯邢本地精粉',
        nature: '民营企业（以裕华钢铁为骨干组建）',
        founded: '2005年（集团2014年正式组建）',
        regTime: '2005-09-09',
        regCapital: '13亿元（130000万元）',
        regAddress: '河北省邯郸武安市上团城镇兴凯街东侧',
        products: '中厚板、热轧带钢、热轧卷板、高速线材、冷轧薄板、不锈钢板、H型钢、螺纹钢、铸造用生铁（26个系列2000余个规格；"冀南、裕冠、兴华、港陆"牌省名牌产品）',
        intro: '坐落于"中国冶炼之乡"武安市，是以裕华钢铁为骨干组建的中国特大型民营钢铁集团，实质性兼并重组峰峰华信特钢、文丰钢铁、兴华钢铁、唐山港陆钢铁、唐山新宝泰、唐山国堂钢铁、山西裕福焦化、山西宝山矿业等公司；高新技术企业、制造业单项冠军企业，是业内少数具备全流程合规运营能力的钢铁企业之一；正在实施二期钢铁产能减量置换升级改造项目，炼钢产能315万吨（置换比例1.25:1）。',
        remark: '',
        createdAt: now
      },
      {
        id: 'steel-010',
        name: '金鼎钢铁集团有限公司',
        type: '潜在合作',
        contact: '',
        phone: '',
        address: '河北省邯郸武安工业园区青龙山工业园区',
        capacity: '钢铁产能800万吨（集团口径）',
        oreDemand: '约1280万吨/年（按集团钢铁产能估算）：进口矿为主，集团自有矿山及焦化板块配套',
        nature: '民营企业（方同舟控股旗下）',
        founded: '1995年（注册主体2002年）',
        regTime: '2002-07-19',
        regCapital: '1.2亿元（12000万元）',
        regAddress: '河北省邯郸市武安工业园区青龙山工业园区',
        products: '装配式建筑用钢、热轧卷板（超短流程轧制，最薄0.7mm、精品钢20余种）；焦化板块：焦炭、甲醇、LNG及焦油、粗苯、氢气等化工产品',
        intro: '始建于1995年，隶属于方同舟控股有限公司，是一家集钢铁、焦化、矿山资源、装备制造、国际贸易、地产开发于一体的跨行业、跨区域综合性大型民营钢铁企业集团；集团现拥有钢铁产能800万吨、焦化产能1000万吨，年产值近1000亿元；成员企业金鼎重工有限公司位于武安市青龙山工业园，占地2600余亩。',
        remark: '',
        createdAt: now
      },
      {
        id: 'steel-011',
        name: '河北新金钢铁有限公司',
        type: '潜在合作',
        contact: '',
        phone: '',
        address: '河北省邯郸武安市骈山村东',
        capacity: '',
        oreDemand: '外购进口粉矿为主（澳矿、巴西矿），配加邯邢本地磁铁精粉',
        nature: '民营企业',
        founded: '1999年（集团始建1993年）',
        regTime: '1999-06-18',
        regCapital: '7.88亿元（78800万元）',
        regAddress: '河北省邯郸武安市骈山村东',
        products: '冷轧板、镀锌板、热轧板、高速线材、光伏发电用高强韧结构钢、家电板（3D打印定制化服务）',
        intro: '新金集团骨干企业，集团始建于1993年，经30年转型升级形成以钢铁为主导产业，集科技、金融、投资、外贸、旅游、焦化、铸造、新能源等多项战略新兴产业协同发展的格局；多次跻身中国企业500强、中国制造业500强、河北省百强企业，先后荣获国家"首都蓝天行动科技示范工程"等百余项荣誉；正与河北永洋特钢、邯郸紫山特钢实施整合重组升级改造项目（产能减量置换）。',
        remark: '',
        createdAt: now
      }
    ];
  }

  // 记录字段兜底（兼容早期版本数据）
  function normalize(list) {
    var changed = false;
    list.forEach(function (s) {
      if (!STEEL_TYPES[s.type]) { s.type = '稳定合作'; changed = true; }
      ['contact', 'phone', 'address', 'capacity', 'oreDemand', 'nature', 'founded', 'regTime', 'regCapital', 'regAddress', 'products', 'intro', 'remark'].forEach(function (k) {
        if (typeof s[k] !== 'string') { s[k] = ''; changed = true; }
      });
      if (!s.id) { s.id = genId(); changed = true; }
      if (!s.createdAt) { s.createdAt = Date.now(); changed = true; }
    });
    if (changed) save(list);
    return list;
  }

  function genId() {
    return 'steel-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  function esc(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function fmtTime(ts) {
    var d = new Date(ts);
    function p(n) { return n < 10 ? '0' + n : '' + n; }
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }

  /* ==================== 渲染 ==================== */

  var suppliers = load();
  var grid = document.getElementById('supplier-grid');
  var searchInput = document.getElementById('supplier-search');

  // KPI 总览：钢厂总数 + 合作等级分布（与仓储/车队一致的四卡布局）
  function renderKpi() {
    var kpiGrid = document.getElementById('kpi-grid');
    var total = suppliers.length;
    var byType = {};
    suppliers.forEach(function (s) { byType[s.type] = (byType[s.type] || 0) + 1; });

    var mainTypes = ['长期合作', '稳定合作', '潜在合作'];
    var cards = [{ label: '钢厂总数', value: total, cls: 'blue' }]
      .concat(mainTypes.map(function (t) { return { label: t, value: byType[t] || 0, cls: '' }; }));

    kpiGrid.innerHTML = cards.map(function (c) {
      return '<div class="kpi-card ' + c.cls + '">' +
        '<div class="kpi-info">' +
          '<div class="kpi-label">' + esc(c.label) + '</div>' +
          '<div class="kpi-value">' + c.value + '</div>' +
        '</div>' +
      '</div>';
    }).join('');
  }

  // 钢厂卡片网格（按搜索词过滤，最新录入在前）
  function renderList() {
    var kw = (searchInput.value || '').trim().toLowerCase();

    var list = kw
      ? suppliers.filter(function (s) {
          return [s.name, s.address, s.products].some(function (v) {
            return (v || '').toLowerCase().indexOf(kw) !== -1;
          });
        })
      : suppliers.slice().sort(function (a, b) { return b.createdAt - a.createdAt; });

    if (!list.length) {
      grid.innerHTML = '<div class="empty-state">' + (kw ? '未找到匹配的钢厂' : '暂无钢厂，点击右上角「新增钢厂」添加') + '</div>';
      return;
    }

    grid.innerHTML = list.map(function (s) {
      return '<div class="supplier-card" data-id="' + esc(s.id) + '" title="点击查看详情">' +
        '<div class="s-head">' +
          '<div class="s-name">' + esc(s.name) + '</div>' +
          '<span class="type-badge ' + (STEEL_TYPES[s.type] || 'stable') + '">' + esc(s.type) + '</span>' +
        '</div>' +
        '<div class="s-info">' +
          '<div class="s-row"><span class="s-label">采购联系人</span><span class="s-value ' + (s.contact ? '' : 'empty') + '">' + (esc(s.contact) || '—') + '</span></div>' +
          '<div class="s-row"><span class="s-label">联系电话</span><span class="s-value ' + (s.phone ? '' : 'empty') + '">' + (esc(s.phone) || '—') + '</span></div>' +
          '<div class="s-row"><span class="s-label">地址</span><span class="s-value ' + (s.address ? '' : 'empty') + '">' + (esc(s.address) || '—') + '</span></div>' +
        '</div>' +
        '<div class="s-foot">' +
          '<span>录入时间 ' + fmtTime(s.createdAt) + '</span>' +
          '<span class="s-more">查看详情 →</span>' +
        '</div>' +
      '</div>';
    }).join('');
  }

  function renderAll() { renderKpi(); renderList(); renderMap(); }

  /* ==================== 邯郸钢企地区分布 ==================== */

  // 地图标记（坐标对应 steel.html 内邯郸市真实区划地图；label 为展板用简称）
  // anchor: start 标签在点右侧 / end 标签在点左侧；dy: 标签纵向微调（密集区避让）
  // 标记坐标按各厂址真实经纬度换算（WGS84，来源：排污许可证/竣工验收报告/企业水保监测方案等公开文件），
  // 底图为 GCJ-02 投影（x=(lng-113.47)×473.6+24, y=(37.02-lat)×473.6+80，已含约 +0.0046°/+0.0024° 火星偏移）。
  // 裕华/冀南/金鼎三厂在上团城乡实际相邻（相距不足1km），为避免圆点互相遮挡做了少量示意性拉开
  var MARKERS = [
    { id: 'steel-001', x: 242.4, y: 214.3, label: '普阳钢铁', anchor: 'end', dy: -4 },
    { id: 'steel-002', x: 485.5, y: 277.2, label: '邯钢本部', anchor: 'start', cls: 'hq' },
    { id: 'steel-003', x: 343.7, y: 268.4, label: '新兴铸管', anchor: 'start' },
    { id: 'steel-004', x: 317, y: 209, label: '裕华钢铁', anchor: 'end' },
    { id: 'steel-005', x: 360.2, y: 239.8, label: '文安钢铁', anchor: 'start', dy: 10 },
    { id: 'steel-006', x: 455.6, y: 192.7, label: '永洋特钢', anchor: 'start' },
    { id: 'steel-007', x: 156.7, y: 282.2, label: '天津铁厂', anchor: 'start' },
    { id: 'steel-008', x: 316.2, y: 271.3, label: '太行钢铁', anchor: 'end' },
    { id: 'steel-009', x: 332, y: 219, label: '冀南钢铁', anchor: 'start', dy: -6 },
    { id: 'steel-010', x: 322, y: 231, label: '金鼎钢铁', anchor: 'end' },
    { id: 'steel-011', x: 376.2, y: 223, label: '新金钢铁', anchor: 'start', dy: 6 }
  ];

  // 区县分组（新录入钢厂默认归入武安市）
  var DISTRICT_MAP = {
    'steel-001': '武安市', 'steel-003': '武安市', 'steel-004': '武安市', 'steel-005': '武安市',
    'steel-008': '武安市', 'steel-009': '武安市', 'steel-010': '武安市', 'steel-011': '武安市',
    'steel-006': '永年区', 'steel-007': '涉县', 'steel-002': '复兴区（本部）'
  };

  function districtOf(s) { return DISTRICT_MAP[s.id] || '武安市'; }

  // 展示简称（新录入钢厂用全名）
  var SHORT_NAMES = {
    'steel-001': '普阳钢铁', 'steel-002': '河钢邯钢', 'steel-003': '新兴铸管', 'steel-004': '裕华钢铁',
    'steel-005': '文安钢铁', 'steel-006': '永洋特钢', 'steel-007': '天津铁厂', 'steel-008': '太行钢铁',
    'steel-009': '冀南钢铁', 'steel-010': '金鼎钢铁', 'steel-011': '新金钢铁'
  };

  function shortName(s) { return SHORT_NAMES[s.id] || s.name; }

  // SVG 命名空间创建
  function svgEl(tag, attrs) {
    var el = document.createElementNS('http://www.w3.org/2000/svg', tag);
    Object.keys(attrs).forEach(function (k) { el.setAttribute(k, attrs[k]); });
    return el;
  }

  // 标记点绘制（主地图与放大视图共用；可点击查看详情）
  function drawMarkers(layer) {
    layer.innerHTML = '';

    MARKERS.forEach(function (m) {
      var s = suppliers.find(function (x) { return x.id === m.id; });
      if (!s) return;

      var g = svgEl('g', { class: 'map-marker' + (m.cls ? ' ' + m.cls : '') });
      g.appendChild(svgEl('circle', { cx: m.x, cy: m.y, r: 7 }));
      var text = svgEl('text', {
        x: m.anchor === 'end' ? m.x - 12 : m.x + 12,
        y: m.y + 5 + (m.dy || 0),
        'text-anchor': m.anchor === 'end' ? 'end' : 'start'
      });
      text.textContent = m.label;
      g.appendChild(text);

      var tip = svgEl('title', {});
      tip.textContent = s.name + '（点击查看详情）';
      g.appendChild(tip);

      // stopPropagation：避免点击标记时冒泡触发地图放大
      g.addEventListener('click', function (e) {
        e.stopPropagation();
        openDetail(s);
      });
      layer.appendChild(g);
    });
  }

  function renderMap() {
    var layer = document.getElementById('map-markers');
    if (!layer) return;
    drawMarkers(layer);
    renderDistrictList();
  }

  // 右侧区县分组统计（chip 可点击查看详情）
  function renderDistrictList() {
    var box = document.getElementById('district-list');
    if (!box) return;

    var groups = {};
    suppliers.forEach(function (s) {
      var d = districtOf(s);
      (groups[d] = groups[d] || []).push(s);
    });

    var order = ['武安市', '复兴区（本部）', '永年区', '涉县'];
    var keys = order.filter(function (k) { return groups[k]; })
      .concat(Object.keys(groups).filter(function (k) { return order.indexOf(k) === -1; }));

    box.innerHTML = keys.map(function (k) {
      return '<div class="district-item">' +
        '<div class="d-name">' + esc(k) + ' <span style="color:var(--gray-500);font-weight:400">' + groups[k].length + '家</span></div>' +
        '<div class="d-companies">' +
          groups[k].map(function (s) {
            return '<button type="button" class="d-chip" data-id="' + esc(s.id) + '" title="点击查看详情">' + esc(shortName(s)) + '</button>';
          }).join('') +
        '</div>' +
      '</div>';
    }).join('');
  }

  // 区县 chip 点击 → 详情
  document.getElementById('district-list').addEventListener('click', function (e) {
    var chip = e.target.closest('.d-chip');
    if (!chip) return;
    var s = suppliers.find(function (x) { return x.id === chip.getAttribute('data-id'); });
    if (s) openDetail(s);
  });

  /* ==================== 地图放大预览 ==================== */

  var zoomMask = document.getElementById('map-zoom-mask');
  var zoomModal = document.getElementById('map-zoom-modal');
  var zoomBody = document.getElementById('map-zoom-body');

  // 打开放大视图：克隆主地图（避免 id 重复），重绘标记并绑定点击
  function openMapZoom() {
    var src = document.getElementById('handan-map');
    if (!src || zoomModal.hidden === false) return;

    var clone = src.cloneNode(true);
    clone.removeAttribute('id');
    var layer = clone.querySelector('#map-markers');
    if (layer) layer.id = 'map-zoom-markers';
    var districts = clone.querySelector('#map-districts');
    if (districts) districts.removeAttribute('id');

    zoomBody.innerHTML = '';
    zoomBody.appendChild(clone);
    var zoomLayer = document.getElementById('map-zoom-markers');
    if (zoomLayer) drawMarkers(zoomLayer);

    zoomMask.hidden = false;
    zoomModal.hidden = false;
    document.body.classList.add('drawer-open');
  }

  function closeMapZoom() {
    zoomMask.hidden = true;
    zoomModal.hidden = true;
    zoomBody.innerHTML = '';
    if (drawer.hidden && modal.hidden) document.body.classList.remove('drawer-open');
  }

  document.getElementById('map-zoom-btn').addEventListener('click', openMapZoom);
  document.querySelector('.map-stage').addEventListener('click', openMapZoom);
  document.getElementById('map-zoom-close').addEventListener('click', closeMapZoom);
  zoomMask.addEventListener('click', closeMapZoom);

  /* ==================== 新增 / 编辑钢厂抽屉 ==================== */

  var mask = document.getElementById('drawer-mask');
  var drawer = document.getElementById('add-drawer');
  var form = document.getElementById('supplier-form');
  var nameInput = document.getElementById('f-name');
  var drawerTitle = document.getElementById('drawer-title');
  var submitBtn = document.getElementById('btn-submit');
  var nameErr = document.createElement('div');
  nameErr.className = 'form-err';
  nameErr.textContent = '请输入钢厂名称，且不能与已有钢厂重复';
  nameInput.parentElement.appendChild(nameErr);

  // 当前编辑的钢厂 id（null = 新增模式）
  var editingId = null;

  function openDrawer(steel) {
    closeDetail();
    editingId = steel ? steel.id : null;
    drawerTitle.textContent = steel ? '编辑钢厂' : '新增钢厂';
    submitBtn.textContent = steel ? '保存修改' : '保存钢厂';
    mask.hidden = false;
    drawer.hidden = false;
    document.body.classList.add('drawer-open');
    nameInput.classList.remove('error');
    nameErr.classList.remove('show');
    form.reset();

    if (steel) {
      nameInput.value = steel.name || '';
      document.getElementById('f-type').value = STEEL_TYPES[steel.type] ? steel.type : '稳定合作';
      document.getElementById('f-contact').value = steel.contact || '';
      document.getElementById('f-phone').value = steel.phone || '';
      document.getElementById('f-address').value = steel.address || '';
      document.getElementById('f-capacity').value = steel.capacity || '';
      document.getElementById('f-ore-demand').value = steel.oreDemand || '';
      document.getElementById('f-nature').value = steel.nature || '';
      document.getElementById('f-founded').value = steel.founded || '';
      document.getElementById('f-reg-time').value = steel.regTime || '';
      document.getElementById('f-reg-capital').value = steel.regCapital || '';
      document.getElementById('f-reg-address').value = steel.regAddress || '';
      document.getElementById('f-intro').value = steel.intro || '';
      document.getElementById('f-remark').value = steel.remark || '';
    }

    nameInput.focus();
  }

  function closeDrawer() {
    editingId = null;
    mask.hidden = true;
    drawer.hidden = true;
    document.body.classList.remove('drawer-open');
  }

  document.getElementById('open-add').addEventListener('click', function () { openDrawer(); });
  document.getElementById('drawer-close').addEventListener('click', closeDrawer);
  document.getElementById('btn-cancel').addEventListener('click', closeDrawer);
  mask.addEventListener('click', function () { closeDetail(); closeDrawer(); });

  form.addEventListener('submit', function (e) {
    e.preventDefault();

    var name = nameInput.value.trim();
    var dup = suppliers.some(function (s) { return s.name === name && s.id !== editingId; });
    if (!name || dup) {
      nameInput.classList.add('error');
      nameErr.classList.add('show');
      nameInput.focus();
      return;
    }
    nameInput.classList.remove('error');
    nameErr.classList.remove('show');

    var data = {
      name: name,
      type: document.getElementById('f-type').value,
      contact: document.getElementById('f-contact').value.trim(),
      phone: document.getElementById('f-phone').value.trim(),
      address: document.getElementById('f-address').value.trim(),
      capacity: document.getElementById('f-capacity').value.trim(),
      oreDemand: document.getElementById('f-ore-demand').value.trim(),
      nature: document.getElementById('f-nature').value.trim(),
      founded: document.getElementById('f-founded').value.trim(),
      regTime: document.getElementById('f-reg-time').value.trim(),
      regCapital: document.getElementById('f-reg-capital').value.trim(),
      regAddress: document.getElementById('f-reg-address').value.trim(),
      intro: document.getElementById('f-intro').value.trim(),
      remark: document.getElementById('f-remark').value.trim()
    };

    if (editingId) {
      // 编辑模式：更新已有记录（保留 id 与录入时间）
      var target = suppliers.find(function (s) { return s.id === editingId; });
      if (target) Object.assign(target, data);
    } else {
      suppliers.push(Object.assign({ id: genId(), createdAt: Date.now() }, data));
    }

    save(suppliers);
    renderAll();
    closeDrawer();
  });

  /* ==================== 钢厂详情弹窗 ==================== */

  var modalMask = document.getElementById('modal-mask');
  var modal = document.getElementById('detail-modal');
  var modalBody = document.getElementById('detail-body');

  function openDetail(s) {
    closeDrawer();
    modalBody.innerHTML =
      '<div class="d-head">' +
        '<div class="s-name">' + esc(s.name) + '</div>' +
        '<span class="type-badge ' + (STEEL_TYPES[s.type] || 'stable') + '">' + esc(s.type) + '</span>' +
      '</div>' +

      '<div class="d-block">' +
        '<div class="d-label">经营指标</div>' +
        '<div class="cap-grid">' +
          '<div class="cap-item"><div class="cap-value ' + (s.capacity ? '' : 'empty') + '">' + (esc(s.capacity) || '—') + '</div><div class="cap-label">粗钢产能</div></div>' +
          '<div class="cap-item"><div class="cap-value ' + (s.oreDemand ? '' : 'empty') + '">' + (esc(s.oreDemand) || '—') + '</div><div class="cap-label">矿石需求</div></div>' +
          '<div class="cap-item"><div class="cap-value ' + (s.nature ? '' : 'empty') + '">' + (esc(s.nature) || '—') + '</div><div class="cap-label">企业性质</div></div>' +
          '<div class="cap-item"><div class="cap-value ' + (s.founded ? '' : 'empty') + '">' + (esc(s.founded) || '—') + '</div><div class="cap-label">建厂时间</div></div>' +
        '</div>' +
      '</div>' +

      '<div class="d-block">' +
        '<div class="d-label">注册信息</div>' +
        '<div class="d-section">' +
          '<div class="s-row detail-row"><span class="s-label">注册时间</span><span class="s-value ' + (s.regTime ? '' : 'empty') + '">' + (esc(s.regTime) || '—') + '</span></div>' +
          '<div class="s-row detail-row"><span class="s-label">注册资本</span><span class="s-value ' + (s.regCapital ? '' : 'empty') + '">' + (esc(s.regCapital) || '—') + '</span></div>' +
          '<div class="s-row detail-row"><span class="s-label">注册地址</span><span class="s-value ' + (s.regAddress ? '' : 'empty') + '">' + (esc(s.regAddress) || '—') + '</span></div>' +
        '</div>' +
      '</div>' +

      '<div class="d-block">' +
        '<div class="d-label">基础信息</div>' +
        '<div class="d-section">' +
          '<div class="s-row detail-row"><span class="s-label">采购联系人</span><span class="s-value ' + (s.contact ? '' : 'empty') + '">' + (esc(s.contact) || '—') + '</span></div>' +
          '<div class="s-row detail-row"><span class="s-label">采购电话</span><span class="s-value ' + (s.phone ? '' : 'empty') + '">' + (esc(s.phone) || '—') + '</span></div>' +
          '<div class="s-row detail-row"><span class="s-label">厂区地址</span><span class="s-value ' + (s.address ? '' : 'empty') + '">' + (esc(s.address) || '—') + '</span></div>' +
          '<div class="s-row detail-row"><span class="s-label">录入时间</span><span class="s-value">' + fmtTime(s.createdAt) + '</span></div>' +
        '</div>' +
      '</div>' +

      '<div class="d-block">' +
        '<div class="d-label">钢厂简介</div>' +
        '<div class="d-intro ' + (s.intro ? '' : 'empty') + '">' + (esc(s.intro) || '暂无简介') + '</div>' +
      '</div>' +

      (s.remark ? '<div class="d-block"><div class="d-label">备注</div><div class="d-intro">' + esc(s.remark) + '</div></div>' : '') +

      '<div class="drawer-footer d-footer">' +
        '<button type="button" class="btn-ghost" id="detail-del">删除钢厂</button>' +
        '<button type="button" class="btn-primary" id="detail-edit">编辑钢厂</button>' +
      '</div>';

    document.getElementById('detail-edit').addEventListener('click', function () {
      closeDetail();
      openDrawer(s);
    });

    document.getElementById('detail-del').addEventListener('click', function () {
      if (window.confirm('确定删除钢厂「' + s.name + '」吗？')) {
        suppliers = suppliers.filter(function (x) { return x.id !== s.id; });
        save(suppliers);
        renderAll();
        closeDetail();
      }
    });

    modalMask.hidden = false;
    modal.hidden = false;
    document.body.classList.add('drawer-open');
  }

  function closeDetail() {
    modalMask.hidden = true;
    modal.hidden = true;
    // 仅当新增/编辑抽屉也处于关闭状态时才移除遮罩锁
    if (drawer.hidden) document.body.classList.remove('drawer-open');
  }

  document.getElementById('detail-close').addEventListener('click', closeDetail);

  grid.addEventListener('click', function (e) {
    var card = e.target.closest('.supplier-card');
    if (!card) return;
    var s = suppliers.find(function (x) { return x.id === card.getAttribute('data-id'); });
    if (s) openDetail(s);
  });

  // Esc：优先关闭详情弹窗，再关闭抽屉，最后关闭地图放大视图
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    if (!modal.hidden) { closeDetail(); return; }
    if (!drawer.hidden) closeDrawer();
    if (!zoomModal.hidden) closeMapZoom();
  });

  /* ==================== 搜索 ==================== */

  searchInput.addEventListener('input', renderList);

  renderAll();
})();
