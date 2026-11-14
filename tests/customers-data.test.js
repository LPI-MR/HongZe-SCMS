/* ============================================================
   客户管理模块 · 数据层单元测试
   ------------------------------------------------------------
   运行：node --test tests/
   覆盖：《PRD-客户管理模块》BR-C01 ~ BR-C10、F3/F5/F6/F7、
         状态机（9.3）、数据迁移映射（10.1/10.2）
   ============================================================ */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const D = require('../customers/data.js');

/* ---------- 通用测试数据 ---------- */

const CC_A = '91110000MA01ABCD23';   // 合法 18 位信用代码
const CC_B = '91130481MA0BBBBB66';
const CC_C = '91130000MA0CCCCC0X';   // 18 位合法

function okCreate(list, over) {
  const res = D.createByOperator(list, Object.assign({
    customer_type: '集采贸易商',
    name: '中矿国际贸易有限公司',
    credit_code: CC_A,
    contact: '王敏',
    phone: '13800138001'
  }, over || {}));
  assert.ok(res.ok, 'createByOperator 应成功：' + JSON.stringify(res));
  return res;
}

/* ==================== 1. 格式校验（BR-C08） ==================== */

test('客户名称校验：空值 / 长度越界报错，首尾空格可接受', () => {
  assert.ok(D.validateName(''));
  assert.ok(D.validateName('   '));
  assert.ok(D.validateName('宝'));                        // 1 字符
  assert.ok(D.validateName('宝'.repeat(51)));             // 51 字符
  assert.equal(D.validateName('  宝武钢铁有限公司  '), ''); // 首尾空格忽略
  assert.equal(D.validateName('武安钢铁'), '');
});

test('统一社会信用代码校验：18 位字符集', () => {
  assert.ok(D.validateCreditCode(''));                    // 必填
  assert.ok(D.validateCreditCode('91110000MA01ABC1'));    // 16 位
  assert.ok(D.validateCreditCode(CC_A + '9'));            // 19 位
  assert.ok(D.validateCreditCode('9111000IMA01ABCD23'));  // 含 I（非法字符）
  // 小写输入：数据层先 toUpperCase 再校验，宽松接收
  assert.equal(D.validateCreditCode(CC_A.toLowerCase()), '');
  assert.equal(D.validateCreditCode(CC_A), '');
});

test('联系方式校验：手机号 / 座机（BR-C08）', () => {
  assert.equal(D.validatePhone('13800138000'), '');
  assert.equal(D.validatePhone('010-65529988'), '');
  assert.equal(D.validatePhone('0310-3057777'), '');
  assert.equal(D.validatePhone('65529988'), '');          // 本地号码
  assert.ok(D.validatePhone(''));                          // 必填
  assert.ok(D.validatePhone('1380013800'));               // 10 位
  assert.ok(D.validatePhone('138001380001'));             // 12 位
  assert.ok(D.validatePhone('1234'));                      // 任意短串
});

test('联系人校验：必填且 ≤20 字符', () => {
  assert.equal(D.validateContact('李强'), '');
  assert.ok(D.validateContact(''));
  assert.ok(D.validateContact('李'.repeat(21)));
  assert.equal(D.validateContact('李'.repeat(20)), '');
});

/* ==================== 2. 查重（BR-C02） ==================== */

test('名称查重：忽略首尾空格（BR-C02）', () => {
  const list = [okCreate([]).customer];
  const dup = D.findDuplicate(list, { name: '  中矿国际贸易有限公司 ', credit_code: CC_B });
  assert.ok(dup, '名称忽略首尾空格应判重');
  assert.equal(dup.field, 'name');
});

test('信用代码查重：同一主体全平台仅一条', () => {
  const list = [okCreate([]).customer];
  const dup = D.findDuplicate(list, { name: '完全另一个名字有限公司', credit_code: CC_A });
  assert.ok(dup, '信用代码重复应判重');
  assert.equal(dup.field, 'credit_code');
});

test('查重排除自身（编辑场景）', () => {
  const created = okCreate([]);
  const dup = D.findDuplicate(created.list, { name: created.customer.name, credit_code: CC_A }, created.customer.id);
  assert.equal(dup, null);
});

/* ==================== 3. 平台代注册（F3 / BR-C01 / BR-C03） ==================== */

test('代注册：保存即生效（正常 / 平台代注册）', () => {
  const res = okCreate([]);
  assert.equal(res.customer.status, '正常');
  assert.equal(res.customer.source, '平台代注册');
  assert.equal(res.customer.customer_type, '集采贸易商');
  assert.ok(res.customer.history.length >= 1);
});

