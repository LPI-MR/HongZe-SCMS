#!/usr/bin/env node
// ============================================================================
// HongZe-SCMS 数据库迁移执行器（零 npm 依赖，经 docker exec psql 执行）
//
// 用法：
//   node scripts/migrate.js up      # 正向执行所有未应用的迁移
//   node scripts/migrate.js down    # 回滚最近一个已应用的迁移
//   node scripts/migrate.js down V001  # 回滚指定版本
//   node scripts/migrate.js status  # 查看迁移台账状态
//
// 特性：
//   - 版本号统一管理（V001 起编号，文件名 Vxxx__name.sql / down/Vxxx__down.sql）
//   - SHA-256 校验和入台账，变更可追溯
//   - ON_ERROR_STOP=1，任一语句失败即中止
//   - 台账 meta.schema_migrations 记录版本/校验和/执行时间/耗时/回滚时间
// ============================================================================
'use strict';

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const CONTAINER = process.env.SCMS_DB_CONTAINER || 'hongze-scms-db';
const DB = process.env.SCMS_DB_NAME || 'HongZe-SCMS';
const PSQL_USER = process.env.SCMS_DB_USER || 'dev';
const ROOT = path.resolve(__dirname, '..');
const MIG_DIR = path.join(ROOT, 'migrations');
const DOWN_DIR = path.join(MIG_DIR, 'down');

function psql(sql, label) {
  const r = spawnSync('docker', [
    'exec', '-i', CONTAINER, 'psql', '-U', PSQL_USER, '-d', DB,
    '-v', 'ON_ERROR_STOP=1', '-q', '-tA', '-f', '-'
  ], { input: sql, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  if (r.error) throw new Error('无法连接 docker（' + r.error.message + '）');
  if (r.status !== 0) {
    throw new Error((label || 'SQL 执行') + ' 失败:\n' + (r.stderr || r.stdout || ''));
  }
  return r.stdout || '';
}

function checksum(text) {
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex').slice(0, 16);
}

function ensureLedger() {
  psql(`CREATE SCHEMA IF NOT EXISTS meta;
CREATE TABLE IF NOT EXISTS meta.schema_migrations (
  version      text PRIMARY KEY,
  name         text NOT NULL,
  checksum     text NOT NULL,
  applied_at   timestamptz NOT NULL DEFAULT now(),
  duration_ms  integer,
  reverted_at  timestamptz
);`, '初始化迁移台账');
}

function listMigrations() {
  if (!fs.existsSync(MIG_DIR)) return [];
  return fs.readdirSync(MIG_DIR)
    .filter(f => /^V\d+__.+\.sql$/.test(f))
    .sort()
    .map(f => {
      const version = f.split('__')[0];
      const name = f.replace(/^V\d+__/, '').replace(/\.sql$/, '');
      const full = path.join(MIG_DIR, f);
      const down = path.join(DOWN_DIR, version + '__down.sql');
      return { version, name, file: full, downFile: fs.existsSync(down) ? down : null, sql: fs.readFileSync(full, 'utf8') };
    });
}

function appliedRows() {
  const out = psql(
    "SELECT version, checksum, applied_at, duration_ms, COALESCE(reverted_at::text,'') FROM meta.schema_migrations ORDER BY version;",
    '读取台账');
  return out.trim().split('\n').filter(l => l.includes('|')).map(l => {
    const [version, checksum, applied_at, duration_ms, reverted] = l.split('|').map(s => s.trim());
    return { version, checksum, applied_at, duration_ms, reverted };
  });
}

function quote(s) { return s.replace(/'/g, "''"); }

function cmdUp() {
  ensureLedger();
  const done = new Map(appliedRows().filter(r => !r.reverted).map(r => [r.version, r]));
  const mig = listMigrations();
  if (!mig.length) { console.log('未发现迁移文件（migrations/V*.sql）'); return; }
  let n = 0;
  for (const m of mig) {
    if (done.has(m.version)) { console.log(`= ${m.version} ${m.name} 已应用，跳过`); continue; }
    const t0 = Date.now();
    psql(m.sql, `${m.version} ${m.name}`);
    const ms = Date.now() - t0;
    psql(`INSERT INTO meta.schema_migrations (version, name, checksum, duration_ms)
          VALUES ('${quote(m.version)}','${quote(m.name)}','${checksum(m.sql)}',${ms})
          ON CONFLICT (version) DO UPDATE SET
            name=EXCLUDED.name, checksum=EXCLUDED.checksum,
            applied_at=now(), duration_ms=EXCLUDED.duration_ms, reverted_at=NULL;`,
      `登记 ${m.version}`);
    console.log(`+ ${m.version} ${m.name} 执行成功（${ms}ms，校验和 ${checksum(m.sql)}）`);
    n++;
  }
  console.log(n ? `\n共应用 ${n} 个迁移` : '\n所有迁移均已应用');
}

function cmdDown(argVersion) {
  ensureLedger();
  const rows = appliedRows().filter(r => !r.reverted);
  if (!rows.length) { console.log('没有可回滚的迁移'); return; }
  const mig = listMigrations();
  const target = argVersion || rows[rows.length - 1].version;
  const row = rows.find(r => r.version === target);
  if (!row) throw new Error(`版本 ${target} 未在台账中，无法回滚`);
  const m = mig.find(x => x.version === target);
  if (!m || !m.downFile) throw new Error(`未找到 ${target} 的回滚文件（down/${target}__down.sql）`);
  psql(fs.readFileSync(m.downFile, 'utf8'), `${target} 回滚`);
  psql(`UPDATE meta.schema_migrations SET reverted_at = now() WHERE version = '${quote(target)}';`, `登记回滚 ${target}`);
  console.log(`- ${target} 已回滚`);
}

function cmdStatus() {
  ensureLedger();
  const rows = appliedRows();
  const mig = listMigrations();
  console.log('版本     名称            状态      校验和        执行时间            耗时');
  for (const m of mig) {
    const r = rows.find(x => x.version === m.version);
    const st = !r ? '待执行' : (r.reverted ? '已回滚' : '已应用');
    console.log(
      (r ? r.version : m.version).padEnd(9) +
      (r ? r.version === m.version ? m.name : m.name : m.name).padEnd(16) +
      st.padEnd(10) +
      (r ? r.checksum : '-').padEnd(14) +
      (r ? r.applied_at : '-').padEnd(20) +
      (r ? (r.duration_ms || '0') + 'ms' : '-'));
  }
  const extra = rows.filter(r => !mig.some(m => m.version === r.version));
  if (extra.length) console.log('台账中存在但文件缺失的版本: ' + extra.map(r => r.version).join(', '));
}

(function main() {
  const [cmd, ver] = process.argv.slice(2);
  try {
    if (cmd === 'up') cmdUp();
    else if (cmd === 'down') cmdDown(ver);
    else if (cmd === 'status') cmdStatus();
    else {
      console.log('用法: node scripts/migrate.js up | down [Vxxx] | status');
      process.exit(cmd ? 1 : 0);
    }
  } catch (e) {
    console.error('错误: ' + e.message);
    process.exit(1);
  }
})();
