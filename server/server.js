// ===== 泓泽宜通 SCMS · 轻量数据同步服务器 =====
// 零依赖：仅需 Node.js，无需 npm install
// 功能：
//   1. 静态托管项目目录（替代 npx serve）
//   2. /api/data 数据同步接口：GET 读取 / POST 保存，数据落盘 server/data.json
// 启动：node server/server.js（或双击项目根目录「启动服务器.bat」）
// 说明：局域网内任意电脑访问同一台服务器即共享同一份数据；
//       保存为整包覆盖（后保存者生效），适合演示/小型团队场景。
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 8000;
const ROOT = path.join(__dirname, '..');
const DATA_FILE = path.join(__dirname, 'data.json');

// 读取落盘数据（文件不存在或损坏时返回空结构，由前端种子机制兜底）
function readData() {
  try {
    const v = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    return {
      contracts: Array.isArray(v.contracts) ? v.contracts : [],
      materials: v.materials && typeof v.materials === 'object' ? v.materials : {},
      templates: Array.isArray(v.templates) ? v.templates : []
    };
  } catch (e) {
    return { contracts: [], materials: {}, templates: [] };
  }
}

// 写入落盘（临时文件 + 原子替换，避免写一半损坏）
function writeData(data) {
  const tmp = DATA_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, DATA_FILE);
}

// ===== 静态文件服务 =====
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.pdf': 'application/pdf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2'
};

function serveStatic(req, res, rawUrl) {
  let p;
  try { p = decodeURIComponent(rawUrl.split('?')[0]); } catch (e) { p = '/'; }
  if (p === '/' || p === '') p = '/index.html';

  const file = path.normalize(path.join(ROOT, p));
  if (file !== ROOT && file.indexOf(ROOT + path.sep) !== 0) {
    res.writeHead(403); res.end('Forbidden');
    return;
  }

  fs.stat(file, (err, st) => {
    if (!err && st.isDirectory()) return serveStatic(req, res, p + '/index.html');
    if (err || !st.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not Found');
      return;
    }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-cache'
    });
    fs.createReadStream(file).pipe(res);
  });
}

const server = http.createServer((req, res) => {
  const url = req.url || '/';

  // ===== 数据同步 API =====
  if (url === '/api/data' || url.indexOf('/api/data?') === 0) {
    if (req.method === 'GET') {
      res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store'
      });
      res.end(JSON.stringify(readData()));
      return;
    }

    if (req.method === 'POST') {
      let body = '';
      req.on('data', c => {
        body += c;
        // 上限 50MB（材料/模板文档以 base64 传输，预留余量）
        if (body.length > 50 * 1024 * 1024) req.destroy();
      });
      req.on('end', () => {
        try {
          const patch = JSON.parse(body || '{}');
          const data = readData();
          // 增量补丁：只覆盖本次提交的字段
          if (Array.isArray(patch.contracts)) data.contracts = patch.contracts;
          if (patch.materials && typeof patch.materials === 'object') data.materials = patch.materials;
          if (Array.isArray(patch.templates)) data.templates = patch.templates;
          writeData(data);
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ ok: true }));
        } catch (e) {
          res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ ok: false, error: String(e && e.message || e) }));
        }
      });
      return;
    }

    res.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Method Not Allowed');
    return;
  }

  serveStatic(req, res, url);
});

server.listen(PORT, () => {
  console.log('================================================');
  console.log('  泓泽宜通 SCMS 服务器已启动（含数据同步）');
  console.log('  本机访问:    http://localhost:' + PORT);
  console.log('  局域网访问:  http://<本机IP>:' + PORT);
  console.log('  同步数据文件: ' + DATA_FILE);
  console.log('  按 Ctrl+C 停止服务器');
  console.log('================================================');
});
