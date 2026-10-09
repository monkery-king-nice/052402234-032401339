// Real Google Chrome, two isolated sessions, disposable in-memory shared service.
const { chromium, expect } = require('@playwright/test');
const { createService } = require('../server/server');
const M = require('../js/model');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const output = path.resolve(__dirname, '../docs/screenshots');
const reports = [];
const check = async (name,fn) => {await fn();reports.push(name);console.log('PASS '+name);};
(async()=>{
  const service=createService({dbPath:':memory:'});
  await new Promise(resolve=>service.server.listen(0,'127.0.0.1',resolve));
  const url='http://127.0.0.1:'+service.server.address().port;
  const browser=await chromium.launch({channel:'chrome',headless:true});
  const a=await browser.newContext({viewport:{width:1440,height:1100},timezoneId:'Asia/Shanghai'});
  const b=await browser.newContext({viewport:{width:390,height:844},timezoneId:'America/Los_Angeles'});
  const page=await a.newPage(),other=await b.newPage();
  const errors=[];page.on('pageerror',e=>errors.push(e.message));other.on('pageerror',e=>errors.push(e.message));
  fs.mkdirSync(output,{recursive:true});
  try {
    await Promise.all([page.goto(url),other.goto(url)]);
    await Promise.all([expect(page.locator('#connectionStatus')).toContainText('已连接'),expect(other.locator('#connectionStatus')).toContainText('已连接')]);
    await check('日期同日边界、组合条件、无效输入保留与清除',async()=>{
      await page.locator('#startDateFilter').fill('2026-09-28');await page.locator('#endDateFilter').fill('2026-09-28');
      await expect(page.locator('#cardGrid .item-card')).toHaveCount(1);
      await page.locator('#searchInput').fill('校园卡');await page.locator('#categoryFilter').selectOption('证件卡片');await page.locator('#statusFilter').selectOption('active');await page.locator('.segmented [data-type="lost"]').click();
      await expect(page.locator('#cardGrid .item-card')).toHaveCount(1);
      await page.locator('#endDateFilter').fill('2026-09-27');await expect(page.locator('#dateFilterError')).toContainText('不能晚于');await expect(page.locator('#startDateFilter')).toHaveValue('2026-09-28');await expect(page.locator('#cardGrid .item-card')).toHaveCount(0);
      await page.locator('#clearFilters').click();await expect(page.locator('#startDateFilter')).toHaveValue('');await expect(page.locator('#endDateFilter')).toHaveValue('');await expect(page.locator('#cardGrid .item-card')).toHaveCount(6);
      await page.locator('#searchInput').fill('绝对没有的测试关键词');await page.locator('[data-action="clear-filters"]').click();await expect(page.locator('#searchInput')).toHaveValue('');
      await page.screenshot({path:path.join(output,'desktop-square.png'),fullPage:true});
    });
    await check('照片上传、压缩、预览、移除与发布',async()=>{
      await page.locator('.header-publish').click();
      await page.locator('[name="title"]').fill('独立测试蓝色校园卡');await page.locator('[name="category"]').selectOption('证件卡片');await page.locator('[name="location"]').fill('图书馆服务台');await page.locator('[name="date"]').fill('2026-10-01');await page.locator('#publishForm [name="description"]').fill('独立测试数据，蓝色卡套背面有白色贴纸，测试后不会保留。');await page.locator('[name="publisher"]').fill('测试甲');await page.locator('[name="contact"]').fill('test@example.com');
      const photo=path.resolve(__dirname,'../assets/items/campus-card.jpg');await page.locator('#imageInput').setInputFiles([photo,photo]);await expect(page.locator('#photoProgress')).toContainText('2 / 3');await page.locator('[data-remove-photo="1"]').click();await expect(page.locator('#photoPreviews img')).toHaveCount(1);await page.locator('#publishForm [type="submit"]').click();await expect(page.locator('#publishDialog')).not.toBeVisible();await expect(page.locator('#mineGrid .item-card')).toHaveCount(1);await expect(page.locator('#mineGrid .card-photo')).toHaveAttribute('src',/^data:image\/jpeg/);
    });
    let itemId;
    await check('两独立Chrome会话共享启事、照片与双向评论，文本安全展示',async()=>{
      await page.locator('#mineGrid [data-detail]').click();itemId=await page.locator('#mineGrid [data-detail]').getAttribute('data-detail');
      await other.goto(url+'/#post/'+encodeURIComponent(itemId));await expect(other.locator('#detailTitle')).toHaveText('独立测试蓝色校园卡');await expect(other.locator('#detailPhoto')).toHaveAttribute('src',/^data:image\/jpeg/);await expect(other.locator('#commentState')).toContainText('还没有线索');
      await other.locator('#commentNickname').fill('测试乙');await other.locator('#commentBody').fill('<img src=x onerror="window.hacked=true"> 图书馆服务台有相似物品');await other.locator('#commentForm [type="submit"]').click();await expect(other.locator('.comment')).toHaveCount(1);await expect(other.locator('#commentBody')).toHaveValue('');
      await page.locator('[data-refresh-comments]').click();await expect(page.locator('.comment')).toHaveCount(1);await expect(page.locator('.comment p')).toContainText('<img src=x');await expect(page.locator('.comment img')).toHaveCount(0);
      await page.locator('#commentNickname').fill('测试甲');await page.locator('#commentBody').fill('谢谢，稍后按卡套特征核实。');await page.locator('#commentForm [type="submit"]').click();await expect(page.locator('.comment')).toHaveCount(2);await other.locator('[data-refresh-comments]').click();await expect(other.locator('.comment')).toHaveCount(2);await expect(other.locator('[data-delete]')).toHaveCount(0);
      await page.screenshot({path:path.join(output,'desktop-comments.png')});
      await other.locator('#commentBody').scrollIntoViewIfNeeded();await other.screenshot({path:path.join(output,'mobile-comments.png')});
    });
    await check('空白评论校验，提交中防重复，失败后保留输入且可重试',async()=>{
      await page.locator('#commentNickname').fill(' ');await page.locator('#commentBody').fill(' ');await page.locator('#commentForm [type="submit"]').click();await expect(page.locator('#nicknameError')).toContainText('2–24');await expect(page.locator('#bodyError')).toContainText('1–500');
      await page.locator('#commentNickname').fill('测试甲');await page.locator('#commentBody').fill('网络失败时这条评论应保留');
      const pattern='**/api/items/*/comments';await page.route(pattern,async route=>{if(route.request().method()==='POST'){await new Promise(r=>setTimeout(r,300));await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'测试服务暂不可用'})});}else await route.continue();});
      await page.locator('#commentForm [type="submit"]').click();await expect(page.locator('#commentForm [type="submit"]')).toBeDisabled();await expect(page.locator('#commentError')).toContainText('暂不可用');await expect(page.locator('#commentBody')).toHaveValue('网络失败时这条评论应保留');await expect(page.locator('#commentNickname')).toHaveValue('测试甲');await page.unroute(pattern);await page.locator('#commentForm [type="submit"]').click();await expect(page.locator('.comment')).toHaveCount(3);
    });
    await check('状态完成后仍可评论，取消删除保留，确认删除移除',async()=>{
      await page.locator('[data-status="resolved"]').click();await page.locator('#mineGrid [data-detail]').click();await expect(page.locator('#commentItemStatus')).toContainText('已找到');await expect(page.locator('.comment')).toHaveCount(3);await page.locator('#commentBody').fill('已找回，谢谢');await page.locator('#commentForm [type="submit"]').click();await expect(page.locator('.comment')).toHaveCount(4);
      await page.locator('[data-delete]').click();await page.locator('#deleteDialog [data-close="deleteDialog"]').first().click();await expect(page.locator('#mineGrid .item-card')).toHaveCount(1);
      await page.locator('[data-delete]').click();await page.locator('[data-action="confirm-delete"]').click();await expect(page.locator('#mineGrid .item-card')).toHaveCount(0);await page.reload();await expect(page.locator('#connectionStatus')).toContainText('已连接');await expect(page.locator('#mineGrid .item-card')).toHaveCount(0);
    });
    await check('评论隔离，手机布局与弹窗无横向溢出',async()=>{
      await other.goto(url+'/#post/demo-1');await expect(other.locator('#detailTitle')).toHaveText('蓝色校园卡');await expect(other.locator('.comment')).toHaveCount(0);
      await expect(other.locator('#commentState')).toContainText('还没有线索');await other.locator('#detailDialog [data-close]').click();await other.goto(url);await expect(other.locator('#cardGrid .item-card')).toHaveCount(6);await other.screenshot({path:path.join(output,'mobile-square.png'),fullPage:true});
      for(const viewport of [{width:320,height:740},{width:390,height:844},{width:768,height:1024}]){await other.setViewportSize(viewport);await expect.poll(()=>other.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);}
      await other.setViewportSize({width:390,height:844});
    });
    await check('直接打开index.html，旧记录及照片保留，复制共享不会覆盖本地',async()=>{
      const local=await browser.newContext();const filePage=await local.newPage();filePage.on('pageerror',e=>errors.push(e.message));
      const old=M.createItem({type:'found',title:'旧版本地钥匙',category:'钥匙配饰',location:'东区食堂',date:'2026-09-20',description:'旧版数据兼容测试，带有绿色钥匙挂件。',contact:'test@example.com',publisher:'旧用户'},'legacy-owner',new Date(),'legacy-test');
      await filePage.addInitScript(({old})=>{localStorage.setItem('campus-light-items-v1',JSON.stringify([old]));localStorage.setItem('campus-light-owner-v1','legacy-owner');},{old});
      await filePage.goto(pathToFileURL(path.resolve(__dirname,'../index.html')).href);await expect(filePage.locator('#cardGrid .item-card')).toHaveCount(1);await filePage.locator('#cardGrid [data-detail]').click();await expect(filePage.locator('#commentState')).toContainText('需要连接');await filePage.locator('#detailDialog [data-close]').click();
      await filePage.locator('.connection-panel summary').click();await filePage.locator('#apiUrl').fill(url);await filePage.locator('#connectionForm [type="submit"]').click();await expect(filePage.locator('#connectionStatus')).toContainText('已连接');await filePage.locator('#importLocal').click();await expect(filePage.locator('#cardGrid')).toContainText('旧版本地钥匙');await filePage.locator('#importLocal').click();await expect(filePage.locator('#cardGrid .item-card')).toHaveCount(7);
      const preserved=await filePage.evaluate(()=>JSON.parse(localStorage.getItem('campus-light-items-v1')));expect(preserved).toEqual([old]);
      await filePage.locator('#apiUrl').fill('');await filePage.locator('#connectionForm [type="submit"]').click();await expect(filePage.locator('#cardGrid .item-card')).toHaveCount(1);await local.close();
    });
    expect(errors).toEqual([]);
    const result={date:'2026-10-10',browser:await browser.version(),channel:'Google Chrome',sessions:2,storage:'disposable in-memory SQLite; isolated browser contexts',passed:reports.length,checks:reports,errors};
    fs.mkdirSync(path.resolve(__dirname,'../test-results'),{recursive:true});fs.writeFileSync(path.resolve(__dirname,'../test-results/browser.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
  } finally {await browser.close();await service.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
