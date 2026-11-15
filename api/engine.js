// ============================================================================
// api/engine.js · 通用资源 CRUD 引擎
//
// 约定（与 gen-seeds.js 种子映射一致）：
// - fields: [前端字段名, 数据库列名, 类型]，类型 ∈
//     t  text        n  numeric      i  integer
//     j  jsonb       d  date         ts timestamptz（前端毫秒时间戳）
//     dts timestamptz（前端格式化字符串 'YYYY-MM-DD HH:mm:ss'，客户模块）
// - payload: true 时前端原始对象整体存 payload jsonb，GET 优先返回 payload
//   （往返零失真）；payload 缺失时回退按 fields 组装。
// - children: 嵌套数组（前端字段 → 子表全删全插重建，sort_no = 数组下标）。
// - replace 策略：'upsert'（主表 upsert + 清理不在提交列表的行，子表全删全插）
//   或 'truncate'（全删全插）。
// ============================================================================

'use strict';

const pad2 = n => String(n).padStart(2, '0');

/** 统一格式化 'YYYY-MM-DD HH:mm:ss'（本地时区，与前端 fmtTime 一致） */
function fmtDateTime(d) {
  return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()) + ' ' +
    pad2(d.getHours()) + ':' + pad2(d.getMinutes()) + ':' + pad2(d.getSeconds());
}

/** 前端值 → 数据库参数 */
function toDb(v, type) {
  switch (type) {
    case 't':
      return v == null ? null : String(v);
    case 'n':
      return (v == null || v === '') ? null : String(v);
    case 'i':
      return (v == null || v === '' ? null : parseInt(v, 10));
    case 'nn':
      return (v == null || v === '') ? null : String(v);   // numeric，空串置 null
    case 'j':
      return v === undefined ? null : JSON.stringify(v);
    case 'd':
      // 防御性切片：前端可能提交 'YYYY-MM-DDTHH:mm'（datetime-local），取日期部分
      if (v == null || v === '') return null;
      return /^\d{4}-\d{2}-\d{2}/.test(String(v)) ? String(v).slice(0, 10) : String(v);
    case 'ts':
    case 'dts':
      return (v == null || v === '') ? null : new Date(v).toISOString();
    default:
      return v;
  }
}

