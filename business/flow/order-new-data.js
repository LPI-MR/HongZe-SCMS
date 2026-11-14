/* ============================================================
   订单管理模块 · 新建订单数据层
   ------------------------------------------------------------
   依据《PRD-订单管理模块》实现（页面对接 business/flow/flow-data.js）：
   - F1/F2 登录主体解析与自然信息自动填充（TBD-01 降级 / 异常 E1）
   - F3 核心信息字段与校验（异常 E3/E4/E5/E7，字段顺序 BR-O03）；
     品类/货物名称/货物品质引用矿山管理产品明细（hz_mines products_ext 同源，
     listMineCategories 按矿山取品类大类、listMineProducts 按品类过滤产品名、
     findMineProduct/qualityOfProduct 支持品位/粒度/水分自动带出）
   - F4 智能方案生成（触发条件 BR-O07、计算逻辑 CL-1~CL-4、
     线路选择 CL-3、缺失项提示、A7 自动刷新纯函数化）
   - F5 船舶静态信息 9 项与海运航次 vessel_info 同步（A8 / AC-O09）
   - F6 订单组装：映射现有 flow 订单模型（状态机 draft→port）、
     港口/运力预填（TBD-08/TBD-10 假设）、目的地→终端客户兼容映射
   - BR-O11 客户库联动：非「正常」状态的客户不可用于新建订单
   ------------------------------------------------------------
   设计约定：
   - UMD 双端导出（Node 单元测试 / 浏览器 window.HZOrderNewData）；
   - 纯逻辑层：不直接依赖 DOM；localStorage 仅经 storage() 安全访问，
     且所有涉存函数支持显式注入 storage（测试可传 mock）；
   - 基础数据（矿山品类映射 / 三级目录 / 码头清单）为内置种子 +
     运营方覆盖键（TBD-02：完整清单与维护入口待运营方确认）。
   ============================================================ */

