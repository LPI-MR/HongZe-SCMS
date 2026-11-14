/* ============================================================
   种子 SQL 生成器（t5）
   ------------------------------------------------------------
   输入：scripts/_seed_dump.json（dump-seeds.js 产出）
   输出：seeds/S001__base_seed.sql   基础主数据（字典/矿山/海运/港口/
                                     铁路/中转/仓储/车队/钢厂/合同）
         seeds/S002__trade_seed.sql  交易与指数（调度车次/订单台账/结算/
                                     汽运价/火运价/铁矿石指数）
   幂等策略：
     - 有唯一键的主表  → ON CONFLICT ... DO UPDATE（保 id 稳定）
     - 无唯一键的从表  → DELETE 全表 + INSERT（重跑结果一致）
   运行：node scripts/gen-seeds.js
   ============================================================ */

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const dump = JSON.parse(fs.readFileSync(path.join(__dirname, '_seed_dump.json'), 'utf8'));
const S = dump.storage;
const OUT = path.join(__dirname, '..', 'seeds');
fs.mkdirSync(OUT, { recursive: true });

/* ---------------- SQL 字面量辅助 ---------------- */

function q(v) {                       // text 字面量
  if (v === null || v === undefined || v === '') return 'NULL';
  if (typeof v === 'number') return String(v);
  return `'${String(v).replace(/'/g, "''")}'`;
}
function num(v) {                     // numeric 字面量
  if (v === null || v === undefined || v === '') return 'NULL';
  const n = Number(v);
  if (!Number.isFinite(n)) return 'NULL';
  return String(n);
}
function ts(v) {                      // ms → timestamptz；缺省 now()
  if (v === null || v === undefined || v === '') return 'now()';
  return `to_timestamp(${Number(v)} / 1000.0)`;
}
function dt(v) {                      // 'YYYY-MM-DD' → date
  if (v === null || v === undefined || v === '') return 'NULL';
  return `DATE '${String(v).slice(0, 10)}'`;
}
function tsStr(v) {                   // '2026-09-02 10:52' → timestamptz
  if (v === null || v === undefined || v === '') return 'NULL';
  const s = String(v).replace(' ', 'T');
  return `'${s.length === 16 ? s + ':00' : s}'`;
}
function j(v) {                       // jsonb 字面量（dollar-quote 防转义）
  if (v === null || v === undefined) return 'NULL';
  return `$j$${JSON.stringify(v)}$j$::jsonb`;
}
function tonnage(v) {                 // '2.5万吨' → 2.5
  if (v === null || v === undefined || v === '') return 'NULL';
  const n = parseFloat(String(v).replace(/[^\d.]/g, ''));
  return Number.isFinite(n) ? String(n) : 'NULL';
}

const changes = [];  // 记录枚举值等转换，供控制台报告

/* ---------------- S001：基础主数据 ---------------- */

const s1 = [];
s1.push(`-- ============================================================================
-- HongZe-SCMS 种子 S001 · 基础主数据
-- 来源: 系统内置演示数据（localStorage 种子常量，经 scripts/dump-seeds.js 提取）
-- 幂等: 可重复执行（主表 ON CONFLICT DO UPDATE，从表 DELETE+INSERT）
-- 依赖: V001__init_schema.sql 与 V002__seed_registry.sql 已应用
-- 事务: 由 scripts/seed.js 执行器统一包裹 BEGIN/COMMIT，本文件不自带
-- ============================================================================`);

/* ---- 1. meta.dict_entry 业务字典（按 (scope,code) 去重） ---- */
const dictSeen = new Set();
const dictRows = [];
function dict(scope, code, label, sortNo, payload, parentCode) {
  const key = scope + '\u0000' + code;
  if (dictSeen.has(key)) return;
  dictSeen.add(key);
  dictRows.push(`(${q(scope)}, ${q(code)}, ${q(label)}, ${num(sortNo)}, ${j(payload || null)}, ${q(parentCode || null)})`);
}
(dump.dicts.dischargePorts || []).forEach((p, i) => dict('discharge_ports', p.name, p.name, i, { country: p.country }));
(dump.dicts.mineLoadPorts || []).forEach((p, i) => dict('mine_load_ports', `${p.mine}→${p.port}`, p.port, i, p));
(dump.dicts.orderStatus || []).forEach((v, i) => dict('order_status', v, v, i));
(dump.dicts.settleTypes || []).forEach((v, i) => dict('settle_type', v, v, i));
const vsMap = dump.dicts.voyageStatus || {};
Object.keys(vsMap).forEach((code, i) => dict('voyage_status', code, vsMap[code], i));
dict('spot_meta', 'default', '港口现货元信息', 0, dump.dicts.spotMeta);
const WHARF_SEED = ['综合码头', '矿石码头', '煤炭码头', '散货码头', '集装箱码头'];
WHARF_SEED.forEach((w, i) => dict('seed_wharf', w, w, i));
dict('seed_port', '黄骅港', '黄骅港', 0);
const MINE_SEED = [
  { name: '力拓', categories: ['PB粉', '杨迪粉', '罗布河粉'] },
  { name: 'BHP 必和必拓', categories: ['纽曼粉', '麦克粉', '金布巴粉'] },
  { name: '淡水河谷', categories: ['卡粉', '巴混'] },
  { name: 'FMG', categories: ['超特粉', '混合粉'] },
];
MINE_SEED.forEach((m, i) => dict('seed_mine_map', m.name, m.name, i, { categories: m.categories }));
const DEST_SEED = [
  { station: '武安站', yards: [
    { yard: '河北陆港保税物流中心（保税堆场）', steels: ['天铁集团', '普阳钢铁', '冀南钢铁'] },
    { yard: '河北南洋移山物流有限公司', steels: ['新兴铸管', '新金钢铁'] } ] },
  { station: '康城站', yards: [ { yard: '武安保税物流园', steels: ['邯郸钢铁集团', '邯钢新区'] } ] },
  { station: '曹庄镇站', yards: [ { yard: '曹庄镇站物流园', steels: ['河北普阳', '邯郸华信'] } ] },
];
DEST_SEED.forEach((d0, i) => dict('seed_dest_station', d0.station, d0.station, i, { yards: d0.yards }));
['散堆船', '集装箱船'].forEach((t, i) => dict('vessel_type', t, t, i));
const ores = S.hz_warehouse_ores_v1.list || S.hz_warehouse_ores_v1;
ores.forEach((o, i) => dict('wh_ores', o, o, i));
const railIdx = S.hz_rail_price_index;
(railIdx.stations.hot || []).concat(railIdx.stations.ports || [], railIdx.stations.dests || [])
  .forEach((st, i) => dict('rail_stations', st, st, i));
