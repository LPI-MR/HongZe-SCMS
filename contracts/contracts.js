// ===== contracts 模块脚本 =====
// 公共导航栏由 /common/fetch.js 加载；本脚本负责本模块自身的初始化逻辑
// 合同数据与材料文件均持久化到 localStorage，刷新页面不丢失
(function () {
  'use strict';

  // 本页对应的导航位置：合同管理 → 合同台账
  const NAV_PATH = '合同管理';
  const NAV_SUB = NAV_PATH + ' / 合同台账';

  // 设置导航栏选中态：一级「合同管理」高亮并展开，二级「合同台账」高亮
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

  // 导航栏为异步加载：已加载则直接设置，否则等待 navbar:loaded 事件
  const navbar = document.getElementById('navbar');
  if (navbar && navbar.children.length) {
    setActiveNav();
  } else {
    document.addEventListener('navbar:loaded', setActiveNav, { once: true });
  }

  // ===== 本地持久化 =====
  // 合同数据走共享数据层（contracts-data.js）：台账与数据看板共用同一份 localStorage 数据与种子
  const store = window.HZContractData;
  const LS_MATERIALS = 'hz_contract_materials'; // 合同材料（PDF 以 dataURL 存储）

  function loadJSON(key, fallback) {
    try {
      const v = JSON.parse(localStorage.getItem(key));
      return v == null ? fallback : v;
    } catch (e) {
      return fallback;
    }
  }

  // 合同列表：[{id, code, name, type, partyA, partyB, partyC, amount, received, paid, signDate, endDate, status}]
  let contracts = store.load();
  if (!Array.isArray(contracts)) contracts = store.load();

  // 材料库：{ [合同id]: { approval|legal|contract|other: {name, dataUrl}|null } }
  let matStore = loadJSON(LS_MATERIALS, {});
  if (!matStore || typeof matStore !== 'object') matStore = {};

  function save() {
    if (!store.save(contracts)) {
      // 配额超限：不中断后续渲染流程，提示用户备份清理
      alert('本地存储空间不足，本次修改未能保存到浏览器。建议先「导出 Excel」备份数据，再删除部分旧合同或材料后重试。');
    }
  }

  function saveMaterials() {
    try {
      localStorage.setItem(LS_MATERIALS, JSON.stringify(matStore));
      return true;
    } catch (e) {
      alert('材料文件过大，本地存储空间不足：本次上传仅本次浏览有效，刷新后将丢失');
      return false;
    }
  }

  function genId() {
    return 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  // ===== 合同检索 =====
  // 数据行约定：tbody 中每条合同为一行，携带 data-* 属性——
  //   data-id（唯一标识）、data-name、data-type、data-status、
  //   data-date（签订日期 YYYY-MM-DD）、data-amount（合同金额数值）
  // 空状态行使用 class="empty-row"，不参与过滤
  let applyFilter = null; // 供添加/删除行后重新应用检索条件

  function initSearch() {
    const form = document.getElementById('searchForm');
    if (!form) return;

    const nameInput = document.getElementById('searchName');
    const typeSelect = document.getElementById('searchType');
    const statusSelect = document.getElementById('searchStatus');
    const startInput = document.getElementById('searchDateStart');
    const endInput = document.getElementById('searchDateEnd');

    // 按当前检索条件过滤表格行；无匹配时显示空状态行
    applyFilter = function () {
      const type = typeSelect.value;
      const status = statusSelect.value;
      const start = startInput.value;
      const end = endInput.value;
      // 关键词检索：空格分隔多个词，全部命中（AND）才算匹配，不限字段模糊匹配
      const keywords = (nameInput.value || '').trim().toLowerCase().split(/\s+/).filter(Boolean);

      let visible = 0;
      document.querySelectorAll('.ledger-table tbody tr').forEach(row => {
        if (row.classList.contains('empty-row')) return;

        const date = row.dataset.date || '';
        // 行全文 = 所有单元格文本 + data 属性，作为关键词匹配范围
        const text = row.textContent.toLowerCase() +
          ' ' + Object.values(row.dataset).join(' ').toLowerCase();
        const ok =
          keywords.every(kw => text.includes(kw)) &&
          (!type || row.dataset.type === type) &&
          (!status || row.dataset.status === status) &&
          (!start || (date && date >= start)) &&
          (!end || (date && date <= end));

        row.hidden = !ok;
        if (ok) visible += 1;
      });

      // 无匹配（或本无数据）时显示空状态行
      const emptyRow = document.querySelector('.ledger-table .empty-row');
      if (emptyRow) emptyRow.hidden = visible > 0;

      renderPage();
    };

    // 查询：阻止表单默认提交，执行过滤
    form.addEventListener('submit', e => {
      e.preventDefault();
      applyFilter();
    });

    // 重置：清空条件后恢复显示全部行
    form.addEventListener('reset', () => {
      // 等浏览器完成原生 reset 后再过滤
      requestAnimationFrame(() => applyFilter());
    });
  }

  // ===== 合同列表：数据驱动渲染 =====
  const tbody = document.querySelector('.ledger-table tbody');

  // 金额格式化：千分位 + 两位小数
  function fmtAmount(n) {
    return Number(n || 0).toLocaleString('zh-CN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }

  // 简单转义，防止输入内容被当作 HTML 解析
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  // 按当前 DOM 顺序重排：删除中间行后自动前移补齐，编辑行在末尾自动接续编号）
  function renumber() {
    let i = 0;
    tbody.querySelectorAll('tr:not(.empty-row)').forEach(row => {
      row.querySelector('.col-index').textContent = ++i;
    });
  }

  // ----- 分页（基于检索后的可见行切片显示） -----
  let pageSize = 10;   // 每页条数
  let curPage = 1;     // 当前页码

  function renderPage() {
    const $ = id => document.getElementById(id);
    // 只对「检索后可见」的数据行分页（编辑行、空状态行不参与）
    const rows = Array.from(
      tbody.querySelectorAll('tr:not(.empty-row):not(.edit-row)')
    ).filter(r => !r.hidden);

    const total = rows.length;
    const pages = Math.max(1, Math.ceil(total / pageSize));
    if (curPage > pages) curPage = pages;
    if (curPage < 1) curPage = 1;

    const start = (curPage - 1) * pageSize;
    rows.forEach((r, i) => {
      r.hidden = i < start || i >= start + pageSize;
    });

    // 同步分页控件状态
    $('pagerTotal').textContent = total;
    $('pgPages').textContent = pages;
    $('pgInput').value = curPage;
    $('pgInput').max = pages;
    $('pgFirst').disabled = curPage <= 1;
    $('pgPrev').disabled = curPage <= 1;
    $('pgNext').disabled = curPage >= pages;
    $('pgLast').disabled = curPage >= pages;
  }

  function bindPager() {
    const $ = id => document.getElementById(id);
    const pages = () => Math.max(1, Number($('pgPages').textContent) || 1);
    const go = p => { curPage = p; renderPage(); };

    $('pgFirst').addEventListener('click', () => go(1));
    $('pgPrev').addEventListener('click', () => go(curPage - 1));
    $('pgNext').addEventListener('click', () => go(curPage + 1));
    $('pgLast').addEventListener('click', () => go(pages()));

    // 每页条数切换：回到第 1 页
    $('pageSize').addEventListener('change', e => {
      pageSize = Number(e.target.value) || 10;
      curPage = 1;
      renderPage();
    });

    // 页码输入跳转：change 或回车触发，越界自动纠正
    const jump = () => {
      let p = parseInt($('pgInput').value, 10);
      if (isNaN(p)) p = curPage;
      go(Math.min(Math.max(p, 1), pages()));
    };
    $('pgInput').addEventListener('change', jump);
    $('pgInput').addEventListener('keydown', e => { if (e.key === 'Enter') jump(); });
  }

  // 按 id 查找合同
  function byId(id) {
    return contracts.find(c => c.id === id) || null;
  }

  // 刷新列表小标题统计 + 台账统计卡（数据来源：contracts 数组，编辑行不计入）
  function updateStats() {
    let count = 0;
    let total = 0;
    tbody.querySelectorAll('tr:not(.empty-row):not(.edit-row)').forEach(row => {
      count += 1;
      total += Number(row.dataset.amount || 0);
    });
    document.getElementById('contractCount').textContent = count;
    document.getElementById('contractAmount').textContent = fmtAmount(total);

    // 台账统计卡：履行中 / 已终止已完成 / 累计执行货量 / 已结算金额 / 应收未收 / 应付未付
    let received = 0;
    let paid = 0;
    let executedSum = 0;
    let executing = 0;
    let closed = 0;
    contracts.forEach(c => {
      received += Number(c.received) || 0;
      paid += Number(c.paid) || 0;
      executedSum += Number(c.executed) || 0;
      if (c.status === '履行中') executing += 1;
      if (c.status === '已完成' || c.status === '已终止') closed += 1;
    });
    const settled = received + paid;                 // 已结算金额 = 已收款 + 已付款合计
    const due = Math.max(total - received, 0);       // 应收未收 = 合同总金额 − 已收款合计
    const payable = Math.max(total - paid, 0);       // 应付未付 = 合同总金额 − 已付款合计

    document.getElementById('tExecuting').textContent = executing;
    document.getElementById('tClosed').textContent = closed;
    document.getElementById('tExecuted').textContent = executedSum.toLocaleString('zh-CN');
    document.getElementById('tSettled').textContent = '¥' + settled.toLocaleString('zh-CN');
    document.getElementById('tDue').textContent = '¥' + due.toLocaleString('zh-CN');
    document.getElementById('tPayable').textContent = '¥' + payable.toLocaleString('zh-CN');

    renderPage();
  }

  // 空状态行显示/隐藏（编辑行不算数据）
  function toggleEmptyRow() {
    const emptyRow = tbody.querySelector('.empty-row');
    const hasData = tbody.querySelectorAll('tr:not(.empty-row):not(.edit-row)').length > 0;
    if (emptyRow) emptyRow.hidden = hasData;
  }

  // 由合同数据对象构造表格行（序号由 renumber 按位置统一编号；操作列：编辑 + 删除）
  function renderRow(c) {
    const tr = document.createElement('tr');
    tr.dataset.id = c.id;
    tr.dataset.name = c.name;
    tr.dataset.type = c.type;
    tr.dataset.status = c.status;
    tr.dataset.date = c.signDate || '';
    tr.dataset.amount = c.amount || 0;
    tr.dataset.received = c.received || 0;
    tr.dataset.paid = c.paid || 0;

    const cells = [
      '<td class="col-check"><input type="checkbox" class="row-check" title="选择该合同" /></td>',
      '<td class="col-index"></td>',
      '<td>' + esc(c.code) + '</td>',
      '<td>' + esc(c.name) + '</td>',
      '<td>' + esc(c.type) + '</td>',
      '<td>' + esc(c.partyA || '—') + '</td>',
      '<td>' + esc(c.partyB || '—') + '</td>',
      '<td>' + esc(c.partyC || '—') + '</td>',
      '<td class="col-num">' + fmtAmount(c.amount) + '</td>',
      '<td class="col-date">' + esc(c.signDate || '—') + '</td>',
      '<td class="col-date">' + esc(c.endDate || '—') + '</td>',
      '<td>' + esc(c.status) + '</td>',
      '<td class="col-detail"><a class="detail-link" href="javascript:void(0)">详情</a></td>',
      '<td class="col-action"><div class="cell-actions">' +
        '<button class="row-edit" type="button">编辑</button>' +
        '<button class="row-del" type="button">删除</button>' +
      '</div></td>'
    ];
    tr.innerHTML = cells.join('');
    return tr;
  }

  // 按当前数据全量重建表格（添加/删除/编辑保存后统一走这里）
  function renderAll() {
    tbody.querySelectorAll('tr:not(.empty-row)').forEach(row => row.remove());
    contracts.forEach(c => tbody.appendChild(renderRow(c)));
    renumber();
    updateStats();
    toggleEmptyRow();
    if (applyFilter) applyFilter();
  }

  // ----- 行内编辑行：新增与编辑共用 -----
  const TYPE_OPTIONS = ['采购合同', '销售合同', '运输合同', '服务合同'];
  const STATUS_OPTIONS = ['履行中', '已完成', '已终止'];

  // 正在编辑的合同 id；null 表示正在新增
  let editingId = null;

  // 构造行内编辑行；传入合同对象则为编辑（预填值），否则为新增（序号接续向下编）
  function renderEditRow(c) {
    c = c || {};
    const tr = document.createElement('tr');
    tr.className = 'edit-row';

    const options = (arr, selected) => arr.map(v =>
      '<option value="' + v + '"' + (v === selected ? ' selected' : '') + '>' + v + '</option>'
    ).join('');

    tr.innerHTML = [
      '<td class="col-check"></td>',
      '<td class="col-index"></td>',
      '<td><input class="cell-input" data-field="code" placeholder="如 HZ-2026-001" value="' + esc(c.code || '') + '" /></td>',
      '<td><input class="cell-input" data-field="name" placeholder="输入合同名称" value="' + esc(c.name || '') + '" /></td>',
      '<td><select class="cell-input" data-field="type">' + options(TYPE_OPTIONS, c.type || '采购合同') + '</select></td>',
      '<td><input class="cell-input" data-field="partyA" placeholder="甲方单位" value="' + esc(c.partyA || '') + '" /></td>',
      '<td><input class="cell-input" data-field="partyB" placeholder="乙方单位" value="' + esc(c.partyB || '') + '" /></td>',
      '<td><input class="cell-input" data-field="partyC" placeholder="丙方（可空）" value="' + esc(c.partyC || '') + '" /></td>',
      '<td><input class="cell-input num" type="number" min="0" step="0.01" data-field="amount" placeholder="0.00" value="' + esc(c.amount || '') + '" /></td>',
      '<td><input class="cell-input date" type="date" data-field="signDate" value="' + esc(c.signDate || '') + '" /></td>',
      '<td><input class="cell-input date" type="date" data-field="endDate" value="' + esc(c.endDate || '') + '" /></td>',
      '<td><select class="cell-input" data-field="status">' + options(STATUS_OPTIONS, c.status || '履行中') + '</select></td>',
      '<td class="col-detail">—</td>',
      '<td class="col-action"><div class="cell-actions">' +
        '<button class="btn-mini primary" type="button" data-act="save">保存</button>' +
        '<button class="btn-mini ghost" type="button" data-act="cancel">取消</button>' +
      '</div></td>'
    ].join('');
    return tr;
  }

  // 结束编辑：保存或取消
  function endEdit(editRow, isSave) {
    if (!isSave) {
      renderAll(); // 取消：恢复原状态
      return;
    }

    // 保存：收集填写内容（无需全部填写，留空按空值处理；序号沿用编辑行预分配的编号）
    const c = {};
    editRow.querySelectorAll('[data-field]').forEach(el => {
      const field = el.dataset.field;
      c[field] = el.tagName === 'SELECT' ? el.value : el.value.trim();
    });

    c.amount = Number(c.amount) || 0;
    c.received = Number(c.received) || 0;
    c.paid = Number(c.paid) || 0;

    if (editingId) {
      // 编辑：更新已有合同
      const old = byId(editingId);
      if (old) Object.assign(old, c);
    } else {
      // 新增：id 生成后 push
      c.id = genId();
      c.received = c.received || 0;
      c.paid = c.paid || 0;
      contracts.push(c);
    }

    editingId = null;
    save();
    renderAll();
  }

  function initAdd() {
    const addBtn = document.getElementById('addContractBtn');
    if (!addBtn) return;

    addBtn.addEventListener('click', () => {
      // 已有编辑行时不再重复插入，聚焦到合同编号
      const existed = tbody.querySelector('tr.edit-row');
      if (existed) {
        existed.querySelector('[data-field="code"]').focus();
        return;
      }

      editingId = null;
      const editRow = renderEditRow();
      tbody.insertBefore(editRow, tbody.querySelector('.empty-row'));
      renumber();                 // 编辑行也自动编号
      curPage = 1;                // 跳回第 1 页，确保编辑行可见
      renderPage();
      editRow.querySelector('[data-field="code"]').focus();
    });

    // 编辑行快捷键：Enter 保存、Esc 取消
    tbody.addEventListener('keydown', e => {
      if (!e.target.closest || !e.target.closest('tr.edit-row')) return;

      if (e.key === 'Enter') {
        e.preventDefault();
        const saveBtn = e.target.closest('tr.edit-row').querySelector('[data-act="save"]');
        if (saveBtn) saveBtn.click();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        e.target.closest('tr.edit-row').querySelector('[data-act="cancel"]').click();
      }
    });
  }

  // ----- 表格操作：保存 / 取消 / 编辑 / 删除 / 详情（事件委托） -----
  function initTableActions() {
    tbody.addEventListener('click', e => {
      // 编辑行内：保存 / 取消
      const mini = e.target.closest('.btn-mini');
      if (mini) {
        const editRow = mini.closest('tr.edit-row');
        if (editRow) endEdit(editRow, mini.dataset.act === 'save');
        return;
      }

      // 编辑已有合同：原位替换为编辑行
      const editBtn = e.target.closest('.row-edit');
      if (editBtn) {
        const row = editBtn.closest('tr[data-id]');
        const c = row && byId(row.dataset.id);
        if (!c) return;

        // 已有编辑行时先放弃它
        const existed = tbody.querySelector('tr.edit-row');
        if (existed) existed.remove();

        editingId = c.id;
        row.replaceWith(renderEditRow(c));
        renumber();
        return;
      }

      // 删除合同：确认后从数据中移除（材料一并清理）
      const delBtn = e.target.closest('.row-del');
      if (delBtn) {
        const row = delBtn.closest('tr[data-id]');
        const c = row && byId(row.dataset.id);
        if (!c) return;
        if (!confirm('确定删除合同「' + (c.name || c.code) + '」吗？')) return;

        if (typeof closeDrawer === 'function' && currentRow && currentRow.dataset.id === c.id) closeDrawer();
        contracts = contracts.filter(x => x.id !== c.id);
        delete matStore[c.id];
        save();
        saveMaterials();
        renderAll();
        return;
      }

      // 详情：打开抽屉
      const link = e.target.closest('.detail-link');
      if (link) {
        const row = link.closest('tr[data-id]');
        if (row) openDrawer(row);
      }
    });
  }

  // ----- 合同详情抽屉 -----
  // 已收/已付金额在抽屉中查看并编辑，保存后写回合同数据并持久化；
  // 材料 PDF 以 dataURL 存入 localStorage，刷新页面后仍可查看 / 下载
  let currentRow = null; // 当前抽屉对应的表格行（数据行）

  function openDrawer(row) {
    currentRow = row;
    const c = byId(row.dataset.id);
    if (!c) return;

    document.getElementById('dCode').textContent = c.code || '—';
    document.getElementById('dName').textContent = c.name || '—';
    document.getElementById('dType').textContent = c.type || '—';
    document.getElementById('dStatus').textContent = c.status || '—';
    document.getElementById('dPartyA').textContent = c.partyA || '—';
    document.getElementById('dPartyB').textContent = c.partyB || '—';
    document.getElementById('dPartyC').textContent = c.partyC || '—';
    document.getElementById('dSignDate').textContent = c.signDate || '—';
    document.getElementById('dEndDate').textContent = c.endDate || '—';

    document.getElementById('dReceived').value = c.received || '';
    document.getElementById('dPaid').value = c.paid || '';
    document.getElementById('dQuantity').value = c.quantity || '';
    document.getElementById('dExecuted').value = c.executed || '';
    renderMaterials(c.id);
    document.getElementById('drawerMask').hidden = false;
  }

  function closeDrawer() {
    document.getElementById('drawerMask').hidden = true;
    currentRow = null;
  }

  // ===== 合同材料：审批单 / 法律意见书 / 合同扫描件 / 其他材料 =====
  const MATERIALS = ['approval', 'legal', 'contract', 'other'];

  function getMats(id) {
    if (!matStore[id]) {
      const obj = {};
      MATERIALS.forEach(k => { obj[k] = null; });
      matStore[id] = obj;
    }
    return matStore[id];
  }

  // 渲染各材料面板：已上传显示文件行（点击文件名新标签页查看 PDF，右侧下载/删除）
  function renderMaterials(id) {
    const mats = getMats(id);
    document.querySelectorAll('.material-panel').forEach(panel => {
      const file = mats[panel.dataset.mat];
      const fileBox = panel.querySelector('.material-file');

      if (!file) {
        fileBox.hidden = true;
        fileBox.innerHTML = '';
        return;
      }

      fileBox.hidden = false;
      fileBox.innerHTML =
        '<a class="material-link" href="' + file.dataUrl + '" target="_blank" title="点击查看 PDF">' + esc(file.name) + '</a>' +
        '<div class="material-ops">' +
          '<a class="material-btn" href="' + file.dataUrl + '" download="' + esc(file.name) + '">下载</a>' +
          '<button class="material-btn del" type="button" data-mat-del="' + panel.dataset.mat + '" title="删除">&times;</button>' +
        '</div>';
    });
  }

  function initDrawer() {
    const mask = document.getElementById('drawerMask');
    if (!mask) return;

    // 关闭：右上角 × / 点击遮罩空白处
    document.getElementById('drawerClose').addEventListener('click', closeDrawer);
    mask.addEventListener('click', e => {
      if (e.target === mask) closeDrawer();
    });

    // 保存：写回收付金额与货量并持久化
    const saveBtn = document.getElementById('drawerSave');
    saveBtn.addEventListener('click', () => {
      if (!currentRow) return;
      const c = byId(currentRow.dataset.id);
      if (!c) return;

      c.received = Number(document.getElementById('dReceived').value) || 0;
      c.paid = Number(document.getElementById('dPaid').value) || 0;
      c.quantity = Number(document.getElementById('dQuantity').value) || 0;
      c.executed = Number(document.getElementById('dExecuted').value) || 0;
      currentRow.dataset.received = c.received;
      currentRow.dataset.paid = c.paid;
      save();

      saveBtn.textContent = '已保存 ✓';
      setTimeout(() => { saveBtn.textContent = '保存'; }, 1200);
    });

    // 材料上传：各面板「上传 PDF」按钮触发对应文件选择，转 dataURL 持久化
    document.querySelectorAll('.material-panel').forEach(panel => {
      const type = panel.dataset.mat;
      const input = panel.querySelector('.material-input');

      panel.querySelector('.material-upload').addEventListener('click', () => input.click());

      input.addEventListener('change', e => {
        const file = e.target.files[0];
        e.target.value = '';
        if (!file || !currentRow) return;

        if (file.type !== 'application/pdf' && !/\.pdf$/i.test(file.name)) {
          alert('请上传 PDF 格式的扫描件');
          return;
        }

        const reader = new FileReader();
        reader.onload = () => {
          if (!currentRow) return;
          getMats(currentRow.dataset.id)[type] = { name: file.name, dataUrl: reader.result };
          if (saveMaterials()) renderMaterials(currentRow.dataset.id);
        };
        reader.readAsDataURL(file);
      });
    });

    // 材料删除：事件委托（删除仅清空该类材料）
    mask.addEventListener('click', e => {
      const del = e.target.closest('[data-mat-del]');
      if (!del || !currentRow) return;

      const mats = getMats(currentRow.dataset.id);
      const type = del.dataset.matDel;
      if (mats[type]) {
        mats[type] = null;
        saveMaterials();
        renderMaterials(currentRow.dataset.id);
      }
    });
  }

  // ----- 导出 Excel：勾选则批量导出所选，未勾选导出全部（SheetJS 生成 .xlsx） -----
  function initExport() {
    const btn = document.getElementById('exportBtn');
    if (!btn) return;

    btn.addEventListener('click', () => {
      if (!contracts.length) {
        alert('暂无合同数据可导出');
        return;
      }
      if (!window.XLSX) {
        alert('导出组件加载失败，请刷新页面后重试');
        return;
      }

      // 批量：读取勾选行；未勾选任何行则导出全部
      const checkedIds = [];
      tbody.querySelectorAll('tr[data-id]').forEach(row => {
        const cb = row.querySelector('.row-check');
        if (cb && cb.checked) checkedIds.push(row.dataset.id);
      });

      const list = checkedIds.length
        ? checkedIds.map(id => byId(id)).filter(Boolean)
        : contracts;

      if (!list.length) {
        alert('暂无合同数据可导出');
        return;
      }

      const scope = checkedIds.length ? '已选 ' + checkedIds.length + ' 份合同' : '全部 ' + contracts.length + ' 份合同';
      if (!confirm('将导出' + scope + '，是否继续？')) return;

      const headers = [
        '序号', '合同编号', '合同名称', '合同类型',
        '甲方单位', '乙方单位', '丙方单位',
        '合同金额（元）', '已收款金额（元）', '已付款金额（元）',
        '签订时间', '合同终止时间', '合同状态'
      ];

      const rows = list.map((c, i) => [
        i + 1,
        c.code, c.name, c.type,
        c.partyA, c.partyB, c.partyC,
        Number(c.amount || 0), Number(c.received || 0), Number(c.paid || 0),
        c.signDate, c.endDate, c.status
      ]);

      const ws = XLSX.utils.aoa_to_sheet([headers].concat(rows));

      // 列宽设置（字符数）
      ws['!cols'] = [
        { wch: 6 }, { wch: 16 }, { wch: 24 }, { wch: 12 },
        { wch: 22 }, { wch: 22 }, { wch: 22 },
        { wch: 14 }, { wch: 14 }, { wch: 14 },
        { wch: 12 }, { wch: 14 }, { wch: 10 }
      ];

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, '合同台账');

      const d = new Date();
      const stamp = d.getFullYear() +
        String(d.getMonth() + 1).padStart(2, '0') +
        String(d.getDate()).padStart(2, '0');
      XLSX.writeFile(wb, '合同台账_' + stamp + '.xlsx');
    });
  }

  // ----- 批量选择：表头全选（仅作用于当前可见行）-----
  function initCheckAll() {
    const checkAll = document.getElementById('checkAll');
    if (!checkAll) return;

    checkAll.addEventListener('change', () => {
      const checked = checkAll.checked;
      tbody.querySelectorAll('tr[data-id]').forEach(row => {
        if (row.hidden) return; // 被检索过滤的行不参与全选
        const cb = row.querySelector('.row-check');
        if (cb) cb.checked = checked;
      });
    });

    // 行勾选变化时同步全选框状态
    tbody.addEventListener('change', e => {
      if (!e.target.classList || !e.target.classList.contains('row-check')) return;

      const boxes = [];
      let allChecked = true;
      tbody.querySelectorAll('tr[data-id]').forEach(row => {
        if (row.hidden) return;
        const cb = row.querySelector('.row-check');
        if (cb) {
          boxes.push(cb);
          if (!cb.checked) allChecked = false;
        }
      });
      checkAll.checked = boxes.length > 0 && allChecked;
    });
  }

  initSearch();
  initAdd();
  initTableActions();
  initDrawer();
  initExport();
  initCheckAll();
  bindPager();
  renderAll(); // 启动时从 localStorage 恢复已添加的数据
})();
