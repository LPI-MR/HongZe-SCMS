/* ============================================================
   订单管理模块 · 新建订单数据层单元测试
   ------------------------------------------------------------
   运行：node --test tests/order-new-data.test.js
   覆盖：《PRD-订单管理模块》F1/F2 登录主体（E1/TBD-01）、
         F3 基础数据与字段校验（E2/E3/E4/E5/E7、BR-O03、TBD-02/03/05/07）、
         矿山产品明细引用（货物名称下拉 / 品位·粒度·水分品质自动带出）、
         F4 智能方案（BR-O07、CL-1~CL-4、A7）、
         F5 船舶静态 9 项、F6 组装与衔接（TBD-08/10）、BR-O11
   ============================================================ */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const D = require('../business/flow/order-new-data.js');

/* ---------- 通用测试数据 ---------- */

const SUBJECT_OK = {
  ok: true,
  source: 'login',
  subject: { company: '泓泽宜通供应链管理有限公司', contact: '平台运营部', phone: '0310-8888888' },
};

const DEST_YARD = { station: '武安站', yard: '河北陆港保税物流中心（保税堆场）', steel: '' };
const DEST_STEEL = { station: '武安站', yard: '河北陆港保税物流中心（保税堆场）', steel: '天铁集团' };

// 一次性 mock storage（内存实现，隔离 localStorage）
function mockStorage(seed) {
  const map = Object.assign({}, seed);
  return {
    getItem: k => (Object.prototype.hasOwnProperty.call(map, k) ? map[k] : null),
    setItem: (k, v) => { map[k] = String(v); },
    removeItem: k => { delete map[k]; },
    _map: map,
  };
}

// 合法最小表单 payload（供 validateForm/buildOrder 复用）
function okPayload(over) {
  return Object.assign({
    mine: '力拓',
    category: '铁矿石',
    cargoName: 'PB粉',
    cargoQuality: '品位 62%',
    tonnage: '70000',
    price: '800.00',
    port: '黄骅港',
    arrivalAt: '2026-11-13T08:00',
    departAt: '2026-11-14T09:30',
    wharfs: ['矿石码头', '综合码头'],
    vessel: '远盛海 008',
    destination: DEST_STEEL,
    vesselInfo: {
      company: '中远海运', scale: '5万吨级', type: '散堆船', route: '青岛—黄骅',
      runTime: '3天', seaPrice: '45元/吨', cycleTime: '7天', shipper: '发货方', consignee: '收货方',
    },
    plans: { triggered: true, missing: [], plans: [{ type: 'road_direct', label: '汽运直达', qty: 28, unit: '天' }], computed_at: '2026-11-13 10:00:00' },
  }, over || {});
}

/* ==================== 1. 登录主体（F2 / E1 / TBD-01） ==================== */

test('登录主体：无登录上下文时降级为平台运营方模拟主体（TBD-01）', () => {
  const res = D.getLoginSubject(mockStorage()); // 键不存在 → 降级
  assert.equal(res.ok, true);
  assert.equal(res.degraded, true);
  assert.equal(res.source, 'fallback');
  assert.equal(res.subject.company, D.FALLBACK_SUBJECT.company);
  assert.equal(res.subject.phone, D.FALLBACK_SUBJECT.phone);
});

test('登录主体：Node 无 storage 环境同样降级不抛错', () => {
  const res = D.getLoginSubject();
  assert.equal(res.ok, true);
  assert.equal(res.degraded, true);
});

test('登录主体：登录上下文完整时按登录主体填充（F2）', () => {
  const st = mockStorage({ hz_login_subject: JSON.stringify({ company: '中矿国链', contact_person: '王经理', phone: '13800138000' }) });
  const res = D.getLoginSubject(st);
  assert.equal(res.ok, true);
  assert.equal(res.degraded, undefined);
  assert.equal(res.source, 'login');
  assert.equal(res.subject.company, '中矿国链');
  assert.equal(res.subject.contact, '王经理');
  assert.equal(res.subject.phone, '13800138000');
});

test('登录主体：contact_info 兼容字段可作为联系方式来源', () => {
  const st = mockStorage({ hz_login_subject: JSON.stringify({ company: '中矿国链', contact_info: '010-65529988' }) });
  const res = D.getLoginSubject(st);
  assert.equal(res.ok, true);
  assert.equal(res.subject.phone, '010-65529988');
});