test('代注册：不允许选择现货贸易商（BR-C03）', () => {
  const res = D.createByOperator([], {
    customer_type: '现货贸易商', name: '某现货商', credit_code: CC_B,
    contact: '张三', phone: '13800138000'
  });
  assert.equal(res.ok, false);
  assert.equal(res.code, 'INVALID');
  assert.ok(res.errors.customer_type);
});

test('代注册：非法联系方式拒绝', () => {
  const res = D.createByOperator([], {
    customer_type: '下游客户', name: '武安钢铁有限公司', credit_code: CC_B,
    contact: '李强', phone: '1234'
  });
  assert.equal(res.ok, false);
  assert.ok(res.errors.phone);
});

test('代注册：名称 / 信用代码重复拒绝（BR-C02）', () => {
  const first = okCreate([]);
  const dupRes = D.createByOperator(first.list, {
    customer_type: '集采贸易商', name: '另一家公司', credit_code: CC_A,
    contact: '王敏', phone: '13800138001'
  });
  assert.equal(dupRes.ok, false);
  assert.equal(dupRes.code, 'DUP');
});

/* ==================== 4. 自主注册（F4 / BR-C03 / BR-C09） ==================== */

const REG_DATA = {
  name: '河北陆港保税物流贸易有限公司',
  credit_code: CC_C,
  contact: '赵六',
  phone: '0311-88886666',
  credentials: [{ id: 'f1', name: '营业执照.png', size: 1024, type: 'image/png', data: null }]
};

test('自主注册：类型固定现货贸易商，提交后待审核（BR-C03 / BR-C09）', () => {
  const res = D.createSelfRegistered([], REG_DATA);
  assert.ok(res.ok);
  assert.equal(res.customer.customer_type, '现货贸易商');
  assert.equal(res.customer.status, '待审核');
  assert.equal(res.customer.source, '自主注册');
  // BR-C09：审核通过前不生效，不可被业务引用
  assert.equal(D.listActive(res.list).length, 0);
});

test('自主注册：资质凭证必填', () => {
  const res = D.createSelfRegistered([], Object.assign({}, REG_DATA, { credentials: [] }));
  assert.equal(res.ok, false);
  assert.ok(res.errors.credentials);
});

test('自主注册：与代注册客户同名 / 同码拒绝（BR-C02）', () => {
  const list = okCreate([]).list;
  const res = D.createSelfRegistered(list, Object.assign({}, REG_DATA, { name: '中矿国际贸易有限公司' }));
  assert.equal(res.ok, false);
  assert.equal(res.code, 'DUP');
});

/* ==================== 5. 审核与状态机（F5 / BR-C05 / 9.3） ==================== */

test('审核通过：待审核 → 正常，进入可引用名单', () => {
  const reg = D.createSelfRegistered([], REG_DATA);
  const res = D.reviewApprove(reg.list, reg.customer.id);
  assert.ok(res.ok);
  assert.equal(res.customer.status, '正常');
  assert.equal(D.listActive(res.list).length, 1);
});

test('审核驳回：原因必填（BR-C05）', () => {
  const reg = D.createSelfRegistered([], REG_DATA);
  const noReason = D.reviewReject(reg.list, reg.customer.id, '   ');
  assert.equal(noReason.ok, false);
  assert.ok(noReason.errors.reject_reason);

  const res = D.reviewReject(reg.list, reg.customer.id, '凭证不清晰');
  assert.ok(res.ok);
  assert.equal(res.customer.status, '已驳回');
  assert.equal(res.customer.reject_reason, '凭证不清晰');
});

test('状态机：非法迁移拒绝（9.3）', () => {
  assert.equal(D.canTransition('approve', '正常'), false);
  assert.equal(D.canTransition('disable', '待审核'), false);
  assert.equal(D.canTransition('enable', '正常'), false);
  assert.equal(D.canTransition('resubmit', '正常'), false);
  assert.equal(D.canTransition('reject', '已驳回'), false);

  const reg = D.createSelfRegistered([], REG_DATA);
  const bad = D.setStatus(reg.list, reg.customer.id, '停用');   // 待审核不可直接停用
  assert.equal(bad.ok, false);
  assert.equal(bad.code, 'STATE');
});

