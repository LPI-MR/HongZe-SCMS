'use strict';
// ===== 矿山产品数据工具单元测试（产品详情板块 · 新增/编辑校验） =====
// 运行：node --test tests/mine-product-data.test.js
const { test } = require('node:test');
const assert = require('node:assert');
const MP = require('../mine/mine-product-data.js');

test('normalizeProduct：字段裁剪、产量数值化与单位兜底', () => {
  const p = MP.normalizeProduct({
    name: '  PB粉 ', category: ' 铁矿石 ', spec: ' TFe 61.5% ', output: '15500',
    unit: '', grade: ' TFe 61.5% ', impurity: ' Al₂O₃ 2.2% ', size: ' -9.5mm 为主 ',
    moisture: ' ≈ 8.5% ', application: ' 烧结 ', desc: ' 旗舰品种 '
  });
  assert.equal(p.name, 'PB粉');
  assert.equal(p.category, '铁矿石');
  assert.equal(p.output, 15500);
  assert.equal(p.unit, '万吨/年');           // 空单位 → 默认万吨/年
  assert.equal(p.grade, 'TFe 61.5%');
  assert.equal(p.impurity, 'Al₂O₃ 2.2%');
  assert.equal(p.desc, '旗舰品种');
  // 结构与 products_ext 种子字段完全一致（兼容新建订单页引用）
  assert.deepEqual(Object.keys(p).sort(),
    ['application', 'category', 'desc', 'grade', 'impurity', 'moisture', 'name', 'output', 'size', 'spec', 'unit']);
});

test('normalizeProduct：空产量/非数产量 → null，合法数字与 0 保留', () => {
  assert.equal(MP.normalizeProduct({ name: 'A', output: '' }).output, null);
  assert.equal(MP.normalizeProduct({ name: 'A', output: 'abc' }).output, null);
  assert.equal(MP.normalizeProduct({ name: 'A' }).output, null);
  assert.equal(MP.normalizeProduct({ name: 'A', output: 0 }).output, 0);
  assert.equal(MP.normalizeProduct({ name: 'A', output: '88.5' }).output, 88.5);
});

test('validateProduct：名称必填 / 超长 / 重名（编辑排除自身）', () => {
  const names = ['PB粉', 'PB块', '杨迪粉'];
  assert.match(MP.validateProduct({ name: '' }, names).message, /请填写产品名称/);
  assert.match(MP.validateProduct({ name: '   ' }, names).message, /请填写产品名称/);
  assert.equal(MP.validateProduct({ name: 'x'.repeat(51) }, names).ok, false);
  assert.match(MP.validateProduct({ name: 'PB粉' }, names).message, /已存在/);
  // 编辑自身：同名但 excludeName 命中 → 不算重名
  assert.equal(MP.validateProduct({ name: 'PB粉', output: '100' }, names, 'PB粉').ok, true);
  assert.equal(MP.validateProduct({ name: '罗布河粉' }, names).ok, true);
});

test('validateProduct：产量数字校验（非数 / 负数 / 超大值 / 合法）', () => {
  assert.match(MP.validateProduct({ name: 'A', output: 'abc' }).message, /产量需为数字/);
  assert.match(MP.validateProduct({ name: 'A', output: '-1' }).message, /产量不能为负数/);
  assert.match(MP.validateProduct({ name: 'A', output: '99999999999' }).message, /产量数值过大/);
  const ok = MP.validateProduct({ name: 'A', output: '8000', unit: '万吨/年' }, []);
  assert.equal(ok.ok, true);
  assert.equal(ok.data.output, 8000);
  // 合法空产量：通过且 data.output 为 null
  const empty = MP.validateProduct({ name: 'A' }, []);
  assert.equal(empty.ok, true);
  assert.equal(empty.data.output, null);
});

test('validateProduct：全空表单仅拦名称，其余字段可为空（自建矿山快速录入）', () => {
  const r = MP.validateProduct({ name: '动力煤' }, []);
  assert.equal(r.ok, true);
  assert.equal(r.data.category, '');
  assert.equal(r.data.unit, '万吨/年');
  assert.equal(r.data.output, null);
});
