/* ============================================================
   系统验证功能 · 启动流水线（验证请求统一入口）
   ------------------------------------------------------------
   用法: node scripts/verify-system.js   （每次执行即一次完整验证请求）

   启动流程（按需求顺序）:
     S0 依赖与配置初始化     —— Node/Docker/容器/数据库连接参数收集，
                                容器未运行时自动拉起并等待就绪
     S1 身份合法性校验       —— 数据库账户与目标库身份、容器镜像、
                                迁移/种子台账版本核对
     S2 数据完整性验证       —— 调用 verify-seeds.js（31 表行数 +
                                8 项外键 + 5 视图连通）
     S3 权限范围核验         —— 当前用户 schema USAGE 与关键表
                                SELECT/INSERT 权限、应用层权限体系现状
     S4 运行环境兼容性检查   —— Node/PG 版本基线 + 全量回归测试
     S5 模块通信链路自检     —— 本地服务器启动/复用 + 关键路由 HTTP
                                探测 + 数据库跨模块关联链路验证

   实时反馈通道: 各阶段启动即打印，子项逐条输出 ✔/⚠/✖ 状态行；
   异常分级: ERROR（阻断就绪，exit 1）/ WARN（降级放行）/ INFO（说明）
   ============================================================ */

'use strict';

const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');

/* ---------------- 配置参数（S0 收集与展示） ---------------- */
const CFG = {
  container: 'hongze-scms-db',
  db:        'HongZe-SCMS',
  user:      'dev',
  host:      'localhost',
  dbPort:    5432,
  appPort:   8000,
  minNode:   18,
  schemas:   ['meta','mine','ocean','port','rail','transfer','wh','fleet','steel','customer','contract','trade','pricing','ops'],
};

/* ---------------- 实时反馈与分级告警 ---------------- */
const alerts = [];            // { level, stage, msg }
function alert(level, stage, msg) { alerts.push({ level, stage, msg }); }
function line(s)   { process.stdout.write(s + '\n'); }
function ok(t)     { line('    ✔ ' + t); }
function warn(stage, t) { line('    ⚠ ' + t); alert('WARN', stage, t); }
function fail(stage, t) { line('    ✖ ' + t); alert('ERROR', stage, t); }
function info(stage, t) { line('    ℹ ' + t); alert('INFO', stage, t); }

/* ---------------- psql 快捷通道（docker exec，数组参数避免 shell 转义） ---------------- */
function psql(sql) {
  const r = spawnSync('docker',
    ['exec', '-i', CFG.container, 'psql', '-U', CFG.user, '-d', CFG.db, '-v', 'ON_ERROR_STOP=1', '-q', '-tA', '-c', sql],
    { encoding: 'utf8', cwd: ROOT });
  if (r.status !== 0) throw new Error('psql 执行失败: ' + String(r.stderr || r.stdout || '').trim());
  return String(r.stdout || '').trim();
}
function psqlOk(sql) { try { psql(sql); return true; } catch { return false; } }

/* ---------------- 阶段定义 ---------------- */
const stageRecords = [];
const STAGES = [
  ['S0', '依赖与配置初始化',     stageInit],
  ['S1', '身份合法性校验',       stageIdentity],
  ['S2', '数据完整性验证',       stageIntegrity],
  ['S3', '权限范围核验',         stagePermission],
  ['S4', '运行环境兼容性检查',   stageCompat],
  ['S5', '模块通信链路自检',     stageSelfcheck],
];

