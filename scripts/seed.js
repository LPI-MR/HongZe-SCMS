/* ============================================================
   HongZe-SCMS 种子数据执行器
   ------------------------------------------------------------
   用法:
     node scripts/seed.js up       执行全部未应用种子（按版本号升序）
     node scripts/seed.js status   查看种子执行状态
     node scripts/seed.js reapply  忽略台账强制重跑（幂等安全）
   说明:
     - 种子版本文件位于 seeds/（S001__*.sql，编号即执行顺序）
     - 校验和（SHA-256 前 16 位）写入 meta.seed_runs，内容变更
       的种子文件会被视为新版本，重复执行被拦截
     - 种子 SQL 本身幂等（ON CONFLICT / DELETE+INSERT），reapply 安全
   ============================================================ */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');

const CONTAINER = 'hongze-scms-db';
const DB = 'HongZe-SCMS';
const USER = 'dev';
const SEEDS_DIR = path.join(__dirname, '..', 'seeds');

const cmd = process.argv[2] || 'up';

function psql(sql) {
  const r = spawnSync('docker', [
    'exec', '-i', CONTAINER, 'psql',
    '-U', USER, '-d', DB,
    '-v', 'ON_ERROR_STOP=1', '-q', '-tA', '-f', '-',
  ], { input: sql, encoding: 'utf8' });
  if (r.error) throw r.error;
  if (r.status !== 0) {
    throw new Error(`psql 执行失败（exit ${r.status}）：\n${r.stderr || r.stdout || '(无输出)'}`);
  }
  return r.stdout || '';
}

function queryOne(sql) {
  const out = psql(sql).trim();
  return out || null;
}

function checksumOf(file) {
  return crypto.createHash('sha256')
    .update(fs.readFileSync(file))
    .digest('hex')
    .slice(0, 16);
}

function listSeedFiles() {
  if (!fs.existsSync(SEEDS_DIR)) return [];
  return fs.readdirSync(SEEDS_DIR)
    .filter(f => f.endsWith('.sql'))
    .sort();
}

function appliedMap() {
  const rows = queryOne(
    "SELECT version || '|' || checksum FROM meta.seed_runs ORDER BY version"
  );
  if (!rows) return new Map();
  const map = new Map();
  rows.split('\n').forEach(line => {
    const [v, c] = line.split('|');
    map.set(v, c);
  });
  return map;
}

function ensureTable() {
  psql(`CREATE TABLE IF NOT EXISTS meta.seed_runs (
    version text PRIMARY KEY,
    name text NOT NULL,
    checksum text NOT NULL,
    applied_at timestamptz NOT NULL DEFAULT now(),
    duration_ms integer
  );`);
}

function run() {
  if (cmd !== 'up' && cmd !== 'status' && cmd !== 'reapply') {
    console.error('用法: node scripts/seed.js [up|status|reapply]');
    process.exit(1);
  }

  const t0 = Date.now();
  ensureTable();

  if (cmd === 'status') {
    const files = listSeedFiles();
    const map = appliedMap();
    console.log('种子状态（数据库 ' + DB + '）');
    files.forEach(f => {
      const version = f.replace(/__.*$/, '');
      const name = f.replace(/\.sql$/, '').replace(/^S\d+__/, '');
      const cs = checksumOf(path.join(SEEDS_DIR, f));
      const done = map.get(version);
      const state = !done ? '未应用'
        : done === cs ? '已应用'
        : '校验和变更(需 reapply)';
      console.log(`  ${version.padEnd(6)} ${name.padEnd(12)} ${state}  ${cs}`);
    });
    return;
  }

  const files = listSeedFiles();
  if (!files.length) {
    console.log('seeds/ 目录下没有种子文件');
    return;
  }

  const map = appliedMap();
  let applied = 0;
  for (const f of files) {
    const version = f.replace(/__.*$/, '');
    const name = f.replace(/\.sql$/, '').replace(/^S\d+__/, '');
    const cs = checksumOf(path.join(SEEDS_DIR, f));
    const prev = map.get(version);

    if (cmd === 'up' && prev === cs) {
      console.log(`= ${version} ${name} 已应用（校验和一致），跳过`);
      continue;
    }
    if (cmd === 'up' && prev && prev !== cs) {
      throw new Error(`${version} 已应用但文件内容变更（${prev} → ${cs}）。种子幂等，可用 reapply 强制重跑。`);
    }

    const sql = fs.readFileSync(path.join(SEEDS_DIR, f), 'utf8');
    const begin = Date.now();
    psql(`BEGIN;\n${sql}\nCOMMIT;`);
    const ms = Date.now() - begin;
    psql(`INSERT INTO meta.seed_runs (version, name, checksum, duration_ms)
      VALUES ('${version}', '${name}', '${cs}', ${ms})
      ON CONFLICT (version) DO UPDATE SET
        checksum = EXCLUDED.checksum, applied_at = now(), duration_ms = EXCLUDED.duration_ms;`);
    applied++;
    console.log(`+ ${version} ${name} 执行成功（${ms}ms，校验和 ${cs}）`);
  }

  if (cmd === 'reapply') {
    console.log(`\n强制重跑完成，共执行 ${files.length} 个种子文件（幂等导入）`);
  } else {
    console.log(`\n完成，本次应用 ${applied} 个种子文件，总耗时 ${Date.now() - t0}ms`);
  }
}

try {
  run();
} catch (e) {
  console.error('[seed 失败] ' + e.message);
  process.exit(1);
}
