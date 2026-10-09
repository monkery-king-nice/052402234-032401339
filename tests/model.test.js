const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../js/model.js');

const base = {
  type: 'lost', title: '蓝色校园卡', category: '证件卡片', location: '图书馆二楼',
  date: '2026-09-28', description: '蓝色卡套，背面有白色兔子贴纸。',
  contact: '微信 campus_demo', publisher: '小林同学'
};
const make = (overrides = {}) => M.createItem({ ...base, ...overrides }, 'owner-a', new Date('2026-09-29T10:00:00Z'), 'id-1');
const memory = () => {
  const values = new Map();
  return { getItem: key => values.has(key) ? values.get(key) : null, setItem: (key, value) => values.set(key, value) };
};

test('有效寻物信息可创建且默认处于进行中', () => {
  const item = make();
  assert.equal(item.status, 'active');
  assert.equal(item.ownerId, 'owner-a');
  assert.equal(M.statusText(item), '寻找中');
});
test('招领信息显示待认领，完成后显示已归还', () => {
  const item = make({ type: 'found' });
  assert.equal(M.statusText(item), '待认领');
  assert.equal(M.statusText({ ...item, status: 'resolved' }), '已归还');
});
test('寻物完成后显示已找到', () => assert.equal(M.statusText({ ...make(), status: 'resolved' }), '已找到'));
test('空物品名称被拒绝', () => assert.equal(M.validateDraft({ ...base, title: ' ' }).title, '物品名称需为 2–40 个字符'));
test('无效类别被拒绝', () => assert.ok(M.validateDraft({ ...base, category: '随意类别' }).category));
test('无效日历日期被拒绝', () => assert.ok(M.validateDraft({ ...base, date: '2026-02-30' }).date));
test('过短描述和联系方式被拒绝', () => {
  const errors = M.validateDraft({ ...base, description: '短', contact: '12' });
  assert.ok(errors.description); assert.ok(errors.contact);
});
test('创建时会清理首尾空格', () => assert.equal(make({ title: '  蓝色校园卡  ' }).title, '蓝色校园卡'));
test('关键词可匹配物品名称', () => assert.equal(M.filterItems([make()], { query: '校园卡' }).length, 1));
test('关键词可匹配地点和描述且忽略大小写', () => {
  const items = [make({ location: 'Library A', description: 'Blue card near window.' })];
  assert.equal(M.filterItems(items, { query: 'library' }).length, 1);
  assert.equal(M.filterItems(items, { query: 'BLUE' }).length, 1);
});
test('类型、类别和状态组合筛选', () => {
  const lost = make(); const found = { ...make({ type: 'found' }), id: 'id-2', status: 'resolved' };
  assert.deepEqual(M.filterItems([lost, found], { type: 'found', category: '证件卡片', status: 'resolved' }).map(x => x.id), ['id-2']);
  assert.equal(M.filterItems([lost, found], { type: 'found', status: 'active' }).length, 0);
});
test('检索结果按发布时间倒序排列', () => {
  const first = make(); const newer = { ...make(), id: 'id-2', createdAt: '2026-09-30T10:00:00Z' };
  assert.deepEqual(M.filterItems([first, newer]).map(x => x.id), ['id-2', 'id-1']);
});
test('发布者可以标记完成或恢复进行中', () => {
  const completed = M.updateStatus([make()], 'id-1', 'owner-a', 'resolved');
  assert.equal(completed[0].status, 'resolved');
  assert.equal(M.updateStatus(completed, 'id-1', 'owner-a', 'active')[0].status, 'active');
});
test('非发布者无法修改状态', () => assert.throws(() => M.updateStatus([make()], 'id-1', 'owner-b', 'resolved'), /只有发布者/));
test('不存在的信息或非法状态不能更新', () => {
  assert.throws(() => M.updateStatus([make()], 'missing', 'owner-a', 'resolved'), /不存在/);
  assert.throws(() => M.updateStatus([make()], 'id-1', 'owner-a', 'deleted'), /无效状态/);
});
test('信息写入后可从本地存储读取', () => {
  const storage = memory(); M.saveItems(storage, [make()]);
  assert.equal(M.readItems(storage, []).length, 1);
});
test('本地存储损坏时回退到演示数据', () => {
  const storage = memory(); storage.setItem(M.STORAGE_KEY, '{broken');
  assert.deepEqual(M.readItems(storage, [make()]).map(x => x.id), ['id-1']);
});
test('同一浏览器复用发布者标识', () => {
  const storage = memory(); const first = M.getOwnerId(storage);
  assert.equal(M.getOwnerId(storage), first);
});

