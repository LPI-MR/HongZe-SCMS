/* ============================================================
   客户管理模块 · 集成测试
   ------------------------------------------------------------
   运行：node --test tests/customers-integration.test.js
   覆盖：
     1. 存量待归类并入 → 代注册 → 自主注册 → 审核（驳回/重提/通过）
        → 编辑归类 → 停用/启用 全生命周期链路
     2. HZDB 数据基座读写回环（模拟浏览器基座，localStorage → PostgreSQL 改造）
   ============================================================ */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const D = require('../customers/data.js');

/* ---------- 浏览器环境模拟 ---------- */

// 基座模拟：内存表 + HZDB 契约（get 同步读缺失 undefined / put 全量替换深拷贝 / remove 单条删）
function makeHZDB() {
  const tables = {};
  return {
    ready: async () => tables,
    get: (key) => (Object.prototype.hasOwnProperty.call(tables, key) ? tables[key] : undefined),
    put: async (key, list) => {
      tables[key] = JSON.parse(JSON.stringify(list));   // 深拷贝模拟持久化往返
      return true;
    },
    remove: async (key, id) => {
      if (Array.isArray(tables[key])) tables[key] = tables[key].filter(x => String(x.id) !== String(id));
      return true;
    },
    putDict: async () => true,
    reset: () => { Object.keys(tables).forEach(k => delete tables[k]); },
  };
}

const mockHZDB = makeHZDB();
global.window = global.window || {};
global.window.HZDB = mockHZDB;

const CC_A = '91110000MA01ABCD23';
const CC_B = '91130481MA0BBBBB66';
const CC_C = '91130000MA0CCCCC0X';
const CC_D = '91140000MA0DDDDDD4';

/* ==================== 1. 存储层回环 ==================== */

test('HZDB 回环：saveStore / loadStore 序列化无损', async () => {
  mockHZDB.reset();
  const created = D.createByOperator([], {
    customer_type: '集采贸易商', name: '回环测试贸易有限公司',
    credit_code: CC_A, contact: '王敏', phone: '13800138001'
  });
  assert.ok(created.ok);
  assert.equal(await D.saveStore(created.list), true);   // 写库成功透传 true
  const loaded = D.loadStore();
  assert.equal(loaded.length, 1);
  assert.deepEqual(loaded, created.list);                // 深拷贝往返后深度相等
  assert.equal(loaded[0].credit_code, CC_A);
  assert.ok(loaded[0].history.length >= 1);
});

test('HZDB 契约：put 失败透传 false、缓存异常读返回空', async () => {
  mockHZDB.reset();
  // 1) 写库失败（基座已 toast）：saveStore 透传 false，供页面回滚现场
  const originalPut = mockHZDB.put;
  mockHZDB.put = async () => false;
  try {
    assert.equal(await D.saveStore([{ id: 'cust-x', name: '失败样例' }]), false);
    assert.deepEqual(D.loadStore(), [], '失败写不得污染缓存');
  } finally {
    mockHZDB.put = originalPut;
  }
  // 2) 缓存数据形状异常（非数组）：loadStore 安全降级为空数组
  global.window.HZDB.put('customers', { broken: true });
  assert.deepEqual(D.loadStore(), []);
});

/* ==================== 2. 全生命周期链路 ==================== */