(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;            // Node / 单元测试
  } else {
    root.HZOrderNewData = api;       // 浏览器全局
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ==================== 存储键 ==================== */

  var SUBJECT_KEY = 'hz_login_subject';          // 登录体系预留上下文（TBD-01）
  var DEST_OVERRIDE_KEY = 'hz_dest_catalog';     // 三级目录运营方覆盖键（TBD-02）
  var WHARF_OVERRIDE_KEY = 'hz_wharf_catalog';   // 码头清单运营方覆盖键（TBD-02）

  /* ==================== 业务常量 ==================== */

  // 运力基准（PRD 3.2 / 7 计算逻辑）
  var ROAD_TONS_PER_DAY = 2500;    // 汽运每日 2500 吨
  var RAIL_TONS_PER_TRAIN = 3500;  // 铁路每列车约 3500 吨
  var ROAD_TONS_PER_TRUCK = 33;    // 公路短驳每车约 33 吨（公铁联运末段短驳估算用）

  // 铁路线路（CL-3：目的地归属曹庄镇站方向 → 曹庄镇线，其余 → 沧港线）
  var LINE_CAOZHUANG = '曹庄镇线';
  var LINE_CANGGANG = '沧港线';
  var CAOZHUANG_STATION = '曹庄镇站';

  // 铁路直达标识（PRD 4.2）
  var RAIL_DIRECT_TAG = '中矿试单已打通通道';

  // 码头选项种子（需覆盖综合码头、矿石码头等多码头场景）
  var WHARF_SEED = ['综合码头', '矿石码头', '煤炭码头', '散货码头', '集装箱码头'];

  // 港口 → 码头种子映射（与 ports/ports.js SEED.wharfs 同源维护）；
  // 用途：用户未打开过港口管理页（hz_ports_data 未初始化）时，码头联动仍有数据兜底
  var PORT_WHARF_SEED = {
    '黄骅港': ['综合码头', '矿石码头', '煤炭码头', '散货码头', '集装箱码头'],
    '天津港': ['集装箱码头', '矿石码头', '焦炭码头', '汇盛码头', '散货码头'],
  };

  // 按港口名查种子码头清单（未命中返回空数组；返回副本防止外部修改种子）
  function wharfSeedOf(portName) {
    var name = trimStr(portName);
    var ws = name && PORT_WHARF_SEED[name];
    return Array.isArray(ws) ? ws.filter(Boolean).slice() : [];
  }

  // 船型类别（PRD 4.2 wire）
  var VESSEL_TYPES = ['散堆船', '集装箱船'];

  // 矿山品类映射种子（TBD-02；页面优先合并矿山管理模块 hz_mines 的 main_products）
  var MINE_SEED = [
    { name: '力拓', categories: ['PB粉', '杨迪粉', '罗布河粉'] },
    { name: 'BHP 必和必拓', categories: ['纽曼粉', '麦克粉', '金布巴粉'] },
    { name: '淡水河谷', categories: ['卡粉', '巴混'] },
    { name: 'FMG', categories: ['超特粉', '混合粉'] }
  ];

  // 港口种子（PRD 示例：黄骅港；页面优先合并港口管理模块数据）
  var PORT_SEED = ['黄骅港'];

  // 铁路站—堆场—钢厂客户 三级目录种子（TBD-02：钢厂名单取自系统现有常量，堆场为演示种子）
  var DEST_SEED = [
    {
      station: '武安站',
      yards: [
        { yard: '河北陆港保税物流中心（保税堆场）', steels: ['天铁集团', '普阳钢铁', '冀南钢铁'] },
        { yard: '河北南洋移山物流有限公司', steels: ['新兴铸管', '新金钢铁'] }
      ]
    },
    {
      station: '康城站',
      yards: [
        { yard: '武安保税物流园', steels: ['邯郸钢铁集团', '邯钢新区'] }
      ]
    },
    {
      station: '曹庄镇站',
      yards: [
        { yard: '曹庄镇站物流园', steels: ['河北普阳', '邯郸华信'] }
      ]
    }
  ];

  // 登录主体降级（TBD-01 假设：登录体系未接入前以平台运营方模拟主体填充，需评审确认）
  var FALLBACK_SUBJECT = {
    company: '泓泽宜通供应链管理有限公司',
    contact: '平台运营部',
    phone: '0310-8888888'
  };

  // flow 订单状态机九态（与 flow-data.js STATUS_ORDER 一致）与台账同步点（F6②）
  var FLOW_STATUSES = ['draft', 'port', 'capacity', 'plan', 'pending_confirm', 'confirmed', 'shipping', 'shipped', 'completed'];
  var LEDGER_SYNC_STATUSES = ['pending_confirm', 'confirmed', 'shipping', 'shipped', 'completed'];

  // E1/E3/E4/E5 提示文案（PRD 10 原文口径）
  var MSG = {
    subjectBlocked: '未获取到登录主体信息，请重新登录或联系管理员',
    tonnageInvalid: '请输入大于 0 的吨数',
    tonnageFormat: '吨数支持整数或 1 位小数',
    priceInvalid: '请输入有效的价格',
    destIncomplete: '请完成目的地选择',
    noBaseData: '暂无数据，请联系运营维护',
    planFail: '生成失败，点击重试'
  };

  /* ==================== 工具函数 ==================== */

  function trimStr(v) {
    return v == null ? '' : String(v).trim();
  }

  function pad2(n) { return String(n).padStart(2, '0'); }

  function fmtTime(ts) {
    var d = ts instanceof Date ? ts : new Date(ts);
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()) + ' ' +
      pad2(d.getHours()) + ':' + pad2(d.getMinutes()) + ':' + pad2(d.getSeconds());
  }

  // 日期（yyyy-MM-dd 等）→ ISO 字符串；无效返回 ''（与 flow 页 toISOString 口径一致）
  function toIso(v) {
    var s = trimStr(v);
    if (!s) return '';
    var d = new Date(s);
    return isNaN(d.getTime()) ? '' : d.toISOString();
  }

  // 数字千分位（保留最多 1 位小数，去除多余 0）
  function fmtNum(n) {
    var v = Number(n);
    if (!isFinite(v)) return String(n == null ? '' : n);
    var fixed = Math.abs(v % 1) > 0 ? v.toFixed(1) : String(Math.round(v));
    var parts = fixed.split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return parts.join('.');
  }

  // 安全 storage：优先注入值，其次浏览器 localStorage，Node 下返回 null
  function storageOf(explicit) {
    if (explicit) return explicit;
    try {
      if (typeof localStorage !== 'undefined') return localStorage;
    } catch (e) { /* 隐私模式等场景 */ }
    return null;
  }

  function readJson(storage, key) {
    if (!storage) return null;
    try {
      var raw = storage.getItem(key);
      if (raw == null || String(raw).trim() === '') return null;
      return JSON.parse(raw);
    } catch (e) {
      return null;
    }
  }

  function up(n) { return Math.ceil(n); } // CL-4：计算结果全部向上取整

  /* ==================== 登录主体（F2 / E1 / TBD-01） ==================== */

  /**
   * 解析当前登录主体（公司名称 + 联系方式），用于自然信息区块自动填充。
   * 优先级：登录上下文（SUBJECT_KEY）> 平台运营方模拟主体（降级，标注 degraded）。
   * 登录上下文存在但公司/联系方式缺失 → 返回 ok:false（E1，阻断提交，不允许手填）。
   */
  function getLoginSubject(storage) {
    var st = storageOf(storage);
    var data = st ? readJson(st, SUBJECT_KEY) : null;
    if (st && st.getItem(SUBJECT_KEY) != null) {
      var company = trimStr(data && data.company);
      var phone = trimStr(data && (data.phone || data.contact_info));
      if (company && phone) {
        return {
          ok: true,
          source: 'login',
          subject: {
            company: company,
            contact: trimStr(data && data.contact_person),
            phone: phone
          }
        };
      }
      // 登录体系已接入但主体信息不完整 → E1（阻断，不允许手填，保证主体归属准确）
      return { ok: false, code: 'E1', error: MSG.subjectBlocked, subject: { company: '', contact: '', phone: '' } };
    }
    // TBD-01 降级假设：登录体系未接入 → 模拟主体（页面需展示降级提示）
    return {
      ok: true,
      source: 'fallback',
      degraded: true,
      subject: {
        company: FALLBACK_SUBJECT.company,
        contact: FALLBACK_SUBJECT.contact,
        phone: FALLBACK_SUBJECT.phone
      }
    };
  }

  /** 自然信息完整性校验（E1）：主体缺失时阻断提交 */
  function validateSubject(subjectRes) {
    var s = (subjectRes && subjectRes.subject) || {};
    if (!trimStr(s.company) || !trimStr(s.phone)) return MSG.subjectBlocked;
    return '';
  }

  /* ==================== 基础数据（F3 / TBD-02 / E7） ==================== */

  /** 铁路站—堆场—钢厂客户三级目录：运营方覆盖键优先，回退内置种子 */
  function getDestCatalog(storage) {
    var st = storageOf(storage);
    var over = st ? readJson(st, DEST_OVERRIDE_KEY) : null;
    if (Array.isArray(over) && over.length) {
      var ok = over.every(function (s) {
        return s && trimStr(s.station) && Array.isArray(s.yards) && s.yards.every(function (y) {
          return y && trimStr(y.yard) && Array.isArray(y.steels);
        });
      });
      if (ok) return over;
    }
    return DEST_SEED.map(function (s) {
      return {
        station: trimStr(s.station),
        yards: (s.yards || []).map(function (y) {
          return { yard: trimStr(y.yard), steels: (y.steels || []).map(trimStr) };
        })
      };
    });
  }

  function findStationEntry(catalog, station) {
    var key = trimStr(station);
    for (var i = 0; i < catalog.length; i++) {
      if (catalog[i].station === key) return catalog[i];
    }
    return null;
  }

  function listStations(storage) {
    return getDestCatalog(storage).map(function (s) { return s.station; });
  }

  /** 第二层：站点下堆场清单（E7：空数组时页面展示「暂无数据」） */
  function listYards(station, storage) {
    var entry = findStationEntry(getDestCatalog(storage), station);
    return entry ? entry.yards.map(function (y) { return y.yard; }) : [];
  }

  /** 反向关联（A5）：堆场 → 所属站点 */
  function resolveStationOfYard(yard, storage) {
    var key = trimStr(yard);
    var catalog = getDestCatalog(storage);
    for (var i = 0; i < catalog.length; i++) {
      for (var j = 0; j < catalog[i].yards.length; j++) {
        if (catalog[i].yards[j].yard === key) return catalog[i].station;
      }
    }
    return '';
  }

  /**
   * 第三层：堆场下钢厂客户清单（BR-O11 客户库联动）。
   * 目录内钢厂若在客户库中存在记录，非「正常」状态（停用/待审核/已驳回）则不可选。
   */
  function listSteels(yard, customersList, storage) {
    var entry = findStationEntry(getDestCatalog(storage), resolveStationOfYard(yard, storage));
    if (!entry) return [];
    var steels = [];
    for (var i = 0; i < entry.yards.length; i++) {
      if (entry.yards[i].yard === trimStr(yard)) {
        steels = entry.yards[i].steels.slice();
        break;
      }
    }
    // BR-O11：与客户库（客户管理模块）联动校验状态
    var blocked = {};
    var list = Array.isArray(customersList) ? customersList : [];
    for (var k = 0; k < list.length; k++) {
      var c = list[k];
      if (trimStr(c.name) && c.status !== '正常') blocked[trimStr(c.name)] = true;
    }
    return steels.filter(function (s) { return !blocked[s]; });
  }

  /** 码头清单：覆盖键优先，回退种子（TBD-02） */
  function listWharfOptions(storage) {
    var st = storageOf(storage);
    var over = st ? readJson(st, WHARF_OVERRIDE_KEY) : null;
    if (Array.isArray(over) && over.length) {
      var names = over.map(trimStr).filter(Boolean);
      if (names.length) return names;
    }
    return WHARF_SEED.slice();
  }

  /**
   * 港口 → 码头清单（R4 码头联动，来源：港口管理 hz_ports_data.wharfs）：
   * 按港口名称（trim 后精确匹配）在港口管理数据中查找；
   * - 命中且维护了 wharfs：返回 { matched: true, list: 该港码头清单 }；
   * - 命中但未维护 / 未命中：返回 matched 标识与空清单，
   *   由页面回退通用清单（listWharfOptions）并给出相应提示。
   */
  function listWharfsForPort(hzPorts, portName) {
    var name = trimStr(portName);
    if (!name) return { matched: false, list: [] };
    var list = Array.isArray(hzPorts) ? hzPorts : [];
    for (var i = 0; i < list.length; i++) {
      var p = list[i] || {};
      if (trimStr(p.name) !== name) continue;
      var ws = Array.isArray(p.wharfs)
        ? p.wharfs.map(trimStr).filter(Boolean)
        : [];
      return { matched: true, list: ws };
    }
    return { matched: false, list: [] };
  }

  /**
   * 矿山选项合并：矿山管理模块（hz_mines）优先，内置种子补位；
   * 返回 [{name, categories[], grade}]（categories 供品类自动带出 A1/A3）。
   */
  function listMineOptions(hzMines) {
    var out = [];
    var seen = {};
    var list = Array.isArray(hzMines) ? hzMines : [];
    for (var i = 0; i < list.length; i++) {
      var m = list[i];
      var name = trimStr(m.short_name || m.mine_name || m.name);
      if (!name || seen[name]) continue;
      seen[name] = true;
      var cats = String(m.main_products || '')
        .split(/[,，]/).map(trimStr).filter(Boolean);
      if (!cats.length) cats = seedCategoriesOf(name);
      out.push({ name: name, categories: cats, grade: trimStr(m.ore_grade) });
    }
    MINE_SEED.forEach(function (s) {
      if (!seen[s.name]) out.push({ name: s.name, categories: s.categories.slice(), grade: '' });
    });
    return out;
  }

  function seedCategoriesOf(name) {
    for (var i = 0; i < MINE_SEED.length; i++) {
      if (MINE_SEED[i].name === trimStr(name)) return MINE_SEED[i].categories.slice();
    }
    return [];
  }

  /**
   * 矿山 → 产品明细清单（矿山管理 hz_mines products_ext 同源，供货物名称下拉选择）。
   * 矿山存在但无产品明细（或不在矿山管理中）时，回退品类串
   * （main_products / 内置种子）为仅名称项，品质需手动填写。
   */
  function listMineProducts(mineName, hzMines) {
    var name = trimStr(mineName);
    if (!name) return [];
    var list = Array.isArray(hzMines) ? hzMines : [];
    for (var i = 0; i < list.length; i++) {
      var m = list[i];
      if (trimStr(m.short_name || m.mine_name || m.name) !== name) continue;
      var ext = Array.isArray(m.products_ext) ? m.products_ext : [];
      var out = [];
      for (var j = 0; j < ext.length; j++) {
        var p = ext[j] || {};
        var pn = trimStr(p.name);
        if (!pn) continue;
        out.push({
          name: pn,
          category: trimStr(p.category),
          spec: trimStr(p.spec),
          grade: trimStr(p.grade),
          impurity: trimStr(p.impurity),
          size: trimStr(p.size),
          moisture: trimStr(p.moisture),
          application: trimStr(p.application)
        });
      }
      if (out.length) return out;
      break; // 找到矿山但无产品明细 → 品类串回退
    }
    var options = listMineOptions(hzMines);
    for (var k = 0; k < options.length; k++) {
      if (options[k].name === name) {
        return options[k].categories.map(function (c) {
          return { name: c, category: '', spec: '', grade: '', impurity: '', size: '', moisture: '', application: '' };
        });
      }
    }
    return [];
  }

  /** 矿山 + 产品名 → 产品明细（无匹配返回 null，页面据此决定是否自动带出品质） */
  function findMineProduct(mineName, productName, hzMines) {
    var pn = trimStr(productName);
    if (!pn) return null;
    var list = listMineProducts(mineName, hzMines);
    for (var i = 0; i < list.length; i++) {
      if (list[i].name === pn) return list[i];
    }
    return null;
  }

  /**
   * 产品明细 → 货物品质串（自动带出口径）：品位 + 粒度 + 水分，
   * 与矿山管理产品详情同源（grade/size/moisture）。
   * 示例：品位 TFe 61.5%、粒度 -9.5mm 为主、水分 ≈ 8.5%
   * 杂质/用途不并入（输入框展示长度受限，完整信息见矿山管理产品详情）；水分「—」视为无效不并入。
   */
  function qualityOfProduct(p) {
    if (!p) return '';
    var parts = [];
    var grade = trimStr(p.grade) || trimStr(p.spec);
    if (grade) parts.push('品位 ' + grade);
    var size = trimStr(p.size);
    if (size) parts.push('粒度 ' + size);
    var moisture = trimStr(p.moisture);
    if (moisture && moisture !== '—') parts.push('水分 ' + moisture);
    return parts.join('、');
  }

  /**
   * 矿山 → 品类大类选项（矿山管理 products_ext[].category 同源，去重保序）。
   * 品类为矿山产品的归类（如铁矿石/铜精矿），用于「选矿山 → 选品类 → 过滤产品名 → 自动带出品质」联动；
   * 矿山无产品明细（回退项 category 为空）时返回空数组，页面展示空态引导，品类支持手动输入兜底。
   */
  function listMineCategories(mineName, hzMines) {
    var products = listMineProducts(mineName, hzMines);
    var out = [], seen = {};
    for (var i = 0; i < products.length; i++) {
      var c = trimStr(products[i].category);
      if (c && !seen[c]) { seen[c] = true; out.push(c); }
    }
    return out;
  }

  /** 港口选项合并：港口管理模块 + 卸货港字典 + 内置种子，去重（E7：空时页面提示） */
  function listPortOptions(hzPorts, hzDictPorts) {
    var out = [];
    var seen = {};
    function add(name) {
      var v = trimStr(name);
      if (v && !seen[v]) { seen[v] = true; out.push(v); }
    }
    (Array.isArray(hzPorts) ? hzPorts : []).forEach(function (p) { add(p && (p.name || p.port_name)); });
    (Array.isArray(hzDictPorts) ? hzDictPorts : []).forEach(function (d) { add(d && d.name); });
    PORT_SEED.forEach(add);
    return out;
  }

  /* ==================== 目的地求值（G4 / A4 / A5 / E5） ==================== */

  /**
   * 目的地状态求值：{station, yard, steel, station_manual} →
   * { level, complete, station, yard, steel, auto_station, path }
   * - level：0 未选 / 1 仅站点 / 2 选至堆场 / 3 选至钢厂
   * - complete：选至堆场及以上（BR-O07 触发口径；仅站点不满足，E5）
   * - auto_station：堆场反向带出站点标注（A5）
   * - path：路径回显（如「武安站 / 河北陆港保税物流中心（保税堆场）」）
   */
  function evalDestination(dest, storage) {
    var d = dest || {};
    var station = trimStr(d.station);
    var yard = trimStr(d.yard);
    var steel = trimStr(d.steel);
    var resolvedStation = station;
    var autoStation = false;
    if (!resolvedStation && yard) {
      resolvedStation = resolveStationOfYard(yard, storage); // A5 反向关联
      autoStation = !!resolvedStation;
    }
    var pathParts = [];
    if (resolvedStation) pathParts.push(resolvedStation + (autoStation ? '（自动带出）' : ''));
    if (yard) pathParts.push(yard);
    if (steel) pathParts.push(steel);
    return {
      level: steel ? 3 : (yard ? 2 : (station ? 1 : 0)),
      complete: !!yard,
      station: resolvedStation,
      yard: yard,
      steel: steel,
      auto_station: autoStation,
      path: pathParts.join(' / ')
    };
  }

  function validateDestination(dest, storage) {
    var ev = evalDestination(dest, storage);
    return ev.complete ? '' : MSG.destIncomplete; // E5
  }

  /* ==================== 字段校验（E3 / E4 / F6①） ==================== */

  /** 吨数：必填、大于 0、整数或 1 位小数（E3） */
  function validateTonnage(v) {
    var s = trimStr(v);
    if (s === '') return MSG.tonnageInvalid;
    var n = Number(s);
    if (!isFinite(n) || n <= 0) return MSG.tonnageInvalid;
    if (s.indexOf('.') >= 0) {
      var dec = s.split('.')[1] || '';
      if (dec.length > 1) return MSG.tonnageFormat;
    }
    return '';
  }

  /** 价格（元/吨）：必填、≥0、数字、最多 2 位小数（E4；上限 2 位小数为本模块补充假设） */
  function validatePrice(v) {
    var s = trimStr(v);
    if (s === '') return MSG.priceInvalid;
    var n = Number(s);
    if (!isFinite(n) || n < 0) return MSG.priceInvalid;
    if (s.indexOf('.') >= 0) {
      var dec = s.split('.')[1] || '';
      if (dec.length > 2) return MSG.priceInvalid;
    }
    return '';
  }

  /**
   * 表单全量校验（F6①）：返回 {ok, errors, firstField}。
   * 校验顺序 = 区块字段顺序（BR-O03）：自然信息 → 矿山 → 品类 → 货物名称/品质（TBD-03 保留）→
   * 吨数 → 价格 → 港口 → 目的地；首个失败项用于提交定位。
   */
  function validateForm(payload, subjectRes, storage) {
    var p = payload || {};
    var errors = {};
    var order = [];
    function check(field, msg) {
      order.push(field);
      if (msg) errors[field] = msg;
    }
    check('_subject', validateSubject(subjectRes));
    check('mine', trimStr(p.mine) ? '' : '请选择矿山');
    check('category', trimStr(p.category) ? '' : '请选择品类');
    check('cargoName', trimStr(p.cargoName) ? '' : '请选择或输入货物名称');
    check('cargoQuality', trimStr(p.cargoQuality) ? '' : '请输入货物品质');
    check('tonnage', validateTonnage(p.tonnage));
    check('price', validatePrice(p.price));
    check('port', trimStr(p.port) ? '' : '请选择港口');
    // 年月日必选、几点几分为可选：日期未选即校验失败（时间可留空，不做格式强校验）
    check('arrivalAt', trimStr(p.arrivalAt) ? '' : '请选择到港日期');
    check('departAt', trimStr(p.departAt) ? '' : '请选择发运日期');
    check('destination', validateDestination(p.destination, storage));
    var firstField = '';
    for (var i = 0; i < order.length; i++) {
      if (errors[order[i]]) { firstField = order[i]; break; }
    }
    return { ok: !firstField, errors: errors, firstField: firstField };
  }

  /* ==================== 智能方案（F4 / BR-O07 / CL-1~CL-4 / E6） ==================== */

  /**
   * 计算智能方案（纯函数，异常安全：非法入参返回未触发而非抛错，供页面 E6 兜底）。
   * 触发条件（BR-O07）：港口已选 + 目的地选至堆场（仅站点不满足）+ 吨数有效。
   * 未触发时返回 missing（缺失项提示），页面据此置灰并提示。
   */
  function computeSmartPlans(input, storage) {
    var inp = input || {};
    var tonnage = Number(inp.tonnage);
    var port = trimStr(inp.port);
    var ev = evalDestination(inp.destination, storage);

    var missing = [];
    if (!port) missing.push('港口');
    if (!ev.complete) missing.push('目的地（需选至堆场）');
    if (!(isFinite(tonnage) && tonnage > 0)) missing.push('吨数');

    if (missing.length) {
      return { triggered: false, missing: missing, plans: [], line: '' };
    }

    // CL-1：汽运直达天数 = ⌈吨数 ÷ 2500⌉
    var roadDays = up(tonnage / ROAD_TONS_PER_DAY);
    // CL-2/CL-4：铁路列数 = ⌈吨数 ÷ 3500⌉
    var trains = up(tonnage / RAIL_TONS_PER_TRAIN);
    // CL-2 公路短驳车次 = ⌈吨数 ÷ 33⌉（铁路站 → 堆场末段）
    var trucks = up(tonnage / ROAD_TONS_PER_TRUCK);
    // CL-3：线路选择 —— 目的地归属曹庄镇站方向 → 曹庄镇线，其余 → 沧港线
    var line = ev.station === CAOZHUANG_STATION ? LINE_CAOZHUANG : LINE_CANGGANG;

    var endNode = ev.steel || ev.yard;
    var yardPath = ev.yard + (ev.steel ? '（' + ev.steel + '）' : '');
    var qtyText = fmtNum(tonnage);

    var plans = [
      {
        type: 'road_direct',
        label: '汽运直达',
        path: port + ' → ' + endNode,
        basis: '汽运基准 ' + fmtNum(ROAD_TONS_PER_DAY) + ' 吨/日',
        qty: roadDays,
        unit: '天',
        detail: '需 ' + roadDays + ' 天完成 ' + qtyText + ' 吨汽运直达发运'
      },
      {
        type: 'rail_transit',
        label: '公铁联运',
        path: port + ' → 铁路集运（' + line + '）→ ' + ev.station + ' → 短驳 → ' + yardPath,
        basis: '铁路基准约 ' + fmtNum(RAIL_TONS_PER_TRAIN) + ' 吨/列 · 公路短驳约 ' + fmtNum(ROAD_TONS_PER_TRUCK) + ' 吨/车',
        qty: trains,
        unit: '列',
        road: { qty: trucks, unit: '车' },
        line: line,
        detail: '需 ' + trains + ' 列经 ' + line + ' 至 ' + ev.station + '，再以 ' + trucks + ' 车公路短驳至目的地'
      },
      {
        type: 'rail_direct',
        label: '铁路直达',
        path: port + ' → 铁路直达（' + line + '）→ ' + yardPath,
        basis: '铁路基准约 ' + fmtNum(RAIL_TONS_PER_TRAIN) + ' 吨/列',
        qty: trains,
        unit: '列',
        line: line,
        tag: RAIL_DIRECT_TAG,
        detail: '需 ' + trains + ' 列经 ' + line + ' 铁路直达（' + RAIL_DIRECT_TAG + '）'
      }
    ];

    return {
      triggered: true,
      missing: [],
      plans: plans,
      line: line,
      computed_at: fmtTime(new Date())
    };
  }

  /* ==================== 订单组装与衔接（F6 / TBD-08 / TBD-10） ==================== */

  var _seq = 0;
  function genId(prefix) {
    _seq = (_seq + 1) % 1296;
    return (prefix || 'gen') + '_' + Date.now().toString(36) + _seq.toString(36) +
      Math.floor(Math.random() * 1296).toString(36);
  }

  /** 目的地末端节点名（写入现有 customers[] 通道，兼容详情/差额展示） */
  function endNodeName(dest, storage) {
    var ev = evalDestination(dest, storage);
    return ev.steel || ev.yard || ev.station || '';
  }

  /**
   * 组装 flow 订单对象（映射现有模型，提交后由页面 saveOrder 落库）：
   * - 自然信息 ← 登录主体（trader / traderContact / traderContactInfo）
   * - 到港时间 → loadingStart、发运时间 → departure（ISO，兼容现有字段口径）
   * - 目的地 → destination（新字段）+ customers[]（兼容映射，末端节点单行）
   * - 智能方案快照 → smartPlan（供后续环节参考）
   * - 船舶静态信息 → vesselInfo（9 项，非必填）
   * - 水尺数不再采集（AC-O04：界面与存储均无 draftMark）
   */
  function buildOrder(payload, subjectRes) {
    var p = payload || {};
    var s = (subjectRes && subjectRes.subject) || {};
    var tonnage = Number(p.tonnage) || 0;
    var price = Number(p.price) || 0;
    var dest = p.destination || {};
    var plansRes = p.plans || { triggered: false, missing: [], plans: [] };
    var vi = p.vesselInfo || {};

    function viTrim(k) { return trimStr(vi[k]); }

    return {
      id: '',
      status: 'draft', // 提交时由页面置为 port（待港口），进入四步向导后续环节
      trader: trimStr(s.company),
      traderContact: trimStr(s.contact),
      traderContactInfo: trimStr(s.phone),
      mine: trimStr(p.mine),
      category: trimStr(p.category),
      cargoName: trimStr(p.cargoName),
      cargoQuality: trimStr(p.cargoQuality),
      cargoTotal: tonnage,
      cargoPrice: price,
      destPort: trimStr(p.port),
      loadingStart: toIso(p.arrivalAt),
      departure: toIso(p.departAt),
      wharfs: Array.isArray(p.wharfs) ? p.wharfs.map(trimStr).filter(Boolean) : [],
      vessel: trimStr(p.vessel),
      destination: {
        station: trimStr(dest.station),
        yard: trimStr(dest.yard),
        steel: trimStr(dest.steel)
      },
      customers: [{
        id: genId('cust'),
        name: endNodeName(dest),
        qty: tonnage
      }],
      vesselInfo: {
        company: viTrim('company'),     // 船公司名称
        scale: viTrim('scale'),         // 船舶规模
        type: viTrim('type'),           // 船型类别（散堆船/集装箱船）
        route: viTrim('route'),         // 航线
        runTime: viTrim('runTime'),     // 运行时间
        seaPrice: viTrim('seaPrice'),   // 海运价格
        cycleTime: viTrim('cycleTime'), // 到港全周期时间
        shipper: viTrim('shipper'),     // 船发货人
        consignee: viTrim('consignee')  // 接货人
      },
      smartPlan: {
        triggered: !!plansRes.triggered,
        plans: Array.isArray(plansRes.plans) ? plansRes.plans : [],
        computed_at: plansRes.computed_at || ''
      },
      createdAt: fmtTime(new Date()),
      updatedAt: fmtTime(new Date())
    };
  }

  /** 港口环节预填（F6③/TBD-10 假设）：结构对齐 order-port 默认记录 */
  function buildPortPrefill(order) {
    return {
      orderId: order.id,
      portName: order.destPort || '',
      congestion: 'normal',
      efficiency: '',
      wharf: (Array.isArray(order.wharfs) && order.wharfs[0]) || '',
      berth: '',
      yard: '',
      waitHours: 0,
      updatedAt: new Date().toISOString()
    };
  }

  /**
   * 运力环节预填（F6③/TBD-10 假设）：按智能方案生成 3 行通道，
   * 数值字段（idleCapacity/plannedQty/price/leadTime）留 0 由人工确认，人工仍可调整。
   */
  function buildCapacityPrefills(order, plansRes, idGen) {
    var gen = idGen || function () { return genId('cap'); };
    var plans = (plansRes && plansRes.plans) || [];
    var dest = order.destination || {};
    var rows = [];
    for (var i = 0; i < plans.length; i++) {
      var plan = plans[i];
      var row = {
        id: gen(),
        orderId: order.id,
        channelType: plan.type === 'road_direct' ? 'road'
          : (plan.type === 'rail_transit' ? 'rail_transit' : 'rail_direct'),
        origin: order.destPort || '',
        destination: dest.yard || dest.steel || '',
        idleCapacity: 0,
        plannedQty: 0,
        price: 0,
        leadTime: 0,
        carrier: ''
      };
      if (row.channelType === 'rail_transit') {
        row.transfer = dest.station || '';
        row.roadCarrier = '';
      }
      if (row.channelType === 'road') {
        row.roadCarrier = '';
      }
      rows.push(row);
    }
    return rows;
  }

  /**
   * 船舶静态信息航次补丁（F5④/AC-O09）：提交并已填船名时，
   * 海运航次记录将携带与本板块 9 项一致的 vessel_info。
   * （页面提交链路：saveOrder → flow-data.syncVoyageToOcean 读取 order.vesselInfo 写入）
   */
  function buildVesselInfoPatch(order) {
    if (!order || !order.vesselInfo) return null;
    var info = order.vesselInfo;
    return {
      vessel_info: {
        company: trimStr(info.company),
        scale: trimStr(info.scale),
        type: trimStr(info.type),
        route: trimStr(info.route),
        runTime: trimStr(info.runTime),
        seaPrice: trimStr(info.seaPrice),
        cycleTime: trimStr(info.cycleTime),
        shipper: trimStr(info.shipper),
        consignee: trimStr(info.consignee)
      }
    };
  }

  /** 台账同步点判定（F6②）：达到「待确认」及之后的订单自动同步台账（现有逻辑 FR-03） */
  function isLedgerSynced(status) {
    return LEDGER_SYNC_STATUSES.indexOf(status) >= 0;
  }

  /* ==================== 导出 ==================== */

  return {
    // 键与常量
    SUBJECT_KEY: SUBJECT_KEY,
    DEST_OVERRIDE_KEY: DEST_OVERRIDE_KEY,
    WHARF_OVERRIDE_KEY: WHARF_OVERRIDE_KEY,
    ROAD_TONS_PER_DAY: ROAD_TONS_PER_DAY,
    RAIL_TONS_PER_TRAIN: RAIL_TONS_PER_TRAIN,
    WHARF_SEED: WHARF_SEED,
    VESSEL_TYPES: VESSEL_TYPES,
    MINE_SEED: MINE_SEED,
    PORT_SEED: PORT_SEED,
    DEST_SEED: DEST_SEED,
    FALLBACK_SUBJECT: FALLBACK_SUBJECT,
    FLOW_STATUSES: FLOW_STATUSES,
    LINE_CANGGANG: LINE_CANGGANG,
    LINE_CAOZHUANG: LINE_CAOZHUANG,
    MSG: MSG,
    // 登录主体
    getLoginSubject: getLoginSubject,
    validateSubject: validateSubject,
    // 基础数据
    getDestCatalog: getDestCatalog,
    listStations: listStations,
    listYards: listYards,
    listSteels: listSteels,
    resolveStationOfYard: resolveStationOfYard,
    listWharfOptions: listWharfOptions,
    listWharfsForPort: listWharfsForPort,
    wharfSeedOf: wharfSeedOf,
    listMineOptions: listMineOptions,
    listMineCategories: listMineCategories,
    listMineProducts: listMineProducts,
    findMineProduct: findMineProduct,
    qualityOfProduct: qualityOfProduct,
    listPortOptions: listPortOptions,
    // 目的地与校验
    evalDestination: evalDestination,
    validateDestination: validateDestination,
    validateTonnage: validateTonnage,
    validatePrice: validatePrice,
    validateForm: validateForm,
    // 智能方案
    computeSmartPlans: computeSmartPlans,
    // 组装与衔接
    buildOrder: buildOrder,
    buildPortPrefill: buildPortPrefill,
    buildCapacityPrefills: buildCapacityPrefills,
    buildVesselInfoPatch: buildVesselInfoPatch,
    endNodeName: endNodeName,
    isLedgerSynced: isLedgerSynced,
    // 工具
    fmtNum: fmtNum,
    toIso: toIso,
    fmtTime: fmtTime
  };
}));