test('登录主体：上下文存在但不完整 → E1 阻断（不允许手填）', () => {
  const st = mockStorage({ hz_login_subject: JSON.stringify({ company: '中矿国链' }) });
  const res = D.getLoginSubject(st);
  assert.equal(res.ok, false);
  assert.equal(res.code, 'E1');
  assert.equal(res.error, D.MSG.subjectBlocked);
});

test('validateSubject：主体缺失返回错误文案，完整返回空串', () => {
  assert.equal(D.validateSubject(SUBJECT_OK), '');
  assert.equal(D.validateSubject({ ok: false, subject: {} }), D.MSG.subjectBlocked);
  assert.equal(D.validateSubject(null), D.MSG.subjectBlocked);
});

/* ==================== 2. 基础数据（F3 / TBD-02 / E7） ==================== */

test('三级目录种子：3 个站点，武安站下 2 个堆场', () => {
  assert.deepEqual(D.listStations(), ['武安站', '康城站', '曹庄镇站']);
  assert.deepEqual(D.listYards('武安站'), ['河北陆港保税物流中心（保税堆场）', '河北南洋移山物流有限公司']);
  assert.deepEqual(D.listYards('康城站'), ['武安保税物流园']);
});

test('三级目录：未知站点返回空数组（E7 页面提示口径）', () => {
  assert.deepEqual(D.listYards('不存在的站'), []);
});

test('反向关联（A5）：堆场 → 所属站点', () => {
  assert.equal(D.resolveStationOfYard('武安保税物流园'), '康城站');
  assert.equal(D.resolveStationOfYard('曹庄镇站物流园'), '曹庄镇站');
  assert.equal(D.resolveStationOfYard('未知堆场'), '');
});

test('三级目录：运营方覆盖键优先，非法覆盖回退种子（TBD-02）', () => {
  const over = [{ station: 'X站', yards: [{ yard: 'Y堆场', steels: ['Z钢厂'] }] }];
  const ok = mockStorage({ hz_dest_catalog: JSON.stringify(over) });
  assert.deepEqual(D.listStations(ok), ['X站']);
  // 缺 yard 的非法覆盖 → 回退种子
  const bad = mockStorage({ hz_dest_catalog: JSON.stringify([{ station: 'X站', yards: [{ steels: [] }] }]) });
  assert.deepEqual(D.listStations(bad), ['武安站', '康城站', '曹庄镇站']);
});

test('码头清单：种子含 5 项，覆盖键优先（TBD-02）', () => {
  assert.equal(D.listWharfOptions().length, 5);
  assert.ok(D.listWharfOptions().includes('综合码头'));
  const st = mockStorage({ hz_wharf_catalog: JSON.stringify(['东码头', '西码头']) });
  assert.deepEqual(D.listWharfOptions(st), ['东码头', '西码头']);
});

test('矿山选项：hz_mines 优先合并、种子补位（TBD-02/A1）', () => {
  const opts = D.listMineOptions([]);
  assert.equal(opts.length, D.MINE_SEED.length);
  assert.ok(opts.some(m => m.name === '力拓' && m.categories.includes('PB粉')));
  // 矿山管理数据：short_name 优先，main_products 拆分
  const hzMines = [{ short_name: '力拓', mine_name: '力拓矿业', main_products: 'PB粉,杨迪粉，罗布河粉', ore_grade: '62%' }];
  const merged = D.listMineOptions(hzMines);
  const rt = merged.find(m => m.name === '力拓');
  assert.ok(rt);
  assert.deepEqual(rt.categories, ['PB粉', '杨迪粉', '罗布河粉']); // 中英文逗号均拆分
  assert.equal(rt.grade, '62%');
  // 与种子同名不重复
  assert.equal(merged.filter(m => m.name === '力拓').length, 1);
});

test('矿山品类选项（品类下拉）：products_ext category 去重保序；无明细矿山返回空数组', () => {
  const hzMines = [{
    short_name: '力拓',
    products_ext: [
      { name: 'PB粉', category: '铁矿石' },
      { name: 'PB块', category: '铁矿石' },
      { name: '罗布河粉', category: '铁矿石' },
      { name: '铜精矿', category: '铜矿石' }, // 跨品类去重：铁矿石在前铜矿石在后
      { name: '无品类产品', category: '' },   // 缺 category 的项不贡献选项
    ],
  }];
  assert.deepEqual(D.listMineCategories('力拓', hzMines), ['铁矿石', '铜矿石']);
  // 矿山无 products_ext → main_products 回退为仅名称项（category 空）→ 空数组（页面空态引导）
  assert.deepEqual(D.listMineCategories('力拓', [{ short_name: '力拓', main_products: 'PB粉' }]), []);
  // 空矿山名 / 不在矿山库中的矿山 → 空数组
  assert.deepEqual(D.listMineCategories('', hzMines), []);
  assert.deepEqual(D.listMineCategories('不在目录的矿山', hzMines), []);
});

