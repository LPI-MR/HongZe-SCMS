// ===== 客户管理 · 一次性数据同步引擎 =====
// 纯逻辑引擎（无 DOM 依赖），由 customers/sync.html 调用。
// 设计约束（见 customers/PRD-客户管理一次性数据同步.md）：
//   1. 对六个存量模块的 localStorage 键【只读】，绝不写入、绝不修改源数据；
//      本引擎的写入仅发生在客户管理专属键空间（hz_customers_* 前缀）
//   2. 仅同步「公司/企业主体」，过滤「地点/点位/场站」类数据（L1-L5 多层校验）
//   3. 自动完成角色打标、行业标签、数据来源标记与模块映射，全程无人工干预
//   4. 幂等：主体 ID 由名称键哈希稳定生成，重复执行结果一致
//   5. 支持断点续传（checkpoint）与完整执行日志
(function () {
  'use strict';

  /* ==================== 键空间常量（客户管理专属） ==================== */

  var UNIFIED_KEY = 'hz_customers_unified_v1';         // 客户管理统一库
  var UNIFIED_VERSION = 'v1';
  var CHECKPOINT_KEY = 'hz_customers_sync_checkpoint';  // 断点续传检查点
  var REPORTS_KEY = 'hz_customers_sync_reports';        // 同步报告（最近 20 份）
  var SNAPSHOT_PREFIX = 'hz_customers_unified_snapshot_'; // 写库前快照备份

  /* ==================== 六个存量模块同步配置（枚举固定） ==================== */

  // 提取途径说明：via 用于标记主体来源方式（记录主体 / 从点位记录中提取的运营主体）
  // 矿石贸易商名录（客户管理自有权威数据源，不属于六个存量模块；业务定位经确认：均为矿石贸易商，且为我方付费客户而非货物供应商）
  var TRADER_COMPANIES = [
    { name: '中国矿产资源集团有限公司', shortName: '中矿', intro: '中央企业，承担铁矿石等大宗矿产资源集中采购、储运与调配职能，服务钢铁产业链供应链安全稳定。' },
    { name: '四川云贸国际供应链有限公司', shortName: '四川云贸', intro: '四川国际大宗商品供应链服务平台，开展矿石等大宗商品进出口贸易与供应链服务。' },
    { name: '厦门建发股份有限公司', shortName: '建发股份', intro: '建发集团旗下供应链运营企业，铁矿石等大宗商品贸易规模位居行业前列。' },
    { name: '厦门国贸集团股份有限公司', shortName: '厦门国贸', intro: '供应链管理综合服务商，铁矿石等黑色金属贸易为核心业务板块之一。' },
    { name: '中国五矿集团有限公司', shortName: '中国五矿', intro: '中央企业，金属矿产领域国有资本投资公司，铁矿石贸易与冶金工程服务规模领先。' },
    { name: '瑞茂通供应链管理股份有限公司', shortName: '瑞茂通', intro: '大宗商品供应链管理企业，矿石等大宗商品供应链服务为核心业务。' },
    { name: '厦门象屿集团有限公司', shortName: '厦门象屿', intro: '大宗商品供应链服务商，金属矿产供应链运营业务覆盖铁矿石等品类。' },
    { name: '物产中大集团股份有限公司', shortName: '物产中大', intro: '浙江省属特大型国有控股上市公司，大宗商品供应链集成服务商。' }
  ];

  var SOURCES = [
    {
      key: 'railway',
      label: '铁路供应商管理',
      storeKey: 'hz_railway_suppliers',
      roles: ['物流服务商', '场站服务商'],
      industries: ['铁路运营'],
      detailUrl: function (id) { return '/railway/railway-detail.html?id=' + encodeURIComponent(id); },
      extract: function (rec) {
        var person = (rec.persons && rec.persons[0]) || {};
        return [{
          name: rec.name,
          creditCode: kvGet(rec.facts, '统一社会信用代码'),
          via: '记录主体',
          profile: {
            '企业简称': rec.shortName || '',
            '联系人': person.name || '',
            '联系电话': person.tel || '',
            '网址': rec.site || '',
            '地址': kvGet(rec.facts, '地址') || '',
            '简介': joinLines(rec.intro)
          },
          attrs: attrsOf(rec.facts)
        }];
      }
    },
    {
      key: 'ports',
      label: '港口管理',
      storeKey: 'hz_ports_data',
      roles: ['场站服务商', '物流服务商'],
      industries: ['港口节点'],
      detailUrl: function (id) { return '/ports/ports-detail.html?id=' + encodeURIComponent(id); },
      extract: function (rec) {
        // 港口记录本体为物理点位（必被 L3 过滤）；运营主体从信息卡字段提取
        var cands = [{
          name: rec.name,
          creditCode: '',
          via: '记录本体（物理点位）',
          profile: { '简介': joinLines(rec.intro) },
          attrs: attrsOf(rec.basicInfo)
        }];
        var op = findKV(rec.basicInfo, /行政管理部门|运营主体|运营单位|经营单位|管理单位/);
        if (op && op.value) {
          cands.push({
            name: op.value,
            creditCode: '',
            via: '提取自「' + op.label + '」字段',
            profile: {},
            attrs: attrsOf(rec.basicInfo)
          });
        }
        return cands;
      }
    },
    {
      key: 'transfer',
      label: '中转站点管理',
      storeKey: 'hz_transfer_stations',
      roles: ['场站服务商'],
      industries: ['铁路场站'],
      detailUrl: function (id) { return '/transfer/transfer-detail.html?id=' + encodeURIComponent(id); },
      extract: function (rec) {
        var cands = [{
          name: rec.name,
          creditCode: '',
          via: '记录本体（物理点位）',
          profile: { '简介': joinLines(rec.intro) },
          attrs: attrsOf(rec.basicInfo)
        }];
        var op = findKV(rec.basicInfo, /隶属铁路局|运营主体|运营单位|经营单位/);
        if (op && op.value) {
          cands.push({
            name: op.value,
            creditCode: '',
            via: '提取自「' + op.label + '」字段',
            profile: {},
            attrs: attrsOf(rec.basicInfo)
          });
        }
        return cands;
      }
    },
    {
      key: 'warehouse',
      label: '仓储管理',
      storeKey: 'hz_warehouse_suppliers_v1',
      roles: ['仓储服务商'],
      industries: ['仓储园区'],
      detailUrl: function () { return '/warehouse/suppliers.html'; },
      extract: function (rec) {
        return [{
          name: rec.name,
          creditCode: '',
          via: '记录主体',
          profile: {
            '服务类型': rec.type || '',
            '联系人': rec.contact || '',
            '联系电话': rec.phone || '',
            '地址': rec.address || '',
            '年吞吐量': rec.throughput || '',
            '占地面积': rec.area || '',
            '简介': joinLines(rec.intro)
          },
          attrs: []
        }];
      }
    },
    {
      key: 'fleet',
      label: '汽运车队管理',
      storeKey: 'hzwl_fleets_v2',
      roles: ['物流服务商'],
      industries: ['公路运输'],
      detailUrl: function () { return '/fleet/fleet.html'; },
      extract: function (rec) {
        return [{
          name: rec.name,
          creditCode: '',
          via: '记录主体',
          profile: {
            '车队类型': rec.type || '',
            '联系人': rec.contact || '',
            '联系电话': rec.phone || '',
            '地址': rec.address || '',
            '运输能力': rec.capacity || '',
            '车队规模': rec.fleetSize || '',
            '备注': rec.remark || ''
          },
          attrs: []
        }];
      }
    },
    {
      key: 'steel',
      label: '钢厂管理',
      storeKey: 'hzwl_steels_v2',
      // 角色定位：钢厂为我方付费客户（不承担货物供应商角色）
      roles: ['付费客户'],
      industries: ['钢铁生产企业'],
      detailUrl: function () { return '/steel/steel.html'; },
      extract: function (rec) {
        return [{
          name: rec.name,
          creditCode: '',
          via: '记录主体',
          profile: {
            '合作类型': rec.type || '',
            '联系人': rec.contact || '',
            '联系电话': rec.phone || '',
            '地址': rec.address || '',
            '企业性质': rec.nature || '',
            '产能': rec.capacity || '',
            '矿石需求': rec.oreDemand || '',
            '成立年份': rec.founded || '',
            '注册资本': rec.regCapital || '',
            '主营产品': rec.products || '',
            '简介': joinLines(rec.intro)
          },
          attrs: []
        }];
      }
    },
    {
      // 第7源：矿石贸易商名录（客户管理自有权威数据源，非六个存量模块）
      // authoritative：名录定位权威，合并时行业标签以名录为准（修正老模块自动打标可能产生的定位误区）
      // 角色定位：矿石贸易商为我方付费客户（不承担货物供应商角色）
      key: 'trader',
      label: '矿石贸易商名录',
      storeKey: null,
      authoritative: true,
      roles: ['付费客户'],
      industries: ['矿石贸易商'],
      detailUrl: function () { return ''; },
      extract: function (rec) {
        return [{
          name: rec.name,
          creditCode: '',
          via: '名录建档',
          profile: {
            '企业简称': rec.shortName || '',
            '简介': rec.intro || ''
          },
          attrs: []
        }];
      }
    }
  ];

  // 统一库标签体系（筛选与打标使用）
  var ROLES_ALL = ['物流服务商', '场站服务商', '仓储服务商', '付费客户'];
  var INDUSTRIES_ALL = ['钢铁生产企业', '矿石贸易商', '铁路运营', '铁路场站', '仓储园区', '公路运输', '港口节点'];
  var VIEW_CUSTOMER_ROLE = '付费客户';
  var VIEW_RESOURCE_ROLES = ['物流服务商', '场站服务商', '仓储服务商'];

  /* ==================== 工具函数 ==================== */

  function log(level, msg) {
    return { ts: Date.now(), level: level, msg: String(msg) };
  }

  function fmtTime(ts) {
    var d = new Date(ts);
    var p = function (n) { return String(n).padStart(2, '0'); };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' +
      p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
  }

  // 从 {label,value} 信息卡数组中取第一个命中 label 的 value
  function kvGet(arr, pattern) {
    var hit = findKV(arr, pattern);
    return hit ? hit.value : '';
  }

  function findKV(arr, pattern) {
    if (!Array.isArray(arr)) return null;
    // pattern 兼容字符串与正则两种形式
    var re = pattern instanceof RegExp ? pattern : new RegExp(String(pattern));
    for (var i = 0; i < arr.length; i++) {
      var it = arr[i];
      if (it && re.test(String(it.label || ''))) {
        return { label: String(it.label), value: it.value == null ? '' : String(it.value).trim() };
      }
    }
    return null;
  }

  // {label,value}[] → 干净的 attrs 数组（过滤空值）
  function attrsOf(arr) {
    if (!Array.isArray(arr)) return [];
    return arr.filter(function (it) {
      return it && it.label && it.value != null && String(it.value).trim() !== '';
    }).map(function (it) { return { label: String(it.label), value: String(it.value) }; });
  }

  // 简介：兼容字符串 / 段落数组两种历史格式
  function joinLines(v) {
    if (Array.isArray(v)) return v.filter(Boolean).join('\n').trim();
    return String(v == null ? '' : v).trim();
  }

  function unionArr(a, b) {
    var out = a.slice();
    (b || []).forEach(function (x) { if (out.indexOf(x) < 0) out.push(x); });
    return out;
  }

  // 剥离名称尾部括号别名：邯郸钢铁集团有限责任公司（河钢邯钢）→ 邯郸钢铁集团有限责任公司
  function stripAlias(name) {
    return String(name || '').trim().replace(/[（(][^（）()]*[）)]\s*$/, '').trim();
  }

  // 名称归一化键（去括号别名 / 空白 / 间隔符，大写）用于跨模块去重
  function nameKeyOf(name) {
    return stripAlias(name).replace(/[\s·•.\-—_]/g, '').toUpperCase();
  }

  // 稳定 ID：nameKey 哈希（djb2）→ 重复同步时同一主体 ID 不变（幂等）
  function hashId(nameKey, usedIds) {
    var h = 5381;
    for (var i = 0; i < nameKey.length; i++) h = ((h << 5) + h + nameKey.charCodeAt(i)) >>> 0;
    var id = 'cust-' + h.toString(36);
    if (usedIds[id]) id += '-' + (Object.keys(usedIds).length + 1).toString(36);
    usedIds[id] = true;
    return id;
  }

  /* ==================== 存储包装格式兼容（只读 + 格式保持写回） ==================== */

  // 兼容四种历史格式：纯数组 / {__version,list} / {list} / 其他（视为异常）
  function readWrapper(key) {
    var raw = null;
    try { raw = localStorage.getItem(key); } catch (e) { return { wrapper: 'storage-error', list: [] }; }
    if (!raw) return { wrapper: 'plain', version: null, list: [] };
    var data;
    try { data = JSON.parse(raw); } catch (e) { return { wrapper: 'parse-error', list: [] }; }
    if (Array.isArray(data)) return { wrapper: 'plain', version: null, list: data };
    if (data && Array.isArray(data.list)) {
      if (data.__version) return { wrapper: 'versioned', version: data.__version, list: data.list };
      return { wrapper: 'list', version: null, list: data.list };
    }
    return { wrapper: 'unknown', list: [] };
  }

  // 按读取时的原包装格式写回（仅测试辅助功能使用；同步引擎对源键只读）
  function writeWrapper(key, w, list) {
    var payload;
    if (w.wrapper === 'versioned') payload = { __version: w.version, list: list };
    else if (w.wrapper === 'list') payload = { list: list };
    else if (w.wrapper === 'plain') payload = list;
    else throw new Error('源存储格式异常（' + w.wrapper + '），拒绝写回以保护源数据');
    localStorage.setItem(key, JSON.stringify(payload));
  }

  // 测试辅助写回专用：部分老模块（如铁路供应商）在 loadData 时做版本校验，
  // 存储缺少版本号会触发静默种子回写覆盖数据。此映射为其补已知版本号。
  var TEST_VERSIONS = { hz_railway_suppliers: 'v13' };

  // 测试辅助专用写回：带版本校验的源模块统一按 {__version, list} 写回，其余按原包装格式写回
  function writeTestWrapper(key, w, list) {
    if (TEST_VERSIONS[key]) {
      localStorage.setItem(key, JSON.stringify({ __version: TEST_VERSIONS[key], list: list }));
      return;
    }
    writeWrapper(key, w, list);
  }

  /* ==================== 多层过滤校验（L1-L5） ==================== */

  // 企业主体后缀特征（强）
  var RE_COMPANY_TAIL = /(有限公司|有限责任公司|股份有限公司|集团有限公司|公司|集团|厂|车队)$/;
  // 纯地点 / 物理设施后缀特征
  var RE_LOCATION_TAIL = /(站|港|港区|港口|码头|堆场|货场|园区|物流园|库区|矿区|锚地|泊位|枢纽|作业区|专用线|市|县|镇|乡|村|区|路|街|巷|桥|线|河|湖|山|岛|局)$/;
  // 政府机关 / 行政机构特征
  var RE_GOVERNMENT = /(管理局|管理委员会|人民政府|办公室|办事处|海事局|海关|港航管理|财政|税务)$|(分局|大队|支队)$|局$/;
  var RE_TEST_WORDS = /(测试|演示|示例|样例|演练|demo|test)/i;

  // 返回 {ok:true} 或 {ok:false, layer, reason}
  function validateEntity(rawName, moduleKey) {
    var name = String(rawName == null ? '' : rawName).replace(/\s+/g, ' ').trim();

    // L1 名称有效性
    if (!name || name.length < 3) return fail('L1', '名称为空或过短（不足3字符）');
    var base = stripAlias(name) || name;
    if (base.length < 3) return fail('L1', '主名称剥离括号别名后过短');

    // L2 政府机关 / 行政机构排除
    if (RE_GOVERNMENT.test(base)) return fail('L2', '政府机关/行政机构，非经营主体');

    // L3 纯地点 / 物理场站排除（无企业后缀特征而仅地点特征）
    if (!RE_COMPANY_TAIL.test(base) && RE_LOCATION_TAIL.test(base)) {
      return fail('L3', '纯地点/物理场站/点位名称，无运营主体');
    }

    // L4 测试/演示词排除
    if (RE_TEST_WORDS.test(name)) return fail('L4', '疑似测试/演示数据');

    // L5 企业主体正向校验（车队模块额外允许「车队」结尾，属运输公司范畴）
    var strong = /(有限公司|有限责任公司|股份有限公司|集团有限公司)$/.test(base) || /公司$|集团$|厂$/.test(base);
    var moduleExtra = moduleKey === 'fleet' && /车队$/.test(base);
    if (!strong && !moduleExtra) return fail('L5', '名称无明确企业主体特征（公司/集团/厂/车队），待人工复核');

    return { ok: true };
  }

  function fail(layer, reason) { return { ok: false, layer: layer, reason: reason }; }

  /* ==================== 检查点（断点续传） ==================== */

  function saveCheckpoint(state) {
    state.updated_at = Date.now();
    try {
      localStorage.setItem(CHECKPOINT_KEY, JSON.stringify(state));
    } catch (e) {
      // 检查点落盘失败不中断同步（进度可视化仍在），但记录警告
      state.log.push(log('warn', '检查点写入失败：' + e.message));
    }
  }

  function loadCheckpoint() {
    try {
      var raw = localStorage.getItem(CHECKPOINT_KEY);
      if (!raw) return null;
      var cp = JSON.parse(raw);
      if (!cp || !cp.batch_id || cp.phase === 'done' || cp.phase === 'failed') return null;
      return cp;
    } catch (e) { return null; }
  }

  function clearCheckpoint() {
    try { localStorage.removeItem(CHECKPOINT_KEY); } catch (e) { /* 忽略 */ }
  }

  /* ==================== 报告存取 ==================== */

  function saveReport(report) {
    var data = { list: [] };
    try {
      var raw = localStorage.getItem(REPORTS_KEY);
      if (raw) data = JSON.parse(raw) || { list: [] };
    } catch (e) { data = { list: [] }; }
    if (!Array.isArray(data.list)) data.list = [];
    data.list.unshift(report);
    if (data.list.length > 20) data.list = data.list.slice(0, 20);
    try { localStorage.setItem(REPORTS_KEY, JSON.stringify(data)); } catch (e) { /* 忽略 */ }
  }

  function readReports() {
    try {
      var raw = localStorage.getItem(REPORTS_KEY);
      var data = raw ? JSON.parse(raw) : null;
      return data && Array.isArray(data.list) ? data.list : [];
    } catch (e) { return []; }
  }

  /* ==================== 同步执行状态机 ==================== */

  var running = false;   // 引擎级执行互斥
  var currentState = null;

  function newState() {
    var state = {
      batch_id: 'sync-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6),
      started_at: Date.now(),
      updated_at: Date.now(),
      finished_at: null,
      resumed: false,
      phase: 'extract',            // extract → merge → backup → write → report → done
      cursor: { done: [] },        // 已完成提取的模块 key
      staged: { candidates: [], exceptions: [] },
      moduleStats: {},
      entities: null,              // 合并去重后的主体（merge 阶段产出）
      log: [],
      error: null
    };
    SOURCES.forEach(function (s) {
      state.moduleStats[s.key] = {
        key: s.key, label: s.label, store_key: s.storeKey,
        records: 0, candidates: 0, passed: 0, filtered: 0, errors: 0,
        status: 'pending'
      };
    });
    return state;
  }

  function phasePercent(state) {
    var done = state.cursor.done.length;
    switch (state.phase) {
      case 'extract': return Math.min(80, Math.round(done / SOURCES.length * 80));
      case 'merge': return 85;
      case 'backup': return 90;
      case 'write': return 96;
      case 'report': return 99;
      case 'done': return 100;
      default: return 0;
    }
  }

  function emitProgress(opts, state) {
    if (opts && typeof opts.onProgress === 'function') {
      try { opts.onProgress(snapshotOf(state)); } catch (e) { /* UI 回调异常不影响引擎 */ }
    }
  }

  function emitLog(opts, entry) {
    if (opts && typeof opts.onLog === 'function') {
      try { opts.onLog(entry); } catch (e) { /* 忽略 */ }
    }
  }

  function snapshotOf(state) {
    return {
      batch_id: state.batch_id,
      started_at: state.started_at,
      finished_at: state.finished_at,
      resumed: state.resumed,
      phase: state.phase,
      fail_from: state.fail_from,
      percent: phasePercent(state),
      cursor: state.cursor,
      moduleStats: state.moduleStats,
      totals: computeTotals(state),
      error: state.error,
      running: running
    };
  }

  function computeTotals(state) {
    var t = { source_records: 0, candidates: 0, passed: 0, filtered: 0, errors: 0, entities: (state.entities ? state.entities.length : null) };
    SOURCES.forEach(function (s) {
      var m = state.moduleStats[s.key];
      if (!m) return;
      t.source_records += m.records;
      t.candidates += m.candidates;
      t.passed += m.passed;
      t.filtered += m.filtered;
      t.errors += m.errors;
    });
    return t;
  }

  // ==================== 阶段 1：读取与提取（含 L1-L5 内联校验） ====================

  function extractNextModule(state, opts) {
    var pending = null;
    for (var i = 0; i < SOURCES.length; i++) {
      if (state.cursor.done.indexOf(SOURCES[i].key) < 0) { pending = SOURCES[i]; break; }
    }
    if (!pending) {
      state.phase = 'merge';
      saveCheckpoint(state);
      emitProgress(opts, state);
      setTimeout(function () { runPhase(state, opts); }, 250);
      return;
    }

    var stat = state.moduleStats[pending.key];
    stat.status = 'running';
    emitProgress(opts, state);

    setTimeout(function () {
      try {
        // 名录源（storeKey 为空）：数据来自引擎内置权威名录，不走 localStorage 只读
        var w = pending.storeKey ? readWrapper(pending.storeKey) : { wrapper: 'directory', list: TRADER_COMPANIES };
        if (w.wrapper === 'parse-error' || w.wrapper === 'unknown' || w.wrapper === 'storage-error') {
          throw new Error('源数据读取异常（格式：' + w.wrapper + '），已跳过该模块');
        }
        stat.records = w.list.length;
        state.log.push(log('info', '【' + pending.label + '】读取源记录 ' + w.list.length + ' 条（数据形态：' + (w.wrapper === 'directory' ? '自有名录' : w.wrapper) + '）'));

        w.list.forEach(function (rec, idx) {
          var cands = [];
          try {
            cands = pending.extract(rec) || [];
          } catch (e) {
            stat.errors++;
            state.staged.exceptions.push({
              module: pending.key, module_label: pending.label,
              source_id: (rec && rec.id) || '', source_name: (rec && rec.name) || '',
              name: '', layer: 'E', reason: '记录解析异常：' + e.message
            });
            return;
          }
          cands.forEach(function (c) {
            stat.candidates++;
            var v = validateEntity(c.name, pending.key);
            if (!v.ok) {
              stat.filtered++;
              state.staged.exceptions.push({
                module: pending.key, module_label: pending.label,
                source_id: (rec && rec.id) || '', source_name: (rec && rec.name) || '',
                name: String(c.name == null ? '' : c.name).trim(),
                layer: v.layer, reason: v.reason
              });
              state.log.push(log('warn', '【' + pending.label + '】过滤丢弃「' + c.name + '」（' + v.layer + '：' + v.reason + '）'));
              return;
            }
            stat.passed++;
            state.staged.candidates.push({
              module: pending.key,
              label: pending.label,
              roles: pending.roles.slice(),
              industries: pending.industries.slice(),
              authoritative: !!pending.authoritative,
              source_id: (rec && rec.id) || '',
              source_name: (rec && rec.name) || c.name,
              via: c.via || '记录主体',
              detail_url: pending.detailUrl((rec && rec.id) || ''),
              name: String(c.name).trim(),
              creditCode: c.creditCode || '',
              profile: c.profile || {},
              attrs: c.attrs || []
            });
          });
        });

        state.log.push(log('info', '【' + pending.label + '】提取候选 ' + stat.candidates + ' 条，通过校验 ' + stat.passed + ' 条，过滤 ' + stat.filtered + ' 条'));
      } catch (e) {
        stat.status = 'error';
        stat.errors++;
        state.log.push(log('error', '【' + pending.label + '】模块处理失败：' + e.message + '（跳过继续）'));
      }

      if (stat.status !== 'error') stat.status = 'done';
      state.cursor.done.push(pending.key);
      saveCheckpoint(state);
      emitProgress(opts, state);

      // 下一个模块（小步异步推进，保持进度可视化的节奏感）
      setTimeout(function () { extractNextModule(state, opts); }, 150);
    }, 150);
  }

  // ==================== 阶段 2：合并去重 ====================

  function doMerge(state, opts) {
    state.log.push(log('info', '开始跨模块合并去重（名称归一化）…'));
    var map = Object.create(null);
    var order = [];
    var usedIds = Object.create(null);

    state.staged.candidates.forEach(function (c) {
      var k = nameKeyOf(c.name);
      if (!k) return;
      if (!map[k]) {
        map[k] = {
          id: hashId(k, usedIds),
          name: c.name,
          nameKey: k,
          creditCode: '',
          roles: [],
          industries: [],
          sources: [],
          source_refs: [],
          profile: {},
          attrs: [],
          _seenProfile: {}
        };
        order.push(k);
      }
      var e = map[k];
      e.roles = unionArr(e.roles, c.roles);
      if (c.authoritative) {
        // 权威名录定位覆盖：行业标签以名录为准（修正老模块自动打标可能产生的定位误区）
        e.industries = c.industries.slice();
        e._authoritative = true;
      } else if (!e._authoritative) {
        e.industries = unionArr(e.industries, c.industries);
      }
      if (e.sources.indexOf(c.label) < 0) e.sources.push(c.label);
      var dup = e.source_refs.some(function (r) {
        return r.module === c.module && r.source_id === c.source_id && r.via === c.via;
      });
      if (!dup) {
        e.source_refs.push({
          module: c.module,
          module_label: c.label,
          source_id: c.source_id,
          source_name: c.source_name,
          via: c.via,
          detail_url: c.detail_url,
          synced_at: Date.now()
        });
      }
      if (!e.creditCode && c.creditCode) e.creditCode = c.creditCode;
      Object.keys(c.profile).forEach(function (pk) {
        var v = c.profile[pk];
        if (v != null && String(v).trim() !== '' && !e._seenProfile[pk]) {
          e.profile[pk] = v;
          e._seenProfile[pk] = true;
        }
      });
      if ((c.attrs || []).length && !e.attrs.length) e.attrs = c.attrs.slice();
    });

    state.entities = order.map(function (k) {
      var e = map[k];
      delete e._seenProfile;
      delete e._authoritative;
      e.status = '已同步';
      e.synced_at = Date.now();
      e.sync_batch = state.batch_id;
      return e;
    });

    var dupCount = state.staged.candidates.length - state.entities.length;
    state.log.push(log('info', '合并完成：候选 ' + state.staged.candidates.length + ' 条 → 主体 ' + state.entities.length + ' 条（跨模块/重复合并 ' + dupCount + ' 条）'));

    state.phase = 'backup';
    saveCheckpoint(state);
    emitProgress(opts, state);
    setTimeout(function () { runPhase(state, opts); }, 250);
  }

  // ==================== 阶段 3：快照备份 ====================

  function doBackup(state, opts) {
    try {
      var old = localStorage.getItem(UNIFIED_KEY);
      if (old) {
        localStorage.setItem(SNAPSHOT_PREFIX + state.batch_id, old);
        state.log.push(log('info', '已备份现有统一库快照：' + SNAPSHOT_PREFIX + state.batch_id));
      } else {
        state.log.push(log('info', '统一库为空，无需快照备份'));
      }
    } catch (e) {
      state.log.push(log('warn', '快照备份失败（继续同步）：' + e.message));
    }
    state.phase = 'write';
    saveCheckpoint(state);
    emitProgress(opts, state);
    setTimeout(function () { runPhase(state, opts); }, 250);
  }

  // ==================== 阶段 4：原子写入统一库（彻底替换假数据） ====================

  function doWrite(state, opts) {
    try {
      var payload = {
        __version: UNIFIED_VERSION,
        synced_at: Date.now(),
        sync_batch: state.batch_id,
        list: state.entities || []
      };
      var text = JSON.stringify(payload);
      var check = JSON.parse(text);   // 序列化回环校验

      localStorage.setItem(UNIFIED_KEY, text);

      // 读回一致性校验
      var back = readWrapper(UNIFIED_KEY);
      if (!back.list || back.list.length !== check.list.length) {
        throw new Error('写入后读回数量不一致（期望 ' + check.list.length + '，实际 ' + (back.list ? back.list.length : 0) + '）');
      }

      state.log.push(log('info', '统一库写入完成：' + check.list.length + ' 条主体（批次 ' + state.batch_id + '），读回校验通过'));
      state.phase = 'report';
    } catch (e) {
      // 回滚快照，标记失败
      try {
        var snap = localStorage.getItem(SNAPSHOT_PREFIX + state.batch_id);
        if (snap !== null) {
          localStorage.setItem(UNIFIED_KEY, snap);
          state.log.push(log('warn', '写入失败，已回滚至快照'));
        }
      } catch (e2) { /* 忽略 */ }
      state.error = '写入统一库失败：' + e.message;
      state.fail_from = 'write';
      state.phase = 'failed';
      state.log.push(log('error', state.error + '（可清除断点后重新同步）'));
      saveCheckpoint(state);
      emitProgress(opts, state);
      finishRun(opts, state);
      return;
    }
    saveCheckpoint(state);
    emitProgress(opts, state);
    setTimeout(function () { runPhase(state, opts); }, 250);
  }

  // ==================== 阶段 5：生成报告 ====================

  function buildReport(state) {
    var entities = state.entities || [];
    var bySource = {}, byIndustry = {}, byRole = {};
    var customersView = 0, resourcesView = 0, withCode = 0;

    entities.forEach(function (e) {
      (e.sources || []).forEach(function (s) { bySource[s] = (bySource[s] || 0) + 1; });
      (e.industries || []).forEach(function (s) { byIndustry[s] = (byIndustry[s] || 0) + 1; });
      (e.roles || []).forEach(function (s) { byRole[s] = (byRole[s] || 0) + 1; });
      var isCust = (e.roles || []).indexOf(VIEW_CUSTOMER_ROLE) >= 0;
      var isRes = (e.roles || []).some(function (r) { return VIEW_RESOURCE_ROLES.indexOf(r) >= 0; });
      if (isCust) customersView++;
      if (isRes) resourcesView++;
      if (e.creditCode) withCode++;
    });

    // 合并明细：同一主体命中多条候选 / 多个来源
    var mergedGroups = [];
    var candByKey = {};
    state.staged.candidates.forEach(function (c) {
      var k = nameKeyOf(c.name);
      if (!candByKey[k]) candByKey[k] = { nameKey: k, name: c.name, modules: [], count: 0 };
      if (candByKey[k].modules.indexOf(c.label) < 0) candByKey[k].modules.push(c.label);
      candByKey[k].count++;
    });
    Object.keys(candByKey).forEach(function (k) {
      if (candByKey[k].count > 1) mergedGroups.push(candByKey[k]);
    });

    return {
      batch_id: state.batch_id,
      started_at: state.started_at,
      finished_at: Date.now(),
      duration_ms: Date.now() - state.started_at,
      resumed: state.resumed,
      engine_version: UNIFIED_VERSION,
      totals: computeTotals(state),
      modules: SOURCES.map(function (s) {
        var m = state.moduleStats[s.key] || {};
        return {
          key: m.key, label: m.label, store_key: m.store_key,
          records: m.records, candidates: m.candidates,
          passed: m.passed, filtered: m.filtered, errors: m.errors,
          roles: s.roles, industries: s.industries
        };
      }),
      filtered_detail: state.staged.exceptions,
      merged_groups: mergedGroups,
      result: {
        total: entities.length,
        customers_view: customersView,
        resources_view: resourcesView,
        by_source: bySource,
        by_industry: byIndustry,
        by_role: byRole,
        with_credit_code: withCode,
        without_credit_code: entities.length - withCode
      },
      log: state.log.slice()
    };
  }

  function doReport(state, opts) {
    var report = buildReport(state);
    saveReport(report);   // 报告与完整执行日志自动持久化
    state.log.push(log('info', '统计报告与执行日志已生成并持久化（可在控制台查看/下载）'));
    state.finished_at = report.finished_at;
    state.phase = 'done';
    saveCheckpoint(state);   // 保留 done 检查点供 UI 展示批次信息（不再可续传）
    emitProgress(opts, state);
    finishRun(opts, state, report);
  }

  function finishRun(opts, state, report) {
    running = false;
    currentState = state;
    if (report && opts && typeof opts.onDone === 'function') {
      try { opts.onDone(report); } catch (e) { /* 忽略 */ }
    }
    if (!report && opts && typeof opts.onError === 'function') {
      try { opts.onError(new Error(state.error || '同步失败')); } catch (e) { /* 忽略 */ }
    }
  }

  function runPhase(state, opts) {
    switch (state.phase) {
      case 'extract': extractNextModule(state, opts); break;
      case 'merge': doMerge(state, opts); break;
      case 'backup': doBackup(state, opts); break;
      case 'write': doWrite(state, opts); break;
      case 'report': doReport(state, opts); break;
      default: finishRun(opts, state);   // done / failed
    }
  }

  /* ==================== 对外 API ==================== */

  function start(opts) {
    if (running) return { ok: false, error: '同步正在执行中，请勿重复触发' };

    var cp = loadCheckpoint();
    var state;
    if (cp) {
      state = cp;
      state.resumed = true;
      state.log.push(log('info', '检测到未完成批次（' + cp.phase + ' 阶段），自动从断点续传'));
    } else {
      state = newState();
      state.log.push(log('info', '===== 客户管理一次性数据同步启动，批次 ' + state.batch_id + ' ====='));
      state.log.push(log('info', '同步范围：' + SOURCES.map(function (s) { return s.label; }).join('、')));
      state.log.push(log('info', '过滤原则：仅同步"公司"类主体，过滤"地点"类数据（L1-L5 多层校验）'));
    }

    running = true;
    currentState = state;
    saveCheckpoint(state);
    emitProgress(opts, state);
    setTimeout(function () { runPhase(state, opts); }, 200);
    return { ok: true, resumed: !!cp, batch_id: state.batch_id };
  }

  window.HZCustomerSync = {
    UNIFIED_KEY: UNIFIED_KEY,
    CHECKPOINT_KEY: CHECKPOINT_KEY,
    REPORTS_KEY: REPORTS_KEY,
    SNAPSHOT_PREFIX: SNAPSHOT_PREFIX,
    ROLES_ALL: ROLES_ALL,
    INDUSTRIES_ALL: INDUSTRIES_ALL,
    VIEW_CUSTOMER_ROLE: VIEW_CUSTOMER_ROLE,
    VIEW_RESOURCE_ROLES: VIEW_RESOURCE_ROLES,

    // 六个源模块公开配置（UI 展示用）
    sources: SOURCES.map(function (s) {
      return { key: s.key, label: s.label, storeKey: s.storeKey, roles: s.roles, industries: s.industries };
    }),

    start: start,
    state: function () { return currentState ? snapshotOf(currentState) : null; },
    running: function () { return running; },
    hasResumable: function () { return !!loadCheckpoint(); },
    clearCheckpoint: clearCheckpoint,
    lastReport: function () { var r = readReports(); return r.length ? r[0] : null; },
    reports: readReports,

    // 统一库读取（customers.js 使用，与引擎同一套兼容解析）
    readUnified: function () {
      var w = readWrapper(UNIFIED_KEY);
      if (w.wrapper === 'versioned' || w.wrapper === 'list') {
        return { meta: { wrapper: w.wrapper, version: w.version }, list: w.list };
      }
      return { meta: { wrapper: w.wrapper, version: null }, list: [] };
    },

    /* ---------- 测试辅助（仅测试用，不属于同步核心；写入源模块运行时数据并带标记，可一键清除） ---------- */

    testInject: function () {
      var result = { railway: false, steel: false };

      // 铁路供应商模块 ← 中国矿产资源集团有限公司
      var rw = readWrapper('hz_railway_suppliers');
      if (rw.wrapper === 'versioned' || rw.wrapper === 'list' || rw.wrapper === 'plain') {
        var exists1 = rw.list.some(function (x) { return x && x.__syncTest === true; });
        if (!exists1) {
          rw.list.push({
            id: 'rs-test-cnmin',
            name: '中国矿产资源集团有限公司',
            shortName: '中国矿产资源集团',
            site: 'https://www.cnmineral.com',
            facts: [
              { label: '统一社会信用代码', value: '92100000MA045B1L9M', mono: true },
              { label: '成立时间', value: '2022年7月' },
              { label: '注册资本', value: '200亿元' },
              { label: '注册地址', value: '北京市海淀区羊坊店东路' },
              { label: '主营业务', value: '铁矿石等大宗矿产资源储运与集中采购供应' }
            ],
            intro: ['中国矿产资源集团有限公司（同步演练测试数据）：中央企业，承担铁矿石等大宗矿产资源集中采购、储运与调配职能，服务钢铁产业链供应链安全稳定。'],
            fees: { tables: [], items: [] },
            persons: [{ name: '演练联系人', role: '同步测试', tel: '0000-0000000' }],
            __syncTest: true
          });
          writeTestWrapper('hz_railway_suppliers', rw, rw.list);
          result.railway = true;
        }
      }

      // 钢厂模块 ← 中国宝武钢铁集团有限公司
      var sw = readWrapper('hzwl_steels_v2');
      if (sw.wrapper === 'plain') {
        var exists2 = sw.list.some(function (x) { return x && x.__syncTest === true; });
        if (!exists2) {
          sw.list.push({
            id: 'steel-test-baowu',
            name: '中国宝武钢铁集团有限公司',
            type: '长期合作',
            contact: '演练联系人',
            phone: '0000-0000000',
            address: '上海市浦东新区世博大道1919号',
            capacity: '粗钢产能约1亿吨/年',
            oreDemand: '进口铁矿（PB粉、麦克粉、巴西混合粉等）',
            nature: '中央企业',
            founded: '2016年',
            regTime: '2016-08',
            regCapital: '约527.9亿元',
            regAddress: '上海市浦东新区',
            products: '汽车板、硅钢、镀锡板、高等级建筑用钢等',
            intro: '中国宝武钢铁集团有限公司（同步演练测试数据）：全球规模领先的钢铁生产企业，践行绿色低碳冶金转型。',
            remark: '同步演练测试数据',
            createdAt: Date.now(),
            __syncTest: true
          });
          writeWrapper('hzwl_steels_v2', sw, sw.list);
          result.steel = true;
        }
      }
      return result;
    },

    testClear: function () {
      var result = { railway: 0, steel: 0 };
      var rw = readWrapper('hz_railway_suppliers');
      if (rw.wrapper === 'versioned' || rw.wrapper === 'list' || rw.wrapper === 'plain') {
        var kept1 = rw.list.filter(function (x) { return !(x && x.__syncTest === true); });
        result.railway = rw.list.length - kept1.length;
        if (result.railway > 0) writeTestWrapper('hz_railway_suppliers', rw, kept1);
      }
      var sw = readWrapper('hzwl_steels_v2');
      if (sw.wrapper === 'plain') {
        var kept2 = sw.list.filter(function (x) { return !(x && x.__syncTest === true); });
        result.steel = sw.list.length - kept2.length;
        if (result.steel > 0) writeWrapper('hzwl_steels_v2', sw, kept2);
      }
      return result;
    },

    hasTestRecords: function () {
      var rw = readWrapper('hz_railway_suppliers');
      var sw = readWrapper('hzwl_steels_v2');
      return rw.list.some(function (x) { return x && x.__syncTest === true; }) ||
        sw.list.some(function (x) { return x && x.__syncTest === true; });
    }
  };
})();