railIdx.goods.all.forEach((g, i) => dict('rail_goods', g, g, i));
const truckIdx = S.hz_truck_price_index;
(truckIdx.places.hot || []).concat(truckIdx.places.ports || [], truckIdx.places.factories || [])
  .forEach((p, i) => dict('truck_places', p, p, i));
truckIdx.goods.all.forEach((g, i) => dict('truck_goods', g, g, i));
dict('sys', 'trip_seq', '调度车次序号', 0, { value: S['hz-scms-trips-v2'].seq });

s1.push(`-- ---- 1. meta.dict_entry（${dictRows.length} 条，17 个域）----`);
s1.push(`INSERT INTO meta.dict_entry (scope, code, label, sort_no, payload, parent_code) VALUES
${dictRows.join(',\n')}
ON CONFLICT (scope, code) DO UPDATE SET
  label = EXCLUDED.label, sort_no = EXCLUDED.sort_no,
  payload = EXCLUDED.payload, parent_code = EXCLUDED.parent_code;`);

/* ---- 2. mine 矿山管理 ---- */
const mines = S.hz_mines;
s1.push(`\n-- ---- 2. mine.mine_info（${mines.length} 家矿山）----`);
s1.push(`INSERT INTO mine.mine_info
  (id, mine_name, short_name, mine_type, main_products, province, city, district, address,
   longitude, latitude, annual_capacity, reserve, ore_grade, operator, contact_person, contact_phone,
   status, commissioned_year, remark, intro, tagline, img_url, hero_url, gallery_urls,
   img_prompt, hero_prompt, img_credit, story, created_at, updated_at)
VALUES
${mines.map(m => `  (${q(m.id)}, ${q(m.mine_name)}, ${q(m.short_name)}, ${q(m.mine_type)}, ${q(m.main_products)},
   ${q(m.province)}, ${q(m.city)}, ${q(m.district)}, ${q(m.address)},
   ${num(m.longitude)}, ${num(m.latitude)}, ${num(m.annual_capacity)}, ${num(m.reserve)}, ${q(m.ore_grade)}, ${q(m.operator)},
   ${q(m.contact_person)}, ${q(m.contact_phone)}, ${q(m.status)}, ${num(m.commissioned_year)},
   ${q(m.remark)}, ${q(m.intro)}, ${q(m.tagline)}, ${q(m.img_url)}, ${q(m.hero_url)}, ${j(m.gallery_urls)},
   ${q(m.img_prompt)}, ${q(m.hero_prompt)}, ${q(m.img_credit)}, ${j(m.story)},
   ${ts(m.created_at)}, ${ts(m.updated_at)})`).join(',\n')}
ON CONFLICT (id) DO UPDATE SET
  mine_name = EXCLUDED.mine_name, short_name = EXCLUDED.short_name, mine_type = EXCLUDED.mine_type,
  main_products = EXCLUDED.main_products, province = EXCLUDED.province, city = EXCLUDED.city,
  district = EXCLUDED.district, address = EXCLUDED.address, longitude = EXCLUDED.longitude,
  latitude = EXCLUDED.latitude, annual_capacity = EXCLUDED.annual_capacity, reserve = EXCLUDED.reserve,
  ore_grade = EXCLUDED.ore_grade, operator = EXCLUDED.operator, contact_person = EXCLUDED.contact_person,
  contact_phone = EXCLUDED.contact_phone, status = EXCLUDED.status, commissioned_year = EXCLUDED.commissioned_year,
  remark = EXCLUDED.remark, intro = EXCLUDED.intro, tagline = EXCLUDED.tagline, img_url = EXCLUDED.img_url,
  hero_url = EXCLUDED.hero_url, gallery_urls = EXCLUDED.gallery_urls, img_prompt = EXCLUDED.img_prompt,
  hero_prompt = EXCLUDED.hero_prompt, img_credit = EXCLUDED.img_credit, story = EXCLUDED.story,
  updated_at = EXCLUDED.updated_at;`);

