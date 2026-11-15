// ============================================================================
// api/db.js · PostgreSQL 连接池（pg 驱动，供 JSON API 使用）
//
// 连接目标与 scripts/migrate.js / scripts/seed.js 保持一致：
//   数据库 HongZe-SCMS（可用环境变量 SCMS_DB_NAME 覆盖），
//   容器 hongze-scms-db 映射 localhost:5432，用户 dev / 密码 dev。
// ============================================================================

'use strict';

const { Pool } = require('pg');

const DB_NAME = process.env.SCMS_DB_NAME || 'HongZe-SCMS';

const pool = new Pool({
  host: process.env.SCMS_DB_HOST || '127.0.0.1',
  port: Number(process.env.SCMS_DB_PORT || 5432),
  user: process.env.SCMS_DB_USER || 'dev',
  password: process.env.SCMS_DB_PASSWORD || 'dev',
  database: DB_NAME,
  max: 8,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 8000
});

pool.on('error', err => {
  console.error('[api/db] 连接池异常:', err.message);
});

/** 参数化查询；返回 { rows, rowCount } */
function query(text, params) {
  return pool.query(text, params);
}

/**
 * 事务执行：fn 接收与 query 同签名的 q（绑定当前客户端），
 * fn 抛错时整体回滚并向上抛出。
 */
async function tx(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const q = (text, params) => client.query(text, params);
    const result = await fn(q);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (_) { /* 忽略回滚失败 */ }
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { query, tx, pool, DB_NAME };
