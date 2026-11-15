/* ============================================================
   种子数据校验（t5/t8 复用）
   对比数据库实际行数与预期清单，并抽验关键关联完整性
   运行: node scripts/verify-seeds.js
   ============================================================ */

'use strict';

const { spawnSync } = require('node:child_process');

function psql(sql) {
  const r = spawnSync('docker', [
    'exec', '-i', 'hongze-scms-db', 'psql',
    '-U', 'dev', '-d', 'HongZe-SCMS',
    '-v', 'ON_ERROR_STOP=1', '-q', '-tA', '-F', '|', '-f', '-',
  ], { input: sql, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(r.stderr || r.stdout);
  return (r.stdout || '').trim();
}

const EXPECT = [
  ['meta.dict_entry', 82],  // 种子 79 条 + 运行期字典（truckDict 2 条、rail_goods 铁矿石 1 条）
  ['mine.mine_info', 5], ['mine.mine_product', 43], ['mine.mine_price_ref', 30], ['mine.mine_partner', 19],
  ['ocean.ocean_voyage', 6], ['ocean.ocean_voyage_sync', 5], ['ocean.ocean_spot', 20],
  ['ocean.ocean_coa', 1], ['ocean.ocean_coa_item', 14],
  ['port.port_info', 2], ['port.port_zone', 12], ['port.port_channel', 4],
  ['rail.rail_supplier', 2], ['rail.rail_contact', 2],
  ['transfer.transfer_station', 3],
  ['wh.wh_supplier', 2], ['wh.wh_stack', 12], ['wh.wh_ore_catalog', 14],
  ['fleet.fleet_info', 2],
  ['steel.steel_mill', 11],
  ['contract.contract', 5], ['contract.contract_template', 1],
  ['ops.trip', 12],
  ['trade.order_ledger', 9], ['trade.order_ledger_trip', 12], ['trade.order_ledger_log', 27],
  ['trade.settlement', 8],
  ['pricing.truck_price_index', 31], ['pricing.rail_price_index', 16], ['pricing.iron_ore_index', 20],
];

// 逐表计数
const counts = new Map();
for (const [table] of EXPECT) {
  const out = psql(`SELECT count(*) FROM ${table};`);
  counts.set(table, Number(out));
}

let fail = 0;
console.log('表名                          预期  实际  结果');
for (const [table, exp] of EXPECT) {
  const got = counts.get(table);
  const ok = got === exp;
  if (!ok) fail++;
  console.log(`${table.padEnd(28)} ${String(exp).padStart(4)}  ${String(got).padStart(4)}  ${ok ? 'OK' : 'MISMATCH'}`);
}

/* ---- 关联完整性抽验 ---- */
console.log('\n关联完整性抽验:');
const checks = [
  ['航次→矿山外键', `SELECT count(*) FROM ocean.ocean_voyage v WHERE v.mine_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM mine.mine_info m WHERE m.id = v.mine_id)`],
  ['台账→合同外键', `SELECT count(*) FROM trade.order_ledger l WHERE l.contract_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM contract.contract c WHERE c.id = l.contract_id)`],
  ['台账→航次外键', `SELECT count(*) FROM trade.order_ledger l WHERE l.voyage_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM ocean.ocean_voyage v WHERE v.id = l.voyage_id)`],
  ['台账→矿山外键', `SELECT count(*) FROM trade.order_ledger l WHERE l.mine_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM mine.mine_info m WHERE m.id = l.mine_id)`],
  ['结算→台账外键', `SELECT count(*) FROM trade.settlement s WHERE s.order_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM trade.order_ledger l WHERE l.id = s.order_id)`],
  ['车次关联→车次表', `SELECT count(*) FROM trade.order_ledger_trip t WHERE NOT EXISTS (SELECT 1 FROM ops.trip x WHERE x.id = t.trip_id)`],
  ['车次关联↔车次单号一致', `SELECT count(*) FROM trade.order_ledger_trip t JOIN ops.trip x ON x.id = t.trip_id JOIN trade.order_ledger l ON l.id = t.ledger_id WHERE x.order_ref IS DISTINCT FROM l.order_code`],
  ['车次→台账外键', `SELECT count(*) FROM ops.trip x WHERE x.order_ref IS NOT NULL AND NOT EXISTS (SELECT 1 FROM trade.order_ledger l WHERE l.order_code = x.order_ref)`],
  ['海运同步→航次', `SELECT count(*) FROM ocean.ocean_voyage_sync s WHERE NOT EXISTS (SELECT 1 FROM ocean.ocean_voyage v WHERE v.id = s.voyage_id)`],
  ['垛位→供应商', `SELECT count(*) FROM wh.wh_stack k WHERE NOT EXISTS (SELECT 1 FROM wh.wh_supplier w WHERE w.id = k.supplier_id)`],
];
for (const [label, sql] of checks) {
  const n = Number(psql(sql + ';'));
  const ok = n === 0;
  if (!ok) fail++;
  console.log(`  ${label.padEnd(14)} 悬空引用 ${n} ${ok ? 'OK' : 'BROKEN'}`);
}

/* ---- 海运同步视图演示数据 ---- */
console.log('\n海运同步视图 v_ocean_sync_view 抽验（前 5 行）:');
console.log(psql(`SELECT voyage_code, vessel_name, source_module, source_ref, sync_rule FROM public.v_ocean_sync_view LIMIT 5;`));

/* ---- 视图可用性 ---- */
console.log('\n5 个展示视图连通性（各取 1 行计数）:');
for (const v of ['public.v_home_kpi', 'public.v_order_tracking', 'public.v_dispatch_analysis', 'public.v_contract_dashboard', 'public.v_ocean_sync_view']) {
  const n = Number(psql(`SELECT count(*) FROM ${v};`));
  console.log(`  ${v.padEnd(28)} ${n} 行`);
}

console.log(fail === 0 ? '\n全部校验通过 ✓' : `\n存在 ${fail} 项不一致 ✗`);
process.exit(fail === 0 ? 0 : 1);
