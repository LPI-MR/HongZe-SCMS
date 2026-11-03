// ===== HZUnits 全局数据单位基座 =====
// 统一标准：系统内部数量存储单位 = 吨（t）；海运管理模块航次 quantity 因运费公式
// （万吨 × 10000 × $/吨）与存量数据保持「万吨」私有口径。
// 任何跨模块数量交互必须经本基座转换与校验，禁止裸赋值（防止 17.5 万吨被当作 17.5 吨）。
// 后端接入后仅需替换本文件的实现，调用方无感。
(function () {
  'use strict';

  // 单位常量（1 万吨 = 10000 吨）
  const TON = 1;
  const WAN_TON = 10000;

  // 支持的单位标识（跨模块交互声明口径用）
  const UNITS = { ton: TON, wanTon: WAN_TON };

  // 数值合法性校验：非有限数值或负数返回 null（0 视为合法，由调用方决定是否放行）
  function toNumber(v) {
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 ? n : null;
  }

  // 通用换算：convert(value, from, to)，from/to 取 'ton' | 'wanTon'（同单位原样返回）
  // 非法输入返回 null，调用方应阻断写入而非静默落 0
  function convert(value, from, to) {
    const n = toNumber(value);
    if (n === null || !UNITS[from] || !UNITS[to]) return null;
    if (from === to) return n;
    return from === 'wanTon' ? n * WAN_TON : n / WAN_TON;
  }

  // 吨 → 万吨（保留 2 位小数）；非法输入返回 null
  function tonsToWanTons(tons) {
    const n = toNumber(tons);
    return n === null ? null : Math.round(n / WAN_TON * 100) / 100;
  }

  // 万吨 → 吨（整数吨四舍五入）；非法输入返回 null
  function wanTonsToTons(wanTons) {
    const n = toNumber(wanTons);
    return n === null ? null : Math.round(n * WAN_TON);
  }

  // 千分位格式化：吨（最多 2 位小数）
  function formatTons(tons) {
    const n = toNumber(tons);
    if (n === null) return '—';
    return n.toLocaleString('zh-CN', { maximumFractionDigits: 2 });
  }

  // 千分位格式化：万吨（保留 2 位小数）
  function formatWanTons(wanTons) {
    const n = toNumber(wanTons);
    if (n === null) return '—';
    return n.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  // 跨模块写入校验：目标数量必须为正数（> 0）才允许同步，返回换算值或 null
  function normalizeTo(value, from, to) {
    const n = convert(value, from, to);
    return n !== null && n > 0 ? n : null;
  }

  window.HZUnits = {
    TON: TON,
    WAN_TON: WAN_TON,
    convert: convert,
    tonsToWanTons: tonsToWanTons,
    wanTonsToTons: wanTonsToTons,
    formatTons: formatTons,
    formatWanTons: formatWanTons,
    normalizeTo: normalizeTo
  };
})();
