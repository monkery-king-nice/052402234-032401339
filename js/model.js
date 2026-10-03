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
      return Array.isArray(value) ? value.filter(item => item && TYPES.includes(item.type) && clean(item.id)) : seed.slice();
    } catch (_) { return seed.slice(); }
  }

  function saveItems(storage, items) { storage.setItem(STORAGE_KEY, JSON.stringify(items)); }
  function getOwnerId(storage) {
    let id = storage.getItem(OWNER_KEY);
    if (!id) {
      id = 'owner-' + (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Date.now() + '-' + Math.random().toString(36).slice(2));
      storage.setItem(OWNER_KEY, id);
    }
    return id;
  }

  return { STORAGE_KEY, OWNER_KEY, CATEGORIES, clean, statusText, validateDraft, createItem, filterItems, updateStatus, readItems, saveItems, getOwnerId };
});