/** 数据库值 → 前端值（pg 默认 numeric 返回字符串，天然保留显示精度） */
function fromDb(v, type) {
  if (v == null) return null;
  switch (type) {
    case 'ts':
      return v instanceof Date ? v.getTime() : new Date(v).getTime();
    case 'dts':
      return v instanceof Date ? fmtDateTime(v) : String(v);
    case 'd': {
      // pg 将 DATE 列解析为「本地时区当日零点」的 Date，直接取本地年月日；
      // 走 toISOString() 会换算成 UTC，东八区下日期会退一天
      if (v instanceof Date) {
        const y = v.getFullYear();
        const m = String(v.getMonth() + 1).padStart(2, '0');
        const d = String(v.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
      }
      return String(v).slice(0, 10);
    }
    case 'j': {
      // pg 驱动已将 jsonb 解析为 JS 值；裸字符串（纯文本）原样返回，
      // 仅对形如对象/数组的字符串尝试二次解析（兼容 text 列存 JSON 串的场景）
      if (typeof v === 'string') {
        const s = v.trim();
        if (s.startsWith('{') || s.startsWith('[')) {
          try { return JSON.parse(s); } catch (_) { return v; }
        }
        return v;
      }
      return v;
    }
    case 'i':
      return Number(v);
    case 'nn':
      return Number(v);   // numeric → Number（前端原本就是数字的场景，如行情/价格指数）
    case 'n':
      return String(v);
    default:
      return v;
  }
}

/** 行对象 → 前端对象（payload 优先，缺失时按 fields 组装） */
function rowToObj(res, row) {
  if (res.payload && row.payload != null) {
    const obj = (typeof row.payload === 'string') ? JSON.parse(row.payload) : row.payload;
    return Object.assign({}, obj);
  }
  const obj = {};
  for (const [js, col, type] of res.fields) {
    obj[js] = fromDb(row[col], type || 't');
  }
  return obj;
}

/** 前端对象 → 数据库参数数组（与 fields 列序一致） */
function objToParams(res, obj) {
  return res.fields.map(([js, , type]) => toDb(obj[js], type || 't'));
}

/**
 * 资源列表查询：主表 + 子表嵌套。
 * q 为查询函数（query 或事务内 client.query）。
 */
async function listResource(q, res) {
  const rows = (await q(`SELECT * FROM ${res.table} ORDER BY ${res.order}`)).rows;
  const list = [];
  for (let i = 0; i < rows.length; i++) {
    list.push(rowToObj(res, rows[i]));
  }

  for (const child of res.children || []) {
    // 子表以 DB 行为准：先按 FK 分组，再整体覆盖父对象数组
    // （不能用 push 叠加——payload 资源的 payload 里可能冻结旧数组，叠加会导致翻倍）
    const grouped = new Map();
    const childRows = (await q(`SELECT * FROM ${child.table} ORDER BY ${child.order}`)).rows;
    for (const crow of childRows) {
      const k = String(crow[child.fk]);
      if (!grouped.has(k)) grouped.set(k, []);
      grouped.get(k).push(child.valueField ? crow[child.valueField] : rowToObj(child, crow));
    }
    for (const obj of list) {
      const arr = grouped.get(String(obj[res.pkCol || 'id']));
      obj[child.js] = arr || [];
    }
  }
  return list;
}

/** 子表行插入（sort_no = 数组下标；payload 可选；valueField 型子表为标量数组） */
async function insertChild(q, child, parentId, item, idx) {
  // valueField 型：item 为标量（如 trip_ids: ['trip1','trip2']）→ 插 (fk, value, sort_no)
  if (child.valueField) {
    const cols = [child.fk, child.valueField];
    const params = [parentId, item];
    if (child.seq) { cols.push('sort_no'); params.push(idx); }
    const phs = params.map((_, i) => `$${i + 1}`);
    await q(
      `INSERT INTO ${child.table} (${cols.join(', ')}) VALUES (${phs.join(', ')})`,
      params);
    return;
  }
  const c = item;
  const cols = child.fields.map(([, col]) => col);
  const params = child.fields.map(([js, , type]) => toDb(c[js], type || 't'));
  const phs = child.fields.map((_, i) => `$${i + 1}`);
  cols.push(child.fk);
  params.push(parentId);
  phs.push(`$${params.length}`);
  if (child.seq) { cols.push('sort_no'); params.push(idx); phs.push(`$${params.length}`); }
  if (child.payload) {
    cols.push('payload');
    params.push(JSON.stringify(c));
    phs.push(`$${params.length}`);
  }
  await q(
    `INSERT INTO ${child.table} (${cols.join(', ')}) VALUES (${phs.join(', ')})`,
    params);
}

/**
 * 全量替换（调用方须已开启事务）。
 * items: 前端对象数组；返回 { count }。
 */
async function replaceResource(q, res, items) {
  if (!Array.isArray(items)) {
    throw Object.assign(new Error('提交内容须为数组'), { status: 400 });
  }
  const pkCol = res.pkCol || 'id';
  // conflict 支持单列字符串或复合列数组（如 contract_material 的 UNIQUE(contract_id, mat_type)）
  const conflict = res.conflict || pkCol;
  const conflictCols = Array.isArray(conflict) ? conflict : [conflict];
  const conflictSql = conflictCols.join(', ');

  if (res.replace === 'truncate') {
    for (const child of res.children || []) await q(`DELETE FROM ${child.table}`);
    await q(`DELETE FROM ${res.table}`);
  } else {
    for (const child of res.children || []) await q(`DELETE FROM ${child.table}`);
    const ids = items.map(it => String(it[res.pkJs || 'id']));
    if (ids.length) {
      const ph = ids.map((_, i) => `$${i + 1}`).join(',');
      await q(`DELETE FROM ${res.table} WHERE ${pkCol} NOT IN (${ph})`, ids);
    } else {
      await q(`DELETE FROM ${res.table}`);
    }
  }

  for (let i = 0; i < items.length; i++) {
    let item = items[i];
    // 资源级归一化钩子：补齐派生列（如 order_code 回退 id）、前端类型映射
    if (res.normalize) {
      item = res.normalize(item, i) || item;
    }
    // 下标注入（数组顺序 → sort_no 列，保证 GET 顺序与提交顺序一致）
    if (res.indexField) item[res.indexField] = i;
    const params = objToParams(res, item);
    const cols = res.fields.map(([, col]) => col);
    const finalParams = [];
    const finalPh = [];
    for (let i = 0; i < params.length; i++) {
      const col = cols[i];
      const isTsDefault = (col === 'created_at' || col === 'updated_at') && params[i] == null;
      if (isTsDefault) finalPh.push('now()');
      else { finalParams.push(params[i]); finalPh.push(`$${finalParams.length}`); }
    }
    if (res.payload) {
      cols.push('payload');
      finalParams.push(JSON.stringify(item));
      finalPh.push(`$${finalParams.length}`);
    }
    const updateSets = [];
    for (let i = 0; i < cols.length; i++) {
      const col = cols[i];
      if (conflictCols.includes(col) || col === 'created_at') continue;
      if (col === 'updated_at' && !finalPh[i].startsWith('$')) { updateSets.push('updated_at = now()'); continue; }
      updateSets.push(`${col} = ${finalPh[i]}`);
    }
    // 仅当表声明了 updated_at 列时才追加自动更新兜底（如 ocean_coa 无该列）
    const hasUpdatedAtCol = res.fields.some(([, col]) => col === 'updated_at');
    if (hasUpdatedAtCol && !updateSets.some(s => s.includes('updated_at'))) updateSets.push('updated_at = now()');

    await q(
      `INSERT INTO ${res.table} (${cols.join(', ')}) VALUES (${finalPh.join(', ')})
       ON CONFLICT (${conflictSql}) DO UPDATE SET ${updateSets.join(', ')}`,
      finalParams);

    for (const child of res.children || []) {
      const arr = item[child.js];
      if (!Array.isArray(arr)) continue;
      for (let i = 0; i < arr.length; i++) {
        await insertChild(q, child, String(item[res.pkJs || 'id']), arr[i], i);
      }
    }
  }
  return { count: items.length };
}

/** 单条删除（主表，子表由外键级联） */
async function deleteRow(q, res, id) {
  const r = await q(
    `DELETE FROM ${res.table} WHERE ${res.pkCol || 'id'} = $1 RETURNING ${res.pkCol || 'id'}`,
    [id]);
  return { deleted: r.rowCount };
}

module.exports = {
  toDb, fromDb, rowToObj, objToParams,
  listResource, replaceResource, deleteRow, fmtDateTime
};