test('矿山产品明细（货物名称下拉）：products_ext 同源映射完整字段', () => {
  const hzMines = [{
    short_name: '力拓',
    main_products: 'PB粉,杨迪粉',
    products_ext: [
      { name: 'PB粉', category: '铁矿石', spec: 'TFe 61.5%', grade: 'TFe 61.5%', impurity: 'Al₂O₃ 2.2%', size: '-9.5mm 为主', moisture: '≈ 8.5%', application: '烧结' },
      { name: 'PB块', category: '铁矿石', grade: 'TFe 62.5%', size: '6.3-31.5mm' },
      { name: '', grade: 'TFe 99%' }, // 无名称脏数据应被过滤
    ],
  }];
  const products = D.listMineProducts('力拓', hzMines);
  assert.equal(products.length, 2, '仅保留有名称的产品项');
  assert.equal(products[0].name, 'PB粉');
  assert.equal(products[0].grade, 'TFe 61.5%');
  assert.equal(products[0].size, '-9.5mm 为主');
  assert.equal(products[0].moisture, '≈ 8.5%');
  assert.equal(products[0].category, '铁矿石');
  // findMineProduct：矿山+产品名定位；未知产品返回 null
  assert.equal(D.findMineProduct('力拓', 'PB粉', hzMines).grade, 'TFe 61.5%');
  assert.equal(D.findMineProduct('力拓', '不存在的产品', hzMines), null);
  assert.equal(D.findMineProduct('力拓', '', hzMines), null);
  // 空矿山名返回空清单
  assert.deepEqual(D.listMineProducts('', hzMines), []);
});

test('矿山产品明细回退：无明细/未知矿山回退品类串（仅名称项，品质手填）', () => {
  // 矿山库中有记录但无 products_ext → main_products 回退
  const noExt = D.listMineProducts('力拓', [{ short_name: '力拓', main_products: 'PB粉,杨迪粉' }]);
  assert.deepEqual(noExt.map(p => p.name), ['PB粉', '杨迪粉']);
  assert.equal(noExt[0].grade, '', '回退项无品质明细，留空手填');
  // 不在矿山库中 → 内置种子品类回退
  const seedOnly = D.listMineProducts('FMG', []);
  assert.deepEqual(seedOnly.map(p => p.name), ['超特粉', '混合粉']);
  // 完全未知矿山 → 空清单
  assert.deepEqual(D.listMineProducts('不在目录的矿山', []), []);
});

test('货物品质自动带出：品位+粒度+水分组装，水分「—」不并入', () => {
  const q = D.qualityOfProduct({ grade: 'TFe 61.5%', size: '-9.5mm 为主', moisture: '≈ 8.5%' });
  assert.equal(q, '品位 TFe 61.5%、粒度 -9.5mm 为主、水分 ≈ 8.5%');
  // grade 缺失回退 spec；水分「—」视为无效不并入
  const q2 = D.qualityOfProduct({ spec: 'TFe 62.5%', size: '6.3-31.5mm', moisture: '—' });
  assert.equal(q2, '品位 TFe 62.5%、粒度 6.3-31.5mm');
  // 全空/null 安全
  assert.equal(D.qualityOfProduct({}), '');
  assert.equal(D.qualityOfProduct(null), '');
});

test('港口选项：港口管理 + 字典 + 种子合并去重（E7）', () => {
  const opts = D.listPortOptions([{ name: '京唐港' }, { name: '黄骅港' }], [{ name: '曹妃甸港' }, { port_name: '无效项' }]);
  assert.deepEqual(opts, ['京唐港', '黄骅港', '曹妃甸港']);
  // 空数据源时种子兜底，不为空（E7 不会误触发）
  assert.deepEqual(D.listPortOptions([], []), ['黄骅港']);
});

/* ==================== 3. 目的地求值（G4 / A4 / A5 / E5） ==================== */

test('目的地求值：层级与 complete（仅站点不满足 BR-O07 口径）', () => {
  const l0 = D.evalDestination({});
  assert.equal(l0.level, 0);
  assert.equal(l0.complete, false);
  const l1 = D.evalDestination({ station: '武安站' });
  assert.equal(l1.level, 1);
  assert.equal(l1.complete, false);
  const l2 = D.evalDestination(DEST_YARD);
  assert.equal(l2.level, 2);
  assert.equal(l2.complete, true);
  const l3 = D.evalDestination(DEST_STEEL);
  assert.equal(l3.level, 3);
  assert.equal(l3.complete, true);
});