const prods = mines.flatMap(m => (m.products_ext || []).map((p, i) => ({ m, p, i })));
const priceRefs = mines.flatMap(m => (m.price_refs || []).map((p, i) => ({ m, p, i })));
const partners = mines.flatMap(m => (m.partners || []).map((p, i) => ({ m, p, i })));
s1.push(`\n-- ---- 2.1 mine 从表：产品 ${prods.length} 条 / 价格基准 ${priceRefs.length} 条 / 合作伙伴 ${partners.length} 条 ----`);
s1.push(`DELETE FROM mine.mine_product;\nDELETE FROM mine.mine_price_ref;\nDELETE FROM mine.mine_partner;`);
if (prods.length) {
  s1.push(`INSERT INTO mine.mine_product
  (mine_id, name, category, spec, output, unit, grade, impurity, size, moisture, application, description, sort_no)
VALUES
${prods.map(({ m, p, i }) => `  (${q(m.id)}, ${q(p.name)}, ${q(p.category)}, ${q(p.spec)}, ${q(p.output)}, ${q(p.unit)}, ${q(p.grade)}, ${q(p.impurity)}, ${q(p.size)}, ${q(p.moisture)}, ${q(p.application)}, ${q(p.desc)}, ${i})`).join(',\n')};`);
}
if (priceRefs.length) {
  s1.push(`INSERT INTO mine.mine_price_ref
  (mine_id, name, tag, product, value, unit, delta, direction, updated, source, sort_no)
VALUES
${priceRefs.map(({ m, p, i }) => `  (${q(m.id)}, ${q(p.name)}, ${q(p.tag)}, ${q(p.product)}, ${num(p.value)}, ${q(p.unit)}, ${q(p.delta)}, ${q(p.direction)}, ${q(p.updated)}, ${q(p.source)}, ${i})`).join(',\n')};`);
}
if (partners.length) {
  s1.push(`INSERT INTO mine.mine_partner
  (mine_id, name, type, scale, scale_value, period, status, remark, sort_no)
VALUES
${partners.map(({ m, p, i }) => `  (${q(m.id)}, ${q(p.name)}, ${q(p.type)}, ${q(p.scale)}, ${q(p.scale_value)}, ${q(p.period)}, ${q(p.status)}, ${q(p.remark)}, ${i})`).join(',\n')};`);
}

/* ---- 3. ocean 海运管理 ---- */
const voyages = S.hz_ocean_voyages;
s1.push(`\n-- ---- 3. ocean.ocean_voyage（${voyages.length} 条航次，mine_id 关联矿山主数据）----`);
s1.push(`INSERT INTO ocean.ocean_voyage
  (id, voyage_code, vessel_name, mine_id, mine_name, load_port, load_country, discharge_port, discharge_country,
   cargo_type, quantity, freight_rate, freight_total, sail_date, eta_date, status, remark, created_by, created_at, updated_at)
VALUES
${voyages.map(v => `  (${q(v.id)}, ${q(v.voyage_code)}, ${q(v.vessel_name)}, ${q(v.mine_id)}, ${q(v.mine_name)},
   ${q(v.load_port)}, ${q(v.load_country)}, ${q(v.discharge_port)}, ${q(v.discharge_country)},
   ${q(v.cargo_type)}, ${num(v.quantity)}, ${num(v.freight_rate)}, ${num(v.freight_total)},
   ${dt(v.sail_date)}, ${dt(v.eta_date)}, ${q(v.status)}, ${q(v.remark)}, ${q(v.created_by)},
   ${ts(v.created_at)}, ${ts(v.updated_at)})`).join(',\n')}
ON CONFLICT (voyage_code) DO UPDATE SET
  vessel_name = EXCLUDED.vessel_name, mine_id = EXCLUDED.mine_id, mine_name = EXCLUDED.mine_name,
  load_port = EXCLUDED.load_port, load_country = EXCLUDED.load_country,
  discharge_port = EXCLUDED.discharge_port, discharge_country = EXCLUDED.discharge_country,
  cargo_type = EXCLUDED.cargo_type, quantity = EXCLUDED.quantity, freight_rate = EXCLUDED.freight_rate,
  freight_total = EXCLUDED.freight_total, sail_date = EXCLUDED.sail_date, eta_date = EXCLUDED.eta_date,
  status = EXCLUDED.status, remark = EXCLUDED.remark, updated_at = EXCLUDED.updated_at;`);

