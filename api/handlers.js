// ============================================================================
// HongZe-SCMS · 特殊资源处理器
// ----------------------------------------------------------------------------
// 处理无法用「字段映射」表达的资源：
//   - coas        质检证书：payload 整存保真 + EAV 明细同步（ocean_coa_item）
//   - spots       现货报价：PUT 时同步镜像 pricing.iron_ore_index
//   - trips       运输调度：{seq, trips} 形态，seq 存字典 sys/trip_seq
//   - dicts       业务字典：scope 分组存取（meta.dict_entry）
//   - templates   合同模板：content jsonb = 整个模板对象
//   - oreCatalog  仓储矿种目录：字符串数组 ↔ 行
//   - bootstrap   全量启动装载（前端 hz-db 缓存数据源）
// 所有函数均为「事务内」语义：接收已绑定事务的 q，由 router 负责开/提交事务。
// ============================================================================
'use strict';

const db = require('./db');
const engine = require('./engine');
const { RESOURCES, COA_ITEMS } = require('./resources');

/* ---------------- 弱引用外键清洗（对应 V003 ON DELETE SET NULL 语义） ---------------- */

// PUT 全量替换时，若前端仍持有已被删除主数据的引用值，写入会触发 FK 违规。
// 这里统一把失效引用置 null（与 localStorage 时代「删主数据不受引用约束」一致）。
async function nullifyStaleFks(q, items, refs) {
  for (const ref of refs) {
    const vals = [...new Set(items.map(it => it[ref.js]).filter(v => v != null && v !== ''))];
    if (!vals.length) continue;
    const r = await q(
      `SELECT ${ref.col} FROM ${ref.table} WHERE ${ref.col} = ANY($1::text[])`,
      [vals]);
    const valid = new Set(r.rows.map(row => row[ref.col]));
    for (const it of items) {
      if (it[ref.js] != null && it[ref.js] !== '' && !valid.has(it[ref.js])) {
        it[ref.js] = null;
      }
    }
  }
}

/* ---------------- 质检证书（coas）：payload 保真 + EAV 同步 ---------------- */

function coaFromRow(row, items) {
  if (row.payload != null) return row.payload;              // payload 保真优先
  const obj = {                                             // 兜底：列 + EAV 重建
    id: row.id,
    certificate_no: row.certificate_no,
    shipment_no: row.shipment_no,
    vessel_name: row.vessel || '',
    port_of_loading: row.port ? '（' + row.port + '）' : '',
    issue_date: row.issued_date ? String(row.issued_date).slice(0, 10) : '',
  };
  for (const it of items) {
    const hit = COA_ITEMS.find(([, nm]) => nm === it.item_name);
    if (hit) obj[hit[0]] = it.item_value;
  }
  return obj;
}

async function coaList(q) {
  const r = await q('SELECT * FROM ocean.ocean_coa ORDER BY created_at NULLS LAST, id');
  const ir = await q('SELECT * FROM ocean.ocean_coa_item ORDER BY coa_id, sort_no');
  const byCoa = new Map();
  for (const row of ir.rows) {
    if (!byCoa.has(row.coa_id)) byCoa.set(row.coa_id, []);
    byCoa.get(row.coa_id).push(row);
  }
  return r.rows.map(row => coaFromRow(row, byCoa.get(row.id) || []));
}

async function coaReplace(q, items) {
  // 1. 主表 upsert（payload 整存 + 显式列同步）
  await engine.replaceResource(q, RESOURCES.coas, items);
  // 2. EAV 明细全量重建（供 SQL 查询 / 报表视图使用）
  await q('DELETE FROM ocean.ocean_coa_item');
  let sort = 0;
  for (const c of items) {
    for (const [js, name] of COA_ITEMS) {
      const v = c[js];
      if (v == null || v === '') continue;
      await q(
        `INSERT INTO ocean.ocean_coa_item (coa_id, item_name, item_value, sort_no)
         VALUES ($1, $2, $3, $4)`,
        [c.id, name, String(v), sort++]);
    }
  }
  return items;
}

/* ---------------- 现货报价（spots）：同步镜像 iron_ore_index ---------------- */

async function spotsReplace(q, items) {
  await engine.replaceResource(q, RESOURCES.spots, items);
  await engine.replaceResource(q, RESOURCES.ironOre, items);   // 镜像表，同结构
  return items;
}

/* ---------------- 运输调度（trips）：{seq, trips} ---------------- */

async function tripsGet(q) {
  const trips = await engine.listResource(q, RESOURCES.trips);
  const d = await q(
    `SELECT payload FROM meta.dict_entry WHERE scope = 'sys' AND code = 'trip_seq' LIMIT 1`);
  let seq = 0;
  if (d.rows.length && d.rows[0].payload != null) {
    const p = typeof d.rows[0].payload === 'string' ? JSON.parse(d.rows[0].payload) : d.rows[0].payload;
    seq = Number(p && p.value) || 0;
  }
  return { seq, trips };
}

