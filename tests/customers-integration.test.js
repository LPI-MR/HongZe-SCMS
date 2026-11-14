/* ============================================================
   客户管理模块 · 集成测试
   ------------------------------------------------------------
   运行：node --test tests/customers-integration.test.js
   覆盖：
     1. 存量迁移 → 代注册 → 自主注册 → 审核（驳回/重提/通过）
        → 编辑 → 停用/启用 → 待归类确认 全生命周期链路
     2. localStorage 持久化 JSON 存取回环（模拟浏览器环境）
   ============================================================ */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const D = require('../customers/data.js');

/* ---------- 浏览器环境模拟 ---------- */

// 基于内存 Map 的 localStorage 模拟（data.js 通过 typeof localStorage 探测）
function mockStorage() {
  const map = new Map();
  global.localStorage = {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k)
  };
  return map;
}

const CC_A = '91110000MA01ABCD23';
const CC_B = '91130481MA0BBBBB66';
const CC_C = '91130000MA0CCCCC0X';
const CC_D = '91140000MA0DDDDDD4';

function legacyEntity(name, opts) {
  return Object.assign({
    id: 'ent_' + name, name, nameKey: name, creditCode: '',
    roles: [], industries: [], sources: [], source_refs: [],
    profile: {}, attrs: [], status: '已同步', synced_at: 0, sync_batch: 'b1'
  }, opts || {});
}

/* ==================== 1. 存储层 JSON 回环 ==================== */

test('localStorage 回环：saveStore / loadStore 序列化无损', () => {
  mockStorage();
  const created = D.createByOperator([], {
    customer_type: '集采贸易商', name: '回环测试贸易有限公司',
    credit_code: CC_A, contact: '王敏', phone: '13800138001'
  });
  assert.ok(created.ok);
  D.saveStore(created.list);
  const loaded = D.loadStore();
  assert.equal(loaded.length, 1);
  assert.deepEqual(loaded, created.list);          // JSON 序列化后深度相等
  assert.equal(loaded[0].credit_code, CC_A);
  assert.ok(loaded[0].history.length >= 1);
});

test('localStorage 回环：pending / 迁移状态 / 统一库读写', () => {
  mockStorage();
  // pending
  D.savePending([{ id: 'mp_1', name: '待归类贸易商', credit_code: '' }]);
  assert.equal(D.loadPending().length, 1);
  assert.equal(D.loadPending()[0].name, '待归类贸易商');
  // 迁移状态标记
  const state = { done_at: '2026-01-01 00:00:00', batch: 'mig_x', counts: { customers: 1, pending: 1, excluded: 2 } };
  D.saveMigrationState(state);
  assert.deepEqual(D.getMigrationState(), state);
  // 统一库（迁移数据源）
  const unified = { __version: 'v1', list: [legacyEntity('统一库钢铁有限公司', { industries: ['钢铁生产企业'] })] };
  global.localStorage.setItem(D.UNIFIED_KEY, JSON.stringify(unified));
  const read = D.readUnified();
  assert.ok(Array.isArray(read));
  assert.equal(read.length, 1);
  assert.equal(read[0].name, '统一库钢铁有限公司');
});

test('localStorage 回环：损坏 JSON 容错返回空值', () => {
  mockStorage();
  global.localStorage.setItem(D.STORE_KEY, '{not-valid-json');
  assert.deepEqual(D.loadStore(), []);
  global.localStorage.setItem(D.MIGRATION_KEY, 'oops');
  assert.equal(D.getMigrationState(), null);
});

/* ==================== 2. 全生命周期链路 ==================== */