// 同步映射演示：台账订单关联的航次记录 ledger_voyage_link，手工航次记录 manual_entry
const ledgerRaw = S.hz_orders.list || S.hz_orders;
const syncRows = [];
ledgerRaw.filter(o => o.voyage_id).forEach(o => {
  syncRows.push(`((SELECT id FROM ocean.ocean_voyage WHERE id = ${q(o.voyage_id)}), 'order_ledger', ${q(o.id)}, ${q(o.order_code)}, 'ledger_voyage_link')`);
});
syncRows.push(`((SELECT id FROM ocean.ocean_voyage WHERE voyage_code = 'S-006'), 'manual', NULL, '手工录入演示航次', 'manual_entry')`);
s1.push(`\n-- ---- 3.1 ocean.ocean_voyage_sync（${syncRows.length} 条同步映射演示）----`);
s1.push(`DELETE FROM ocean.ocean_voyage_sync;`);
s1.push(`INSERT INTO ocean.ocean_voyage_sync (voyage_id, source_module, source_id, source_ref, sync_rule)
VALUES
${syncRows.join(',\n')};`);

const spots = S.hz_ocean_spots.list || S.hz_ocean_spots;
s1.push(`\n-- ---- 3.2 ocean.ocean_spot（${spots.length} 条港口现货）+ pricing.iron_ore_index（同源镜像）----`);
s1.push(`DELETE FROM ocean.ocean_spot;`);
s1.push(`INSERT INTO ocean.ocean_spot
  (no, port, variety, fe, sio2, al2o3, p, s, mn, moisture, vessel, berth, data_date, data_source)
VALUES
${spots.map((r, i) => `  (${num(r.no)}, ${q(r.port)}, ${q(r.variety)}, ${num(r.fe)}, ${num(r.sio2)}, ${num(r.al2o3)}, ${num(r.p)}, ${num(r.s)}, ${num(r.mn)}, ${num(r.moisture)}, ${q(r.vessel)}, ${q(r.berth)}, ${dt(r.data_date)}, ${q(r.source)})`).join(',\n')};`);
s1.push(`DELETE FROM pricing.iron_ore_index;`);
s1.push(`INSERT INTO pricing.iron_ore_index
  (no, port, variety, fe, sio2, al2o3, p, s, mn, moisture, vessel, berth, data_date, data_source)
VALUES
${spots.map((r, i) => `  (${num(r.no)}, ${q(r.port)}, ${q(r.variety)}, ${num(r.fe)}, ${num(r.sio2)}, ${num(r.al2o3)}, ${num(r.p)}, ${num(r.s)}, ${num(r.mn)}, ${num(r.moisture)}, ${q(r.vessel)}, ${q(r.berth)}, ${dt(r.data_date)}, ${q(r.source)})`).join(',\n')};`);

const coas = S.hz_ocean_coas;
const coaItems = [];
function coaItem(coaId, name, value, sortNo) {
  coaItems.push(`(${q(coaId)}, ${q(name)}, ${q(value)}, ${sortNo})`);
}
s1.push(`\n-- ---- 3.3 ocean.ocean_coa（${coas.length} 条质检证书）+ 检验项 ----`);
s1.push(`DELETE FROM ocean.ocean_coa_item;\nDELETE FROM ocean.ocean_coa;`);
s1.push(`INSERT INTO ocean.ocean_coa
  (id, certificate_no, shipment_no, vessel, mine, port, issued_date)
VALUES
${coas.map(c => {
  const portMatch = String(c.port_of_loading || '').match(/（(.+?)）/);
  return `  (${q(c.id)}, ${q(c.certificate_no)}, ${q(c.shipment_no)}, ${q(c.vessel_name)}, NULL, ${q(portMatch ? portMatch[1] : null)}, ${dt(c.issue_date)})`;
}).join(',\n')}
ON CONFLICT (id) DO NOTHING;`);
coas.forEach(c => {
  coaItem(c.id, '原产地', c.country_of_origin, 0);
  coaItem(c.id, '提单日期', c.bl_date, 1);
  coaItem(c.id, '货物名称', c.goods, 2);
  coaItem(c.id, '湿吨', c.wet_tons, 3);
  coaItem(c.id, '干吨', c.dry_tons, 4);
  coaItem(c.id, '水分 %', c.moisture, 5);
  coaItem(c.id, '+63mm 物理 %', c.physical_63mm, 6);
  coaItem(c.id, 'Fe %', c.fe, 7);
  coaItem(c.id, 'P %', c.p, 8);
  coaItem(c.id, 'S %', c.s, 9);
  coaItem(c.id, 'SiO2 %', c.sio2, 10);
  coaItem(c.id, 'Al2O3 %', c.al2o3, 11);
  coaItem(c.id, '烧失量 LOI %', c.loi, 12);
  coaItem(c.id, '备注', c.remark, 13);
});
s1.push(`INSERT INTO ocean.ocean_coa_item (coa_id, item_name, item_value, sort_no)
VALUES
${coaItems.join(',\n')};`);

/* ---- 4. port 港口管理 ---- */
const ports = S.hz_ports_data.list || S.hz_ports_data;
s1.push(`\n-- ---- 4. port.port_info（${ports.length} 家港口）+ 港区/集疏运通道 ----`);
s1.push(`INSERT INTO port.port_info (id, name, subtitle, photo, intro, metrics, basic_info, capacity, sort_no)
VALUES
${ports.map((p, i) => `  (${q(p.id)}, ${q(p.name)}, ${q(p.subtitle)}, ${q(p.photo)}, ${q(p.intro)}, ${j(p.metrics)}, ${j(p.basicInfo)}, ${j(p.capacity)}, ${i})`).join(',\n')}
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name, subtitle = EXCLUDED.subtitle, photo = EXCLUDED.photo, intro = EXCLUDED.intro,
  metrics = EXCLUDED.metrics, basic_info = EXCLUDED.basic_info, capacity = EXCLUDED.capacity,
  updated_at = now();`);
