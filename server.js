// ===== 本地静态服务器（支持无后缀 clean URL）=====
// 启动方式：在项目根目录执行  node server.js
// 访问地址：http://localhost:8000
//
// 背景：页面跳转链接（如导航栏、模块卡片）与 common/fetch.js 的路径规范化
// 均兼容"无后缀 clean URL"（如 /ports/ports 等价于 /ports/ports.html）。
// 使用简易服务器（如 python -m http.server 或不带 clean URL 解析的服务器）
// 访问无后缀地址会 404。本服务器内置 clean URL 解析，彻底避免该问题。
//
// 解析顺序（依次尝试，首个存在的文件生效）：
//   1. 原始路径                        /ports/ports.html
//   2. 目录 → index.html               /          → /index.html
//   3. 无后缀 → 补 .html               /ports/ports → /ports/ports.html
//   4. 无后缀 → 目录 index.html        /ports      → /ports/index.html（不存在则 404）

'use strict';

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const PORT = 8000;
const ROOT = __dirname;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2'
};

// 安全防护：禁止路径穿越（.. 访问项目根目录之外的文件）
function safeJoin(urlPath) {
  const fp = path.join(ROOT, urlPath);
  const rel = path.relative(ROOT, fp);
  if (rel.startsWith('..') || path.isAbsolute(rel)) return null;
  return fp;
}

function sendFile(res, fp) {
  fs.readFile(fp, (err, data) => {
    if (err) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.end('500 Internal Server Error');
      return;
    }
    res.setHeader('Content-Type', MIME[path.extname(fp).toLowerCase()] || 'application/octet-stream');
    res.setHeader('Cache-Control', 'no-cache');   // 开发服务器：每次使用前重新验证，避免改动后浏览器使用旧缓存
    res.end(data);
  });
}

// ===== 实时行情代理（新浪财经公开期货接口） =====
// 仅允许 nf_ 前缀的国内期货代码，防止任意 URL 代理（SSRF）
const LIVE_CODE_RE = /^nf_[A-Za-z0-9]{1,12}$/;
const SINA_HQ_HOST = 'hq.sinajs.cn';

function sendJson(res, code, obj) {
  res.statusCode = code;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(obj));
}

function proxyFutures(res, params) {
  const codes = (params.get('codes') || 'nf_I0')
    .split(',').map(s => s.trim()).filter(s => LIVE_CODE_RE.test(s)).slice(0, 10);
  if (!codes.length) { sendJson(res, 400, { ok: false, error: 'invalid codes' }); return; }

  const req = https.get({
    host: SINA_HQ_HOST,
    path: '/list=' + codes.join(','),
    headers: {
      'Referer': 'https://finance.sina.com.cn',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
    },
    timeout: 8000
  }, (up) => {
    const chunks = [];
    up.on('data', c => chunks.push(c));
    up.on('end', () => {
      const buf = Buffer.concat(chunks);
      let text;
      try { text = new TextDecoder('gbk').decode(buf); }
      catch (e) { text = buf.toString('latin1'); }   // 字段以数字为主，中文乱码仅影响名称

      const num = s => { const v = parseFloat(s); return isFinite(v) ? v : null; };
      const quotes = {};
      codes.forEach(code => {
        quotes[code] = null;
        const m = text.match(new RegExp('hq_str_' + code + '="([^"]*)"'));
        if (!m || !m[1]) return;
        const f = m[1].split(',');
        // 新浪国内期货格式：0名称 1时间 2开盘 3最高 4最低 5昨收 6买价 7卖价
        //                8最新价 9结算 10昨结算 13持仓量 14成交量 17日期
        const price = num(f[8]);
        const prevSettle = num(f[10]);
        if (price == null) return;
        quotes[code] = {
          name: f[0] || code,
          time: (/^\d{6}$/.test(f[1] || '') ? f[1].replace(/(\d{2})(\d{2})(\d{2})/, '$1:$2:$3') : (f[1] || '')),
          open: num(f[2]), high: num(f[3]), low: num(f[4]),
          price: price,
          prevSettle: prevSettle,
          change: (prevSettle ? Math.round((price - prevSettle) * 100) / 100 : null),
          changePct: (prevSettle ? Math.round((price - prevSettle) / prevSettle * 10000) / 100 : null),
          openInterest: num(f[13]),
          volume: num(f[14]),
          date: f[17] || ''
        };
      });
      sendJson(res, 200, { ok: true, quotes: quotes, serverTime: new Date().toISOString() });
    });
  });
  req.on('timeout', () => { req.destroy(); sendJson(res, 504, { ok: false, error: 'upstream timeout' }); });
  req.on('error', () => sendJson(res, 502, { ok: false, error: 'upstream error' }));
}

const server = http.createServer((req, res) => {
  // ===== 实时行情代理：转发新浪财经公开期货接口（浏览器跨域无法直连，由本服务端代理） =====
  const qIdx = req.url.indexOf('?');
  const urlPath = qIdx === -1 ? req.url : req.url.slice(0, qIdx);
  if (urlPath === '/api/futures') {
    proxyFutures(res, new URLSearchParams(qIdx === -1 ? '' : req.url.slice(qIdx + 1)));
    return;
  }

  let urlPathDecoded;
  try {
    urlPathDecoded = decodeURIComponent(urlPath);
  } catch (e) {
    res.statusCode = 400;
    res.end('400 Bad Request');
    return;
  }

  // 依序尝试的候选路径
  const tries = [urlPathDecoded];
  if (urlPathDecoded.endsWith('/')) {
    tries.push(urlPathDecoded + 'index.html');
  } else if (!path.extname(urlPathDecoded)) {
    tries.push(urlPathDecoded + '.html');
    tries.push(urlPathDecoded + '/index.html');
  }

  let i = 0;
  (function next() {
    if (i >= tries.length) {
      res.statusCode = 404;
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.end('404 Not Found: ' + req.url);
      return;
    }
    const fp = safeJoin(tries[i++]);
    if (!fp) { next(); return; }
    fs.stat(fp, (err, st) => {
      if (!err && st.isFile()) sendFile(res, fp);
      else next();
    });
  })();
});

server.listen(PORT, () => {
  console.log('泓泽宜通 SCMS 本地服务器已启动');
  console.log('访问地址: http://localhost:' + PORT);
  console.log('支持无后缀 clean URL（如 /ports/ports ≡ /ports/ports.html）');
});