test('目的地求值：A5 反向关联自动带出站点并标注', () => {
  const ev = D.evalDestination({ yard: '武安保税物流园' }); // 未选站点
  assert.equal(ev.station, '康城站');
  assert.equal(ev.auto_station, true);
  assert.ok(ev.path.indexOf('（自动带出）') > 0);
  // 手动选站后不标注自动
  const ev2 = D.evalDestination({ station: '武安站', yard: '河北陆港保税物流中心（保税堆场）' });
  assert.equal(ev2.auto_station, false);
  assert.equal(ev2.path, '武安站 / 河北陆港保税物流中心（保税堆场）');
});

test('validateDestination：未选至堆场返回 E5 文案', () => {
  assert.equal(D.validateDestination({}), D.MSG.destIncomplete);
  assert.equal(D.validateDestination({ station: '武安站' }), D.MSG.destIncomplete);
  assert.equal(D.validateDestination(DEST_YARD), '');
});

/* ==================== 4. BR-O11 客户库联动 ==================== */

test('BR-O11：客户库中非「正常」状态的钢厂被排除', () => {
  const customers = [
    { name: '天铁集团', status: '正常' },
    { name: '普阳钢铁', status: '停用' },
    { name: '冀南钢铁', status: '待审核' },
  ];
  const steels = D.listSteels('河北陆港保税物流中心（保税堆场）', customers);
  assert.deepEqual(steels, ['天铁集团']);
});

test('BR-O11：不在客户库的目录钢厂正常可选', () => {
  const steels = D.listSteels('河北陆港保税物流中心（保税堆场）', []);
  assert.deepEqual(steels, ['天铁集团', '普阳钢铁', '冀南钢铁']);
});

test('BR-O11：未知堆场返回空数组', () => {
  assert.deepEqual(D.listSteels('不存在堆场', []), []);
});

/* ==================== 5. 字段校验（E3 / E4 / BR-O03） ==================== */

test('吨数校验（E3）：必填、>0、整数或 1 位小数', () => {
  assert.equal(D.validateTonnage(''), D.MSG.tonnageInvalid);
  assert.equal(D.validateTonnage('0'), D.MSG.tonnageInvalid);
  assert.equal(D.validateTonnage('-5'), D.MSG.tonnageInvalid);
  assert.equal(D.validateTonnage('abc'), D.MSG.tonnageInvalid);
  assert.equal(D.validateTonnage('70000'), '');
  assert.equal(D.validateTonnage('70000.5'), '');
  assert.equal(D.validateTonnage('70000.55'), D.MSG.tonnageFormat);
  assert.equal(D.validateTonnage(' 70000 '), ''); // 首尾空格容忍
});

test('价格校验（E4）：必填、≥0、最多 2 位小数（TBD-07）', () => {
  assert.equal(D.validatePrice(''), D.MSG.priceInvalid);
  assert.equal(D.validatePrice('-1'), D.MSG.priceInvalid);
  assert.equal(D.validatePrice('abc'), D.MSG.priceInvalid);
  assert.equal(D.validatePrice('0'), '');
  assert.equal(D.validatePrice('800'), '');
  assert.equal(D.validatePrice('800.55'), '');
  assert.equal(D.validatePrice('800.001'), D.MSG.priceInvalid);
});

test('表单全量校验：空表单按 BR-O03 字段顺序首个错误为矿山', () => {
  const res = D.validateForm({}, SUBJECT_OK);
  assert.equal(res.ok, false);
  assert.equal(res.firstField, 'mine');
  assert.ok(res.errors.mine);
  assert.ok(res.errors.category, '品类必填（矿山之后、货物名称之前）');
  assert.ok(res.errors.arrivalAt, '到港日期必选（年月日必选、时间可选）');
  assert.ok(res.errors.departAt, '发运日期必选（年月日必选、时间可选）');
  assert.ok(res.errors.destination);
});

test('表单全量校验：主体缺失时首个错误为 _subject（E1 优先）', () => {
  const res = D.validateForm(okPayload(), { ok: false, subject: {} });
  assert.equal(res.ok, false);
  assert.equal(res.firstField, '_subject');
  assert.equal(res.errors._subject, D.MSG.subjectBlocked);
});