const zones = ports.flatMap((p, pi) => (p.zones || []).map((z, i) => ({ p, z, sortNo: pi * 10 + i })));
const channels = ports.flatMap((p, pi) => (p.channels || []).map((c, i) => ({ p, c, sortNo: pi * 10 + i })));
s1.push(`DELETE FROM port.port_zone;\nDELETE FROM port.port_channel;`);
if (zones.length) {
  s1.push(`INSERT INTO port.port_zone (port_id, name, location, positioning, facilities, sort_no)
VALUES
${zones.map(({ p, z, sortNo }) => `  (${q(p.id)}, ${q(z.name)}, ${q(z.location)}, ${q(z.positioning)}, ${j(z.facilities)}, ${sortNo})`).join(',\n')};`);
}
if (channels.length) {
  s1.push(`INSERT INTO port.port_channel (port_id, channel, route, via, cost, sort_no)
VALUES
${channels.map(({ p, c, sortNo }) => `  (${q(p.id)}, ${q(c.channel)}, ${q(c.route)}, ${q(c.via)}, ${q(c.cost)}, ${sortNo})`).join(',\n')};`);
}

/* ---- 5. rail 铁路供应商 ---- */
const rails = S.hz_railway_suppliers.list || S.hz_railway_suppliers;
s1.push(`\n-- ---- 5. rail.rail_supplier（${rails.length} 家）+ 联系人 ----`);
s1.push(`INSERT INTO rail.rail_supplier (id, name, short_name, site, facts, intro, fees, sort_no)
VALUES
${rails.map((r, i) => `  (${q(r.id)}, ${q(r.name)}, ${q(r.shortName)}, ${q(r.site)}, ${j(r.facts)}, ${j(r.intro)}, ${j(r.fees)}, ${i})`).join(',\n')}
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name, short_name = EXCLUDED.short_name, site = EXCLUDED.site,
  facts = EXCLUDED.facts, intro = EXCLUDED.intro, fees = EXCLUDED.fees, updated_at = now();`);
const railContacts = rails.flatMap(r => (r.persons || []).map((p, i) => ({ r, p, i })));
s1.push(`DELETE FROM rail.rail_contact;`);
if (railContacts.length) {
  s1.push(`INSERT INTO rail.rail_contact (supplier_id, name, role, tel, sort_no)
VALUES
${railContacts.map(({ r, p, i }) => `  (${q(r.id)}, ${q(p.name)}, ${q(p.role)}, ${q(p.tel)}, ${i})`).join(',\n')};`);
}

/* ---- 6. transfer 中转站点 ---- */
const tss = S.hz_transfer_stations.list || S.hz_transfer_stations;
s1.push(`\n-- ---- 6. transfer.transfer_station（${tss.length} 个站点）----`);
s1.push(`INSERT INTO transfer.transfer_station
  (id, name, subtitle, photo, intro, metrics, basic_info, station_intro, scale, sort_no)
VALUES
${tss.map((t, i) => `  (${q(t.id)}, ${q(t.name)}, ${q(t.subtitle)}, ${q(t.photo)}, ${q(t.intro)}, ${j(t.metrics)}, ${j(t.basicInfo)}, ${q(t.stationIntro)}, ${q(t.scale)}, ${i})`).join(',\n')}
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name, subtitle = EXCLUDED.subtitle, photo = EXCLUDED.photo, intro = EXCLUDED.intro,
  metrics = EXCLUDED.metrics, basic_info = EXCLUDED.basic_info, station_intro = EXCLUDED.station_intro,
  scale = EXCLUDED.scale, updated_at = now();`);

/* ---- 7. wh 仓储管理 ---- */
const whs = S.hz_warehouse_suppliers_v1.list || S.hz_warehouse_suppliers_v1;
const stacks = whs.flatMap(w => (w.stacks || []).map((st, i) => ({ w, st, i })));
s1.push(`\n-- ---- 7. wh.wh_supplier（${whs.length} 家）+ 垛位 ${stacks.length} 个 + 矿种目录 ${ores.length} 种 ----`);
s1.push(`INSERT INTO wh.wh_supplier
  (id, name, type, contact, phone, address, throughput, storage, area, intro, facilities, remark, created_at)
VALUES
${whs.map(w => `  (${q(w.id)}, ${q(w.name)}, ${q(w.type)}, ${q(w.contact)}, ${q(w.phone)}, ${q(w.address)},
   ${q(w.throughput)}, ${q(w.storage)}, ${q(w.area)}, ${q(w.intro)}, ${j(w.facilities)}, ${q(w.remark)}, ${ts(w.createdAt)})`).join(',\n')}
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name, type = EXCLUDED.type, contact = EXCLUDED.contact, phone = EXCLUDED.phone,
  address = EXCLUDED.address, throughput = EXCLUDED.throughput, storage = EXCLUDED.storage,
  area = EXCLUDED.area, intro = EXCLUDED.intro, facilities = EXCLUDED.facilities, remark = EXCLUDED.remark;`);