test('全生命周期：迁移 → 代注册 → 自主注册 → 审核 → 编辑 → 停用/启用 → 归类', () => {
  mockStorage();

  /* ---- 第 1 步：存量统一库迁移 ---- */
  // 构造存量库：1 钢铁（下游）+ 1 矿石（待归类）+ 2 资源类（移出）+ 1 与现有库重名
  const entities = [
    legacyEntity('武安钢铁有限公司', {
      creditCode: CC_B, roles: ['付费客户'], industries: ['钢铁生产企业'],
      profile: { '联系人': '李强', '联系电话': '0310-3057777' },
      source_refs: [{ module: 'steel', source_id: 's1' }]
    }),
    legacyEntity('中矿国际贸易有限公司', {
      creditCode: CC_C, roles: ['付费客户'], industries: ['矿石贸易商'],
      profile: { '联系人': '王敏' }
    }),
    legacyEntity('黄骅港务集团有限公司', { roles: ['物流服务商'], industries: ['港口节点'] }),
    legacyEntity('曹妃甸仓储园区管理有限公司', { roles: ['仓储服务商'], industries: ['仓储园区'] }),
    legacyEntity('武安钢铁有限公司', { creditCode: CC_B, industries: ['钢铁生产企业'] })  // 批内重复 → skip
  ];
  const plan = D.migrateUnified(entities, []);
  assert.equal(plan.customers.length, 1, '钢铁企业直接迁入');
  assert.equal(plan.pending.length, 1, '矿石贸易商进入待归类');
  assert.equal(plan.excluded.length, 2, '资源类主体移出');
  assert.equal(plan.skipped.length, 1, '批内重复跳过');

  // 迁移结果落盘
  D.saveStore(plan.customers);
  D.savePending(plan.pending);
  D.saveMigrationState({ done_at: D.fmtTime(new Date()), batch: plan.migrated_batch, counts: { customers: 1, pending: 1, excluded: 2, skipped: 1 } });

  let store = D.loadStore();
  let pending = D.loadPending();
  assert.equal(store.length, 1);
  assert.equal(store[0].customer_type, '下游客户');
  assert.equal(store[0].contact, '李强');
  assert.equal(store[0].phone, '0310-3057777');
  assert.equal(store[0].source_refs.length, 1, '溯源字段保留');
  assert.ok(D.listActive(store).length === 1, '迁入即生效');

  /* ---- 第 2 步：运营端代注册集采贸易商 ---- */
  const op = D.createByOperator(store, {
    customer_type: '集采贸易商', name: '中矿长协国际贸易有限公司',
    credit_code: CC_A, contact: '王敏', phone: '13800138001'
  });
  assert.ok(op.ok);
  D.saveStore(op.list);
  store = D.loadStore();
  assert.equal(store.length, 2);

  /* ---- 第 3 步：现货贸易商公开自主注册 ---- */
  const reg = D.createSelfRegistered(store, {
    name: '河北现货贸易有限公司', credit_code: CC_D,
    contact: '赵六', phone: '0311-88886666',
    credentials: [{ id: 'f1', name: '营业执照.pdf', size: 2048, type: 'application/pdf' }]
  });
  assert.ok(reg.ok);
  assert.equal(reg.customer.status, '待审核');
  D.saveStore(reg.list);
  store = D.loadStore();
  assert.equal(store.length, 3);
  assert.equal(D.listActive(store).length, 2, '待审核客户不进入可引用名单');

  /* ---- 第 4 步：审核流转（驳回必填 → 重提 → 通过） ---- */
  const noReason = D.reviewReject(store, reg.customer.id, '  ');
  assert.equal(noReason.ok, false, '驳回原因必填');

  const rej = D.reviewReject(store, reg.customer.id, '凭证不清晰，请重新上传');
  assert.ok(rej.ok);
  D.saveStore(rej.list);
  store = D.loadStore();
  assert.equal(store.find(c => c.id === reg.customer.id).status, '已驳回');
  assert.equal(store.find(c => c.id === reg.customer.id).reject_reason, '凭证不清晰，请重新上传');

  const resub = D.resubmit(store, reg.customer.id, { contact: '赵六新', phone: '13900139000' });
  assert.ok(resub.ok);
  D.saveStore(resub.list);
  store = D.loadStore();
  assert.equal(store.find(c => c.id === reg.customer.id).status, '待审核');
  assert.equal(store.find(c => c.id === reg.customer.id).reject_reason, '', '驳回原因转入操作记录');

  const approve = D.reviewApprove(store, reg.customer.id);
  assert.ok(approve.ok);
  D.saveStore(approve.list);
  store = D.loadStore();
  const approved = store.find(c => c.id === reg.customer.id);
  assert.equal(approved.status, '正常');
  assert.equal(approved.contact, '赵六新', '重提修改的信息随通过生效');
  assert.ok(D.listActive(store).length === 3, '审核通过后进入可引用名单');

  /* ---- 第 5 步：信息编辑 ---- */
  const edit = D.updateInfo(store, op.customer.id, { contact: '王敏新', phone: '010-65529988' });
  assert.ok(edit.ok);
  assert.deepEqual(edit.changed, ['联系人', '联系方式']);
  D.saveStore(edit.list);
  store = D.loadStore();
  assert.equal(store.find(c => c.id === op.customer.id).contact, '王敏新');

  /* ---- 第 6 步：停用 → 业务引用隔离 → 启用恢复 ---- */
  const dis = D.setStatus(store, approved.id, '停用');
  assert.ok(dis.ok);
  D.saveStore(dis.list);
  store = D.loadStore();
  assert.equal(D.listActive(store).length, 2, '停用客户不可被业务引用');

  const en = D.setStatus(store, approved.id, '正常');
  assert.ok(en.ok);
  D.saveStore(en.list);
  store = D.loadStore();
  assert.equal(D.listActive(store).length, 3, '启用后恢复引用');

  /* ---- 第 7 步：矿石贸易商人工归类 ---- */
  assert.equal(pending.length, 1);
  const cls = D.classifyPending(store, pending, pending[0].id, '集采贸易商');
  assert.ok(cls.ok);
  assert.equal(cls.customer.customer_type, '集采贸易商');
  assert.equal(cls.customer.status, '正常');
  assert.equal(cls.customer.source, '系统迁移');
  assert.equal(cls.pending.length, 0, '归类后从待归类清单移除');
  D.saveStore(cls.list);
  D.savePending(cls.pending);
  store = D.loadStore();
  pending = D.loadPending();
  assert.equal(store.length, 4);
  assert.equal(pending.length, 0);
  assert.ok(D.listActive(store).length === 4, '归类确认即生效');

  /* ---- 第 8 步：最终一致性 —— 全量字段经 JSON 回环无损 ---- */
  assert.deepEqual(store.map(c => c.name).sort(), [
    '中矿长协国际贸易有限公司', '河北现货贸易有限公司', '武安钢铁有限公司'
  ].concat(['中矿国际贸易有限公司']).sort());
  store.forEach(c => {
    assert.ok(c.id && c.name && c.customer_type && c.source && c.status, '关键字段完整：' + c.name);
    assert.ok(Array.isArray(c.history) && c.history.length >= 1, '操作记录完整');
    assert.ok(c.created_at && c.updated_at, '时间戳完整');
  });
});
