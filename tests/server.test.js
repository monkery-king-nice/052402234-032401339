const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createService } = require('../server/server');
const draft={type:'lost',title:'共享测试校园卡',category:'证件卡片',location:'图书馆服务台',date:'2026-10-01',description:'这是独立测试数据，背面贴有一张白色贴纸。',contact:'test@example.com',publisher:'测试同学'};
async function fixture(t,dbPath=':memory:') {
  const service=createService({dbPath,seedItems:[]});
  await new Promise(resolve=>service.server.listen(0,'127.0.0.1',resolve));
  t.after(()=>service.close());
  const url='http://127.0.0.1:'+service.server.address().port;
  const call=async (route,method='GET',data,token)=>{
    const response=await fetch(url+'/api'+route,{method,headers:{...(token?{Authorization:'Bearer '+token}:{}),...(data?{'Content-Type':'application/json'}:{})},body:data?JSON.stringify(data):undefined});
    return {status:response.status,data:await response.json()};
  };
  return {service,url,call};
}
test('服务签发身份；忽略伪造 ownerId；非发布者不能修改和删除',async t=>{
  const {call}=await fixture(t);
  const a=(await call('/session','POST',{})).data,b=(await call('/session','POST',{})).data;
  const item=(await call('/items','POST',{...draft,ownerId:b.ownerId},a.token)).data;
  assert.equal(item.ownerId,a.ownerId);
  assert.equal((await call('/items/'+item.id,'PATCH',{status:'resolved',ownerId:a.ownerId},b.token)).status,403);
  assert.equal((await call('/items/'+item.id,'DELETE',undefined,b.token)).status,403);
  assert.equal((await call('/items','POST',draft,'forged-token')).status,401);
  assert.equal((await call('/items/'+item.id,'PATCH',{status:'resolved'},a.token)).data.status,'resolved');
});
test('两套独立身份共享启事和评论，按时间顺序隔离，重试不重复，完成后仍可评论',async t=>{
  const {call}=await fixture(t);
  const a=(await call('/session','POST',{})).data,b=(await call('/session','POST',{})).data;
  const item=(await call('/items','POST',draft,a.token)).data;
  const other=(await call('/items','POST',{...draft,title:'另一条启事'},a.token)).data;
  assert.ok((await call('/items')).data.some(x=>x.id===item.id));
  const comment={nickname:' 测试乙 ',body:' <img src=x onerror=alert(1)> ',requestId:'request-001'};
  assert.equal((await call('/items/'+item.id+'/comments','POST',comment,b.token)).status,201);
  assert.equal((await call('/items/'+item.id+'/comments','POST',comment,b.token)).status,200);
  await call('/items/'+item.id,'PATCH',{status:'resolved'},a.token);
  await call('/items/'+item.id+'/comments','POST',{nickname:'测试甲',body:'已核实线索，谢谢',requestId:'request-002'},a.token);
  const comments=(await call('/items/'+item.id+'/comments')).data;
  assert.equal(comments.length,2);assert.equal(comments[0].body,'<img src=x onerror=alert(1)>');
  assert.equal(comments[0].nickname,'测试乙');assert.ok(comments[0].createdAt<=comments[1].createdAt);
  assert.equal((await call('/items/'+other.id+'/comments')).data.length,0);
  assert.equal((await call('/items/'+other.id+'/comments','POST',comment,b.token)).status,409);
  await call('/items/'+item.id,'DELETE',undefined,a.token);
  assert.equal((await call('/items/'+item.id+'/comments')).status,404);
});
test('服务端独立校验空白与超长评论，并拒绝未认证写入',async t=>{
  const {call}=await fixture(t);const a=(await call('/session','POST',{})).data;
  const item=(await call('/items','POST',draft,a.token)).data;
  for(const comment of [{nickname:' ',body:'线索'},{nickname:'测试',body:' '},{nickname:'字'.repeat(25),body:'线索'},{nickname:'测试',body:'字'.repeat(501)}]){
    assert.equal((await call('/items/'+item.id+'/comments','POST',{...comment,requestId:'valid-key'},a.token)).status,400);
  }
  assert.equal((await call('/items/'+item.id+'/comments','POST',{nickname:'测试',body:'线索',requestId:'valid-key'})).status,401);
});
test('本地复制幂等，原有照片与完成状态保留；数据库重启保持身份和数据',async t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'campus-test-')); const dbPath=path.join(dir,'test.sqlite');
  const first=createService({dbPath,seedItems:[]}); await new Promise(r=>first.server.listen(0,'127.0.0.1',r));
  const base='http://127.0.0.1:'+first.server.address().port+'/api';
  const session=await (await fetch(base+'/session',{method:'POST'})).json();
  const photo='data:image/png;base64,aGVsbG8=';
  const post=()=>fetch(base+'/items',{method:'POST',headers:{Authorization:'Bearer '+session.token,'Content-Type':'application/json'},body:JSON.stringify({...draft,images:[photo],legacyKey:'legacy-1',status:'resolved'})}).then(r=>r.json());
  const item=await post();assert.equal((await post()).id,item.id);await first.close();
  const second=await fixture(t,dbPath);
  t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const loaded=(await second.call('/items')).data;assert.equal(loaded.length,1);assert.deepEqual(loaded[0].images,[photo]);assert.equal(loaded[0].status,'resolved');
  assert.equal((await second.call('/session','POST',{},session.token)).data.ownerId,session.ownerId);
});
test('私有文件不能经静态服务下载，CORS允许file来源而拒绝任意来源',async t=>{
  const {url}=await fixture(t);
  for(const target of ['/server/data/campus.sqlite','/server/server.js','/package.json','/.env','/js/../server/server.js'])assert.equal((await fetch(url+target)).status,404);
  const allowed=await fetch(url+'/api/items',{headers:{Origin:'null'}});assert.equal(allowed.headers.get('access-control-allow-origin'),'null');
  assert.equal((await fetch(url+'/api/items',{headers:{Origin:'https://unexpected.example'}})).status,403);
});