s1.push(`DELETE FROM wh.wh_stack;`);
if (stacks.length) {
  s1.push(`INSERT INTO wh.wh_stack (supplier_id, name, ore, tonnage, note, sort_no)
VALUES
${stacks.map(({ w, st, i }) => `  (${q(w.id)}, ${q(st.name)}, ${q(st.ore)}, ${tonnage(st.tonnage)}, ${q(st.note)}, ${i})`).join(',\n')};`);
}
s1.push(`INSERT INTO wh.wh_ore_catalog (ore_name, sort_no) VALUES
${ores.map((o, i) => `  (${q(o)}, ${i})`).join(',\n')}
ON CONFLICT (ore_name) DO UPDATE SET sort_no = EXCLUDED.sort_no;`);

/* ---- 8. fleet 汽运车队 ---- */
const fleets = S.hzwl_fleets_v2;
const fleetTypeMap = { '自营车队': '自营', '合作车队': '合作', '外协车队': '外协' };
s1.push(`\n-- ---- 8. fleet.fleet_info（${fleets.length} 家车队）----`);
s1.push(`INSERT INTO fleet.fleet_info
  (id, name, type, contact, phone, address, capacity, fleet_size, min_guarantee, max_capacity, remark, created_at)
VALUES
${fleets.map(f => {
  let type = f.type;
  if (type && fleetTypeMap[type]) { changes.push(`fleet.type "${type}" → "${fleetTypeMap[type]}"（CHECK 枚举归一）`); type = fleetTypeMap[type]; }
  return `  (${q(f.id)}, ${q(f.name)}, ${q(type)}, ${q(f.contact)}, ${q(f.phone)}, ${q(f.address)}, ${q(f.capacity)}, ${q(f.fleetSize)}, ${q(f.minGuarantee)}, ${q(f.maxCapacity)}, ${q(f.remark)}, ${ts(f.createdAt)})`;
}).join(',\n')}
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name, type = EXCLUDED.type, contact = EXCLUDED.contact, phone = EXCLUDED.phone,
  address = EXCLUDED.address, capacity = EXCLUDED.capacity, fleet_size = EXCLUDED.fleet_size,
  min_guarantee = EXCLUDED.min_guarantee, max_capacity = EXCLUDED.max_capacity, remark = EXCLUDED.remark;`);

/* ---- 9. steel 钢厂管理 ---- */
const steels = S.hzwl_steels_v2;
s1.push(`\n-- ---- 9. steel.steel_mill（${steels.length} 家钢厂）----`);
s1.push(`INSERT INTO steel.steel_mill
  (id, name, type, contact, phone, address, capacity, ore_demand, nature, founded, reg_time, reg_capital, reg_address, products, intro, remark, created_at)
VALUES
${steels.map(st => `  (${q(st.id)}, ${q(st.name)}, ${q(st.type)}, ${q(st.contact)}, ${q(st.phone)}, ${q(st.address)},
   ${q(st.capacity)}, ${q(st.oreDemand)}, ${q(st.nature)}, ${q(st.founded)}, ${q(st.regTime)}, ${q(st.regCapital)},
   ${q(st.regAddress)}, ${q(st.products)}, ${q(st.intro)}, ${q(st.remark)}, ${ts(st.createdAt)})`).join(',\n')}
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name, type = EXCLUDED.type, contact = EXCLUDED.contact, phone = EXCLUDED.phone,
  address = EXCLUDED.address, capacity = EXCLUDED.capacity, ore_demand = EXCLUDED.ore_demand,
  nature = EXCLUDED.nature, founded = EXCLUDED.founded, reg_time = EXCLUDED.reg_time,
  reg_capital = EXCLUDED.reg_capital, reg_address = EXCLUDED.reg_address, products = EXCLUDED.products,
  intro = EXCLUDED.intro, remark = EXCLUDED.remark;`);

/* ---- 10. contract 合同管理 ---- */
const contracts = dump.direct.contracts || [];
const templates = dump.direct.templates || [];
s1.push(`\n-- ---- 10. contract.contract（${contracts.length} 份）+ 模板 ${templates.length} 类 ----`);
s1.push(`INSERT INTO contract.contract
  (id, code, name, type, party_a, party_b, party_c, amount, received, paid, quantity, executed, sign_date, end_date, status)
VALUES
${contracts.map(c => `  (${q(c.id)}, ${q(c.code)}, ${q(c.name)}, ${q(c.type)}, ${q(c.partyA)}, ${q(c.partyB)}, ${q(c.partyC)},
   ${num(c.amount)}, ${num(c.received)}, ${num(c.paid)}, ${num(c.quantity)}, ${num(c.executed)},
   ${dt(c.signDate)}, ${dt(c.endDate)}, ${q(c.status)})`).join(',\n')}
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name, type = EXCLUDED.type, party_a = EXCLUDED.party_a, party_b = EXCLUDED.party_b,
  party_c = EXCLUDED.party_c, amount = EXCLUDED.amount, received = EXCLUDED.received, paid = EXCLUDED.paid,
  quantity = EXCLUDED.quantity, executed = EXCLUDED.executed, sign_date = EXCLUDED.sign_date,
  end_date = EXCLUDED.end_date, status = EXCLUDED.status, updated_at = now();`);
