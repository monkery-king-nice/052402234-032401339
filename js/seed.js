(function(root){
  const items = [
    { id:'demo-1',ownerId:'demo',type:'lost',title:'蓝色校园卡',category:'证件卡片',location:'图书馆二楼自习区',date:'2026-09-28',description:'蓝色卡套，背面有一张小兔贴纸。可能落在靠窗的自习桌附近。如有线索请联系我，谢谢！',contact:'演示微信：campus_demo_01',publisher:'小林同学',status:'active',createdAt:'2026-09-29T09:12:00.000Z' },
    { id:'demo-2',ownerId:'demo',type:'found',title:'白色无线耳机',category:'数码设备',location:'教学楼 A 座一楼',date:'2026-09-29',description:'在一楼饮水机附近捡到白色耳机盒，盒身有轻微划痕。请失主说出耳机品牌及盒内特征后认领。',contact:'演示邮箱：demo02@example.com',publisher:'阿舟同学',status:'active',createdAt:'2026-09-29T06:30:00.000Z' },
    { id:'demo-3',ownerId:'demo',type:'found',title:'一串钥匙',category:'钥匙配饰',location:'东区食堂门口',date:'2026-09-27',description:'晚饭时间在门口台阶旁捡到一串钥匙，带有绿色挂件。请描述钥匙数量与挂件图案进行核实。',contact:'演示 QQ：123456789',publisher:'小许同学',status:'active',createdAt:'2026-09-28T04:20:00.000Z' },
    { id:'demo-4',ownerId:'demo',type:'lost',title:'高等数学笔记本',category:'书籍文具',location:'逸夫楼 301 教室',date:'2026-09-25',description:'黑色封面的活页笔记本，里面有手写的高数复习笔记，封面内侧写了名字缩写。',contact:'演示微信：campus_demo_04',publisher:'小陈同学',status:'active',createdAt:'2026-09-26T11:13:00.000Z' },
    { id:'demo-5',ownerId:'demo',type:'found',title:'米色帆布包',category:'衣物用品',location:'体育馆看台',date:'2026-09-23',description:'在体育馆看台找到一只米色帆布包，已由失主确认内部物品后归还。',contact:'演示邮箱：demo05@example.com',publisher:'小何同学',status:'resolved',createdAt:'2026-09-24T12:00:00.000Z' },
    { id:'demo-6',ownerId:'demo',type:'lost',title:'黑色保温杯',category:'其他物品',location:'西区操场',date:'2026-09-22',description:'黑色磨砂保温杯，杯盖有银色挂环。已在操场服务台找回，感谢帮助！',contact:'演示微信：campus_demo_06',publisher:'小郑同学',status:'resolved',createdAt:'2026-09-23T04:40:00.000Z' }
  ];
  if (typeof module === 'object') module.exports = items;
  root.CampusSeed = items;
})(typeof globalThis !== 'undefined' ? globalThis : this);
