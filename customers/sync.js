// ===== 一次性数据同步控制台脚本 =====
// 依赖：common/fetch.js（导航栏）、customers/sync-engine.js（引擎）
// 职责：进度可视化（阶段管道/总进度/模块清单/实时日志）、报告查看与下载、
//       断点续传控制、测试数据注入/清除（仅测试环境使用）
(function () {
  'use strict';

  var S = window.HZCustomerSync;
  var NAV_PATH = '客户管理';

  /* ==================== 工具 ==================== */

  function $(id) { return document.getElementById(id); }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function fmtTime(ts) {
    var d = new Date(ts);
    var p = function (n) { return String(n).padStart(2, '0'); };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' +
      p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
  }

  function fmtDur(ms) {
    if (ms == null) return '—';
    return ms < 1000 ? ms + 'ms' : (ms / 1000).toFixed(1) + 's';
  }

  var toastTimer = null;
  function toast(msg, type) {
    var t = $('toast');
    t.textContent = msg;
    t.className = 'toast show' + (type ? ' ' + type : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.className = 'toast'; }, 2800);
  }

  /* ==================== 导航选中态 ==================== */

  function setActiveNav() {
    var navbar = document.getElementById('navbar');
    if (!navbar) return;
    navbar.querySelectorAll('.active').forEach(function (el) { el.classList.remove('active'); });
    var item = navbar.querySelector('[data-path="' + NAV_PATH + '"]');
    if (item) item.classList.add('active');
  }
  var navbar = document.getElementById('navbar');
  if (navbar && navbar.children.length) setActiveNav();
  else document.addEventListener('navbar:loaded', setActiveNav, { once: true });

  /* ==================== 状态与渲染 ==================== */

  var PHASES = [['extract', '读取与提取'], ['merge', '合并去重'], ['backup', '快照备份'], ['write', '写入统一库'], ['report', '生成报告']];
  var PHASE_ORDER = { extract: 0, merge: 1, backup: 2, write: 3, report: 4 };
  var PHASE_TEXT = {
    extract: '读取与提取（含 L1-L5 多层校验过滤）', merge: '合并去重', backup: '快照备份',
    write: '写入统一库', report: '生成报告与日志', done: '同步完成', failed: '同步失败'
  };
  var ST_TEXT = { pending: '待处理', running: '进行中', done: '完成', error: '异常' };

  var lastReport = null;
  var timerId = null;

  function renderPipe(phase, failFrom) {
    var curIdx;
    if (phase === 'done') curIdx = PHASES.length;
    else if (phase === 'failed') curIdx = PHASE_ORDER[failFrom] != null ? PHASE_ORDER[failFrom] : PHASES.length;
    else curIdx = PHASE_ORDER[phase] != null ? PHASE_ORDER[phase] : -1;

    var html = '';
    PHASES.forEach(function (p, i) {
      if (i > 0) html += '<span class="pipe-sep' + (i <= curIdx ? ' done' : '') + '"></span>';
      var cls = i < curIdx ? 'done' : (i === curIdx ? (phase === 'failed' ? 'error' : 'active') : '');
      var dot = i < curIdx ? '✓' : (i + 1);
      html += '<div class="pipe-step ' + cls + '"><span class="pipe-dot">' + dot + '</span>' + p[1] + '</div>';
    });
    $('pipe').innerHTML = html;
  }

  function renderProgress(st) {
    var pct = st ? st.percent : 0;
    $('progBar').style.width = pct + '%';
    $('progPercent').textContent = pct + '%';
    $('progPhase').textContent = st ? (PHASE_TEXT[st.phase] || st.phase) : '待启动';
    $('progPhase').style.color = st && st.phase === 'failed' ? 'var(--color-danger)' : '';

    if (!st) { $('progMeta').innerHTML = ''; return; }
    var t = st.totals || {};
    var endTs = st.phase === 'done' || st.phase === 'failed' ? (st.finished_at || Date.now()) : Date.now();
    $('progMeta').innerHTML =
      '<span>批次 <b>' + esc(st.batch_id) + '</b>' + (st.resumed ? '（续传）' : '') + '</span>' +
      '<span>开始 <b>' + fmtTime(st.started_at) + '</b></span>' +
      '<span>耗时 <b>' + fmtDur(endTs - st.started_at) + '</b></span>' +
      '<span>源记录 <b>' + (t.source_records || 0) + '</b></span>' +
      '<span>候选 <b>' + (t.candidates || 0) + '</b></span>' +
      '<span>过滤 <b>' + (t.filtered || 0) + '</b></span>' +
      '<span>同步主体 <b>' + (st.phase === 'done' && t.entities != null ? t.entities : (t.passed || 0)) + '</b></span>' +
      (st.error ? '<span style="color:var(--color-danger)"><b>' + esc(st.error) + '</b></span>' : '');
  }

  function renderMods(stats) {
    var grid = $('modGrid');
    if (!stats) {
      grid.innerHTML = S.sources.map(function (s) {
        return modCard({ key: s.key, label: s.label, records: 0, candidates: 0, passed: 0, filtered: 0, errors: 0, status: 'pending' });
      }).join('');
      return;
    }
    grid.innerHTML = Object.keys(stats).map(function (k) { return modCard(stats[k]); }).join('');
  }

  function modCard(m) {
    return '<div class="mod-card ' + esc(m.status) + '">' +
      '<div class="mod-head"><span class="mod-name">' + esc(m.label) + '</span>' +
      '<span class="c-tag st-' + esc(m.status) + '">' + (ST_TEXT[m.status] || m.status) + '</span></div>' +
      '<div class="mod-stats">' +
      '<span>源记录 <b>' + (m.records || 0) + '</b></span>' +
      '<span>候选 <b>' + (m.candidates || 0) + '</b></span>' +
      '<span>同步 <b class="c-pass">' + (m.passed || 0) + '</b></span>' +
      '<span>过滤 <b class="c-filter">' + (m.filtered || 0) + '</b></span>' +
      (m.errors ? '<span>异常 <b class="c-filter">' + m.errors + '</b></span>' : '') +
      '</div></div>';
  }

  function appendLog(entry) {
    var box = $('consoleLog');
    var line = document.createElement('div');
    line.innerHTML = '<span class="lg-time">' + fmtTime(entry.ts) + '</span><span class="lg-' + esc(entry.level) + '">[' + esc(entry.level.toUpperCase()) + ']</span> ' + esc(entry.msg);
    box.appendChild(line);
    while (box.childNodes.length > 600) box.removeChild(box.firstChild);
    box.scrollTop = box.scrollHeight;
  }

  function renderAll(st) {
    renderPipe(st.phase, st.fail_from);
    renderProgress(st);
    renderMods(st.moduleStats);
    refreshButtons();
  }

  /* ==================== 按钮状态 ==================== */

  function refreshButtons() {
    var running = S.running();
    var resumable = S.hasResumable();
    $('btnStart').disabled = running;
    $('btnStart').textContent = running ? '同步执行中…' : (resumable ? '继续同步（断点续传）' : '开始同步');
    $('btnClearCp').disabled = running || !resumable;
    $('btnInject').disabled = running;
    $('btnClearTest').disabled = running;
    $('btnViewReport').disabled = !lastReport;
    $('dlLogBtn').disabled = !lastReport;
    $('dlReportBtn').disabled = !lastReport;
  }

  function refreshTestState() {
    $('testState').textContent = S.hasTestRecords()
      ? '已注入测试记录（两个集团测试主体将随同步进入统一库）'
      : '未注入测试记录';
  }

  /* ==================== 执行控制 ==================== */

  function startTimer() {
    stopTimer();
    timerId = setInterval(function () {
      var st = S.state();
      if (st) renderProgress(st);
    }, 500);
  }

  function stopTimer() { if (timerId) { clearInterval(timerId); timerId = null; } }

  function startRun() {
    var opts = {
      onProgress: function (st) { renderAll(st); },
      onLog: function (entry) { appendLog(entry); },
      onDone: function (report) {
        lastReport = report;
        stopTimer();
        renderAll(S.state());
        refreshTestState();
        openReport(report);
        downloadLog(report);   // 执行完成后自动生成并下载完整执行日志
        toast('同步完成：同步主体 ' + report.result.total + ' 条，执行日志已自动下载', 'success');
      },
      onError: function (err) {
        stopTimer();
        renderAll(S.state());
        toast(err.message || '同步失败', 'error');
      }
    };
    var r = S.start(opts);
    if (!r.ok) { toast(r.error, 'error'); return; }
    startTimer();
    toast(r.resumed ? '检测到未完成批次，已从断点续传' : '同步已启动');
  }

  /* ==================== 报告查看与下载 ==================== */

  function download(name, text, mime) {
    var blob = new Blob([text], { type: mime || 'text/plain;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 100);
  }

  function logText(report) {
    var L = [];
    L.push('泓泽宜通 SCMS · 客户管理一次性数据同步执行日志');
    L.push('批次：' + report.batch_id + '    引擎版本：' + report.engine_version);
    L.push('开始：' + fmtTime(report.started_at) + '    完成：' + fmtTime(report.finished_at) +
      '    耗时：' + fmtDur(report.duration_ms) + (report.resumed ? '（含断点续传）' : ''));
    L.push('');
    L.push('===== 执行日志 =====');
    report.log.forEach(function (e) { L.push('[' + fmtTime(e.ts) + '] [' + e.level.toUpperCase() + '] ' + e.msg); });
    L.push('');
    L.push('===== 数据统计 =====');
    L.push('源记录 ' + report.totals.source_records + ' 条 / 候选 ' + report.totals.candidates +
      ' 条 / 通过校验 ' + report.totals.passed + ' 条 / 过滤丢弃 ' + report.totals.filtered +
      ' 条 / 同步主体 ' + report.result.total + ' 条');
    report.modules.forEach(function (m) {
      L.push('  [' + m.label + '] 源记录 ' + m.records + '，候选 ' + m.candidates +
        '，同步 ' + m.passed + '，过滤 ' + m.filtered + (m.errors ? '，异常 ' + m.errors : '') +
        '  → 角色[' + m.roles.join('/') + '] 行业[' + m.industries.join('/') + ']');
    });
    if (report.filtered_detail.length) {
      L.push('----- 过滤异常清单 -----');
      report.filtered_detail.forEach(function (x) {
        L.push('  [' + x.layer + '] ' + (x.name || x.source_name) + '（' + x.module_label + ' · ' + x.reason + '）');
      });
    }
    if (report.merged_groups.length) {
      L.push('----- 合并去重明细 -----');
      report.merged_groups.forEach(function (g) {
        L.push('  ' + g.name + ' ← ' + g.modules.join('、') + '（合并 ' + g.count + ' 条候选）');
      });
    }
    L.push('===== 结果分布 =====');
    L.push('客户视图 ' + report.result.customers_view + ' 条 / 供应商视图 ' + report.result.resources_view +
      ' 条 / 统一社会信用代码覆盖 ' + report.result.with_credit_code + ' 条');
    return L.join('\n');
  }

  function downloadLog(report) {
    try { download('客户管理同步日志_' + report.batch_id + '.txt', logText(report)); } catch (e) {
      toast('自动下载被浏览器拦截，可点击「下载执行日志」手动获取', 'error');
    }
  }

  function openReport(report) {
    var r = report.result, t = report.totals;
    var html = '';

    html += '<div class="drawer-section"><div class="section-title">总览</div><div class="rpt-grid">' +
      kvItem('源记录总数', t.source_records) + kvItem('提取候选', t.candidates) +
      kvItem('通过校验', t.passed) + kvItem('过滤丢弃', t.filtered) +
      kvItem('同步主体', r.total) + kvItem('耗时', fmtDur(report.duration_ms)) +
      '</div></div>';

    html += '<div class="drawer-section"><div class="section-title">各模块同步统计（自动映射）</div>' +
      '<table class="rpt-table"><thead><tr><th>模块</th><th class="num">源记录</th><th class="num">候选</th><th class="num">同步</th><th class="num">过滤</th><th>业务角色</th><th>行业标签</th></tr></thead><tbody>' +
      report.modules.map(function (m) {
        return '<tr><td>' + esc(m.label) + '</td><td class="num">' + m.records + '</td><td class="num">' + m.candidates +
          '</td><td class="num">' + m.passed + '</td><td class="num">' + m.filtered + '</td>' +
          '<td>' + m.roles.map(roleTag).join('') + '</td><td>' + m.industries.map(indTag).join('') + '</td></tr>';
      }).join('') + '</tbody></table></div>';

    html += '<div class="drawer-section"><div class="section-title">过滤异常清单（' + report.filtered_detail.length + ' 条）</div>' +
      (report.filtered_detail.length
        ? '<table class="rpt-table"><thead><tr><th>层级</th><th>对象</th><th>来源模块</th><th>原因</th></tr></thead><tbody>' +
          report.filtered_detail.map(function (x) {
            return '<tr><td>' + esc(x.layer) + '</td><td>' + esc(x.name || x.source_name) + '</td><td>' + esc(x.module_label) + '</td><td>' + esc(x.reason) + '</td></tr>';
          }).join('') + '</tbody></table>'
        : '<div class="test-note">无过滤异常</div>') + '</div>';

    if (report.merged_groups.length) {
      html += '<div class="drawer-section"><div class="section-title">合并去重明细</div><div class="ref-list">' +
        report.merged_groups.map(function (g) {
          return '<div class="ref-item"><div class="ref-info"><div class="ref-name">' + esc(g.name) + '</div>' +
            '<div class="ref-meta">' + esc(g.modules.join('、')) + '（合并 ' + g.count + ' 条候选）</div></div></div>';
        }).join('') + '</div></div>';
    }

    html += '<div class="drawer-section"><div class="section-title">结果分布</div><div class="rpt-grid">' +
      kvItem('客户视图（付费客户）', r.customers_view) + kvItem('供应商视图', r.resources_view) +
      kvItem('信用代码覆盖', r.with_credit_code + ' / ' + r.total) +
      '</div><div class="chip-row" style="margin-top:8px">' +
      Object.keys(r.by_industry).map(function (k) { return '<span class="chip active">' + esc(k) + ' <span class="chip-count">' + r.by_industry[k] + '</span></span>'; }).join('') +
      '</div><div class="chip-row" style="margin-top:8px">' +
      Object.keys(r.by_source).map(function (k) { return '<span class="chip">' + esc(k) + ' <span class="chip-count">' + r.by_source[k] + '</span></span>'; }).join('') +
      '</div></div>';

    $('drawerBody').innerHTML = html;
    $('drawerMask').hidden = false;
  }

  function kvItem(label, value) {
    return '<div class="kv-item"><div class="kv-label">' + esc(label) + '</div><div class="kv-value">' + esc(value) + '</div></div>';
  }

  function roleTag(r) {
    return '<span class="c-tag role' + (r === '付费客户' ? ' r-cust' : '') + '" style="margin-right:4px">' + esc(r) + '</span>';
  }
  function indTag(i) { return '<span class="c-tag ind" style="margin-right:4px">' + esc(i) + '</span>'; }

  /* ==================== 事件绑定 ==================== */

  $('btnStart').addEventListener('click', startRun);

  $('btnClearCp').addEventListener('click', function () {
    S.clearCheckpoint();
    refreshButtons();
    toast('断点已清除，下次点击「开始同步」将全量重新执行');
  });

  $('btnViewReport').addEventListener('click', function () { if (lastReport) openReport(lastReport); });

  $('dlLogBtn').addEventListener('click', function () { if (lastReport) downloadLog(lastReport); });

  $('dlReportBtn').addEventListener('click', function () {
    if (!lastReport) return;
    try {
      download('客户管理同步报告_' + lastReport.batch_id + '.json', JSON.stringify(lastReport, null, 2), 'application/json;charset=utf-8');
    } catch (e) { toast('下载失败：' + e.message, 'error'); }
  });

  $('btnInject').addEventListener('click', function () {
    var r = S.testInject();
    refreshTestState();
    if (r.railway || r.steel) {
      toast('测试记录注入完成：铁路供应商 ' + (r.railway ? '✓' : '已存在') + ' / 钢厂 ' + (r.steel ? '✓' : '已存在'), 'success');
    } else {
      toast('注入跳过：存储格式异常或记录已存在', 'error');
    }
  });

  $('btnClearTest').addEventListener('click', function () {
    var r = S.testClear();
    refreshTestState();
    toast('测试记录清除完成：铁路供应商移除 ' + r.railway + ' 条 / 钢厂移除 ' + r.steel + ' 条', 'success');
  });

  // 报告抽屉关闭
  $('drawerClose').addEventListener('click', function () { $('drawerMask').hidden = true; });
  $('drawerMask').addEventListener('click', function (e) {
    if (e.target === $('drawerMask')) $('drawerMask').hidden = true;
  });

  /* ==================== 初始化 ==================== */

  (function init() {
    renderPipe(null);
    renderMods(null);

    var rep = S.lastReport();
    if (rep) {
      lastReport = rep;
      $('batchInfo').textContent = '上次同步：批次 ' + rep.batch_id + ' · ' + fmtTime(rep.finished_at) + ' · 同步主体 ' + rep.result.total + ' 条';
    }

    if (S.hasResumable()) {
      appendLog({ ts: Date.now(), level: 'warn', msg: '检测到未完成的同步批次，点击「继续同步」可从断点续传' });
      $('batchInfo').textContent = '存在未完成批次（断点续传可用）';
    }

    refreshTestState();
    refreshButtons();
  })();
})();