s1.push(`INSERT INTO contract.contract_template (id, name, type, content, sort_no)
VALUES
${templates.map((t, i) => `  (${q(t.id)}, ${q(t.versions[t.versions.length - 1].name)}, ${q(t.category)}, ${j(t)}, ${i})`).join(',\n')}
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name, type = EXCLUDED.type, content = EXCLUDED.content, updated_at = now();`);

/* ---------------- S002：交易与指数 ---------------- */

const s2 = [];
s2.push(`-- ============================================================================
-- HongZe-SCMS 种子 S002 · 交易与指数数据
-- 来源: 系统内置演示数据（订单台账/结算/日志/调度车次/价格指数）
-- 幂等: 可重复执行（台账/结算/车次 ON CONFLICT DO UPDATE，日志/指数 DELETE+INSERT）
-- 依赖: S001__base_seed.sql 已应用（合同/矿山/航次/车次外键）
-- 事务: 由 scripts/seed.js 执行器统一包裹 BEGIN/COMMIT，本文件不自带
-- ============================================================================`);

/* ---- 1. ops.trip 调度车次 ---- */
const tripsState = S['hz-scms-trips-v2'];
const trips = tripsState.trips || [];
s2.push(`-- ---- 1. ops.trip（${trips.length} 车次，全局序号 seq=${tripsState.seq} 存 meta.dict_entry sys/trip_seq）----`);
s2.push(`INSERT INTO ops.trip
  (id, mode, from_station, to_station, cargo, tons, node_index, depart_time, order_ref, actual_tons)
VALUES
${trips.map(t => `  (${q(t.id)}, ${q(t.mode)}, ${q(t.from)}, ${q(t.to)}, ${q(t.cargo)}, ${num(t.tons)}, ${num(t.nodeIndex)}, ${q(t.time ? new Date(t.time).toISOString() : null)}, ${q(t.orderId)}, ${num(t.actualTons)})`).join(',\n')}
ON CONFLICT (id) DO UPDATE SET
  mode = EXCLUDED.mode, from_station = EXCLUDED.from_station, to_station = EXCLUDED.to_station,
  cargo = EXCLUDED.cargo, tons = EXCLUDED.tons, node_index = EXCLUDED.node_index,
  depart_time = EXCLUDED.depart_time, order_ref = EXCLUDED.order_ref, actual_tons = EXCLUDED.actual_tons;`);

/* ---- 2. trade.order_ledger 订单台账 ---- */
s2.push(`\n-- ---- 2. trade.order_ledger（${ledgerRaw.length} 单，含 contract/mine/voyage 外键关联）----`);
s2.push(`INSERT INTO trade.order_ledger
  (id, order_code, contract_id, contract_code, mine_id, mine_name, voyage_id, customer,
   cargo_name, cargo_qty, amount, sign_date, plan_end_date, status, remark, created_by, created_at, updated_at)
VALUES
${ledgerRaw.map(o => `  (${q(o.id)}, ${q(o.order_code)}, ${q(o.contract_id)}, ${q(o.contract_code)}, ${q(o.mine_id)}, ${q(o.mine_name)}, ${q(o.voyage_id)}, ${q(o.customer)},
   ${q(o.cargo_name)}, ${num(o.cargo_qty)}, ${num(o.amount)}, ${dt(o.sign_date)}, ${dt(o.plan_end_date)}, ${q(o.status)},
   ${q(o.remark)}, ${q(o.created_by)}, ${ts(o.created_at)}, ${ts(o.updated_at)})`).join(',\n')}
ON CONFLICT (order_code) DO UPDATE SET
  contract_id = EXCLUDED.contract_id, contract_code = EXCLUDED.contract_code,
  mine_id = EXCLUDED.mine_id, mine_name = EXCLUDED.mine_name, voyage_id = EXCLUDED.voyage_id,
  customer = EXCLUDED.customer, cargo_name = EXCLUDED.cargo_name, cargo_qty = EXCLUDED.cargo_qty,
  amount = EXCLUDED.amount, sign_date = EXCLUDED.sign_date, plan_end_date = EXCLUDED.plan_end_date,
  status = EXCLUDED.status, remark = EXCLUDED.remark, updated_at = EXCLUDED.updated_at;`);

/* ---- 2.1 订单-车次关联 ---- */
const ledgerTrips = ledgerRaw.flatMap(o => (o.trip_ids || []).map(tid => ({ o, tid })));
s2.push(`\n-- ---- 2.1 trade.order_ledger_trip（${ledgerTrips.length} 条订单-车次关联）----`);
s2.push(`DELETE FROM trade.order_ledger_trip;`);
if (ledgerTrips.length) {
  s2.push(`INSERT INTO trade.order_ledger_trip (ledger_id, trip_id)
VALUES
${ledgerTrips.map(({ o, tid }) => `  (${q(o.id)}, ${q(tid)})`).join(',\n')};`);
}

