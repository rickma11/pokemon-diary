window.APP = window.APP || {};

/* ==========================================================================
   图鉴数据 · 离线固化（运行时不联网）
   来源：图鉴精简方案-V3-属性补强-名单确认.html（64 个图鉴格 + 51 只对战专用）
         图鉴页-交互预览.html（进化链 / 中文名 / 属性，逐条实抓 PokeAPI 校验）
   口径：前三世代 001–386；按进化家族成格；神兽不出现；对战专用只作对手。
   共 64 格 / 136 个进化形态 / 51 只对战专用 / 18 属性。
   ========================================================================== */
(function (APP) {
  'use strict';

  var TYPES = [
    {"k":"normal","zh":"一般","color":"#A8A878"},
    {"k":"fighting","zh":"格斗","color":"#C03028"},
    {"k":"flying","zh":"飞行","color":"#8B78D8"},
    {"k":"poison","zh":"毒","color":"#A040A0"},
    {"k":"ground","zh":"地面","color":"#C9A64B"},
    {"k":"rock","zh":"岩石","color":"#B8A038"},
    {"k":"bug","zh":"虫","color":"#8CA520"},
    {"k":"ghost","zh":"幽灵","color":"#705898"},
    {"k":"steel","zh":"钢","color":"#8A96A8"},
    {"k":"fire","zh":"火","color":"#E86A28"},
    {"k":"water","zh":"水","color":"#4F80DC"},
    {"k":"grass","zh":"草","color":"#5FA83C"},
    {"k":"electric","zh":"电","color":"#C9A11B"},
    {"k":"psychic","zh":"超能","color":"#E0507E"},
    {"k":"ice","zh":"冰","color":"#4E9EA8"},
    {"k":"dragon","zh":"龙","color":"#6238D8"},
    {"k":"dark","zh":"恶","color":"#5F5048"},
    {"k":"fairy","zh":"妖精","color":"#D2648E"}
  ];

  var GENS = [
    {"id":"Gen1 关都","label":"Gen1 · 关都","short":"Gen1","from":1,"to":151},
    {"id":"Gen2 城都","label":"Gen2 · 城都","short":"Gen2","from":152,"to":251},
    {"id":"Gen3 丰缘","label":"Gen3 · 丰缘","short":"Gen3","from":252,"to":386}
  ];

  // 图鉴格：id/zh/types 是代表形态（通常是最终形态），path 是整条进化链
  var ENTRIES = [
    {"id":6,"zh":"喷火龙","g":"Gen1 关都","base":4,"types":["flying","fire"],"path":[{"id":4,"zh":"小火龙","cond":"","types":["fire"]},{"id":5,"zh":"火恐龙","cond":"Lv.16","types":["fire"]},{"id":6,"zh":"喷火龙","cond":"Lv.36","types":["flying","fire"]}]},
    {"id":94,"zh":"耿鬼","g":"Gen1 关都","base":92,"types":["poison","ghost"],"path":[{"id":92,"zh":"鬼斯","cond":"","types":["poison","ghost"]},{"id":93,"zh":"鬼斯通","cond":"Lv.25","types":["poison","ghost"]},{"id":94,"zh":"耿鬼","cond":"通信交换","types":["poison","ghost"]}]},
    {"id":1,"zh":"妙蛙种子","g":"Gen1 关都","base":1,"types":["poison","grass"],"path":[{"id":1,"zh":"妙蛙种子","cond":"","types":["poison","grass"]},{"id":2,"zh":"妙蛙草","cond":"Lv.16","types":["poison","grass"]},{"id":3,"zh":"妙蛙花","cond":"Lv.32","types":["poison","grass"]}]},
    {"id":25,"zh":"皮卡丘","g":"Gen1 关都","base":25,"types":["electric"],"path":[{"id":25,"zh":"皮卡丘","cond":"","types":["electric"]},{"id":26,"zh":"雷丘","cond":"雷之石","types":["electric"]}]},
    {"id":133,"zh":"伊布","g":"Gen1 关都","base":133,"types":["normal"],"path":[{"id":133,"zh":"伊布","cond":"","types":["normal"]}]},
    {"id":134,"zh":"水伊布","g":"Gen1 关都","base":133,"types":["water"],"path":[{"id":133,"zh":"伊布","cond":"","types":["normal"]},{"id":134,"zh":"水伊布","cond":"水之石","types":["water"]}]},
    {"id":135,"zh":"雷伊布","g":"Gen1 关都","base":133,"types":["electric"],"path":[{"id":133,"zh":"伊布","cond":"","types":["normal"]},{"id":135,"zh":"雷伊布","cond":"雷之石","types":["electric"]}]},
    {"id":136,"zh":"火伊布","g":"Gen1 关都","base":133,"types":["fire"],"path":[{"id":133,"zh":"伊布","cond":"","types":["normal"]},{"id":136,"zh":"火伊布","cond":"火之石","types":["fire"]}]},
    {"id":149,"zh":"快龙","g":"Gen1 关都","base":147,"types":["flying","dragon"],"path":[{"id":147,"zh":"迷你龙","cond":"","types":["dragon"]},{"id":148,"zh":"哈克龙","cond":"Lv.30","types":["dragon"]},{"id":149,"zh":"快龙","cond":"Lv.55","types":["flying","dragon"]}]},
    {"id":59,"zh":"风速狗","g":"Gen1 关都","base":58,"types":["fire"],"path":[{"id":58,"zh":"卡蒂狗","cond":"","types":["fire"]},{"id":59,"zh":"风速狗","cond":"火之石","types":["fire"]}]},
    {"id":131,"zh":"拉普拉斯","g":"Gen1 关都","base":131,"types":["water","ice"],"path":[{"id":131,"zh":"拉普拉斯","cond":"","types":["water","ice"]}]},
    {"id":143,"zh":"卡比兽","g":"Gen1 关都","base":143,"types":["normal"],"path":[{"id":143,"zh":"卡比兽","cond":"","types":["normal"]}]},
    {"id":38,"zh":"九尾","g":"Gen1 关都","base":37,"types":["fire"],"path":[{"id":37,"zh":"六尾","cond":"","types":["fire"]},{"id":38,"zh":"九尾","cond":"火之石","types":["fire"]}]},
    {"id":9,"zh":"水箭龟","g":"Gen1 关都","base":7,"types":["water"],"path":[{"id":7,"zh":"杰尼龟","cond":"","types":["water"]},{"id":8,"zh":"卡咪龟","cond":"Lv.16","types":["water"]},{"id":9,"zh":"水箭龟","cond":"Lv.36","types":["water"]}]},
    {"id":130,"zh":"暴鲤龙","g":"Gen1 关都","base":129,"types":["flying","water"],"path":[{"id":129,"zh":"鲤鱼王","cond":"","types":["water"]},{"id":130,"zh":"暴鲤龙","cond":"Lv.20","types":["flying","water"]}]},
    {"id":54,"zh":"可达鸭","g":"Gen1 关都","base":54,"types":["water"],"path":[{"id":54,"zh":"可达鸭","cond":"","types":["water"]},{"id":55,"zh":"哥达鸭","cond":"Lv.33","types":["water"]}]},
    {"id":65,"zh":"胡地","g":"Gen1 关都","base":63,"types":["psychic"],"path":[{"id":63,"zh":"凯西","cond":"","types":["psychic"]},{"id":64,"zh":"勇基拉","cond":"Lv.16","types":["psychic"]},{"id":65,"zh":"胡地","cond":"通信交换","types":["psychic"]}]},
    {"id":68,"zh":"怪力","g":"Gen1 关都","base":66,"types":["fighting"],"path":[{"id":66,"zh":"腕力","cond":"","types":["fighting"]},{"id":67,"zh":"豪力","cond":"Lv.28","types":["fighting"]},{"id":68,"zh":"怪力","cond":"通信交换","types":["fighting"]}]},
    {"id":12,"zh":"巴大蝶","g":"Gen1 关都","base":10,"types":["flying","bug"],"path":[{"id":10,"zh":"绿毛虫","cond":"","types":["bug"]},{"id":11,"zh":"铁甲蛹","cond":"Lv.7","types":["bug"]},{"id":12,"zh":"巴大蝶","cond":"Lv.10","types":["flying","bug"]}]},
    {"id":40,"zh":"胖可丁","g":"Gen1 关都","base":39,"types":["normal","fairy"],"path":[{"id":39,"zh":"胖丁","cond":"","types":["normal","fairy"]},{"id":40,"zh":"胖可丁","cond":"月之石","types":["normal","fairy"]}]},
    {"id":53,"zh":"猫老大","g":"Gen1 关都","base":52,"types":["normal"],"path":[{"id":52,"zh":"喵喵","cond":"","types":["normal"]},{"id":53,"zh":"猫老大","cond":"Lv.28","types":["normal"]}]},
    {"id":76,"zh":"隆隆岩","g":"Gen1 关都","base":74,"types":["ground","rock"],"path":[{"id":74,"zh":"小拳石","cond":"","types":["ground","rock"]},{"id":75,"zh":"隆隆石","cond":"Lv.25","types":["ground","rock"]},{"id":76,"zh":"隆隆岩","cond":"通信交换","types":["ground","rock"]}]},
    {"id":87,"zh":"白海狮","g":"Gen1 关都","base":86,"types":["water","ice"],"path":[{"id":86,"zh":"小海狮","cond":"","types":["water"]},{"id":87,"zh":"白海狮","cond":"Lv.34","types":["water","ice"]}]},
    {"id":125,"zh":"电击兽","g":"Gen1 关都","base":239,"types":["electric"],"path":[{"id":239,"zh":"电击怪","cond":"","types":["electric"]},{"id":125,"zh":"电击兽","cond":"Lv.30","types":["electric"]}]},
    {"id":197,"zh":"月亮伊布","g":"Gen2 城都","base":133,"types":["dark"],"path":[{"id":133,"zh":"伊布","cond":"","types":["normal"]},{"id":197,"zh":"月亮伊布","cond":"特殊条件","types":["dark"]}]},
    {"id":248,"zh":"班基拉斯","g":"Gen2 城都","base":246,"types":["rock","dark"],"path":[{"id":246,"zh":"幼基拉斯","cond":"","types":["ground","rock"]},{"id":247,"zh":"沙基拉斯","cond":"Lv.30","types":["ground","rock"]},{"id":248,"zh":"班基拉斯","cond":"Lv.55","types":["rock","dark"]}]},
    {"id":157,"zh":"火暴兽","g":"Gen2 城都","base":155,"types":["fire"],"path":[{"id":155,"zh":"火球鼠","cond":"","types":["fire"]},{"id":156,"zh":"火岩鼠","cond":"Lv.14","types":["fire"]},{"id":157,"zh":"火暴兽","cond":"Lv.36","types":["fire"]}]},
    {"id":212,"zh":"巨钳螳螂","g":"Gen2 城都","base":123,"types":["bug","steel"],"path":[{"id":123,"zh":"飞天螳螂","cond":"","types":["flying","bug"]},{"id":212,"zh":"巨钳螳螂","cond":"通信交换","types":["bug","steel"]}]},
    {"id":181,"zh":"电龙","g":"Gen2 城都","base":179,"types":["electric"],"path":[{"id":179,"zh":"咩利羊","cond":"","types":["electric"]},{"id":180,"zh":"茸茸羊","cond":"Lv.15","types":["electric"]},{"id":181,"zh":"电龙","cond":"Lv.30","types":["electric"]}]},
    {"id":196,"zh":"太阳伊布","g":"Gen2 城都","base":133,"types":["psychic"],"path":[{"id":133,"zh":"伊布","cond":"","types":["normal"]},{"id":196,"zh":"太阳伊布","cond":"特殊条件","types":["psychic"]}]},
    {"id":160,"zh":"大力鳄","g":"Gen2 城都","base":158,"types":["water"],"path":[{"id":158,"zh":"小锯鳄","cond":"","types":["water"]},{"id":159,"zh":"蓝鳄","cond":"Lv.18","types":["water"]},{"id":160,"zh":"大力鳄","cond":"Lv.30","types":["water"]}]},
    {"id":169,"zh":"叉字蝠","g":"Gen2 城都","base":41,"types":["flying","poison"],"path":[{"id":41,"zh":"超音蝠","cond":"","types":["flying","poison"]},{"id":42,"zh":"大嘴蝠","cond":"Lv.22","types":["flying","poison"]},{"id":169,"zh":"叉字蝠","cond":"特殊条件","types":["flying","poison"]}]},
    {"id":162,"zh":"大尾立","g":"Gen2 城都","base":161,"types":["normal"],"path":[{"id":161,"zh":"尾立","cond":"","types":["normal"]},{"id":162,"zh":"大尾立","cond":"Lv.15","types":["normal"]}]},
    {"id":154,"zh":"大竺葵","g":"Gen2 城都","base":152,"types":["grass"],"path":[{"id":152,"zh":"菊草叶","cond":"","types":["grass"]},{"id":153,"zh":"月桂叶","cond":"Lv.16","types":["grass"]},{"id":154,"zh":"大竺葵","cond":"Lv.32","types":["grass"]}]},
    {"id":214,"zh":"赫拉克罗斯","g":"Gen2 城都","base":214,"types":["fighting","bug"],"path":[{"id":214,"zh":"赫拉克罗斯","cond":"","types":["fighting","bug"]}]},
    {"id":229,"zh":"黑鲁加","g":"Gen2 城都","base":228,"types":["fire","dark"],"path":[{"id":228,"zh":"戴鲁比","cond":"","types":["fire","dark"]},{"id":229,"zh":"黑鲁加","cond":"Lv.24","types":["fire","dark"]}]},
    {"id":230,"zh":"刺龙王","g":"Gen2 城都","base":116,"types":["water","dragon"],"path":[{"id":116,"zh":"墨海马","cond":"","types":["water"]},{"id":117,"zh":"海刺龙","cond":"Lv.32","types":["water"]},{"id":230,"zh":"刺龙王","cond":"通信交换","types":["water","dragon"]}]},
    {"id":202,"zh":"果然翁","g":"Gen2 城都","base":202,"types":["psychic"],"path":[{"id":202,"zh":"果然翁","cond":"","types":["psychic"]}]},
    {"id":195,"zh":"沼王","g":"Gen2 城都","base":194,"types":["ground","water"],"path":[{"id":194,"zh":"乌波","cond":"","types":["ground","water"]},{"id":195,"zh":"沼王","cond":"Lv.20","types":["ground","water"]}]},
    {"id":168,"zh":"阿利多斯","g":"Gen2 城都","base":167,"types":["poison","bug"],"path":[{"id":167,"zh":"圆丝蛛","cond":"","types":["poison","bug"]},{"id":168,"zh":"阿利多斯","cond":"Lv.22","types":["poison","bug"]}]},
    {"id":184,"zh":"玛力露丽","g":"Gen2 城都","base":183,"types":["water","fairy"],"path":[{"id":183,"zh":"玛力露","cond":"","types":["water","fairy"]},{"id":184,"zh":"玛力露丽","cond":"Lv.18","types":["water","fairy"]}]},
    {"id":185,"zh":"树才怪","g":"Gen2 城都","base":185,"types":["rock"],"path":[{"id":185,"zh":"树才怪","cond":"","types":["rock"]}]},
    {"id":215,"zh":"狃拉","g":"Gen2 城都","base":215,"types":["ice","dark"],"path":[{"id":215,"zh":"狃拉","cond":"","types":["ice","dark"]}]},
    {"id":232,"zh":"顿甲","g":"Gen2 城都","base":231,"types":["ground"],"path":[{"id":231,"zh":"小小象","cond":"","types":["ground"]},{"id":232,"zh":"顿甲","cond":"Lv.25","types":["ground"]}]},
    {"id":282,"zh":"沙奈朵","g":"Gen3 丰缘","base":280,"types":["psychic","fairy"],"path":[{"id":280,"zh":"拉鲁拉丝","cond":"","types":["psychic","fairy"]},{"id":281,"zh":"奇鲁莉安","cond":"Lv.20","types":["psychic","fairy"]},{"id":282,"zh":"沙奈朵","cond":"Lv.30","types":["psychic","fairy"]}]},
    {"id":330,"zh":"沙漠蜻蜓","g":"Gen3 丰缘","base":328,"types":["ground","dragon"],"path":[{"id":328,"zh":"大颚蚁","cond":"","types":["ground"]},{"id":329,"zh":"超音波幼虫","cond":"Lv.35","types":["ground","dragon"]},{"id":330,"zh":"沙漠蜻蜓","cond":"Lv.45","types":["ground","dragon"]}]},
    {"id":254,"zh":"蜥蜴王","g":"Gen3 丰缘","base":252,"types":["grass"],"path":[{"id":252,"zh":"木守宫","cond":"","types":["grass"]},{"id":253,"zh":"森林蜥蜴","cond":"Lv.16","types":["grass"]},{"id":254,"zh":"蜥蜴王","cond":"Lv.36","types":["grass"]}]},
    {"id":257,"zh":"火焰鸡","g":"Gen3 丰缘","base":255,"types":["fighting","fire"],"path":[{"id":255,"zh":"火稚鸡","cond":"","types":["fire"]},{"id":256,"zh":"力壮鸡","cond":"Lv.16","types":["fighting","fire"]},{"id":257,"zh":"火焰鸡","cond":"Lv.36","types":["fighting","fire"]}]},
    {"id":260,"zh":"巨沼怪","g":"Gen3 丰缘","base":258,"types":["ground","water"],"path":[{"id":258,"zh":"水跃鱼","cond":"","types":["water"]},{"id":259,"zh":"沼跃鱼","cond":"Lv.16","types":["ground","water"]},{"id":260,"zh":"巨沼怪","cond":"Lv.36","types":["ground","water"]}]},
    {"id":376,"zh":"巨金怪","g":"Gen3 丰缘","base":374,"types":["steel","psychic"],"path":[{"id":374,"zh":"铁哑铃","cond":"","types":["steel","psychic"]},{"id":375,"zh":"金属怪","cond":"Lv.20","types":["steel","psychic"]},{"id":376,"zh":"巨金怪","cond":"Lv.45","types":["steel","psychic"]}]},
    {"id":350,"zh":"美纳斯","g":"Gen3 丰缘","base":349,"types":["water"],"path":[{"id":349,"zh":"丑丑鱼","cond":"","types":["water"]},{"id":350,"zh":"美纳斯","cond":"特殊条件","types":["water"]}]},
    {"id":359,"zh":"阿勃梭鲁","g":"Gen3 丰缘","base":359,"types":["dark"],"path":[{"id":359,"zh":"阿勃梭鲁","cond":"","types":["dark"]}]},
    {"id":373,"zh":"暴飞龙","g":"Gen3 丰缘","base":371,"types":["flying","dragon"],"path":[{"id":371,"zh":"宝贝龙","cond":"","types":["dragon"]},{"id":372,"zh":"甲壳龙","cond":"Lv.30","types":["dragon"]},{"id":373,"zh":"暴飞龙","cond":"Lv.50","types":["flying","dragon"]}]},
    {"id":306,"zh":"波士可多拉","g":"Gen3 丰缘","base":304,"types":["rock","steel"],"path":[{"id":304,"zh":"可可多拉","cond":"","types":["rock","steel"]},{"id":305,"zh":"可多拉","cond":"Lv.32","types":["rock","steel"]},{"id":306,"zh":"波士可多拉","cond":"Lv.42","types":["rock","steel"]}]},
    {"id":334,"zh":"七夕青鸟","g":"Gen3 丰缘","base":333,"types":["flying","dragon"],"path":[{"id":333,"zh":"青绵鸟","cond":"","types":["normal","flying"]},{"id":334,"zh":"七夕青鸟","cond":"Lv.35","types":["flying","dragon"]}]},
    {"id":286,"zh":"斗笠菇","g":"Gen3 丰缘","base":285,"types":["fighting","grass"],"path":[{"id":285,"zh":"蘑蘑菇","cond":"","types":["grass"]},{"id":286,"zh":"斗笠菇","cond":"Lv.23","types":["fighting","grass"]}]},
    {"id":303,"zh":"大嘴娃","g":"Gen3 丰缘","base":303,"types":["steel","fairy"],"path":[{"id":303,"zh":"大嘴娃","cond":"","types":["steel","fairy"]}]},
    {"id":302,"zh":"勾魂眼","g":"Gen3 丰缘","base":302,"types":["ghost","dark"],"path":[{"id":302,"zh":"勾魂眼","cond":"","types":["ghost","dark"]}]},
    {"id":354,"zh":"诅咒娃娃","g":"Gen3 丰缘","base":353,"types":["ghost"],"path":[{"id":353,"zh":"怨影娃娃","cond":"","types":["ghost"]},{"id":354,"zh":"诅咒娃娃","cond":"Lv.37","types":["ghost"]}]},
    {"id":267,"zh":"狩猎凤蝶","g":"Gen3 丰缘","base":265,"types":["flying","bug"],"path":[{"id":265,"zh":"刺尾虫","cond":"","types":["bug"]},{"id":266,"zh":"甲壳茧","cond":"Lv.7","types":["bug"]},{"id":267,"zh":"狩猎凤蝶","cond":"Lv.10","types":["flying","bug"]}]},
    {"id":308,"zh":"恰雷姆","g":"Gen3 丰缘","base":307,"types":["fighting","psychic"],"path":[{"id":307,"zh":"玛沙那","cond":"","types":["fighting","psychic"]},{"id":308,"zh":"恰雷姆","cond":"Lv.37","types":["fighting","psychic"]}]},
    {"id":310,"zh":"雷电兽","g":"Gen3 丰缘","base":309,"types":["electric"],"path":[{"id":309,"zh":"落雷兽","cond":"","types":["electric"]},{"id":310,"zh":"雷电兽","cond":"Lv.26","types":["electric"]}]},
    {"id":348,"zh":"太古盔甲","g":"Gen3 丰缘","base":347,"types":["rock","bug"],"path":[{"id":347,"zh":"太古羽虫","cond":"","types":["rock","bug"]},{"id":348,"zh":"太古盔甲","cond":"Lv.40","types":["rock","bug"]}]},
    {"id":356,"zh":"彷徨夜灵","g":"Gen3 丰缘","base":355,"types":["ghost"],"path":[{"id":355,"zh":"夜巡灵","cond":"","types":["ghost"]},{"id":356,"zh":"彷徨夜灵","cond":"Lv.37","types":["ghost"]}]}
  ];

  // 对战专用：不进图鉴页，B4 对战玩法使用
  var BATTLE_ONLY = [
    {"id":34,"zh":"尼多王","g":"Gen1 关都","types":["ground","poison"]},
    {"id":80,"zh":"呆壳兽","g":"Gen1 关都","types":["psychic","water"]},
    {"id":89,"zh":"臭臭泥","g":"Gen1 关都","types":["poison"]},
    {"id":132,"zh":"百变怪","g":"Gen1 关都","types":["normal"]},
    {"id":127,"zh":"凯罗斯","g":"Gen1 关都","types":["bug"]},
    {"id":137,"zh":"多边兽","g":"Gen1 关都","types":["normal"]},
    {"id":82,"zh":"三合一磁怪","g":"Gen1 关都","types":["electric","steel"]},
    {"id":71,"zh":"大食花","g":"Gen1 关都","types":["grass","poison"]},
    {"id":73,"zh":"毒刺水母","g":"Gen1 关都","types":["poison","water"]},
    {"id":112,"zh":"钻角犀兽","g":"Gen1 关都","types":["ground","rock"]},
    {"id":115,"zh":"袋兽","g":"Gen1 关都","types":["normal"]},
    {"id":142,"zh":"化石翼龙","g":"Gen1 关都","types":["flying","rock"]},
    {"id":57,"zh":"火暴猴","g":"Gen1 关都","types":["fighting"]},
    {"id":106,"zh":"飞腿郎","g":"Gen1 关都","types":["fighting"]},
    {"id":107,"zh":"快拳郎","g":"Gen1 关都","types":["fighting"]},
    {"id":148,"zh":"哈克龙","g":"Gen1 关都","types":["dragon"]},
    {"id":242,"zh":"幸福蛋","g":"Gen2 城都","types":["normal"]},
    {"id":208,"zh":"大钢蛇","g":"Gen2 城都","types":["ground","steel"]},
    {"id":178,"zh":"天然鸟","g":"Gen2 城都","types":["flying","psychic"]},
    {"id":176,"zh":"波克基古","g":"Gen2 城都","types":["fairy","flying"]},
    {"id":205,"zh":"佛烈托斯","g":"Gen2 城都","types":["bug","steel"]},
    {"id":227,"zh":"盔甲鸟","g":"Gen2 城都","types":["flying","steel"]},
    {"id":171,"zh":"电灯怪","g":"Gen2 城都","types":["electric","water"]},
    {"id":189,"zh":"毽子棉","g":"Gen2 城都","types":["flying","grass"]},
    {"id":200,"zh":"梦妖","g":"Gen2 城都","types":["ghost"]},
    {"id":213,"zh":"壶壶","g":"Gen2 城都","types":["bug","rock"]},
    {"id":203,"zh":"麒麟奇","g":"Gen2 城都","types":["normal","psychic"]},
    {"id":222,"zh":"太阳珊瑚","g":"Gen2 城都","types":["rock","water"]},
    {"id":224,"zh":"章鱼桶","g":"Gen2 城都","types":["water"]},
    {"id":226,"zh":"巨翅飞鱼","g":"Gen2 城都","types":["flying","water"]},
    {"id":210,"zh":"布鲁皇","g":"Gen2 城都","types":["fairy"]},
    {"id":225,"zh":"信使鸟","g":"Gen2 城都","types":["flying","ice"]},
    {"id":237,"zh":"战舞郎","g":"Gen2 城都","types":["fighting"]},
    {"id":272,"zh":"乐天河童","g":"Gen3 丰缘","types":["grass","water"]},
    {"id":275,"zh":"狡猾天狗","g":"Gen3 丰缘","types":["dark","grass"]},
    {"id":262,"zh":"大狼犬","g":"Gen3 丰缘","types":["dark"]},
    {"id":291,"zh":"铁面忍者","g":"Gen3 丰缘","types":["bug","flying"]},
    {"id":324,"zh":"煤炭龟","g":"Gen3 丰缘","types":["fire"]},
    {"id":284,"zh":"雨翅蛾","g":"Gen3 丰缘","types":["bug","flying"]},
    {"id":317,"zh":"吞食兽","g":"Gen3 丰缘","types":["poison"]},
    {"id":358,"zh":"风铃铃","g":"Gen3 丰缘","types":["psychic"]},
    {"id":362,"zh":"冰鬼护","g":"Gen3 丰缘","types":["ice"]},
    {"id":365,"zh":"帝牙海狮","g":"Gen3 丰缘","types":["ice","water"]},
    {"id":367,"zh":"猎斑鱼","g":"Gen3 丰缘","types":["water"]},
    {"id":369,"zh":"古空棘鱼","g":"Gen3 丰缘","types":["rock","water"]},
    {"id":338,"zh":"太阳岩","g":"Gen3 丰缘","types":["psychic","rock"]},
    {"id":344,"zh":"念力土偶","g":"Gen3 丰缘","types":["ground","psychic"]},
    {"id":337,"zh":"月石","g":"Gen3 丰缘","types":["psychic","rock"]},
    {"id":297,"zh":"铁掌力士","g":"Gen3 丰缘","types":["fighting"]},
    {"id":329,"zh":"超音波幼虫","g":"Gen3 丰缘","types":["dragon","ground"]},
    {"id":372,"zh":"甲壳龙","g":"Gen3 丰缘","types":["dragon"]}
  ];

  var TYPE_MAP = {}, NAME = {}, VALID = {};
  TYPES.forEach(function (t) { TYPE_MAP[t.k] = t; });
  ENTRIES.forEach(function (e) {
    NAME[e.id] = e.zh;
    VALID[e.id] = 1;
    e.path.forEach(function (p) { NAME[p.id] = p.zh; VALID[p.id] = 1; });
  });
  BATTLE_ONLY.forEach(function (b) { NAME[b.id] = b.zh; VALID[b.id] = 1; });

  APP.dexData = {
    TYPES: TYPES,
    GENS: GENS,
    ENTRIES: ENTRIES,
    BATTLE_ONLY: BATTLE_ONLY,
    typeOf: function (k) { return TYPE_MAP[k] || null; },
    nameOf: function (n) { return NAME[Number(n)] || ''; },
    // store.parseDex 用：只有本期名单里的编号才允许被收录
    validIds: function () { return VALID; },
    // APP.evo.get 兜底：152–386 只提供名称与阶数，进化逻辑仍走 001–151 原表
    infoOf: function (n) {
      n = Number(n);
      if (!VALID[n]) return null;
      return { dexNo: n, name: NAME[n], stage: 0, next: [] };
    }
  };
})(window.APP);
