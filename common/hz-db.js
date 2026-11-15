// ===== HZDB · 前端数据缓存基座（localStorage → PostgreSQL 改造） =====
// 职责：
//  - 启动时 GET /api/bootstrap 一次性拉全量数据到内存缓存（与后端各 GET 形状一致）
//  - ready()：boot 遮罩 + 失败重试按钮；页面入口统一 await HZDB.ready() 后再初始化
//  - get(key)：同步读缓存（key = API 资源名，或历史 localStorage 键经 ALIAS 映射）
//  - put(key, list)：async 全量替换（PUT /api/:res），成功更新缓存返回 true；
//    失败 toast 提示、缓存不动，页面内存数据保持现场供用户重试
//  - remove(key, id)：DELETE /api/:res/:id，成功同步删缓存
//  - dicts()：业务字典缓存（{ scope: [entries] }）
// 依赖：common/hz-api.js（HZApi）。页面须通过本地服务器访问。
window.HZDB = (function () {
  'use strict';

  const A = window.HZApi;
  const data = {};        // 资源名 → 数组
  const dicts = {};       // scope → [{ code, label, parent_code, sort_no, payload }]
  let tripSeq = 0;        // 调度车次序号（GET /api/trips 返回 {seq, trips}）
  let bootPromise = null;

  // 历史 localStorage 键 → API 资源名（改造期各模块逐步切换；详见 docs/改造清单）
  const ALIAS = {
    'hz_mines': 'mines',
    'hz_ports_data': 'ports',
    'hz_transfer_stations': 'stations',
    'hz_railway_suppliers': 'rails',
    'hz_warehouse_suppliers_v1': 'warehouses',
    'hzwl_fleets_v2': 'fleets',
    'hzwl_steels_v2': 'steels',
    'hz-scms-trips-v2': 'trips',
    'hz_ocean_voyages': 'voyages',
    'hz_ocean_spots': 'spots',
    'hz_ocean_coas': 'coas',
    'hz_contracts': 'contracts',
    'hz_orders': 'ledger',
    'hz_order_logs': 'ledgerLogs',
    'hz_settlements': 'settlements'
  };
  function res(key) { return ALIAS[key] || key; }

  // ===== boot 遮罩：加载中 / 失败重试 =====
  let maskEl = null, maskMsg = null, maskErr = null, retryBtn = null;
  function ensureMask() {
    if (maskEl) return;
    const style = document.createElement('style');
    style.textContent =
      '.hz-boot-mask{position:fixed;inset:0;z-index:99998;background:rgba(15,23,42,.45);display:flex;align-items:center;justify-content:center;}' +
      '.hz-boot-card{background:#fff;border-radius:12px;padding:28px 40px;text-align:center;box-shadow:0 12px 40px rgba(0,0,0,.25);min-width:260px;}' +
      '.hz-boot-spin{width:34px;height:34px;margin:0 auto 14px;border:3px solid #dbe2ef;border-top-color:#2f6fed;border-radius:50%;animation:hzspin .8s linear infinite;}' +
      '@keyframes hzspin{to{transform:rotate(360deg);}}' +
      '.hz-boot-title{font-size:15px;color:#1f2937;font-weight:600;}' +
      '.hz-boot-err{margin-top:10px;font-size:13px;color:#d64545;max-width:320px;word-break:break-all;display:none;}' +
      '.hz-boot-retry{display:none;margin-top:14px;padding:8px 22px;border:none;border-radius:6px;background:#2f6fed;color:#fff;font-size:14px;cursor:pointer;}' +
      '.hz-boot-retry:hover{background:#2059c8;}';
    document.head.appendChild(style);
    maskEl = document.createElement('div');
    maskEl.className = 'hz-boot-mask';
    const card = document.createElement('div');
    card.className = 'hz-boot-card';
    const spin = document.createElement('div');
    spin.className = 'hz-boot-spin';
    maskMsg = document.createElement('div');
    maskMsg.className = 'hz-boot-title';
    maskMsg.textContent = '数据加载中…';
    maskErr = document.createElement('div');
    maskErr.className = 'hz-boot-err';
    retryBtn = document.createElement('button');
    retryBtn.className = 'hz-boot-retry';
    retryBtn.textContent = '重试';
    retryBtn.onclick = () => { ready(true); };
    card.appendChild(spin);
    card.appendChild(maskMsg);
    card.appendChild(maskErr);
    card.appendChild(retryBtn);
    maskEl.appendChild(card);
    document.body.appendChild(maskEl);
  }
  function maskFail(msg) {
    if (!maskEl) ensureMask();
    maskErr.textContent = msg;
    maskErr.style.display = 'block';
    retryBtn.style.display = 'inline-block';
  }
  function maskRemove() { if (maskEl) { maskEl.remove(); maskEl = null; } }

  // ===== boot：拉取全量缓存 =====
  async function boot() {
    const d = await A.get('/api/bootstrap');
    if (!d || typeof d !== 'object') throw new A.HZApiError('bootstrap 数据格式异常', 'BAD_DATA', 0);
    Object.keys(d).forEach(k => {
      if (k === 'dicts') { Object.keys(d.dicts || {}).forEach(s => { dicts[s] = d.dicts[s]; }); return; }
      if (k === 'trips') {
        tripSeq = (d.trips && typeof d.trips.seq === 'number') ? d.trips.seq : 0;
        data.trips = (d.trips && Array.isArray(d.trips.trips)) ? d.trips.trips : [];
        return;
      }
      data[k] = d[k];
    });
  }

  function ready(fresh) {
    if (bootPromise && !fresh) return bootPromise;
    if (!maskEl) ensureMask();
    maskErr.style.display = 'none';
    retryBtn.style.display = 'none';
    maskMsg.textContent = '数据加载中…';
    bootPromise = boot()
      .then(() => { maskRemove(); return data; })
      .catch(err => {
        bootPromise = null;
        maskFail('数据加载失败：' + (err && err.message || '未知错误'));
        throw err;
      });
    return bootPromise;
  }

  // ===== 同步读（boot 后可用） =====
  function get(key) {
    return data[res(key)];
  }

  // ===== 全量替换写（PUT） =====
  // 返回 true=成功；false=失败（toast 已提示，页面保持内存现场供重试）
  async function put(key, list, opts) {
    const r = res(key);
    let body = list;
    if (r === 'trips') {
      // 调度车次特殊形状：{ seq, trips }
      body = { seq: opts && opts.seq != null ? opts.seq : tripSeq, trips: list };
    }
    try {
      await A.put('/api/' + r, body);
    } catch (err) {
      A.toast('保存失败：' + (err && err.message || '未知错误'), 'error');
      return false;
    }
    data[r] = list;
    if (r === 'trips' && opts && typeof opts.seq === 'number') tripSeq = opts.seq;
    if (r === 'spots') data.ironOre = list;   // 现货与铁矿石指数为镜像表，同写同更
    return true;
  }

  // ===== 单条删除（DELETE） =====
  async function remove(key, id) {
    const r = res(key);
    try {
      await A.del('/api/' + r + '/' + encodeURIComponent(String(id)));
    } catch (err) {
      A.toast('删除失败：' + (err && err.message || '未知错误'), 'error');
      return false;
    }
    if (Array.isArray(data[r])) data[r] = data[r].filter(x => x == null || String(x.id) !== String(id));
    return true;
  }

  // ===== 业务字典写（PUT /api/dicts/:scope） =====
  // scope 分组全量替换 [{code, label?, payload?, parent_code?}]；
  // 成功同步内存缓存返回 true，失败 toast 返回 false
  async function putDict(scope, entries) {
    try {
      await A.put('/api/dicts/' + encodeURIComponent(String(scope)), entries);
    } catch (err) {
      A.toast('保存失败：' + (err && err.message || '未知错误'), 'error');
      return false;
    }
    dicts[scope] = entries;
    return true;
  }

  return {
    ready: ready,
    get: get,
    put: put,
    remove: remove,
    putDict: putDict,
    dicts: () => dicts,
    seq: () => tripSeq,
    res: res
  };
})();
