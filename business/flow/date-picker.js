/* ============================================================
 * HZDatePicker —— Apple 风格日期时间选择器（flow 模块共享组件）
 * ============================================================
 * 交互参照 macOS 日期时间选择（系统设置口径）：
 *   - 点击字段弹出日历弹层：月份切换、日历网格、今日标识、选中高亮；
 *   - 年月日必选、时间可选：仅选日期亦可（不自动填当前时刻）；
 *   - 时间行：时/分输入 + 上下步进器，时、分均有效才落时间，可留空；
 *   - 未选日期时时间输入禁用，选日期后时间默认空（placeholder 引导）；
 *   - 「清除」置空、「完成」收起；Esc / 点击外部关闭；同页仅一个弹层；
 *   - 尊重 prefers-reduced-motion（由 CSS 控制）。
 * 机器值口径：仅日期 YYYY-MM-DD；日期+时间 YYYY-MM-DDTHH:mm；未选为空串。
 * 用法：
 *   var picker = HZDatePicker.attach(triggerInput, {
 *     hiddenInput: document.getElementById('xxx-value'),  // 机器值载体
 *     onChange: function (value) {}                       // 可选，值变化回调
 *   });
 *   picker.setValue('2026-11-13T14:30'); // 外部设值（展示与机器值同步）
 *   picker.getValue();
 *   picker.clear();                       // 置空（展示回占位文案）
 * ============================================================ */
