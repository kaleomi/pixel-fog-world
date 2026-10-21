/* 数值配置：营地 / 三座产业建筑 / 海盗 / 角色 / 任务 / 信件 / 题库 */
(function () {
  'use strict';
  const PF = (window.PF = window.PF || {});

  // 资源顺序：0 木材 1 水稻 2 紫水晶 3 金币
  const RES = [
    { key: 'wood', name: '木材', color: '#c98a4b' },
    { key: 'rice', name: '水稻', color: '#e8c55a' },
    { key: 'crystal', name: '紫水晶', color: '#b17cff' },
    { key: 'gold', name: '金币', color: '#ffd23f' },
  ];

  /* 费用写成 [木, 稻, 晶, 金] */
  const c = (w, r, k, g) => [w || 0, r || 0, k || 0, g || 0];

  // 营地（原版 CampData）：精灵上限 / 精灵速度 / 玩家速度 / 营地血量
  const CAMP = {
    cap: { vals: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], cost: [null, c(0, 0, 0, 20), c(0, 0, 0, 40), c(0, 0, 0, 60), c(0, 0, 0, 80), c(0, 0, 0, 100), c(0, 0, 0, 120), c(0, 0, 0, 140), c(0, 0, 0, 160), c(0, 0, 0, 180)] },
    wspeed: { vals: [150, 165, 180, 195, 210, 225, 240, 255, 270, 285], cost: [null, c(15), c(25), c(40, 5), c(60, 10), c(85, 20), c(115, 35), c(150, 55), c(190, 80), c(235, 110)] },
    pspeed: { vals: [300, 330, 360, 390, 420, 450, 480, 510, 540, 570], cost: [null, c(5), c(10), c(20, 5), c(35, 10), c(55, 20), c(80, 35, 5), c(0, 55, 10), c(0, 80, 20), c(0, 110, 35)] },
    hp: { vals: [200, 300, 400, 500, 600, 700, 800, 900, 1000, 1100], cost: [null, c(50, 25), c(100, 50), c(150, 75), c(200, 100), c(250, 125), c(0, 130, 20), c(0, 160, 30), c(0, 200, 40), c(0, 240, 50)] },
  };

  // 产业建筑（原版 TreecampData / StonecampData / GoldcampData）
  // grow=资源点再生秒数 / hpAdd=资源点储量加成 / carry=精灵负重 / hit=每次采集量
  const INDUSTRY = {
    wood: {
      hpAdd: { vals: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], cost: [null, c(10), c(20), c(30, 5), c(40, 10), c(50, 20), c(60, 30), c(70, 40), c(80, 50), c(90, 60)] },
      grow: { vals: [80, 76, 72, 68, 64, 60, 56, 52, 48, 44], cost: [null, c(10), c(20), c(30, 5), c(40, 10), c(50, 20), c(60, 30), c(70, 40), c(80, 50), c(90, 60)] },
      carry: { vals: [5, 6, 7, 8, 9, 10, 11, 12, 13, 14], cost: [null, c(5), c(10), c(20, 5), c(35, 10), c(55, 20), c(0, 35, 5), c(0, 55, 10), c(0, 80, 20), c(0, 110, 35)] },
      hit: { vals: [1, 2, 3, 4, 5], cost: [null, c(0, 200, 40), c(0, 400, 80), c(0, 800, 160), c(0, 1600, 320)] },
    },
    rice: {
      hpAdd: { vals: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], cost: [null, c(10), c(20), c(30, 5), c(40, 10), c(50, 20), c(60, 30), c(70, 40), c(80, 50), c(90, 60)] },
      grow: { vals: [120, 114, 108, 102, 96, 90, 84, 78, 72, 66], cost: [null, c(10), c(20), c(30, 5), c(40, 10), c(50, 20), c(60, 30), c(70, 40), c(80, 50), c(90, 60)] },
      carry: { vals: [5, 6, 7, 8, 9, 10, 11, 12, 13, 14], cost: [null, c(5), c(10), c(20, 5), c(35, 10), c(55, 20), c(0, 35, 5), c(0, 55, 10), c(0, 80, 20), c(0, 110, 35)] },
      hit: { vals: [1, 2, 3, 4, 5], cost: [null, c(400, 0, 40), c(800, 0, 80), c(1400, 0, 160), c(2000, 0, 320)] },
    },
    crystal: {
      hpAdd: { vals: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], cost: [null, c(20), c(40), c(60, 20), c(80, 40), c(100, 60), c(120, 80), c(140, 100), c(160, 120), c(180, 140)] },
      grow: { vals: [160, 152, 144, 136, 128, 120, 112, 104, 96, 88], cost: [null, c(20), c(40), c(60, 20), c(80, 40), c(100, 60), c(120, 80), c(140, 100), c(160, 120), c(180, 140)] },
      carry: { vals: [5, 6, 7, 8, 9, 10, 11, 12, 13, 14], cost: [null, c(20), c(40), c(60, 20), c(80, 40), c(100, 60), c(0, 80, 10), c(0, 110, 25), c(0, 140, 40), c(0, 170, 55)] },
      hit: { vals: [1, 2, 3, 4, 5], cost: [null, c(400, 0, 40), c(800, 0, 80), c(1400, 0, 160), c(2000, 0, 320)] },
    },
  };

  const INDUSTRY_ITEMS = {
    wood: [
      { key: 'hpAdd', title: '树木升级', desc: (v, n) => `每棵树木材 +${v}${n != null ? ' → +' + n : ''}` },
      { key: 'grow', title: '快速生长', desc: (v, n) => `树木再生 ${v}秒${n != null ? ' → ' + n + '秒' : ''}` },
      { key: 'carry', title: '精灵负重', desc: (v, n) => `精灵一次搬运 ${v}${n != null ? ' → ' + n : ''}` },
      { key: 'hit', title: '伐木升级', desc: (v, n) => `每一斧砍下 ${v}${n != null ? ' → ' + n : ''} 木材` },
    ],
    rice: [
      { key: 'hpAdd', title: '稻田升级', desc: (v, n) => `每丛水稻 +${v}${n != null ? ' → +' + n : ''}` },
      { key: 'grow', title: '快速生长', desc: (v, n) => `水稻再生 ${v}秒${n != null ? ' → ' + n + '秒' : ''}` },
      { key: 'carry', title: '精灵负重', desc: (v, n) => `精灵一次搬运 ${v}${n != null ? ' → ' + n : ''}` },
      { key: 'hit', title: '收割升级', desc: (v, n) => `每一镰收获 ${v}${n != null ? ' → ' + n : ''} 水稻` },
    ],
    crystal: [
      { key: 'hpAdd', title: '晶簇升级', desc: (v, n) => `每簇水晶 +${v}${n != null ? ' → +' + n : ''}` },
      { key: 'grow', title: '快速生长', desc: (v, n) => `水晶再生 ${v}秒${n != null ? ' → ' + n + '秒' : ''}` },
      { key: 'carry', title: '精灵负重', desc: (v, n) => `精灵一次搬运 ${v}${n != null ? ' → ' + n : ''}` },
      { key: 'hit', title: '采掘升级', desc: (v, n) => `每一镐采下 ${v}${n != null ? ' → ' + n : ''} 紫水晶` },
    ],
  };

  // 资源点基础储量（原版：小 10 / 大 20）
  const NODE_HP = { small: 10, big: 20 };

  // 建筑
  const BUILDINGS = {
    camp: { name: '营地', cost: c() },
    wood: { name: '木料场', cost: c(30), prod: 2, res: 0, task: 2 },
    rice: { name: '粮仓', cost: c(50, 10), prod: 3, res: 1, task: 3 },
    shop: { name: '集市', cost: c(80, 40), task: 4 },
    crystal: { name: '晶矿场', cost: c(110, 60, 10), prod: 5, res: 2, task: 5 },
    dock: { name: '木筏', cost: c(300, 200, 80) },
  };

  // 地块解锁费用（按与中心的曼哈顿距离）
  const TILE_COST = {
    2: c(20),
    3: c(45, 15),
    4: c(90, 45, 10),
    5: c(140, 80, 25),
    6: c(200, 130, 50),
    7: c(270, 180, 80),
    8: c(350, 240, 120),
  };

  // 每晚海盗（原版 PirateData）：[青年, 壮汉, 船长]
  const PIRATES = [
    [3, 0, 0], [3, 0, 0], [4, 0, 0], [4, 0, 0], [4, 1, 0], [4, 1, 0], [5, 1, 0], [5, 1, 0], [5, 1, 0], [5, 2, 0],
    [6, 2, 0], [6, 2, 0], [6, 2, 1], [6, 2, 1], [6, 2, 1], [7, 2, 1], [7, 2, 1], [7, 2, 1], [7, 2, 1], [8, 2, 1],
  ];
  // atkCD：两次攻击的间隔（原版是攻击动作 + 1 秒冷却）
  const PIRATE_KIND = [
    { name: '海盗小喽啰', hp: 40, atk: 5, speed: 150, gold: 8, scale: 1, atkCD: 1.5 },
    { name: '海盗壮汉', hp: 100, atk: 5, speed: 130, gold: 15, scale: 1.25, atkCD: 1.6 },
    { name: '海盗船长', hp: 60, atk: 8, speed: 160, gold: 25, scale: 1.1, atkCD: 1.5 },
  ];

  // 角色（数值沿用原版 PlayerData）
  const ROLES = [
    { name: '熊猫人', desc: '憨厚可靠，什么都会一点', hp: 150, speed: 300, atk: 10, regen: 3, perk: null, unlock: null },
    { name: '小呆', desc: '看起来呆，其实很能干', hp: 150, speed: 300, atk: 10, regen: 3, perk: null, unlock: null },
    { name: '小龙', desc: '砍树速度 ×1.5', hp: 200, speed: 300, atk: 10, regen: 5, perk: 'wood', unlock: { stat: 'wood', n: 600, text: '累计收集木材 600' } },
    { name: '樱妹', desc: '收割水稻速度 ×1.5', hp: 200, speed: 300, atk: 10, regen: 5, perk: 'rice', unlock: { stat: 'rice', n: 400, text: '累计收集水稻 400' } },
    { name: '火火', desc: '攻击力翻倍', hp: 200, speed: 300, atk: 20, regen: 5, perk: 'atk', unlock: { stat: 'kills', n: 30, text: '累计击退海盗 30 个' } },
    { name: '豆子', desc: '采集紫水晶速度 ×1.5', hp: 200, speed: 300, atk: 10, regen: 5, perk: 'crystal', unlock: { stat: 'crystal', n: 200, text: '累计收集紫水晶 200' } },
    { name: '绿野仙子', desc: '移动速度 +50', hp: 200, speed: 350, atk: 10, regen: 5, perk: 'fast', unlock: { stat: 'worlds', n: 4, text: '通关全部 4 个异世界' } },
    { name: '未来机甲', desc: '采集时有几率掉金币，移速 +20%', hp: 200, speed: 360, atk: 10, regen: 5, perk: 'mech', unlock: { stat: 'endings', n: 1, text: '达成任意一个结局' } },
  ];

  const TASKS = [
    { text: '驱散 6 片迷雾', reward: c(20) },
    { text: '召唤小精灵并指派工作', reward: c(20) },
    { text: '修建木料场', reward: c(0, 0, 0, 10) },
    { text: '修建粮仓', reward: c(0, 0, 0, 10) },
    { text: '修建集市', reward: c(0, 0, 0, 15) },
    { text: '修建晶矿场', reward: c(0, 0, 0, 15) },
    { text: '进入任意神秘洞窟', reward: c(0, 0, 0, 20) },
    { text: '找到新大陆，造木筏离开', reward: null },
  ];

  // 海盗来信（每晚一封，轮流）
  const LETTERS = [
    ['致岛上的小家伙：', '听说你在雾里攒了不少好东西，', '今晚我们上门“拜访”一下。', '—— 独眼船长'],
    ['你竟敢揍我的手下！', '这笔账今晚一起算，', '把营地看好了，哼！', '—— 独眼船长'],
    ['好吧，我承认你有两下子。', '但别高兴得太早，', '我的船队可不止这几个人！', '—— 独眼船长'],
    ['听说雾的另一头有片大陆……', '你要是真能造出木筏，', '记得给我留个座位。', '—— 独眼船长'],
  ];

  // 异世界（小游戏）
  const WORLDS = {
    danger: { name: '危险世界', color: '#ff5a4f', glow: '#ff9a7a', rule: '炸弹、激光、导弹会不断落下。\n看准红色预警区域，坚持 60 秒！\n被击中 3 次就失败。', reward: '神光剑：攻击力翻倍' },
    lost: { name: '迷失世界', color: '#4fd18b', glow: '#9cf5c4', rule: '你掉进了一座漆黑的迷宫，\n只能看清身边一小圈。\n120 秒内找到发光的出口！', reward: '森林先知：一只精灵进化，速度 +50%' },
    number: { name: '数字世界', color: '#ffcc33', glow: '#ffe89a', rule: '读题后站到正确的数字砖上。\n倒计时结束，错误的砖块会塌落！\n答对全部 5 题即可通关。', reward: '金币 ×80' },
    reversal: { name: '颠倒世界', color: '#4f9dff', glow: '#9cc9ff', rule: '这里的方向全是反的！\n从果箱拿水果，放进传送带上\n要同样水果的纸箱。错 3 个就失败。', reward: '精灵加速：10 分钟内精灵速度 +50% · 金币 ×40' },
  };

  // 数字世界：数字 1-9 对应的颜色
  const NUM_COLORS = [null, '#e8423f', '#f5d33d', '#3f8cff', '#3fbf5a', '#ff8c2e', '#9a5cff', '#9a6338', '#ff7ab8', '#e9eef2'];
  const NUM_COLOR_NAMES = [null, '红', '黄', '蓝', '绿', '橙', '紫', '棕', '粉', '白'];
  const QUIZ_COLOR = [
    ['香蕉', 2], ['柠檬', 2], ['草莓', 1], ['西瓜瓤', 1], ['橘子', 5], ['胡萝卜', 5], ['黄瓜', 4], ['青椒', 4],
    ['葡萄', 6], ['茄子', 6], ['晴天的天空', 3], ['大海', 3], ['草原', 4], ['火龙果皮', 8], ['樱花', 8], ['雪花', 9], ['南瓜', 5], ['玉米粒', 2],
  ];
  const QUIZ_COUNT = [
    ['一周有几天？', 7], ['三角形有几条边？', 3], ['蜘蛛有几条腿？', 8], ['一只手有几根手指？', 5], ['小猫有几条腿？', 4],
    ['彩虹有几种颜色？', 7], ['一年有几个季节？', 4], ['骰子最大的点数？', 6], ['义务教育共几年？', 9], ['“三心二意”里一共有几颗心？', 3],
    ['正方形有几个角？', 4], ['一双筷子有几根？', 2], ['六边形有几条边？', 6], ['八爪鱼有几只脚？', 8], ['“一石二鸟”里有几只鸟？', 2],
  ];

  PF.Data = {
    RES, CAMP, INDUSTRY, INDUSTRY_ITEMS, NODE_HP, BUILDINGS, TILE_COST, PIRATES, PIRATE_KIND, ROLES, TASKS, LETTERS, WORLDS,
    NUM_COLORS, NUM_COLOR_NAMES, QUIZ_COLOR, QUIZ_COUNT,
    DAY_LEN: 160, // 白天
    NIGHT_LEN: 60, // 夜晚
    DUSK: 10, // 黄昏/黎明过渡
    TILE: 352,
    N: 9,
    PX: 4,
    MAX_PER_TYPE: 4,
    hireCost: (n) => 10 + 5 * n,
    reviveCost: (n) => 30 + 30 * n,
    maxLevel(tbl) {
      // 最后一个可升级的等级
      let m = 0;
      for (let i = 1; i < tbl.cost.length; i++) if (tbl.cost[i]) m = i;
      return m;
    },
  };
})();