async function stageInit() {
  const nv = Number(process.versions.node.split('.')[0]);
  if (nv >= CFG.minNode) ok(`Node 运行时 ${process.versions.node}（要求 >= ${CFG.minNode}）`);
  else fail('S0', `Node ${process.versions.node} 低于最低要求 ${CFG.minNode}`);

  const dv = spawnSync('docker', ['--version'], { encoding: 'utf8' });
  if (dv.status === 0) ok(`Docker 引擎 ${String(dv.stdout).trim()}`);
  else { fail('S0', 'Docker 引擎不可用'); return; }

  // 容器状态：未运行则自动拉起并等待数据库就绪
  let st = spawnSync('docker', ['inspect', '-f', '{{.State.Status}}', CFG.container], { encoding: 'utf8' }).stdout;
  st = String(st || '').trim();
  if (st !== 'running') {
    line(`    ℹ 容器 ${CFG.container} 状态 ${st || '不存在'}，尝试自动启动...`);
    if (st) spawnSync('docker', ['start', CFG.container]);
    else { fail('S0', '容器不存在，请先执行部署流程创建'); return; }
    let up = false;
    for (let i = 0; i < 20 && !up; i++) {
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 500);
      up = psqlOk('SELECT 1;');
    }
    if (up) ok(`容器 ${CFG.container} 已自动启动并就绪`);
    else { fail('S0', '容器启动后数据库仍未就绪'); return; }
  } else {
    ok(`容器 ${CFG.container} 运行中（持久化卷已挂载）`);
  }

  // 数据库连接参数核对
  const ver = psql('SHOW server_version;');
  ok(`PostgreSQL ${ver} @ ${CFG.host}:${CFG.dbPort}/${CFG.db}（账户 ${CFG.user}）`);
  info('S0', '配置参数: container=' + CFG.container + ', db=' + CFG.db + ', user=' + CFG.user + ', appPort=' + CFG.appPort);
}

async function stageIdentity() {
  const [u, d] = psql('SELECT current_user, current_database();').split('|');
  if (u === CFG.user && d === CFG.db) ok(`数据库身份合法: ${u} @ ${d}`);
  else fail('S1', `数据库身份不匹配: ${u} @ ${d}（期望 ${CFG.user} @ ${CFG.db}）`);

  const img = spawnSync('docker', ['inspect', '-f', '{{.Config.Image}}', CFG.container], { encoding: 'utf8' }).stdout;
  ok(`容器镜像身份: ${String(img || '').trim()}`);

  const mig = psql("SELECT string_agg(version, ',' ORDER BY applied_at) FROM meta.schema_migrations WHERE reverted_at IS NULL;");
  if (mig === 'V001,V002') ok(`迁移台账身份核对通过: ${mig}`);
  else warn('S1', `迁移台账异常: ${mig || '空'}`);

  const seed = psql("SELECT string_agg(version, ',' ORDER BY applied_at) FROM meta.seed_runs;");
  if (seed === 'S001,S002') ok(`种子台账身份核对通过: ${seed}`);
  else warn('S1', `种子台账异常: ${seed || '空'}`);

  const port = psql("SELECT count(*) FROM meta.dict_entry WHERE scope='discharge_ports';");
  if (Number(port) > 0) ok('业务字典可读（discharge_ports ' + port + ' 条）');
  else warn('S1', '业务字典 discharge_ports 为空');
}

async function stageIntegrity() {
  const r = spawnSync(process.execPath, ['scripts/verify-seeds.js'], { encoding: 'utf8', cwd: ROOT, timeout: 120000 });
  if (r.status === 0 && /全部校验通过/.test(r.stdout)) {
    const rows = (r.stdout.match(/OK$/gm) || []).length;
    ok(`数据完整性校验通过（${rows} 项子检查: 31 表行数 / 8 项外键 / 5 视图）`);
  } else {
    fail('S2', '数据完整性校验未通过，详情如下:\n' + String(r.stdout || '').trim().split('\n').filter(l => /FAIL|✖|悬空|不一致/.test(l)).slice(0, 10).join('\n'));
  }
}