test('已驳回 → 修改信息重新提交 → 待审核（BR-C05）', () => {
  const reg = D.createSelfRegistered([], REG_DATA);
  const rej = D.reviewReject(reg.list, reg.customer.id, '联系方式有误');
  const res = D.resubmit(rej.list, rej.customer.id, { contact: '赵六新', phone: '13900139000' });
  assert.ok(res.ok);
  assert.equal(res.customer.status, '待审核');
  assert.equal(res.customer.contact, '赵六新');
  assert.equal(res.customer.phone, '13900139000');
  assert.equal(res.customer.reject_reason, '');  // 驳回原因转入操作记录
  assert.ok(res.customer.history.some(h => h.action === '审核驳回' && h.detail.indexOf('联系方式有误') >= 0));
});

test('重新提交仅限已驳回状态', () => {
  const reg = D.createSelfRegistered([], REG_DATA);
  const res = D.resubmit(reg.list, reg.customer.id, { contact: 'x' });
  assert.equal(res.ok, false);
  assert.equal(res.code, 'STATE');
});

/* ==================== 6. 编辑（F6 / AC-C07） ==================== */

test('编辑：运营方可修改联系人 / 联系方式', () => {
  const created = okCreate([]);
  const res = D.updateInfo(created.list, created.customer.id, { contact: '王敏新', phone: '010-65529988' }, { role: 'operator' });
  assert.ok(res.ok);
  assert.deepEqual(res.changed, ['联系人', '联系方式']);
  assert.equal(res.customer.contact, '王敏新');
  assert.ok(res.customer.history.some(h => h.action === '信息修改'));
});

test('编辑：客户名称 / 类型 / 来源锁定（BR-C01 / F6）', () => {
  const created = okCreate([]);
  const r1 = D.updateInfo(created.list, created.customer.id, { name: '改名公司' }, { role: 'operator' });
  assert.equal(r1.ok, false); assert.ok(r1.errors.name);

  const r2 = D.updateInfo(created.list, created.customer.id, { customer_type: '下游客户' }, { role: 'operator' });
  assert.equal(r2.ok, false); assert.ok(r2.errors.customer_type);

  const r3 = D.updateInfo(created.list, created.customer.id, { source: '自主注册' }, { role: 'operator' });
  assert.equal(r3.ok, false); assert.ok(r3.errors.source);
});

test('编辑：非空信用代码不可改；空值可补录（迁移存量场景）', () => {
  // 非空不可改
  const created = okCreate([]);
  const r1 = D.updateInfo(created.list, created.customer.id, { credit_code: CC_B }, { role: 'operator' });
  assert.equal(r1.ok, false); assert.ok(r1.errors.credit_code);

  // 空值补录：迁移生成一条无代码的客户
  const steel = {
    name: '补录钢铁有限公司', creditCode: '', roles: ['付费客户'], industries: ['钢铁生产企业'],
    profile: {}, source_refs: []
  };
  const plan = D.migrateUnified([steel], []);
  assert.equal(plan.customers.length, 1);
  const rec = plan.customers[0];
  assert.equal(rec.credit_code, '');
  const r2 = D.updateInfo(plan.customers, rec.id, { credit_code: CC_B }, { role: 'operator' });
  assert.ok(r2.ok, JSON.stringify(r2));
  assert.equal(r2.customer.credit_code, CC_B);

  // 补录时与既有主体重码 → 拒绝（BR-C02）
  const steel2 = {
    name: '补录第二钢铁有限公司', creditCode: '', roles: ['付费客户'], industries: ['钢铁生产企业'],
    profile: {}, source_refs: []
  };
  const plan2 = D.migrateUnified([steel2], []);
  assert.equal(plan2.customers.length, 1);
  const withDup = okCreate(plan2.customers, { name: '占位主体', credit_code: CC_B });
  const r3 = D.updateInfo(withDup.list, plan2.customers[0].id, { credit_code: CC_B }, { role: 'operator' });
  assert.equal(r3.ok, false);
  assert.equal(r3.code, 'DUP');
});

test('编辑：待审核 / 已驳回状态不可编辑', () => {
  const reg = D.createSelfRegistered([], REG_DATA);
  const res = D.updateInfo(reg.list, reg.customer.id, { contact: 'x' }, { role: 'operator' });
  assert.equal(res.ok, false);
  assert.equal(res.code, 'STATE');
});

/* ==================== 7. 停用 / 启用（F7 / BR-C06） ==================== */

