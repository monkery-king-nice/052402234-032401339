(function () {
  'use strict';
  const M = window.LostFoundModel;
  const $ = selector => document.querySelector(selector);
  const $$ = selector => [...document.querySelectorAll(selector)];
  const emoji = { '证件卡片': '🪪', '数码设备': '🎧', '钥匙配饰': '🔑', '书籍文具': '📚', '衣物用品': '🎒', '其他物品': '📦' };
  const seed = [
    { id:'demo-1',ownerId:'demo',type:'lost',title:'蓝色校园卡',category:'证件卡片',location:'图书馆二楼自习区',date:'2026-09-28',description:'蓝色卡套，背面有一张小兔贴纸。可能落在靠窗的自习桌附近。如有线索请联系我，谢谢！',contact:'演示微信：campus_demo_01',publisher:'小林同学',status:'active',createdAt:'2026-09-29T09:12:00.000Z' },
    { id:'demo-2',ownerId:'demo',type:'found',title:'白色无线耳机',category:'数码设备',location:'教学楼 A 座一楼',date:'2026-09-29',description:'在一楼饮水机附近捡到白色耳机盒，盒身有轻微划痕。请失主说出耳机品牌及盒内特征后认领。',contact:'演示邮箱：demo02@example.com',publisher:'阿舟同学',status:'active',createdAt:'2026-09-29T06:30:00.000Z' },
    { id:'demo-3',ownerId:'demo',type:'found',title:'一串钥匙',category:'钥匙配饰',location:'东区食堂门口',date:'2026-09-27',description:'晚饭时间在门口台阶旁捡到一串钥匙，带有绿色挂件。请描述钥匙数量与挂件图案进行核实。',contact:'演示 QQ：123456789',publisher:'小许同学',status:'active',createdAt:'2026-09-28T04:20:00.000Z' },
    { id:'demo-4',ownerId:'demo',type:'lost',title:'高等数学笔记本',category:'书籍文具',location:'逸夫楼 301 教室',date:'2026-09-25',description:'黑色封面的活页笔记本，里面有手写的高数复习笔记，封面内侧写了名字缩写。',contact:'演示微信：campus_demo_04',publisher:'小陈同学',status:'active',createdAt:'2026-09-26T11:13:00.000Z' },
    { id:'demo-5',ownerId:'demo',type:'found',title:'米色帆布包',category:'衣物用品',location:'体育馆看台',date:'2026-09-23',description:'在体育馆看台找到一只米色帆布包，已由失主确认内部物品后归还。',contact:'演示邮箱：demo05@example.com',publisher:'小何同学',status:'resolved',createdAt:'2026-09-24T12:00:00.000Z' },
    { id:'demo-6',ownerId:'demo',type:'lost',title:'黑色保温杯',category:'其他物品',location:'西区操场',date:'2026-09-22',description:'黑色磨砂保温杯，杯盖有银色挂环。已在操场服务台找回，感谢帮助！',contact:'演示微信：campus_demo_06',publisher:'小郑同学',status:'resolved',createdAt:'2026-09-23T04:40:00.000Z' }
  ];
  const storage = window.localStorage;
  const ownerId = M.getOwnerId(storage);
  let items = M.readItems(storage, seed);
  let filters = { query:'', type:'all', category:'all', status:'all' };
  let selectedId = null;
  let toastTimer;

  function esc(value) { return String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char])); }
  function dateText(value) { return value ? value.replaceAll('-', '.') : ''; }
  function notify(message) { const el=$('#toast');el.textContent=message;el.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),2800); }
  function persist() { M.saveItems(storage, items); }
  function categoryOptions() {
    $('#categoryFilter').insertAdjacentHTML('beforeend', M.CATEGORIES.map(x=>`<option value="${esc(x)}">${esc(x)}</option>`).join(''));
    $('[name="category"]').insertAdjacentHTML('beforeend', M.CATEGORIES.map(x=>`<option value="${esc(x)}">${esc(x)}</option>`).join(''));
  }

  function card(item) {
    const mine = item.ownerId === ownerId;
    return `<article class="item-card" data-type="${item.type}">
      <div class="card-visual"><span class="card-emoji" aria-hidden="true">${emoji[item.category] || '📦'}</span><span class="type-pill">${item.type==='lost'?'寻物启事':'招领启事'}</span><span class="status-pill ${item.status==='resolved'?'resolved':''}">${M.statusText(item)}</span></div>
      <div class="card-body"><span class="card-category">${esc(item.category)}</span><h3>${esc(item.title)}</h3><p class="card-desc">${esc(item.description)}</p><div class="card-meta"><span>⌖ ${esc(item.location)}</span><span>${dateText(item.date)}</span></div><div class="card-footer"><small>${mine?'我发布的':esc(item.publisher)}</small><button type="button" data-detail="${esc(item.id)}" aria-label="查看${esc(item.title)}详情">查看详情 →</button></div></div>
    </article>`;
  }
  function empty(title, text, button) { return `<div class="empty-state"><span class="empty-icon">🧭</span><h3>${title}</h3><p>${text}</p>${button?'<button type="button" class="button button-primary" data-action="publish">＋ 发布信息</button>':''}</div>`; }
  function renderHome() {
    const result=M.filterItems(items,filters);
    $('#activeCount').textContent=items.filter(item=>item.status==='active').length;
    $('#resultText').textContent=`共找到 ${result.length} 条相关信息`;
    $('#clearFilters').hidden=!(filters.query || filters.type!=='all' || filters.category!=='all' || filters.status!=='all');
    $('#cardGrid').innerHTML=result.length?result.map(card).join(''):empty('暂时没有匹配的线索','试试其他关键词或清除筛选条件。',false);
  }
  function renderMine() {
    const mine=M.filterItems(items,{}).filter(item=>item.ownerId===ownerId);
    $('#mineSummary').innerHTML=`共发布 <strong>${mine.length}</strong> 条 · 进行中 <strong>${mine.filter(item=>item.status==='active').length}</strong> 条`;
    $('#mineGrid').innerHTML=mine.length?mine.map(card).join(''):empty('还没有发布信息','你发布的寻物或招领信息会显示在这里。',true);
  }
  function renderAll() { renderHome();renderMine(); }
  function route() {
    const mine=location.hash==='#mine';
    $('#homePage').hidden=mine;$('#minePage').hidden=!mine;
    $$('[data-nav]').forEach(a=>a.classList.toggle('active',a.dataset.nav===(mine?'mine':location.hash==='#guide'?'guide':'home')));
    if (location.hash==='#guide') setTimeout(()=>$('#guide').scrollIntoView({behavior:'smooth'}),0);
    else window.scrollTo({top:0,behavior:'auto'});
  }
  function openPublish(type='lost') {
    $('#publishForm').reset();
    $$('[data-error]').forEach(el=>el.textContent='');
    $(`[name="type"][value="${type}"]`).checked=true;
    const today=new Date();
    $('[name="date"]').value=`${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
    $('#publishDialog').showModal();
    setTimeout(()=>$('[name="title"]').focus(),0);
  }
  function detail(item) {
    const mine=item.ownerId===ownerId;
    const resolved=item.status==='resolved';
    $('#detailContent').innerHTML=`<div class="detail-cover ${item.type==='found'?'found':''}"><span aria-hidden="true">${emoji[item.category]||'📦'}</span><button type="button" class="icon-button" data-close="detailDialog" aria-label="关闭">×</button></div>
      <div class="detail-body"><div class="detail-labels"><span>${item.type==='lost'?'寻物启事':'招领启事'}</span><span class="${resolved?'resolved':''}">${M.statusText(item)}</span></div><h2 id="detailTitle">${esc(item.title)}</h2>
      <div class="detail-facts"><div><small>物品类别</small><strong>${esc(item.category)}</strong></div><div><small>丢失 / 拾取日期</small><strong>${dateText(item.date)}</strong></div><div><small>丢失 / 拾取地点</small><strong>${esc(item.location)}</strong></div><div><small>发布者</small><strong>${esc(item.publisher)}${mine?'（我）':''}</strong></div></div>
      <h3>线索描述</h3><p class="detail-description">${esc(item.description)}</p>
      <div class="contact-box"><div><small>发布者提供的联系方式</small><strong>${esc(item.contact)}</strong></div><button type="button" data-copy="${esc(item.id)}">复制联系方式</button></div>
      <p class="detail-note">请先核实物品特征，再约定安全的交接方式。${resolved?'该信息已完成，请避免重复联系。':''}</p>
      ${mine?`<div class="detail-actions"><button type="button" class="button ${resolved?'button-ghost':'button-primary'}" data-status="${resolved?'active':'resolved'}" data-id="${esc(item.id)}">${resolved?'恢复为进行中':item.type==='lost'?'✓ 标记为已找到':'✓ 标记为已归还'}</button></div>`:''}</div>`;
    selectedId=item.id;
    $('#detailDialog').showModal();
  }
  function copyContact(id) {
    const item=items.find(x=>x.id===id);if(!item)return;
    const fallback=()=>{const el=document.createElement('textarea');el.value=item.contact;el.style.position='fixed';el.style.opacity='0';document.body.appendChild(el);el.select();const ok=document.execCommand('copy');el.remove();if(!ok)throw new Error('复制失败');};
    (navigator.clipboard?.writeText?navigator.clipboard.writeText(item.contact).catch(fallback):Promise.resolve().then(fallback)).then(()=>notify('联系方式已复制')).catch(()=>notify('复制失败，请手动复制'));
  }
  function submit(event) {
    event.preventDefault();
    const form=event.currentTarget;
    const draft=Object.fromEntries(new FormData(form));
    $$('[data-error]').forEach(el=>el.textContent='');
    try {
      const item=M.createItem(draft,ownerId);
      items=[item,...items];persist();renderAll();$('#publishDialog').close();location.hash='#mine';notify('发布成功，已保存到我的发布');
    } catch(error) {
      if(error.fields) Object.entries(error.fields).forEach(([name,message])=>{const el=$(`[data-error="${name}"]`);if(el)el.textContent=message;});
      const first=Object.keys(error.fields||{})[0];
      if(first) form.elements.namedItem(first)?.focus();
      notify(error.message||'发布失败，请重试');
    }
  }
  document.addEventListener('click',event=>{
    const action=event.target.closest('[data-action]')?.dataset.action;
    if(action?.startsWith('publish')){openPublish(action==='publish-found'?'found':'lost');return;}
    const close=event.target.closest('[data-close]')?.dataset.close;
    if(close){document.getElementById(close)?.close();return;}
    const id=event.target.closest('[data-detail]')?.dataset.detail;
    if(id){const item=items.find(x=>x.id===id);if(item)detail(item);return;}
    const copy=event.target.closest('[data-copy]')?.dataset.copy;
    if(copy){copyContact(copy);return;}
    const statusButton=event.target.closest('[data-status]');
    if(statusButton){try{items=M.updateStatus(items,statusButton.dataset.id,ownerId,statusButton.dataset.status);persist();renderAll();$('#detailDialog').close();notify(statusButton.dataset.status==='resolved'?'状态已更新，感谢你完成这次寻回':'已恢复为进行中');}catch(error){notify(error.message);}}
  });
  $$('.modal').forEach(dialog=>dialog.addEventListener('click',event=>{if(event.target===dialog)dialog.close();}));
  $('#publishForm').addEventListener('submit',submit);
  $('#searchInput').addEventListener('input',event=>{filters.query=event.target.value;renderHome();});
  $('#categoryFilter').addEventListener('change',event=>{filters.category=event.target.value;renderHome();});
  $('#statusFilter').addEventListener('change',event=>{filters.status=event.target.value;renderHome();});
  $$('.segmented [data-type]').forEach(button=>button.addEventListener('click',()=>{filters.type=button.dataset.type;$$('.segmented [data-type]').forEach(x=>x.classList.toggle('selected',x===button));renderHome();}));
  $('#clearFilters').addEventListener('click',()=>{filters={query:'',type:'all',category:'all',status:'all'};$('#searchInput').value='';$('#categoryFilter').value='all';$('#statusFilter').value='all';$$('.segmented [data-type]').forEach(x=>x.classList.toggle('selected',x.dataset.type==='all'));renderHome();});
  window.addEventListener('hashchange',route);
  document.addEventListener('keydown',event=>{if(event.key==='/'&&!$$('dialog[open]').length&&!['INPUT','TEXTAREA'].includes(document.activeElement.tagName)){event.preventDefault();$('#searchInput').focus();}});
  categoryOptions();renderAll();route();
})();
