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
    res.end(data);
  });
}

const server = http.createServer((req, res) => {
  let urlPath;
  try {
    urlPath = decodeURIComponent(req.url.split('?')[0]);
  } catch (e) {
    res.statusCode = 400;
    res.end('400 Bad Request');
    return;
  }

  // 依序尝试的候选路径
  const tries = [urlPath];
  if (urlPath.endsWith('/')) {
    tries.push(urlPath + 'index.html');
  } else if (!path.extname(urlPath)) {
    tries.push(urlPath + '.html');
    tries.push(urlPath + '/index.html');
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