async function stagePermission() {
  const su = psql("SELECT rolsuper FROM pg_roles WHERE rolname = current_user;") === 't';
  if (su) {
    ok('数据库账户 ' + CFG.user + ' 为超级用户（本地开发环境全量权限）');
    info('S3', '数据库层权限范围 = 全部 14 个业务 schema 的 DDL/DML');
  } else {
    let denied = [];
    for (const s of CFG.schemas) {
      if (psql(`SELECT has_schema_privilege(current_user, '${s}', 'USAGE');`) !== 't') denied.push(s);
    }
    if (denied.length === 0) ok('14 个业务 schema USAGE 权限全部具备');
    else warn('S3', '缺少 USAGE 权限的 schema: ' + denied.join(','));

    const probes = [
      ['mine.mine_info', 'SELECT'], ['mine.mine_info', 'INSERT'],
      ['ocean.ocean_voyage', 'INSERT'], ['trade.order_ledger', 'INSERT'],
      ['steel.steel_mill', 'UPDATE'], ['meta.dict_entry', 'SELECT'],
    ];
    const noPerm = probes.filter(([t, p]) => psql(`SELECT has_table_privilege(current_user, '${t}', '${p}');`) !== 't');
    if (noPerm.length === 0) ok('录入编辑类关键表 DML 权限抽验通过（6 项）');
    else warn('S3', '缺少表权限: ' + noPerm.map(([t, p]) => `${t}:${p}`).join(', '));
  }
  info('S3', '应用层权限: 登录体系为预留项（TBD-01），当前以平台运营方模拟主体运行（降级模式）');
}

async function stageCompat() {
  ok(`PG 版本基线: ${psql('SHOW server_version_num;')}（目标 PostgreSQL 16 系列）`);
  const r = spawnSync(process.execPath,
    ['--test', 'tests/order-new-data.test.js', 'tests/order-new-flow.test.js', 'tests/customers-data.test.js', 'tests/customers-integration.test.js'],
    { encoding: 'utf8', cwd: ROOT, timeout: 180000 });
  const pass = Number((r.stdout.match(/ℹ pass (\d+)/) || [])[1] || 0);
  const failed = Number((r.stdout.match(/ℹ fail (\d+)/) || [])[1] || 0);
  if (r.status === 0 && failed === 0 && pass > 0) ok(`全量回归测试通过: ${pass}/${pass}（订单模块 + 客户模块）`);
  else fail('S4', `回归测试异常: pass=${pass} fail=${failed} exit=${r.status}`);
}

/* ---------------- S5 通信链路自检 ---------------- */
let serverChild = null;

async function appReady() {
  try {
    const r = await fetch(`http://localhost:${CFG.appPort}/`, { signal: AbortSignal.timeout(2500) });
    const t = await r.text();
    return r.ok && /泓泽宜通|订单/.test(t);
  } catch { return false; }
}

async function ensureServer() {
  if (await appReady()) {
    info('S5', `端口 ${CFG.appPort} 已有本系统服务器实例，复用该实例自检`);
    return true;
  }
  serverChild = spawn(process.execPath, ['server.js'], { cwd: ROOT, stdio: 'ignore' });
  for (let i = 0; i < 25; i++) {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 200);
    if (await appReady()) { ok(`本地服务器已启动 http://localhost:${CFG.appPort}（自检结束自动关闭）`); return true; }
  }
  return false;
}

async function stageSelfcheck() {
  const up = await ensureServer();
  if (!up) { fail('S5', `本地服务器未就绪（端口 ${CFG.appPort}），HTTP 链路自检中止`); return; }

  // HTTP 链路: 页面/数据层/_clean URL/行情代理
  const httpCases = [
    ['/',                                            '默认首屏(新建订单页)'],
    ['/index.html',                                  '系统原首页'],
    ['/business/flow/order-new.html',                '新建订单页'],
    ['/ports/ports',                                 'clean URL(港口管理)'],
    ['/common/hz-data.js',                           '数据层适配器脚本(HZData.use 预留桥)'],
  ];
  for (const [url, name] of httpCases) {
    try {
      const r = await fetch(`http://localhost:${CFG.appPort}${url}`, { signal: AbortSignal.timeout(3000) });
      if (r.ok) ok(`HTTP ${name} ${url} → ${r.status}`);
      else fail('S5', `HTTP ${name} ${url} → ${r.status}`);
    } catch (e) { fail('S5', `HTTP ${name} ${url} → 请求异常: ${e.message}`); }
  }
  try {
    const r = await fetch(`http://localhost:${CFG.appPort}/api/futures?codes=nf_I0`, { signal: AbortSignal.timeout(6000) });
    const js = await r.json();
    if (r.ok && js.ok) ok('HTTP 行情代理 /api/futures → 上游连通');
    else warn('S5', '行情代理响应异常（外部上游依赖，不阻断就绪）');
  } catch { warn('S5', '行情代理不可达（外部上游依赖，不阻断就绪）'); }

  // 数据库链路: 跨模块关联与海运同步
  const linkCases = [
    ['订单台账→航次→矿山 三表关联',
      "SELECT count(*) FROM trade.order_ledger l JOIN ocean.ocean_voyage v ON v.id=l.voyage_id JOIN mine.mine_info m ON m.id=l.mine_id;"],
    ['海运同步视图 台账关联航次记录',
      "SELECT count(*) FROM public.v_ocean_sync_view WHERE sync_rule='ledger_voyage_link';"],
    ['订单跟踪视图行数',
      'SELECT count(*) FROM public.v_order_tracking;'],
  ];
  for (const [name, sql] of linkCases) {
    try {
      const n = Number(psql(sql));
      if (n > 0) ok(`DB ${name} → ${n} 条`);
      else warn('S5', `DB ${name} → 0 条（链路无数据）`);
    } catch (e) { fail('S5', `DB ${name} → ${e.message}`); }
  }
}

