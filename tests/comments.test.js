const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../js/model');
function memory() {
  const values = new Map();
  return {getItem:key=>values.get(key) ?? null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};
}
const draft = {nickname:' 测试同学 ',body:' 图书馆服务台有相似物品。 '};
test('评论去除首尾空白并保存，重新读取仍保留昵称、正文、时间和启事ID',()=>{
  const storage=memory();const now=new Date('2026-10-10T02:00:00Z');
  const comment=M.addComment(storage,'item-a',draft,now,'comment-a');
  assert.equal(comment.nickname,'测试同学');assert.equal(comment.body,'图书馆服务台有相似物品。');assert.equal(comment.createdAt,now.toISOString());
  assert.deepEqual(M.readComments(storage,'item-a'),[comment]);
});
test('不同启事评论隔离，特殊字符ID不冲突',()=>{
  const storage=memory();M.addComment(storage,'item/a',draft);M.addComment(storage,'item%2Fa',{nickname:'另一同学',body:'另一条线索'});
  assert.notEqual(M.commentStorageKey('item/a'),M.commentStorageKey('item%2Fa'));
  assert.equal(M.readComments(storage,'item/a')[0].body,'图书馆服务台有相似物品。');
  assert.equal(M.readComments(storage,'item%2Fa')[0].body,'另一条线索');assert.deepEqual(M.readComments(storage,'absent'),[]);
});
test('评论按时间从早到晚，同一时间维持插入顺序',()=>{
  const storage=memory();
  M.addComment(storage,'a',draft,new Date('2026-10-10T02:00:00Z'),'later');
  M.addComment(storage,'a',draft,new Date('2026-10-09T02:00:00Z'),'earlier');
  M.addComment(storage,'a',draft,new Date('2026-10-10T02:00:00Z'),'tie');
  assert.deepEqual(M.readComments(storage,'a').map(x=>x.id),['earlier','later','tie']);
});
test('空白与超长评论不能写入存储，合法边界可保存',()=>{
  const storage=memory();
  for(const value of [{nickname:' ',body:'线索'},{nickname:'同学',body:'\n '},{nickname:'字'.repeat(25),body:'线索'},{nickname:'同学',body:'字'.repeat(501)}])assert.throws(()=>M.addComment(storage,'a',value),/请检查/);
  assert.equal(storage.getItem(M.commentStorageKey('a')),null);
  M.addComment(storage,'a',{nickname:'字'.repeat(24),body:'字'.repeat(500)});assert.equal(M.readComments(storage,'a').length,1);
});
test('存储写入失败不覆盖已保存评论，恢复后可以重试',()=>{
  const storage=memory();M.addComment(storage,'a',draft);const before=storage.getItem(M.commentStorageKey('a'));
  const full={getItem:storage.getItem,setItem:()=>{throw Object.assign(new Error('quota'),{name:'QuotaExceededError'});}};
  assert.throws(()=>M.addComment(full,'a',draft),/存储空间不足/);assert.equal(storage.getItem(M.commentStorageKey('a')),before);
  M.addComment(storage,'a',draft);assert.equal(M.readComments(storage,'a').length,2);
});
test('损坏或串条数据读取报错，提交不会覆盖原数据',()=>{
  const storage=memory(), key=M.commentStorageKey('a');
  for(const raw of ['{broken','{}',JSON.stringify([{id:'x',itemId:'b',nickname:'同学',body:'线索',createdAt:'2026-10-10'}])]){
    storage.setItem(key,raw);assert.throws(()=>M.readComments(storage,'a'),/原数据未被覆盖/);assert.throws(()=>M.addComment(storage,'a',draft),/无法读取/);assert.equal(storage.getItem(key),raw);
  }
});
test('删除仅清理目标评论，其他启事、照片与评论字节不变',()=>{
  const storage=memory();storage.setItem(M.STORAGE_KEY,'existing posts and photos');
  M.addComment(storage,'a',draft);M.addComment(storage,'b',draft);const other=storage.getItem(M.commentStorageKey('b'));
  M.removeComments(storage,'a');assert.deepEqual(M.readComments(storage,'a'),[]);assert.equal(storage.getItem(M.commentStorageKey('b')),other);assert.equal(storage.getItem(M.STORAGE_KEY),'existing posts and photos');
});
test('清理失败明确提示且未清空其他评论；HTML样式输入按原文本保存',()=>{
  const storage=memory();M.addComment(storage,'a',{nickname:'<小林>',body:'<script>alert(1)</script>'});
  assert.equal(M.readComments(storage,'a')[0].body,'<script>alert(1)</script>');
  assert.throws(()=>M.removeComments({removeItem:()=>{throw new Error('denied');}},'a'),/启事已删除/);assert.equal(M.readComments(storage,'a').length,1);
});