test('表单全量校验：目的地仅选站点 → 首个错误为 destination（E5）', () => {
  const p = okPayload({ destination: { station: '武安站', yard: '', steel: '' } });
  const res = D.validateForm(p, SUBJECT_OK);
  assert.equal(res.ok, false);
  assert.equal(res.firstField, 'destination');
  assert.equal(res.errors.destination, D.MSG.destIncomplete);
});

test('表单全量校验：合法表单通过', () => {
  const res = D.validateForm(okPayload(), SUBJECT_OK);
  assert.equal(res.ok, true);
  assert.equal(res.firstField, '');
  assert.deepEqual(res.errors, {});
});

test('表单全量校验：仅选日期（时分可选留空）通过；日期缺失提示到港/发运', () => {
  // 年月日必选、几点几分为可选：仅日期口径合法
  const dateOnly = D.validateForm(okPayload({ arrivalAt: '2026-11-13', departAt: '2026-11-14' }), SUBJECT_OK);
  assert.equal(dateOnly.ok, true);
  // 日期未选 → 校验失败并给出对应文案
  const missing = D.validateForm(okPayload({ arrivalAt: '', departAt: '' }), SUBJECT_OK);
  assert.equal(missing.ok, false);
  assert.equal(missing.firstField, 'arrivalAt');
  assert.equal(missing.errors.arrivalAt, '请选择到港日期');
  assert.equal(missing.errors.departAt, '请选择发运日期');
});

/* ==================== 6. 智能方案（F4 / BR-O07 / CL-1~CL-4 / A7） ==================== */

test('智能方案：未触发时返回缺失项提示（港口/目的地/吨数）', () => {
  const res = D.computeSmartPlans({});
  assert.equal(res.triggered, false);
  assert.ok(res.missing.includes('港口'));
  assert.ok(res.missing.includes('目的地（需选至堆场）'));
  assert.ok(res.missing.includes('吨数'));
  assert.deepEqual(res.plans, []);
});

test('智能方案：仅选站点不触发（BR-O07 需至堆场）', () => {
  const res = D.computeSmartPlans({ tonnage: '70000', port: '黄骅港', destination: { station: '武安站' } });
  assert.equal(res.triggered, false);
  assert.deepEqual(res.missing, ['目的地（需选至堆场）']);
});

test('智能方案：吨数非法不触发', () => {
  const res = D.computeSmartPlans({ tonnage: '0', port: '黄骅港', destination: DEST_YARD });
  assert.equal(res.triggered, false);
  assert.deepEqual(res.missing, ['吨数']);
});

test('智能方案：触发后生成 3 套方案（CL-1/CL-2 向上取整、CL-3 线路）', () => {
  const res = D.computeSmartPlans({ tonnage: '70000', port: '黄骅港', destination: DEST_YARD });
  assert.equal(res.triggered, true);
  assert.equal(res.plans.length, 3);
  // CL-1：⌈70000/2500⌉ = 28 天
  assert.equal(res.plans[0].type, 'road_direct');
  assert.equal(res.plans[0].qty, 28);
  assert.equal(res.plans[0].unit, '天');
  // CL-2：⌈70000/3500⌉ = 20 列
  assert.equal(res.plans[1].type, 'rail_transit');
  assert.equal(res.plans[1].qty, 20);
  assert.equal(res.plans[1].unit, '列');
  assert.ok(res.plans[1].path.indexOf('短驳') >= 0);
  // CL-2 公路短驳车次：⌈70000/33⌉ = 2122 车，基准文案同时给出铁路/公路口径
  assert.equal(res.plans[1].road.qty, 2122);
  assert.equal(res.plans[1].road.unit, '车');
  assert.ok(res.plans[1].basis.indexOf('吨/车') >= 0);
  assert.ok(res.plans[1].detail.indexOf('2122 车') >= 0);
  // CL-4：铁路直达同列数并携带标识（PRD 4.2）
  assert.equal(res.plans[2].type, 'rail_direct');
  assert.equal(res.plans[2].qty, 20);
  assert.equal(res.plans[2].tag, '中矿试单已打通通道');
  // CL-3：武安站方向 → 沧港线
  assert.equal(res.line, D.LINE_CANGGANG);
  assert.equal(res.plans[1].line, res.line);
  assert.equal(res.plans[2].line, res.line);
  assert.ok(res.computed_at.length > 0);
});