const photo = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a2ioAAAAASUVORK5CYII=';
test('不上传照片时仍可发布且照片列表为空', () => assert.deepEqual(make().images, []));
test('发布的照片独立保存，修改草稿数组不会修改信息', () => {
  const images = [photo]; const item = make({ images }); images.length = 0;
  assert.deepEqual(item.images, [photo]);
});
test('照片随信息保存并可在刷新时读取', () => {
  const storage = memory(); M.saveItems(storage, [make({ images: [photo] })]);
  assert.deepEqual(M.readItems(storage, [])[0].images, [photo]);
});
test('更新状态保留照片', () => assert.deepEqual(M.updateStatus([make({ images: [photo] })], 'id-1', 'owner-a', 'resolved')[0].images, [photo]));
test('最多三张照片，超过上限或无效照片数组被拒绝', () => {
  assert.equal(M.validateDraft({ ...base, images: [photo, photo, photo] }).images, undefined);
  assert.ok(M.validateDraft({ ...base, images: [photo, photo, photo, photo] }).images);
  assert.ok(M.validateDraft({ ...base, images: 'not-an-array' }).images);
});
test('照片仅接受受限的图片数据，拒绝外部链接和 SVG', () => {
  for (const src of ['https://example.com/photo.jpg', 'javascript:alert(1)', 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=', 'data:text/html;base64,PHNjcmlwdD4=', 'data:image/png;base64,???']) {
    assert.equal(M.isImageDataUrl(src), false);
    assert.ok(M.validateDraft({ ...base, images: [src] }).images);
  }
});
test('压缩图片大小边界，超出 200 KB 被拒绝', () => {
  const data = bytes => 'data:image/jpeg;base64,' + Buffer.alloc(bytes).toString('base64');
  assert.equal(M.isImageDataUrl(data(M.MAX_IMAGE_BYTES)), true);
  assert.equal(M.isImageDataUrl(data(M.MAX_IMAGE_BYTES + 1)), false);
});
test('上传支持三种格式，拒绝空文件、不支持的格式和超过 5 MB 的文件', () => {
  for (const type of M.IMAGE_TYPES) assert.equal(M.validateImageFiles([{ type, size: M.MAX_UPLOAD_BYTES }]), '');
  assert.match(M.validateImageFiles([{ type: 'image/jpeg', size: M.MAX_UPLOAD_BYTES + 1 }]), /5 MB/);
  assert.match(M.validateImageFiles([{ type: 'image/png', size: 0 }]), /空文件/);
  assert.match(M.validateImageFiles([{ type: 'image/svg+xml', size: 20 }]), /仅支持/);
  assert.match(M.validateImageFiles([{ type: 'image/png', size: 20 }], 3), /最多/);
});
test('旧记录兼容且损坏的照片不会作为图片渲染', () => {
  const storage = memory();
  M.saveItems(storage, [{ ...make(), images: undefined }, { ...make(), id: 'id-2', images: ['javascript:alert(1)', photo] }]);
  const loaded = M.readItems(storage, []);
  assert.deepEqual(loaded[0].images, []);
  assert.deepEqual(loaded[1].images, [photo]);
});
test('存储空间不足时给出明确提示且原有存储保留', () => {
  const storage = memory(); M.saveItems(storage, [make()]);
  const full = { getItem: storage.getItem, setItem: () => { throw Object.assign(new Error('full'), { name: 'QuotaExceededError' }); } };
  assert.throws(() => M.saveItems(full, [make({ images: [photo] })]), /存储空间不足/);
  assert.deepEqual(M.readItems(storage, [])[0].images, []);
});
