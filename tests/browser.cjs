// Pure frontend acceptance: real Chrome opens file:// with networking disabled.
const { chromium, expect } = require('@playwright/test');
const M = require('../js/model');
const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const { pathToFileURL } = require('node:url');
const output = path.resolve(__dirname, '../docs/screenshots');
const reports = [];
const fileUrl = pathToFileURL(path.resolve(__dirname, '../index.html')).href;
async function check(name, fn) { await fn(); reports.push(name); console.log('PASS ' + name); }
async function noLocalService() {
  return new Promise(resolve => {
    const socket = net.connect(8787, '127.0.0.1');
    socket.once('connect', () => { socket.destroy(); resolve(false); });
    socket.once('error', () => resolve(true));
    socket.setTimeout(500, () => { socket.destroy(); resolve(false); });
  });
}
(async () => {
  expect(await noLocalService()).toBe(true);
  const browser = await chromium.launch({ channel:'chrome', headless:true });
  const a = await browser.newContext({ viewport:{width:1440,height:1100}, timezoneId:'Asia/Shanghai', offline:true, permissions:['clipboard-read','clipboard-write'] });
  const b = await browser.newContext({ viewport:{width:390,height:844}, timezoneId:'America/Los_Angeles', offline:true });
  const page = await a.newPage(), other = await b.newPage();
  const errors = [], network = [];
  for (const tab of [page,other]) {
    tab.on('pageerror', error => errors.push(error.message));
    tab.on('request', request => { if (/^https?:/.test(request.url())) network.push(request.url()); });
  }
  // Existing service settings must no longer trigger requests or block local functions.
  await page.addInitScript(() => localStorage.setItem('campus-light-api-url','http://127.0.0.1:8787'));
  fs.mkdirSync(output,{recursive:true});
  const open = async (tab,id) => {
    if (await tab.locator('#detailDialog').isVisible()) await tab.locator('#detailDialog [data-close]').first().click();
    await tab.goto(fileUrl + '#home');
    await tab.locator('#cardGrid [data-detail="' + id + '"]').click();
  };
  try {
    await Promise.all([page.goto(fileUrl),other.goto(fileUrl)]);
    await check('关闭本地服务且断网，直接打开index.html加载全部本地资源',async () => {
      await expect(page.locator('#cardGrid .item-card')).toHaveCount(6);
      await expect(page.locator('.connection-panel')).toHaveCount(0);
      await expect.poll(() => page.locator('#cardGrid .card-photo').evaluateAll(images => images.every(img=>img.complete&&img.naturalWidth>0))).toBe(true);
      expect(network).toEqual([]);
    });
    await check('日期起止边界、单端、组合筛选、无效范围与清除',async () => {
      await page.locator('#startDateFilter').fill('2026-09-28');
      await expect(page.locator('#cardGrid .item-card')).toHaveCount(2);
      await page.locator('#startDateFilter').fill(''); await page.locator('#endDateFilter').fill('2026-09-27');
      await expect(page.locator('#cardGrid .item-card')).toHaveCount(4);
      await page.locator('#startDateFilter').fill('2026-09-28'); await page.locator('#endDateFilter').fill('2026-09-28');
      await expect(page.locator('#cardGrid .item-card')).toHaveCount(1);
      await page.locator('#searchInput').fill('校园卡'); await page.locator('#categoryFilter').selectOption('证件卡片'); await page.locator('#statusFilter').selectOption('active'); await page.locator('.segmented [data-type="lost"]').click();
      await expect(page.locator('#cardGrid .item-card')).toHaveCount(1);
      await page.locator('#endDateFilter').fill('2026-09-27'); await expect(page.locator('#dateFilterError')).toContainText('不能晚于');
      await expect(page.locator('#startDateFilter')).toHaveValue('2026-09-28'); await expect(page.locator('#cardGrid .item-card')).toHaveCount(0);
      await page.locator('.content-section').screenshot({path:path.join(output,'invalid-date.png')});
      await page.locator('#clearFilters').click(); await expect(page.locator('#startDateFilter')).toHaveValue(''); await expect(page.locator('#endDateFilter')).toHaveValue(''); await expect(page.locator('#cardGrid .item-card')).toHaveCount(6);
      await page.locator('#searchInput').fill('绝对没有的测试关键词'); await expect(page.locator('#cardGrid .empty-state')).toContainText('暂时没有匹配'); await page.locator('[data-action="clear-filters"]').click(); await expect(page.locator('#searchInput')).toHaveValue('');
      await page.screenshot({path:path.join(output,'desktop-square.png'),fullPage:true});
    });
    await check('评论校验、重复提交防护、成功清正文、刷新持久化',async () => {
      await open(page,'demo-1'); await expect(page.locator('#commentState')).toContainText('还没有线索');
      await page.locator('#commentNickname').fill(' '); await page.locator('#commentBody').fill(' '); await page.locator('#commentForm [type="submit"]').click();
      await expect(page.locator('#nicknameError')).toContainText('2–24'); await expect(page.locator('#bodyError')).toContainText('1–500');
      await page.locator('#commentNickname').fill(' 测试同学 '); await page.locator('#commentBody').fill(' 图书馆服务台有相似物品，可以去核实。 ');
      await page.locator('#commentForm').evaluate(form => { form.requestSubmit(); form.requestSubmit(); });
      await expect(page.locator('.comment')).toHaveCount(1); await expect(page.locator('.comment-heading strong')).toHaveText('测试同学'); await expect(page.locator('#commentBody')).toHaveValue('');
      await page.locator('#detailDialog [data-close]').first().click(); await page.reload(); await open(page,'demo-1');
      await expect(page.locator('.comment')).toHaveCount(1); await expect(page.locator('.comment p')).toHaveText('图书馆服务台有相似物品，可以去核实。');
      await page.locator('#commentNickname').fill('另一同学'); await page.locator('#commentBody').fill('请先确认卡套上的贴纸再认领。'); await page.locator('#commentForm [type="submit"]').click(); await expect(page.locator('.comment')).toHaveCount(2);
      await page.locator('#commentList').scrollIntoViewIfNeeded(); await page.screenshot({path:path.join(output,'desktop-comments.png')});
    });
    await check('各启事评论隔离，不同浏览器会话不共享，HTML输入安全显示',async () => {
      await open(page,'demo-2'); await expect(page.locator('.comment')).toHaveCount(0);
      await page.locator('#commentNickname').fill('测试乙'); await page.locator('#commentBody').fill('耳机已交到教学楼服务台。'); await page.locator('#commentForm [type="submit"]').click(); await expect(page.locator('.comment')).toHaveCount(1);
      await open(page,'demo-1'); await expect(page.locator('.comment')).toHaveCount(2);
      await page.locator('#commentNickname').fill('<小林>'); await page.locator('#commentBody').fill('<img src=x onerror="window.hacked=true"><script>alert(1)</script>'); await page.locator('#commentForm [type="submit"]').click();
      await expect(page.locator('.comment')).toHaveCount(3); await expect(page.locator('.comment p').last()).toContainText('<img src=x'); await expect(page.locator('.comment img,.comment script')).toHaveCount(0); expect(await page.evaluate(()=>window.hacked)).toBeUndefined();
      await open(other,'demo-1'); await expect(other.locator('.comment')).toHaveCount(0);
    });
    await check('存储写入失败保留昵称、正文及原评论，恢复后可重试',async () => {
      const key=M.commentStorageKey('demo-1'); const before=await page.evaluate(key=>localStorage.getItem(key),key);
      await page.evaluate(() => {
        window.originalSetItem=Storage.prototype.setItem;
        Storage.prototype.setItem=function(key,value){if(key.startsWith('campus-light-comments-v1:'))throw new DOMException('test quota','QuotaExceededError');return window.originalSetItem.call(this,key,value);};
      });
      await page.locator('#commentNickname').fill('测试甲'); await page.locator('#commentBody').fill('保存失败时这条输入应保留'); await page.locator('#commentForm [type="submit"]').click();
      await expect(page.locator('#commentError')).toContainText('存储空间不足'); await expect(page.locator('#commentBody')).toHaveValue('保存失败时这条输入应保留'); await expect(page.locator('#commentNickname')).toHaveValue('测试甲');
      expect(await page.evaluate(key=>localStorage.getItem(key),key)).toBe(before); await expect(page.locator('.comment')).toHaveCount(3);
      await page.locator('#commentError').scrollIntoViewIfNeeded(); await page.screenshot({path:path.join(output,'comment-storage-error.png')});
      await page.evaluate(()=>{Storage.prototype.setItem=window.originalSetItem;}); await page.locator('#commentForm [type="submit"]').click(); await expect(page.locator('.comment')).toHaveCount(4); await expect(page.locator('#commentBody')).toHaveValue('');
    });
    await check('损坏评论存储报错且不覆盖原数据',async () => {
      const key=M.commentStorageKey('demo-3'); await page.evaluate(key=>localStorage.setItem(key,'{broken'),key); await open(page,'demo-3'); await expect(page.locator('#commentState')).toContainText('原数据未被覆盖');
      await page.locator('#commentNickname').fill('测试甲'); await page.locator('#commentBody').fill('损坏的数据不能被覆盖'); await page.locator('#commentForm [type="submit"]').click(); await expect(page.locator('#commentError')).toContainText('无法读取'); expect(await page.evaluate(key=>localStorage.getItem(key),key)).toBe('{broken'); await expect(page.locator('#commentBody')).toHaveValue('损坏的数据不能被覆盖');
    });
    let ownId;
    await check('照片上传、压缩、预览、移除与发布，刷新后照片保留',async () => {
      await page.locator('#detailDialog [data-close]').first().click(); await page.locator('.header-publish').click();
      await page.locator('[name="title"]').fill('独立测试蓝色校园卡'); await page.locator('[name="category"]').selectOption('证件卡片'); await page.locator('[name="location"]').fill('图书馆服务台'); await page.locator('[name="date"]').fill('2026-10-01'); await page.locator('#publishForm [name="description"]').fill('独立测试数据，蓝色卡套背面有白色贴纸。'); await page.locator('[name="publisher"]').fill('测试甲'); await page.locator('[name="contact"]').fill('test@example.com');
      const photo=path.resolve(__dirname,'../assets/items/campus-card.jpg'); await page.locator('#imageInput').setInputFiles([photo,photo]); await expect(page.locator('#photoProgress')).toContainText('2 / 3'); await page.locator('[data-remove-photo="1"]').click(); await expect(page.locator('#photoPreviews img')).toHaveCount(1); await page.locator('#publishForm [type="submit"]').click();
      await expect(page.locator('#publishDialog')).not.toBeVisible(); await expect(page.locator('#mineGrid .item-card')).toHaveCount(1); await expect(page.locator('#mineGrid .card-photo')).toHaveAttribute('src',/^data:image\/jpeg/); ownId=await page.locator('#mineGrid [data-detail]').getAttribute('data-detail');
      await page.reload(); await expect(page.locator('#mineGrid .item-card')).toHaveCount(1); await expect(page.locator('#mineGrid .card-photo')).toHaveAttribute('src',/^data:image\/jpeg/);
    });
    await check('发布者状态维护、完成后评论、取消删除和只删除目标评论',async () => {
      await page.locator('#mineGrid [data-detail]').click(); await page.locator('#commentNickname').fill('测试甲'); await page.locator('#commentBody').fill('我会去核实这条线索'); await page.locator('#commentForm [type="submit"]').click(); await expect(page.locator('.comment')).toHaveCount(1);
      await page.locator('[data-status="resolved"]').click(); await page.locator('#mineGrid [data-detail]').click(); await expect(page.locator('#commentItemStatus')).toContainText('已找到'); await expect(page.locator('.comment')).toHaveCount(1); await page.locator('#commentBody').fill('已经找回，谢谢'); await page.locator('#commentForm [type="submit"]').click(); await expect(page.locator('.comment')).toHaveCount(2);
      await page.locator('[data-delete]').click(); await page.locator('#deleteDialog [data-close="deleteDialog"]').first().click(); await expect(page.locator('#mineGrid .item-card')).toHaveCount(1);
      await page.locator('[data-delete]').click(); await page.locator('[data-action="confirm-delete"]').click(); await expect(page.locator('#mineGrid .item-card')).toHaveCount(0); expect(await page.evaluate(key=>localStorage.getItem(key),M.commentStorageKey(ownId))).toBeNull(); await page.reload(); await expect(page.locator('#mineGrid .item-card')).toHaveCount(0);
      await open(page,'demo-2'); await expect(page.locator('.comment')).toHaveCount(1); await expect(page.locator('[data-delete]')).toHaveCount(0); await expect(page.locator('#detailPhoto')).toHaveAttribute('src','assets/items/wireless-earbuds.jpg');
      await page.locator('[data-copy]').click();await expect(page.locator('#toast')).toContainText('联系方式已复制');expect(await page.evaluate(()=>navigator.clipboard.readText())).toBe('演示邮箱：demo02@example.com');
    });
    await check('手机布局、日期输入、弹窗滚动与底部导航不遮挡提交',async () => {
      await other.locator('#commentNickname').fill('手机测试'); await other.locator('#commentBody').fill('这条线索只保存在当前浏览器。'); await other.locator('#commentForm [type="submit"]').click(); await expect(other.locator('.comment')).toHaveCount(1); await other.locator('#commentForm [type="submit"]').scrollIntoViewIfNeeded(); await other.screenshot({path:path.join(output,'mobile-comments.png')});
      await other.locator('#detailDialog [data-close]').first().click();await expect(other.locator('#toast')).not.toHaveClass(/show/);await other.screenshot({path:path.join(output,'mobile-square.png'),fullPage:true});
      for(const viewport of [{width:320,height:740},{width:390,height:844},{width:768,height:1024}]){await other.setViewportSize(viewport); await expect.poll(()=>other.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true); await expect(other.locator('#startDateFilter')).toBeVisible();}
      await other.setViewportSize({width:390,height:844}); await other.locator('.mobile-nav [data-action="publish"]').click(); await other.locator('#publishForm [type="submit"]').scrollIntoViewIfNeeded();
      expect(await other.locator('#publishForm [type="submit"]').evaluate(button=>{const r=button.getBoundingClientRect();const target=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);return button===target||button.contains(target);})).toBe(true); await other.screenshot({path:path.join(output,'mobile-publish.png')}); await other.locator('#publishDialog [data-close]').first().click();
    });
    await check('原有启事和照片兼容，旧共享配置不影响纯前端功能',async () => {
      const context=await browser.newContext({offline:true}); const oldPage=await context.newPage(); oldPage.on('pageerror',error=>errors.push(error.message));
      const photo='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a2ioAAAAASUVORK5CYII=';
      const old=M.createItem({type:'found',title:'旧版本地钥匙',category:'钥匙配饰',location:'东区食堂',date:'2026-09-20',description:'旧版数据兼容测试，带有绿色钥匙挂件。',contact:'test@example.com',publisher:'旧用户',images:[photo]},'legacy-owner',new Date(),'legacy-test');
      await oldPage.addInitScript(({old})=>{if(!localStorage.getItem('legacy-loaded')){localStorage.setItem('campus-light-items-v1',JSON.stringify([old]));localStorage.setItem('campus-light-owner-v1','legacy-owner');localStorage.setItem('campus-light-api-url','http://localhost:8787');localStorage.setItem('legacy-loaded','yes');}},{old});
      await oldPage.goto(fileUrl); await expect(oldPage.locator('#cardGrid .item-card')).toHaveCount(1); await oldPage.locator('#cardGrid [data-detail]').click(); await expect(oldPage.locator('[data-delete]')).toHaveCount(1); await expect(oldPage.locator('#detailPhoto')).toHaveAttribute('src',photo); await oldPage.locator('#commentNickname').fill('旧用户'); await oldPage.locator('#commentBody').fill('旧启事也可以保存评论'); await oldPage.locator('#commentForm [type="submit"]').click(); await expect(oldPage.locator('.comment')).toHaveCount(1); await oldPage.reload(); await oldPage.locator('#cardGrid [data-detail]').click(); await expect(oldPage.locator('.comment')).toHaveCount(1);
      expect(await oldPage.evaluate(()=>JSON.parse(localStorage.getItem('campus-light-items-v1')))).toEqual([old]); await context.close();
    });
    expect(errors).toEqual([]); expect(network).toEqual([]);
    const result={date:'2026-10-10',browser:await browser.version(),channel:'Google Chrome',launch:'file://index.html',network:'offline; no HTTP requests',localServiceRunning:false,storage:'isolated browser localStorage',passed:reports.length,checks:reports,errors};
    fs.mkdirSync(path.resolve(__dirname,'../test-results'),{recursive:true}); fs.writeFileSync(path.resolve(__dirname,'../test-results/browser.json'),JSON.stringify(result,null,2)); console.log(JSON.stringify(result,null,2));
  } finally { await browser.close(); }
})().catch(error=>{console.error(error);process.exitCode=1;});