test('智能方案：曹庄镇站方向 → 曹庄镇线（CL-3）', () => {
  const res = D.computeSmartPlans({ tonnage: '70000', port: '黄骅港', destination: { station: '曹庄镇站', yard: '曹庄镇站物流园' } });
  assert.equal(res.line, D.LINE_CAOZHUANG);
});

test('智能方案：非整吨向上取整（CL-4）', () => {
  const res = D.computeSmartPlans({ tonnage: '70001', port: '黄骅港', destination: DEST_YARD });
  assert.equal(res.plans[0].qty, 29);  // ⌈70001/2500⌉
  assert.equal(res.plans[1].qty, 21); // ⌈70001/3500⌉
});

test('智能方案：末端节点优先钢厂（路径与运力预填口径一致）', () => {
  const res = D.computeSmartPlans({ tonnage: '70000', port: '黄骅港', destination: DEST_STEEL });
  assert.ok(res.plans[0].path.indexOf('天铁集团') >= 0);
  assert.ok(res.plans[0].path.indexOf('黄骅港') === 0);
});

test('智能方案：异常安全——mock storage 抛错时回退种子不崩溃（页面 E6 兜底）', () => {
  const badSt = { getItem: () => { throw new Error('storage broken'); } };
  const res = D.computeSmartPlans({ tonnage: '70000', port: '黄骅港', destination: DEST_YARD }, badSt);
  assert.equal(res.triggered, true); // 种子目录仍可用
});

/* ==================== 7. 订单组装（F6 / TBD-08 / TBD-10） ==================== */

test('buildOrder：自然信息映射登录主体、字段映射完整（F2/F6）', () => {
  const order = D.buildOrder(okPayload(), SUBJECT_OK);
  assert.equal(order.trader, SUBJECT_OK.subject.company);
  assert.equal(order.traderContact, SUBJECT_OK.subject.contact);
  assert.equal(order.traderContactInfo, SUBJECT_OK.subject.phone);
  assert.equal(order.mine, '力拓');
  assert.equal(order.category, '铁矿石');
  assert.equal(order.cargoName, 'PB粉');
  assert.equal(order.cargoQuality, '品位 62%');
  assert.equal(order.cargoTotal, 70000);
  assert.equal(order.cargoPrice, 800);
  assert.equal(order.destPort, '黄骅港');
  assert.equal(order.vessel, '远盛海 008');
  // 提交时页面置 port，组装默认 draft（状态机入口）
  assert.equal(order.status, 'draft');
  assert.equal(order.id, '');
});

test('buildOrder：到港/发运时间转 ISO（兼容现有 flow 口径）', () => {
  const order = D.buildOrder(okPayload(), SUBJECT_OK);
  assert.equal(order.loadingStart, new Date('2026-11-13T08:00').toISOString());
  assert.equal(order.departure, new Date('2026-11-14T09:30').toISOString());
  // 仅日期口径：date-only 按 UTC 午夜解析，fmtDate 本地展示与 sail_date 截取均正确
  const order3 = D.buildOrder(okPayload({ arrivalAt: '2026-11-13', departAt: '2026-11-14' }), SUBJECT_OK);
  assert.equal(order3.loadingStart, new Date('2026-11-13').toISOString());
  assert.equal(order3.departure, new Date('2026-11-14').toISOString());
  const order2 = D.buildOrder(okPayload({ arrivalAt: '', departAt: '  ' }), SUBJECT_OK);
  assert.equal(order2.loadingStart, '');
  assert.equal(order2.departure, '');
});

test('buildOrder：目的地写入新字段并兼容映射 customers 单行末端节点', () => {
  const order = D.buildOrder(okPayload(), SUBJECT_OK);
  assert.deepEqual(order.destination, { station: '武安站', yard: '河北陆港保税物流中心（保税堆场）', steel: '天铁集团' });
  assert.equal(order.customers.length, 1);
  assert.ok(/^cust_/.test(order.customers[0].id));
  assert.equal(order.customers[0].name, '天铁集团'); // 末端节点优先钢厂
  assert.equal(order.customers[0].qty, 70000);
});

test('buildOrder：码头多选保留顺序、船名与船舶静态 9 项裁剪（F5）', () => {
  const order = D.buildOrder(okPayload({ wharfs: [' 矿石码头 ', '', '综合码头'], vesselInfo: { company: ' 中远海运 ', type: '集装箱船' } }), SUBJECT_OK);
  assert.deepEqual(order.wharfs, ['矿石码头', '综合码头']);
  assert.deepEqual(Object.keys(order.vesselInfo), ['company', 'scale', 'type', 'route', 'runTime', 'seaPrice', 'cycleTime', 'shipper', 'consignee']);
  assert.equal(order.vesselInfo.company, '中远海运');
  assert.equal(order.vesselInfo.type, '集装箱船');
  assert.equal(order.vesselInfo.scale, ''); // 未填项为空串而非 undefined
});

