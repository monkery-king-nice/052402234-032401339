(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.LostFoundModel = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const STORAGE_KEY = 'campus-light-items-v1';
  const OWNER_KEY = 'campus-light-owner-v1';
  const COMMENTS_KEY = 'campus-light-comments-v1:';
  const CATEGORIES = ['证件卡片', '数码设备', '钥匙配饰', '书籍文具', '衣物用品', '其他物品'];
  const TYPES = ['lost', 'found'];
  const MAX_IMAGES = 3;
  const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
  const MAX_IMAGE_BYTES = 200 * 1024;
  const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

  function isImageDataUrl(value) {
    if (typeof value !== 'string' || value.length > Math.ceil(MAX_IMAGE_BYTES / 3) * 4 + 32) return false;
    const match = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
    if (!match || match[2].length % 4 !== 0) return false;
    const data = match[2];
    const bytes = data.length / 4 * 3 - (data.endsWith('==') ? 2 : data.endsWith('=') ? 1 : 0);
    return bytes > 0 && bytes <= MAX_IMAGE_BYTES;
  }

  function validateImageFiles(files, existingCount = 0) {
    if (files.length + existingCount > MAX_IMAGES) return '每条信息最多上传 3 张照片';
    for (const file of files) {
      if (!IMAGE_TYPES.includes(file.type)) return '仅支持 JPG、PNG 和 WebP 图片';
      if (!file.size) return '不能上传空文件，请重新选择照片';
      if (file.size > MAX_UPLOAD_BYTES) return '每张照片不能超过 5 MB，请缩小后重试';
    }
    return '';
  }

  function clean(value) { return String(value ?? '').trim(); }
  function statusText(item) {
    if (item.status === 'active') return item.type === 'lost' ? '寻找中' : '待认领';
    return item.type === 'lost' ? '已找到' : '已归还';
  }

  function validateDraft(draft) {
    const errors = {};
    if (!TYPES.includes(draft.type)) errors.type = '请选择信息类型';
    if (clean(draft.title).length < 2 || clean(draft.title).length > 40) errors.title = '物品名称需为 2–40 个字符';
    if (!CATEGORIES.includes(draft.category)) errors.category = '请选择物品类别';
    if (clean(draft.location).length < 2 || clean(draft.location).length > 60) errors.location = '地点需为 2–60 个字符';
    const date = clean(draft.date);
    const parsedDate = /^\d{4}-\d{2}-\d{2}$/.test(date) ? new Date(date + 'T00:00:00Z') : null;
    if (!parsedDate || Number.isNaN(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== date) errors.date = '请选择有效日期';
    if (clean(draft.description).length < 10 || clean(draft.description).length > 500) errors.description = '详细描述需为 10–500 个字符';
    if (clean(draft.contact).length < 5 || clean(draft.contact).length > 80) errors.contact = '联系方式需为 5–80 个字符';
    if (clean(draft.publisher).length < 2 || clean(draft.publisher).length > 24) errors.publisher = '称呼需为 2–24 个字符';
    if (draft.images !== undefined && (!Array.isArray(draft.images) || draft.images.length > MAX_IMAGES || !draft.images.every(isImageDataUrl))) errors.images = '照片无效或数量过多，请重新选择照片';
    return errors;
  }

  function createItem(draft, ownerId, now = new Date(), id) {
    const errors = validateDraft(draft);
    if (Object.keys(errors).length) {
      const error = new Error('信息不完整，请检查表单');
      error.fields = errors;
      throw error;
    }
    if (!clean(ownerId)) throw new Error('缺少发布者标识');
    return {
      id: id || ('post-' + now.getTime() + '-' + Math.random().toString(36).slice(2, 8)),
      ownerId: clean(ownerId),
      type: draft.type,
      title: clean(draft.title),
      category: draft.category,
      location: clean(draft.location),
      date: clean(draft.date),
      description: clean(draft.description),
      contact: clean(draft.contact),
      publisher: clean(draft.publisher),
      images: (draft.images || []).slice(),
      status: 'active',
      createdAt: now.toISOString()
    };
  }

  function validDate(date) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
    const parsed = new Date(date + 'T00:00:00Z');
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
  }
  function validateDateRange(filters = {}) {
    const start = clean(filters.startDate), end = clean(filters.endDate);
    if ((start && !validDate(start)) || (end && !validDate(end))) return '请选择有效的丢失 / 拾取日期';
    if (start && end && start > end) return '开始日期不能晚于结束日期，请修改日期范围';
    return '';
  }
  function validateComment(draft) {
    const errors = {};
    if (clean(draft.nickname).length < 2 || clean(draft.nickname).length > 24) errors.nickname = '昵称需为 2–24 个字符';
    if (!clean(draft.body).length || clean(draft.body).length > 500) errors.body = '评论需为 1–500 个字符';
    return errors;
  }
  function commentStorageKey(itemId) {
    if (!clean(itemId)) throw new Error('缺少启事标识');
    return COMMENTS_KEY + encodeURIComponent(itemId);
  }
  function readComments(storage, itemId) {
    try {
      const raw = storage.getItem(commentStorageKey(itemId));
      if (raw === null) return [];
      const comments = JSON.parse(raw);
      if (!Array.isArray(comments) || comments.some(comment => !comment || comment.itemId !== itemId ||
        !clean(comment.id) || Object.keys(validateComment(comment)).length ||
        typeof comment.createdAt !== 'string' || Number.isNaN(Date.parse(comment.createdAt)))) throw new Error('invalid comments');
      return comments.slice().sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
    } catch (cause) {
      throw Object.assign(new Error('无法读取这条启事的评论，请检查浏览器本地存储；原数据未被覆盖'), { cause });
    }
  }
  function addComment(storage, itemId, draft, now = new Date(), id) {
    const errors = validateComment(draft);
    if (Object.keys(errors).length) throw Object.assign(new Error('请检查昵称和评论'), { fields: errors });
    const comments = readComments(storage, itemId);
    const comment = {
      id: id || ('comment-' + (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : now.getTime() + '-' + Math.random().toString(36).slice(2))),
      itemId, nickname: clean(draft.nickname), body: clean(draft.body), createdAt: now.toISOString()
    };
    try { storage.setItem(commentStorageKey(itemId), JSON.stringify([...comments, comment])); }
    catch (cause) {
      const message = cause.name === 'QuotaExceededError' || cause.name === 'NS_ERROR_DOM_QUOTA_REACHED'
        ? '浏览器存储空间不足，评论未保存；输入与原有评论仍保留'
        : '无法保存评论，请检查浏览器本地存储权限；输入仍保留';
      throw Object.assign(new Error(message), { cause });
    }
    return comment;
  }
  function removeComments(storage, itemId) {
    try { storage.removeItem(commentStorageKey(itemId)); }
    catch (cause) { throw Object.assign(new Error('启事已删除，但其评论清理失败；其他启事及评论仍保留'), { cause }); }
  }
  function filterItems(items, filters = {}) {
    if (validateDateRange(filters)) return [];
    const start = clean(filters.startDate), end = clean(filters.endDate);
    const query = clean(filters.query).toLocaleLowerCase();
    return items.filter(item => {
      // Canonical YYYY-MM-DD strings compare by calendar day, without timezone conversion.
      if (start && (!validDate(item.date) || item.date < start)) return false;
      if (end && (!validDate(item.date) || item.date > end)) return false;
      if (filters.type && filters.type !== 'all' && item.type !== filters.type) return false;
      if (filters.category && filters.category !== 'all' && item.category !== filters.category) return false;
      if (filters.status && filters.status !== 'all' && item.status !== filters.status) return false;
      if (!query) return true;
      return [item.title, item.category, item.location, item.description]
        .some(value => clean(value).toLocaleLowerCase().includes(query));
    }).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  }

  function updateStatus(items, id, ownerId, status) {
    if (!['active', 'resolved'].includes(status)) throw new Error('无效状态');
    const item = items.find(entry => entry.id === id);
    if (!item) throw new Error('信息不存在');
    if (!ownerId || item.ownerId !== ownerId) throw new Error('只有发布者可以更新状态');
    return items.map(entry => entry.id === id ? { ...entry, status } : entry);
  }

  function removeItem(items, id, ownerId) {
    const item = items.find(entry => entry.id === id);
    if (!item) throw new Error('信息不存在');
    if (!clean(ownerId) || item.ownerId !== ownerId || item.ownerId === 'demo') throw new Error('只能删除自己发布的信息');
    return items.filter(entry => entry.id !== id);
  }

  function readItems(storage, seed) {
    try {
      const raw = storage.getItem(STORAGE_KEY);
      if (raw === null) return seed.slice();
      const value = JSON.parse(raw);
      return Array.isArray(value) ? value.filter(item => item && TYPES.includes(item.type) && clean(item.id)).map(item => ({ ...item, images: Array.isArray(item.images) ? item.images.filter(isImageDataUrl).slice(0, MAX_IMAGES) : [] })) : seed.slice();
    } catch (_) { return seed.slice(); }
  }

  function saveItems(storage, items) {
    try { storage.setItem(STORAGE_KEY, JSON.stringify(items)); }
    catch (cause) {
      const error = new Error(cause.name === 'QuotaExceededError' || cause.name === 'NS_ERROR_DOM_QUOTA_REACHED'
        ? '浏览器存储空间不足，请减少照片数量后重试；原有信息仍保留'
        : '无法保存信息，请检查浏览器是否允许本地存储');
      error.cause = cause;
      throw error;
    }
  }
  function getOwnerId(storage) {
    let id = storage.getItem(OWNER_KEY);
    if (!id) {
      id = 'owner-' + (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Date.now() + '-' + Math.random().toString(36).slice(2));
      storage.setItem(OWNER_KEY, id);
    }
    return id;
  }

  return { STORAGE_KEY, OWNER_KEY, COMMENTS_KEY, CATEGORIES, MAX_IMAGES, MAX_UPLOAD_BYTES, MAX_IMAGE_BYTES, IMAGE_TYPES, isImageDataUrl, validateImageFiles, clean, statusText, validateDraft, validDate, validateDateRange, validateComment, commentStorageKey, readComments, addComment, removeComments, createItem, filterItems, updateStatus, removeItem, readItems, saveItems, getOwnerId };
});
