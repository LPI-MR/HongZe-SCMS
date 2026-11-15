// ===== HZApi · 前后端联调统一请求基座（localStorage → PostgreSQL 改造） =====
// 职责：
//  - 统一 JSON 请求：超时 10s；网络错误 / 超时 / 5xx 自动重试 2 次（300ms / 900ms 退避）；
//    4xx 业务错误不重试（直接把后端 message 抛给调用方）
//  - 响应封套解包：{ ok:true, data } → resolve(data)；{ ok:false, error } → reject(HZApiError)
//  - 全局 toast 提示（成功 / 失败），供本层与各模块页面复用
// 依赖：无（原生 fetch）。须通过本地服务器访问（http://localhost:8000）。
window.HZApi = (function () {
  'use strict';

  const TIMEOUT = 10000;          // 单次请求超时（毫秒）
  const RETRIES = 2;              // 自动重试次数（网络错误 / 超时 / 5xx）
  const BACKOFF = [300, 900];     // 重试退避间隔（毫秒）

  // ===== 错误类型：message 展示给用户，code/status 供程序判断 =====
  function HZApiError(message, code, status) {
    this.name = 'HZApiError';
    this.message = message || '请求失败';
    this.code = code || 'UNKNOWN';
    this.status = status || 0;
  }
  HZApiError.prototype = Object.create(Error.prototype);
  HZApiError.prototype.toString = function () { return this.name + ': ' + this.message; };

  // ===== 全局 toast（右上角浮层，自动消失；失败消息常驻 6s） =====
  let toastBox = null;
  function ensureToastBox() {
    if (toastBox) return toastBox;
    const style = document.createElement('style');
    style.textContent =
      '.hz-toast-box{position:fixed;top:18px;right:18px;z-index:99999;display:flex;flex-direction:column;gap:10px;pointer-events:none;}' +
      '.hz-toast{pointer-events:auto;min-width:220px;max-width:380px;padding:12px 16px;border-radius:8px;font-size:14px;line-height:1.5;' +
      'color:#fff;box-shadow:0 6px 24px rgba(0,0,0,.18);opacity:0;transform:translateY(-8px);transition:all .25s ease;}' +
      '.hz-toast.show{opacity:1;transform:translateY(0);}' +
      '.hz-toast.success{background:#1a7f37;}' +
      '.hz-toast.error{background:#d64545;}' +
      '.hz-toast.info{background:#2f6fed;}';
    document.head.appendChild(style);
    toastBox = document.createElement('div');
    toastBox.className = 'hz-toast-box';
    document.body.appendChild(toastBox);
    return toastBox;
  }

  function toast(msg, type, ms) {
    const box = ensureToastBox();
    const el = document.createElement('div');
    el.className = 'hz-toast ' + (type || 'info');
    el.textContent = msg;
    box.appendChild(el);
    requestAnimationFrame(() => el.classList.add('show'));
    setTimeout(() => {
      el.classList.remove('show');
      setTimeout(() => el.remove(), 300);
    }, ms || (type === 'error' ? 6000 : 3200));
    return el;
  }

  // ===== 单次请求（含超时中断） =====
  function once(method, path, body) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT);
    return fetch(path, {
      method: method,
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: ctrl.signal
    }).finally(() => clearTimeout(timer));
  }

  // ===== 完整请求：重试 + 封套解包 =====
  async function request(method, path, body) {
    let lastErr = null;
    for (let attempt = 0; attempt <= RETRIES; attempt++) {
      if (attempt > 0) await new Promise(r => setTimeout(r, BACKOFF[Math.min(attempt - 1, BACKOFF.length - 1)]));
      let resp, payload = null;
      try {
        resp = await once(method, path, body);
      } catch (e) {
        // 网络错误 / 超时（AbortError）→ 可重试
        lastErr = new HZApiError('网络异常或请求超时，请检查本地服务是否运行', 'NETWORK', 0);
        continue;
      }
      const text = await resp.text().catch(() => '');
      if (text) { try { payload = JSON.parse(text); } catch (e) { payload = null; } }

      if (resp.ok) {
        if (payload && payload.ok === true) return payload.data;
        if (payload && payload.ok === false) {
          // 后端业务错误（4xx/5xx 封套）→ 不重试，直接抛给调用方
          throw new HZApiError(payload.error && payload.error.message || '请求失败',
            payload.error && payload.error.code || 'UNKNOWN', resp.status);
        }
        // 2xx 但封套不符（理论上不出现）
        throw new HZApiError('服务返回格式异常', 'BAD_ENVELOPE', resp.status);
      }

      if (resp.status >= 400 && resp.status < 500) {
        // 4xx：业务错误不重试
        throw new HZApiError(payload && payload.error && payload.error.message || '请求被拒绝（HTTP ' + resp.status + '）',
          payload && payload.error && payload.error.code || 'HTTP_' + resp.status, resp.status);
      }
      // 5xx：可重试
      lastErr = new HZApiError(payload && payload.error && payload.error.message || '服务器异常（HTTP ' + resp.status + '）',
        payload && payload.error && payload.error.code || 'HTTP_' + resp.status, resp.status);
    }
    throw lastErr || new HZApiError('请求失败', 'UNKNOWN', 0);
  }

  return {
    request: request,
    get: path => request('GET', path),
    put: (path, body) => request('PUT', path, body === undefined ? null : body),
    del: path => request('DELETE', path),
    toast: toast,
    HZApiError: HZApiError
  };
})();
