/*!
 * ===== 矿山产品数据工具（产品详情板块 · 新增/编辑校验） =====
 * 纯函数模块，无 DOM 依赖：UMD 双端导出（浏览器 window.MineProductData / Node 单元测试）
 * 产品条目结构与 hz_mines.products_ext 保持完全兼容（批次E 新建订单页按此结构引用）：
 *   { name, category, spec, output, unit, grade, impurity, size, moisture, application, desc }
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();          // Node / 单元测试
  } else {
    root.MineProductData = factory();    // 浏览器全局
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // 产量单位选项（与种子数据口径一致：铁矿/煤炭 万吨/年 · 锂 万吨LCE/年 · 贵金属 万盎司/年）
  var UNIT_OPTIONS = ['万吨/年', '万吨LCE/年', '万盎司/年'];
  var DEFAULT_UNIT = '万吨/年';

  // 业务大类建议项（datalist 提示，可自由输入；为空时产品归入「其他产品」分组）
  var CATEGORY_SUGGESTIONS = [
    '铁矿石', '煤炭', '焦煤', '喷吹煤', '冶金煤',
    '铝·锂', '铜', '镍', '锰', '钾盐', '工业矿物'
  ];

  // 单条产品规范化：裁剪空白 + 字段兜底，输出结构与 products_ext 条目完全一致
  // output：空/非法 → null；合法数字（含 0、小数）→ Number
  function normalizeProduct(input) {
    var p = input || {};
    var output = p.output;
    output = (output === '' || output == null) ? null : Number(output);
    if (output != null && isNaN(output)) output = null;
    return {
      name: String(p.name == null ? '' : p.name).trim(),
      category: String(p.category == null ? '' : p.category).trim(),
      spec: String(p.spec == null ? '' : p.spec).trim(),
      output: output,
      unit: String(p.unit == null ? '' : p.unit).trim() || DEFAULT_UNIT,
      grade: String(p.grade == null ? '' : p.grade).trim(),
      impurity: String(p.impurity == null ? '' : p.impurity).trim(),
      size: String(p.size == null ? '' : p.size).trim(),
      moisture: String(p.moisture == null ? '' : p.moisture).trim(),
      application: String(p.application == null ? '' : p.application).trim(),
      desc: String(p.desc == null ? '' : p.desc).trim()
    };
  }

  // 单条产品校验：通过返回 {ok:true, data:规范化产品}，失败返回 {ok:false, message, field}
  // existingNames：该矿山现有产品名列表（重名校验用）
  // excludeName：编辑时排除自身的产品原名称（重名校验跳过自己）
  function validateProduct(input, existingNames, excludeName) {
    var name = String((input && input.name) == null ? '' : input.name).trim();
    if (!name) return { ok: false, message: '请填写产品名称', field: 'name' };
    if (name.length > 50) return { ok: false, message: '产品名称不能超过 50 个字符', field: 'name' };

    var dup = (existingNames || []).some(function (n) {
      return n === name && n !== excludeName;
    });
    if (dup) return { ok: false, message: '产品「' + name + '」已存在，请修改名称', field: 'name' };

    var rawOutput = input ? input.output : null;
    var output = null;
    if (rawOutput !== '' && rawOutput != null) {
      output = Number(rawOutput);
      if (isNaN(output)) return { ok: false, message: '产量需为数字', field: 'output' };
      if (output < 0) return { ok: false, message: '产量不能为负数', field: 'output' };
      if (output > 9999999999) return { ok: false, message: '产量数值过大，请核对', field: 'output' };
    }

    return {
      ok: true,
      data: normalizeProduct(Object.assign({}, input, { name: name, output: output }))
    };
  }

  return {
    UNIT_OPTIONS: UNIT_OPTIONS,
    DEFAULT_UNIT: DEFAULT_UNIT,
    CATEGORY_SUGGESTIONS: CATEGORY_SUGGESTIONS,
    normalizeProduct: normalizeProduct,
    validateProduct: validateProduct
  };
}));
