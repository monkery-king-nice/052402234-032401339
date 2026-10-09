const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../js/model');
const items = ['2026-09-27','2026-09-28','2026-09-29'].map((date,i)=>({id:String(i),date,type:'lost',category:'证件卡片',status:'active',title:'校园卡',createdAt:'2026-10-01'}));
test('日期范围包含开始和结束当天，依据物品日期而非发布时间',()=>assert.equal(M.filterItems(items,{startDate:'2026-09-27',endDate:'2026-09-28'}).length,2));
test('仅开始日期与仅结束日期',()=>{
  assert.equal(M.filterItems(items,{startDate:'2026-09-28'}).length,2);
  assert.equal(M.filterItems(items,{endDate:'2026-09-28'}).length,2);
});
test('同一天边界，不限日期与清空条件',()=>{
  assert.equal(M.filterItems(items,{startDate:'2026-09-28',endDate:'2026-09-28'}).length,1);
  assert.equal(M.filterItems(items,{}).length,3);
  assert.equal(M.filterItems(items,{startDate:'',endDate:''}).length,3);
});
test('无效范围返回提示和空结果；无效日历日期被拒绝',()=>{
  assert.match(M.validateDateRange({startDate:'2026-09-29',endDate:'2026-09-27'}),/不能晚于/);
  assert.equal(M.filterItems(items,{startDate:'2026-09-29',endDate:'2026-09-27'}).length,0);
  assert.ok(M.validateDateRange({endDate:'2026-02-30'}));
});
test('日期与全部已有条件组合；无结果',()=>{
  const filters={query:'校园卡',type:'lost',category:'证件卡片',status:'active',startDate:'2026-09-28'};
  assert.equal(M.filterItems(items,filters).length,2);
  assert.equal(M.filterItems(items,{...filters,query:'耳机'}).length,0);
  assert.equal(M.filterItems(items,{...filters,type:'found'}).length,0);
});
test('评论校验去除空白，检查昵称和正文边界',()=>{
  assert.deepEqual(M.validateComment({nickname:' 小林 ',body:' 线索 '}),{});
  assert.ok(M.validateComment({nickname:' ',body:'线索'}).nickname);
  assert.ok(M.validateComment({nickname:'小林',body:'\n\t '}).body);
  assert.ok(M.validateComment({nickname:'字'.repeat(25),body:'线索'}).nickname);
  assert.ok(M.validateComment({nickname:'小林',body:'字'.repeat(501)}).body);
  assert.deepEqual(M.validateComment({nickname:'字'.repeat(24),body:'字'.repeat(500)}),{});
});
