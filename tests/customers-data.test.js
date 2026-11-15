/* ============================================================
   客户管理模块 · 数据层单元测试
   ------------------------------------------------------------
   运行：node --test tests/
   覆盖：《PRD-客户管理模块》BR-C01 ~ BR-C10、F3/F5/F6/F7、
         状态机（9.3）、类型归类调整、存量待归类清单并入（adoptPending）
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

/* ==================== 3. 平台代注册（F3 / BR-C01） ==================== */

test('代注册：保存即生效（正常 / 平台代注册）', () => {
  const res = okCreate([]);
  assert.equal(res.customer.status, '正常');
  assert.equal(res.customer.source, '平台代注册');
  assert.equal(res.customer.customer_type, '集采贸易商');
  assert.ok(res.customer.history.length >= 1);
});

test('代注册：三类客户类型均可直接录入', () => {
  const codes = [CC_A, CC_B, CC_C];
  D.TYPES.forEach((type, i) => {
    const res = D.createByOperator([], {
      customer_type: type, name: '类型覆盖' + (i + 1) + '号有限公司', credit_code: codes[i],
      contact: '张三', phone: '13800138000'
    });
    assert.ok(res.ok, type + ' 应可代注册：' + JSON.stringify(res));
    assert.equal(res.customer.customer_type, type);
    assert.equal(res.customer.status, '正常');
  });

  // 无类型 / 非法类型拒绝
  const bad = D.createByOperator([], {
    customer_type: '', name: '无类型公司', credit_code: CC_A,
    contact: '张三', phone: '13800138000'
  });
  assert.equal(bad.ok, false);
  assert.ok(bad.errors.customer_type);
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

/* ==================== 4. 自主注册（F4 / BR-C09） ==================== */

const REG_DATA = {
  name: '河北陆港保税物流贸易有限公司',
  credit_code: CC_C,
  contact: '赵六',
  phone: '0311-88886666',
  credentials: [{ id: 'f1', name: '营业执照.png', size: 1024, type: 'image/png', data: null }]
};

test('自主注册：缺省类型为现货贸易商，提交后待审核（BR-C09）', () => {
  const res = D.createSelfRegistered([], REG_DATA);
  assert.ok(res.ok);
  assert.equal(res.customer.customer_type, '现货贸易商');
  assert.equal(res.customer.status, '待审核');
  assert.equal(res.customer.source, '自主注册');
  // BR-C09：审核通过前不生效，不可被业务引用
  assert.equal(D.listActive(res.list).length, 0);
});

test('自主注册：显式选择客户类型（三类可选）', () => {
  const res = D.createSelfRegistered([], Object.assign({}, REG_DATA, { customer_type: '下游客户' }));
  assert.ok(res.ok);
  assert.equal(res.customer.customer_type, '下游客户');

  const bad = D.createSelfRegistered([], Object.assign({}, REG_DATA, { customer_type: '外包商' }));
  assert.equal(bad.ok, false);
  assert.ok(bad.errors.customer_type);
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

test('编辑：客户名称 / 来源锁定；类型可归类调整（BR-C01 / F6）', () => {
  const created = okCreate([]);
  const r1 = D.updateInfo(created.list, created.customer.id, { name: '改名公司' }, { role: 'operator' });
  assert.equal(r1.ok, false); assert.ok(r1.errors.name);

  const r3 = D.updateInfo(created.list, created.customer.id, { source: '自主注册' }, { role: 'operator' });
  assert.equal(r3.ok, false); assert.ok(r3.errors.source);

  // 类型三类间调整：生效并写入「类型调整」操作记录
  const r2 = D.updateInfo(created.list, created.customer.id, { customer_type: '下游客户' }, { role: 'operator' });
  assert.ok(r2.ok, JSON.stringify(r2));
  assert.equal(r2.customer.customer_type, '下游客户');
  assert.ok(r2.customer.history.some(h => h.action === '类型调整' && h.detail.indexOf('下游客户') >= 0));

  // 类型不可清空 / 非法类型拒绝
  const r4 = D.updateInfo(r2.list, r2.customer.id, { customer_type: '   ' }, { role: 'operator' });
  assert.equal(r4.ok, false); assert.ok(r4.errors.customer_type);
  const r5 = D.updateInfo(r2.list, r2.customer.id, { customer_type: '外包商' }, { role: 'operator' });
  assert.equal(r5.ok, false); assert.ok(r5.errors.customer_type);
});

test('编辑：非空信用代码不可改；空值可补录（待归类存量场景）', () => {
  // 非空不可改
  const created = okCreate([]);
  const r1 = D.updateInfo(created.list, created.customer.id, { credit_code: CC_B }, { role: 'operator' });
  assert.equal(r1.ok, false); assert.ok(r1.errors.credit_code);

  // 空值补录：待归类存量主体（无信用代码）通过编辑补录并归类
  const plan = D.adoptPending([], [{ id: 'p1', name: '补录钢铁有限公司', credit_code: '', contact: '', phone: '' }]);
  assert.equal(plan.adopted, 1);
  const rec = plan.list[0];
  assert.equal(rec.credit_code, '');
  const r2 = D.updateInfo(plan.list, rec.id, { credit_code: CC_B, customer_type: '下游客户' }, { role: 'operator' });
  assert.ok(r2.ok, JSON.stringify(r2));
  assert.equal(r2.customer.credit_code, CC_B);
  assert.equal(r2.customer.customer_type, '下游客户');

  // 补录时与既有主体重码 → 拒绝（BR-C02）
  const plan2 = D.adoptPending([], [{ id: 'p2', name: '补录第二钢铁有限公司', credit_code: '', contact: '', phone: '' }]);
  const withDup = okCreate(plan2.list, { name: '占位主体', credit_code: CC_B });
  const r3 = D.updateInfo(withDup.list, plan2.list[0].id, { credit_code: CC_B }, { role: 'operator' });
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
    'id', 'name_key', 'reject_reason', 'history', 'source_refs'
  ].sort();
  keys.forEach(k => assert.ok(allowed.includes(k), '出现白名单外字段：' + k));
});

test('存量并入不携带非白名单字段，仅保留系统溯源 source_refs（AC-C02）', () => {
  const plan = D.adoptPending([], [{
    id: 'p1', name: '武安钢铁有限公司', credit_code: CC_B, contact: '李强', phone: '13800138002',
    extra: '多余字段', profile: { '企业简介': '某钢厂' },
    source_refs: [{ module: 'steel', source_id: 's1' }]
  }]);
  assert.equal(plan.adopted, 1);
  const rec = plan.list[0];
  assert.equal(rec.extra, undefined);
  assert.equal(rec.profile, undefined);
  assert.ok(rec.source_refs.length === 1, 'source_refs 作为系统溯源字段保留');
});

/* ==================== 10. 存量待归类清单并入（旧迁移流程已下线） ==================== */

test('存量并入：待归类主体进入客户库（无类型 / 正常 / 系统迁移）', () => {
  const plan = D.adoptPending([], [
    { id: 'p1', name: '中矿国际贸易有限公司', credit_code: CC_A, contact: '王敏', phone: '13800138001' },
    { id: 'p2', name: '冀东矿石贸易有限公司', credit_code: CC_B, contact: '', phone: '' }
  ]);
  assert.equal(plan.adopted, 2);
  assert.equal(plan.list.length, 2);
  plan.list.forEach(c => {
    assert.equal(c.customer_type, '');
    assert.equal(c.status, '正常');
    assert.equal(c.source, '系统迁移');
  });
  // 待归类客户未定类型，不进入业务可引用名单
  assert.equal(D.listActive(plan.list).length, 0);
});

test('存量并入查重：与客户库重名 / 重码主体丢弃', () => {
  const existing = okCreate([]).list;   // 已有 CC_A 同名同码客户
  const plan = D.adoptPending(existing, [
    { id: 'p1', name: '中矿国际贸易有限公司', credit_code: CC_A, contact: '', phone: '' },
    { id: 'p2', name: '新增主体有限公司', credit_code: CC_B, contact: '', phone: '' }
  ]);
  assert.equal(plan.adopted, 1);
  assert.equal(plan.list.length, 2);
  assert.equal(plan.list[1].name, '新增主体有限公司');
});

test('存量并入后通过编辑归类：待归类 → 集采贸易商（归类确认）', () => {
  const plan = D.adoptPending([], [{ id: 'p1', name: '中矿国际贸易有限公司', credit_code: CC_A, contact: '', phone: '' }]);
  const rec = plan.list[0];
  const res = D.updateInfo(plan.list, rec.id, { customer_type: '集采贸易商' }, { role: 'operator' });
  assert.ok(res.ok, JSON.stringify(res));
  assert.equal(res.customer.customer_type, '集采贸易商');
  assert.ok(res.customer.history.some(h => h.action === '归类确认'));
  // 归类完成后进入可引用名单
  assert.equal(D.listActive(res.list).length, 1);
});

/* ==================== 11. 存储层守卫 ==================== */

test('Node 环境下无 HZDB 基座时存储函数安全', async () => {
  // 数据层无基座环境安全降级：读返回空数组、写返回已决 false 的 Promise（不抛错）
  assert.deepEqual(D.loadStore(), []);
  const p = D.saveStore([{ id: 'x' }]);
  assert.equal(typeof p.then, 'function');
  assert.equal(await p, false);   // 已决失败 Promise，不抛错
});

test('常量定义符合 PRD（类型 / 状态 / 来源）', () => {
  assert.deepEqual(D.TYPES, ['集采贸易商', '现货贸易商', '下游客户']);
  assert.deepEqual(D.STATUSES, ['待审核', '正常', '停用', '已驳回']);
  assert.deepEqual(D.SOURCES, ['自主注册', '平台代注册', '系统迁移']);
});