async function tripsPut(q, body) {
  if (!body || typeof body !== 'object' || !Array.isArray(body.trips)) {
    const e = new Error('trips 提交格式应为 {seq, trips[]}'); e.code = 'BAD_FORMAT'; throw e;
  }
  await engine.replaceResource(q, RESOURCES.trips, body.trips);
  const payload = JSON.stringify({ value: Number(body.seq) || 0 });
  await q(
    `INSERT INTO meta.dict_entry (scope, code, label, payload)
     VALUES ('sys', 'trip_seq', '运输调度序号', $1::jsonb)
     ON CONFLICT (scope, code) DO UPDATE SET payload = EXCLUDED.payload`,
    [payload]);
  return { seq: Number(body.seq) || 0, trips: body.trips };
}

/* ---------------- 业务字典（dicts） ---------------- */

const SCOPE_RE = /^[A-Za-z0-9_-]{1,60}$/;

async function dictsGet(q) {
  const r = await q(
    `SELECT scope, code, label, parent_code, sort_no, payload
       FROM meta.dict_entry ORDER BY scope, sort_no, code`);
  const out = {};
  for (const row of r.rows) {
    if (!out[row.scope]) out[row.scope] = [];
    out[row.scope].push({
      code: row.code,
      label: row.label,
      parent_code: row.parent_code || undefined,
      sort_no: row.sort_no,
      payload: row.payload == null ? null
        : (typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload),
    });
  }
  return out;
}

async function dictsPut(q, scope, body) {
  if (!SCOPE_RE.test(String(scope || ''))) {
    const e = new Error('字典 scope 非法（仅限字母数字下划线连字符，≤60 字符）');
    e.code = 'BAD_SCOPE'; throw e;
  }
  if (!Array.isArray(body) || body.some(e2 => !e2 || typeof e2.code !== 'string' || !e2.code)) {
    const e = new Error('字典提交格式应为 [{code, label?, payload?, parent_code?}]');
    e.code = 'BAD_FORMAT'; throw e;
  }
  await q('DELETE FROM meta.dict_entry WHERE scope = $1', [scope]);
  for (let i = 0; i < body.length; i++) {
    const en = body[i];
    await q(
      `INSERT INTO meta.dict_entry (scope, code, label, parent_code, sort_no, payload)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
      [scope, en.code, en.label || en.code, en.parent_code || null, i,
       en.payload == null ? null : JSON.stringify(en.payload)]);
  }
  return body;
}

/* ---------------- 合同模板（templates）：content = 整个模板对象 ---------------- */

async function templatesGet(q) {
  const r = await q('SELECT content FROM contract.contract_template ORDER BY sort_no, id');
  return r.rows.map(row => row.content);
}

async function templatesPut(q, items) {
  if (!Array.isArray(items)) {
    const e = new Error('templates 提交格式应为数组'); e.code = 'BAD_FORMAT'; throw e;
  }
  await q('DELETE FROM contract.contract_template');
  for (let i = 0; i < items.length; i++) {
    const t = items[i];
    if (!t || typeof t.id !== 'string' || !t.id) {
      const e = new Error('合同模板缺少 id'); e.code = 'BAD_FORMAT'; throw e;
    }
    const versions = Array.isArray(t.versions) ? t.versions : [];
    const last = versions.length ? versions[versions.length - 1] : {};
    await q(
      `INSERT INTO contract.contract_template (id, name, type, content, sort_no)
       VALUES ($1, $2, $3, $4::jsonb, $5)`,
      [t.id, last.name || t.name || '', t.category || '', JSON.stringify(t), i]);
  }
  return items;
}

/* ---------------- 仓储矿种目录（oreCatalog）：字符串数组 ↔ 行 ---------------- */

async function oreCatalogGet(q) {
  const r = await q('SELECT ore_name FROM wh.wh_ore_catalog ORDER BY sort_no, ore_name');
  return r.rows.map(row => row.ore_name);
}

async function oreCatalogPut(q, items) {
  if (!Array.isArray(items) || items.some(v => typeof v !== 'string')) {
    const e = new Error('oreCatalog 提交格式应为字符串数组'); e.code = 'BAD_FORMAT'; throw e;
  }
  await q('DELETE FROM wh.wh_ore_catalog');
  for (let i = 0; i < items.length; i++) {
    await q('INSERT INTO wh.wh_ore_catalog (ore_name, sort_no) VALUES ($1, $2)', [items[i], i]);
  }
  return items;
}

/* ---------------- 全量启动装载（bootstrap） ---------------- */

// 一次性返回所有资源当前数据（与各 GET 端点完全一致的形状），
// 前端 hz-db 启动时拉取到内存，之后各数据层同步读缓存。
async function bootstrapGet(q) {
  const out = {};
  out.dicts = await dictsGet(q);
  out.coas = await coaList(q);
  out.trips = await tripsGet(q);
  out.oreCatalog = await oreCatalogGet(q);
  out.templates = await templatesGet(q);
  for (const [name, conf] of Object.entries(RESOURCES)) {
    if (name === 'coas' || name === 'trips' || name === 'oreCatalog' || name === 'templates') continue;
    out[name] = await engine.listResource(q, conf);
  }
  return out;
}

async function health(q) {
  await q('SELECT 1');
  return { ok: true, db: db.DB_NAME };
}

module.exports = {
  nullifyStaleFks,
  coaList, coaReplace,
  spotsReplace,
  tripsGet, tripsPut,
  dictsGet, dictsPut,
  templatesGet, templatesPut,
  oreCatalogGet, oreCatalogPut,
  bootstrapGet,
  health,
};
