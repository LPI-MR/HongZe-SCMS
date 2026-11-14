/* ============================================================
   一次性种子提取脚本（t5）
   ------------------------------------------------------------
   模拟浏览器全局（window/document/localStorage），依次加载各模块
   页面脚本与数据层文件，让模块把内置种子写入 localStorage stub，
   最后把全部 hz_* / hzwl_* / hz-scms-* 键 dump 为 JSON 文件，
   供 seeds 生成脚本转换为 SQL。
   运行：node scripts/dump-seeds.js
   输出：scripts/_seed_dump.json（用后可删）
   ============================================================ */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');

/* ---------- localStorage / sessionStorage stub ---------- */

function makeStorage() {
  const map = new Map();
  return {
    getItem: k => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(String(k), String(v)); },
    removeItem: k => { map.delete(k); },
    clear: () => map.clear(),
    key: i => Array.from(map.keys())[i] ?? null,
    get length() { return map.size; },
    _map: map,
  };
}

/* ---------- DOM 元素万能 stub ---------- */

function makeEl(tag) {
  const el = {
    tagName: (tag || 'div').toUpperCase(),
    style: {},
    dataset: {},
    children: [],
    childNodes: [],
    attributes: {},
    value: '',
    textContent: '',
    innerHTML: '',
    className: '',
    id: '',
    hidden: false,
    disabled: false,
    checked: false,
    children_: null,
    get children_() { return this.children; },
    classList: {
      _s: new Set(),
      add(...c) { c.forEach(x => this._s.add(x)); },
      remove(...c) { c.forEach(x => this._s.delete(x)); },
      toggle(c, f) { if (f === undefined) { this._s.has(c) ? this._s.delete(c) : this._s.add(c); } else if (f) this._s.add(c); else this._s.delete(c); },
      contains(c) { return this._s.has(c); },
    },
    addEventListener() {}, removeEventListener() {},
    appendChild(c) { this.children.push(c); return c; },
    removeChild(c) { const i = this.children.indexOf(c); if (i >= 0) this.children.splice(i, 1); return c; },
    insertBefore(c) { this.children.push(c); return c; },
    replaceChild(n) { return n; },
    querySelector() { return makeEl(); },
    querySelectorAll() { return []; },
    closest() { return null; },
    contains() { return false; },
    setAttribute(k, v) { this.attributes[k] = String(v); },
    getAttribute(k) { return this.attributes[k] != null ? this.attributes[k] : null; },
    removeAttribute(k) { delete this.attributes[k]; },
    hasAttribute() { return false; },
    focus() {}, blur() {}, click() {}, select() {}, scrollIntoView() {},
    getBoundingClientRect() { return { top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 }; },
    parentElement: null,
    parentNode: null,
    nextSibling: null,
    previousSibling: null,
  };
  el.parentElement = el; // 自引用：`x.parentElement.appendChild(y)` 等模式安全 no-op
  el.parentNode = el;
  return el;
}

/* ---------- document / window stub ---------- */

const documentStub = {
  readyState: 'complete',
  body: makeEl('body'),
  documentElement: makeEl('html'),
  head: makeEl('head'),
  title: '',
  getElementById() { return makeEl(); },
  querySelector() { return makeEl(); },
  querySelectorAll() { return []; },
  createElement(tag) { return makeEl(tag); },
  createElementNS() { return makeEl('svg'); },
  createTextNode(t) { return { nodeType: 3, textContent: String(t) }; },
  createDocumentFragment() { return makeEl('#fragment'); },
  addEventListener() {}, removeEventListener() {},
  dispatchEvent() { return true; },
};

const locationStub = {
  href: 'http://localhost:8000/',
  origin: 'http://localhost:8000',
  pathname: '/',
  search: '',
  hash: '',
  protocol: 'http:',
  host: 'localhost:8000',
  hostname: 'localhost',
  port: '8000',
  reload() {}, assign() {}, replace() {},
};

const storage = makeStorage();
const sessionStorageStub = makeStorage();

const sandbox = {
  console, Math, JSON, Date, Array, Object, String, Number, Boolean, RegExp,
  parseInt, parseFloat, isNaN, isFinite, encodeURIComponent, decodeURIComponent,
  encodeURI, decodeURI, Map, Set, Promise, Symbol, Error, TypeError, RangeError,
  structuredClone, crypto: { randomUUID: () => 'x' + Math.random().toString(36).slice(2) },
  setTimeout, clearTimeout,
  setInterval() { return 0; },   // no-op：避免页面轮询定时器挂住进程
  clearInterval() {},
  addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true; },
  localStorage: storage,
  sessionStorage: sessionStorageStub,
  document: documentStub,
  location: locationStub,
  navigator: { userAgent: 'seed-dump', language: 'zh-CN', clipboard: { writeText() { return Promise.resolve(); } } },
  history: { pushState() {}, replaceState() {}, back() {} },
  alert() {}, confirm() { return false; }, prompt() { return null; },
  fetch: () => Promise.resolve({ ok: true, json: () => Promise.resolve({}), text: () => Promise.resolve('') }),
  XMLHttpRequest: function () { this.open = () => {}; this.send = () => {}; this.setRequestHeader = () => {}; this.addEventListener = () => {}; },
  requestAnimationFrame: cb => setTimeout(cb, 0),
  cancelAnimationFrame() {},
  getComputedStyle: () => ({ getPropertyValue: () => '' }),
  matchMedia: () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {} }),
  URLSearchParams,
  URL,
  Blob: function () {},
  File: function () {},
  FileReader: function () { this.readAsText = () => {}; this.readAsDataURL = () => {}; this.addEventListener = () => {}; },
  Image: function () { this.addEventListener = () => {}; },
  Option: function (t) { this.textContent = t; },
  CustomEvent: function (type) { this.type = type; },
  Event: function (type) { this.type = type; },
  performance: { now: () => Date.now() },
  Leaflet: null, L: null,
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
sandbox.self = sandbox;
sandbox.top = sandbox;
sandbox.parent = sandbox;
sandbox.frames = sandbox;