(function (root) {
  'use strict';

  var WEEK_LABELS = ['日', '一', '二', '三', '四', '五', '六'];
  var openInstance = null; // 当前打开的实例（同页仅一个弹层）

  function pad2(n) { return n < 10 ? '0' + n : '' + n; }

  // 'YYYY-MM-DD' 或 'YYYY-MM-DDTHH:mm' → {y,m,d,hh?,mm?}；非法返回 null
  function parseValue(v) {
    var m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?$/.exec(String(v || ''));
    if (!m) return null;
    var p = { y: +m[1], m: +m[2], d: +m[3] };
    if (m[4] != null) { p.hh = +m[4]; p.mm = +m[5]; }
    return p;
  }

  // 机器值 → 中文展示：仅日期「2026年11月13日」；带时间「2026年11月13日 14:30」
  function fmtDisplay(v) {
    var p = parseValue(v);
    if (!p) return '';
    var s = p.y + '年' + p.m + '月' + p.d + '日';
    if (p.hh != null) s += ' ' + pad2(p.hh) + ':' + pad2(p.mm);
    return s;
  }

  function attach(trigger, opts) {
    var hidden = opts && opts.hiddenInput;
    var onChange = opts && typeof opts.onChange === 'function' ? opts.onChange : function () {};
    if (!trigger || !hidden) return null;

    var pop = null;          // 弹层 DOM（懒创建）
    var view = null;         // 当前浏览年月 {y, m}（m: 1-12）
    var isOpen = false;

    // ---------- 值读写 ----------
    function value() { return hidden.value || ''; }

    function setValue(v) {
      hidden.value = v;
      trigger.value = fmtDisplay(v);
      onChange(v);
    }

    // ---------- 弹层结构 ----------
    function ensurePop() {
      if (pop) return pop;
      pop = document.createElement('div');
      pop.className = 'dt-pop';
      pop.setAttribute('role', 'dialog');
      pop.setAttribute('aria-label', '选择日期时间');
      pop.innerHTML =
        '<div class="dt-head">' +
        '  <button type="button" class="dt-nav" data-nav="-1" aria-label="上一月">' +
        '    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 6l-6 6 6 6"/></svg>' +
        '  </button>' +
        '  <div class="dt-title"></div>' +
        '  <button type="button" class="dt-nav" data-nav="1" aria-label="下一月">' +
        '    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>' +
        '  </button>' +
        '</div>' +
        '<div class="dt-week">' +
        WEEK_LABELS.map(function (w) { return '<span>' + w + '</span>'; }).join('') +
        '</div>' +
        '<div class="dt-grid"></div>' +
        '<div class="dt-time">' +
        '  <span class="dt-time-label">时间（可选）</span>' +
        '  <input class="dt-hh" inputmode="numeric" maxlength="2" aria-label="小时" disabled />' +
        '  <span class="dt-colon">:</span>' +
        '  <input class="dt-mm" inputmode="numeric" maxlength="2" aria-label="分钟" disabled />' +
        '  <div class="dt-step">' +
        '    <button type="button" class="dt-step-btn" data-step="1" aria-label="加一分钟">' +
        '      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M6 15l6-6 6 6"/></svg>' +
        '    </button>' +
        '    <button type="button" class="dt-step-btn" data-step="-1" aria-label="减一分钟">' +
        '      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>' +
        '    </button>' +
        '  </div>' +
        '</div>' +
        '<div class="dt-foot">' +
        '  <button type="button" class="dt-clear">清除</button>' +
        '  <button type="button" class="dt-done">完成</button>' +
        '</div>';
      document.body.appendChild(pop);
      bindPopEvents();
      return pop;
    }

    function bindPopEvents() {
      // 弹层内点击分发（导航 / 日期 / 步进 / 清除 / 完成）
      pop.addEventListener('click', function (e) {
        var nav = e.target.closest('.dt-nav');
        if (nav) { shiftMonth(+nav.getAttribute('data-nav')); return; }
        var day = e.target.closest('.dt-day:not(.blank)');
        if (day) { pickDay(+day.getAttribute('data-day')); return; }
        var step = e.target.closest('.dt-step-btn');
        if (step) { stepTime(+step.getAttribute('data-step')); return; }
        if (e.target.closest('.dt-clear')) { setValue(''); renderGrid(); renderTime(); return; }
        if (e.target.closest('.dt-done')) { close(); return; }
      });
      // 时间直接输入：change 归一化提交，Enter 提交并收起
      pop.querySelector('.dt-hh').addEventListener('change', commitTime);
      pop.querySelector('.dt-mm').addEventListener('change', commitTime);
      pop.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' &&
            (e.target.classList.contains('dt-hh') || e.target.classList.contains('dt-mm'))) {
          commitTime();
          close();
        }
      });
    }

    // ---------- 渲染 ----------
    function daysInMonth(y, m) { return new Date(y, m, 0).getDate(); }

    function renderGrid() {
      pop.querySelector('.dt-title').textContent = view.y + '年' + view.m + '月';
      var grid = pop.querySelector('.dt-grid');
      grid.innerHTML = '';
      var first = new Date(view.y, view.m - 1, 1).getDay(); // 首日为周几（0=日）
      var total = daysInMonth(view.y, view.m);
      var cur = parseValue(value());
      var now = new Date();
      for (var b = 0; b < first; b++) {
        var blank = document.createElement('span');
        blank.className = 'dt-day blank';
        grid.appendChild(blank);
      }
      for (var d = 1; d <= total; d++) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'dt-day';
        btn.textContent = d;
        btn.setAttribute('data-day', d);
        if (cur && cur.y === view.y && cur.m === view.m && cur.d === d) btn.classList.add('sel');
        if (view.y === now.getFullYear() && view.m === now.getMonth() + 1 && d === now.getDate()) btn.classList.add('today');
        grid.appendChild(btn);
      }
    }

    // 时间行（可选）：未选日期禁用；已选日期显示已选时间或空（placeholder 引导，可留空）
    function renderTime() {
      var cur = parseValue(value());
      var hasTime = cur && cur.hh != null;
      var hhEl = pop.querySelector('.dt-hh');
      var mmEl = pop.querySelector('.dt-mm');
      hhEl.value = hasTime ? pad2(cur.hh) : '';
      mmEl.value = hasTime ? pad2(cur.mm) : '';
      hhEl.placeholder = '时';
      mmEl.placeholder = '分';
      hhEl.disabled = mmEl.disabled = !cur;
      pop.querySelector('.dt-step').classList.toggle('disabled', !cur);
    }

    // ---------- 行为 ----------
    function shiftMonth(delta) {
      var y = view.y, m = view.m + delta;
      if (m < 1) { m = 12; y--; }
      if (m > 12) { m = 1; y++; }
      view = { y: y, m: m };
      renderGrid();
    }

    // 选日期：时间可选——已选时间则保留，未选时间则仅日期（不自动填当前时刻）
    function pickDay(d) {
      var cur = parseValue(value());
      var v = view.y + '-' + pad2(view.m) + '-' + pad2(d);
      if (cur && cur.hh != null) v += 'T' + pad2(cur.hh) + ':' + pad2(cur.mm);
      setValue(v);
      renderGrid();
      renderTime();
    }

    // 时分输入归一化：时、分均有效才落时间（任一空/非法 → 机器值先按仅日期）；
    // 未落时间时不回写输入框，保留已填内容供用户继续补齐另一项
    function commitTime() {
      var cur = parseValue(value());
      if (!cur) return;
      var hhEl = pop.querySelector('.dt-hh');
      var mmEl = pop.querySelector('.dt-mm');
      var hh = parseInt(hhEl.value, 10);
      var mm = parseInt(mmEl.value, 10);
      var okH = !isNaN(hh) && hh >= 0 && hh <= 23;
      var okM = !isNaN(mm) && mm >= 0 && mm <= 59;
      setValue(cur.y + '-' + pad2(cur.m) + '-' + pad2(cur.d) +
        (okH && okM ? 'T' + pad2(hh) + ':' + pad2(mm) : ''));
      if (okH && okM) renderTime();
    }

    // 步进器：±1 分钟，跨小时进/借位；未选时间时以 00:00 为基准进入
    function stepTime(delta) {
      var cur = parseValue(value());
      if (!cur) return;
      var t = (cur.hh != null ? cur.hh * 60 + cur.mm : 0) + delta;
      t = (t + 24 * 60) % (24 * 60);
      setValue(cur.y + '-' + pad2(cur.m) + '-' + pad2(cur.d) +
        'T' + pad2(Math.floor(t / 60)) + ':' + pad2(t % 60));
      renderTime();
    }

    // ---------- 开合与定位 ----------
    function position() {
      var r = trigger.getBoundingClientRect();
      var sy = window.scrollY || document.documentElement.scrollTop;
      var sx = window.scrollX || document.documentElement.scrollLeft;
      var top = r.bottom + sy + 4;
      var left = r.left + sx;
      pop.style.top = top + 'px';
      pop.style.left = left + 'px';
      // 右侧越界：向左收（保留 12px 视口边距）
      var docW = document.documentElement.clientWidth;
      if (left + pop.offsetWidth > docW - 12) {
        pop.style.left = Math.max(12, docW - pop.offsetWidth - 12) + sx + 'px';
      }
      // 底部越界且上方空间足够：上翻展示
      if (pop.getBoundingClientRect().bottom > window.innerHeight &&
          r.top - pop.offsetHeight - 4 > 0) {
        pop.style.top = (r.top + sy - pop.offsetHeight - 4) + 'px';
      }
    }

    function open() {
      if (openInstance && openInstance !== api) openInstance.close();
      openInstance = api;
      ensurePop();
      var cur = parseValue(value());
      var now = new Date();
      view = cur ? { y: cur.y, m: cur.m } : { y: now.getFullYear(), m: now.getMonth() + 1 };
      renderGrid();
      renderTime();
      pop.classList.add('open');
      isOpen = true;
      position();
    }

    function close() {
      if (pop) pop.classList.remove('open');
      isOpen = false;
      if (openInstance === api) openInstance = null;
    }

    // ---------- 事件接线 ----------
    trigger.classList.add('dt-trigger');
    trigger.setAttribute('readonly', 'readonly');
    trigger.addEventListener('click', function () {
      if (isOpen) close(); else open();
    });
    // 键盘可达：Tab 聚焦后 Enter / Space 打开
    trigger.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        if (isOpen) close(); else open();
      }
    });
    // 点击外部关闭（触发器自身交给 click 切换）
    document.addEventListener('mousedown', function (e) {
      if (isOpen && pop && !pop.contains(e.target) && e.target !== trigger) close();
    });
    // Esc 关闭
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && isOpen) close();
    });
    // 滚动 / 窗口缩放时跟随重新定位
    window.addEventListener('scroll', function () { if (isOpen) position(); }, true);
    window.addEventListener('resize', function () { if (isOpen) position(); });

    // 初始展示：同步外部已预置的机器值
    trigger.value = fmtDisplay(hidden.value);

    var api = {
      open: open,
      close: close,
      setValue: function (v) { setValue(v || ''); },
      getValue: value,
      clear: function () { setValue(''); }
    };
    return api;
  }

  root.HZDatePicker = { attach: attach };
}(typeof self !== 'undefined' ? self : this));
