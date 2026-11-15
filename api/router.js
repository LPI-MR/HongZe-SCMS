// ============================================================================
// HongZe-SCMS · API 路由分发器
// ----------------------------------------------------------------------------
// 路由面（响应封套 {ok:true, data} / {ok:false, error:{message, code}}）：
//   GET    /api/health                     健康检查
//   GET    /api/bootstrap                  全量启动装载（所有资源 + 字典）
//   GET    /api/:res                       列表查询（特殊资源由 handlers 分发）
//   PUT    /api/:res                       全量替换（body = 数组；trips 为 {seq,trips}）
//   DELETE /api/:res/:id                   单条删除（主键 id）
//   GET    /api/dicts                      全部字典（scope 分组）
//   PUT    /api/dicts/:scope               替换某个 scope 的字典条目
// 由 server.js 挂载：urlPath 以 /api/ 开头即进入本模块（静态服务之前）。
// ============================================================================
'use strict';

const db = require('./db');
const engine = require('./engine');
const { RESOURCES } = require('./resources');
const handlers = require('./handlers');

const MAX_BODY = 8 * 1024 * 1024;   // 8MB（合同 PDF dataURL 场景）

function sendJson(res, code, obj) {
  res.statusCode = code;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(obj));
}

function ok(res, data) { sendJson(res, 200, { ok: true, data }); }

function fail(res, status, message, code) {
  sendJson(res, status, { ok: false, error: { message, code: code || 'ERROR' } });
}

// pg 错误 → 业务化错误信息（400）
function pgError(e) {
  const detail = (e.detail || e.message || '').replace(/\n/g, ' ');
  switch (e.code) {
    case '23503': return { status: 400, message: '引用的数据不存在或已被删除：' + detail, code: 'FK_VIOLATION' };
    case '23505': return { status: 400, message: '唯一性冲突（重复的编号/名称/代码）：' + detail, code: 'UNIQUE_VIOLATION' };
    case '23514': return { status: 400, message: '数据校验失败：' + detail, code: 'CHECK_VIOLATION' };
    case '22P02': case '22007': case '22008': return { status: 400, message: '数据格式错误：' + detail, code: 'BAD_VALUE' };
    case '23502': return { status: 400, message: '必填字段缺失：' + detail, code: 'NOT_NULL' };
    default: return null;
  }
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', c => {
      size += c.length;
      if (size > MAX_BODY) { reject(Object.assign(new Error('请求体过大'), { code: 'TOO_LARGE' })); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve(null);
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch (e) { reject(Object.assign(new Error('JSON 解析失败'), { code: 'BAD_JSON' })); }
    });
    req.on('error', reject);
  });
}

// 特殊资源 GET/PUT 分发表
const SPECIAL_GET = {
  coas: handlers.coaList,
  trips: handlers.tripsGet,
  dicts: handlers.dictsGet,
  templates: handlers.templatesGet,
  oreCatalog: handlers.oreCatalogGet,
};

const SPECIAL_PUT = {
  coas: (q, body) => handlers.coaReplace(q, body),
  spots: (q, body) => handlers.spotsReplace(q, body),
  trips: (q, body) => handlers.tripsPut(q, body),
  templates: (q, body) => handlers.templatesPut(q, body),
  oreCatalog: (q, body) => handlers.oreCatalogPut(q, body),
};

async function handleApi(req, res, pathname, search) {
  const method = req.method;
  try {
    const parts = pathname.split('/').filter(Boolean);   // ['api', ...]
    if (parts[0] !== 'api') return fail(res, 404, 'Not Found', 'NOT_FOUND');

    // --- /api/health ---
    if (parts[1] === 'health' && parts.length === 2) {
      if (method !== 'GET') return fail(res, 405, 'Method Not Allowed', 'METHOD');
      return ok(res, await db.tx(handlers.health));
    }

    // --- /api/bootstrap ---
    if (parts[1] === 'bootstrap' && parts.length === 2) {
      if (method !== 'GET') return fail(res, 405, 'Method Not Allowed', 'METHOD');
      return ok(res, await db.tx(handlers.bootstrapGet));
    }

    // --- /api/dicts 与 /api/dicts/:scope ---
    if (parts[1] === 'dicts') {
      if (parts.length === 2) {
        if (method !== 'GET') return fail(res, 405, 'Method Not Allowed', 'METHOD');
        return ok(res, await db.tx(handlers.dictsGet));
      }
      const scope = decodeURIComponent(parts[2]);
      if (method === 'GET') {
        const all = await db.tx(handlers.dictsGet);
        return ok(res, all[scope] || []);
      }
      if (method === 'PUT') {
        const body = await readBody(req);
        return ok(res, await db.tx(q => handlers.dictsPut(q, scope, body)));
      }
      return fail(res, 405, 'Method Not Allowed', 'METHOD');
    }

    // --- 通用资源 /api/:res 与 /api/:res/:id（三段路径仅 DELETE） ---
    const resName = parts[1];
    if (!resName || parts.length > 3) return fail(res, 404, '未知资源: ' + (resName || ''), 'NOT_FOUND');
    if (parts.length === 3 && method !== 'DELETE') return fail(res, 404, '未知资源: ' + pathname, 'NOT_FOUND');
    const conf = RESOURCES[resName];
    const isSpecial = SPECIAL_GET[resName] || SPECIAL_PUT[resName];
    if (!conf && !isSpecial) return fail(res, 404, '未知资源: ' + resName, 'NOT_FOUND');

    if (method === 'GET') {
      const fn = SPECIAL_GET[resName];
      if (fn) return ok(res, await db.tx(q => fn(q)));
      return ok(res, await db.tx(q => engine.listResource(q, conf)));
    }

    if (method === 'PUT') {
      const body = await readBody(req);
      const fn = SPECIAL_PUT[resName];
      if (fn) return ok(res, await db.tx(q => fn(q, body)));
      if (!Array.isArray(body)) return fail(res, 400, '提交格式应为数组（全量替换）', 'BAD_FORMAT');
      return ok(res, await db.tx(async q => {
        if (conf.fkRefs) await handlers.nullifyStaleFks(q, body, conf.fkRefs);
        await engine.replaceResource(q, conf, body);
        return body;
      }));
    }

    if (method === 'DELETE') {
      if (isSpecial || (conf && conf.readOnly)) return fail(res, 405, '该资源不支持单条删除', 'METHOD');
      const id = decodeURIComponent(parts[2] || '');
      if (!id) return fail(res, 400, '缺少主键 id', 'BAD_FORMAT');
      return ok(res, await db.tx(q => engine.deleteRow(q, conf, id)));
    }

    return fail(res, 405, 'Method Not Allowed', 'METHOD');
  } catch (e) {
    if (e.code === 'TOO_LARGE') return fail(res, 413, e.message, e.code);
    if (e.code === 'BAD_JSON') return fail(res, 400, e.message, e.code);
    if (e.code === 'BAD_FORMAT' || e.code === 'BAD_SCOPE') return fail(res, 400, e.message, e.code);
    const pg = pgError(e);
    if (pg) return fail(res, pg.status, pg.message, pg.code);
    console.error('[api] ' + method + ' ' + pathname + ' 失败: ' + (e.stack || e.message));
    return fail(res, 500, '服务器内部错误：' + e.message, 'INTERNAL');
  }
}

module.exports = { handleApi };