test('buildOrder：水尺数不再采集（AC-O04 界面与存储均无 draftMark）', () => {
  const order = D.buildOrder(okPayload({ draftMark: '14.5' }), SUBJECT_OK);
  assert.equal('draftMark' in order, false);
});

test('buildOrder：智能方案快照写入 smartPlan', () => {
  const order = D.buildOrder(okPayload(), SUBJECT_OK);
  assert.equal(order.smartPlan.triggered, true);
  assert.equal(order.smartPlan.plans.length, 1);
  assert.equal(order.smartPlan.computed_at, '2026-11-13 10:00:00');
  const order2 = D.buildOrder(okPayload({ plans: null }), SUBJECT_OK);
  assert.equal(order2.smartPlan.triggered, false);
});

test('buildOrder：时间戳为本地 yyyy-MM-dd HH:mm:ss 格式', () => {
  const order = D.buildOrder(okPayload(), SUBJECT_OK);
  assert.match(order.createdAt, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
  assert.match(order.updatedAt, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
});

/* ==================== 8. 衔接预填（F6③ / TBD-10） ==================== */

test('buildPortPrefill：港口名/码头首项预填，拥堵度默认正常', () => {
  const order = D.buildOrder(okPayload(), SUBJECT_OK);
  order.id = 'HZ202611130001';
  const pf = D.buildPortPrefill(order);
  assert.equal(pf.orderId, 'HZ202611130001');
  assert.equal(pf.portName, '黄骅港');
  assert.equal(pf.wharf, '矿石码头'); // 多选首项
  assert.equal(pf.congestion, 'normal');
  assert.equal(pf.waitHours, 0);
  // 无码头时预填为空
  const order2 = D.buildOrder(okPayload({ wharfs: [] }), SUBJECT_OK);
  assert.equal(D.buildPortPrefill(order2).wharf, '');
});

test('buildCapacityPrefills：按智能方案生成 3 行，数值留 0 人工确认', () => {
  const plansRes = D.computeSmartPlans({ tonnage: '70000', port: '黄骅港', destination: DEST_YARD });
  const order = D.buildOrder(okPayload({ destination: DEST_YARD }), SUBJECT_OK);
  order.id = 'HZ202611130002';
  const rows = D.buildCapacityPrefills(order, plansRes, () => 'cap_test');
  assert.equal(rows.length, 3);
  assert.deepEqual(rows.map(r => r.channelType), ['road', 'rail_transit', 'rail_direct']);
  rows.forEach(r => {
    assert.equal(r.orderId, 'HZ202611130002');
    assert.equal(r.origin, '黄骅港');
    assert.equal(r.destination, '河北陆港保税物流中心（保税堆场）');
    assert.equal(r.idleCapacity, 0);
    assert.equal(r.plannedQty, 0);
    assert.equal(r.price, 0);
    assert.equal(r.leadTime, 0);
    assert.equal(r.carrier, '');
  });
  // 公铁联运行携带中转站点
  assert.equal(rows[1].transfer, '武安站');
  // 未触发时返回空数组（不预填）
  const rows2 = D.buildCapacityPrefills(order, { triggered: false, plans: [] });
  assert.deepEqual(rows2, []);
});

test('buildVesselInfoPatch：航次 vessel_info 9 项与船舶静态板块一致（F5④/AC-O09）', () => {
  const order = D.buildOrder(okPayload(), SUBJECT_OK);
  const patch = D.buildVesselInfoPatch(order);
  const keys = Object.keys(patch.vessel_info);
  assert.equal(keys.length, 9);
  assert.deepEqual(keys, ['company', 'scale', 'type', 'route', 'runTime', 'seaPrice', 'cycleTime', 'shipper', 'consignee']);
  assert.equal(patch.vessel_info.company, '中远海运');
  // 无船舶信息时返回 null（不写入航次）
  assert.equal(D.buildVesselInfoPatch(null), null);
});

/* ==================== 9. 状态机衔接与工具 ==================== */

test('台账同步点判定（F6②）：port 之前不同步，待确认起同步', () => {
  assert.equal(D.isLedgerSynced('draft'), false);
  assert.equal(D.isLedgerSynced('port'), false);
  assert.equal(D.isLedgerSynced('capacity'), false);
  assert.equal(D.isLedgerSynced('plan'), false);
  assert.equal(D.isLedgerSynced('pending_confirm'), true);
  assert.equal(D.isLedgerSynced('confirmed'), true);
  assert.equal(D.isLedgerSynced('shipping'), true);
  assert.equal(D.isLedgerSynced('shipped'), true);
  assert.equal(D.isLedgerSynced('completed'), true);
});

test('九态常量与现有 flow 状态机一致', () => {
  assert.deepEqual(D.FLOW_STATUSES,
    ['draft', 'port', 'capacity', 'plan', 'pending_confirm', 'confirmed', 'shipping', 'shipped', 'completed']);
});

test('fmtNum 千分位与 toIso 空值口径', () => {
  assert.equal(D.fmtNum(70000), '70,000');
  assert.equal(D.fmtNum(2500), '2,500');
  assert.equal(D.fmtNum(70000.5), '70,000.5');
  assert.equal(D.fmtNum('abc'), 'abc');
  assert.equal(D.toIso(''), '');
  assert.equal(D.toIso('   '), '');
  assert.equal(D.toIso('无效日期'), '');
  assert.equal(D.toIso('2026-11-13T08:00'), new Date('2026-11-13T08:00').toISOString());
});

test('fmtTime：本地时间 yyyy-MM-dd HH:mm:ss', () => {
  assert.equal(D.fmtTime(new Date(2026, 10, 13, 8, 5, 3)), '2026-11-13 08:05:03');
});

/* ==================== 10. 码头清单与港口联动（R4，来源：港口管理） ==================== */

test('码头联动：命中港口且维护 wharfs 时返回该港清单', () => {
  const ports = [{ name: '黄骅港', wharfs: ['综合码头', '矿石码头', '煤炭码头'] }];
  const res = D.listWharfsForPort(ports, '黄骅港');
  assert.equal(res.matched, true);
  assert.deepEqual(res.list, ['综合码头', '矿石码头', '煤炭码头']);
});

test('码头联动：命中港口但未维护 wharfs 时返回空清单（页面回退通用清单）', () => {
  const res = D.listWharfsForPort([{ name: '天津港' }], '天津港');
  assert.equal(res.matched, true);
  assert.deepEqual(res.list, []);
  // wharfs 为非数组（旧数据）同样按未维护处理
  const res2 = D.listWharfsForPort([{ name: '天津港', wharfs: '矿石码头' }], '天津港');
  assert.equal(res2.matched, true);
  assert.deepEqual(res2.list, []);
});

test('码头联动：未命中港口管理数据时 matched 为 false', () => {
  const res = D.listWharfsForPort([{ name: '黄骅港', wharfs: ['综合码头'] }], '青岛港');
  assert.equal(res.matched, false);
  assert.deepEqual(res.list, []);
});

test('码头联动：空白项过滤与名称 trim 匹配', () => {
  const ports = [{ name: ' 黄骅港 ', wharfs: [' 综合码头 ', '', '矿石码头'] }];
  const res = D.listWharfsForPort(ports, '黄骅港');
  assert.equal(res.matched, true);
  assert.deepEqual(res.list, ['综合码头', '矿石码头']);
});

test('码头联动：空名 / 非法入参安全不抛错', () => {
  assert.equal(D.listWharfsForPort([], '').matched, false);
  assert.equal(D.listWharfsForPort(null, '黄骅港').matched, false);
  assert.equal(D.listWharfsForPort('not-array', '黄骅港').matched, false);
});

test('码头种子兜底：黄骅港 / 天津港返回种子清单，未命中返回空数组', () => {
  assert.deepEqual(D.wharfSeedOf('黄骅港'), ['综合码头', '矿石码头', '煤炭码头', '散货码头', '集装箱码头']);
  assert.deepEqual(D.wharfSeedOf('天津港'), ['集装箱码头', '矿石码头', '焦炭码头', '汇盛码头', '散货码头']);
  assert.deepEqual(D.wharfSeedOf('青岛港'), []);
  assert.deepEqual(D.wharfSeedOf(''), []);
  assert.deepEqual(D.wharfSeedOf(null), []);
  // 名称 trim 匹配
  assert.equal(D.wharfSeedOf(' 黄骅港 ').length, 5);
  // 返回副本，外部修改不影响种子
  const copy = D.wharfSeedOf('黄骅港');
  copy.push('脏数据');
  assert.equal(D.wharfSeedOf('黄骅港').length, 5);
});
