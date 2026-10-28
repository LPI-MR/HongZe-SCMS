// ===== mine 模块脚本（矿山管理 · 三板块重构版） =====
// 板块结构：矿山介绍（叙事卡片 + 沉浸式详情弹层）/ 基础信息（事实看板） / 产品详情（产品矩阵）
// 公共导航栏由 /common/fetch.js 加载；数据持久化到 localStorage（hz_mines），本模块为权威数据源
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

  // ===== 本地持久化 =====
  const LS_MINES = 'hz_mines';               // 矿山主数据（本模块权威存储键，其他模块只读复用）
  const LS_SEED_VER = 'hz_mines_seed_ver';   // 种子数据版本标记（v9：介绍弹层文案五节式扩充）

  function loadJSON(key, fallback) {
    try {
      const v = JSON.parse(localStorage.getItem(key));
      return v == null ? fallback : v;
    } catch (e) {
      return fallback;
    }
  }

  // 矿山列表：[{id, mine_code, mine_name, short_name, mine_type, main_products,
  //   province, city, district, address, longitude, latitude, annual_capacity, reserve,
  //   ore_grade, operator, contact_person, contact_phone, status, remark,
  //   commissioned_year, intro, img_prompt, tagline, hero_prompt, story, gallery,
  //   img_url, hero_url, gallery_urls, img_credit, products_ext, created_at, updated_at, created_by}]
  let mines = loadJSON(LS_MINES, []);
  if (!Array.isArray(mines)) mines = [];

  // ===== 预置五大矿山（v8：完整集团产品矩阵 + 本地化真实图源） =====
  // products_ext 条目：{name, category, spec, output, unit, grade, impurity, size, moisture, application, desc}
  //   category 为业务大类（铁矿石/铝·锂/铜/冶金煤/钾盐/镍/锰/工业矿物），用于分类分组展示
  //   unit 为产量单位（默认 万吨/年；锂 万吨LCE/年、金 万盎司/年），跨单位不混算占比
  // 图片字段：img_url（列表图）/ hero_url（详情顶部图）/ gallery_urls（正文配图 URL 数组），
  //   已本地化为 /mine/assets/ 下的真实影像（来源 Wikimedia Commons / NASA，下载自公开图库）；
  //   为空时回退 prompt 走生成 API（用户自建矿山场景）
  // 参数来源：力拓 2025 Q3 生产报告 / BHP FY25 运营公报 / Vale 2025 生产销售报告 / FMG FY25 季报 / 西芒杜 JORC 公告
  const SEED_VER = 'v10';

  // 用户自建矿山的介绍板块默认回退值
  const DEFAULT_TAGLINE = '矿山的自然与人文';
  const DEFAULT_HERO_PROMPT = 'aerial satellite view of an open pit mine site, terraced benches and haul roads, realistic satellite photography';
  const DEFAULT_GALLERY = [
    'open pit mining site with heavy machinery at golden hour, realistic photography',
    'mining operation landscape with haul roads, realistic photography'
  ];

  // 种子基础数据（不含系统字段）
  function seedList() {
    return [
      {
        mine_name: '力拓', short_name: '力拓',
        mine_type: 'iron', main_products: 'PB粉,PB块,杨迪粉,罗布河粉,SP10',
        province: '西澳大利亚州', city: '皮尔巴拉地区', district: '', address: 'Pilbara, Western Australia',
        longitude: 117.85, latitude: -22.66,
        annual_capacity: 35000, reserve: 2600000, ore_grade: 'TFe 61%-63%',
        operator: 'Rio Tinto（力拓集团）', contact_person: '', contact_phone: '',
        status: 'active', remark: '即哈默斯利铁矿（皮尔巴拉）。全球主要铁矿供应商之一，装货港以丹皮尔港为主',
        commissioned_year: 1966,
        intro: '力拓集团的业务遍及全球六大洲的34个国家，我们的61,000余名员工正努力寻求以更好的方式，提供世界所需材料。',
        img_prompt: 'aerial view of Pilbara open-pit iron ore mine, Western Australia, red ochre terraced benches, giant haul trucks, deep blue sky, realistic photography',
        tagline: '寻求以更好的方式，提供世界所需材料',
        hero_prompt: 'dramatic high altitude satellite view of Pilbara iron ore mining region, Western Australia, vast red ochre earth with winding haul roads and terraced open pits, realistic satellite photography',
        story: [
          { h: '关于力拓', p: '力拓集团的业务遍及全球六大洲的34个国家，我们的61,000余名员工正努力寻求以更好的方式，提供世界所需材料。\n\n我们的核心产品——铁矿石、铜、铝和锂——是构建更清洁、更智能未来的基石。\n\n为了满足日益增长的需求，我们致力于在保障员工安全的同时，运营并交付世界一流的业务和项目。\n\n我们承诺以负责任的方式开展业务——凭借深厚的专业知识、强劲的社会许可以及长期的合作伙伴关系，创造持久的积极影响。\n\n我们携手应对全球挑战，共创共享成功。' },
          { h: '我们的使命', p: '成为最具价值的金属矿业公司' },
          { h: '我们的愿景', p: '寻求以更好的方式，提供世界所需材料' },
          { h: '我们的战略', p: '以强劲的资产负债表和社会许可为支撑，在优质市场构建由世界级资产和项目组成的多元化投资组合' },
          { h: '我们的目标', p: '我们的目标是一切行动的指引，也是我们成为最具价值的金属矿业公司的基石。\n\n以人为本、安全至上：在基于价值的绩效文化中，杜绝死亡事故，保障员工安全，并助力其实现个人成长。\n\n卓越运营：充分释放资产的全部价值，精简业务并明确责任归属，同时保持财务纪律。\n\n卓越发展：优化资本配置，将增长机遇转化为长期价值。\n\n强劲的可持续发展与社会许可：推动碳减排进程，成为最具价值的合作伙伴，为商业表现设立防护机制以保障未来声誉，并赢得社区、合作伙伴及客户的信任。' },
          { h: '我们的价值观', p: '关爱：我们关注自身和身边人的安全，营造互信的环境，并重视我们对同事、社区和环境的影响。\n\n勇敢：我们勇于承认不足，敢于发声并挑战现状，并为自己的行动和结果负责，以此推动业绩提升。\n\n探索：我们满怀求知欲，在专业领域不断学习和成长，寻找通过日常创新解决问题的机会，并以开放包容的心态拥抱多元化观点。' }
        ],
        gallery: [
          'giant open pit iron ore mine terraces at golden hour, haul trucks on winding red earth roads, Pilbara Western Australia, realistic photography',
          'very long iron ore freight train crossing red desert outback, dramatic cloudscape, realistic photography'
        ],
        // 真实图源（已本地化 /mine/assets）：列表=布罗克曼4矿区列车 / Hero=汤姆普莱斯矿坑航拍 / 正文=矿区列车实拍
        img_url: '/mine/assets/rt-list.jpg',
        hero_url: '/mine/assets/rt-hero.jpg',
        gallery_urls: ['/mine/assets/rt-g1.jpg', '/mine/assets/rt-g2.jpg'],
        img_credit: '图片来源：Wikimedia Commons（Brockman 4 / Mount Tom Price）',
        products_ext: [
          { name: 'PB粉', category: '铁矿石', spec: 'TFe 61.5%', output: 15500, unit: '万吨/年', grade: 'TFe 61.5%', impurity: 'Al₂O₃ 2.2% · SiO₂ 3.4% · P 0.08%', size: '-9.5mm 为主', moisture: '≈ 8.5%', application: '烧结', desc: '皮尔巴拉混矿旗舰品种，约占产品组合 65%，亚洲钢厂烧结配矿的市场基准' },
          { name: 'PB块', category: '铁矿石', spec: 'TFe 62.5%', output: 8000, unit: '万吨/年', grade: 'TFe 62.5%', impurity: 'Al₂O₃ 1.8% · SiO₂ 2.5% · P 0.06%', size: '6.3-31.5mm', moisture: '≈ 4%', application: '高炉直接入炉', desc: '无需烧结直接入炉，可降低钢厂工序能耗与排放' },
          { name: '杨迪粉', category: '铁矿石', spec: 'TFe 58%', output: 4000, unit: '万吨/年', grade: 'TFe 58%', impurity: 'Al₂O₃ 1.4% · SiO₂ 5.7% · P 0.05%', size: '-9.5mm 为主', moisture: '≈ 9%', application: '烧结', desc: 'Yandicoogina 低铝褐铁矿，烧损高、成球性好，高铝矿降铝配矿的经典原料' },
          { name: '罗布河粉', category: '铁矿石', spec: 'TFe 57%', output: 3500, unit: '万吨/年', grade: 'TFe 57%', impurity: 'Al₂O₃ 2.5% · SiO₂ 5.8% · P 0.04%', size: '-9.5mm 为主', moisture: '≈ 9%', application: '烧结', desc: '罗布河谷褐铁矿，低磷低铝，Mesa J 重产后重回主流供应' },
          { name: '罗布河块', category: '铁矿石', spec: 'TFe 57.5%', output: 1000, unit: '万吨/年', grade: 'TFe 57.5%', impurity: 'Al₂O₃ 2.0% · SiO₂ 4.5% · P 0.04%', size: '6.3-31.5mm', moisture: '≈ 6.5%', application: '高炉直接入炉', desc: '中品位块矿，兼顾直接入炉经济性与杂质控制' },
          { name: 'SP10（粉/块）', category: '铁矿石', spec: 'TFe 58.5%', output: 3000, unit: '万吨/年', grade: 'TFe 58.5%', impurity: 'Al₂O₃ 2.5% · SiO₂ 5.0% · P 0.06%', size: '粉 -9.5mm / 块 6.3-31.5mm', moisture: '≈ 8%', application: '烧结 / 入炉', desc: '与 PB 同矿体的低成本品种，帮助钢厂优化配矿成本' },
          { name: 'IOC 精矿/球团（加拿大）', category: '铁矿石', spec: 'TFe 66%', output: 1700, unit: '万吨/年', grade: 'TFe 66%', impurity: 'Al₂O₃ 0.5% · SiO₂ 2.0%', size: '精粉 -0.15mm / 球团 9-16mm', moisture: '≤ 2%', application: '烧结 / 高炉', desc: '加拿大拉布拉多铁矿公司（IOC）低铝精矿与球团，北美与欧洲市场主力' },
          { name: '铝土矿（Weipa/Amrun）', category: '铝·锂', spec: 'Al₂O₃ ≈50%', output: 6000, unit: '万吨/年', grade: 'Al₂O₃ ≈50%', impurity: 'SiO₂ ≈5% · 有机物低', size: '三水铝石型', moisture: '—', application: '氧化铝原料', desc: '昆士兰韦帕与 Amrun 矿区，全球品位最优的三水铝石铝土矿之一' },
          { name: '氧化铝（Yarwun 等）', category: '铝·锂', spec: 'Al₂O₃ ≥99%', output: 700, unit: '万吨/年', grade: 'Al₂O₃ ≥99%', impurity: 'SiO₂ ≤0.02%', size: '砂状/粉状', moisture: '—', application: '电解铝原料', desc: '雅润炼厂氧化铝，供应太平洋地区自用电解厂与亚洲客户' },
          { name: '电解铝（加/澳/新）', category: '铝·锂', spec: 'Al ≥99.7%', output: 320, unit: '万吨/年', grade: 'Al ≥99.7%', impurity: 'Fe ≤0.20% · Si ≤0.10%', size: '铝锭 / 原铝液', moisture: '—', application: '铝加工 / 铸造', desc: '依托清洁水电的加拿大与新西兰电解厂，低碳铝全球领先' },
          { name: '锂（碳酸锂当量）', category: '铝·锂', spec: '电池级 Li₂CO₃', output: 20, unit: '万吨LCE/年', grade: '电池级', impurity: '—', size: '碳酸锂 / 氢氧化锂', moisture: '—', application: '动力电池', desc: '收购 Arcadium 后跻身全球锂业龙头：阿根廷 Rincon、Sal de Vida、Fénix 在建，2028 年目标 20 万吨 LCE' },
          { name: '铜（Kennecott/奥尤陶勒盖）', category: '铜', spec: 'Cu 25-30%（精矿）', output: 85, unit: '万吨/年', grade: 'Cu 25-30%', impurity: 'As 低 · Au/Ag 伴生', size: '铜精矿 / 阴极铜', moisture: '—', application: '电线电缆 / 新能源', desc: '美国肯尼科特一体化铜矿 + 蒙古奥尤陶勒盖（建成后全球第四大铜矿），含铜量口径' },
          { name: '副产金银钼碲（Kennecott）', category: '铜', spec: '金·银·钼·碲', output: 30, unit: '万盎司/年', grade: 'Au 精矿含金', impurity: '—', size: '精矿 / 精炼金属', moisture: '—', application: '贵金属 / 特种合金', desc: '肯尼科特铜矿伴生资源：金约 30 万盎司/年，另有银、钼、碲（碲用于太阳能薄膜）' },
          { name: '硼酸盐（加州 Boron）', category: '工业矿物', spec: 'B₂O₃ 46-47%', output: 50, unit: '万吨/年', grade: 'B₂O₃ ≈47%', impurity: '—', size: '精矿 / 硼酸 / 硼砂', moisture: '—', application: '玻璃 / 陶瓷 / 农业', desc: '莫哈韦沙漠波隆矿区，全球硼酸盐领导者，满足全球约三成需求' },
          { name: '钛渣（RTIT 加/南非）', category: '工业矿物', spec: 'TiO₂ ≈80%', output: 110, unit: '万吨/年', grade: 'TiO₂ 80%+', impurity: 'FeO ≈10%', size: '钛渣 / 高钛渣', moisture: '—', application: '钛白粉原料', desc: '加拿大 Lac Tio 钛铁矿与魁北克 Sorel-Tracy 冶金综合体，钛白粉颜料工业核心原料，副产氧化钪与铁粉' },
          { name: '盐（Dampier Salt）', category: '工业矿物', spec: 'NaCl ≥99.5%', output: 500, unit: '万吨/年', grade: 'NaCl ≥99.5%', impurity: '—', size: '日晒海盐', moisture: '—', application: '化工 / 食用盐', desc: '丹皮尔盐业：世界最大日晒盐场之一，位于西澳皮尔巴拉海岸' }
        ]
      },
      {
        mine_name: '必和必拓', short_name: '必和必拓',
        mine_type: 'iron', main_products: '纽曼粉,麦克粉,块矿',
        province: '西澳大利亚州', city: '纽曼镇', district: '', address: 'Mount Newman, Pilbara, Western Australia',
        longitude: 119.75, latitude: -23.36,
        annual_capacity: 29000, reserve: 2100000, ore_grade: 'TFe 61%-62%',
        operator: 'BHP（必和必拓）', contact_person: '', contact_phone: '',
        status: 'active', remark: '即纽曼山铁矿（皮尔巴拉）。装货港以黑德兰港为主',
        commissioned_year: 1969,
        intro: '必和必拓是一家业务覆盖多个国家和地区的国际化资源公司，业务遍布全球90多个地点，产品销往世界各地。',
        img_prompt: 'Mount Newman iron ore mine in Pilbara outback Australia, mining plant and long ore trains, golden sunlight, vast red desert, realistic photography',
        tagline: '融汇英才资源，共创美好未来',
        hero_prompt: 'high altitude satellite view of Mount Newman iron ore mining complex in Pilbara outback, red desert terrain with open pits and railway lines radiating, realistic satellite photography',
        story: [
          { h: '必和必拓概况', p: '必和必拓是一家业务覆盖多个国家和地区的国际化资源公司，业务遍布全球90多个地点，产品销往世界各地。\n\n我们将业务定位于支持塑造世界的宏观趋势。通过铁矿石和冶金煤支撑全球基建及能源转型所需的钢材生产；开发铜矿助力可再生能源发展；并正拓展钾肥业务以支持可持续农业发展。\n\n我们的资源组合既立足当下，又着眼未来。' },
          { h: '我们的业务', p: '我们是一家国际化资源公司，业务涵盖铁矿石、铜和炼钢煤，并正拓展钾肥业务。依托多元化的资源资产组合，我们致力于持续为客户、合作伙伴和所在社区创造长期价值。' },
          { h: '我们的战略', p: '我们将负责任地管理最具韧性的长期资产组合，专注于极具吸引力的大宗商品，并通过卓越运营、资源勘探与开发、优质资产收购和高效资本配置，实现价值增长。\n\n同时，我们以独特方式创造社会价值，为所有利益相关方带来收益，成为值得信赖的合作伙伴。' },
          { h: '铁矿石', p: '西澳铁矿（WAIO）是全球生产成本最低的主要大型铁矿石生产商。' },
          { h: '铜', p: '我们拥有多元化的铜矿资源组合，其中包括位于智利的全球重要的在产铜矿之一埃斯康迪达（Escondida）铜矿。' },
          { h: '钾肥', p: '我们正在开发全球最大的钾盐矿场之一。詹森项目（Jansen）一期预计于2026年底投产，后续将进入两年产能爬坡期。' },
          { h: '我们的价值观', p: '做正确的事：可持续的未来始于安全和诚信，通过构建与利益相关方的信任实现。\n\n寻求更佳途径：倾听学习、鼓励挑战，是我们推动进步的方式。\n\n做出积极改变：每日践行行动责任、创造价值并产生积极影响，是每位成员的责任担当。' }
        ],
        gallery: [
          'open pit iron ore mine aerial view at dusk, massive haul trucks on red terraces, Pilbara Australia, realistic photography',
          'iron ore shiploading berths at night under floodlights, bulk carriers along the jetty, realistic photography'
        ],
        // 真实图源（已本地化 /mine/assets）：列表=鲸背山矿坑全景 / Hero=鲸背山 NASA ASTER 卫星影像 / 正文=矿场全景与 2016 实拍
        img_url: '/mine/assets/bhp-list.jpg',
        hero_url: '/mine/assets/bhp-hero.jpg',
        gallery_urls: ['/mine/assets/bhp-g1.jpg', '/mine/assets/bhp-g2.jpg'],
        img_credit: '图片来源：NASA Earth Observatory / Wikimedia Commons（Mount Whaleback）',
        products_ext: [
          { name: '纽曼粉', category: '铁矿石', spec: 'TFe 62%', output: 12000, unit: '万吨/年', grade: 'TFe 62%', impurity: 'Al₂O₃ 2.3% · SiO₂ 4.4% · P 0.08%', size: '-9.5mm 为主', moisture: '≈ 8%', application: '烧结', desc: '纽曼山主流中高品位粉矿，烧结基础配矿品种之一' },
          { name: '麦克粉', category: '铁矿石', spec: 'TFe 62%', output: 9000, unit: '万吨/年', grade: 'TFe 62%', impurity: 'Al₂O₃ 2.1% · SiO₂ 3.4% · P 0.06%', size: '-9.5mm 为主', moisture: '≈ 8%', application: '烧结', desc: 'Mining Area C 低硅高品位粉矿，与纽曼粉形成互补的烧结搭配' },
          { name: '块矿', category: '铁矿石', spec: 'TFe 64%', output: 8000, unit: '万吨/年', grade: 'TFe 64%', impurity: 'Al₂O₃ 1.4% · SiO₂ 3.0% · P 0.08%', size: '6.3-31.5mm', moisture: '≈ 3%', application: '高炉直接入炉', desc: '南坡（South Flank）与纽曼高品位直入炉块矿，可替代部分烧结矿降低工序能耗' },
          { name: '铜精矿（Escondida 智利）', category: '铜', spec: 'Cu 25-35%', output: 130, unit: '万吨/年', grade: 'Cu 25-35%', impurity: 'Mo · Au 伴生', size: '铜精矿', moisture: '≈ 8%', application: '铜冶炼', desc: '智利埃斯康迪达——全球最大铜矿，BHP 持股 57.5%，含铜量口径' },
          { name: '阴极铜/精矿（南澳 Copper SA）', category: '铜', spec: 'Cu 99.99%', output: 40, unit: '万吨/年', grade: 'Cu 99.99%', impurity: '—', size: '阴极铜 / 铜精矿', moisture: '—', application: '电线电缆 / 新能源', desc: '南澳奥林匹克坝、Prominent Hill 与 Carrapateena 一体化铜铀金矿群' },
          { name: '副产金银铀（南澳/智利）', category: '铜', spec: '金·银·铀', output: 74, unit: '万盎司/年', grade: 'Au 精矿含金', impurity: '—', size: '精矿 / 精炼金属', moisture: '—', application: '贵金属 / 核燃料', desc: 'FY25 金产量约 74 万盎司、银约 3,000 万盎司，另有铀（奥林匹克坝）与钼副产' },
          { name: '硬焦煤（BMA 昆士兰）', category: '冶金煤', spec: 'CSR 65+', output: 5000, unit: '万吨/年', grade: 'CSR 65+', impurity: '灰分 ≈9% · S ≈0.6%', size: '洗精煤', moisture: '≈ 9%', application: '焦炉炼焦', desc: '鲍恩盆地 BMA 合资：世界最大冶金煤出口商之一，供应亚洲与欧洲钢厂' },
          { name: '喷吹煤（PCI）', category: '冶金煤', spec: '灰分 ≤10%', output: 2000, unit: '万吨/年', grade: '灰分 ≤10%', impurity: 'S ≤0.5%', size: '粉煤', moisture: '≈ 10%', application: '高炉喷吹', desc: '高炉喷吹用煤，替代部分焦炭降低炼铁成本与排放' },
          { name: '钾盐（Jansen，建设中）', category: '钾盐', spec: 'KCl ≥95%', output: 435, unit: '万吨/年', grade: 'KCl ≥95%', impurity: '—', size: '标准钾肥 / 颗粒钾肥', moisture: '—', application: '农业肥料', desc: '加拿大萨斯喀彻温 Jansen 项目：一期 2027 年中投产、设计产能 435 万吨/年，加拿大最大钾盐项目' },
          { name: '镍（西澳镍业）', category: '镍', spec: '镍锍 / 镍精矿', output: null, unit: '万吨/年', grade: 'Ni 75%+（镍锍）', impurity: '—', size: '镍锍', moisture: '—', application: '不锈钢 / 电池', desc: '西澳镍业（Nickel West / West Musgrave）自 2024 年 12 月起临时停产，2027 年 2 月前复审复产决策' }
        ]
      },
      {
        mine_name: '淡水河谷', short_name: '淡水河谷',
        mine_type: 'iron', main_products: '卡拉加斯粉,卡拉加斯块,BRBF,球团矿',
        province: '帕拉州', city: '卡拉加斯矿区', district: '', address: 'Carajás, Pará, Brazil',
        longitude: -50.03, latitude: -6.07,
        annual_capacity: 20000, reserve: 7200000, ore_grade: 'TFe 65%-67%',
        operator: 'Vale（淡水河谷）', contact_person: '', contact_phone: '',
        status: 'active', remark: '即卡拉加斯铁矿。全球品位最高的铁矿之一，装货港以图巴朗港为主',
        commissioned_year: 1985,
        intro: '淡水河谷成立于1942年，总部位于巴西，是一家以齐心协力改善生活、改变未来为己任的全球性矿业公司。',
        img_prompt: 'Carajas iron ore mine, Amazon highlands Brazil, red plateau terraces surrounded by green rainforest, aerial view, realistic photography',
        tagline: '齐心协力改善生活、改变未来',
        hero_prompt: 'aerial satellite view of Carajas iron ore mine in Amazon highlands Brazil, red mining terraces surrounded by dense green rainforest, realistic satellite photography',
        story: [
          { h: '关于淡水河谷', p: '淡水河谷成立于1942年，总部位于巴西，是一家以齐心协力改善生活、改变未来为己任的全球性矿业公司。淡水河谷是全球领先的铁矿石、铜和镍的生产商之一，公司还生产铁矿石球团和压块、铂族金属、金、银和钴，并运营着与采矿作业无缝衔接的物流系统，包括铁路、海运码头和港口。淡水河谷立志成为备受社会认可的安全标杆、世界一流的可靠矿业运营商、人才驱动型组织、可持续开采的领导者以及创造并分享价值的典范。' },
          { h: '淡水河谷与中国', p: '淡水河谷是中国值得信赖的长期合作伙伴，自1973年向中国交付第一船铁矿石起，公司已向中国累计供应了逾30亿吨优质铁矿石，以及铜、镍等优质基本金属。淡水河谷将继续致力于向中国持续供应各种优质矿产品和创新低碳解决方案，支持中国钢铁行业加快发展新质生产力，实现绿色转型，努力为人与自然和谐共生的中国式现代化贡献更多力量。' },
          { h: 'Our purpose', p: 'We exist to improve life and transform the future. Together.\n\n【中文对照】我们的存在，是为了改善生活、改变未来。携手同行。' },
          { h: 'The history of Vale', p: 'Vale was founded on June 1, 1942, in Itabira, Minas Gerais, under the name Companhia Vale do Rio Doce. Over more than eight decades, we have evolved, simplified our name to Vale, and built a journey marked by transformation.\n\nAlong the way, we became a global mining company with operations in 18 countries. At every stage, we have faced challenges and continuously learned from them.\n\nWe have come a long way since the first ore was extracted in Itabira. Since then, we have expanded our operations into integrated logistics, encompassing mines, railways, vessels, and ports, while also strengthening our presence in the energy sector.\n\nToday, we are one of the world\'s largest mining companies and the global leader in iron ore production.\n\n【中文对照】1942年6月1日，淡水河谷在米纳斯吉拉斯州伊塔比拉成立，最初名为"多西河谷公司"。八十余年来，我们不断演进，将名称简化为 Vale，走过了一条以变革为印记的旅程。\n\n在这一过程中，我们成长为一家业务遍及18个国家的全球化矿业公司。在每个阶段，我们都直面挑战，并不断从中学习。\n\n自伊塔比拉采出第一块矿石以来，我们已经走了很远。此后，我们将业务拓展至涵盖矿山、铁路、船舶和港口的一体化物流体系，同时不断加强在能源领域的布局。\n\n今天，我们已成为全球最大的矿业公司之一，也是全球铁矿石产量的领导者。' }
        ],
        gallery: [
          'Carajas open pit iron ore mine aerial view, red terraces against endless green Amazon rainforest, Brazil, realistic photography',
          'giant bulk carrier loading iron ore at a marine terminal on the Atlantic coast of Brazil, realistic photography'
        ],
        // 真实图源（已本地化 /mine/assets）：列表=南部山（S11D 所在山区）/ Hero=卡拉加斯 NASA ASTER 卫星影像 / 正文=矿坑航拍与雨林道路
        img_url: '/mine/assets/vale-list.jpg',
        hero_url: '/mine/assets/vale-hero.jpg',
        gallery_urls: ['/mine/assets/vale-g1.jpg', '/mine/assets/vale-g2.jpg'],
        img_credit: '图片来源：NASA Earth Observatory / Wikimedia Commons（Carajás / Serra Sul）',
        products_ext: [
          { name: '卡拉加斯粉（IOCJ）', category: '铁矿石', spec: 'TFe 65%', output: 9000, unit: '万吨/年', grade: 'TFe 65%', impurity: 'Al₂O₃ 2.2% · SiO₂ 2.8% · P 0.075%', size: '≤12.7mm 为主', moisture: '≈ 8%', application: '烧结', desc: '全球品位标杆性粉矿，低铝低硅，北部系统（卡拉加斯/S11D）旗舰产品' },
          { name: '卡拉加斯块', category: '铁矿石', spec: 'TFe 66%', output: 2000, unit: '万吨/年', grade: 'TFe 66%', impurity: 'Al₂O₃ 1.8% · SiO₂ 2.0% · P 0.06%', size: '6.3-31.5mm', moisture: '≈ 4%', application: '高炉直接入炉', desc: '全球最高品位块矿之一，直接入炉降低烧结工序依赖' },
          { name: '巴西混合粉（BRBF）', category: '铁矿石', spec: 'TFe 62%', output: 6000, unit: '万吨/年', grade: 'TFe 62%', impurity: 'Al₂O₃ 1.5% · SiO₂ 6.0% · P 0.07%', size: '-9.5mm 为主', moisture: '≈ 8.5%', application: '烧结', desc: '北部与东南系统混配的旗舰粉矿，品质稳定、均衡性好' },
          { name: 'IOCJ 精粉', category: '铁矿石', spec: 'TFe 65%', output: 1000, unit: '万吨/年', grade: 'TFe 65%', impurity: 'Al₂O₃ 0.8% · SiO₂ 1.5% · P 0.04%', size: '精粉，-0.15mm 为主', moisture: '≈ 9%', application: '烧结', desc: '低铝优质精粉，铝硅极低，用于提质降杂的高品位配矿' },
          { name: '球团矿（图巴朗/阿曼）', category: '铁矿石', spec: 'TFe 65%', output: 3000, unit: '万吨/年', grade: 'TFe 65%', impurity: 'Al₂O₃ 1.0% · SiO₂ 2.5%', size: '8-16mm', moisture: '≤ 2%', application: '高炉 / 直接还原', desc: '图巴朗与阿曼球团厂氧化球团，还原性好、强度高，2025 年产量约 3,200 万吨' },
          { name: '绿色压块（Tubarão）', category: '铁矿石', spec: 'TFe 66%+', output: 600, unit: '万吨/年', grade: 'TFe 66%+', impurity: '低硅低铝', size: '压块', moisture: '≤ 3%', application: '直接还原 / 高炉', desc: '革命性低碳产品：以压块替代球团，显著降低炼铁排放；图巴朗 2×600 万吨产线陆续投产' },
          { name: 'GF88 超细粉（舟山枢纽）', category: '铁矿石', spec: '-88μm', output: 300, unit: '万吨/年', grade: 'TFe 66%+', impurity: '—', size: '超细磨矿粉', moisture: '≈ 10%', application: '球团 / 精细烧结', desc: '与中国宁波舟山港合建的首个磨矿枢纽产品，靠近终端市场的增值加工' },
          { name: '镍（Onça Puma/Voisey\'s Bay 等）', category: '镍', spec: '镍锍 Ni ≥75%', output: 16, unit: '万吨/年', grade: 'Ni ≥75%', impurity: 'Co · Cu 伴生', size: '镍锍 / 镍精矿', moisture: '—', application: '不锈钢 / 电池', desc: '巴西 Onça Puma、加拿大 Voisey\'s Bay 与印尼索罗瓦科，2025 年产量约 16 万吨' },
          { name: '铜精矿（Salobo/Sossego）', category: '铜', spec: 'Cu 25-30%', output: 35, unit: '万吨/年', grade: 'Cu 25-30%', impurity: 'Au · Ag 伴生', size: '铜精矿 / 阴极铜', moisture: '≈ 8%', application: '铜冶炼', desc: '卡拉加斯 Salobo 创历史产量纪录，与 Sossego 合计 2025 年约 34-40 万吨' },
          { name: '锰矿石（Azul）', category: '锰', spec: 'Mn 40%+', output: 250, unit: '万吨/年', grade: 'Mn 40%+', impurity: 'Fe · SiO₂ 适中', size: '块矿 / 粉矿', moisture: '≈ 8%', application: '铁合金', desc: '卡拉加斯配套 Azul 锰矿——全球最大锰矿之一，供应铁合金与电池级锰原料' }
        ]
      },
      {
        mine_name: '福斯特库', short_name: '福斯特库',
        mine_type: 'iron', main_products: '超特粉,混合粉,西皮粉,Iron Bridge精矿',
        province: '西澳大利亚州', city: '黑德兰港', district: '', address: 'Solomon Hub, Chichester Ranges, Western Australia',
        longitude: 118.0, latitude: -22.3,
        annual_capacity: 19000, reserve: 1600000, ore_grade: 'TFe 56%-59%',
        operator: 'Fortescue（福斯特库）', contact_person: '', contact_phone: '',
        status: 'active', remark: '即所罗门铁矿（奇切斯特岭）。装货港以黑德兰港为主',
        commissioned_year: 2013,
        intro: 'Fortescue is a global metals, energy and technology business providing green solutions to the world.（中文对照：福斯特库是一家面向全球提供绿色解决方案的金属、能源与技术企业。）',
        img_prompt: 'Solomon Hub iron ore mine, Chichester Ranges Western Australia, open pit terraces, mining machinery at dusk, realistic photography',
        tagline: 'We\'re not waiting for the future.（我们不等待未来）',
        hero_prompt: 'aerial satellite view of Solomon Hub iron ore mine in Chichester Ranges Western Australia, red ochre pit terraces in arid mountain ranges, realistic satellite photography',
        story: [
          { h: 'Who we are', p: 'Fortescue is a global metals, energy and technology business providing green solutions to the world.\n\nWe\'re combining operational scale with innovation to build the systems, tech and infrastructure needed to accelerating the decarbonisation of heavy industry, rapidly, profitably and at global scale.\n\n【中文对照】福斯特库是一家面向全球提供绿色解决方案的金属、能源与技术企业。\n\n我们将运营规模与创新相结合，构建重工业脱碳所需的系统、技术与基础设施——以快速、盈利且覆盖全球规模的方式推进。' },
          { h: 'What we do', p: 'We operate at industrial scale while building the systems needed to move beyond fossil fuels. From mining and infrastructure to zero-emissions systems and technology, we\'re redefining heavy industry.\n\n【中文对照】我们在工业规模上运营，同时构建超越化石燃料所需的系统。从采矿和基础设施到零排放系统与技术，我们正在重新定义重工业。' },
          { h: 'Metals', p: 'A leading global iron ore producer, building on our Pilbara foundations to create the pathway to green iron and green steel.\n\n【中文对照】作为全球领先的铁矿石生产商，我们依托皮尔巴拉的业务根基，开辟通往绿色铁矿与绿色钢铁的道路。' },
          { h: 'Fortescue in Figures', p: 'For more than 20 years, we\'ve pushed boundaries and built technologies others thought impossible. Today, we\'re applying that capability to eliminate emissions, reshape heavy industry and unlock what comes next.\n\nA$27.2 billion — Total global economic contribution (FY26)\n\n2.5 billion tonnes — Iron ore shipped since 2008\n\nReal Zero by 2030 — Emissions target (scope 1&2 terrestrial)\n\n【中文对照】二十多年来，我们不断突破边界，打造出别人认为不可能的技术。今天，我们正把这种能力用于消除排放、重塑重工业并开启下一个时代。\n\n272 亿澳元 —— 全球经济贡献总额（2026 财年）\n\n25 亿吨 —— 自 2008 年以来发运的铁矿石\n\n2030 年 Real Zero（真正的零排放）—— 排放目标（范围 1&2 陆地排放）' }
        ],
        gallery: [
          'iron ore mining machinery working at dusk inside open pit, Chichester Ranges Western Australia, realistic photography',
          'bulk carrier being loaded with iron ore at Port Hedland at dusk, Western Australia, realistic photography'
        ],
        // 真实图源（已本地化 /mine/assets）：列表=FMG 012 号机车 / Hero=云崖矿区（Chichester 枢纽） / 正文=FMG 铁矿列车
        img_url: '/mine/assets/fmg-list.jpg',
        hero_url: '/mine/assets/fmg-hero.jpg',
        gallery_urls: ['/mine/assets/fmg-g1.jpg'],
        img_credit: '图片来源：Wikimedia Commons（Cloudbreak / FMG 铁矿列车）',
        products_ext: [
          { name: '超特粉', category: '铁矿石', spec: 'TFe 56.5%', output: 7600, unit: '万吨/年', grade: 'TFe 56.5%', impurity: 'Al₂O₃ 2.7% · SiO₂ 5.8% · P 0.05% · Mn 1.1%', size: '-9.5mm 为主', moisture: '≈ 9%', application: '烧结', desc: 'Chichester 枢纽旗舰产品，占发运约四成，高锰低磷的低成本大产量品种' },
          { name: '混合粉', category: '铁矿石', spec: 'TFe 58.2%', output: 6600, unit: '万吨/年', grade: 'TFe 58.2%', impurity: 'Al₂O₃ 2.2% · SiO₂ 4.3% · P 0.05%', size: '-9.5mm 为主', moisture: '≈ 9%', application: '烧结', desc: 'Fortescue Blend：Christmas Creek 与 Firetail 混配，性价比路线的代表品种' },
          { name: '西皮粉（WPF）', category: '铁矿石', spec: 'TFe 60.1%', output: 2300, unit: '万吨/年', grade: 'TFe 60.1%', impurity: 'Al₂O₃ 2.0% · SiO₂ 5.5% · P 0.06%', size: '-9.5mm 为主', moisture: '≈ 9%', application: '烧结', desc: '西皮尔巴拉粉（West Pilbara Fines），FMG 品位升级战略的主力中品粉矿' },
          { name: 'King 粉（CID）', category: '铁矿石', spec: 'TFe 55%', output: 500, unit: '万吨/年', grade: 'TFe 55%', impurity: 'Al₂O₃ 2.5% · SiO₂ 5.5% · P 0.05%', size: '-9.5mm 为主', moisture: '≈ 9%', application: '烧结', desc: 'Kings 通道铁矿（CID）独立产品，补充低成本配矿选项' },
          { name: 'Iron Bridge 磁铁矿精矿', category: '铁矿石', spec: 'TFe 67%', output: 2000, unit: '万吨/年', grade: 'TFe 67%', impurity: 'Al₂O₃ 0.3% · SiO₂ 2.5%', size: '磁铁矿精矿，-0.5mm', moisture: '≈ 9%', application: '球团 / 高品位配矿', desc: '世界级高品位磁铁矿项目：满产 2,200 万吨/年，对 65% 品位指数溢价定价' }
        ]
      },
      {
        mine_name: '西芒杜', short_name: '西芒杜',
        mine_type: 'iron', main_products: '西芒杜高品位粉,块矿',
        province: '几内亚', city: '恩泽雷科雷大区', district: '', address: 'Simandou, Nzérékoré Region, Guinea',
        longitude: -9.0, latitude: 8.5,
        annual_capacity: 6000, reserve: 2400000, ore_grade: 'TFe 65%-67%',
        operator: 'Rio Tinto（力拓集团）SimFer联合体', contact_person: '', contact_phone: '',
        status: 'active', remark: '即西芒杜铁矿（Simandou）。全球最大未开发高品位铁矿之一，装货港为几内亚莫雷巴亚港（Morebaya）',
        commissioned_year: 2025,
        intro: 'Africa\'s largest mining and related infrastructure project（中文对照：非洲最大的矿业及相关基础设施项目）',
        img_prompt: 'Simandou iron ore project, Guinea West Africa, green mountain range with early mining infrastructure, clear sky, realistic photography',
        tagline: 'Africa\'s largest mining and related infrastructure project（非洲最大的矿业及相关基础设施项目）',
        hero_prompt: 'aerial satellite view of Simandou mountain range in Guinea West Africa, lush green ridges with early mining infrastructure and red earth roads, realistic satellite photography',
        story: [
          { h: 'Africa\'s largest mining and related infrastructure project', p: 'The Simandou mountain range lies in the south-east of the Republic of Guinea. The area has subsoils which contain a world class Ore Reserve of high-grade iron ore. Developing a project of Simandou\'s scale is a unique opportunity.\n\nSimandou is divided into 4 blocks. We hold rights to blocks 3 and 4 through Rio Tinto SimFer – a joint venture with the Government of Guinea and Chalco Iron Ore Holdings (CIOH). These blocks contain ore reserves estimated at around 1.5 billion tonnes. Rio Tinto is the majority shareholder and managing partner of Rio Tinto SimFer.\n\nWe are also working with the Government of Guinea and Winning Consortium Simandou (WCS), developers of Simandou blocks 1 and 2, to co-develop the infrastructure needed to export mined iron ore from the far south-east of the country to Guinea\'s maritime borders and beyond.\n\nThese include 600km of rail infrastructure – spanning the length of the country – as well as port infrastructure on the coast of the Forécariah prefecture in Guinea.\n\n【中文对照】西芒杜山脉位于几内亚共和国东南部。该地区的地下蕴藏着世界级的高品位铁矿石储量。开发西芒杜这样规模的项目，是一个独一无二的机遇。\n\n西芒杜分为4个区块。我们通过力拓 SimFer（与几内亚政府及中国铝业铁矿控股公司 CIOH 的合资企业）持有第3、4区块的开采权。这些区块的矿石储量估计约15亿吨。力拓是力拓 SimFer 的控股股东和管理合伙方。\n\n我们还与几内亚政府以及西芒杜第1、2区块的开发商赢联盟（WCS）合作，共同开发所需的基础设施，以便将开采的铁矿石从该国最东南部出口至几内亚的海域边界及更远的市场。\n\n这包括600公里的铁路基础设施——纵贯该国全境——以及位于几内亚弗雷卡里亚省沿海的港口基础设施。' },
          { h: 'Iron ore', p: 'Iron ore is the primary raw material used to make steel. Steel is strong, long-lasting and cost-efficient – making it perfect for everything from cars and fridges to wind turbines and skyscrapers.\n\nThe premium grade of Simandou iron ore broadens our global portfolio of iron ore products, complementing our existing, long-term iron ore production in Australia\'s Pilbara region and in Canada.\n\n【中文对照】铁矿石是制造钢铁的主要原材料。钢铁坚固、耐用且具有成本效益——从汽车、冰箱到风力发电机和摩天大楼，它无处不在。\n\n西芒杜优质品位的铁矿石拓展了我们全球铁矿石产品组合，与我们位于澳大利亚皮尔巴拉地区和加拿大的既有长期铁矿石生产形成互补。' },
          { h: 'Next steps', p: 'Work on the mines and infrastructure is well underway and in December 2025, the first shipment from Simandou left Guinea. Ore is being railed from the SimFer mine to the main rail line via the SimFer rail spur and initially shipped through the WCS port while construction of the SimFer port is finalised.\n\nOnce commissioning of the common rail to port infrastructure is complete, we expect a 30 month ramp up to full capacity of 60 Mtpa production at the SimFer mine.\n\n【中文对照】矿山和基础设施的建设正在全面推进，2025年12月，西芒杜的首批货物已运离几内亚。目前，矿石经 SimFer 铁路支线从 SimFer 矿区运往主线，并在 SimFer 港口建设收尾期间暂经 WCS 港口装船发运。\n\n一旦铁路至港口共享基础设施的调试完成，我们预计将用30个月逐步爬坡，使 SimFer 矿区达到6000万吨/年的满产产能。' },
          { h: 'Our commitment for Simandou', p: 'Simandou is a complex, uniquely transformative project. From the associated infrastructure corridor to the thousands of jobs the project will create, the project will positively impact the Guinean economy, creating opportunities and development potential which will benefit the people of Guinea for generations to come.\n\nAs with any significant development project, challenges will need to be carefully managed, including minimising adverse social, health, safety and environmental impacts while simultaneously fostering positive and tangible change for local communities and other key stakeholders.\n\nThroughout the history of our involvement in the Simandou project, we have maintained regular community consultation designed to maintain dialogue with local communities by addressing questions, concerns and additional opportunities to provide support.\n\nWe are committed to developing the Simandou project in line with internationally recognised environmental, social and governance standards. This includes transparently reporting on impacts of our mining operations, and continuing to work alongside local stakeholders on ways of mitigating these impacts. We recognise the responsibility we are entrusted with and see ourselves as long-term stewards of natural resources. We will continue to work alongside communities to ensure the Simandou project is developed with environmental stewardship and social wellbeing at its core.\n\n【中文对照】西芒杜是一个复杂且具有独特变革意义的项目。从配套的基础设施走廊到该项目将创造的数千个就业岗位，它将对几内亚经济产生积极影响，创造惠及几内亚人民世世代代的机遇与发展潜力。\n\n与任何重大开发项目一样，各种挑战都需要审慎管理，包括最大限度地减少对社会、健康、安全和环境的不利影响，同时为当地社区和其他主要利益相关方带来积极而切实的改变。\n\n在我们参与西芒杜项目的整个历程中，我们始终坚持定期开展社区磋商，通过回应疑问与关切、提供更多支持，与当地社区保持对话。\n\n我们承诺按照国际公认的环境、社会和治理标准开发西芒杜项目，包括透明地报告采矿作业的影响，并继续与当地利益相关方合作寻求缓解这些影响的方法。我们深知肩负的责任，并将自己视为自然资源的长期守护者。我们将继续与社区携手，确保西芒杜项目始终以环境管护和社会福祉为核心。' }
        ],
        gallery: [
          'Simandou mountain range in Guinea, green forested ridges with mining terraces under construction, realistic photography',
          'newly built railway cutting through tropical green landscape in West Africa, freight train, realistic photography'
        ],
        // 真实图源（已本地化 /mine/assets）：列表=西芒杜项目 2024 铁路实拍 / Hero=几内亚高地地形图（标注西芒杜山脉位置）
        img_url: '/mine/assets/sim-list.jpg',
        hero_url: '/mine/assets/sim-hero.png',
        gallery_urls: ['/mine/assets/sim-list.jpg'],
        img_credit: '图片来源：Wikimedia Commons（Simandou 项目 / 几内亚高地地形图）',
        products_ext: [
          { name: '西芒杜高品位粉', category: '铁矿石', spec: 'TFe 65%', output: 3500, unit: '万吨/年', grade: 'TFe 65%', impurity: 'Al₂O₃ ≈1.0% · SiO₂ ≈2.0%', size: '-9.5mm 为主', moisture: '≈ 8%', application: '烧结', desc: '新投产的高品位粉矿，低铝低硅，有望成为高品位配矿新基准；JORC 资源品位 66-67.1%' },
          { name: '西芒杜块矿', category: '铁矿石', spec: 'TFe 66%', output: 2500, unit: '万吨/年', grade: 'TFe 66%', impurity: 'Al₂O₃ ≈1.0% · SiO₂ ≈2.0%', size: '6.3-31.5mm', moisture: '≈ 3%', application: '高炉直接入炉', desc: '全球最高品位块矿之一，直接入炉比例提升的关键资源；项目远期产能 1.2 亿吨/年（四大区块）' }
        ]
      }
    ];
  }

  // 写入种子版本标记（失败不阻断，下次打开会重试迁移）
  function markSeedVer() {
    try { localStorage.setItem(LS_SEED_VER, SEED_VER); } catch (e) { /* 忽略 */ }
  }

  // 统一补齐系统字段：编号、时间戳、创建人
  function attachSystemFields(list) {
    const now = Date.now();
    const day = 24 * 60 * 60 * 1000;
    return list.map((m, i) => Object.assign({
      id: 'm' + (now + i).toString(36),
      mine_code: genCode(i + 1),
      contact_person: '', contact_phone: '', district: '', address: '',
      longitude: null, latitude: null,
      created_at: now - (list.length - i) * day,   // 依次前推一天，保证默认按创建时间倒序稳定
      updated_at: now - (list.length - i) * day,
      created_by: '系统预置'
    }, m));
  }

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

  function seedMines() {
    const existing = loadJSON(LS_MINES, null);
    let seedVer = null;
    try { seedVer = localStorage.getItem(LS_SEED_VER); } catch (e) { /* 忽略 */ }

    if (existing === null) {
      // 首次打开：写入完整五大矿山种子
      mines = attachSystemFields(seedList());
      try {
        localStorage.setItem(LS_MINES, JSON.stringify(mines));
      } catch (e) { /* 预置失败不阻断页面，用户可手动新增 */ }
      markSeedVer();
      return;
    }

    // 版本迁移（v6 → v7）：五大矿山按种子更新完整产品矩阵与真实图源（保留 id/编号/创建信息）
    // ① 简称命中的条目按种子规范化业务字段（含 products_ext 完整矩阵 + img_url 等图源字段）② 简称未命中
    //    且为「系统预置」的旧预置脏数据移除 ③ 用户自建矿山保留并补介绍板块默认值 ④ 缺失标准矿山补齐（编号顺延）
    if (seedVer === SEED_VER) return;

    const seeds = seedList();
    const byShort = {};
    seeds.forEach(s => { byShort[s.short_name] = s; });

    const kept = [];
    const seenShorts = new Set();
    mines.forEach(m => {
      const short = m.short_name;
      if (byShort[short]) {
        seenShorts.add(short);
        kept.push(Object.assign({}, m, byShort[short], { updated_at: Date.now() }));
      } else if (m.created_by !== '系统预置') {
        kept.push(backfillIntroDefaults(m));   // 用户自建矿山：不触碰业务数据，仅补介绍板块回退值
      }
      // 其余（旧预置且不在标准名单内）：丢弃
    });

    mines = kept;
    let nextSeq = mines.reduce((max, m) => {
      const n = /^M-(\d+)$/.exec(m.mine_code || '');
      return n ? Math.max(max, Number(n[1])) : max;
    }, 0) + 1;
    seeds.forEach(s => {
      if (seenShorts.has(s.short_name)) return;
      const added = attachSystemFields([s])[0];
      added.mine_code = genCode(nextSeq++);
      mines = mines.concat([added]);
    });

    try {
      localStorage.setItem(LS_MINES, JSON.stringify(mines));
    } catch (e) { /* 迁移失败不阻断页面，下次打开重试 */ }
    markSeedVer();
  }

  function save() {
    try {
      localStorage.setItem(LS_MINES, JSON.stringify(mines));
      return true;
    } catch (e) {
      alert('本地存储空间不足，本次修改未能保存到浏览器。建议先「导出 Excel」备份数据后清理旧数据重试。');
      return false;
    }
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
        '<span class="prod-group-total">' + fmtNum(capNum) + '<i>万吨/年</i></span>' +
      '</header>' +
      (catSections || '<div class="tab-empty">暂无产品明细</div>') +
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
      (p.desc ? '<p class="pm-desc">' + esc(p.desc) + '</p>' : '');

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
      if (e.key === 'Escape' && !prodMask.hidden) closeProdModal();
    });

    // 产品矩阵区事件委托：产品卡开弹层 / 折叠组头切换（两者互不嵌套）
    const groups = $('productGroups');
    groups.addEventListener('click', e => {
      const card = e.target.closest('.prod-card');
      if (card) { openProdModalFromCard(card); return; }
      const head = e.target.closest('.prod-cat-head');
      if (head) toggleCatGroup(head);
    });
    groups.addEventListener('keydown', e => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const card = e.target.closest('.prod-card');
      if (card) {
        e.preventDefault();
        openProdModalFromCard(card);
      }
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
    $('editorTitle').textContent = m ? '编辑矿山（' + m.mine_code + '）' : '新增矿山';

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

  function saveEditor() {
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

    if (!save()) return;
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
  seedMines();          // 首次打开预置五大矿山 / 版本迁移

  initTabs();
  initEditor();
  initFactActions();
  initExport();
  initIntroModal();
  initProdModal();
  renderAll();          // 启动时从 localStorage 恢复数据并渲染三板块

  // 详情编辑直达：?edit=<id> 自动切到「基础信息」板块并打开对应编辑抽屉
  const editId = new URLSearchParams(location.search).get('edit');
  if (editId) {
    const m = mines.find(x => x.id === editId);
    if (m) {
      switchTab('info');
      openEditor(m);
    }
  }
})();
