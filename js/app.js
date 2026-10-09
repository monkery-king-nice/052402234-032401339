(function () {
  'use strict';
  const M = window.LostFoundModel;
  const $ = selector => document.querySelector(selector);
  const $$ = selector => [...document.querySelectorAll(selector)];
  const emoji = { '证件卡片': '🪪', '数码设备': '🎧', '钥匙配饰': '🔑', '书籍文具': '📚', '衣物用品': '🎒', '其他物品': '📦' };
  const demoPhotos = {
    'demo-1': { title: '蓝色校园卡', src: 'assets/items/campus-card.jpg' },
    'demo-2': { title: '白色无线耳机', src: 'assets/items/wireless-earbuds.jpg' },
    'demo-3': { title: '一串钥匙', src: 'assets/items/keys.jpg' },
    'demo-4': { title: '高等数学笔记本', src: 'assets/items/math-notebook.jpg' },
    'demo-5': { title: '米色帆布包', src: 'assets/items/canvas-bag.jpg' },
    'demo-6': { title: '黑色保温杯', src: 'assets/items/thermos.jpg' }
  };
  const seed = window.CampusSeed;
  const storage = window.localStorage;
  const localOwnerId = M.getOwnerId(storage);
  let ownerId = localOwnerId;
  let shared = null, sharedReady = false, mutationBusy = false;
  const commentDrafts = new Map();
  let commentBusy = false, commentLoadVersion = 0;
  let items = M.readItems(storage, seed);
  let filters = { query:'', type:'all', category:'all', status:'all', startDate:'', endDate:'' };
  let selectedId = null;
  let pendingDeleteId = null;
  let toastTimer;
  let photos = [];
  let photoBusy = false;
  let photoError = '';
  let photoVersion = 0;

  function esc(value) { return String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char])); }
  function dateText(value) { return value ? value.replaceAll('-', '.') : ''; }
  function notify(message) { const el=$('#toast');el.textContent=message;el.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),2800); }
  function commitItems(next) { M.saveItems(storage, next); items = next; }
  function itemDemoPhoto(item) {
    const photo = demoPhotos[item.id];
    return item.ownerId === 'demo' && photo && photo.title === item.title ? photo.src : '';
  }
  function itemPhotos(item) {
    const uploaded = Array.isArray(item.images) ? item.images.filter(M.isImageDataUrl).slice(0, M.MAX_IMAGES) : [];
    if (uploaded.length) return uploaded;
    const demoPhoto = itemDemoPhoto(item);
    return demoPhoto ? [demoPhoto] : [];
  }
  function itemEmoji(item) {
    const names = [[/手机|iphone|phone/i,'📱'],[/电脑|笔记本电脑|laptop|macbook/i,'💻'],[/耳机|headphone|earbuds/i,'🎧'],[/钥匙/,'🔑'],[/校园卡|学生卡|证件/,'🪪'],[/笔记本|书籍|课本/,'📓'],[/帆布包|手提包/,'👜'],[/保温杯|水杯|水壶/,'🥤'],[/雨伞/,'☂️'],[/钱包/,'👛']];
    return names.find(([pattern])=>pattern.test(item.title))?.[1] || emoji[item.category] || '📦';
  }
  function renderPhotoPreviews() {
    $('#photoPreviews').innerHTML = photos.map((src, index) => `<div class="photo-preview"><img src="${esc(src)}" alt="待发布照片 ${index + 1}"><button type="button" data-remove-photo="${index}" aria-label="移除第 ${index + 1} 张照片" ${photoBusy ? 'disabled' : ''}>×</button></div>`).join('');
    $('#clearPhotos').hidden = !photos.length && !photoError && !photoBusy;
    $('#photoProgress').textContent = photoBusy ? '正在压缩照片，请稍候…' : photos.length ? `已选 ${photos.length} / ${M.MAX_IMAGES} 张照片` : '';
    $('#photoError').textContent = photoError;
    $('#publishForm [type="submit"]').disabled = photoBusy;
    $('#publishForm [type="submit"]').setAttribute('aria-busy', String(photoBusy));
  }
  function clearPhotos() {
    photoVersion++;
    photos = [];
    photoBusy = false;
    photoError = '';
    $('#imageInput').value = '';
    renderPhotoPreviews();
  }
  async function selectPhotos(event) {
    const files = Array.from(event.target.files);
    event.target.value = '';
    if (!files.length) return;
    const version = ++photoVersion;
    photoBusy = true;
    photoError = '';
    renderPhotoPreviews();
    try {
      const prepared = await window.CampusImages.prepareFiles(files, photos.length);
      if (version === photoVersion) photos = [...photos, ...prepared];
    } catch (error) {
      if (version === photoVersion) photoError = error.message + '。请重新选择，或清除照片后发布。';
    } finally {
      if (version === photoVersion) { photoBusy = false; renderPhotoPreviews(); }
    }
  }
  function categoryOptions() {
    $('#categoryFilter').insertAdjacentHTML('beforeend', M.CATEGORIES.map(x=>`<option value="${esc(x)}">${esc(x)}</option>`).join(''));
    $('[name="category"]').insertAdjacentHTML('beforeend', M.CATEGORIES.map(x=>`<option value="${esc(x)}">${esc(x)}</option>`).join(''));
  }

  function card(item) {
    const mine = item.ownerId === ownerId;
    const images = itemPhotos(item);
    const demoPhoto = images.length && images[0] === itemDemoPhoto(item);
    return `<article class="item-card" data-type="${item.type}">
      <div class="card-visual ${demoPhoto?'has-demo-photo':''}">${images.length ? `<img class="card-photo ${demoPhoto?'is-demo-photo':''}" src="${esc(images[0])}" alt="${esc(item.title)}的${demoPhoto?'写实示例配图':'照片'}" loading="lazy"><span class="photo-count">${demoPhoto?'示例配图':images.length+' 张照片'}</span>` : `<span class="card-emoji" aria-hidden="true">${itemEmoji(item)}</span>`}<span class="type-pill">${item.type==='lost'?'寻物启事':'招领启事'}</span><span class="status-pill ${item.status==='resolved'?'resolved':''}">${M.statusText(item)}</span></div>
      <div class="card-body"><span class="card-category">${esc(item.category)}</span><h3>${esc(item.title)}</h3><p class="card-desc">${esc(item.description)}</p><div class="card-meta"><span>⌖ ${esc(item.location)}</span><span>${item.type==='lost'?'丢失':'拾取'} ${dateText(item.date)}</span></div><div class="card-footer"><small>${mine?'我发布的':esc(item.publisher)}</small><button type="button" data-detail="${esc(item.id)}" aria-label="查看${esc(item.title)}详情">查看详情 →</button></div></div>
    </article>`;
  }
  function empty(title, text, button) { return `<div class="empty-state"><span class="empty-icon">🧭</span><h3>${title}</h3><p>${text}</p>${button?'<button type="button" class="button button-primary" data-action="publish">＋ 发布信息</button>':''}</div>`; }
  function renderHome() {
    const dateError=M.validateDateRange(filters);
    $('#dateFilterError').textContent=dateError;
    const result=M.filterItems(items,filters);
    $('#activeCount').textContent=items.filter(item=>item.status==='active').length;
    $('#resultText').textContent=dateError?'请先修正日期范围':`共找到 ${result.length} 条相关启事`;
    $('#clearFilters').hidden=!(filters.query || filters.type!=='all' || filters.category!=='all' || filters.status!=='all' || filters.startDate || filters.endDate);
    $('#cardGrid').innerHTML=result.length?result.map(card).join(''):empty(dateError?'日期范围需要调整':'暂时没有匹配的线索',dateError||'试试其他关键词或清除筛选条件。',false)+'<button type="button" class="button button-ghost empty-clear" data-action="clear-filters">清除筛选</button>';
  }
  function renderMine() {
    const mine=M.filterItems(items,{}).filter(item=>item.ownerId===ownerId);
    $('#mineSummary').innerHTML=`共发布 <strong>${mine.length}</strong> 条 · 进行中 <strong>${mine.filter(item=>item.status==='active').length}</strong> 条`;
    $('#mineGrid').innerHTML=mine.length?mine.map(card).join(''):empty('还没有发布信息','你发布的寻物或招领信息会显示在这里。',true);
  }
  function renderAll() { renderHome();renderMine(); }
  async function route() {
    const mine=location.hash==='#mine';
    $('#homePage').hidden=mine;$('#minePage').hidden=!mine;
    $$('[data-nav]').forEach(a=>a.classList.toggle('active',a.dataset.nav===(mine?'mine':location.hash==='#guide'?'guide':'home')));
    if (location.hash==='#guide') setTimeout(()=>$('#guide').scrollIntoView({behavior:'smooth'}),0);
    else window.scrollTo({top:0,behavior:'auto'});
    if(location.hash.startsWith('#post/')){
      let id;
      try { id=decodeURIComponent(location.hash.slice(6)); } catch(_){notify('启事链接格式不正确');return;}
      let item=items.find(x=>x.id===id);
      if(!item&&sharedReady){await refreshShared();item=items.find(x=>x.id===id);}
      if(item&&(!$('#detailDialog').open||selectedId!==item.id))detail(item);
      else if(!item&&sharedReady)notify('启事不存在或已被删除');
    }
  }
  function openPublish(type='lost') {
    $('#publishForm').reset();
    clearPhotos();
    $$('[data-error]').forEach(el=>el.textContent='');
    $(`[name="type"][value="${type}"]`).checked=true;
    const today=new Date();
    $('[name="date"]').value=`${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
    $('#publishDialog').showModal();
    setTimeout(()=>$('[name="title"]').focus(),0);
  }
  function detail(item) {
    saveCommentDraft();
    const mine=item.ownerId===ownerId;
    const resolved=item.status==='resolved';
    const images=itemPhotos(item);
    const demoPhoto=images.length&&images[0]===itemDemoPhoto(item);
    $('#detailContent').innerHTML=`<div class="detail-cover ${item.type==='found'?'found':''} ${images.length?'has-photo':''} ${demoPhoto?'has-demo-photo':''}">${images.length?`<img id="detailPhoto" class="detail-photo" src="${esc(images[0])}" alt="${esc(item.title)}的${demoPhoto?'写实示例配图':'照片 1'}">${demoPhoto?'<span class="demo-photo-label">示例配图</span>':''}`:`<span aria-hidden="true">${itemEmoji(item)}</span>`}<button type="button" class="icon-button" data-close="detailDialog" aria-label="关闭">×</button></div>
      ${images.length>1?`<div class="detail-photo-strip" aria-label="物品照片">${images.map((src,index)=>`<button type="button" class="${index===0?'selected':''}" data-view-photo="${index}" aria-label="查看第 ${index+1} 张照片" aria-pressed="${index===0}"><img src="${esc(src)}" alt="${esc(item.title)}的照片 ${index+1}"></button>`).join('')}</div>`:''}
      <div class="detail-body"><div class="detail-labels"><span>${item.type==='lost'?'寻物启事':'招领启事'}</span><span class="${resolved?'resolved':''}">${M.statusText(item)}</span></div><h2 id="detailTitle">${esc(item.title)}</h2>
      <div class="detail-facts"><div><small>物品类别</small><strong>${esc(item.category)}</strong></div><div><small>丢失 / 拾取日期</small><strong>${dateText(item.date)}</strong></div><div><small>丢失 / 拾取地点</small><strong>${esc(item.location)}</strong></div><div><small>发布者</small><strong>${esc(item.publisher)}${mine?'（我）':''}</strong></div></div>
      <h3>线索描述</h3><p class="detail-description">${esc(item.description)}</p>
      <div class="contact-box"><div><small>发布者提供的联系方式</small><strong>${esc(item.contact)}</strong></div><button type="button" data-copy="${esc(item.id)}">复制联系方式</button></div>
      <p class="detail-note">请先核实物品特征，再约定安全的交接方式。${resolved?'该信息已完成，请避免重复联系。':''}</p>
      ${mine?`<div class="detail-actions"><button type="button" class="button ${resolved?'button-ghost':'button-primary'}" data-status="${resolved?'active':'resolved'}" data-id="${esc(item.id)}">${resolved?'恢复为进行中':item.type==='lost'?'✓ 标记为已找到':'✓ 标记为已归还'}</button><button type="button" class="button button-danger-outline" data-delete="${esc(item.id)}">删除发布</button></div>`:''}</div>`;
    selectedId=item.id;
    $('#detailContent').insertAdjacentHTML('beforeend', commentPanel(item));
    if (!$('#detailDialog').open) $('#detailDialog').showModal();
    restoreCommentDraft(item.id);
    loadComments(item.id);
  }
  function openDelete(id) {
    const item = items.find(entry => entry.id === id);
    if (!item || item.ownerId !== ownerId || item.ownerId === 'demo') { notify('只能删除自己发布的信息'); return; }
    pendingDeleteId = id;
    $('#deleteItemTitle').textContent = item.title;
    $('#deleteError').textContent = '';
    $('#deleteDialog').showModal();
  }
  async function confirmDelete() {
    if (!pendingDeleteId || mutationBusy) return;
    mutationBusy=true;
    const button=$('[data-action="confirm-delete"]');button.disabled=true;
    try {
      const id = pendingDeleteId;
      if (shared) { await shared.request('/items/'+encodeURIComponent(id),'DELETE');items=items.filter(item=>item.id!==id); }
      else commitItems(M.removeItem(items, id, ownerId));
      $('#deleteDialog').close();
      if (selectedId === id) { $('#detailDialog').close(); selectedId = null; }
      renderAll();
      notify('发布已删除');
    } catch (error) { $('#deleteError').textContent = error.message || '删除失败，请重试'; }
    finally { mutationBusy=false;button.disabled=false; }
  }
  function copyContact(id) {
    const item=items.find(x=>x.id===id);if(!item)return;
    const fallback=()=>{const el=document.createElement('textarea');el.value=item.contact;el.style.position='fixed';el.style.opacity='0';document.body.appendChild(el);el.select();const ok=document.execCommand('copy');el.remove();if(!ok)throw new Error('复制失败');};
    (navigator.clipboard?.writeText?navigator.clipboard.writeText(item.contact).catch(fallback):Promise.resolve().then(fallback)).then(()=>notify('联系方式已复制')).catch(()=>notify('复制失败，请手动复制'));
  }
  async function submit(event) {
    event.preventDefault();
    if(mutationBusy)return;
    const form=event.currentTarget;
    if(shared&&!sharedReady){notify('共享服务尚未连接，请先重试连接');return;}
    const draft=Object.fromEntries(new FormData(form));
    if (photoBusy) { notify('照片正在处理，请稍候再发布'); return; }
    if (photoError) { $('#photoError').textContent = photoError; $('#imageInput').focus(); notify('请重新选择照片，或先清除照片'); return; }
    draft.images=photos.slice();
    $$('[data-error]').forEach(el=>el.textContent='');
    try {
      const local=M.createItem(draft,ownerId);
      mutationBusy=true;form.querySelector('[type="submit"]').disabled=true;
      const item=shared?await shared.request('/items','POST',draft):local;
      if(shared)items=[item,...items];else commitItems([item,...items]);renderAll();$('#publishDialog').close();clearPhotos();location.hash='#mine';notify('发布成功，已保存到我的发布');
    } catch(error) {
      if(error.fields) Object.entries(error.fields).forEach(([name,message])=>{const el=$(`[data-error="${name}"]`);if(el)el.textContent=message;});
      const first=Object.keys(error.fields||{})[0];
      if(first==='images') $('#imageInput').focus();
      else if(first) form.elements.namedItem(first)?.focus();
      notify(error.message||'发布失败，请重试');
    } finally {mutationBusy=false;form.querySelector('[type="submit"]').disabled=photoBusy;}
  }
  async function connectShared(url) {
    if (mutationBusy || commentBusy) { notify('请等待当前提交完成'); return; }
    saveCommentDraft(); $('#detailDialog').close();
    $('#connectionError').textContent='';
    const button=$('#connectionForm [type="submit"]');button.disabled=true;
    sharedReady=false;
    try {
      storage.setItem('campus-light-api-url',url);
      if (!url) {
        shared=null;ownerId=localOwnerId;items=M.readItems(storage,seed);
        $('#connectionStatus').textContent='本地模式 · 启事仅保存在当前浏览器，公共评论未连接';
      } else {
        shared=new window.SharedClient(url,storage);items=[];renderAll();
        $('#connectionStatus').textContent='正在连接共享服务…';
        const loaded=await shared.connect();
        ownerId=shared.ownerId;items=loaded;sharedReady=true;
        $('#connectionStatus').textContent='共享模式 · 启事与评论已连接（每 15 秒刷新）';
      }
    } catch(error) {
      $('#connectionError').textContent=error.message;
      $('#connectionStatus').textContent='共享服务未连接 · 请重试或留空地址返回本地模式';
    } finally {
      $('#refreshShared').hidden=!sharedReady;
      $('#importLocal').hidden=!sharedReady;
      button.disabled=false;renderAll();route();
    }
  }
  let refreshBusy=false;
  async function refreshShared() {
    if(!sharedReady||refreshBusy||mutationBusy)return;
    refreshBusy=true;
    try {
      items=await shared.request('/items');renderAll();
      $('#connectionStatus').textContent='共享模式 · 启事与评论已连接（每 15 秒刷新）';
      if(selectedId&&!items.some(item=>item.id===selectedId)){
        $('#commentState').textContent='该启事已被删除，无法继续提交评论';
        $('#commentForm [type="submit"]').disabled=true;
      } else if(selectedId) {
        const current=items.find(item=>item.id===selectedId);
        $('#commentItemStatus').textContent='当前启事：'+M.statusText(current);
      }
    } catch(error) {$('#connectionStatus').textContent='共享数据刷新失败 · 显示上次加载的启事';$('#connectionError').textContent=error.message;}
    finally {refreshBusy=false;}
  }
  async function importLocal() {
    if(!sharedReady||mutationBusy)return;
    const old=M.readItems(storage,seed).filter(item=>item.ownerId===localOwnerId&&item.ownerId!=='demo');
    if(!old.length){notify('没有需要复制的本地启事');return;}
    mutationBusy=true;$('#importLocal').disabled=true;
    let count=0;
    try {
      for(const item of old){await shared.request('/items','POST',{...item,legacyKey:item.id});count++;}
      notify(`已复制 ${count} 条旧启事，本地原件仍保留`);
    } catch(error){$('#connectionError').textContent=`已复制 ${count} 条。${error.message}；再次复制不会重复添加已成功的启事。`;}
    finally{mutationBusy=false;$('#importLocal').disabled=false;refreshShared();}
  }
  function commentPanel(item) {
    return `<section class="comments-section" aria-labelledby="commentsTitle"><div class="comments-heading"><div><span class="section-kicker">A LITTLE CLUE HELPS</span><h3 id="commentsTitle">评论与线索</h3></div>${sharedReady?'<button type="button" class="text-button" data-share>复制启事链接</button>':''}</div>
      <p id="commentItemStatus" class="comment-item-status">当前启事：${M.statusText(item)}</p>
      <p class="comment-privacy">请通过物品特征核实线索；不要公开完整证件号码、住址等个人信息。</p>
      <div class="comment-list-toolbar"><span>按发表时间从早到晚排列</span><button type="button" class="text-button" data-refresh-comments ${sharedReady?'':'disabled'}>刷新评论</button></div>
      <p id="commentState" role="status" aria-live="polite"></p><div id="commentList" class="comment-list"></div>
      <form id="commentForm" novalidate><label class="field">你的昵称<input id="commentNickname" name="nickname" maxlength="24" placeholder="2～24 个字符" aria-describedby="nicknameError"><small id="nicknameError" class="inline-error"></small></label>
      <label class="field">留下线索<textarea id="commentBody" name="body" rows="3" maxlength="500" placeholder="例如：我在图书馆服务台看到过相似物品" aria-describedby="bodyError"></textarea><small id="bodyError" class="inline-error"></small></label>
      <p id="commentError" class="inline-error" role="alert"></p><div class="comment-submit-row"><span>最多 500 个字符 · 请文明留言</span><button type="submit" class="button button-primary" ${sharedReady?'':'disabled'}>发表评论</button></div></form></section>`;
  }
  function saveCommentDraft() {
    if(selectedId&&$('#commentBody')){
      const previous=commentDrafts.get(selectedId)||{};
      commentDrafts.set(selectedId,{...previous,nickname:$('#commentNickname').value,body:$('#commentBody').value});
    }
  }
  function restoreCommentDraft(id) {
    const draft=commentDrafts.get(id);
    if(draft){$('#commentNickname').value=draft.nickname;$('#commentBody').value=draft.body;}
  }
  function renderComments(comments) {
    const list=$('#commentList');list.replaceChildren();
    if(!comments.length){$('#commentState').textContent='还没有线索，知道相关信息的话可以留言';return;}
    $('#commentState').textContent=`共有 ${comments.length} 条线索`;
    for(const comment of comments){
      const article=document.createElement('article');article.className='comment';
      const heading=document.createElement('div');heading.className='comment-heading';
      const name=document.createElement('strong');name.textContent=comment.nickname;
      const time=document.createElement('time');time.dateTime=comment.createdAt;time.textContent=new Date(comment.createdAt).toLocaleString('zh-CN',{hour12:false});
      const text=document.createElement('p');text.textContent=comment.body;
      heading.append(name,time);article.append(heading,text);list.append(article);
    }
  }
  async function loadComments(id) {
    if(!id)return;
    const version=++commentLoadVersion;
    if(!sharedReady){$('#commentState').textContent='公共评论需要连接共享服务。请在页面顶部设置服务地址。';return;}
    $('#commentState').textContent='正在加载线索…';
    try {
      const comments=await shared.request('/items/'+encodeURIComponent(id)+'/comments');
      if(id===selectedId&&version===commentLoadVersion){renderComments(comments);}
    } catch(error){if(id===selectedId&&version===commentLoadVersion)$('#commentState').textContent=error.message+'；可点击“刷新评论”重试';}
  }
  async function submitComment(event) {
    event.preventDefault();
    if(commentBusy||!sharedReady||!selectedId)return;
    const id=selectedId, form=event.target;
    const draft={nickname:form.nickname.value.trim(),body:form.body.value.trim()};
    const errors=M.validateComment(draft);
    $('#nicknameError').textContent=errors.nickname||'';$('#bodyError').textContent=errors.body||'';$('#commentError').textContent='';
    if(Object.keys(errors).length){form.elements.namedItem(Object.keys(errors)[0]).focus();return;}
    saveCommentDraft();
    const previous=commentDrafts.get(id)||{};
    const signature=JSON.stringify(draft);
    const requestId=previous.signature===signature?previous.requestId:crypto.randomUUID();
    commentDrafts.set(id,{...previous,signature,requestId});
    commentBusy=true;
    const button=form.querySelector('[type="submit"]');button.disabled=true;button.textContent='正在发表…';form.setAttribute('aria-busy','true');
    try {
      await shared.request('/items/'+encodeURIComponent(id)+'/comments','POST',{...draft,requestId});
      commentDrafts.set(id,{nickname:draft.nickname,body:''});
      if(selectedId===id&&$('#detailDialog').open){form.body.value='';await loadComments(id);notify('线索发表成功');}
    } catch(error){if(selectedId===id){$('#commentError').textContent=error.message;}}
    finally{commentBusy=false;button.disabled=false;button.textContent='发表评论';form.setAttribute('aria-busy','false');}
  }
  document.addEventListener('click',async event=>{
    const remove=event.target.closest('[data-remove-photo]');
    if(remove&&!photoBusy){photos=photos.filter((_,index)=>index!==Number(remove.dataset.removePhoto));photoError='';renderPhotoPreviews();return;}
    const view=event.target.closest('[data-view-photo]');
    if(view){const item=items.find(x=>x.id===selectedId);const index=Number(view.dataset.viewPhoto);const src=item&&itemPhotos(item)[index];if(src){$('#detailPhoto').src=src;$('#detailPhoto').alt=`${item.title}的照片 ${index+1}`;$$('[data-view-photo]').forEach(button=>{const active=button===view;button.classList.toggle('selected',active);button.setAttribute('aria-pressed',String(active));});}return;}
    const action=event.target.closest('[data-action]')?.dataset.action;
    if(action?.startsWith('publish')){openPublish(action==='publish-found'?'found':'lost');return;}
    if(action==='clear-filters'){clearFilters();return;}
    if(action==='confirm-delete'){confirmDelete();return;}
    const close=event.target.closest('[data-close]')?.dataset.close;
    if(close){document.getElementById(close)?.close();return;}
    const id=event.target.closest('[data-detail]')?.dataset.detail;
    if(id){const item=items.find(x=>x.id===id);if(item)detail(item);return;}
    const deleteId=event.target.closest('[data-delete]')?.dataset.delete;
    if(deleteId){openDelete(deleteId);return;}
    const copy=event.target.closest('[data-copy]')?.dataset.copy;
    if(copy){copyContact(copy);return;}
    const statusButton=event.target.closest('[data-status]');
    if(statusButton){
      if(mutationBusy)return;mutationBusy=true;statusButton.disabled=true;
      try{if(shared){const updated=await shared.request('/items/'+encodeURIComponent(statusButton.dataset.id),'PATCH',{status:statusButton.dataset.status});items=items.map(item=>item.id===updated.id?updated:item);}else commitItems(M.updateStatus(items,statusButton.dataset.id,ownerId,statusButton.dataset.status));renderAll();$('#detailDialog').close();notify('启事状态已更新');}catch(error){notify(error.message);}finally{mutationBusy=false;statusButton.disabled=false;}
    }
    if(event.target.closest('[data-refresh-comments]'))loadComments(selectedId);
    if(event.target.closest('[data-share]')){
      try {await navigator.clipboard.writeText(shared.url+'/#post/'+encodeURIComponent(selectedId));notify('启事链接已复制');} catch(_){notify('请复制地址栏中的启事链接');}
    }
  });
  $$('.modal').forEach(dialog=>dialog.addEventListener('click',event=>{if(event.target===dialog)dialog.close();}));
  $('#deleteDialog').addEventListener('close',()=>{pendingDeleteId=null;});
  $('#publishForm').addEventListener('submit',submit);
  $('#imageInput').addEventListener('change',selectPhotos);
  $('#clearPhotos').addEventListener('click',clearPhotos);
  $('#searchInput').addEventListener('input',event=>{filters.query=event.target.value;renderHome();});
  $('#categoryFilter').addEventListener('change',event=>{filters.category=event.target.value;renderHome();});
  $('#statusFilter').addEventListener('change',event=>{filters.status=event.target.value;renderHome();});
  $$('.segmented [data-type]').forEach(button=>button.addEventListener('click',()=>{filters.type=button.dataset.type;$$('.segmented [data-type]').forEach(x=>x.classList.toggle('selected',x===button));renderHome();}));
  function clearFilters() {filters={query:'',type:'all',category:'all',status:'all', startDate:'', endDate:''};$('#searchInput').value='';$('#categoryFilter').value='all';$('#statusFilter').value='all';$$('.segmented [data-type]').forEach(x=>x.classList.toggle('selected',x.dataset.type==='all'));$('#startDateFilter').value='';$('#endDateFilter').value='';renderHome();}
  $('#clearFilters').addEventListener('click',clearFilters);
  ['startDate','endDate'].forEach(key=>$('#'+key+'Filter').addEventListener('change',event=>{filters[key]=event.target.value;renderHome();}));
  window.addEventListener('hashchange',route);
  document.addEventListener('keydown',event=>{if(event.key==='/'&&!$$('dialog[open]').length&&!['INPUT','TEXTAREA'].includes(document.activeElement.tagName)){event.preventDefault();$('#searchInput').focus();}});
  categoryOptions();renderAll();route();
  $('#connectionForm').addEventListener('submit',event=>{event.preventDefault();connectShared($('#apiUrl').value.trim());});
  $('#refreshShared').addEventListener('click',refreshShared);
  $('#importLocal').addEventListener('click',importLocal);
  $('#detailDialog').addEventListener('close',()=>{saveCommentDraft();selectedId=null;commentLoadVersion++;});
  document.addEventListener('submit',event=>{if(event.target.id==='commentForm')submitComment(event);});
  setInterval(()=>{if(sharedReady&&!document.hidden){refreshShared();if(selectedId&&!commentBusy)loadComments(selectedId);}},15000);
  const configured=storage.getItem('campus-light-api-url') ?? (window.CampusConfig.apiUrl || (location.protocol.startsWith('http')?location.origin:''));
  $('#apiUrl').value=configured;
  if(configured)connectShared(configured);
})();
