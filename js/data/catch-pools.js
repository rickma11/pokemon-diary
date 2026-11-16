window.APP = window.APP || {};

(function (APP) {
  'use strict';

  // B3 捕捉池静态数据：从设计稿 V5 原样搬来（59 只三档名单 / 属性色 /
  // 动图可见框归一表 / 9 种草丛外观切片）。纯数据，不含交互逻辑。
  // 名单口径见 docs/data/B3捕捉池-59只.json。
  var POOLS = {"common":[{"id":10,"zh":"绿毛虫","types":["bug"],"gen":"Gen1"},{"id":39,"zh":"胖丁","types":["normal","fairy"],"gen":"Gen1"},{"id":41,"zh":"超音蝠","types":["flying","poison"],"gen":"Gen2"},{"id":52,"zh":"喵喵","types":["normal"],"gen":"Gen1"},{"id":54,"zh":"可达鸭","types":["water"],"gen":"Gen1"},{"id":66,"zh":"腕力","types":["fighting"],"gen":"Gen1"},{"id":74,"zh":"小拳石","types":["ground","rock"],"gen":"Gen1"},{"id":86,"zh":"小海狮","types":["water"],"gen":"Gen1"},{"id":116,"zh":"墨海马","types":["water"],"gen":"Gen2"},{"id":129,"zh":"鲤鱼王","types":["water"],"gen":"Gen1"},{"id":161,"zh":"尾立","types":["normal"],"gen":"Gen2"},{"id":167,"zh":"圆丝蛛","types":["poison","bug"],"gen":"Gen2"},{"id":179,"zh":"咩利羊","types":["electric"],"gen":"Gen2"},{"id":183,"zh":"玛力露","types":["water","fairy"],"gen":"Gen2"},{"id":185,"zh":"树才怪","types":["rock"],"gen":"Gen2"},{"id":194,"zh":"乌波","types":["ground","water"],"gen":"Gen2"},{"id":228,"zh":"戴鲁比","types":["fire","dark"],"gen":"Gen2"},{"id":231,"zh":"小小象","types":["ground"],"gen":"Gen2"},{"id":265,"zh":"刺尾虫","types":["bug"],"gen":"Gen3"},{"id":285,"zh":"蘑蘑菇","types":["grass"],"gen":"Gen3"},{"id":307,"zh":"玛沙那","types":["fighting","psychic"],"gen":"Gen3"},{"id":309,"zh":"落雷兽","types":["electric"],"gen":"Gen3"},{"id":333,"zh":"青绵鸟","types":["normal","flying"],"gen":"Gen3"},{"id":353,"zh":"怨影娃娃","types":["ghost"],"gen":"Gen3"}],"uncommon":[{"id":1,"zh":"妙蛙种子","types":["poison","grass"],"gen":"Gen1"},{"id":4,"zh":"小火龙","types":["fire"],"gen":"Gen1"},{"id":7,"zh":"杰尼龟","types":["water"],"gen":"Gen1"},{"id":25,"zh":"皮卡丘","types":["electric"],"gen":"Gen1"},{"id":37,"zh":"六尾","types":["fire"],"gen":"Gen1"},{"id":58,"zh":"卡蒂狗","types":["fire"],"gen":"Gen1"},{"id":152,"zh":"菊草叶","types":["grass"],"gen":"Gen2"},{"id":155,"zh":"火球鼠","types":["fire"],"gen":"Gen2"},{"id":158,"zh":"小锯鳄","types":["water"],"gen":"Gen2"},{"id":202,"zh":"果然翁","types":["psychic"],"gen":"Gen2"},{"id":214,"zh":"赫拉克罗斯","types":["fighting","bug"],"gen":"Gen2"},{"id":239,"zh":"电击怪","types":["electric"],"gen":"Gen1"},{"id":252,"zh":"木守宫","types":["grass"],"gen":"Gen3"},{"id":255,"zh":"火稚鸡","types":["fire"],"gen":"Gen3"},{"id":258,"zh":"水跃鱼","types":["water"],"gen":"Gen3"},{"id":302,"zh":"勾魂眼","types":["ghost","dark"],"gen":"Gen3"},{"id":303,"zh":"大嘴娃","types":["steel","fairy"],"gen":"Gen3"},{"id":304,"zh":"可可多拉","types":["rock","steel"],"gen":"Gen3"},{"id":347,"zh":"太古羽虫","types":["rock","bug"],"gen":"Gen3"},{"id":355,"zh":"夜巡灵","types":["ghost"],"gen":"Gen3"}],"rare":[{"id":63,"zh":"凯西","types":["psychic"],"gen":"Gen1"},{"id":92,"zh":"鬼斯","types":["poison","ghost"],"gen":"Gen1"},{"id":123,"zh":"飞天螳螂","types":["flying","bug"],"gen":"Gen2"},{"id":131,"zh":"拉普拉斯","types":["water","ice"],"gen":"Gen1"},{"id":133,"zh":"伊布","types":["normal"],"gen":"Gen1"},{"id":143,"zh":"卡比兽","types":["normal"],"gen":"Gen1"},{"id":147,"zh":"迷你龙","types":["dragon"],"gen":"Gen1"},{"id":215,"zh":"狃拉","types":["ice","dark"],"gen":"Gen2"},{"id":246,"zh":"幼基拉斯","types":["ground","rock"],"gen":"Gen2"},{"id":280,"zh":"拉鲁拉丝","types":["psychic","fairy"],"gen":"Gen3"},{"id":328,"zh":"大颚蚁","types":["ground"],"gen":"Gen3"},{"id":349,"zh":"丑丑鱼","types":["water"],"gen":"Gen3"},{"id":359,"zh":"阿勃梭鲁","types":["dark"],"gen":"Gen3"},{"id":371,"zh":"宝贝龙","types":["dragon"],"gen":"Gen3"},{"id":374,"zh":"铁哑铃","types":["steel","psychic"],"gen":"Gen3"}]};

  var TY = {"normal":{"zh":"一般","color":"#A8A878"},"fighting":{"zh":"格斗","color":"#C03028"},"flying":{"zh":"飞行","color":"#8B78D8"},"poison":{"zh":"毒","color":"#A040A0"},"ground":{"zh":"地面","color":"#C9A64B"},"rock":{"zh":"岩石","color":"#B8A038"},"bug":{"zh":"虫","color":"#8CA520"},"ghost":{"zh":"幽灵","color":"#705898"},"steel":{"zh":"钢","color":"#8A96A8"},"fire":{"zh":"火","color":"#E86A28"},"water":{"zh":"水","color":"#4F80DC"},"grass":{"zh":"草","color":"#5FA83C"},"electric":{"zh":"电","color":"#C9A11B"},"psychic":{"zh":"超能","color":"#E0507E"},"ice":{"zh":"冰","color":"#4E9EA8"},"dragon":{"zh":"龙","color":"#6238D8"},"dark":{"zh":"恶","color":"#5F5048"},"fairy":{"zh":"妖精","color":"#D2648E"}};

  var COUNTS = {"common":24,"uncommon":20,"rare":15,"total":59};

  var PM_FIT = {"116":[34,43,4,0,30,35],"123":[54,61,0,0,50,61],"129":[47,64,1,7,44,57],"131":[68,72,0,3,68,66],"133":[46,47,3,0,37,47],"143":[74,75,7,7,62,67],"147":[44,51,0,3,35,44],"152":[41,56,1,12,39,44],"155":[44,37,2,0,42,37],"158":[43,58,3,22,37,36],"161":[50,68,14,2,32,63],"167":[43,28,1,0,41,26],"179":[50,41,1,2,41,39],"183":[53,37,4,1,44,34],"185":[65,58,18,3,47,55],"194":[43,33,0,2,41,31],"202":[53,58,5,7,46,51],"214":[61,70,3,7,58,63],"215":[58,52,3,4,53,48],"228":[45,44,7,0,37,44],"231":[46,34,7,2,37,31],"239":[53,43,6,3,43,40],"246":[37,52,1,8,34,44],"252":[43,63,1,12,41,45],"255":[33,47,3,4,25,43],"258":[43,49,1,7,39,42],"265":[37,46,0,6,35,40],"280":[23,39,0,0,23,38],"285":[44,48,5,15,39,33],"302":[43,49,0,5,42,43],"303":[79,51,21,4,57,47],"304":[32,31,1,0,31,31],"307":[44,54,0,7,43,42],"309":[50,36,1,1,49,35],"328":[39,42,1,0,38,42],"333":[73,49,1,0,70,36],"347":[45,53,0,2,45,48],"349":[38,52,1,1,34,46],"353":[39,58,2,19,35,39],"355":[51,45,6,3,38,41],"359":[65,64,5,6,53,58],"371":[43,51,10,1,31,49],"374":[47,44,0,6,41,34],"001":[37,38,0,5,35,33],"004":[41,42,3,0,38,42],"007":[39,43,0,4,38,39],"010":[36,37,0,0,31,35],"025":[50,46,5,0,39,46],"037":[60,50,1,4,53,46],"039":[47,46,7,12,34,34],"041":[53,46,0,0,51,37],"052":[48,65,0,15,41,49],"054":[39,46,5,1,34,45],"058":[56,49,3,6,48,42],"063":[62,53,1,8,52,44],"066":[50,50,0,0,50,50],"074":[61,45,1,20,56,24],"086":[62,47,1,1,57,45],"092":[67,75,0,0,65,55]};

  var TIER_ODDS = { common:.70, uncommon:.22, rare:.08 };

  var CATCH_RATE = { common:.80, uncommon:.55, rare:.35 };

  // 第 9 轮：稀有度决定「遇到它会不会先打一场」——常见 0% / 少见 50% / 稀有 100%。
  // 触发战斗的必须打赢才能投球；已捕捉过的宝可梦不看稀有度，必定直接开战。
  var TIER_BATTLE_ODDS = { common:0, uncommon:.50, rare:1 };

  // 7 个场景主题：每个主题对应一张背景图 + 3 个宝可梦躲藏点（透明精灵）。
  // 每轮随机抽一个主题，3 个躲藏点再随机摆放到 3 个槽位（纯视觉、不绑定稀有度）。
  var THEMES = [
    { key:'marsh',  name:'湿地', scene:'assets/catch/scenes/marsh.webp',  hides:['assets/catch/hides/marsh-1.webp','assets/catch/hides/marsh-2.webp','assets/catch/hides/marsh-3.webp'] },
    { key:'volcano',name:'火山', scene:'assets/catch/scenes/volcano.webp', hides:['assets/catch/hides/volcano-1.webp','assets/catch/hides/volcano-2.webp','assets/catch/hides/volcano-3.webp'] },
    { key:'bamboo', name:'竹林', scene:'assets/catch/scenes/bamboo.webp', hides:['assets/catch/hides/bamboo-1.webp','assets/catch/hides/bamboo-2.webp','assets/catch/hides/bamboo-3.webp'] },
    { key:'desert', name:'沙漠', scene:'assets/catch/scenes/desert.webp', hides:['assets/catch/hides/desert-1.webp','assets/catch/hides/desert-2.webp','assets/catch/hides/desert-3.webp'] },
    { key:'beach',  name:'海滩', scene:'assets/catch/scenes/beach.webp',  hides:['assets/catch/hides/beach-1.webp','assets/catch/hides/beach-2.webp','assets/catch/hides/beach-3.webp'] },
    { key:'cave',   name:'洞窟', scene:'assets/catch/scenes/cave.webp',   hides:['assets/catch/hides/cave-1.webp','assets/catch/hides/cave-2.webp','assets/catch/hides/cave-3.webp'] },
    { key:'snow',   name:'雪山', scene:'assets/catch/scenes/snow.webp',   hides:['assets/catch/hides/snow-1.webp','assets/catch/hides/snow-2.webp','assets/catch/hides/snow-3.webp'] }
  ];

  // 第 6 轮：编号改用普通数字，圆圈由 .b3-hide__num 用 CSS 绘制，避免字体基线漂移
  var SLOT_MARK = ['1','2','3'];


  // 第 12 轮：PM_FRAME = 每只动图「单帧可见内容的最长边」中位数（离线逐帧解码 59 只 GIF 实测）。
  // 用途：捕捉页统一缩放——按它把每只的可见大小拉到同一档（不再按整幅画布缩放，
  // 那会让留白多的宝可梦显小、内容大的显大，差到 2 倍以上）；
  // 同时整幅画布缩放后完整落在 120x86 框内，动画帧不再被裁掉（PM_FIT 是静态图 bbox，比动画帧小 4~7px）。
  var PM_FRAME = {"116":37,"123":54,"129":54,"131":68,"133":45,"143":68,"147":44,"152":42,"155":40,"158":37,"161":63,"167":40,"179":41,"183":43,"185":49,"194":41,"202":48,"214":58,"215":53,"228":38,"231":36,"239":44,"246":42,"252":43,"255":37,"258":41,"265":40,"280":36,"285":38,"302":43,"303":59,"304":31,"307":43,"309":48,"328":38,"333":71,"347":48,"349":46,"353":38,"355":41,"359":57,"371":46,"374":41,"010":36,"039":36,"041":52,"052":49,"054":39,"066":50,"074":59,"086":58,"001":35,"004":38,"007":40,"025":44,"037":55,"058":48,"063":55,"092":64};
  APP.catchData = {
    POOLS: POOLS, TYPES: TY, COUNTS: COUNTS, PM_FIT: PM_FIT, PM_FRAME: PM_FRAME,
    TIER_ODDS: TIER_ODDS, CATCH_RATE: CATCH_RATE, TIER_BATTLE_ODDS: TIER_BATTLE_ODDS,
    THEMES: THEMES, SLOT_MARK: SLOT_MARK,
    GIF_BASE: 'assets/pokemon/animated/',
    CRY_BASE: 'assets/cries/'
  };
})(window.APP);