/* ---------------- 主流程与就绪报告 ---------------- */

function printReport(skippedFrom) {
  line('\n  ══════════ 系统验证功能就绪状态报告 ══════════');
  line('  阶段   名称                 状态     耗时');
  let hasError = false;
  for (const [id, name] of STAGES) {
    const rec = stageRecords.find(r => r.id === id);
    const stAlerts = alerts.filter(a => a.stage === id);
    let status = rec ? rec.status : (skippedFrom && id >= skippedFrom ? '跳过' : '-');
    if (stAlerts.some(a => a.level === 'ERROR')) { status = '失败'; hasError = true; }
    else if (stAlerts.some(a => a.level === 'WARN')) status = '降级';
    else if (rec && rec.status === '就绪') status = '就绪';
    line(`  ${id}   ${name.padEnd(10, '　')}  ${status.padEnd(4, '　')}  ${rec ? rec.ms + 'ms' : '-'}`);
  }
  line('  ──────────────────────────────────────────────');
  if (alerts.length) {
    line('  告警明细（分级）:');
    const tag = { ERROR: '✖ ERROR', WARN: '⚠ WARN ', INFO: 'ℹ INFO ' };
    for (const a of alerts) line(`    [${a.stage}] ${tag[a.level]}  ${a.msg}`);
  } else line('  告警明细: 无（全程零告警）');
  line('  ──────────────────────────────────────────────');
  if (hasError) {
    line('  结论: ✖ 系统验证功能未就绪（存在 ERROR 级告警），请先处理上方阻断项');
    line('  ══════════════════════════════════════════════');
  } else {
    line('  结论: ✓ 系统验证功能已就绪，可正常接收验证请求');
    line(`  验证请求入口: node scripts/verify-system.js`);
    line('  ══════════════════════════════════════════════');
  }
}

(async function main() {
  line('泓泽宜通 SCMS · 系统验证功能启动流水线');
  line('（S0 依赖初始化 → S1 身份校验 → S2 数据完整性 → S3 权限核验 → S4 环境兼容性 → S5 链路自检）\n');
  let skippedFrom = null;
  for (const [id, name, fn] of STAGES) {
    if (skippedFrom) { line(`[${id}] ${name} —— 因前置阶段失败跳过`); continue; }
    const t0 = Date.now();
    line(`[${id}] ${name} 启动...`);
    try { await fn(); }
    catch (e) { fail(id, '阶段执行异常: ' + e.message); }
    stageRecords.push({ id, name, ms: Date.now() - t0, status: '就绪' });
    if (alerts.some(a => a.stage === id && a.level === 'ERROR')) skippedFrom = id;
  }
  if (serverChild) { try { serverChild.kill(); } catch {} serverChild = null; }
  printReport(skippedFrom);
  process.exit(alerts.some(a => a.level === 'ERROR') ? 1 : 0);
})();