vm.createContext(sandbox);

/* ---------- 按依赖顺序加载脚本 ---------- */

const FILES = [
  'common/units.js',
  'common/hz-data.js',
  'customers/data.js',
  'business/business-data.js',
  'business/flow/flow-data.js',
  'business/flow/order-new-data.js',
  'mine/mine.js',
  'ports/ports.js',
  'railway/railway.js',
  'transfer/transfer.js',
  'warehouse/warehouse.js',
  'warehouse/suppliers.js',
  'warehouse/io.js',
  'warehouse/customs.js',
  'fleet/fleet.js',
  'steel/steel.js',
  'ocean/ocean.js',
  'contracts/contracts-data.js',
  'contracts/templates.js',
  'transport/trips-store.js',
  'price-index/truck.js',
  'price-index/rail.js',
  'price-index/iron-ore.js',
];

const report = [];
for (const rel of FILES) {
  const abs = path.join(ROOT, rel);
  try {
    const code = fs.readFileSync(abs, 'utf8');
    vm.runInContext(code, sandbox, { filename: rel });
    report.push(`OK    ${rel}`);
  } catch (e) {
    const stack = String(e.stack || '').split('\n').slice(0, 4).join(' | ');
    report.push(`FAIL  ${rel}: ${e.message}  [${stack}]`);
  }
}

/* ---------- 主动触发懒式种子写入（数据层 load() 由页面调用，此处手动触发） ---------- */

const calls = [];
function call(desc, fn) {
  try { fn(); calls.push(`OK    ${desc}`); } catch (e) { calls.push(`FAIL  ${desc}: ${e.message}`); }
}

call('HZContractData.load()', () => sandbox.HZContractData.load());
call('HZBusinessData.loadOrders()', () => sandbox.HZBusinessData.loadOrders());
call('HZBusinessData.loadSettlements()', () => sandbox.HZBusinessData.loadSettlements());
call('HZBusinessData.loadLogs()', () => sandbox.HZBusinessData.loadLogs());
call('TripsStore.load()', () => sandbox.TripsStore.load());

/* ---------- dump localStorage 全部键 ---------- */

const direct = {};

// 合同：HZContractData.load() 只读不写，种子直接取返回值
call('capture contracts seed', () => { direct.contracts = sandbox.HZContractData.load(); });

// 合同模板：templates.js 未导出，从源码提取 SEED_TEMPLATES 字面量求值
call('extract SEED_TEMPLATES', () => {
  const src = fs.readFileSync(path.join(ROOT, 'contracts/templates.js'), 'utf8');
  const m = src.match(/const SEED_TEMPLATES = ([\s\S]*?\n  \]);/);
  if (!m) throw new Error('SEED_TEMPLATES 字面量未匹配到');
  direct.templates = vm.runInContext('(' + m[1] + ')', sandbox);
});

const dump = {};
for (const [k, v] of storage._map.entries()) {
  try {
    dump[k] = JSON.parse(v);
  } catch (e) {
    dump[k] = v;
  }
}

/* ---------- 预览条数 ---------- */

function preview(v) {
  if (Array.isArray(v)) return `array(${v.length})`;
  if (v && typeof v === 'object') {
    if (Array.isArray(v.list)) return `wrapped.list(${v.list.length})`;
    if (Array.isArray(v.trips)) return `wrapped.trips(${v.trips.length})`;
    return 'object{' + Object.keys(v).slice(0, 8).join(',') + '}';
  }
  return typeof v + ':' + String(v).slice(0, 40);
}

console.log('===== 加载报告 =====');
report.forEach(r => console.log(r));
console.log('\n===== 懒式触发报告 =====');
calls.forEach(r => console.log(r));
console.log('\n===== localStorage 键预览 =====');
Object.keys(dump).sort().forEach(k => console.log(`${k.padEnd(34)} ${preview(dump[k])}`));

const out = path.join(__dirname, '_seed_dump.json');
fs.writeFileSync(out, JSON.stringify({
  storage: dump,
  direct,
  dicts: (sandbox.HZData && {
    dischargePorts: sandbox.HZData.dict('dischargePorts'),
    mineLoadPorts: sandbox.HZData.dict('mineLoadPorts'),
    orderStatus: sandbox.HZData.dict('orderStatus'),
    settleTypes: sandbox.HZData.dict('settleTypes'),
    voyageStatus: sandbox.HZData.dict('voyageStatus'),
    spotMeta: sandbox.HZData.dict('spotMeta'),
  }) || null,
}, null, 2));
console.log(`\n已写出 ${out}`);
process.exit(0); // 强制退出：防止残余定时器/微任务挂住进程