test('停用后不可被业务引用，启用后恢复（BR-C06）', () => {
  const created = okCreate([]);
  const dis = D.setStatus(created.list, created.customer.id, '停用');
  assert.ok(dis.ok);
  assert.equal(dis.customer.status, '停用');
  assert.equal(D.listActive(dis.list).length, 0, '停用客户不在可引用名单');

  const en = D.setStatus(dis.list, dis.customer.id, '正常');
  assert.ok(en.ok);
  assert.equal(en.customer.status, '正常');
  assert.equal(D.listActive(en.list).length, 1);
});

test('停用 / 启用需二次路径合法（状态机拒绝非法迁移）', () => {
  const created = okCreate([]);
  const bad = D.setStatus(created.list, created.customer.id, '正常'); // 已是正常
  assert.equal(bad.ok, false);
  assert.equal(bad.code, 'STATE');
});

/* ==================== 8. 类型派生标签（BR-C10） ==================== */

test('类型标签由系统派生（BR-C10）', () => {
  assert.equal(D.deriveTag('集采贸易商'), '长协贸易商');
  assert.equal(D.deriveTag('现货贸易商'), '现货散单');
  assert.equal(D.deriveTag('下游客户'), '钢厂');
});

/* ==================== 9. 字段白名单（BR-C07 / AC-C02） ==================== */

test('记录字段仅含白名单 + 系统字段（BR-C07）', () => {
  const reg = D.createSelfRegistered([], REG_DATA);
  const keys = Object.keys(reg.customer).sort();
  const allowed = [
    // 白名单展示字段
    'name', 'customer_type', 'contact', 'phone', 'credit_code', 'source', 'status',
    'credentials', 'created_at', 'updated_at',
    // 系统字段
    'id', 'name_key', 'reject_reason', 'history', 'source_refs', 'migrated_batch'
  ].sort();
  keys.forEach(k => assert.ok(allowed.includes(k), '出现白名单外字段：' + k));
});

test('迁移不携带 profile / attrs 等非白名单字段（AC-C02）', () => {
  const steel = {
    name: '武安钢铁有限公司', creditCode: CC_B, roles: ['付费客户'], industries: ['钢铁生产企业'],
    profile: { '联系人': '李强', '联系电话': '13800138002', '企业简介': '某钢厂', '企业地址': '河北武安' },
    attrs: [{ label: '自定义', value: 'x' }],
    source_refs: [{ module: 'steel', source_id: 's1' }]
  };
  const plan = D.migrateUnified([steel], []);
  assert.equal(plan.customers.length, 1);
  const rec = plan.customers[0];
  assert.equal(rec.profile, undefined);
  assert.equal(rec.attrs, undefined);
  assert.equal(rec.industries, undefined);
  assert.equal(rec.roles, undefined);
  assert.ok(rec.source_refs.length === 1, 'source_refs 作为系统溯源字段保留');
});

/* ==================== 10. 数据迁移（10.1 / 10.2 / AC-C10） ==================== */

function legacyEntity(name, opts) {
  return Object.assign({
    id: 'ent_' + name, name, nameKey: name, creditCode: '',
    roles: [], industries: [], sources: [], source_refs: [],
    profile: {}, attrs: [], status: '已同步', synced_at: 0, sync_batch: 'b1'
  }, opts || {});
}

test('迁移映射：钢铁生产企业 → 下游客户（正常 / 系统迁移）', () => {
  const steel = legacyEntity('武安钢铁有限公司', {
    creditCode: CC_B, roles: ['付费客户'], industries: ['钢铁生产企业'],
    profile: { '联系人': '李强', '联系电话': '13800138002' }
  });
  const plan = D.migrateUnified([steel], []);
  assert.equal(plan.customers.length, 1);
  assert.equal(plan.pending.length, 0);
  const c = plan.customers[0];
  assert.equal(c.customer_type, '下游客户');
  assert.equal(c.status, '正常');
  assert.equal(c.source, '系统迁移');
  assert.equal(c.contact, '李强');
  assert.equal(c.phone, '13800138002');
  assert.equal(c.credit_code, CC_B);
  assert.ok(D.listActive(plan.customers).length === 1, '迁入即生效可被业务引用');
});

test('迁移映射：矿石贸易商 → 待人工归类清单', () => {
  const trader = legacyEntity('中矿国际贸易有限公司', {
    creditCode: CC_A, roles: ['付费客户'], industries: ['矿石贸易商'],
    profile: { '联系人': '王敏' }
  });
  const plan = D.migrateUnified([trader], []);
  assert.equal(plan.customers.length, 0);
  assert.equal(plan.pending.length, 1);
  assert.equal(plan.pending[0].name, '中矿国际贸易有限公司');
  assert.equal(plan.pending[0].contact, '王敏');
});

