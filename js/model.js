(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.LostFoundModel = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const STORAGE_KEY = 'campus-light-items-v1';
  const OWNER_KEY = 'campus-light-owner-v1';
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

  function filterItems(items, filters = {}) {
    const query = clean(filters.query).toLocaleLowerCase();
    return items.filter(item => {
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

  return { STORAGE_KEY, OWNER_KEY, CATEGORIES, MAX_IMAGES, MAX_UPLOAD_BYTES, MAX_IMAGE_BYTES, IMAGE_TYPES, isImageDataUrl, validateImageFiles, clean, statusText, validateDraft, createItem, filterItems, updateStatus, readItems, saveItems, getOwnerId };
});