/* ---- 2.2 台账状态日志 ---- */
const logs = S.hz_order_logs;
s2.push(`\n-- ---- 2.2 trade.order_ledger_log（${logs.length} 条状态流转日志）----`);
s2.push(`DELETE FROM trade.order_ledger_log;`);
s2.push(`INSERT INTO trade.order_ledger_log (order_id, from_status, to_status, operator, remark, log_time)
VALUES
${logs.map(l => `  (${q(l.order_id)}, ${q(l.from_status)}, ${q(l.to_status)}, ${q(l.operator)}, ${q(l.remark)}, ${ts(l.time)})`).join(',\n')};`);

/* ---- 3. trade.settlement 结算 ---- */
const settles = S.hz_settlements.list || S.hz_settlements;
s2.push(`\n-- ---- 3. trade.settlement（${settles.length} 笔结算）----`);
s2.push(`INSERT INTO trade.settlement
  (id, settle_code, order_id, order_code, contract_id, contract_code, customer, type, amount, received, paid, settle_date, status, remark, created_at, updated_at)
VALUES
${settles.map(x => `  (${q(x.id)}, ${q(x.settle_code)}, ${q(x.order_id)}, ${q(x.order_code)}, ${q(x.contract_id)}, ${q(x.contract_code)}, ${q(x.customer)}, ${q(x.type)},
   ${num(x.amount)}, ${num(x.received)}, ${num(x.paid)}, ${dt(x.settle_date)}, ${q(x.status)}, ${q(x.remark)}, ${ts(x.created_at)}, ${ts(x.updated_at)})`).join(',\n')}
ON CONFLICT (settle_code) DO UPDATE SET
  order_id = EXCLUDED.order_id, order_code = EXCLUDED.order_code, contract_id = EXCLUDED.contract_id,
  contract_code = EXCLUDED.contract_code, customer = EXCLUDED.customer, type = EXCLUDED.type,
  amount = EXCLUDED.amount, received = EXCLUDED.received, paid = EXCLUDED.paid,
  settle_date = EXCLUDED.settle_date, status = EXCLUDED.status, remark = EXCLUDED.remark;`);

/* ---- 4. pricing 汽运/火运价格指数 ---- */
s2.push(`\n-- ---- 4.1 pricing.truck_price_index（${truckIdx.records.length} 条）----`);
s2.push(`DELETE FROM pricing.truck_price_index;`);
s2.push(`INSERT INTO pricing.truck_price_index
  (id, data_date, goods, from_place, to_place, price, remark, evidences, uploader, uploaded_at)
VALUES
${truckIdx.records.map(r => `  (${q(r.id)}, ${dt(r.dataDate)}, ${q(r.goods)}, ${q(r.from)}, ${q(r.to)}, ${num(r.price)}, ${q(r.remark)}, ${j(r.evidences)}, ${q(r.uploader)}, ${tsStr(r.uploadedAt)})`).join(',\n')};`);
s2.push(`\n-- ---- 4.2 pricing.rail_price_index（${railIdx.records.length} 条）----`);
s2.push(`DELETE FROM pricing.rail_price_index;`);
s2.push(`INSERT INTO pricing.rail_price_index
  (id, data_date, goods, from_place, to_place, price, remark, evidences, uploader, uploaded_at)
VALUES
${railIdx.records.map(r => `  (${q(r.id)}, ${dt(r.dataDate)}, ${q(r.goods)}, ${q(r.from)}, ${q(r.to)}, ${num(r.price)}, ${q(r.remark)}, ${j(r.evidences)}, ${q(r.uploader)}, ${tsStr(r.uploadedAt)})`).join(',\n')};`);

/* ---------------- 写文件 ---------------- */

fs.writeFileSync(path.join(OUT, 'S001__base_seed.sql'), s1.join('\n') + '\n');
fs.writeFileSync(path.join(OUT, 'S002__trade_seed.sql'), s2.join('\n') + '\n');

console.log('已生成 seeds/S001__base_seed.sql 与 seeds/S002__trade_seed.sql');
changes.forEach(c => console.log('转换: ' + c));

console.log('\n预期导入行数（验证清单）:');
console.log(`  S001: dict_entry=${dictRows.length} mine=${mines.length} mine_product=${prods.length} mine_price_ref=${priceRefs.length} mine_partner=${partners.length}`);
console.log(`        voyage=${voyages.length} voyage_sync=${syncRows.length} spot=${spots.length} coa=${coas.length} coa_item=${coaItems.length}`);
console.log(`        port=${ports.length} port_zone=${zones.length} port_channel=${channels.length} rail=${rails.length} rail_contact=${railContacts.length}`);
console.log(`        transfer=${tss.length} wh_supplier=${whs.length} wh_stack=${stacks.length} wh_ore=${ores.length} fleet=${fleets.length} steel=${steels.length}`);
console.log(`        contract=${contracts.length} template=${templates.length}`);
console.log(`  S002: trip=${trips.length} ledger=${ledgerRaw.length} ledger_trip=${ledgerTrips.length} ledger_log=${logs.length} settlement=${settles.length} truck=${truckIdx.records.length} rail_idx=${railIdx.records.length} iron_ore=${spots.length}`);
