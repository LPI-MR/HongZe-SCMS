// ===== 合同模板模块脚本 =====
// 公共导航栏由 /common/fetch.js 加载；本脚本负责模板分类、版本控制等本模块逻辑
// 模板数据持久化到 localStorage（hz_contract_templates），刷新页面不丢失
//
// 数据结构：
//   templates = [ { id, category, versions: [ { ver, time, name, content, remark } ] } ]
//   - versions 按时间升序追加，最后一个为当前版本
//   - 每次修改保存自动追加新版本（次版本 +1，可勾选主版本 +1），历史版本全部保留可追溯
(function () {
  'use strict';

  // 本页对应的导航位置：合同管理 → 合同模板
  const NAV_PATH = '合同管理';
  const NAV_SUB = NAV_PATH + ' / 合同模板';

  // 设置导航栏选中态：一级「合同管理」高亮并展开，二级「合同模板」高亮
  function setActiveNav() {
    const navbar = document.getElementById('navbar');
    if (!navbar) return;

    navbar.querySelectorAll('.nav-item.active, .nav-sub-item.active')
      .forEach(el => el.classList.remove('active'));

    navbar.querySelectorAll('.nav-item').forEach(item => {
      const label = item.querySelector('.label');
      const path = item.dataset.path || (label ? label.textContent.trim() : '');
      if (path !== NAV_PATH) return;

      item.classList.add('active');

      const group = item.closest('.nav-group');
      if (group) {
        group.classList.add('open');
        group.querySelectorAll('.nav-sub-item').forEach(sub => {
          if ((sub.dataset.path || '') === NAV_SUB) sub.classList.add('active');
        });
      }
    });
  }

  if (document.getElementById('navbar').children.length) {
    setActiveNav();
  } else {
    document.addEventListener('navbar:loaded', setActiveNav);
  }

  // ===== 数据层 =====
  const STORAGE_KEY = 'hz_contract_templates';
  const CATS = ['采购类合同', '销售类合同', '运输类合同', '咨询服务类合同', '通用类合同', '授权委托书'];

  let templates = load();
  let curCat = '全部';     // 当前分类筛选
  let editingId = null;    // 正在编辑的模板 id；null = 新建

  // 版本附件迁移：旧数据单文件 v.file → 新结构文件数组 v.files（历史版本自动升级）
  function normalizeFiles(t) {
    if (!t || !Array.isArray(t.versions)) return;
    t.versions.forEach(v => {
      if (v.file && !v.files) { v.files = [v.file]; v.file = null; }
      if (!Array.isArray(v.files)) v.files = [];
    });
  }
  templates.forEach(normalizeFiles);

  function load() {
    try {
      const v = JSON.parse(localStorage.getItem(STORAGE_KEY));
      return Array.isArray(v) ? v : [];
    } catch (e) {
      return [];
    }
  }

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(templates));
    } catch (e) {
      // 配额超限：剥离各模板最新版本的大文档附件后重试（正文与版本记录保留）
      templates.forEach(t => {
        const v = t.versions[t.versions.length - 1];
        if (v && v.files) v.files = [];
        if (v) v.file = null;
      });
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(templates));
        alert('本地存储空间不足：各模板最新版本的大文档附件未能保存（正文与版本记录已保存，可重新上传）');
      } catch (e2) {
        alert('本地存储空间不足，本次修改未能保存到浏览器，请清理旧模板后重试');
      }
    }
  }

  function uid() {
    return 't' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function byId(id) {
    return templates.find(t => t.id === id) || null;
  }

  // 当前版本 = versions 最后一个
  function curVer(t) {
    return t.versions[t.versions.length - 1];
  }

  function fmtTime(ts) {
    const d = new Date(ts);
    const p = n => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) +
      ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  // 版本号递进：V1.2 →（次）V1.3 /（主）V2.0
  function nextVer(ver, major) {
    const m = /^V(\d+)\.(\d+)$/.exec(ver || '');
    if (!m) return 'V1.0';
    if (major) return 'V' + (Number(m[1]) + 1) + '.0';
    return 'V' + m[1] + '.' + (Number(m[2]) + 1);
  }

  function catIndex(cat) {
    return Math.max(0, CATS.indexOf(cat));
  }

  // ===== 渲染 =====
  function renderCats() {
    const counts = {};
    templates.forEach(t => {
      counts[t.category] = (counts[t.category] || 0) + 1;
    });

    const items = ['全部'].concat(CATS);
    document.getElementById('tplCats').innerHTML = items.map(c => {
      const n = c === '全部' ? templates.length : (counts[c] || 0);
      return '<button type="button" class="tpl-cat' + (c === curCat ? ' active' : '') +
        '" data-cat="' + esc(c) + '">' + esc(c) + '<span class="num">' + n + '</span></button>';
    }).join('');
  }

  function renderGrid() {
    const list = curCat === '全部'
      ? templates
      : templates.filter(t => t.category === curCat);

    document.getElementById('tplEmpty').hidden = list.length > 0;

    // 列表形态：序号 + 名称（含版本）+ 简介 + 操作按钮
    document.getElementById('tplGrid').innerHTML = list.map((t, i) => {
      const cur = curVer(t);
      return (
        '<div class="tpl-row" data-id="' + t.id + '">' +
        '<span class="list-num">' + (i + 1) + '.</span>' +
        '<div class="tpl-row-main">' +
        '<div class="tpl-name">' + esc(cur.name) + '（' + esc(cur.ver) + '）</div>' +
        '<div class="tpl-intro">' + esc(cur.intro || '暂无简介') + '</div>' +
        '</div>' +
        '<div class="tpl-row-actions">' +
        '<button type="button" class="tpl-act" data-act="view" data-id="' + t.id + '">查看</button>' +
        '<button type="button" class="tpl-act" data-act="edit" data-id="' + t.id + '">编辑</button>' +
        '<button type="button" class="tpl-act" data-act="history" data-id="' + t.id + '">历史</button>' +
        '<button type="button" class="tpl-act danger" data-act="del" data-id="' + t.id + '">删除</button>' +
        '</div>' +
        '</div>'
      );
    }).join('');
  }

  function renderAll() {
    renderCats();
    renderGrid();
  }

  // ===== 视图切换：管理 / 搜索结果 / 详情 =====
  let lastListView = 'manage';   // 详情返回目标
  let detailId = null;           // 当前详情模板 id
  let detailFileIdx = 0;         // 当前详情展示的文档索引（多文档标签切换用）

  function showView(v) {
    $('tplManageView').hidden = v !== 'manage';
    $('tplSearchView').hidden = v !== 'search';
    $('tplDetailView').hidden = v !== 'detail';
    if (v !== 'detail') lastListView = v;
    window.scrollTo({ top: 0 });
  }

  // ===== 关键词搜索（空格分隔多词，AND 匹配名称/简介/分类/正文） =====
  function matchTemplate(t, keywords) {
    const cur = curVer(t);
    const hay = (cur.name + ' ' + (cur.intro || '') + ' ' + t.category + ' ' + (cur.content || '')).toLowerCase();
    return keywords.every(kw => hay.includes(kw));
  }

  function renderSearchResults(keywords) {
    const list = templates.filter(t => matchTemplate(t, keywords));
    const box = $('tplSearchView');

    if (!list.length) {
      box.innerHTML = '<div class="result-empty">未找到相关合同模板</div>';
      return;
    }

    box.innerHTML = list.map((t, i) => {
      const cur = curVer(t);
      return (
        '<div class="result-item" data-id="' + t.id + '">' +
        '<span class="list-num">' + (i + 1) + '.</span>' +
        '<div class="result-item-main">' +
        '<div class="result-name">' + esc(cur.name) + '（' + esc(cur.ver) + '）</div>' +
        '<div class="result-intro">' + esc(cur.intro || '暂无简介') + '</div>' +
        '</div>' +
        '</div>'
      );
    }).join('');
  }

  function runSearch() {
    const keywords = $('tplSearchInput').value.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (!keywords.length) {
      showView('manage');
      return;
    }
    renderSearchResults(keywords);
    showView('search');
  }

  function bindSearch() {
    const input = $('tplSearchInput');

    // 点击搜索按钮或回车触发搜索
    $('tplSearchBtn').addEventListener('click', runSearch);
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') runSearch();
    });

    input.addEventListener('input', () => {
      $('tplSearchClear').hidden = !input.value;
    });

    $('tplSearchClear').addEventListener('click', () => {
      input.value = '';
      $('tplSearchClear').hidden = true;
      showView('manage');
      input.focus();
    });

    // 点击搜索结果条目进入详情（事件委托）
    $('tplSearchView').addEventListener('click', e => {
      const item = e.target.closest('.result-item');
      if (item) openDetail(item.dataset.id);
    });
  }

  // ===== 详情视图：左 PDF 内容平铺展示 + 右下载/元信息/风险提示 =====
  let previewUrl = null;   // 当前详情页预览 PDF 的 blob URL

  // pdf.js：把 PDF 逐页渲染为 canvas，平铺在容器中（无查看器工具栏）
  // seq：渲染序号，用户切换详情时递增，旧渲染循环检测到过期立即终止（防内存堆积崩溃）
  let renderSeq = 0;

  async function renderPdfPages(url, container, seq) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'vendor/pdf.worker.min.js';
    const pdf = await pdfjsLib.getDocument(url).promise;
    container.innerHTML = '';

    // 超长文档只渲染前 30 页，防止 renderer 内存溢出崩溃（页面变 Details/崩溃页）
    const maxPages = Math.min(pdf.numPages, 30);
    for (let i = 1; i <= maxPages; i++) {
      if (seq !== renderSeq) return;   // 已切换到其他模板 → 终止
      const page = await pdf.getPage(i);
      const viewport = page.getViewport({ scale: 1.5 });
      const canvas = document.createElement('canvas');
      canvas.className = 'pdf-page';
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
      container.appendChild(canvas);
    }
  }

  function releasePreview() {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      previewUrl = null;
    }
  }

  function openDetail(id) {
    const t = byId(id);
    if (!t) return;
    detailId = id;
    const cur = curVer(t);

    $('crumbName').textContent = cur.name + '（' + cur.ver + '）';

    $('detailMeta').innerHTML =
      '<div><span class="meta-label">模板分类</span>' + esc(t.category) + '</div>' +
      '<div><span class="meta-label">当前版本</span>' + esc(cur.ver) + '</div>' +
      '<div><span class="meta-label">版本总数</span>' + t.versions.length + '</div>' +
      '<div><span class="meta-label">更新时间</span>' + fmtTime(cur.time) + '</div>';

    renderRisks(cur.risks || []);

    // 左侧只展示 PDF 模板：定位版本内的 PDF 文件（.doc 等原始文档仅供下载，不做展示）
    detailFileIdx = (cur.files || []).findIndex(f => /\.pdf$/i.test(f.name));
    const dlWord = $('dlWordBtn');
    dlWord.disabled = !cur.files.length;
    dlWord.title = cur.files.length ? '' : '该版本未上传原始文档';

    // 左侧：PDF 内容平铺渲染，失败时降级纯文本
    const docBox = $('detailDoc');
    releasePreview();
    docBox.hidden = true;
    docBox.classList.remove('pdf-mode');
    $('detailLoading').hidden = false;

    showView('detail');

    const seq = ++renderSeq;   // 本次渲染序号，切换详情后旧渲染自动作废
    buildPreviewPdf(t).then(async url => {
      if (detailId !== id) return;   // 用户已切到其他模板
      if (url && typeof pdfjsLib !== 'undefined') {
        previewUrl = url;
        try {
          await renderPdfPages(url, docBox, seq);
          if (detailId !== id || seq !== renderSeq) return;
          docBox.classList.add('pdf-mode');
          docBox.hidden = false;
          $('detailLoading').hidden = true;
          return;
        } catch (e) { /* 渲染失败 → 提示 */ }
        releasePreview();
      }
      // 无 PDF 或转化失败：提示
      docBox.classList.remove('pdf-mode');
      docBox.textContent = cur.files.length
        ? '该版本未上传 PDF 文档，左侧仅展示 PDF 模板内容，可下载原始文档查看'
        : '该版本未上传文档，请在编辑中上传 PDF 模板后查看';
      docBox.hidden = false;
      $('detailLoading').hidden = true;
    }).catch(() => {
      if (detailId !== id) return;
      docBox.classList.remove('pdf-mode');
      docBox.textContent = '文档预览生成失败，请重新上传或下载原始文档查看';
      docBox.hidden = false;
      $('detailLoading').hidden = true;
    });
  }

  function renderRisks(risks) {
    const box = $('riskList');
    if (!risks.length) {
      box.innerHTML = '<div class="risk-empty">暂无风险提示</div>';
      return;
    }
    box.innerHTML = risks.map(r => (
      '<div class="risk-item">' +
      '<div class="risk-item-text">' + esc(r) + '</div>' +
      (r.length > 42 ? '<span class="risk-more">展开</span>' : '') +
      '</div>'
    )).join('');
  }

  function downloadWord() {
    const t = byId(detailId);
    const cur = t && curVer(t);
    // 优先下载左侧展示的 PDF 原文件；未上传 PDF 时下载第一份原始文档
    const file = cur && (cur.files[detailFileIdx] || cur.files[0]);
    if (!file) return;

    const a = document.createElement('a');
    a.href = 'data:' + wordMime(file.name) + ';base64,' + file.data;
    a.download = file.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  // 下载 PDF：直接保存当前预览的 PDF（未生成时现场构建）
  async function downloadPdf() {
    const t = byId(detailId);
    if (!t) return;
    const btn = $('dlPdfBtn');
    const orig = btn.textContent;

    btn.disabled = true;
    btn.textContent = '生成中…';

    try {
      // 已有预览 PDF（blob URL）→ 直接保存；否则现场构建
      let url = previewUrl;
      if (!url) url = await buildPreviewPdf(t);
      if (!url) {
        alert('该版本无可下载的 PDF 内容');
        return;
      }

      const a = document.createElement('a');
      a.href = url;
      a.download = curVer(t).name + '_' + curVer(t).ver + '.pdf';
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (e) {
      alert('PDF 生成失败，请重试');
    } finally {
      btn.disabled = false;
      btn.textContent = orig;
    }
  }

  // ===== 编辑抽屉（新建 / 编辑） =====
  const $ = id => document.getElementById(id);
  let tipTimer = null;
  let pendingFiles = [];   // 本次上传的文档列表 [{ name, data(base64), type }]；空数组 = 未上传新文件

  // 上传文档（支持多选）：逐个校验后加入待保存列表；同名文件自动替换
  function addFiles(list, pdfOnly) {
    Array.from(list || []).forEach(file => {
      if (pdfOnly && !/\.pdf$/i.test(file.name)) {
        showTip('「' + file.name + '」不是 PDF 格式，请用「上传文档」或改选 PDF');
        return;
      }
      if (file.size > 2 * 1024 * 1024) {
        showTip('「' + file.name + '」超过 2MB，超出浏览器本地存储上限');
        return;
      }

      const reader = new FileReader();
      reader.onload = () => {
        const item = { name: file.name, data: bufToBase64(reader.result) };
        const existIdx = pendingFiles.findIndex(f => f.name === file.name);
        if (existIdx >= 0) {
          pendingFiles[existIdx] = item;   // 同名替换
          showTip('已替换同名文件：' + file.name);
        } else {
          pendingFiles.push(item);
          showTip('已添加：' + file.name);
        }
        renderFileList();
      };
      reader.readAsArrayBuffer(file);
    });
  }

  // 编辑抽屉当前生效的文件集合（打开编辑时已拷贝为工作区，后续增删都在此进行）
  function activeFileList() {
    return pendingFiles;
  }

  // 渲染已上传文件列表：上传几个显示几个，逐个可删除
  function renderFileList() {
    const box = $('tplFileList');
    const files = pendingFiles;
    if (!files.length) { box.hidden = true; box.innerHTML = ''; return; }
    box.hidden = false;
    box.innerHTML = files.map((f, i) => (
      '<div class="file-item">' +
      '<span class="file-dot"></span>' +
      '<span class="file-name" title="' + esc(f.name) + '">' + esc(f.name) + '</span>' +
      '<button type="button" class="tpl-file-remove" data-idx="' + i + '" title="移除该文件">×</button>' +
      '</div>'
    )).join('');
  }

  // 点击列表中的 ×：从工作区移除该文件后刷新列表
  function removeFileAt(idx) {
    pendingFiles.splice(idx, 1);
    renderFileList();
  }

  function showTip(msg) {
    const tip = $('tplTip');
    tip.textContent = msg;
    tip.hidden = false;
    clearTimeout(tipTimer);
    tipTimer = setTimeout(() => { tip.hidden = true; }, 3000);
  }

  // ArrayBuffer → base64（分块避免栈溢出）
  function bufToBase64(buf) {
    const bytes = new Uint8Array(buf);
    let bin = '';
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    }
    return btoa(bin);
  }

  // 下载原始文档时的 MIME 类型
  function wordMime(name) {
    return /\.docx$/i.test(name)
      ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      : 'application/msword';
  }

  // RTF：剥离控制字，配对解码 GBK 双字节与 Unicode 转义
  function rtfToText(rtf) {
    let s = rtf.replace(/\{\\\*?\\?(fonttbl|colortbl|stylesheet|info|generator|pict|object)[\s\S]*?\}/g, '');
    // GBK 十六进制转义配对解码（中文 RTF 常见 \'xx\'xx 序列）
    s = s.replace(/((?:\\'[0-9a-fA-F]{2})+)/g, m => {
      const bytes = m.match(/[0-9a-fA-F]{2}/g).map(h => parseInt(h, 16));
      try {
        return new TextDecoder('gb18030').decode(new Uint8Array(bytes));
      } catch (e) { return ''; }
    });
    // Unicode 转义 \uNNNN
    s = s.replace(/\\u(-?\d+)\s?\??/g, (m, n) => {
      let c = parseInt(n, 10);
      if (c < 0) c += 65536;
      return String.fromCharCode(c);
    });
    // 换行 / 制表等控制字
    s = s.replace(/\\par[d]?\b/g, '\n')
         .replace(/\\line\b/g, '\n')
         .replace(/\\tab\b/g, '\t');
    // 其余控制字与花括号
    s = s.replace(/\\[a-zA-Z]+-?\d*\s?/g, '').replace(/[{}]/g, '');
    return s.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  }

  // 二进制启发式扫描（.doc 及未知格式）：先试 UTF-8，再扫 UTF-16LE 可读段
  function isTextCode(c) {
    return (c >= 0x20 && c < 0x7F) ||
           (c >= 0x4E00 && c <= 0x9FFF) ||   // CJK 统一汉字
           (c >= 0x3000 && c <= 0x303F) ||   // CJK 标点
           (c >= 0xFF00 && c <= 0xFFEF) ||   // 全角字符
           (c >= 0x2010 && c <= 0x2027) ||   // 破折号、引号等
           c === 9 || c === 10 || c === 13;
  }

  function scanBinaryText(buf) {
    // 1) UTF-8 直读：可读字符占比高即采用
    const utf8 = new TextDecoder('utf-8').decode(buf);
    const readable = (utf8.match(/[\u4E00-\u9FFF\u3000-\u303FA-Za-z0-9，。、；：？！“”‘’（）《》\s]/g) || []).length;
    if (utf8.length && readable / utf8.length > 0.6) {
      return utf8.replace(/\0/g, '').trim();
    }

    // 2) UTF-16LE 段扫描（.doc 正文常见存储方式）
    const b = new Uint8Array(buf);
    const segs = [];
    let cur = '';
    for (let i = 0; i + 1 < b.length; i += 2) {
      const code = b[i] | (b[i + 1] << 8);
      if (isTextCode(code)) {
        cur += String.fromCharCode(code);
      } else {
        if (cur.length >= 15) segs.push(cur);
        cur = '';
      }
    }
    if (cur.length >= 15) segs.push(cur);
    if (segs.length) {
      return segs.join('\n').replace(/\n{3,}/g, '\n\n').trim();
    }
    return '';
  }

  // ===== 详情页 PDF 预览管线 =====
  // 原始文件是 PDF → 直接展示；其他格式 → 浏览器端渲染排版后截图转 PDF 再展示，
  // 中文由浏览器原生渲染（截图方案），从根上避免乱码。

  // base64 → ArrayBuffer
  function base64ToBuf(b64) {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes.buffer;
  }

  // 文本/HTML → A4 竖版 PDF（离屏容器 → html2canvas → jsPDF 分页）
  async function htmlOrTextToPdf(html, text) {
    const host = document.createElement('div');
    host.style.cssText = 'position:fixed;left:-9999px;top:0;width:794px;background:#fff;';
    const box = document.createElement('div');
    box.style.cssText = 'padding:40px 48px;font-family:SimSun,serif;font-size:15px;line-height:1.9;color:#1D2129;background:#fff;';
    if (html) {
      box.innerHTML = html;
      box.querySelectorAll('table').forEach(el => {
        el.style.borderCollapse = 'collapse';
        el.style.width = '100%';
      });
      box.querySelectorAll('td,th').forEach(el => {
        el.style.border = '1px solid #E5E6EB';
        el.style.padding = '6px 10px';
      });
      box.querySelectorAll('h1,h2,h3,h4').forEach(el => {
        el.style.fontWeight = '600';
        el.style.margin = '14px 0 8px';
      });
      box.querySelectorAll('p,li').forEach(el => {
        el.style.margin = '0 0 8px';
      });
    } else {
      box.textContent = text;
      box.style.whiteSpace = 'pre-wrap';
      box.style.wordBreak = 'break-all';
    }
    host.appendChild(box);
    document.body.appendChild(host);

    try {
      const canvas = await html2canvas(box, { scale: 2, backgroundColor: '#ffffff' });
      const { jsPDF } = window.jspdf;
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pageW = 210, pageH = 297;
      const pxPerMm = canvas.width / pageW;
      const sliceHpx = Math.floor(pageH * pxPerMm);

      let y = 0;
      let first = true;
      while (y < canvas.height) {
        const h = Math.min(sliceHpx, canvas.height - y);
        const slice = document.createElement('canvas');
        slice.width = canvas.width;
        slice.height = h;
        slice.getContext('2d').drawImage(canvas, 0, y, canvas.width, h, 0, 0, canvas.width, h);
        if (!first) pdf.addPage();
        pdf.addImage(slice.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, pageW, h / pxPerMm);
        first = false;
        y += h;
      }
      return URL.createObjectURL(new Blob([pdf.output('arraybuffer')], { type: 'application/pdf' }));
    } finally {
      host.remove();
    }
  }

  // 为模板版本生成预览 PDF 的 blob URL（覆盖所有常见文档格式）
  async function buildPreviewPdf(t) {
    const cur = curVer(t);
    const file = cur.files[detailFileIdx];
    if (!file) return null;

    const name = file.name;
    const buf = base64ToBuf(file.data);

    // PDF → 直接展示（零转换、像素级保真）
    if (/\.pdf$/i.test(name)) {
      return URL.createObjectURL(new Blob([buf], { type: 'application/pdf' }));
    }

    // OOXML Word 系（.docx/.docm/.dotx/.dotm）→ mammoth 转 HTML → PDF
    if (/\.(docx|docm|dotx|dotm)$/i.test(name) && typeof mammoth !== 'undefined') {
      try {
        const res = await mammoth.convertToHtml({ arrayBuffer: buf });
        if (res.value) return await htmlOrTextToPdf(res.value, '');
      } catch (e) { /* 转换失败 → 落入下方文本兜底 */ }
    }

    // HTML → 浏览器原生渲染 → PDF
    if (/\.x?html?$/i.test(name)) {
      return htmlOrTextToPdf(new TextDecoder('utf-8').decode(buf), '');
    }

    // 图片 → 居中嵌入页面 → PDF
    if (/\.(png|jpe?g|gif|bmp|webp|svg)$/i.test(name)) {
      const mimes = {
        png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
        gif: 'image/gif', bmp: 'image/bmp', webp: 'image/webp', svg: 'image/svg+xml'
      };
      const ext = name.split('.').pop().toLowerCase();
      const html = '<div style="text-align:center"><img src="data:' + (mimes[ext] || 'application/octet-stream') +
        ';base64,' + file.data + '" style="max-width:100%"></div>';
      return htmlOrTextToPdf(html, '');
    }

    // 纯文本类 → 文本转 PDF
    if (/\.(txt|md|text|csv|log|json|xml)$/i.test(name)) {
      return htmlOrTextToPdf('', new TextDecoder('utf-8').decode(buf));
    }

    // RTF → 控制字解析（含 GBK/Unicode 中文解码）→ PDF
    if (/\.rtf$/i.test(name)) {
      return htmlOrTextToPdf('', rtfToText(new TextDecoder('windows-1252').decode(buf)));
    }

    // 其余二进制（.doc 及未知格式）→ 启发式文本扫描兜底
    const scanned = scanBinaryText(buf);
    if (scanned) return htmlOrTextToPdf('', scanned);

    // 实在无内容可转化 → 调用方提示下载
    return null;
  }

  function openEditor(id) {
    editingId = id || null;
    const t = id ? byId(id) : null;
    const cur = t ? curVer(t) : null;

    $('tplDrawerTitle').textContent = t ? '编辑模板（当前 ' + cur.ver + '）' : '新建模板';
    $('fTplName').value = cur ? cur.name : '';
    $('fTplCategory').value = t ? t.category : CATS[0];
    $('fTplIntro').value = cur ? (cur.intro || '') : '';
    $('fTplContent').value = cur ? cur.content : '';
    $('fTplRisk').value = cur && cur.risks ? cur.risks.join('\n') : '';
    $('fTplRemark').value = '';
    $('fTplMajor').checked = false;
    $('tplVerSection').hidden = !t;   // 版本控制区仅编辑模式显示
    $('tplTip').hidden = true;
    // 编辑工作区：拷贝当前版本文件列表，增删操作不直接影响已存数据，保存时统一比对
    pendingFiles = cur ? (cur.files || []).slice() : [];
    renderFileList();

    $('tplDrawerMask').hidden = false;
    $('fTplName').focus();
  }

  function closeEditor() {
    $('tplDrawerMask').hidden = true;
    editingId = null;
    pendingFiles = [];
  }

  function saveTpl() {
    const name = $('fTplName').value.trim();
    if (!name) {
      showTip('请填写模板名称');
      $('fTplName').focus();
      return;
    }

    const category = $('fTplCategory').value;
    const intro = $('fTplIntro').value.trim();
    const content = $('fTplContent').value;
    const risks = $('fTplRisk').value.split('\n').map(s => s.trim()).filter(Boolean);
    const remark = $('fTplRemark').value.trim();
    const major = $('fTplMajor').checked;

    if (!editingId) {
      // 新建：首版本 V1.0
      templates.push({
        id: uid(),
        category: category,
        versions: [{ ver: 'V1.0', time: Date.now(), name: name,
                     intro: intro, content: content, risks: risks,
                     remark: '', files: pendingFiles.slice() }]
      });
    } else {
      const t = byId(editingId);
      const cur = curVer(t);
      // 版本号只跟随「上传模板（文件）」的变动：文件列表一致 → 仅更新介绍信息，不生成新版本
      const filesChanged =
        JSON.stringify(pendingFiles) !== JSON.stringify(cur.files || []);

      t.category = category;
      cur.name = name;
      cur.intro = intro;
      cur.content = content;
      cur.risks = risks;

      if (!filesChanged) {
        // 无文件变动：直接覆盖当前版本的介绍信息，版本号不变
        save();
        closeEditor();
        renderAll();
        return;
      }

      // 文件变动：生成新版本（主版本勾选生效）
      t.versions.push({
        ver: nextVer(cur.ver, major),
        time: Date.now(),
        name: name,
        intro: intro,
        content: content,
        risks: risks,
        remark: remark || '更新模板文档',
        files: pendingFiles.slice()
      });
    }

    save();   // 内置配额降级：超限时自动剥离大文档附件重试并提示
    closeEditor();
    renderAll();
  }

  // ===== 版本历史抽屉 =====
  function openHistory(id) {
    const t = byId(id);
    if (!t) return;

    // 单次会话内查看的版本索引（渲染时重新取最新数据）
    renderHistory(id);
    $('hisView').hidden = true;
    $('hisList').hidden = false;
    $('hisDrawerMask').hidden = false;
  }

  function renderHistory(id) {
    const t = byId(id);
    if (!t) return;
    $('hisTitle').textContent = '版本历史 · ' + curVer(t).name;

    // 新 → 旧排列，最新版本带「当前」标记
    const list = t.versions.slice().reverse();
    $('hisList').innerHTML = list.map((v, i) => (
      '<div class="his-item">' +
      '<span class="his-ver">' + esc(v.ver) + '</span>' +
      (i === 0 ? '<span class="his-cur">当前</span>' : '') +
      '<div class="his-info">' +
      '<div class="his-time">' + fmtTime(v.time) + '</div>' +
      '<div class="his-remark">' + esc(v.remark) + '</div>' +
      '</div>' +
      '<button type="button" class="tpl-act" data-his="view" data-id="' + t.id +
      '" data-ver="' + esc(v.ver) + '">查看</button>' +
      (i === 0 ? '' :
        '<button type="button" class="tpl-act" data-his="restore" data-id="' + t.id +
        '" data-ver="' + esc(v.ver) + '">恢复</button>') +
      '</div>'
    )).join('');
  }

  // 查看某个历史版本内容（只读；带原始 Word 时提供下载）
  function viewVersion(id, ver) {
    const t = byId(id);
    const v = t && t.versions.find(x => x.ver === ver);
    if (!v) return;

    $('hisViewVer').textContent = v.ver + (v === curVer(t) ? '（当前版本）' : '');
    $('hisViewTime').textContent = fmtTime(v.time);
    $('hisContent').textContent = v.content || '（空内容）';

    const dl = $('hisFileDl');
    const hf = (v.files || [])[0];
    if (hf) {
      dl.hidden = false;
      dl.href = 'data:' + wordMime(hf.name) + ';base64,' + hf.data;
      dl.download = hf.name;
    } else {
      dl.hidden = true;
    }

    $('hisList').hidden = true;
    $('hisView').hidden = false;
  }

  // 恢复历史版本：以旧版本内容生成新版本（版本号继续递进，全程可追溯）
  function restoreVersion(id, ver) {
    const t = byId(id);
    const v = t && t.versions.find(x => x.ver === ver);
    if (!t || !v || v === curVer(t)) return;

    const cur = curVer(t);
    const ok = window.confirm('恢复到 ' + ver + '？将以此内容生成新版本 ' + nextVer(cur.ver, false) + '。');
    if (!ok) return;

    t.versions.push({
      ver: nextVer(cur.ver, false),
      time: Date.now(),
      name: v.name,
      intro: v.intro || '',
      content: v.content,
      risks: v.risks || [],
      remark: '恢复自 ' + ver,
      files: (cur.files || []).slice()   // 文档附件不回滚，继承当前版本
    });
    save();
    renderAll();
    renderHistory(id);           // 刷新历史列表（新版本成为当前）
    $('hisView').hidden = true;
    $('hisList').hidden = false;
  }

  // ===== 事件绑定 =====
  function bindEvents() {
    // 新建模板
    $('tplAddBtn').addEventListener('click', () => openEditor(null));

    // 搜索视图
    bindSearch();

    // 详情视图：面包屑返回、下载 Word / PDF、风险展开
    $('crumbBack').addEventListener('click', () => showView(lastListView));
    $('dlWordBtn').addEventListener('click', downloadWord);
    $('dlPdfBtn').addEventListener('click', downloadPdf);
    $('riskList').addEventListener('click', e => {
      const more = e.target.closest('.risk-more');
      if (!more) return;
      const item = more.closest('.risk-item');
      const open = item.classList.toggle('open');
      more.textContent = open ? '收起' : '展开';
    });

    // 上传 Word 文档
    $('tplUploadBtn').addEventListener('click', () => $('tplFileInput').click());
    $('tplFileInput').addEventListener('change', e => {
      addFiles(e.target.files, false);   // 支持多选
      e.target.value = '';   // 允许连续选择同一文件
    });

    // 上传 PDF：仅接受 .pdf，支持多选；保存后详情页左侧原样展示
    $('tplUploadPdfBtn').addEventListener('click', () => $('tplPdfFileInput').click());
    $('tplPdfFileInput').addEventListener('change', e => {
      addFiles(e.target.files, true);
      e.target.value = '';
    });

    // 已上传文件列表：点击 × 移除对应文件
    $('tplFileList').addEventListener('click', e => {
      const btn = e.target.closest('.tpl-file-remove');
      if (btn) removeFileAt(Number(btn.dataset.idx));
    });

    // 编辑抽屉
    $('tplDrawerClose').addEventListener('click', closeEditor);
    $('tplCancelBtn').addEventListener('click', closeEditor);
    $('tplSaveBtn').addEventListener('click', saveTpl);
    $('tplDrawerMask').addEventListener('click', e => {
      if (e.target === $('tplDrawerMask')) closeEditor();
    });

    // 历史抽屉
    $('hisClose').addEventListener('click', () => { $('hisDrawerMask').hidden = true; });
    $('hisDrawerMask').addEventListener('click', e => {
      if (e.target === $('hisDrawerMask')) $('hisDrawerMask').hidden = true;
    });
    $('hisViewBack').addEventListener('click', () => {
      $('hisView').hidden = true;
      $('hisList').hidden = false;
    });

    // 分类筛选（事件委托）
    $('tplCats').addEventListener('click', e => {
      const btn = e.target.closest('.tpl-cat');
      if (!btn) return;
      curCat = btn.dataset.cat;
      renderAll();
    });

    // 模板卡片操作（事件委托）
    $('tplGrid').addEventListener('click', e => {
      const btn = e.target.closest('.tpl-act');
      if (!btn) {
        // 点击条目主体（非操作按钮）→ 进入详情
        const row = e.target.closest('.tpl-row');
        if (row) openDetail(row.dataset.id);
        return;
      }
      const id = btn.dataset.id;
      const act = btn.dataset.act;

      if (act === 'view') openDetail(id);

      if (act === 'edit') openEditor(id);

      if (act === 'history') openHistory(id);

      if (act === 'del') {
        const t = byId(id);
        if (!t) return;
        const ok = window.confirm('删除模板「' + curVer(t).name + '」及其全部 ' +
          t.versions.length + ' 个版本？删除后不可恢复。');
        if (!ok) return;
        try {
          templates = templates.filter(x => x.id !== id);
          save();
        } catch (e) {
          alert('删除时保存数据出错：' + e.message);
        }
        renderAll();   // 无论保存是否报错，都保证界面恢复
      }
    });

    // 历史抽屉内的 查看 / 恢复（事件委托）
    $('hisDrawerMask').addEventListener('click', e => {
      const btn = e.target.closest('.tpl-act[data-his]');
      if (!btn) return;
      const id = btn.dataset.id;
      const ver = btn.dataset.ver;
      if (btn.dataset.his === 'view') viewVersion(id, ver);
      if (btn.dataset.his === 'restore') restoreVersion(id, ver);
    });
  }

  bindEvents();
  renderAll();
})();
