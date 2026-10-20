// ===== 铁路供应商管理模块脚本 =====
// 列表页（railway.html）：检索卡片 + 台账卡片（搜索 / 分页 / 导出 / 新增 / 编辑 / 删除）
// 详情页（railway-detail.html?id=xxx）：概览头 + 工商基本信息 + 企业介绍 + 对接人（✎ 编辑）
// 数据持久化：localStorage（hz_railway_suppliers），{__version, list} 包装格式
(function () {
  'use strict';

  var STORAGE_KEY = 'hz_railway_suppliers';
  var VERSION = 'v12';   // v12：通道运输成本表「状态」列改为「运输通道」

  // ===== 种子数据（沧港铁路 / 建投多式联运）=====
  var SEED = [
    {
      id: 'rs-canggang',
      name: '沧州沧港铁路有限公司',
      shortName: '沧港铁路',
      site: 'https://www.czcgtl.com',
      facts: [
        { label: '统一社会信用代码', value: '91130983695867945E', mono: true },
        { label: '法定代表人', value: '刘永亮' },
        { label: '注册资本', value: '34788.47万元' },
        { label: '成立日期', value: '2009-10-22' },
        { label: '经营状态', value: '存续', ok: true },
        { label: '企业类型', value: '有限责任公司（台港澳与境内合资）' },
        { label: '注册地址', value: '河北省沧州市黄骅市羊二庄镇杨庄火车站' },
        { label: '国标行业', value: '装卸搬运' },
        { label: '企业规模', value: '大型' },
        { label: '主营业务', value: '铁路货运' },
        { label: '辅助业务', value: '装卸；道路货运；建设、保养及维修等' }
      ],
      intro: [
        '国内首家地方铁路上市公司。以河北省为基地，核心运营沧港铁路货运系统，连接京沪铁路与黄骅港，承担"西煤东运"重要任务。2026年，开通黄骅港至冀中南铁矿石运输新通道，依托沧港铁路成熟既有路网资源，成功构建起黄骅港进口铁矿石经京沪铁路直达冀中南地区的海铁联运新链路。'
      ],
      fees: {
        items: [
          '1、铁路运输包干服务费用包括以下内容：',
          '（1）邯黄运输综合服务费 13 元/吨（含 9% 的税）。',
          '（2）沧港运输综合服务费 13.75 元/吨（其中铁路运费 11.65 元/吨，含 9% 的税；取送车费 2.1 元/吨，含 6% 的税）。',
          '（3）沧州站经国铁到乙方指定到站运费如下（含 9% 的税）：'
        ],
        tables: [
          {
            headers: ['车型', '发站', '到站', '固定单价（元/箱）'],
            rows: [
              ['70吨级', '沧州', '武安', '1675.84'],
              ['70吨级', '沧州', '康城', '1657.28'],
              ['70吨级', '沧州', '磁山', '1717.44'],
              ['60吨级', '沧州', '武安', '1416.42'],
              ['60吨级', '沧州', '康城', '1401.03'],
              ['60吨级', '沧州', '磁山', '1451.79']
            ]
          },
          {
            title: '2、通道运输成本',
            headers: ['运输通道', '综合运输成本（元/吨）', '铁路运费（元/吨）', '装卸费（元/吨）', '短倒费（元/吨）'],
            rows: [
              ['保税状态（黄骅港经沧港铁路至武安保税）', '87.1', '79.1', '8', '—'],
              ['非保税状态（黄骅港经沧港铁路至武安钢厂）', '95.1', '79.1', '6', '10']
            ]
          }
        ]
      },
      persons: [
        { name: '苏轶州', role: '', tel: '18032717609' }
      ]
    },
    {
      id: 'rs-jiandou',
      name: '河北建投交通多式联运有限责任公司',
      shortName: '建投多式联运',
      site: '',
      facts: [
        { label: '统一社会信用代码', value: '91130104MAK95D1R1W', mono: true },
        { label: '法定代表人', value: '杨晓乐' },
        { label: '注册资本', value: '5000万元' },
        { label: '成立日期', value: '2026-03-23' },
        { label: '经营状态', value: '存续', ok: true },
        { label: '企业类型', value: '有限责任公司（非自然人投资或控股的法人独资）' },
        { label: '注册地址', value: '河北省石家庄市桥西区' },
        { label: '国标行业', value: '集装箱道路运输' },
        { label: '企业规模', value: '中型' },
        { label: '主营业务', value: '多式联运、国际班列运输、数字化与供应链物流' },
        { label: '辅助业务', value: '仓储与集散；物流园与货场运营；综合物流服务' }
      ],
      intro: [
        '由河北建投交通投资有限责任公司100%控股。依托邯黄铁路、和邢铁路、建投铁路为核心资源，着力构建"通道+枢纽+平台"现代化物流体系。',
        '以公铁、铁海联运为核心任务，开展中欧、中亚国际班列运输业务，打通货源揽收、干线运输、仓储集散、末端配送一体化物流体系。'
      ],
      fees: {
        items: [
          '运费实行包干价结算，包括从渤海西站至曹庄镇站铁路运输的各项费用（不含港杂）44 元/吨（含税 9%）、到站装卸及服务费 6.6 元/吨（含税 6%）。'
        ],
        tables: []
      },
      persons: [
        { name: '杨婉莹', role: '市场开发部', tel: '19930587087' }
      ]
    }
  ];

  // ===== 状态 =====
  var suppliers = [];

  // ===== 工具 =====
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function $(sel) { return document.querySelector(sel); }

  var toastTimer = null;
  function toast(msg) {
    var t = $('#rsToast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('show'); }, 2200);
  }

  function uid(prefix) {
    return prefix + '-' + Date.now().toString(36) + '-' + Math.floor(Math.random() * 1e4).toString(36);
  }

  // 从 facts 中按字段名取值
  function factGet(s, label) {
    var facts = s.facts || [];
    for (var i = 0; i < facts.length; i++) {
      if (facts[i].label === label) return facts[i].value || '';
    }
    return '';
  }

  // ===== 导航栏选中态 =====
  var NAV_PATH = '铁路供应商管理';

  function setActiveNav() {
    var navbar = document.getElementById('navbar');
    if (!navbar) return;
    navbar.querySelectorAll('.nav-item.active, .nav-sub-item.active')
      .forEach(function (el) { el.classList.remove('active'); });
    navbar.querySelectorAll('.nav-item').forEach(function (item) {
      if ((item.dataset.path || '') === NAV_PATH) item.classList.add('active');
    });
  }

  var navbar = document.getElementById('navbar');
  if (navbar && navbar.children.length) setActiveNav();
  else document.addEventListener('navbar:loaded', setActiveNav, { once: true });

  // ===== 数据读写 =====
  function loadData() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        var parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.list) && parsed.__version === VERSION) {
          suppliers = parsed.list;
          return;
        }
      }
    } catch (e) { /* 降级到种子数据 */ }
    suppliers = JSON.parse(JSON.stringify(SEED));
    saveData();
  }

  function saveData() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ __version: VERSION, list: suppliers }));
    } catch (e) {
      toast('⚠ 本地存储写入失败，数据仅保留在当前页面');
    }
  }

  function findSupplier(id) {
    return suppliers.find(function (x) { return x.id === id; }) || null;
  }

  // ===== 弹窗（列表 / 详情共用） =====
  var modalMode = null;

  function openModal(title, bodyHtml, onOk) {
    modalMode = onOk;
    $('#rsModalTitle').textContent = title;
    $('#rsModalBody').innerHTML = bodyHtml;
    $('#rsMask').hidden = false;
  }
  function closeModal() {
    $('#rsMask').hidden = true;
    modalMode = null;
  }

  function rowHtml(cls, a, b) {
    return '<div class="rs-row" data-kind="' + cls + '">'
      + '<input value="' + esc(a) + '" placeholder="' + (cls === 'fact' ? '字段名' : '姓名') + '">'
      + '<input value="' + esc(b) + '" placeholder="' + (cls === 'fact' ? '内容' : '职务') + '">'
      + (cls === 'person' ? '<input class="w-tel" value="" placeholder="电话" style="max-width:130px">' : '')
      + '<button class="rs-row-del" title="删除">✕</button></div>';
  }

  // 费用表格行（cols 列）
  function feeRowHtml(cols, vals) {
    vals = vals || [];
    var inputs = '';
    for (var i = 0; i < cols; i++) inputs += '<input value="' + esc(vals[i] || '') + '">';
    return '<div class="rs-row rs-fee-row">' + inputs
      + '<button class="rs-row-del" title="删除">✕</button></div>';
  }

  // 单个费用表格的编辑块（列名 + 行 + 增删），弹窗与委托共用
  function feeTableHtml(t) {
    t = t || { headers: [], rows: [] };
    var cols = t.headers.length || 1;
    return '<div class="rs-fee-tbl" style="border:1px solid var(--gray-300);border-radius:8px;padding:10px;margin-bottom:10px;">'
      + '<div class="rs-form-item"><label>表格标题（显示在表格上方；留空则不显示）</label>'
      + '<input class="ft-title" value="' + esc(t.title || '') + '"></div>'
      + '<div class="rs-form-item"><label>表格列名（英文/中文逗号分隔；留空则不保存该表格）</label>'
      + '<input class="ft-headers" value="' + esc((t.headers || []).join('，')) + '"></div>'
      + '<div class="ft-rows">' + (t.rows || []).map(function (r) { return feeRowHtml(cols, r); }).join('') + '</div>'
      + '<div style="display:flex;gap:10px;align-items:center;">'
      + '<button class="rs-row-add" data-addrow="feeRow">＋ 添加表格行</button>'
      + '<button class="rs-row-add ft-deltbl" type="button">✕ 删除该表格</button>'
      + '</div></div>';
  }

  // ============================================================
  // 详情模式：railway-detail.html?id=xxx
  // ============================================================
  var detailPanel = document.getElementById('detailPanel');

  function currentDetail() {
    return findSupplier(new URLSearchParams(location.search).get('id'));
  }

  function renderDetail() {
    var s = currentDetail();

    if (!s) {
      detailPanel.innerHTML = '<div style="padding:40px 0;text-align:center;color:var(--gray-500);">' +
        '供应商不存在或已被删除，请返回列表刷新。</div>';
      return;
    }

    // 铁路各项费用板块（文字条目 + 可选多表格）
    var fees = s.fees || {};
    var feeTables = (fees.tables || []).filter(function (t) {
      return t && t.headers && t.headers.length && t.rows && t.rows.length;
    });
    var hasItems = fees.items && fees.items.length;
    var hasTable = feeTables.length > 0;

    var feesHtml = '<section class="rs-card rs-fees">'
      + '<div class="rs-card-head"><div class="rs-card-title">铁路各项费用</div>'
      + '  <button class="rs-icon-btn" data-edit="fees" title="编辑">✎</button></div>';

    if (hasItems) {
      feesHtml += '<ul class="rs-fees-items">' + fees.items.map(function (it) {
        var chapter = /^(?:[一二三四五六七八九十]+|\d+)、/.test(it);   // 「一、」「2、」层级标题加粗
        return '<li' + (chapter ? ' class="rs-fee-chapter"' : '') + '>' + esc(it) + '</li>';
      }).join('') + '</ul>';
    }

    feeTables.forEach(function (feeTable) {
      // 表格标题（如「2、通道运输成本」）
      if (feeTable.title) {
        feesHtml += '<div class="rs-fee-title">' + esc(feeTable.title) + '</div>';
      }
      // 首列连续相同值纵向合并（rowspan），0 表示该行首列已被上方合并
      var feeRows = feeTable.rows;
      var mergeSpans = [];
      (function () {
        var r = 0;
        while (r < feeRows.length) {
          var v = feeRows[r][0] == null ? '' : String(feeRows[r][0]);
          var span = 1;
          while (r + span < feeRows.length && v !== '' && String(feeRows[r + span][0]) === v) span++;
          mergeSpans.push(span);
          for (var k = 1; k < span; k++) mergeSpans.push(0);
          r += span;
        }
      })();

      feesHtml += '<div class="rs-fees-table-wrap"><table class="rs-fees-table"><thead><tr>'
        + feeTable.headers.map(function (h) { return '<th>' + esc(h) + '</th>'; }).join('')
        + '</tr></thead><tbody>'
        + feeRows.map(function (row, ri) {
            var firstTd = mergeSpans[ri] > 0
              ? '<td rowspan="' + mergeSpans[ri] + '">' + esc(row[0] == null ? '' : row[0]) + '</td>'
              : '';
            return '<tr>' + firstTd + feeTable.headers.slice(1).map(function (_, i) {
              var v = row[i + 1] == null ? '' : String(row[i + 1]);
              var num = /^[\d,]+(\.\d+)?$/.test(v);
              return '<td' + (num ? ' class="num"' : '') + '>' + esc(v) + '</td>';
            }).join('') + '</tr>';
          }).join('')
        + '</tbody></table></div>';
    });

    if (!hasItems && !hasTable) feesHtml += '<div class="rs-fees-empty">暂无费用数据，点击右上角 ✎ 添加</div>';
    feesHtml += '</section>';

    detailPanel.innerHTML = ''
      // 概览头
      + '<section class="rs-hero">'
      + '  <div class="rs-hero-info">'
      + '    <div class="rs-hero-name">' + esc(s.name) + '</div>'
      + '    <div class="rs-hero-sub">简称：' + esc(s.shortName || '—')
      + (s.site ? '　<a class="rs-hero-site" href="' + esc(s.site) + '" target="_blank" rel="noopener">官网 →</a>' : '')
      + '    </div>'
      + '  </div>'
      + '</section>'

      // 工商基本信息
      + '<section class="rs-card">'
      + '  <div class="rs-card-head"><div class="rs-card-title">工商基本信息</div>'
      + '    <button class="rs-icon-btn" data-edit="facts" title="编辑">✎</button></div>'
      + '  <div class="rs-facts">' + (s.facts || []).map(function (f) {
        var v;
        if (f.ok) v = '<span class="rs-badge-ok">' + esc(f.value) + '</span>';
        else v = esc(f.value);
        return '<div class="rs-fact"><span class="rs-fact-label">' + esc(f.label) + '</span>'
          + '<span class="rs-fact-value' + (f.mono ? ' mono' : '') + '">' + v + '</span></div>';
      }).join('') + '</div>'
      + '</section>'

      // 企业介绍 + 对接人
      + '<div class="rs-duo">'
      + '  <section class="rs-card">'
      + '    <div class="rs-card-head"><div class="rs-card-title">企业介绍</div>'
      + '      <button class="rs-icon-btn" data-edit="intro" title="编辑">✎</button></div>'
      + '    <div class="rs-intro">' + (s.intro || []).map(function (p) { return '<p>' + esc(p) + '</p>'; }).join('') + '</div>'
      + '  </section>'
      + '  <section class="rs-card">'
      + '    <div class="rs-card-head"><div class="rs-card-title">对接人</div>'
      + '      <button class="rs-icon-btn" data-edit="persons" title="编辑">✎</button></div>'
      + '    <div class="rs-persons">' + (s.persons || []).map(function (p) {
        return '<div class="rs-person">'
          + '<div class="rs-person-avatar">' + esc((p.name || '?').charAt(0)) + '</div>'
          + '<div class="rs-person-main"><div class="rs-person-name">' + esc(p.name) + '</div>'
          + (p.role ? '<div class="rs-person-role">' + esc(p.role) + '</div>' : '') + '</div>'
          + (p.tel ? '<div class="rs-person-tel">☎️ ' + esc(p.tel) + '</div>' : '')
          + '</div>';
      }).join('') + '</div>'
      + '  </section>'
      + '</div>'

      // 铁路各项费用
      + feesHtml;
  }

  // ===== 详情页各编辑器 =====
  function openEdit(key) {
    var s = currentDetail();
    if (!s) return;

    if (key === 'facts') {
      openModal('编辑工商基本信息',
        '<div id="f-fact-rows">' + (s.facts || []).map(function (f) { return rowHtml('fact', f.label, f.value); }).join('') + '</div>'
        + '<button class="rs-row-add" data-addrow="fact">＋ 添加字段</button>',
        function () {
          s.facts = [].slice.call(document.querySelectorAll('#f-fact-rows .rs-row')).map(function (r) {
            var ins = r.querySelectorAll('input');
            var label = ins[0].value.trim(), value = ins[1].value.trim();
            if (!label && !value) return null;
            return { label: label || value, value: value || '—', mono: /代码|编号/.test(label) };
          }).filter(Boolean);
          saveData(); renderDetail(); closeModal(); toast('✓ 已保存');
        });
    }

    if (key === 'intro') {
      openModal('编辑企业介绍',
        '<div class="rs-form-item"><label>介绍内容（空行分段）</label><textarea id="f-intro" style="min-height:220px">'
        + esc((s.intro || []).join('\n\n')) + '</textarea></div>',
        function () {
          s.intro = $('#f-intro').value.split(/\n\s*\n/).map(function (x) { return x.trim(); }).filter(Boolean);
          saveData(); renderDetail(); closeModal(); toast('✓ 已保存');
        });
    }

    if (key === 'persons') {
      openModal('编辑对接人',
        '<div id="f-person-rows">' + (s.persons || []).map(function (p) { return rowHtml('person', p.name, p.role); }).join('') + '</div>'
        + '<button class="rs-row-add" data-addrow="person">＋ 添加对接人</button>',
        function () {
          s.persons = [].slice.call(document.querySelectorAll('#f-person-rows .rs-row')).map(function (r) {
            var ins = r.querySelectorAll('input');
            var name = ins[0].value.trim();
            if (!name) return null;
            var tel = ins[2] ? ins[2].value.trim() : (r.dataset.tel || '');
            return { name: name, role: ins[1].value.trim(), tel: tel || (r.dataset.tel || '') };
          }).filter(Boolean);
          saveData(); renderDetail(); closeModal(); toast('✓ 已保存');
        });
      // 回填已有电话
      [].slice.call(document.querySelectorAll('#f-person-rows .rs-row')).forEach(function (r, i) {
        if ((s.persons || [])[i]) r.dataset.tel = s.persons[i].tel || '';
        var telInput = r.querySelector('.w-tel');
        if (telInput && (s.persons || [])[i]) telInput.value = s.persons[i].tel || '';
      });
    }

    if (key === 'fees') {
      var fees = s.fees || {};
      var tables = fees.tables || [];

      openModal('编辑铁路各项费用',
        '<div class="rs-form-item"><label>费用条目（每行一条）</label><textarea id="f-fees-items" style="min-height:150px">'
        + esc((fees.items || []).join('\n')) + '</textarea></div>'
        + '<div id="f-fee-tables">' + tables.map(feeTableHtml).join('') + '</div>'
        + '<button class="rs-row-add" data-addrow="feeTable">＋ 添加表格</button>',
        function () {
          var items = $('#f-fees-items').value.split('\n').map(function (x) { return x.trim(); }).filter(Boolean);
          var tablesOut = [];
          document.querySelectorAll('#f-fee-tables .rs-fee-tbl').forEach(function (blk) {
            var hs = blk.querySelector('.ft-headers').value.split(/[,，]/).map(function (x) { return x.trim(); }).filter(Boolean);
            if (!hs.length) return;
            var title = blk.querySelector('.ft-title').value.trim();
            var rows = [].slice.call(blk.querySelectorAll('.ft-rows .rs-row')).map(function (r) {
              return [].slice.call(r.querySelectorAll('input')).map(function (i) { return i.value.trim(); });
            }).filter(function (r) { return r.some(function (v) { return v; }); })
              .map(function (r) {
                var out = [];
                for (var i = 0; i < hs.length; i++) out.push(r[i] || '');
                return out;
              });
            tablesOut.push(title ? { title: title, headers: hs, rows: rows } : { headers: hs, rows: rows });
          });
          s.fees = { items: items, tables: tablesOut };
          saveData(); renderDetail(); closeModal(); toast('✓ 已保存');
        });
    }
  }

  // ============================================================
  // 列表模式：railway.html
  // ============================================================
  var tbody = document.querySelector('.ledger-table tbody');
  var applyFilter = null;

  // 由供应商对象构造表格行
  function renderRow(s) {
    var tr = document.createElement('tr');
    tr.dataset.id = s.id;
    tr.dataset.name = (s.name || '') + ' ' + (s.shortName || '');
    tr.dataset.industry = factGet(s, '国标行业');

    tr.innerHTML = [
      '<td class="col-index"></td>',
      '<td class="col-name"><a class="rs-link" href="/railway/railway-detail.html?id=' + encodeURIComponent(s.id) + '">' +
        esc(s.name) + '</a></td>',
      '<td class="col-legal">' + (esc(factGet(s, '法定代表人')) || '—') + '</td>',
      '<td class="col-capital">' + (esc(factGet(s, '注册资本')) || '—') + '</td>',
      '<td class="col-industry">' + (esc(tr.dataset.industry) || '—') + '</td>',
      '<td class="col-action"><div class="cell-actions">' +
        '<button class="row-act detail" type="button">详情</button>' +
        '<button class="row-act edit" type="button">编辑</button>' +
        '<button class="row-act del" type="button">删除</button>' +
      '</div></td>'
    ].join('');
    return tr;
  }

  // 按当前数据全量重建表格（新增 / 编辑 / 删除后统一走这里）
  function renderAll() {
    tbody.querySelectorAll('tr:not(.empty-row)').forEach(function (row) { row.remove(); });
    suppliers.forEach(function (s) { tbody.appendChild(renderRow(s)); });

    // 重新编号（按当前展示顺序）
    var i = 0;
    tbody.querySelectorAll('tr:not(.empty-row)').forEach(function (row) {
      row.querySelector('.col-index').textContent = ++i;
    });

    $('#rsCount').textContent = suppliers.length;
    var emptyRow = tbody.querySelector('.empty-row');
    if (emptyRow) emptyRow.hidden = suppliers.length > 0;
    if (applyFilter) applyFilter();
  }

  // ===== 检索 =====
  function initSearch() {
    var form = document.getElementById('searchForm');
    if (!form) return;

    var nameInput = document.getElementById('searchName');
    var indInput = document.getElementById('searchIndustry');

    applyFilter = function () {
      var keywords = (nameInput.value || '').trim().toLowerCase().split(/\s+/).filter(Boolean);
      var ind = (indInput.value || '').trim().toLowerCase();

      var visible = 0;
      document.querySelectorAll('.ledger-table tbody tr').forEach(function (row) {
        if (row.classList.contains('empty-row')) return;

        var text = row.textContent.toLowerCase() + ' ' +
          Object.values(row.dataset).join(' ').toLowerCase();
        var ok =
          keywords.every(function (kw) { return text.includes(kw); }) &&
          (!ind || (row.dataset.industry || '').toLowerCase().includes(ind));

        row.hidden = !ok;
        // 标记「被检索过滤」的行：与分页隐藏区分，保证导出覆盖完整筛选结果
        if (ok) delete row.dataset.filtered;
        else row.dataset.filtered = '1';
        if (ok) visible += 1;
      });

      var emptyRow = document.querySelector('.ledger-table .empty-row');
      if (emptyRow) emptyRow.hidden = visible > 0;

      renderPage();
    };

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      applyFilter();
    });

    form.addEventListener('reset', function () {
      requestAnimationFrame(function () { applyFilter(); });
    });
  }

  // ===== 分页（基于检索后的可见行切片显示） =====
  var pageSize = 10;
  var curPage = 1;

  function renderPage() {
    var rows = Array.from(tbody.querySelectorAll('tr:not(.empty-row)')).filter(function (r) { return !r.hidden; });

    var total = rows.length;
    var pages = Math.max(1, Math.ceil(total / pageSize));
    if (curPage > pages) curPage = pages;
    if (curPage < 1) curPage = 1;

    var start = (curPage - 1) * pageSize;
    rows.forEach(function (r, i) {
      r.hidden = i < start || i >= start + pageSize;
    });

    $('#pagerTotal').textContent = total;
    $('#pgPages').textContent = pages;
    $('#pgInput').value = curPage;
    $('#pgInput').max = pages;
    $('#pgFirst').disabled = curPage <= 1;
    $('#pgPrev').disabled = curPage <= 1;
    $('#pgNext').disabled = curPage >= pages;
    $('#pgLast').disabled = curPage >= pages;
  }

  function bindPager() {
    var pages = function () { return Math.max(1, Number($('#pgPages').textContent) || 1); };
    var go = function (p) { curPage = p; renderPage(); };

    $('#pgFirst').addEventListener('click', function () { go(1); });
    $('#pgPrev').addEventListener('click', function () { go(curPage - 1); });
    $('#pgNext').addEventListener('click', function () { go(curPage + 1); });
    $('#pgLast').addEventListener('click', function () { go(pages()); });

    $('#pageSize').addEventListener('change', function (e) {
      pageSize = Number(e.target.value) || 10;
      curPage = 1;
      renderPage();
    });

    var jump = function () {
      var p = parseInt($('#pgInput').value, 10);
      if (isNaN(p)) p = curPage;
      go(Math.min(Math.max(p, 1), pages()));
    };
    $('#pgInput').addEventListener('change', jump);
    $('#pgInput').addEventListener('keydown', function (e) { if (e.key === 'Enter') jump(); });
  }

  // ===== 新增 / 编辑 / 删除供应商 =====
  function addSupplier() {
    openModal('新增供应商',
      '<div class="rs-form-item"><label>企业全称</label><input id="f-name" placeholder="如：XX铁路有限公司"></div>'
      + '<div class="rs-form-item"><label>企业简称</label><input id="f-short" placeholder="如：XX铁路"></div>'
      + '<div class="rs-form-item"><label>官网地址（选填）</label><input id="f-site" placeholder="https://"></div>',
      function () {
        var name = $('#f-name').value.trim();
        if (!name) { toast('⚠ 企业名称不能为空'); return false; }
        suppliers.push({
          id: uid('rs'), name: name,
          shortName: $('#f-short').value.trim() || name,
          site: $('#f-site').value.trim(),
          facts: [], intro: [], persons: []
        });
        saveData(); renderAll(); closeModal();
        toast('✓ 已新增，点击名称进入详情补充信息');
      });
  }

  function editSupplier(id) {
    var s = findSupplier(id);
    if (!s) return;
    openModal('编辑供应商',
      '<div class="rs-form-item"><label>企业全称</label><input id="f-name" value="' + esc(s.name) + '"></div>'
      + '<div class="rs-form-item"><label>企业简称</label><input id="f-short" value="' + esc(s.shortName || '') + '"></div>'
      + '<div class="rs-form-item"><label>官网地址</label><input id="f-site" value="' + esc(s.site || '') + '" placeholder="https://"></div>',
      function () {
        var name = $('#f-name').value.trim();
        if (!name) { toast('⚠ 企业名称不能为空'); return false; }
        s.name = name;
        s.shortName = $('#f-short').value.trim() || name;
        s.site = $('#f-site').value.trim();
        saveData(); renderAll(); closeModal(); toast('✓ 已保存');
      });
  }

  function delSupplier(id) {
    var s = findSupplier(id);
    if (!s) return;
    if (!confirm('确定删除「' + (s.shortName || s.name) + '」吗？删除后无法恢复。')) return;
    suppliers = suppliers.filter(function (x) { return x.id !== id; });
    saveData(); renderAll(); toast('已删除');
  }

  // ===== 表格操作（事件委托） =====
  function initTableActions() {
    tbody.addEventListener('click', function (e) {
      var row = e.target.closest('tr[data-id]');
      if (!row) return;

      // 详情：表格内统一入口（名称链接与详情按钮）
      if (e.target.closest('.row-act.detail')) {
        location.href = '/railway/railway-detail.html?id=' + encodeURIComponent(row.dataset.id);
        return;
      }
      if (e.target.closest('.row-act.edit')) { editSupplier(row.dataset.id); return; }
      if (e.target.closest('.row-act.del')) { delSupplier(row.dataset.id); return; }
    });
  }

  // ===== 导出 Excel：导出当前筛选结果 =====
  function initExport() {
    var btn = $('#exportBtn');
    if (!btn) return;

    btn.addEventListener('click', function () {
      if (!suppliers.length) { alert('暂无供应商数据可导出'); return; }
      if (!window.XLSX) { alert('导出组件加载失败，请刷新页面后重试'); return; }

      // 导出当前筛选结果：仅排除被检索过滤的行（data-filtered），包含分页未展示的行
      var visibleIds = [];
      tbody.querySelectorAll('tr[data-id]').forEach(function (row) {
        if (!row.dataset.filtered) visibleIds.push(row.dataset.id);
      });
      var list = suppliers.filter(function (s) { return visibleIds.includes(s.id); });

      if (!list.length) { alert('当前筛选条件下暂无可导出的供应商数据'); return; }
      if (!confirm('将导出当前筛选结果 ' + list.length + ' 家供应商，是否继续？')) return;

      var headers = [
        '序号', '企业名称', '企业简称', '统一社会信用代码', '法定代表人',
        '注册资本', '成立日期', '经营状态', '企业类型', '注册地址', '国标行业', '企业规模',
        '主营业务', '辅助业务', '官网', '对接人', '对接人电话'
      ];

      var rows = list.map(function (s, i) {
        var p0 = (s.persons || [])[0] || {};
        return [
          i + 1, s.name, s.shortName || '',
          factGet(s, '统一社会信用代码'), factGet(s, '法定代表人'),
          factGet(s, '注册资本'), factGet(s, '成立日期'), factGet(s, '经营状态'),
          factGet(s, '企业类型'), factGet(s, '注册地址'), factGet(s, '国标行业'),
          factGet(s, '企业规模'), factGet(s, '主营业务'), factGet(s, '辅助业务'),
          s.site || '', p0.name || '', p0.tel || ''
        ];
      });

      var ws = XLSX.utils.aoa_to_sheet([headers].concat(rows));
      ws['!cols'] = [
        { wch: 6 }, { wch: 34 }, { wch: 14 }, { wch: 24 }, { wch: 10 },
        { wch: 14 }, { wch: 12 }, { wch: 8 }, { wch: 34 }, { wch: 34 }, { wch: 16 }, { wch: 8 },
        { wch: 30 }, { wch: 30 }, { wch: 24 }, { wch: 10 }, { wch: 14 }
      ];

      var wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, '铁路供应商台账');

      var dt = new Date();
      var stamp = dt.getFullYear() +
        String(dt.getMonth() + 1).padStart(2, '0') +
        String(dt.getDate()).padStart(2, '0');
      XLSX.writeFile(wb, '铁路供应商台账_' + stamp + '.xlsx');
    });
  }

  // ===== 事件绑定（弹窗 / 详情编辑，列表 / 详情共用） =====
  document.addEventListener('click', function (e) {
    var t = e.target;

    var addRow = t.closest('[data-addrow]');
    if (addRow) {
      var kind = addRow.getAttribute('data-addrow');
      if (kind === 'feeRow') {
        // 添加到最近的表格块，按该块列名输入框当前内容确定列数
        var blk = t.closest('.rs-fee-tbl');
        if (!blk) return;
        var cols = blk.querySelector('.ft-headers').value.split(/[,，]/).filter(function (x) { return x.trim(); }).length || 1;
        blk.querySelector('.ft-rows').insertAdjacentHTML('beforeend', feeRowHtml(cols, []));
      } else if (kind === 'feeTable') {
        $('#f-fee-tables').insertAdjacentHTML('beforeend', feeTableHtml(null));
      } else {
        $('#f-' + kind + '-rows').insertAdjacentHTML('beforeend', rowHtml(kind, '', ''));
      }
      return;
    }

    if (t.closest('.ft-deltbl')) { t.closest('.rs-fee-tbl').remove(); return; }
    if (t.closest('.rs-row-del')) { t.closest('.rs-row').remove(); return; }

    if (t.id === 'rsModalSave' && modalMode) { modalMode(); return; }
    if (t.id === 'rsModalCancel' || t.id === 'rsModalClose') { closeModal(); return; }
    if (t.id === 'rsMask') { closeModal(); return; }

    // 详情页 ✎ 编辑
    var editBtn = t.closest('[data-edit]');
    if (editBtn) { openEdit(editBtn.getAttribute('data-edit')); return; }
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !$('#rsMask').hidden) closeModal();
  });

  // ===== 初始化 =====
  loadData();

  if (detailPanel) {
    // 详情模式
    renderDetail();

    $('#backBtn').addEventListener('click', function () {
      location.href = '/railway/railway.html';
    });
  } else {
    // 列表模式
    initSearch();
    initTableActions();
    initExport();
    bindPager();
    renderAll();
  }

  var addBtn = $('#rsAdd');
  if (addBtn) addBtn.addEventListener('click', addSupplier);
})();
