/* ============================================================
   客户管理模块 · 数据层（新版客户模型 v2）
   ------------------------------------------------------------
   依据《PRD-客户管理模块》实现：
   - 三类客户分类体系（集采贸易商 / 现货贸易商 / 下游客户）
   - 客户字段白名单（5.2）与字段清理（5.3）
   - 业务规则 BR-C01 ~ BR-C10
   - 客户状态机（9.3）：待审核→正常⇄停用、待审核→已驳回→重提→待审核
   - 自主注册 / 平台代注册 / 系统迁移 三类数据来源
   - 存量统一库（hz_customers_unified_v1）迁移映射（10.1 / 10.2）
   ------------------------------------------------------------
   设计约定：
   - 本文件为纯逻辑层：所有业务函数入参不依赖 DOM / localStorage，
     便于 Node 环境单元测试（UMD 导出）。
   - 浏览器持久化封装在文件尾部（localStorage 可用时才启用）。
   ============================================================ */

(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;            // Node / 单元测试
  } else {
    root.HZCustomerData = api;       // 浏览器全局
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ==================== 存储键与版本 ==================== */

  var STORE_KEY = 'hz_customers_v2';            // 新版客户库
  var PENDING_KEY = 'hz_customers_pending_v2';  // 迁移待归类清单（矿石贸易商）
  var MIGRATION_KEY = 'hz_customers_migration_v2'; // 迁移状态标记与报告
  var UNIFIED_KEY = 'hz_customers_unified_v1';  // 存量统一库（迁移数据源）
  var STORE_VERSION = 'v2';

  /* ==================== 业务常量 ==================== */

  // 客户类型（三选一、互斥，BR-C01）
  var TYPES = ['集采贸易商', '现货贸易商', '下游客户'];
  // 代注册可选类型（BR-C03：不提供现货贸易商）
  var OPERATOR_TYPES = ['集采贸易商', '下游客户'];
  // 客户状态（状态机 9.3）
  var STATUSES = ['待审核', '正常', '停用', '已驳回'];
  // 客户来源（含迁移批次来源，10.2 假设）
  var SOURCES = ['自主注册', '平台代注册', '系统迁移'];
  // 类型派生标签（BR-C10：系统派生，不可手工设置）
  var TYPE_TAGS = { '集采贸易商': '长协贸易商', '现货贸易商': '现货散单', '下游客户': '钢厂' };

  // 操作人（TBD-01 降级：登录体系未接入期间的固定标识，与站内现有约定一致）
  var OPERATOR = '系统用户';

  // 字段长度限制（5.2.1）
  var LIMITS = { nameMin: 2, nameMax: 50, contactMax: 20 };

  // 存量标签体系（迁移映射依据，10.1）
  var LEGACY_ROLES = ['物流服务商', '场站服务商', '仓储服务商', '付费客户'];
  var LEGACY_INDUSTRIES = ['钢铁生产企业', '矿石贸易商', '铁路运营', '铁路场站', '仓储园区', '公路运输', '港口节点'];
  var LEGACY_RESOURCE_ROLES = ['物流服务商', '场站服务商', '仓储服务商'];
  var LEGACY_RESOURCE_INDUSTRIES = ['铁路运营', '铁路场站', '仓储园区', '公路运输', '港口节点'];

  /* ==================== 工具函数 ==================== */

  function trimStr(v) {
    return v == null ? '' : String(v).trim();
  }

  // 名称键：忽略首尾空格（BR-C02）
  function nameKeyOf(name) {
    return trimStr(name);
  }

  function pad2(n) { return String(n).padStart(2, '0'); }

  // 统一时间格式（与站内 fmtTime 一致）
  function fmtTime(ts) {
    var d = ts instanceof Date ? ts : new Date(ts);
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()) + ' ' +
      pad2(d.getHours()) + ':' + pad2(d.getMinutes()) + ':' + pad2(d.getSeconds());
  }

  var _idSeq = 0;
  function genId() {
    _idSeq = (_idSeq + 1) % 1296;
    return 'cust_' + Date.now().toString(36) + _idSeq.toString(36) +
      Math.floor(Math.random() * 1296).toString(36);
  }

  function deriveTag(type) {
    return TYPE_TAGS[type] || '';
  }

  /* ==================== 格式校验（BR-C08） ==================== */

  // 统一社会信用代码：18 位（GB 32100 字符集，不含 I O S V Z）
  var CREDIT_CODE_RE = /^[0-9A-HJ-NPQRTUWXY]{18}$/;
  // 联系方式：手机号 / 座机（含区号或本地号码）
  var MOBILE_RE = /^1[3-9]\d{9}$/;
  var LANDLINE_RE = /^(0\d{2,3}-\d{7,8}|\d{7,8})$/;

  function validateName(name) {
    var v = trimStr(name);
    if (!v) return '请输入客户名称';
    if (v.length < LIMITS.nameMin || v.length > LIMITS.nameMax) {
      return '客户名称需为 ' + LIMITS.nameMin + '-' + LIMITS.nameMax + ' 个字符';
    }
    return '';
  }

  function validateCreditCode(code) {
    var v = trimStr(code);
    if (!v) return '请输入统一社会信用代码';
    if (!CREDIT_CODE_RE.test(v.toUpperCase())) return '统一社会信用代码须为 18 位有效格式';
    return '';
  }

  function validatePhone(phone) {
    var v = trimStr(phone);
    if (!v) return '请输入联系方式';
    if (!MOBILE_RE.test(v) && !LANDLINE_RE.test(v)) return '联系方式须为手机号或座机格式';
    return '';
  }

  function validateContact(contact) {
    var v = trimStr(contact);
    if (!v) return '请输入联系人';
    if (v.length > LIMITS.contactMax) return '联系人不超过 ' + LIMITS.contactMax + ' 个字符';
    return '';
  }

  // 统一字段全量校验（返回 {field: msg}）
  function validateCoreFields(data, opts) {
    opts = opts || {};
    var errors = {};
    var e;
    e = validateName(data.name); if (e) errors.name = e;
    e = validateCreditCode(data.credit_code); if (e) errors.credit_code = e;
    e = validateContact(data.contact); if (e) errors.contact = e;
    e = validatePhone(data.phone); if (e) errors.phone = e;
    return errors;
  }

  // 资质凭证校验（现货贸易商专属，必填[假设]）
  function validateCredentials(credentials) {
    if (!Array.isArray(credentials) || credentials.length === 0) {
      return '请至少上传一份资质凭证';
    }
    return '';
  }

  /* ==================== 查重（BR-C02） ==================== */

  // 名称忽略首尾空格唯一；信用代码唯一且为主体验重依据
  function findDuplicate(list, data, excludeId) {
    var nameKey = nameKeyOf(data.name);
    var code = trimStr(data.credit_code).toUpperCase();
    for (var i = 0; i < list.length; i++) {
      var c = list[i];
      if (excludeId && c.id === excludeId) continue;
      if (nameKey && nameKeyOf(c.name) === nameKey) {
        return { field: 'name', customer: c, msg: '该客户名称已存在（' + c.name + '）' };
      }
      if (code && trimStr(c.credit_code).toUpperCase() === code) {
        return { field: 'credit_code', customer: c, msg: '该统一社会信用代码已存在（' + c.name + '），同一主体全平台仅允许一条客户记录' };
      }
    }
    return null;
  }

  /* ==================== 状态机（9.3） ==================== */

  // action ∈ approve / reject / resubmit / disable / enable
  var TRANSITIONS = {
    approve: { from: ['待审核'], to: '正常' },
    reject: { from: ['待审核'], to: '已驳回' },
    resubmit: { from: ['已驳回'], to: '待审核' },
    disable: { from: ['正常'], to: '停用' },
    enable: { from: ['停用'], to: '正常' }
  };

  function canTransition(action, status) {
    var t = TRANSITIONS[action];
    return !!t && t.from.indexOf(status) >= 0;
  }

  /* ==================== 记录构造（白名单字段 BR-C07） ==================== */

  // 白名单展示字段：客户名称/客户类型/联系人/联系方式/统一社会信用代码/
  //                 客户来源/状态/创建时间/更新时间（+现货专属：资质凭证）
  // 系统字段：id/name_key/reject_reason/history/source_refs/migrated_batch（不作为业务信息展示）
  function newRecord(data, opts) {
    opts = opts || {};
    var now = fmtTime(new Date());
    return {
      id: genId(),
      name: trimStr(data.name),
      name_key: nameKeyOf(data.name),
      customer_type: data.customer_type,
      contact: trimStr(data.contact),
      phone: trimStr(data.phone),
      credit_code: trimStr(data.credit_code).toUpperCase(),
      source: opts.source,
      status: opts.status,
      credentials: Array.isArray(data.credentials) ? data.credentials.slice() : [],
      reject_reason: '',
      history: opts.history || [],
      source_refs: Array.isArray(data.source_refs) ? data.source_refs.slice() : [],
      migrated_batch: opts.migrated_batch || '',
      created_at: now,
      updated_at: now
    };
  }

  function logEntry(action, detail, operator) {
    return { ts: fmtTime(new Date()), action: action, operator: operator || OPERATOR, detail: detail || '' };
  }

  function touch(record) {
    record.updated_at = fmtTime(new Date());
  }

  function indexOfId(list, id) {
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return i;
    return -1;
  }

  /* ==================== 创建：平台代注册（F3 / BR-C03） ==================== */

  // 运营端代注册：类型仅集采贸易商/下游客户；保存即生效（状态 = 正常）
  function createByOperator(list, data) {
    var errors = validateCoreFields(data);
    if (!data.customer_type || OPERATOR_TYPES.indexOf(data.customer_type) < 0) {
      errors.customer_type = '代注册类型仅支持：集采贸易商 / 下游客户';
    }
    if (Object.keys(errors).length) {
      return { ok: false, code: 'INVALID', errors: errors, error: '字段校验未通过' };
    }
    var dup = findDuplicate(list, data);
    if (dup) {
      return { ok: false, code: 'DUP', error: dup.msg, dup_field: dup.field };
    }
    var rec = newRecord(data, {
      source: '平台代注册',
      status: '正常',
      history: [logEntry('代注册创建', '客户类型：' + data.customer_type + '，保存即生效')]
    });
    var next = list.concat([rec]);
    return { ok: true, list: next, customer: rec };
  }

  /* ==================== 创建：自主注册（F4 / BR-C03 / BR-C09） ==================== */

  // 公开注册：类型固定现货贸易商；提交后待审核，审核通过前不生效
  function createSelfRegistered(list, data) {
    var errors = validateCoreFields(data);
    var e = validateCredentials(data.credentials);
    if (e) errors.credentials = e;
    if (Object.keys(errors).length) {
      return { ok: false, code: 'INVALID', errors: errors, error: '字段校验未通过' };
    }
    var dup = findDuplicate(list, data);
    if (dup) {
      return { ok: false, code: 'DUP', error: '该企业已注册，请直接登录或联系平台', dup_field: dup.field };
    }
    var rec = newRecord({
      customer_type: '现货贸易商',
      name: data.name, contact: data.contact, phone: data.phone,
      credit_code: data.credit_code, credentials: data.credentials
    }, {
      source: '自主注册',
      status: '待审核',
      history: [logEntry('自主注册提交', '提交注册申请，等待平台审核', '客户本人')]
    });
    var next = list.concat([rec]);
    return { ok: true, list: next, customer: rec };
  }

  /* ==================== 审核（F5 / BR-C05） ==================== */

  function reviewApprove(list, id, opts) {
    opts = opts || {};
    var i = indexOfId(list, id);
    if (i < 0) return { ok: false, code: 'NOT_FOUND', error: '客户不存在' };
    var rec = list[i];
    if (!canTransition('approve', rec.status)) {
      return { ok: false, code: 'STATE', error: '当前状态「' + rec.status + '」不允许审核通过' };
    }
    var next = list.slice();
    var updated = Object.assign({}, rec, { status: '正常' });
    updated.history = rec.history.concat([logEntry('审核通过', '注册审核通过，客户生效')]);
    touch(updated);
    next[i] = updated;
    return { ok: true, list: next, customer: updated };
  }

  function reviewReject(list, id, reason, opts) {
    opts = opts || {};
    var i = indexOfId(list, id);
    if (i < 0) return { ok: false, code: 'NOT_FOUND', error: '客户不存在' };
    var rec = list[i];
    if (!canTransition('reject', rec.status)) {
      return { ok: false, code: 'STATE', error: '当前状态「' + rec.status + '」不允许审核驳回' };
    }
    var r = trimStr(reason);
    if (!r) {
      return { ok: false, code: 'INVALID', errors: { reject_reason: '驳回原因为必填项' }, error: '驳回原因为必填项' };
    }
    var next = list.slice();
    var updated = Object.assign({}, rec, { status: '已驳回', reject_reason: r });
    updated.history = rec.history.concat([logEntry('审核驳回', '驳回原因：' + r)]);
    touch(updated);
    next[i] = updated;
    return { ok: true, list: next, customer: updated };
  }

  // 已驳回 → 修改信息重新提交 → 待审核（BR-C05；修改限联系人/联系方式/凭证）
  function resubmit(list, id, patch, opts) {
    opts = opts || {};
    var i = indexOfId(list, id);
    if (i < 0) return { ok: false, code: 'NOT_FOUND', error: '客户不存在' };
    var rec = list[i];
    if (!canTransition('resubmit', rec.status)) {
      return { ok: false, code: 'STATE', error: '仅「已驳回」状态可重新提交' };
    }
    patch = patch || {};
    var errors = {};
    if (patch.contact !== undefined) { var e1 = validateContact(patch.contact); if (e1) errors.contact = e1; }
    if (patch.phone !== undefined) { var e2 = validatePhone(patch.phone); if (e2) errors.phone = e2; }
    if (patch.credentials !== undefined) { var e3 = validateCredentials(patch.credentials); if (e3) errors.credentials = e3; }
    if (Object.keys(errors).length) {
      return { ok: false, code: 'INVALID', errors: errors, error: '字段校验未通过' };
    }
    var next = list.slice();
    var updated = Object.assign({}, rec);
    if (patch.contact !== undefined) updated.contact = trimStr(patch.contact);
    if (patch.phone !== undefined) updated.phone = trimStr(patch.phone);
    if (patch.credentials !== undefined) updated.credentials = patch.credentials.slice();
    updated.status = '待审核';
    updated.reject_reason = '';   // 驳回原因保留在操作记录中
    var parts = [];
    if (patch.contact !== undefined) parts.push('联系人');
    if (patch.phone !== undefined) parts.push('联系方式');
    if (patch.credentials !== undefined) parts.push('资质凭证');
    updated.history = rec.history.concat([logEntry('重新提交', '修改' + (parts.join('、') || '信息') + '后重新提交', '客户本人')]);
    touch(updated);
    next[i] = updated;
    return { ok: true, list: next, customer: updated };
  }

  /* ==================== 编辑（F6 / AC-C07） ==================== */

  // 可编辑矩阵：
  //   运营方：联系人、联系方式（白名单中除锁定字段外的可维护字段）；
  //           统一社会信用代码仅允许在原值为空时补录（迁移存量补录场景）。
  //   现货贸易商（本主体）：联系人、联系方式。
  // 不可编辑：客户名称、客户类型、客户来源、非空信用代码（保证主体唯一与类型稳定）。
  function updateInfo(list, id, patch, opts) {
    opts = opts || {};
    var role = opts.role || 'operator';   // operator | customer
    var i = indexOfId(list, id);
    if (i < 0) return { ok: false, code: 'NOT_FOUND', error: '客户不存在' };
    var rec = list[i];
    if (rec.status !== '正常' && rec.status !== '停用') {
      return { ok: false, code: 'STATE', error: '仅「正常 / 停用」状态的客户可编辑' };
    }
    patch = patch || {};
    var errors = {};
    var changed = [];

    if (patch.name !== undefined && nameKeyOf(patch.name) !== rec.name_key) {
      errors.name = '客户名称不可修改';
    }
    if (patch.customer_type !== undefined && patch.customer_type !== rec.customer_type) {
      errors.customer_type = '客户类型创建后锁定，不可变更';
    }
    if (patch.source !== undefined && patch.source !== rec.source) {
      errors.source = '客户来源不可修改';
    }

    if (patch.contact !== undefined) {
      var e1 = validateContact(patch.contact);
      if (e1) errors.contact = e1;
      else if (trimStr(patch.contact) !== rec.contact) changed.push('联系人');
    }
    if (patch.phone !== undefined) {
      var e2 = validatePhone(patch.phone);
      if (e2) errors.phone = e2;
      else if (trimStr(patch.phone) !== rec.phone) changed.push('联系方式');
    }
    if (patch.credit_code !== undefined) {
      var code = trimStr(patch.credit_code).toUpperCase();
      if (rec.credit_code && code !== rec.credit_code) {
        errors.credit_code = '统一社会信用代码不可修改（原值为空时仅可补录）';
      } else if (!rec.credit_code) {
        var e3 = validateCreditCode(code);
        if (e3) errors.credit_code = e3;
        else if (code) changed.push('统一社会信用代码（补录）');
      }
    }

    if (Object.keys(errors).length) {
      return { ok: false, code: 'INVALID', errors: errors, error: '字段校验未通过' };
    }

    if (changed.length) {
      // 补录信用代码时需再次全量查重
      if (patch.credit_code !== undefined && !rec.credit_code) {
        var dup = findDuplicate(list, { name: rec.name, credit_code: patch.credit_code }, id);
        if (dup) return { ok: false, code: 'DUP', error: dup.msg, dup_field: dup.field };
      }
      var next = list.slice();
      var updated = Object.assign({}, rec);
      if (patch.contact !== undefined) updated.contact = trimStr(patch.contact);
      if (patch.phone !== undefined) updated.phone = trimStr(patch.phone);
      if (patch.credit_code !== undefined && !rec.credit_code) updated.credit_code = trimStr(patch.credit_code).toUpperCase();
      updated.history = rec.history.concat([logEntry('信息修改', '修改：' + changed.join('、'))]);
      touch(updated);
      next[i] = updated;
      return { ok: true, list: next, customer: updated, changed: changed };
    }
    return { ok: true, list: list, customer: rec, changed: [] };
  }

  /* ==================== 停用 / 启用（F7 / BR-C06） ==================== */

  function setStatus(list, id, target, opts) {
    opts = opts || {};
    var action = target === '停用' ? 'disable' : target === '正常' ? 'enable' : null;
    if (!action) return { ok: false, code: 'INVALID', error: '无效的目标状态' };
    var i = indexOfId(list, id);
    if (i < 0) return { ok: false, code: 'NOT_FOUND', error: '客户不存在' };
    var rec = list[i];
    if (!canTransition(action, rec.status)) {
      return { ok: false, code: 'STATE', error: '当前状态「' + rec.status + '」不允许' + (target === '停用' ? '停用' : '启用') };
    }
    var next = list.slice();
    var updated = Object.assign({}, rec, { status: target });
    updated.history = rec.history.concat([logEntry(target === '停用' ? '停用' : '启用',
      target === '停用' ? '客户停用：不可被新业务引用，存量业务数据不受影响' : '客户启用：恢复可被业务引用')]);
    touch(updated);
    next[i] = updated;
    return { ok: true, list: next, customer: updated };
  }

  /* ==================== 业务引用查询（BR-C06 / BR-C09） ==================== */

  // 供订单等业务模块引用：仅「正常」状态客户可选（停用/待审核/已驳回均排除）
  function listActive(list) {
    return list.filter(function (c) { return c.status === '正常'; });
  }

  /* ==================== 数据迁移（10.1 / 10.2 / AC-C10） ==================== */

  // 从存量统一库实体提取联系人信息（白名单字段映射；profile 其余内容不迁移）
  function extractContactFromProfile(profile) {
    var out = { contact: '', phone: '' };
    if (!profile) return out;
    var pairs;
    if (Array.isArray(profile)) {
      pairs = profile.map(function (it) { return { k: trimStr(it && it.label), v: trimStr(it && it.value) }; });
    } else if (typeof profile === 'object') {
      pairs = Object.keys(profile).map(function (k) { return { k: trimStr(k), v: trimStr(profile[k]) }; });
    } else {
      return out;
    }
    pairs.forEach(function (p) {
      if (!p.v) return;
      if (!out.contact && /联系人|经办人/.test(p.k)) out.contact = p.v;
      if (!out.phone && /电话|手机|联系方式/.test(p.k)) out.phone = p.v;
    });
    return out;
  }

  function pickFirst(arr) {
    return (Array.isArray(arr) && arr.length) ? trimStr(arr[0]) : '';
  }

  function hasAny(arr, candidates) {
    if (!Array.isArray(arr)) return false;
    return arr.some(function (v) { return candidates.indexOf(trimStr(v)) >= 0; });
  }

  // 映射规则（10.1）：
  //   矿石贸易商（行业）                              → 待人工归类清单（集采 或 现货）
  //   钢铁生产企业（行业）                            → 下游客户，直接迁入（正常 / 系统迁移）
  //   铁路运营等资源类行业 / 物流等资源类角色（角色）  → 移出客户模块（不迁入）
  function migrateUnified(entities, existingList) {
    var list = (existingList || []).slice();
    var customers = [];
    var pending = [];
    var excluded = [];
    var skipped = [];

    (entities || []).forEach(function (ent) {
      if (!ent || !trimStr(ent.name)) return;
      var industries = Array.isArray(ent.industries) ? ent.industries : [];
      var roles = Array.isArray(ent.roles) ? ent.roles : [];
      var profile = extractContactFromProfile(ent.profile);

      var data = {
        name: trimStr(ent.name),
        credit_code: trimStr(ent.creditCode).toUpperCase(),
        contact: profile.contact,
        phone: profile.phone,
        customer_type: null,
        credentials: [],
        source_refs: Array.isArray(ent.source_refs) ? ent.source_refs : []
      };

      // 查重：与现有库及本批次已迁入记录比对（BR-C02）
      var dup = findDuplicate(list.concat(customers), data);
      if (dup) { skipped.push({ name: data.name, reason: dup.msg }); return; }

      var bucket;
      if (hasAny(industries, ['矿石贸易商'])) {
        bucket = 'pending';   // 矿石贸易商 → 人工归类（行业判定优先于角色）
      } else if (hasAny(industries, ['钢铁生产企业'])) {
        bucket = 'steel';     // 下游客户直接映射
      } else if (hasAny(industries, LEGACY_RESOURCE_INDUSTRIES) || hasAny(roles, LEGACY_RESOURCE_ROLES)) {
        bucket = 'excluded';  // 资源类主体移出客户模块
      } else {
        bucket = 'pending';   // 无明确行业归属的付费主体，交人工归类
      }

      if (bucket === 'excluded') {
        var tag = pickFirst(industries) || pickFirst(roles);
        excluded.push({ name: data.name, reason: '资源类主体（' + tag + '），移出客户模块' });
        return;
      }

      if (bucket === 'steel') {
        var rec = newRecord({
          customer_type: '下游客户',
          name: data.name, contact: data.contact, phone: data.phone,
          credit_code: data.credit_code, credentials: [],
          source_refs: data.source_refs
        }, {
          source: '系统迁移',
          status: '正常',
          history: [logEntry('迁移迁入', '存量钢铁生产企业 → 下游客户，状态正常')],
          migrated_batch: 'mig_' + Date.now().toString(36)
        });
        customers.push(rec);
      } else {
        pending.push({
          id: 'mp_' + Date.now().toString(36) + '_' + Math.floor(Math.random() * 1e6),
          name: data.name,
          credit_code: data.credit_code,
          contact: data.contact,
          phone: data.phone,
          source_refs: data.source_refs,
          added_at: fmtTime(new Date())
        });
      }
    });

    return {
      customers: customers,   // 直接迁入（下游客户）
      pending: pending,       // 待人工归类（矿石贸易商）
      excluded: excluded,     // 移出客户模块
      skipped: skipped,       // 查重跳过
      migrated_batch: 'mig_' + Date.now().toString(36)
    };
  }

  // 人工归类：矿石贸易商 → 集采贸易商 / 现货贸易商（归类确认即生效[假设]）
  function classifyPending(list, pendingList, pendingId, type) {
    if (['集采贸易商', '现货贸易商'].indexOf(type) < 0) {
      return { ok: false, code: 'INVALID', error: '归类类型无效（仅集采贸易商 / 现货贸易商）' };
    }
    var idx = -1;
    for (var i = 0; i < (pendingList || []).length; i++) {
      if (pendingList[i].id === pendingId) { idx = i; break; }
    }
    if (idx < 0) return { ok: false, code: 'NOT_FOUND', error: '待归类记录不存在' };
    var item = pendingList[idx];
    var dup = findDuplicate(list, { name: item.name, credit_code: item.credit_code });
    if (dup) return { ok: false, code: 'DUP', error: dup.msg, dup_field: dup.field };

    var rec = newRecord({
      customer_type: type,
      name: item.name,
      contact: item.contact,
      phone: item.phone,
      credit_code: item.credit_code,
      credentials: type === '现货贸易商' ? [] : [],
      source_refs: item.source_refs || []
    }, {
      source: '系统迁移',
      status: '正常',
      history: [logEntry('归类确认', '存量矿石贸易商人工归类为「' + type + '」，状态正常')]
    });
    rec.migrated_batch = item.migrated_batch || '';
    var nextList = list.concat([rec]);
    var nextPending = pendingList.slice();
    nextPending.splice(idx, 1);
    return { ok: true, list: nextList, pending: nextPending, customer: rec };
  }

  /* ==================== 浏览器持久化（localStorage 可用时生效） ==================== */

  function hasStorage() {
    try { return typeof localStorage !== 'undefined' && !!localStorage; } catch (e) { return false; }
  }

  function readJson(key) {
    if (!hasStorage()) return null;
    try {
      var raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  function loadStore() {
    var w = readJson(STORE_KEY);
    if (w && Array.isArray(w.list)) return w.list;
    return [];
  }

  function saveStore(list) {
    if (!hasStorage()) return;
    localStorage.setItem(STORE_KEY, JSON.stringify({
      __version: STORE_VERSION,
      updated_at: fmtTime(new Date()),
      list: list
    }));
  }

  function loadPending() {
    var w = readJson(PENDING_KEY);
    return (w && Array.isArray(w.list)) ? w.list : [];
  }

  function savePending(pendingList) {
    if (!hasStorage()) return;
    localStorage.setItem(PENDING_KEY, JSON.stringify({
      __version: STORE_VERSION,
      updated_at: fmtTime(new Date()),
      list: pendingList || []
    }));
  }

  function getMigrationState() {
    return readJson(MIGRATION_KEY) || null;
  }

  function saveMigrationState(state) {
    if (!hasStorage()) return;
    localStorage.setItem(MIGRATION_KEY, JSON.stringify(state));
  }

  function readUnified() {
    var w = readJson(UNIFIED_KEY);
    return (w && Array.isArray(w.list)) ? w.list : null;
  }

  /* ==================== 导出 ==================== */

  return {
    // 常量
    STORE_KEY: STORE_KEY, PENDING_KEY: PENDING_KEY, MIGRATION_KEY: MIGRATION_KEY,
    UNIFIED_KEY: UNIFIED_KEY, STORE_VERSION: STORE_VERSION,
    TYPES: TYPES, OPERATOR_TYPES: OPERATOR_TYPES, STATUSES: STATUSES, SOURCES: SOURCES,
    TYPE_TAGS: TYPE_TAGS, OPERATOR: OPERATOR, LIMITS: LIMITS,
    LEGACY_ROLES: LEGACY_ROLES, LEGACY_INDUSTRIES: LEGACY_INDUSTRIES,
    // 工具
    trimStr: trimStr, nameKeyOf: nameKeyOf, fmtTime: fmtTime, deriveTag: deriveTag,
    // 校验与查重
    validateName: validateName, validateCreditCode: validateCreditCode,
    validatePhone: validatePhone, validateContact: validateContact,
    validateCoreFields: validateCoreFields, validateCredentials: validateCredentials,
    findDuplicate: findDuplicate,
    // 状态机
    TRANSITIONS: TRANSITIONS, canTransition: canTransition,
    // 业务操作
    createByOperator: createByOperator,
    createSelfRegistered: createSelfRegistered,
    reviewApprove: reviewApprove, reviewReject: reviewReject, resubmit: resubmit,
    updateInfo: updateInfo, setStatus: setStatus,
    listActive: listActive,
    // 迁移
    migrateUnified: migrateUnified, classifyPending: classifyPending,
    extractContactFromProfile: extractContactFromProfile,
    // 存储
    hasStorage: hasStorage, loadStore: loadStore, saveStore: saveStore,
    loadPending: loadPending, savePending: savePending,
    getMigrationState: getMigrationState, saveMigrationState: saveMigrationState,
    readUnified: readUnified
  };
}));
