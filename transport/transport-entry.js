// ===== transport-entry 模块脚本（运输信息录入）=====
// 依赖 trips-store.js 提供的共享数据层；数据保存后调度看板自动同步
(function () {
  'use strict';

  // 本页对应的导航路径（与 navbar.html 中 data-path 一致）
  const NAV_PATH = '运输调度管理 / 信息录入';

  // 设置导航栏选中态：子项高亮 + 展开父级菜单
  function setActiveNav() {
    const navbar = document.getElementById('navbar');
    if (!navbar) return;

    navbar.querySelectorAll('.active').forEach(el => el.classList.remove('active'));

    const item = navbar.querySelector(`[data-path="${NAV_PATH}"]`);
    if (item) {
      item.classList.add('active');
      const group = item.closest('.nav-group');
      if (group) group.classList.add('open');
    }
  }

  // 导航栏为异步加载：已加载则直接设置，否则等待 navbar:loaded 事件
  const navbar = document.getElementById('navbar');
  if (navbar && navbar.children.length) {
    setActiveNav();
  } else {
    document.addEventListener('navbar:loaded', setActiveNav, { once: true });
  }

  /* ==================== 信息录入 ==================== */

  const store = window.TripsStore;
  const MODES = store.MODES;
  const esc = store.esc;

  let state = store.load();

  const $ = id => document.getElementById(id);
  const els = {
    tabs: $('entry-tabs'),
    progressForm: $('progress-form'),
    newForm: $('new-form'),
    pTrip: $('p-trip'),
    pPreview: $('p-preview'),
    pNode: $('p-node'),
    pTime: $('p-time'),
    pActual: $('p-actual'),
    pNote: $('p-note'),
    nId: $('n-id'),
    nMode: $('n-mode'),
    nFrom: $('n-from'),
    nTo: $('n-to'),
    nCargo: $('n-cargo'),
    nTons: $('n-tons'),
    nOrder: $('n-order'),
    orderList: $('order-list'),
    nNode: $('n-node'),
    nNodeField: $('n-node-field'),
    nNodesField: $('n-nodes-field'),
    nNodes: $('n-nodes'),
    nAddNode: $('n-add-node'),
    logList: $('log-list'),
    toast: $('toast'),
  };

  // ===== 工具 =====
  const pad = n => String(n).padStart(2, '0');

  // datetime-local 输入框默认值（当前时间）
  function nowLocal() {
    const d = new Date();
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  // 记录时间显示：MM-DD HH:mm
  function fmtLog(ts) {
    const d = new Date(ts);
    return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  let toastTimer = null;
  function toast(msg, type) {
    els.toast.textContent = msg;
    els.toast.classList.toggle('error', type === 'error');
    els.toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => els.toast.classList.remove('show'), 2200);
  }

  // ===== 页签切换 =====
  els.tabs.addEventListener('click', e => {
    const btn = e.target.closest('.tab');
    if (!btn) return;
    els.tabs.querySelectorAll('.tab').forEach(b => b.classList.toggle('active', b === btn));
    const isProgress = btn.dataset.tab === 'progress';
    els.progressForm.hidden = !isProgress;
    els.newForm.hidden = isProgress;
    if (isProgress) refreshTripSelect();
  });

  // ===== 进度上报 =====
  // 车次下拉：仅列出进行中的车次
  function refreshTripSelect() {
    const running = state.trips.filter(t => !store.isDone(t));
    els.pTrip.innerHTML = running.length
      ? running.map(t => {
          return `<option value="${esc(t.id)}">${esc(t.id)} · ${store.modeName(t)} · ${esc(t.from)}→${esc(t.to)} · 当前：${store.getNodes(t)[t.nodeIndex]}</option>`;
        }).join('')
      : '<option value="">暂无进行中车次，请先新增车次</option>';
    onTripChange();
  }

  // 选中车次后：渲染进度预览 + 生成可上报节点选项（当前节点及之后）
  function onTripChange() {
    const trip = state.trips.find(t => t.id === els.pTrip.value);
    if (!trip) {
      els.pPreview.innerHTML = '<div class="preview-empty">请选择车次</div>';
      els.pNode.innerHTML = '';
      return;
    }
    const nodes = store.getNodes(trip);
    els.pPreview.innerHTML = store.stepperHTML(trip);
    els.pNode.innerHTML = nodes.map((n, i) =>
      i >= trip.nodeIndex
        ? `<option value="${i}"${i === Math.min(trip.nodeIndex + 1, nodes.length - 1) ? ' selected' : ''}>${esc(n)}</option>`
        : ''
    ).join('');
  }

  els.pTrip.addEventListener('change', onTripChange);

  // 提交上报：更新车次节点与时间（可录实际到货重量），写入日志
  els.progressForm.addEventListener('submit', e => {
    e.preventDefault();
    const trip = state.trips.find(t => t.id === els.pTrip.value);
    if (!trip) {
      toast('请先选择车次', 'error');
      return;
    }
    const nodes = store.getNodes(trip);
    const nodeIndex = Number(els.pNode.value);
    const nodeTime = new Date(els.pTime.value).getTime();

    // 实际到货重量（选填）：填写时校验并更新车次
    const actualRaw = els.pActual.value.trim();
    let actualValue = null;
    if (actualRaw !== '') {
      actualValue = Number(actualRaw);
      if (isNaN(actualValue) || actualValue < 0) {
        toast('实际到货重量格式不正确', 'error');
        return;
      }
    }

    trip.nodeIndex = nodeIndex;
    trip.time = nodeTime;
    if (actualValue != null) trip.actualTons = actualValue;
    store.save(state);

    // 日志附带到货重量与亏吨率（如已录入）
    const rate = store.lossRate(trip);
    const rateText = rate == null ? ''
      : rate < 0 ? ` · 溢吨 ${Math.abs(rate).toFixed(2)}%` : ` · 亏吨率 ${rate.toFixed(2)}%`;
    const note = els.pNote.value.trim();
    store.pushLog({
      time: Date.now(),
      tripId: trip.id,
      action: `进度上报：${nodes[nodeIndex]}${actualValue != null ? ` · 到货 ${actualValue}吨` : ''}${rateText}`,
      note: note || '',
    });

    els.pNote.value = '';
    els.pTime.value = nowLocal();
    // 已录过到货重量则回显，便于核对
    els.pActual.value = trip.actualTons == null ? '' : trip.actualTons;
    toast(`车次 ${trip.id} 已更新至「${nodes[nodeIndex]}」`);
    refreshTripSelect();
    renderLogs();
  });

  // ===== 新增车次 =====
  // 预填下一个车次号（消耗 seq，立即持久化避免重复取号）
  function prefillId() {
    els.nId.value = store.nextId(state);
    store.save(state);
  }

  // ===== 自定义节点链编辑器 =====
  // 添加一行节点输入框（可选填默认值）
  function addNodeRow(value) {
    const row = document.createElement('div');
    row.className = 'node-row';
    row.innerHTML = '<span class="node-idx"></span><input class="input" placeholder="如：请车" /><button type="button" class="node-del" title="删除节点">×</button>';
    if (value) row.querySelector('input').value = value;
    els.nNodes.appendChild(row);
    refreshNodeRows();
  }

  // 刷新行编号；少于 2 行时禁用删除
  function refreshNodeRows() {
    const rows = els.nNodes.querySelectorAll('.node-row');
    rows.forEach((r, i) => {
      r.querySelector('.node-idx').textContent = i + 1;
      r.querySelector('.node-del').disabled = rows.length <= 2;
    });
  }

  // 读取编辑器中的节点链（过滤空行）
  function collectNodes() {
    return [...els.nNodes.querySelectorAll('input')]
      .map(i => i.value.trim())
      .filter(Boolean);
  }

  els.nAddNode.addEventListener('click', () => addNodeRow());

  els.nNodes.addEventListener('click', e => {
    const del = e.target.closest('.node-del');
    if (!del) return;
    if (els.nNodes.querySelectorAll('.node-row').length <= 2) {
      toast('自定义节点至少需要 2 个', 'error');
      return;
    }
    del.closest('.node-row').remove();
    refreshNodeRows();
  });

  // 运输方式切换：预设模式显示"当前节点"下拉，自定义模式显示节点链编辑器
  function fillNewNodes() {
    const nodes = MODES[els.nMode.value].nodes;
    els.nNode.innerHTML = nodes.map((n, i) =>
      `<option value="${i}"${i === 0 ? ' selected' : ''}>${n}</option>`
    ).join('');
  }

  function onModeChange() {
    const isCustom = els.nMode.value === 'custom';
    els.nNodeField.hidden = isCustom;
    els.nNodesField.hidden = !isCustom;
    if (isCustom) {
      if (!els.nNodes.children.length) {
        addNodeRow();
        addNodeRow();
      }
      refreshNodeRows();
    } else {
      fillNewNodes();
    }
  }

  els.nMode.addEventListener('change', onModeChange);

  els.newForm.addEventListener('submit', e => {
    e.preventDefault();
    const id = els.nId.value.trim();
    if (!id) {
      toast('请填写车次号', 'error');
      return;
    }
    if (state.trips.some(t => t.id === id)) {
      toast(`车次号 ${id} 已存在`, 'error');
      return;
    }

    const isCustom = els.nMode.value === 'custom';
    let trip;
    if (isCustom) {
      // 自定义通道：校验并组装节点链
      const nodes = collectNodes();
      if (nodes.length < 2) {
        toast('自定义节点至少需要 2 个（请填写节点名称）', 'error');
        return;
      }
      if (new Set(nodes).size !== nodes.length) {
        toast('自定义节点名称不能重复', 'error');
        return;
      }
      trip = { mode: 'custom', nodes, nodeIndex: 0 };
    } else {
      trip = { mode: els.nMode.value, nodeIndex: Number(els.nNode.value) };
    }

    Object.assign(trip, {
      id,
      from: els.nFrom.value.trim(),
      to: els.nTo.value.trim(),
      cargo: els.nCargo.value.trim(),
      tons: Number(els.nTons.value),
      orderId: els.nOrder.value.trim(),
      time: Date.now(),
    });
    state.trips.push(trip);
    store.save(state);

    store.pushLog({
      time: Date.now(),
      tripId: trip.id,
      action: `新增车次：${store.modeName(trip)} · ${trip.from}→${trip.to} · ${trip.cargo} ${trip.tons}吨${trip.orderId ? ` · 订单 ${trip.orderId}` : ' · 未关联订单'}`,
      note: '',
    });

    els.newForm.reset();
    onModeChange();
    prefillId();
    fillOrderList();
    toast(`车次 ${trip.id} 创建成功`);
    renderLogs();
  });

  // 订单号建议列表（取自现有车次的关联订单，便于关联时选择）
  function fillOrderList() {
    const ids = [...new Set(state.trips.map(t => (t.orderId || '').trim()).filter(Boolean))];
    els.orderList.innerHTML = ids.map(id => `<option value="${esc(id)}"></option>`).join('');
  }

  // ===== 最近录入记录 =====
  function renderLogs() {
    const logs = store.getLogs().slice(0, 10);
    els.logList.innerHTML = logs.length
      ? logs.map(l => `
          <div class="log-item">
            <div class="log-head"><span>${esc(l.tripId)}</span><span>${fmtLog(l.time)}</span></div>
            <div class="log-main">${esc(l.action)}</div>
            ${l.note ? `<div class="log-note">备注：${esc(l.note)}</div>` : ''}
          </div>`).join('')
      : '<div class="log-empty">暂无录入记录</div>';
  }

  // ===== 初始化 =====
  els.pTime.value = nowLocal();
  onModeChange();
  prefillId();
  fillOrderList();
  refreshTripSelect();
  renderLogs();
})();
