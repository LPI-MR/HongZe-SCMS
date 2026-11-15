// ===== HZData 模块化数据调用基座（全项目统一数据源注册表） =====
// 职责：把各模块业务数据收拢为标准化接口，供任意模块直接调取
//  - MODULES：15 个模块数据源注册表（API 资源名 + 业务标签）
//  - unwrap：经 HZDB 内存缓存同步读取（/api/bootstrap 全量拉取，写操作走 HZDB.put）
//  - raw / list / find / count：读接口（list 支持 where 过滤 + sort 排序 + enrich 富化）
//  - normalize / enrich：单条归一化与跨模块富化（矿山、品质证书等关联字段注入）
//  - dict：业务字典（卸货港 / 矿山装货港 / 现货港口 / 状态枚举；DB 字典优先，静态值兜底）
// 使用约定：页面入口先 await HZDB.ready() 完成缓存装载，再经 HZData 同步读取
window.HZData = (function () {
  'use strict';

  // ===== 模块数据源注册表 =====
  // api 为后端 API 资源名（/api/:res），label 为左侧菜单对应的模块名
  const MODULES = {
    mines:       { api: 'mines',       label: '矿山管理' },
    ports:       { api: 'ports',       label: '港口码头' },
    transfer:    { api: 'stations',    label: '中转节点' },
    warehouse:   { api: 'warehouses',  label: '仓储管理' },
    railway:     { api: 'rails',       label: '铁路运输' },
    fleet:       { api: 'fleets',      label: '汽运车队' },
    steel:       { api: 'steels',      label: '钢厂管理' },
    trips:       { api: 'trips',       label: '汽运车次' },
    oceanTrips:  { api: 'voyages',     label: '海运航次' },
    oceanSpots:  { api: 'spots',       label: '港口现货' },
    oceanCoas:   { api: 'coas',        label: '品质证书' },
    contracts:   { api: 'contracts',   label: '合同管理' },
    orders:      { api: 'ledger',      label: '订单台账' },
    settlements: { api: 'settlements', label: '结算管理' },
    orderLogs:   { api: 'ledgerLogs',  label: '订单日志' }
  };

  // ===== 缓存解包：经 HZDB 同步读取（boot 后可用；未 boot 返回空数组兜底） =====
  function unwrap(key) {
    const mod = MODULES[key];
    if (!mod) return [];
    const HZDB = window.HZDB;
    if (!HZDB || typeof HZDB.get !== 'function') return [];
    const arr = HZDB.get(mod.api);
    return Array.isArray(arr) ? arr : [];
  }

  // ===== 归一化工具 =====
  // 港口归一：去首尾空白 + 去尾部「港」字（「青岛港」「青岛」视为同一港口）
  function normalizePort(name) {
    return String(name == null ? '' : name).trim().replace(/港$/, '');
  }

  // 船名清洗：去括号中文别名（「SHANDONG DREAM（山东梦想）」→「SHANDONG DREAM」）
  // + 去 M/V、MV、SM 等船名前缀 + 统一大写（跨模块船舶匹配依据）
  function cleanVessel(name) {
    return String(name == null ? '' : name)
      .replace(/[（(][^（）()]*[)）]/g, '')
      .replace(/^(M\/V|MV|SM)[\s.·-]+/i, '')
      .trim()
      .toUpperCase();
  }

  // ===== 单条归一化器（按模块注册；未注册的模块原样浅拷贝） =====
  const NORMALIZERS = {
    // 港口现货：id / 数据来源 / 数据日期兜底 + 港口归一 + 船名清洗（联动匹配字段）
    oceanSpots: function (item, index) {
      const o = Object.assign({}, item);
      if (!o.id) o.id = 'spot-' + String((Number(index) || 0) + 1).padStart(3, '0');
      if (o.source == null) o.source = DICTS.spotMeta.source;
      if (o.data_date == null) o.data_date = DICTS.spotMeta.dataDate;
      o.normalized_port = normalizePort(o.port);
      o.vessel_clean = cleanVessel(o.vessel);
      return o;
    }
  };

  // ===== 跨模块富化器（按模块注册；关联字段注入） =====
  const ENRICHERS = {
    // 海运航次：+mine（mine_id → 矿山主数据）+coa（voyage_id → 品质证书）
    oceanTrips: function (v) {
      if (v.mine_id) {
        const mines = unwrap('mines');
        v.mine = mines.find(m => m.id === v.mine_id) || null;
      }
      const coas = unwrap('oceanCoas');
      v.coa = coas.find(c => c.voyage_id === v.id) || null;
      return v;
    }
  };

  // ===== 业务字典 =====
  // DB 字典（meta.dict_entry，经 HZDB.dicts() 缓存）优先；下列静态值为 DB 缺失时的兜底
  // dischargePorts：中国主要铁矿石接卸港（9 港）；mineLoadPorts：矿山 → 推荐装货港
  const DICTS = {
    dischargePorts: [
      { name: '青岛港', country: '中国' },
      { name: '曹妃甸港', country: '中国' },
      { name: '日照港', country: '中国' },
      { name: '舟山港', country: '中国' },
      { name: '大连港', country: '中国' },
      { name: '天津港', country: '中国' },
      { name: '湛江港', country: '中国' },
      { name: '上海港', country: '中国' },
      { name: '连云港', country: '中国' }
    ],
    mineLoadPorts: [
      { mine: '力拓', port: '丹皮尔港', country: '澳大利亚', note: '西澳矿区 → 丹皮尔港，铁路短倒约 300km' },
      { mine: '必和必拓', port: '黑德兰港', country: '澳大利亚', note: '纽曼矿区 → 黑德兰港，铁路短倒约 400km' },
      { mine: '福斯特库', port: '黑德兰港', country: '澳大利亚', note: '奇切斯特岭矿区 → 黑德兰港，铁路短倒约 250km' },
      { mine: '淡水河谷', port: '图巴朗港', country: '巴西', note: '卡拉加斯矿区 → 图巴朗港，铁路短倒约 900km' }
    ],
    orderStatus: ['待确认', '已确认', '执行中', '已发运', '已完成', '已终止'],
    settleTypes: ['应收', '应付'],
    voyageStatus: {
      pending: '待装船',
      loading: '装船中',
      sailing: '在途',
      arrived: '已到港',
      done: '已完成'
    },
    spotMeta: {
      source: '中国矿产·中矿国链港口现货',
      dataDate: '2026-05-25'
    }
  };

  // dict(name) → DB 字典 scope 对照
  const SCOPE_NAMES = {
    dischargePorts: 'discharge_ports',
    mineLoadPorts: 'mine_load_ports',
    orderStatus: 'order_status',
    settleTypes: 'settle_type',
    voyageStatus: 'voyage_status',
    spotMeta: 'spot_meta'
  };

  // DB 字典 scope → dict(name) 各键的映射取值器（HZDB.dicts() 形状：{ scope: [entries] }）
  const DICT_SCOPES = {
    dischargePorts: function (es) {
      return es.map(e => ({ name: e.label || e.code, country: (e.payload && e.payload.country) || '中国' }));
    },
    mineLoadPorts: function (es) {
      return es.map(e => Object.assign({ mine: e.label, port: e.label }, e.payload || {}));
    },
    orderStatus: function (es) { return es.map(e => e.label || e.code); },
    settleTypes: function (es) { return es.map(e => e.label || e.code); },
    voyageStatus: function (es) {
      const m = {};
      es.forEach(e => { m[e.code] = e.label || e.code; });
      return m;
    },
    spotMeta: function (es) {
      const e = es.find(x => x.code === 'default') || es[0];
      return (e && e.payload) || DICTS.spotMeta;
    }
  };

  function dict(name) {
    if (name === 'spotPorts') {
      // 现货港口：从现货数据去重计算（数据驱动，不写死）
      const seen = {};
      const ports = [];
      unwrap('oceanSpots').forEach(s => {
        const p = s && s.port;
        if (p && !seen[p]) { seen[p] = true; ports.push({ name: p }); }
      });
      return ports;
    }
    // DB 字典优先（boot 后可用），静态值兜底（boot 前或 scope 缺失）
    const HZDB = window.HZDB;
    const take = DICT_SCOPES[name];
    if (HZDB && typeof HZDB.dicts === 'function' && take) {
      const entries = HZDB.dicts()[SCOPE_NAMES[name]];
      if (Array.isArray(entries) && entries.length) return take(entries);
    }
    return DICTS[name] || null;
  }

  // ===== 标准化读接口 =====

  // raw(key)：原始数组（不做归一化，保留模块原生字段）
  function raw(key) {
    return unwrap(key);
  }

  // normalize(key, item, index)：单条归一化（挂接联动字段 normalized_port / vessel_clean 等）
  function normalize(key, item, index) {
    const norm = NORMALIZERS[key];
    return norm ? norm(item, index) : Object.assign({}, item);
  }

  // enrich(key, item)：单条富化（注入 mine / coa 等跨模块关联数据）
  function enrich(key, item) {
    const enr = ENRICHERS[key];
    return enr ? enr(item) : item;
  }

  // list(key, opts)：归一化列表；opts.where 过滤 / opts.sort 排序 / opts.enrich 富化
  function list(key, opts) {
    opts = opts || {};
    let arr = unwrap(key).map((item, i) => normalize(key, item, i));
    if (typeof opts.where === 'function') arr = arr.filter(opts.where);
    if (typeof opts.sort === 'function') arr.sort(opts.sort);
    if (opts.enrich) arr = arr.map(item => enrich(key, item));
    return arr;
  }

  // find(key, id)：按 id 查单条（归一化 + 富化）
  function find(key, id) {
    const arr = list(key, { enrich: true });
    return arr.find(item => item && item.id === id) || null;
  }

  // count(key, where)：计数；where 可省略
  function count(key, where) {
    if (typeof where !== 'function') return unwrap(key).length;
    return list(key).filter(where).length;
  }

  // meta(key)：单模块元信息；metaAll()：全部模块元信息（模块面板 / 数据联调用）
  function meta(key) {
    const mod = MODULES[key];
    if (!mod) return null;
    return {
      key: key,
      api: mod.api,
      label: mod.label,
      count: count(key)
    };
  }

  function metaAll() {
    return Object.keys(MODULES).map(meta);
  }

  // ===== 对外暴露 =====
  return {
    MODULES: MODULES,
    unwrap: unwrap,
    normalizePort: normalizePort,
    cleanVessel: cleanVessel,
    raw: raw,
    list: list,
    find: find,
    count: count,
    meta: meta,
    metaAll: metaAll,
    normalize: normalize,
    enrich: enrich,
    dict: dict
  };
})();