test('迁移映射：资源类主体移出客户模块（AC-C10）', () => {
  const entities = [
    legacyEntity('黄骅港务集团有限公司', { roles: ['物流服务商'], industries: ['港口节点'] }),
    legacyEntity('曹妃甸仓储园区管理有限公司', { roles: ['仓储服务商'], industries: ['仓储园区'] }),
    legacyEntity('邯郸铁路场站运营有限公司', { roles: ['场站服务商'], industries: ['铁路场站'] }),
    legacyEntity('某公路运输有限公司', { roles: ['物流服务商'], industries: ['公路运输'] }),
    legacyEntity('某铁路运营有限公司', { roles: ['物流服务商'], industries: ['铁路运营'] })
  ];
  const plan = D.migrateUnified(entities, []);
  assert.equal(plan.customers.length, 0);
  assert.equal(plan.pending.length, 0);
  assert.equal(plan.excluded.length, 5);
});

test('迁移映射：仅付费客户角色（无行业）→ 待人工归类', () => {
  const payer = legacyEntity('某付费主体有限公司', { roles: ['付费客户'] });
  const plan = D.migrateUnified([payer], []);
  assert.equal(plan.pending.length, 1);
});

test('迁移查重：与现有客户库重名 / 重码跳过并记录（BR-C02）', () => {
  const steel = legacyEntity('中矿国际贸易有限公司', {
    creditCode: CC_A, roles: ['付费客户'], industries: ['钢铁生产企业']
  });
  const existing = okCreate([]).list;   // 已有同名同码客户
  const plan = D.migrateUnified([steel], existing);
  assert.equal(plan.customers.length, 0);
  assert.equal(plan.skipped.length, 1);
});

test('归类确认：矿石贸易商 → 集采/现货，状态正常、来源系统迁移；类型随后锁定（BR-C01）', () => {
  const trader = legacyEntity('中矿国际贸易有限公司', { roles: ['付费客户'], industries: ['矿石贸易商'], creditCode: CC_A });
  const plan = D.migrateUnified([trader], []);

  const r1 = D.classifyPending([], plan.pending, plan.pending[0].id, '集采贸易商');
  assert.ok(r1.ok);
  assert.equal(r1.customer.customer_type, '集采贸易商');
  assert.equal(r1.customer.status, '正常');
  assert.equal(r1.customer.source, '系统迁移');
  assert.equal(r1.pending.length, 0);

  const r2 = D.classifyPending([], plan.pending, plan.pending[0].id, '现货贸易商');
  assert.ok(r2.ok);
  assert.equal(r2.customer.customer_type, '现货贸易商');

  // 归类限定：仅集采 / 现货
  const r3 = D.classifyPending([], plan.pending, plan.pending[0].id, '下游客户');
  assert.equal(r3.ok, false);

  // 归类后类型锁定
  const locked = D.updateInfo(r1.list, r1.customer.id, { customer_type: '现货贸易商' });
  assert.equal(locked.ok, false);
});

test('归类确认查重：与主库重名拒绝', () => {
  const trader = legacyEntity('中矿国际贸易有限公司', { roles: ['付费客户'], industries: ['矿石贸易商'] });
  const plan = D.migrateUnified([trader], []);
  const existing = okCreate([]).list;  // 主库已有同名
  const res = D.classifyPending(existing, plan.pending, plan.pending[0].id, '集采贸易商');
  assert.equal(res.ok, false);
  assert.equal(res.code, 'DUP');
});

/* ==================== 11. 存储层守卫 ==================== */

test('Node 环境下 localStorage 不可用时存储函数安全', () => {
  assert.equal(D.hasStorage(), false);
  assert.deepEqual(D.loadStore(), []);
  assert.deepEqual(D.loadPending(), []);
  assert.equal(D.getMigrationState(), null);
  assert.doesNotThrow(() => D.saveStore([{ id: 'x' }]));
});

test('常量定义符合 PRD（类型 / 状态 / 来源）', () => {
  assert.deepEqual(D.TYPES, ['集采贸易商', '现货贸易商', '下游客户']);
  assert.deepEqual(D.OPERATOR_TYPES, ['集采贸易商', '下游客户']);
  assert.deepEqual(D.STATUSES, ['待审核', '正常', '停用', '已驳回']);
  assert.deepEqual(D.SOURCES, ['自主注册', '平台代注册', '系统迁移']);
});
