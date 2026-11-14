// ===== 新建订单页交互逻辑（订单管理模块 · PRD F1-F6）=====
// 数据层：order-new-data.js（HZOrderNewData：登录主体/基础数据/校验/智能方案/组装）
//         flow-data.js（HZFlowData：订单落库/港口/运力/海运航次联动）
// 协作：common/hz-data.js（HZData 基础数据）、customers/data.js（BR-O11 客户库联动）、
//       business-data.js（订单台账同步，经 upsertOrder 自动触发）
(function () {
  'use strict';

  /* ==================== 导航高亮 ==================== */

  // 本页对应的导航路径（与 navbar.html 中 data-path 一致）
  const NAV_PATH = '订单管理';

  function setActiveNav() {
    const navbar = document.getElementById('navbar');
    if (!navbar) return;
    navbar.querySelectorAll('.active').forEach(el => el.classList.remove('active'));
    const item = navbar.querySelector(`[data-path="${NAV_PATH}"]`);
    if (item) item.classList.add('active');
    const group = item ? item.closest('.nav-group') : null;
    if (group) group.classList.add('open');
  }

  const navbar = document.getElementById('navbar');
  if (navbar && navbar.children.length) {
    setActiveNav();
  } else {
    document.addEventListener('navbar:loaded', setActiveNav, { once: true });
  }

  /* ==================== 依赖与元素 ==================== */

  const D = window.HZOrderNewData;
  const data = window.HZFlowData;
  const hz = window.HZData;
  const $ = id => document.getElementById(id);

  const els = {
    banner: $('subject-banner'),
    sumSubject: $('sum-subject'),
    sumCore: $('sum-core'),
    sumPlan: $('sum-plan'),
    subjectCompany: $('subject-company'),
    subjectContact: $('subject-contact'),
    subjectPhone: $('subject-phone'),
    mine: $('f-mine'), panelMine: $('panel-mine'),
    category: $('f-category'), panelCategory: $('panel-category'),
    cargoName: $('f-cargoName'), panelCargoName: $('panel-cargoName'),
    cargoQuality: $('f-cargoQuality'),
    tonnage: $('f-tonnage'), price: $('f-price'),
    port: $('f-port'), panelPort: $('panel-port'),
    arrivalAt: $('f-arrivalAt'), departAt: $('f-departAt'),
    arrivalAtValue: $('f-arrivalAt-value'), departAtValue: $('f-departAt-value'),
    wharfChips: $('wharf-chips'), wharfHint: $('wharf-hint'),
    vessel: $('f-vessel'),
    destStations: $('dest-stations'), destYards: $('dest-yards'), destSteels: $('dest-steels'),
    destPath: $('dest-path'), destClear: $('dest-clear'),
    planStatus: $('plan-status'), planGrid: $('plan-grid'), planFail: $('plan-fail'),
    planRetry: $('plan-retry'),
    vesselType: $('v-type'),
    btnSubmit: $('btn-submit'), btnReset: $('btn-reset'),
    successMask: $('success-mask'), successOrderId: $('success-order-id'),
    btnGoPort: $('btn-go-port'), btnGoDetail: $('btn-go-detail'),
    toast: $('toast'),
  };

  // 字段 → 输入元素映射（校验错误定位用；destination/subject 走区块滚动）
  const FIELD_INPUT = {
    mine: els.mine, category: els.category, cargoName: els.cargoName,
    cargoQuality: els.cargoQuality, tonnage: els.tonnage, price: els.price, port: els.port,
    arrivalAt: els.arrivalAt, departAt: els.departAt,
  };

  /* ==================== 页面状态 ==================== */

  const state = {
    subjectRes: null,          // 登录主体解析结果（F2/E1/TBD-01）
    hzMines: [],               // 矿山管理原始数据（品类映射用）
    mineOptions: [],           // 合并后的矿山选项 [{name, categories, grade}]
    mineProducts: [],          // 当前矿山的产品明细（货物名称下拉，矿山管理 products_ext 同源）
    mineProductsFor: '',       // 已加载产品明细的矿山名（避免重复加载）
    portOptions: [],           // 合并后的港口选项 [string]
    hzPorts: [],               // 港口管理原始数据（码头联动数据源，hz_ports_data 同源）
    wharfOptions: [],          // 码头选项 [string]
    wharfsSyncedFor: null,     // 已完成码头联动的港口名（null 防止与空串混淆导致跳过联动）
    pickerArrival: null,       // 到港时间选择器实例（HZDatePicker）
    pickerDepart: null,        // 发运时间选择器实例（HZDatePicker）
    customers: [],             // 客户库全量（BR-O11 状态联动）
    dest: { station: '', yard: '', steel: '', auto: false }, // 目的地级联状态
    wharfs: [],                // 已选码头（保持点选顺序）
    plansRes: null,            // 最近一次智能方案计算结果（运力预填用）
    submitting: false,         // E8 防重标志
    savedOrder: null,          // 提交成功后的订单（成功浮层跳转携带 id 用）
  };

  /* ==================== 通用提示与校验渲染 ==================== */

  let toastTimer = null;
  function toast(msg, type) {
    els.toast.textContent = msg;
    els.toast.classList.toggle('error', type === 'error');
    els.toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => els.toast.classList.remove('show'), 2200);
  }

  // 防 XSS：所有动态文本经 esc 后再进入 innerHTML
  function esc(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  // 单字段错误渲染：hint 文案（err 红 / warn 橙 / ok 绿）+ 输入框红边
  function showHint(field, msg, level) {
    const hint = document.querySelector(`[data-hint="${field}"]`);
    if (!hint) return;
    hint.textContent = msg || '';
    hint.classList.remove('err', 'warn', 'ok');
    if (msg && level) hint.classList.add(level);
    const input = FIELD_INPUT[field];
    if (input) input.setAttribute('data-error', msg ? 'true' : 'false');
  }

  function clearHint(field) { showHint(field, '', ''); }

  /* ==================== 初始化：登录主体（F2 / E1 / TBD-01） ==================== */

  function initSubject() {
    state.subjectRes = D.getLoginSubject();
    if (!state.subjectRes.ok) {
      // E1：登录主体缺失，阻断提交（自然信息不可手填，保证主体归属准确）
      els.banner.hidden = false;
      els.banner.className = 'subject-banner danger';
      els.banner.textContent = state.subjectRes.error || D.MSG.subjectBlocked;
      els.sumSubject.textContent = '未获取';
      els.btnSubmit.disabled = true;
      return;
    }
    const s = state.subjectRes.subject;
    els.subjectCompany.value = s.company;
    els.subjectContact.value = s.contact || '—';
    els.subjectPhone.value = s.phone;
    els.sumSubject.textContent = s.company;
    if (state.subjectRes.degraded) {
      // TBD-01 降级提示：登录体系未接入，以平台运营方模拟主体填充
      els.banner.hidden = false;
      els.banner.className = 'subject-banner info';
      els.banner.textContent = '登录体系未接入，当前以平台运营方主体自动填充自然信息（接入后自动替换，不可手动修改）';
    }
  }

  /* ==================== 初始化：基础数据（F3 / TBD-02 / E7） ==================== */

  function initMineOptions() {
    try { state.hzMines = hz.list('mines') || []; } catch (e) { state.hzMines = []; }
    state.mineOptions = D.listMineOptions(state.hzMines);
  }

  function initPortOptions() {
    let ports = [], dictPorts = [];
    try { ports = hz.list('ports') || []; } catch (e) { ports = []; }
    try { dictPorts = hz.dict('dischargePorts') || []; } catch (e) { dictPorts = []; }
    state.hzPorts = ports; // 码头联动数据源（港口管理 hz_ports_data）
    state.portOptions = D.listPortOptions(ports, dictPorts);
    // E7：港口基础数据为空时提示联系运营维护（种子兜底后仍为空仅发生于覆盖键被清空的场景）
    if (!state.portOptions.length) {
      showHint('port', D.MSG.noBaseData, 'warn');
    }
  }

  /* ==================== 码头多选与港口联动（来源：港口管理 hz_ports_data.wharfs） ==================== */

  // 码头提示条：空态引导（默认）/ ok（带出成功）/ warn（回退通用清单）
  function showWharfHint(msg, level) {
    els.wharfHint.hidden = !msg;
    els.wharfHint.textContent = msg || '';
    els.wharfHint.classList.remove('err', 'warn', 'ok');
    if (msg && level) els.wharfHint.classList.add(level);
  }

  function renderWharfChips() {
    els.wharfChips.innerHTML = '';
    state.wharfOptions.forEach(name => {
      const chip = document.createElement('button');
      chip.type = 'button';
      // 重渲染（如切港联动）后按已选状态回填 .on，避免选中态丢失
      chip.className = 'chip' + (state.wharfs.indexOf(name) >= 0 ? ' on' : '');
      chip.textContent = name;
      chip.setAttribute('aria-pressed', state.wharfs.indexOf(name) >= 0 ? 'true' : 'false');
      chip.addEventListener('click', () => {
        const idx = state.wharfs.indexOf(name);
        if (idx >= 0) { state.wharfs.splice(idx, 1); chip.classList.remove('on'); chip.setAttribute('aria-pressed', 'false'); }
        else { state.wharfs.push(name); chip.classList.add('on'); chip.setAttribute('aria-pressed', 'true'); }
        refreshCoreSummary();
      });
      els.wharfChips.appendChild(chip);
    });
  }

  // 港口变化 → 刷新码头清单：命中且已维护按港口带出；未维护/未命中回退通用清单并提示；
  // 港口切换后仅保留新清单内的已选码头，避免跨港脏数据。
  function syncWharfsToPort() {
    const portName = els.port.value.trim();
    if (state.wharfsSyncedFor === portName) return;
    state.wharfsSyncedFor = portName;
    if (!portName) {
      state.wharfOptions = [];
      state.wharfs = [];
      renderWharfChips();
      showWharfHint('请先选择到达港口，将按「港口管理」带出该港码头清单', '');
      return;
    }
    const hit = D.listWharfsForPort(state.hzPorts, portName);
    if (hit.matched && hit.list.length) {
      state.wharfOptions = hit.list;
      showWharfHint('已显示「' + portName + '」码头清单（来源：港口管理）', 'ok');
    } else if (hit.matched) {
      state.wharfOptions = D.listWharfOptions();
      showWharfHint('「' + portName + '」暂未维护码头清单，已显示通用清单（可在港口管理中补充）', 'warn');
    } else {
      // 港口管理未初始化/未命中时按内置种子兜底（与 listPortOptions 种子兜底同模式）
      const seed = D.wharfSeedOf(portName);
      if (seed.length) {
        state.wharfOptions = seed;
        showWharfHint('已显示「' + portName + '」码头清单（默认，可在港口管理中维护）', 'ok');
      } else {
        state.wharfOptions = D.listWharfOptions();
        showWharfHint('未在「港口管理」中找到「' + portName + '」，已显示通用码头清单', 'warn');
      }
    }
    state.wharfs = state.wharfs.filter(w => state.wharfOptions.indexOf(w) >= 0);
    renderWharfChips();
  }

  // 手动输入港口名（非点选）同样联动；轻防抖避免逐字渲染
  let wharfSyncTimer = null;
  function initWharfSection() {
    els.port.addEventListener('input', () => {
      clearTimeout(wharfSyncTimer);
      wharfSyncTimer = setTimeout(syncWharfsToPort, 150);
    });
    syncWharfsToPort();
  }

  function initVesselType() {
    els.vesselType.innerHTML = '<option value="">请选择船型类别</option>' +
      D.VESSEL_TYPES.map(t => `<option value="${esc(t)}">${esc(t)}</option>`).join('');
  }

  /* ==================== 搜索下拉（矿山 / 港口） ==================== */

  function setupSS(input, panel, opts) {
    function close() { panel.classList.remove('open'); }
    function render() {
      const q = input.value.trim();
      const all = opts.getOptions() || [];
      const items = all.filter(v => !q || v.indexOf(q) >= 0);
      panel.innerHTML = '';
      if (!items.length) {
        const empty = document.createElement('div');
        empty.className = 'ss-empty';
        const emptyText = typeof opts.emptyText === 'function' ? opts.emptyText() : opts.emptyText;
        empty.textContent = all.length ? '无匹配项' : (emptyText || D.MSG.noBaseData);
        panel.appendChild(empty);
      } else {
        items.forEach(v => {
          const opt = document.createElement('div');
          opt.className = 'ss-option';
          opt.textContent = v;
          opt.addEventListener('mousedown', e => {
            e.preventDefault(); // 先于 input blur 触发，保证点选生效
            input.value = v;
            close();
            opts.onPick(v);
          });
          panel.appendChild(opt);
        });
      }
      panel.classList.add('open');
    }
    input.addEventListener('focus', render);
    input.addEventListener('input', render);
    input.addEventListener('blur', () => setTimeout(close, 120));
  }

  function initMineSS() {
    setupSS(els.mine, els.panelMine, {
      getOptions: () => state.mineOptions.map(m => m.name),
      onPick: onMinePick,
      emptyText: D.MSG.noBaseData,
    });
  }

  function onMinePick(name) {
    clearHint('mine');
    // 品类选项随矿山刷新：清空旧值待重选（选项来自该矿山产品明细的 category 大类）
    els.category.value = '';
    clearHint('category');
    // 货物名称可选项刷新：加载该矿山产品明细（矿山管理 products_ext 同源，联动带出品质）
    ensureMineProducts();
    // 原货品/品质不属新矿山时清空，避免跨矿山脏数据（手动输入的不在产品清单内，同样重选）
    const cur = els.cargoName.value.trim();
    if (cur && !state.mineProducts.some(p => p.name === cur)) {
      els.cargoName.value = '';
      els.cargoQuality.value = '';
      clearHint('cargoName');
      clearHint('cargoQuality');
    }
    refreshCoreSummary();
    refreshPlans();
  }

  /* ==================== 品类下拉（矿山产品明细 category 同源） ==================== */

  // 品类选项 = 所选矿山产品明细的 category 大类去重（如铁矿石/铜精矿）；
  // 矿山无产品明细时下拉空态引导，品类支持手动输入兜底。
  function initCategorySS() {
    setupSS(els.category, els.panelCategory, {
      getOptions: () => {
        ensureMineProducts(); // 支持手动输入矿山名后直接打开品类下拉的场景
        return D.listMineCategories(els.mine.value.trim(), state.hzMines);
      },
      onPick: onCategoryPick,
      emptyText: () => {
        if (!els.mine.value.trim()) return '请先选择来源矿山';
        return '该矿山暂无品类数据，可手动输入';
      },
    });
  }

  // 选中品类 → 货物名称下拉按品类过滤；已选产品不属于新品类时清空（连带品质）
  function onCategoryPick(name) {
    clearHint('category');
    const cur = els.cargoName.value.trim();
    if (cur) {
      const p = D.findMineProduct(els.mine.value.trim(), cur, state.hzMines);
      if (p && p.category && p.category !== name) {
        els.cargoName.value = '';
        els.cargoQuality.value = '';
        clearHint('cargoName');
        clearHint('cargoQuality');
      }
    }
    refreshCoreSummary();
  }

  /* ==================== 货物名称：矿山产品下拉（矿山管理 products_ext 同源） ==================== */

  // 按当前矿山加载产品明细（带缓存守卫：矿山未变化不重复加载）
  function ensureMineProducts() {
    const mine = els.mine.value.trim();
    if (state.mineProductsFor === mine) return;
    state.mineProductsFor = mine;
    state.mineProducts = mine ? D.listMineProducts(mine, state.hzMines) : [];
  }

  function initCargoSS() {
    setupSS(els.cargoName, els.panelCargoName, {
      getOptions: () => {
        ensureMineProducts(); // 支持手动输入矿山名后直接打开货物下拉的场景
        // 已选品类时按品类过滤（明细缺 category 的项不参与过滤，避免数据不全时漏选）
        const cat = els.category.value.trim();
        const list = cat
          ? state.mineProducts.filter(p => !p.category || p.category === cat)
          : state.mineProducts;
        return list.map(p => p.name);
      },
      onPick: onProductPick,
      emptyText: () => {
        if (!els.mine.value.trim()) return '请先选择来源矿山';
        return state.mineProducts.length ? D.MSG.noBaseData : '该矿山暂无产品明细，可手动输入';
      },
    });
  }

  // 选中产品 → 货物品质自动带出（品位/粒度/水分，与矿山管理产品详情同源），仍可修改
  function onProductPick(name) {
    clearHint('cargoName');
    const p = D.findMineProduct(els.mine.value.trim(), name, state.hzMines);
    const q = p ? D.qualityOfProduct(p) : '';
    if (q) {
      els.cargoQuality.value = q;
      showHint('cargoQuality', '已自动带出，可修改', 'ok');
    } else {
      // 回退项（仅名称/无明细）：品质留空由用户手填
      showHint('cargoQuality', '该产品无品质明细，请手动填写', 'warn');
    }
    refreshCoreSummary();
  }

  function initPortSS() {
    setupSS(els.port, els.panelPort, {
      getOptions: () => state.portOptions,
      onPick: name => {
        clearHint('port');
        syncWharfsToPort(); // 码头联动：按所选港口带出码头清单
        refreshCoreSummary();
        refreshPlans();
      },
      emptyText: D.MSG.noBaseData,
    });
  }

  /* ==================== 目的地级联（G4 / A4 / A5 / BR-O11 / E5） ==================== */

  function renderDestStations() {
    const stations = D.listStations();
    els.destStations.innerHTML = '';
    if (!stations.length) {
      els.destStations.innerHTML = `<div class="dest-empty">${esc(D.MSG.noBaseData)}</div>`;
      return;
    }
    stations.forEach(st => {
      const opt = document.createElement('div');
      opt.className = 'dest-opt' + (state.dest.station === st ? ' on' : '');
      opt.textContent = st;
      opt.addEventListener('click', () => {
        state.dest = { station: st, yard: '', steel: '', auto: false };
        renderDest();
        refreshCoreSummary();
        refreshPlans();
      });
      els.destStations.appendChild(opt);
    });
  }

  function renderDestYards() {
    els.destYards.innerHTML = '';
    if (!state.dest.station) {
      els.destYards.innerHTML = '<div class="dest-empty">请先选择铁路站</div>';
      return;
    }
    const yards = D.listYards(state.dest.station);
    if (!yards.length) {
      els.destYards.innerHTML = `<div class="dest-empty">${esc(D.MSG.noBaseData)}</div>`;
      return;
    }
    yards.forEach(yd => {
      const opt = document.createElement('div');
      opt.className = 'dest-opt' + (state.dest.yard === yd ? ' on' : '');
      opt.textContent = yd;
      opt.addEventListener('click', () => {
        state.dest.yard = yd;
        state.dest.steel = '';
        // A5 反向关联：未显式选择铁路站时，由堆场带出所属站点并标注「自动带出」
        // （用户已显式选站的场景不标注，保持用户选择口径）
        const st = D.resolveStationOfYard(yd);
        if (st && !state.dest.station) {
          state.dest.station = st;
          state.dest.auto = true;
        } else if (st && st !== state.dest.station) {
          state.dest.station = st; // 堆场归属站点与显式所选不一致时，以堆场归属为准
        }
        renderDest();
        clearHint('destination');
        refreshCoreSummary();
        refreshPlans();
      });
      els.destYards.appendChild(opt);
    });
  }

  function renderDestSteels() {
    els.destSteels.innerHTML = '';
    if (!state.dest.yard) {
      els.destSteels.innerHTML = '<div class="dest-empty">请先选择堆场</div>';
      return;
    }
    // BR-O11：目录钢厂与客户库联动，非「正常」状态置灰不可选
    let all = [], allowed = [];
    const entry = D.getDestCatalog().find(s => s.station === state.dest.station);
    const yardEntry = entry ? entry.yards.find(y => y.yard === state.dest.yard) : null;
    all = yardEntry ? yardEntry.steels : [];
    allowed = D.listSteels(state.dest.yard, state.customers);
    if (!all.length) {
      els.destSteels.innerHTML = `<div class="dest-empty">${esc(D.MSG.noBaseData)}</div>`;
      return;
    }
    all.forEach(name => {
      const disabled = allowed.indexOf(name) < 0;
      const opt = document.createElement('div');
      opt.className = 'dest-opt' + (state.dest.steel === name ? ' on' : '') + (disabled ? ' disabled' : '');
      opt.textContent = name;
      if (disabled) {
        opt.title = '该客户在客户库中状态异常（停用/待审核/已驳回），不可选用';
      } else {
        opt.title = '选填：作为末端收货钢厂';
        opt.addEventListener('click', () => {
          state.dest.steel = state.dest.steel === name ? '' : name; // 支持取消选择
          renderDest();
          refreshCoreSummary();
          refreshPlans();
        });
      }
      els.destSteels.appendChild(opt);
    });
  }

  function renderDestPath() {
    const ev = D.evalDestination(state.dest);
    if (!ev.path) {
      els.destPath.innerHTML = '未选择';
      return;
    }
    // 路径回显：站点（自动带出标注）/ 堆场 / 钢厂
    const parts = [];
    if (ev.station) {
      parts.push(esc(ev.station) + (state.dest.auto ? '<span class="auto-tag">自动带出</span>' : ''));
    }
    if (ev.yard) parts.push(esc(ev.yard));
    if (ev.steel) parts.push(esc(ev.steel));
    els.destPath.innerHTML = parts.join(' / ');
  }

  function renderDest() {
    renderDestStations();
    renderDestYards();
    renderDestSteels();
    renderDestPath();
  }

  function initDest() {
    try { state.customers = (window.HZCustomerData && window.HZCustomerData.loadStore()) || []; }
    catch (e) { state.customers = []; }
    els.destClear.addEventListener('click', () => {
      state.dest = { station: '', yard: '', steel: '', auto: false };
      clearHint('destination');
      renderDest();
      refreshCoreSummary();
      refreshPlans();
    });
    renderDest();
  }

  // 目的地实时提示：仅选站点未至堆场时给出引导（E5 完整校验在提交时执行）
  function validateDestLive() {
    const ev = D.evalDestination(state.dest);
    if (ev.level === 1) {
      showHint('destination', '请继续选择堆场（目的地需选至堆场）', 'warn');
    } else {
      clearHint('destination');
    }
  }

  /* ==================== 智能方案（F4 / A7 / E6 / E7） ==================== */

  let planTimer = null;
  // A7 自动刷新：相关输入变化后自动重算（轻微防抖，无按钮）
  function scheduleRefreshPlans() {
    clearTimeout(planTimer);
    planTimer = setTimeout(refreshPlans, 150);
  }

  function refreshPlans() {
    let res;
    try {
      res = D.computeSmartPlans(collectCore());
      els.planFail.hidden = true;
      state.planError = false;
    } catch (e) {
      // E6：生成失败，展示重试入口
      state.planError = true;
      state.plansRes = null;
      els.planGrid.hidden = true;
      els.planGrid.innerHTML = '';
      els.planStatus.hidden = true;
      els.planFail.hidden = false;
      els.sumPlan.textContent = '生成失败';
      return;
    }
    state.plansRes = res;
    renderPlans(res);
  }

  function renderPlans(res) {
    els.planFail.hidden = true;
    els.planStatus.hidden = false;
    if (!res.triggered) {
      els.planGrid.hidden = true;
      els.planGrid.innerHTML = '';
      els.planStatus.className = 'plan-status';
      els.planStatus.textContent = '补全「' + res.missing.join('、') + '」后自动生成运输方案';
      els.sumPlan.textContent = '待触发';
      return;
    }
    els.planStatus.className = 'plan-status ok';
    els.planStatus.textContent = '已自动生成 3 套方案（' + res.line + '）· 随输入自动刷新 · ' + res.computed_at;
    els.planGrid.hidden = false;
    els.planGrid.innerHTML = res.plans.map(planCardHtml).join('');
    els.sumPlan.textContent = '已生成';
  }

  function planCardHtml(p) {
    return '<div class="plan-card">' +
      '<div class="plan-card-head"><span class="plan-label">' + esc(p.label) + '</span>' +
      (p.tag ? '<span class="plan-tag">' + esc(p.tag) + '</span>' : '') +
      '</div>' +
      '<div class="plan-qty">' + esc(p.qty) + '<span class="plan-unit">' + esc(p.unit) + '</span></div>' +
      (p.road ? '<div class="plan-road"><span class="plan-road-tag">公路短驳</span>' + esc(p.road.qty) + '<span class="plan-unit">' + esc(p.road.unit) + '</span></div>' : '') +
      '<div class="plan-path">' + esc(p.path) + '</div>' +
      '<div class="plan-basis">' + esc(p.basis) + '</div>' +
      '<div class="plan-detail">' + esc(p.detail) + '</div>' +
      '</div>';
  }

  /* ==================== 取值与摘要 ==================== */

  function collectCore() {
    return {
      mine: els.mine.value.trim(),
      cargoName: els.cargoName.value.trim(),
      cargoQuality: els.cargoQuality.value.trim(),
      tonnage: els.tonnage.value.trim(),
      price: els.price.value.trim(),
      port: els.port.value.trim(),
      destination: { station: state.dest.station, yard: state.dest.yard, steel: state.dest.steel },
    };
  }

  function refreshCoreSummary() {
    const core = collectCore();
    const ev = D.evalDestination(core.destination);
    const bits = [];
    if (core.mine) bits.push(core.mine);
    if (core.port) bits.push(core.port);
    if (core.tonnage) bits.push(D.fmtNum(core.tonnage) + ' 吨');
    if (ev.path) bits.push('→ ' + ev.path);
    els.sumCore.textContent = bits.length ? bits.join(' · ') : '未填写';
    validateDestLive();
  }

  /* ==================== 校验（blur 即时 + 提交全量） ==================== */

  function initBlurValidation() {
    els.tonnage.addEventListener('blur', () => {
      showHint('tonnage', D.validateTonnage(els.tonnage.value.trim()), 'err');
      refreshCoreSummary();
    });
    els.price.addEventListener('blur', () => {
      showHint('price', D.validatePrice(els.price.value.trim()), 'err');
    });
    els.tonnage.addEventListener('input', scheduleRefreshPlans);
    els.mine.addEventListener('input', scheduleRefreshPlans);
    els.port.addEventListener('input', scheduleRefreshPlans);
  }

  // 提交全量校验：按 BR-O03 字段顺序定位首个错误并滚动聚焦
  function renderFormErrors(res) {
    ['mine', 'category', 'cargoName', 'cargoQuality', 'tonnage', 'price', 'port',
      'arrivalAt', 'departAt', 'destination'].forEach(f => {
      const msg = res.errors[f] || '';
      if (msg) showHint(f, msg, 'err');
      else if (f !== 'mine' && f !== 'port') clearHint(f);
    });
  }

  function focusFirstError(field) {
    if (field === '_subject') {
      els.banner.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    if (field === 'destination') {
      $('dest-cascade').scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    const input = FIELD_INPUT[field];
    if (input) {
      input.scrollIntoView({ behavior: 'smooth', block: 'center' });
      try { input.focus(); } catch (e) { /* readonly 等不可聚焦场景忽略 */ }
    }
  }

  /* ==================== 提交（F6 / TBD-08 / TBD-10 / E8 / E9） ==================== */

  function collectPayload() {
    return {
      mine: els.mine.value.trim(),
      category: els.category.value.trim(),
      cargoName: els.cargoName.value.trim(),
      cargoQuality: els.cargoQuality.value.trim(),
      tonnage: els.tonnage.value.trim(),
      price: els.price.value.trim(),
      port: els.port.value.trim(),
      // 时间机器值由 HZDatePicker 写入隐藏域（口径与原生 datetime-local 一致）
      arrivalAt: els.arrivalAtValue.value,
      departAt: els.departAtValue.value,
      wharfs: state.wharfs.slice(),
      vessel: els.vessel.value.trim(),
      destination: { station: state.dest.station, yard: state.dest.yard, steel: state.dest.steel },
      vesselInfo: {
        company: $('v-company').value,
        scale: $('v-scale').value,
        type: els.vesselType.value,
        route: $('v-route').value,
        runTime: $('v-runTime').value,
        seaPrice: $('v-seaPrice').value,
        cycleTime: $('v-cycleTime').value,
        shipper: $('v-shipper').value,
        consignee: $('v-consignee').value,
      },
      plans: state.plansRes || { triggered: false, missing: [], plans: [] },
    };
  }

  function submitOrder() {
    if (state.submitting) return; // E8 防重：提交期间忽略重复点击
    const payload = collectPayload();
    const res = D.validateForm(payload, state.subjectRes);
    renderFormErrors(res);
    if (!res.ok) {
      focusFirstError(res.firstField);
      toast('请先完善表单必填项', 'error');
      return;
    }
    state.submitting = true;
    try {
      // 组装 flow 订单：提交即进入「待港口」状态（F6①，TBD-10 新页替代第 1 步）
      const order = D.buildOrder(payload, state.subjectRes);
      order.id = data.genOrderId();
      order.status = 'port';
      const nowIso = new Date().toISOString();
      order.createdAt = nowIso;
      order.updatedAt = nowIso;
      // 落库并联动：订单台账（达同步点时）+ 海运航次（船名与吨数齐备时，vessel_info 9 项随单同步）
      data.saveOrder(order);
      // 港口信息预填（F6③/TBD-10：港口名/码头首项带入，拥堵度默认正常）
      data.upsertPort(D.buildPortPrefill(order));
      // 运力方案预填（F6③/TBD-10：按智能方案生成 3 行通道，数值留 0 人工确认）
      data.upsertCapacities(order.id, D.buildCapacityPrefills(order, state.plansRes, data.genCapacityId));
      state.savedOrder = order; // 成功浮层跳转（进入港口信息 / 订单详情）携带订单 id
      // 提交成功浮层（TBD-08：进入下一步为主操作）
      els.successOrderId.textContent = order.id;
      els.successMask.hidden = false;
    } catch (e) {
      // E9：保存失败保留表单，提示重试
      toast('保存失败，请重试', 'error');
    } finally {
      state.submitting = false;
    }
  }

  /* ==================== 重置 ==================== */

  function resetForm() {
    els.mine.value = '';
    els.category.value = '';
    els.cargoName.value = '';
    els.cargoQuality.value = '';
    state.mineProducts = [];
    state.mineProductsFor = '';
    els.tonnage.value = '';
    els.price.value = '';
    els.port.value = '';
    // 时间选择器置空（展示回占位文案，隐藏域同步清空）
    if (state.pickerArrival) state.pickerArrival.clear();
    if (state.pickerDepart) state.pickerDepart.clear();
    els.vessel.value = '';
    state.wharfs = [];
    state.wharfsSyncedFor = null; // 强制重联动，回到「请先选择港口」空态
    syncWharfsToPort();
    ['mine', 'category', 'cargoName', 'cargoQuality', 'tonnage', 'price', 'port',
      'arrivalAt', 'departAt', 'destination']
      .forEach(clearHint);
    state.dest = { station: '', yard: '', steel: '', auto: false };
    ['v-company', 'v-scale', 'v-route', 'v-runTime', 'v-seaPrice', 'v-cycleTime', 'v-shipper', 'v-consignee']
      .forEach(id => { $(id).value = ''; });
    els.vesselType.value = '';
    renderDest();
    refreshCoreSummary();
    refreshPlans();
    toast('已重置');
  }

  /* ==================== 日期时间选择（Apple 风格日历弹层） ==================== */

  // 到港/发运时间：HZDatePicker 承担展示与机器值写入（隐藏域），页面仅接线
  function initDatePickers() {
    if (!window.HZDatePicker) return; // 组件缺失时静默降级，隐藏域仍可承载值
    state.pickerArrival = window.HZDatePicker.attach(els.arrivalAt, { hiddenInput: els.arrivalAtValue });
    state.pickerDepart = window.HZDatePicker.attach(els.departAt, { hiddenInput: els.departAtValue });
  }

  /* ==================== 事件绑定与启动 ==================== */

  function bindEvents() {
    document.querySelectorAll('[data-collapse]').forEach(head => {
      head.addEventListener('click', () => {
        head.closest('.flow-collapse').classList.toggle('open');
      });
    });
    els.planRetry.addEventListener('click', refreshPlans); // E6 重试
    els.btnSubmit.addEventListener('click', submitOrder);
    els.btnReset.addEventListener('click', resetForm);
    els.btnGoPort.addEventListener('click', () => {
      location.href = '/business/flow/order-port.html?id=' + encodeURIComponent(state.savedOrder ? state.savedOrder.id : '');
    });
    els.btnGoDetail.addEventListener('click', () => {
      location.href = '/business/flow/order-detail.html?id=' + encodeURIComponent(state.savedOrder ? state.savedOrder.id : '');
    });
    els.destStations.addEventListener('click', e => {
      if (e.target.classList.contains('dest-opt')) validateDestLive();
    });
  }

  function init() {
    initSubject();       // F2：自然信息自动填充（含 E1 阻断 / TBD-01 降级提示）
    initMineOptions();
    initPortOptions();
    initWharfSection();  // 码头联动：按所选港口从港口管理带出码头清单
    initVesselType();
    initMineSS();
    initCategorySS();    // 品类下拉：矿山产品明细 category 同源（选矿山→选品类→过滤产品）
    initCargoSS();       // 货物名称下拉：矿山产品明细联动（按品类过滤，选中带出品位/粒度/水分）
    initPortSS();
    initDatePickers();   // 到港/发运时间：Apple 风格日历弹层
    initDest();          // G4：目的地三级级联（含 BR-O11 客户库联动）
    initBlurValidation();
    bindEvents();
    refreshCoreSummary();
    refreshPlans();      // F4：初始未触发，展示缺失项提示
  }

  init();
})();