test('全生命周期：存量并入 → 代注册 → 自主注册 → 审核 → 编辑归类 → 停用/启用', async () => {
  mockHZDB.reset();

  /* ---- 第 1 步：遗留待归类清单并入客户库 ---- */
  // 模拟旧迁移流程遗留在待归类清单中的矿石贸易商主体
  const legacyPending = [
    { id: 'mp_1', name: '中矿国际贸易有限公司', credit_code: CC_C, contact: '王敏', phone: '13800138000' },
    { id: 'mp_2', name: '', credit_code: '' }   // 无名主体 → 丢弃
  ];
  const adopted = D.adoptPending([], legacyPending);
  assert.equal(adopted.adopted, 1, '无名主体被丢弃，有效主体并入');
  await D.saveStore(adopted.list);   // 待归类清单并入后由前端清空（customersPending 资源并入设计，另测）

  let store = D.loadStore();
  assert.equal(store.length, 1);
  assert.equal(store[0].customer_type, '', '并入时为待归类（无类型）');
  assert.equal(store[0].status, '正常');
  assert.equal(store[0].source, '系统迁移');
  assert.equal(store[0].contact, '王敏');
  assert.ok(store[0].source_refs.length === 0, '无溯源字段时为空数组');
  assert.equal(D.listActive(store).length, 0, '待归类客户不可被业务引用');

  /* ---- 第 2 步：运营端代注册集采贸易商 ---- */
  const op = D.createByOperator(store, {
    customer_type: '集采贸易商', name: '中矿长协国际贸易有限公司',
    credit_code: CC_A, contact: '王敏', phone: '13800138001'
  });
  assert.ok(op.ok);
  await D.saveStore(op.list);
  store = D.loadStore();
  assert.equal(store.length, 2);
  assert.equal(D.listActive(store).length, 1, '仅已归类的代注册客户可引用');

  /* ---- 第 3 步：现货贸易商公开自主注册 ---- */
  const reg = D.createSelfRegistered(store, {
    customer_type: '现货贸易商',
    name: '河北现货贸易有限公司', credit_code: CC_D,
    contact: '赵六', phone: '0311-88886666',
    credentials: [{ id: 'f1', name: '营业执照.pdf', size: 2048, type: 'application/pdf' }]
  });
  assert.ok(reg.ok);
  assert.equal(reg.customer.status, '待审核');
  await D.saveStore(reg.list);
  store = D.loadStore();
  assert.equal(store.length, 3);
  assert.equal(D.listActive(store).length, 1, '待审核客户不进入可引用名单');

  /* ---- 第 4 步：审核流转（驳回必填 → 重提 → 通过） ---- */
  const noReason = D.reviewReject(store, reg.customer.id, '  ');
  assert.equal(noReason.ok, false, '驳回原因必填');

  const rej = D.reviewReject(store, reg.customer.id, '凭证不清晰，请重新上传');
  assert.ok(rej.ok);
  await D.saveStore(rej.list);
  store = D.loadStore();
  assert.equal(store.find(c => c.id === reg.customer.id).status, '已驳回');
  assert.equal(store.find(c => c.id === reg.customer.id).reject_reason, '凭证不清晰，请重新上传');

  const resub = D.resubmit(store, reg.customer.id, { contact: '赵六新', phone: '13900139000' });
  assert.ok(resub.ok);
  await D.saveStore(resub.list);
  store = D.loadStore();
  assert.equal(store.find(c => c.id === reg.customer.id).status, '待审核');
  assert.equal(store.find(c => c.id === reg.customer.id).reject_reason, '', '驳回原因转入操作记录');

  const approve = D.reviewApprove(store, reg.customer.id);
  assert.ok(approve.ok);
  await D.saveStore(approve.list);
  store = D.loadStore();
  const approved = store.find(c => c.id === reg.customer.id);
  assert.equal(approved.status, '正常');
  assert.equal(approved.contact, '赵六新', '重提修改的信息随通过生效');
  assert.ok(D.listActive(store).length === 2, '审核通过后进入可引用名单');

  /* ---- 第 5 步：信息编辑 + 待归类客户归类 ---- */
  const edit = D.updateInfo(store, op.customer.id, { contact: '王敏新', phone: '010-65529988' });
  assert.ok(edit.ok);
  assert.deepEqual(edit.changed, ['联系人', '联系方式']);
  await D.saveStore(edit.list);
  store = D.loadStore();
  assert.equal(store.find(c => c.id === op.customer.id).contact, '王敏新');

  // 待归类主体在管理页直接归类（编辑弹窗设置类型）
  const cls = D.updateInfo(store, adopted.list[0].id, { customer_type: '集采贸易商' }, { role: 'operator' });
  assert.ok(cls.ok, JSON.stringify(cls));
  assert.equal(cls.customer.customer_type, '集采贸易商');
  assert.ok(cls.customer.history.some(h => h.action === '归类确认'));
  await D.saveStore(cls.list);
  store = D.loadStore();
  assert.ok(D.listActive(store).length === 3, '归类确认即生效进入可引用名单');

  /* ---- 第 6 步：停用 → 业务引用隔离 → 启用恢复 ---- */
  const dis = D.setStatus(store, approved.id, '停用');
  assert.ok(dis.ok);
  await D.saveStore(dis.list);
  store = D.loadStore();
  assert.equal(D.listActive(store).length, 2, '停用客户不可被业务引用');

  const en = D.setStatus(store, approved.id, '正常');
  assert.ok(en.ok);
  await D.saveStore(en.list);
  store = D.loadStore();
  assert.equal(D.listActive(store).length, 3, '启用后恢复引用');

  /* ---- 第 7 步：最终一致性 —— 全量字段经基座回环无损 ---- */
  assert.deepEqual(store.map(c => c.name).sort(), [
    '中矿国际贸易有限公司', '中矿长协国际贸易有限公司', '河北现货贸易有限公司'
  ]);
  store.forEach(c => {
    assert.ok(c.id && c.name && typeof c.customer_type === 'string' && c.source && c.status, '关键字段完整：' + c.name);
    assert.ok(Array.isArray(c.history) && c.history.length >= 1, '操作记录完整');
    assert.ok(c.created_at && c.updated_at, '时间戳完整');
  });
});
