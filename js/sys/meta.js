/* 长线玩法：成就、迷雾结晶、局外天赋、帽子外观
   - 成就：监听各种事件（包括其他系统 g.fire('stat', 名字, 数量) 上报的统计），达成时在顶部弹出庆祝横幅并奖励结晶
   - 迷雾结晶：每局结算时按表现发放，用来学天赋、买帽子
   - 天赋：开新局时生效（开局时记进本局存档，读档不受之后的购买影响）
   - 帽子：选角时挑选，1P / 2P 各一顶，画在玩家头上
   测试模式（?rich / ?fast）不发结晶、不解锁成就 */
(function () {
  'use strict';
  const PF = window.PF,
    U = PF.U,
    D = PF.Data,
    S = PF.Spr,
    A = PF.Audio,
    E = PF.Ent;
  const PX = D.PX;
  const OUT = '#1c1424';

  /* ---------------- 长期存档 ---------------- */
  function meta() {
    const m = PF.Save.meta;
    if (typeof m.crystals !== 'number' || !isFinite(m.crystals)) m.crystals = 0;
    if (!m.talents || typeof m.talents !== 'object') m.talents = {};
    if (!m.ach || typeof m.ach !== 'object') m.ach = {};
    if (!m.hats || typeof m.hats !== 'object') m.hats = {};
    if (!Array.isArray(m.outfits)) m.outfits = [null, null];
    if (!Array.isArray(m.endlessBest)) m.endlessBest = [0, 0];
    if (!m.achStats || typeof m.achStats !== 'object') m.achStats = {};
    if (!m.achStats.best || typeof m.achStats.best !== 'object') m.achStats.best = {};
    if (!m.stats.worldSet) m.stats.worldSet = {};
    return m;
  }
  const lvOf = (tal, id) => Math.max(0, (tal && tal[id]) | 0);

  /* ---------------- 小图标（12×12 像素） ---------------- */
  const memo = {};
  const mem = (k, f) => memo[k] || (memo[k] = f());
  function gridPC(rows, pal, w, h) {
    const p = new S.PC(w || rows[0].length + 2, h || rows.length + 2);
    p.grid(rows, pal, 1, 1);
    return p;
  }
  const ICON_ART = {
    trophy: [
      ['.yyyyyyyyyy.', 'y.ywyyyyyy.y', 'y.ywyyyyyy.y', '.yywyyyyyyy.', '..yyyyyyyy..', '...yyyyyy...', '.....yy.....', '.....YY.....', '...bbbbbb...', '...bBBBBb...', '...bbbbbb...'],
      { y: '#ffd23f', w: '#fff4b0', Y: '#e0951f', b: '#8a5a35', B: '#b07a45' },
    ],
    flag: [
      ['.b..........', '.brrrrrrr...', '.brrRrrrrr..', '.brrrrrrr...', '.brrrrrr....', '.b..........', '.b..........', '.b..........', '.b..........', 'gggg........'],
      { b: '#8a5a35', r: '#ff5a4f', R: '#ffd23f', g: '#5aa83c' },
    ],
    boot: [
      ['...bbbbb....', '...bBBBb....', '...bbbbb....', '...bbbbb....', '...bbbbb....', '...bbbbbb...', '..bbbbbbbbb.', '..bbbbbbbbbb', '..kkkkkkkkkk'],
      { b: '#b07a45', B: '#d9a066', k: '#5b3a24' },
    ],
    bolt: [
      ['.......yy...', '......yy....', '.....yy.....', '....yy......', '...yyyyyy...', '......yy....', '.....yy.....', '....yy......', '...yy.......', '...y........'],
      { y: '#ffe36b' },
    ],
    fish: [
      ['............', '...bbbb.....', '..bbbbbb..b.', '.bbwkbbbbbb.', '.bbbbbbbbbb.', '..BBBBBB..B.', '...BBBB.....'],
      { b: '#4f9dff', B: '#2a63b8', w: '#ffffff', k: '#1c1424' },
    ],
    rainbow: [
      ['............', '...rroo.....', '..rrooyy..g.', '.rrwkyyggbb.', '.rrooyyggbb.', '..rrooyy..b.', '...rroo.....'],
      { r: '#ff5a4f', o: '#ff9a2a', y: '#ffe36b', g: '#5bd16a', b: '#4f9dff', w: '#ffffff', k: '#1c1424' },
    ],
    star: [
      ['.....y......', '.....y......', '....yyy.....', 'yyyyywyyyyy.', '.yyyywyyyy..', '..yyyyyyy...', '..yyyyyyy...', '.yyy...yyy..', '.y.......y..'],
      { y: '#ffd23f', w: '#fff4b0' },
    ],
    fire: [
      ['.....r......', '....rr......', '....rrr..r..', '...rrorr.r..', '..rrooorrr..', '..rroyyorr..', '.rrooyyoorr.', '.rroyyyyorr.', '..rroyyorr..', '...rrrrrr...'],
      { r: '#ff5a4f', o: '#ff9a2a', y: '#ffe36b' },
    ],
    pot: [
      ['...w...w....', '....w...w...', '...w...w....', '............', 'mmmmmmmmmmmm', 'kMMMMMMMMMMk', '.MMMMMMMMMM.', '.MMMMMMMMMM.', '.MMMMMMMMMM.', '..MMMMMMMM..'],
      { w: '#ffffff', m: '#c9d4e3', M: '#6b7488', k: '#3a3f4c' },
    ],
    book: [
      ['..bbbbbbbb..', '.dbbbbbbbbb.', '.dbbbyybbbb.', '.dbbyyyybbb.', '.dbbbyybbbb.', '.dbbbbbbbbb.', '.dbbbbbbbbb.', '.dbbbbbbbbb.', '.dwwwwwwwww.', '..dddddddd..'],
      { b: '#4f9dff', d: '#2a63b8', y: '#ffd23f', w: '#fff7e6' },
    ],
    ankh: [
      ['....yyy.....', '...y...y....', '...y...y....', '....y.y.....', '.yyyyyyyyy..', '.....y......', '.....y......', '.....y......', '.....y......', '....yyy.....'],
      { y: '#ffd23f' },
    ],
    bag: [
      ['....kkkk....', '.....bb.....', '....rrrr....', '...bbbbbb...', '..bbbbbbbb..', '.bbbBbbbbbb.', '.bbBBbbbbbb.', '.bbbbbbbbbb.', '..bbbbbbbb..', '...bbbbbb...'],
      { b: '#c98a4b', B: '#e8b77a', r: '#d8342c', k: '#8a5a35' },
    ],
    eye: [
      ['............', '...wwwwww...', '.wwwwbbwwww.', 'wwwwbbkbwwww', 'wwwwbkkbwwww', '.wwwwbbwwww.', '...wwwwww...'],
      { w: '#ffffff', b: '#4fd18b', k: '#1c1424' },
    ],
    paw: [
      ['..pp....pp..', '..pp....pp..', 'pp........pp', 'pp...pp...pp', '....pppp....', '...pppppp...', '...pppppp...', '....pppp....'],
      { p: '#ff8fb8' },
    ],
    ghost: [
      ['...vvvvvv...', '..vvvvvvvv..', '.vvvvvvvvvv.', '.vvkvvvvkvv.', '.vvkvvvvkvv.', '.vvvvvvvvvv.', '.vvvvvvvvvv.', '.vvvvvvvvvv.', '.vv.vvv.vvv.', '.v...v...v..'],
      { v: '#c9b8ff', k: '#3a2a6a' },
    ],
    tower: [
      ['.s.s.s.s.s..', '.ssssssssss.', '..mmmmmmmm..', '..mmmkkmmm..', '..mmmkkmmm..', '..mmmmmmmm..', '..mmmmmmmm..', '..mmmbbmmm..', '..mmmbbmmm..', '.MMMMMMMMMM.'],
      { s: '#c9d4e3', m: '#9aa6b8', M: '#6b7488', k: '#1c1424', b: '#8a5a35' },
    ],
  };
  function drawIconKey(k) {
    if (ICON_ART[k]) {
      const p = gridPC(ICON_ART[k][0], ICON_ART[k][1], 14, 14);
      p.outline(OUT);
      return p.c;
    }
    const p = new S.PC(14, 14);
    switch (k) {
      case 'moon':
        p.circ(7, 7, 5.5, '#ffe36b');
        p.x.globalCompositeOperation = 'destination-out';
        p.circ(9.6, 5.4, 4.6, '#000');
        p.x.globalCompositeOperation = 'source-over';
        p.p(10, 9, '#fff4b0');
        p.p(12, 3, '#fff4b0');
        break;
      case 'fog':
        p.circ(5, 8, 3, '#e8eef5');
        p.circ(8.5, 6, 3.6, '#e8eef5');
        p.circ(10.5, 8.5, 2.4, '#e8eef5');
        p.r(3, 8, 9, 3, '#e8eef5');
        p.r(3, 10, 9, 1, '#c4d4e3');
        p.p(7, 4, '#ffffff');
        break;
      case 'clock':
        p.circ(7, 7.5, 5.5, '#fff7e6');
        p.r(7, 4, 1, 4, OUT);
        p.r(7, 7, 3, 1, OUT);
        p.r(6, 1, 3, 1, '#ff5a4f');
        break;
      case 'sun':
        p.circ(7, 7, 3.4, '#ffd23f');
        p.circ(6.4, 6.4, 1.4, '#fff4b0');
        for (const [x, y] of [[7, 1], [7, 12], [1, 7], [12, 7], [3, 3], [11, 3], [3, 11], [11, 11]]) p.p(x, y, '#ffb238');
        break;
      default:
        p.circ(7, 7, 5, '#ffd23f');
    }
    p.outline(OUT);
    return p.c;
  }
  function iconCanvas(k) {
    if (/^res\d$/.test(k)) return S.icon(+k.slice(3));
    switch (k) {
      case 'heart': return S.icon(4);
      case 'sprite': return S.worker('idle0');
      case 'skull': return S.icon(6);
      case 'tile': return S.icon(7);
      case 'sword': return S.tool('sword');
      case 'hammer': return S.tool('hammer');
      case 'camp': return S.building('camp');
      case 'chest': return S.chest(false);
      case 'boat': return S.raft(true);
      case 'portal': return S.portal('#b17cff', 0);
      case 'crown': case 'pumpkin': case 'astro': case 'grad': return hatCanvas(k);
    }
    return mem('ic_' + k, () => drawIconKey(k));
  }
  function iconImg(k, cls) {
    const c = iconCanvas(k);
    const sc = c.width > 30 ? 1 : c.width > 18 ? 2 : 3;
    return `<img class="pix ${cls || ''}" src="${S.spriteURL(c, sc)}" alt="">`;
  }
  const GEM = '<i class="mcg"></i>';

  /* ---------------- 帽子 ----------------
     帽子画布宽 18（比人物窄 4，居中），四周留 1 像素描边。
     图案最后一行对应人物精灵的第 7 + low 行（头顶是第 5 行），low 可以为负（戴得更靠上）。 */
  const HATS = [
    {
      id: 'straw', name: '草帽', ach: 'first', cost: 15,
      art: ['....YyyyyyyY....', '...yyyyyyyyyy...', '...rrrrrrrrrr...', '..yyyyyyyyyyyy..', 'yyyyyyyyyyyyyyyy', '.YYYYYYYYYYYYYY.'],
      pal: { y: '#f2d16b', Y: '#d1a640', r: '#d8342c' },
    },
    {
      id: 'pirate', name: '海盗帽', ach: 'kills100', cost: 30,
      art: ['..k..........k..', '..kk.kkkkkk.kk..', '..kkkkkkkkkkkk..', '.kkkkkwwwwkkkkk.', '.kkkkkwkkwkkkkk.', 'kkkkkkwwwwkkkkkk', 'gggggggggggggggg'],
      pal: { k: '#22202a', w: '#f2f2f2', g: '#ffd23f' },
    },
    {
      id: 'wreath', name: '花环', ach: 'hire20', cost: 25, low: -1,
      art: ['...p..y..f..p...', '..gpgggyggfgpg..', '..ggfggggpgggg..'],
      pal: { g: '#43a85a', p: '#ff8fb8', y: '#ffe36b', f: '#ffffff' },
    },
    {
      id: 'bunny', name: '兔耳', ach: 'pet', cost: 30, low: -2,
      art: ['...www....www...', '..wwpw....wpww..', '..wwpw....wpww..', '..wwpw....wpww..', '...wpw....wpw...', '...ww......ww...', '..ssssssssssss..'],
      pal: { w: '#ffffff', p: '#ffb0c8', s: '#ff8fb8' },
    },
    {
      id: 'chef', name: '厨师帽', ach: 'cook', cost: 30, low: -1,
      art: ['....wwwwwwww....', '...wwwwwwwwwW...', '..wwwwwwwwwwwW..', '..wwWwwwwwWwwW..', '...wwwwwwwwwW...', '...WwwwwwwwwW...', '..wwwwwwwwwwww..', '..WWWWWWWWWWWW..'],
      pal: { w: '#ffffff', W: '#d9dce3' },
    },
    {
      id: 'grad', name: '学士帽', ach: 'puzzle', cost: 40,
      art: ['.....kkkkkk.....', '..kkkkkkkkkkkk..', 'kkkkkkkkkkkkkkkk', '..KKkkkkkkkkKKy.', '...kkkkkkkkkk.y.', '...kkkkkkkkkk.y.', '..............Y.'],
      pal: { k: '#2b2a33', K: '#45434f', y: '#ffd23f', Y: '#e0951f' },
    },
    {
      id: 'santa', name: '圣诞帽', ach: 'runs10', cost: 40,
      art: ['.ww.............', '.wwr............', '...rrr..........', '....rrrrr.......', '....rrrrrrr.....', '...rrrrrrrrrr...', '..wwwwwwwwwwww..', '..WwwwwwwwwwwW..'],
      pal: { r: '#d8342c', w: '#ffffff', W: '#d9dce3' },
    },
    {
      id: 'viking', name: '维京角盔', ach: 'boss', cost: 50,
      art: ['.h............h.', '.hh..........hh.', '..hh.mmmmmm.hh..', '...hmmmmmmmmh...', '..mmmmmMMmmmmm..', '..MMMMMMMMMMMM..'],
      pal: { h: '#f6e7c8', m: '#9aa6b8', M: '#6b7488' },
    },
    {
      id: 'pumpkin', name: '南瓜头', ach: 'e15', cost: 50, low: 7,
      art: [
        '.......gg.......', '......gg........', '..oooOooooOooo..', '.ooooOooooOoooo.', '.ooooOooooOoooo.', '.oooOoookkookko.',
        '.oooOooookoooko.', '.oooOoooooOoooo.', '.oooOookkkkkkoo.', '.oooOoookokkooo.', '..oooooooooooo..', '...oooooooooo...',
      ],
      pal: { g: '#4f9a3f', o: '#ff9a2a', O: '#e0701b', k: '#ffe36b' },
    },
    {
      id: 'astro', name: '宇航头盔', ach: 'worlds', cost: 80, low: 9,
      draw() {
        const p = new S.PC(18, 18);
        p.circ(9, 10, 7.5, '#e8eef5');
        p.x.globalCompositeOperation = 'destination-out';
        p.circ(9, 10, 6.5, '#000');
        p.x.globalCompositeOperation = 'source-over';
        p.circ(9, 10, 6.5, 'rgba(150,215,255,0.3)');
        p.r(5, 5, 2, 1, 'rgba(255,255,255,0.9)');
        p.p(4, 6, 'rgba(255,255,255,0.9)');
        p.p(4, 7, 'rgba(255,255,255,0.7)');
        p.r(3, 15, 12, 3, '#c9d4e3');
        p.r(3, 15, 12, 1, '#9fb0c8');
        p.r(6, 16, 2, 1, '#ff5a4f');
        p.r(12, 0, 1, 3, '#9fb0c8');
        p.p(12, 0, '#ff5a4f');
        p.outline(OUT);
        return p.c;
      },
    },
    {
      id: 'crown', name: '王冠', ach: 'end2', cost: 120, low: -1,
      art: ['..y....yy....y..', '..yy..yyyy..yy..', '..yyyyyyyyyyyy..', '..yRyyyBByyyRy..', '..yyyyyyyyyyyy..', '..YYYYYYYYYYYY..'],
      pal: { y: '#ffd23f', Y: '#e0951f', R: '#ff5a4f', B: '#4f9dff' },
    },
  ];
  const HAT = {};
  for (const h of HATS) HAT[h.id] = h;
  function hatCanvas(id) {
    return mem('hat_' + id, () => {
      const h = HAT[id];
      if (h.draw) return h.draw();
      const p = gridPC(h.art, h.pal, 18, h.art.length + 2);
      p.outline(OUT);
      return p.c;
    });
  }
  function hatOwned(id, m) {
    m = m || meta();
    const h = HAT[id];
    return !!h && (!!m.hats[id] || (h.ach && !!m.ach[h.ach]));
  }
  /* 选角页的预览：人物 + 帽子 */
  function previewCanvas(skin, hatId) {
    return mem('pv' + skin + '_' + (hatId || ''), () => {
      const TOP = 5;
      const p = new S.PC(22, 28 + TOP);
      p.x.drawImage(S.human(skin, 'idle0'), 0, TOP);
      if (hatId && HAT[hatId]) {
        const hc = hatCanvas(hatId);
        p.x.drawImage(hc, 2, TOP + 9 + (HAT[hatId].low || 0) - hc.height);
      }
      return p.c;
    });
  }

  /* ---------------- 成就 ----------------
     val(x) 返回当前进度，x = { m: 长期存档, c: 成就统计, g: 当前这局（可能为空）, R: 本局记录, end: 结算信息 }
     run: true 表示单局成就（记录历史最佳进度） */
  const CATS = ['累计', '挑战', '玩法', '无尽'];
  const cs = (k) => (x) => x.c[k] || 0;
  const ms = (k) => (x) => x.m.stats[k] || 0;
  const ACH = [
    // 累计
    { id: 'first', cat: 0, name: '初来乍到', desc: '完成第一次探险（结算一次）', max: 1, rw: 5, icon: 'flag', val: (x) => x.m.runs || 0 },
    { id: 'runs10', cat: 0, name: '老练探险家', desc: '完成 10 次探险', max: 10, rw: 20, icon: 'boot', val: (x) => x.m.runs || 0 },
    { id: 'wood', cat: 0, name: '伐木工', desc: '累计收集木材 1000', max: 1000, rw: 10, icon: 'res0', val: ms('wood') },
    { id: 'rice', cat: 0, name: '丰收农夫', desc: '累计收集水稻 600', max: 600, rw: 10, icon: 'res1', val: ms('rice') },
    { id: 'crystal', cat: 0, name: '矿工', desc: '累计收集紫水晶 300', max: 300, rw: 10, icon: 'res2', val: ms('crystal') },
    { id: 'kills100', cat: 0, name: '海盗克星', desc: '累计击退敌人 100 个', max: 100, rw: 15, icon: 'skull', val: ms('kills') },
    { id: 'kills500', cat: 0, name: '海上传说', desc: '累计击退敌人 500 个', max: 500, rw: 30, icon: 'sword', val: ms('kills') },
    { id: 'tiles100', cat: 0, name: '驱雾者', desc: '累计驱散迷雾 100 块', max: 100, rw: 15, icon: 'fog', val: cs('tiles') },
    { id: 'hire20', cat: 0, name: '精灵之友', desc: '累计召唤小精灵 20 只', max: 20, rw: 10, icon: 'sprite', val: cs('hire') },
    { id: 'build15', cat: 0, name: '建筑师', desc: '累计建成 15 座建筑', max: 15, rw: 10, icon: 'hammer', val: cs('build') },
    { id: 'nights30', cat: 0, name: '夜行者', desc: '累计度过 30 个夜晚', max: 30, rw: 15, icon: 'moon', val: cs('nights') },
    // 挑战（结局 + 单局）
    { id: 'end0', cat: 1, name: '新大陆', desc: '达成结局一：登上新大陆', max: 1, rw: 15, icon: 'boat', val: (x) => (x.m.endings[0] ? 1 : 0) },
    { id: 'end1', cat: 1, name: '迷雾之子', desc: '达成结局二：通关全部异世界后登陆', max: 1, rw: 25, icon: 'portal', val: (x) => (x.m.endings[1] ? 1 : 0) },
    { id: 'end2', cat: 1, name: '迷雾之王', desc: '达成结局三：驱散全部迷雾后登陆', max: 1, rw: 40, icon: 'crown', val: (x) => (x.m.endings[2] ? 1 : 0) },
    { id: 'worlds', cat: 1, name: '异界旅人', desc: '通关全部 4 个异世界', max: 4, rw: 20, icon: 'astro', val: (x) => Object.keys(x.m.stats.worldSet || {}).length },
    { id: 'speed', cat: 1, name: '速通达人', desc: '30 分钟内登上新大陆', max: 1, rw: 30, icon: 'clock', run: true, val: (x) => (x.end && x.end.win && !x.g.endless && x.g.st.elapsed < 1800 ? 1 : 0) },
    { id: 'night10', cat: 1, name: '熬夜冠军', desc: '单局撑过 10 个夜晚', max: 10, rw: 15, icon: 'moon', run: true, val: (x) => x.g.st.day },
    { id: 'iron', cat: 1, name: '固若金汤', desc: '单局撑过 3 个夜晚，营地一次都没被打', max: 1, rw: 15, icon: 'camp', run: true, val: (x) => (!x.R.campHurt && x.g.st.day >= 3 ? 1 : 0) },
    { id: 'clean', cat: 1, name: '毫发无伤', desc: '一个夜里击退至少 5 个敌人，自己没受一点伤', max: 1, rw: 15, icon: 'heart', run: true, val: (x) => (x.R.clean ? 1 : 0) },
    { id: 'rich', cat: 1, name: '小富翁', desc: '单局同时攒下 300 金币', max: 300, rw: 10, icon: 'res3', run: true, val: (x) => x.g.st.res[3] },
    { id: 'full', cat: 1, name: '精灵满营', desc: '单局拥有 6 只小精灵', max: 6, rw: 10, icon: 'sprite', run: true, val: (x) => x.g.workers.filter((w) => !w.dead).length },
    { id: 'slayer', cat: 1, name: '百战勇士', desc: '单局击退 60 个敌人', max: 60, rw: 15, icon: 'sword', run: true, val: (x) => x.g.st.kills },
    { id: 'tiles30', cat: 1, name: '拓荒者', desc: '单局驱散 30 块迷雾', max: 30, rw: 15, icon: 'tile', run: true, val: (x) => x.g.world.unlockedCount() - (x.R.t0 || 5) },
    { id: 'tilesAll', cat: 1, name: '云开雾散', desc: '单局驱散岛上全部迷雾（76 块）', max: 76, rw: 30, icon: 'sun', run: true, val: (x) => x.g.world.unlockedCount() - 5 },
    // 玩法
    { id: 'boss', cat: 2, name: '首领克星', desc: '击败一名海盗首领', max: 1, rw: 20, icon: 'skull', val: cs('boss') },
    { id: 'fogmon', cat: 2, name: '雾中猎手', desc: '累计击败雾怪 20 只', max: 20, rw: 15, icon: 'ghost', val: cs('fogmon') },
    { id: 'defense', cat: 2, name: '防御专家', desc: '累计建造防御塔 / 陷阱 10 座', max: 10, rw: 10, icon: 'tower', val: (x) => (x.c.tower || 0) + (x.c.trap || 0) },
    { id: 'skill', cat: 2, name: '身手不凡', desc: '累计使用技能 50 次', max: 50, rw: 10, icon: 'bolt', val: cs('skill') },
    { id: 'fish', cat: 2, name: '钓鱼佬', desc: '累计钓到 20 条鱼', max: 20, rw: 10, icon: 'fish', val: cs('fish') },
    { id: 'rareFish', cat: 2, name: '彩虹奇遇', desc: '钓到一条彩虹鱼', max: 1, rw: 15, icon: 'rainbow', val: cs('rareFish') },
    { id: 'pet', cat: 2, name: '毛茸茸伙伴', desc: '驯服或领养一只宠物', max: 1, rw: 10, icon: 'paw', val: cs('pet') },
    { id: 'cook', cat: 2, name: '小厨神', desc: '累计做 10 份料理', max: 10, rw: 10, icon: 'pot', val: cs('cook') },
    { id: 'treasure', cat: 2, name: '寻宝猎人', desc: '累计挖到 5 个宝藏', max: 5, rw: 10, icon: 'chest', val: cs('treasure') },
    { id: 'puzzle', cat: 2, name: '遗迹学者', desc: '累计解开 3 个遗迹谜题', max: 3, rw: 15, icon: 'book', val: cs('puzzle') },
    { id: 'landmark', cat: 2, name: '奇观收藏家', desc: '累计激活 8 个特殊地块', max: 8, rw: 10, icon: 'star', val: cs('landmark') },
    { id: 'event', cat: 2, name: '见多识广', desc: '累计遇到 15 次随机事件', max: 15, rw: 10, icon: 'fire', val: cs('event') },
    { id: 'merchant', cat: 2, name: '老主顾', desc: '在商船上买 5 次东西', max: 5, rw: 10, icon: 'res3', val: cs('merchant') },
    // 无尽
    { id: 'e5', cat: 3, name: '守夜人', desc: '无尽守夜撑过 5 夜', max: 5, rw: 10, icon: 'moon', val: endlessVal },
    { id: 'e15', cat: 3, name: '不眠之夜', desc: '无尽守夜撑过 15 夜', max: 15, rw: 25, icon: 'pumpkin', val: endlessVal },
    { id: 'e25', cat: 3, name: '黎明使者', desc: '无尽守夜撑过 25 夜', max: 25, rw: 40, icon: 'sun', val: endlessVal },
  ];
  function endlessVal(x) {
    const eb = x.m.endlessBest || [0, 0];
    return Math.max(eb[0] || 0, eb[1] || 0, x.g && x.g.endless ? x.g.st.day : 0);
  }
  const ACH_BY = {};
  for (const a of ACH) ACH_BY[a.id] = a;
  for (const h of HATS) if (h.ach && ACH_BY[h.ach]) ACH_BY[h.ach].hat = h.id;

  function ctxOf(g, end) {
    const m = meta();
    return { m, c: m.achStats, g: g || null, R: (g && g.sys && g.sys.meta) || {}, end: end || null };
  }
  function valOf(a, x) {
    if (a.run && !x.g) return 0;
    try {
      const v = +a.val(x);
      return isFinite(v) ? v : 0;
    } catch (e) {
      return 0;
    }
  }
  /* 检查全部成就，返回新达成的列表 */
  function checkAll(g, end) {
    if (!g || g.debug || g.dead) return [];
    const x = ctxOf(g, end);
    const m = x.m;
    const got = [];
    for (const a of ACH) {
      const v = valOf(a, x);
      if (a.run && v > (m.achStats.best[a.id] || 0)) m.achStats.best[a.id] = Math.min(v, a.max);
      if (m.ach[a.id] || v < a.max) continue;
      m.ach[a.id] = Date.now();
      m.crystals += a.rw;
      m.achStats.achCr = (m.achStats.achCr || 0) + a.rw;
      got.push(a);
    }
    if (got.length) PF.Save.saveMeta();
    return got;
  }
  /* 对话框里显示的进度 */
  function shownProgress(a, x) {
    if (x.m.ach[a.id]) return a.max;
    let v = a.run ? x.m.achStats.best[a.id] || 0 : valOf(a, x);
    if (a.run && x.g && !x.g.debug) v = Math.max(v, valOf(a, x));
    return U.clamp(Math.floor(v), 0, a.max);
  }

  /* ---------------- 顶部庆祝横幅 ---------------- */
  const POP = { q: [], el: null, t: 0, gap: 0 };
  function popClear() {
    if (POP.el) POP.el.remove();
    POP.el = null;
    POP.q = [];
    POP.t = 0;
    POP.gap = 0;
    const host = document.getElementById('extHud');
    if (host) host.querySelectorAll('.ach-pop').forEach((e) => e.remove());
  }
  function popShow(g, a) {
    const host = document.getElementById('extHud');
    if (!host) return;
    const el = document.createElement('div');
    el.className = 'ach-pop';
    const hat = a.hat ? `<div class="ap-hat">${`<img class="pix" src="${S.spriteURL(hatCanvas(a.hat), 2)}" alt="">`}解锁帽子：${HAT[a.hat].name}</div>` : '';
    el.innerHTML = `<div class="ap-ic">${iconImg('trophy')}</div>
      <div class="ap-mid"><div class="ap-k">成就达成！</div><div class="ap-n">${a.name}</div><div class="ap-d">${a.desc}</div>${hat}</div>
      <div class="ap-cr">+${a.rw}${GEM}</div>`;
    host.appendChild(el);
    POP.el = el;
    POP.t = 0;
    A.play('success');
    const p = g.players.find((q) => !q.down) || g.players[0];
    if (p) g.fx.sparkle(p.x, p.y - 110, '#ffe36b');
  }
  function popPump(g, dt) {
    if (POP.el) {
      POP.t += dt;
      if (POP.t > 3.2) {
        const el = POP.el;
        el.classList.add('out');
        setTimeout(() => el.remove(), 450);
        POP.el = null;
        POP.gap = 0.5;
      }
      return;
    }
    if (POP.gap > 0) {
      POP.gap -= dt;
      return;
    }
    if (POP.q.length && !PF.UI.modal) popShow(g, POP.q.shift());
  }

  /* ---------------- 天赋 ---------------- */
  const TAL = [
    { id: 'pack', name: '丰厚行囊', icon: 'bag', cost: [10, 25, 50], fx: (l) => `开局多带木材 +${20 * l}、水稻 +${10 * l}、金币 +${10 * l}` },
    { id: 'swift', name: '健步如飞', icon: 'boot', cost: [10, 25, 50], fx: (l) => `移动速度 +${5 * l}%` },
    { id: 'tough', name: '强健体魄', icon: 'heart', cost: [10, 25, 50], fx: (l) => `血量上限 +${20 * l}` },
    { id: 'blade', name: '锋利刀刃', icon: 'sword', cost: [15, 30, 60], fx: (l) => `攻击力 +${2 * l}` },
    { id: 'sprite', name: '勤劳精灵', icon: 'sprite', cost: [10, 25, 50], fx: (l) => `小精灵移动速度 +${8 * l}%` },
    { id: 'camp', name: '坚固营地', icon: 'camp', cost: [10, 25, 50], fx: (l) => `营地血量上限 +${60 * l}` },
    { id: 'harvest', name: '丰收', icon: 'res1', cost: [15, 30, 60], fx: (l) => `亲手采集时有 ${8 * l}% 几率多得 1 个` },
    { id: 'fog', name: '迷雾亲和', icon: 'fog', cost: [15, 30, 60], fx: (l) => `驱散迷雾的费用 -${6 * l}%` },
    { id: 'revive', name: '第二条命', icon: 'ankh', cost: [60], fx: (l) => `每局多 ${l} 次免费复活` },
    { id: 'night', name: '夜视', icon: 'eye', cost: [15, 35], fx: (l) => `夜晚的黑暗程度 -${15 * l}%` },
    { id: 'merchant', name: '商人之友', icon: 'res3', cost: [10, 25, 50], fx: (l) => `击退敌人掉落的金币 +${10 * l}%` },
  ];
  const spentOn = (t, lv) => t.cost.slice(0, lv).reduce((s, v) => s + v, 0);

  PF.Hooks.openTalents = function (onClose) {
    let confirmReset = false;
    const render = () => {
      const m = meta();
      let spent = 0;
      let rows = '';
      for (const t of TAL) {
        const lv = Math.min(t.cost.length, lvOf(m.talents, t.id));
        spent += spentOn(t, lv);
        const max = t.cost.length;
        const pips = '<span class="tal-pips">' + Array.from({ length: max }, (_, i) => `<i class="${i < lv ? 'on' : ''}"></i>`).join('') + '</span>';
        const cur = lv ? t.fx(lv) : '尚未学习';
        const nx = lv < max ? `<div class="tal-nx">下一级：${t.fx(lv + 1)}</div>` : '';
        const btn =
          lv >= max
            ? '<span class="maxed">满级</span>'
            : `<button class="btn sm ${m.crystals >= t.cost[lv] ? 'green' : 'gray'}" data-act="up:${t.id}">${t.cost[lv]}${GEM}</button>`;
        rows += `<div class="row tal ${lv ? 'has' : ''}"><div class="ic">${iconImg(t.icon)}</div><div class="mid"><div class="t">${t.name}${pips}</div><div class="d">${cur}</div>${nx}</div>${btn}</div>`;
      }
      return `<div class="dh"><span>天赋</span><button class="x" data-act="close">✕</button></div>
        <div class="meta-bal"><span>迷雾结晶</span><b>${m.crystals}</b>${GEM}<em>每局结算都会获得结晶 · 天赋在下一局开局时生效</em></div>
        <div class="scroll">${rows}</div>
        <div class="btns">${spent ? `<button class="btn sm ${confirmReset ? 'red' : 'gray2'}" data-act="reset">${confirmReset ? '确定重置？再点一次' : '重置天赋（返还 ' + spent + ' 结晶）'}</button>` : ''}<button class="btn sm" data-act="close">完成</button></div>`;
    };
    PF.UI.open(
      render(),
      'w-md meta-dlg',
      (act) => {
        const m = meta();
        if (act === 'close') {
          PF.UI.close();
          if (onClose) onClose();
          return;
        }
        if (act === 'reset') {
          if (!confirmReset) {
            confirmReset = true;
          } else {
            let back = 0;
            for (const t of TAL) back += spentOn(t, Math.min(t.cost.length, lvOf(m.talents, t.id)));
            m.talents = {};
            m.crystals += back;
            PF.Save.saveMeta();
            confirmReset = false;
            PF.UI.toast('天赋已重置，返还 ' + back + ' 迷雾结晶');
          }
          PF.UI.refreshDialog();
          return;
        }
        if (act.startsWith('up:')) {
          confirmReset = false;
          const t = TAL.find((q) => q.id === act.slice(3));
          if (!t) return;
          const lv = lvOf(m.talents, t.id);
          if (lv >= t.cost.length) return;
          const cost = t.cost[lv];
          if (m.crystals < cost) {
            A.play('wrong');
            PF.UI.toast('迷雾结晶不够：还差 ' + (cost - m.crystals) + '，每局结算都会获得结晶');
            return;
          }
          m.crystals -= cost;
          m.talents[t.id] = lv + 1;
          PF.Save.saveMeta();
          A.play('success');
          PF.UI.refreshDialog();
        }
      },
      { refresh: render }
    );
  };

  /* ---------------- 成就列表 ---------------- */
  PF.Hooks.openAchievements = function (onClose) {
    let tab = -1;
    const render = () => {
      const x = ctxOf(PF.UI.game, null);
      const m = x.m;
      const done = ACH.filter((a) => m.ach[a.id]).length;
      const tabs = [-1, 0, 1, 2, 3]
        .map((k) => {
          const list = k < 0 ? ACH : ACH.filter((a) => a.cat === k);
          const n = list.filter((a) => m.ach[a.id]).length;
          return `<button class="ach-tab ${tab === k ? 'on' : ''}" data-act="tab:${k}">${k < 0 ? '全部' : CATS[k]}<small>${n}/${list.length}</small></button>`;
        })
        .join('');
      const list = (tab < 0 ? ACH : ACH.filter((a) => a.cat === tab)).slice();
      // 已达成的排在后面，快完成的排在前面
      const info = list.map((a) => ({ a, v: shownProgress(a, x), ok: !!m.ach[a.id] }));
      info.sort((p, q) => p.ok - q.ok || q.v / q.a.max - p.v / p.a.max);
      const rows = info
        .map(({ a, v, ok }) => {
          const pct = Math.round((v / a.max) * 100);
          const hat = a.hat ? `<span class="ach-hat"><img class="pix" src="${S.spriteURL(hatCanvas(a.hat), 2)}" alt="">${HAT[a.hat].name}</span>` : '';
          const num = a.max > 1 ? `${v}/${a.max}` : ok ? '已达成' : '未达成';
          return `<div class="row ach ${ok ? 'done' : 'lock'}"><div class="ic">${iconImg(a.icon)}</div>
            <div class="mid"><div class="t">${a.name}${a.run ? '<span class="ach-tag">单局</span>' : ''}</div><div class="d">${a.desc}</div>
            <div class="ach-bar"><i style="width:${pct}%"></i><span>${num}</span></div></div>
            <div class="ach-rw">${ok ? '<b class="ok">✓</b>' : ''}<span>+${a.rw}${GEM}</span>${hat}</div></div>`;
        })
        .join('');
      return `<div class="dh"><span>成就</span><button class="x" data-act="close">✕</button></div>
        <div class="meta-bal"><span>已达成</span><b>${done}/${ACH.length}</b><span class="sep">成就奖励</span><b>${m.achStats.achCr || 0}</b>${GEM}<span class="sep">现有</span><b>${m.crystals}</b>${GEM}</div>
        <div class="ach-tabs">${tabs}</div>
        <div class="scroll">${rows}</div>
        <div class="btns"><button class="btn sm" data-act="close">返回</button></div>`;
    };
    PF.UI.open(
      render(),
      'w-md meta-dlg',
      (act, btn, wrap) => {
        if (act === 'close') {
          PF.UI.close();
          if (onClose) onClose();
        } else if (act.startsWith('tab:')) {
          tab = +act.slice(4);
          PF.UI.refreshDialog();
          const sc = wrap.querySelector('.scroll');
          if (sc) sc.scrollTop = 0;
        }
      },
      { refresh: render }
    );
  };

  /* ---------------- 帽子：游戏内绘制 ---------------- */
  PF.Hooks.playerDecor = function (ctx, p, frame) {
    if (p.down) return;
    const m = PF.Save.meta;
    const id = m.outfits && m.outfits[p.idx];
    if (!id || !HAT[id]) return;
    const bob = frame === 'idle1' || frame === 'walk1' || frame === 'walk3' ? 1 : 0;
    // 人物精灵底边在 y+4、高 28 美术像素；帽子底边对应精灵的第 9+low 行
    E.drawSprite(ctx, hatCanvas(id), p.x, p.y - 72 + PX * ((HAT[id].low || 0) + bob), { flip: p.face < 0 });
  };

  /* ---------------- 帽子：选角页 ---------------- */
  let hatFocus = null;
  PF.Hooks.renderRoleExtra = function (el, o) {
    if (!el) return;
    const m = meta();
    const slot = o && o.pickStep ? 1 : 0;
    let cur = m.outfits[slot];
    if (cur && !hatOwned(cur, m)) cur = null;
    const owned = HATS.filter((h) => hatOwned(h.id, m)).length;
    const thumbs = HATS.map((h) => {
      const own = hatOwned(h.id, m);
      return `<button class="hb ${cur === h.id ? 'on' : ''} ${own ? '' : 'lock'} ${hatFocus === h.id ? 'focus' : ''}" data-hat="${h.id}" title="${h.name}"><img class="pix" src="${S.spriteURL(hatCanvas(h.id), 2)}" alt="${h.name}"></button>`;
    }).join('');
    let tip;
    const f = hatFocus && HAT[hatFocus];
    if (f && !hatOwned(f.id, m)) {
      const a = ACH_BY[f.ach];
      tip = `<b>${f.name}</b>：达成成就「${a ? a.name : '？'}」解锁，或 <button class="btn sm ${m.crystals >= f.cost ? 'green' : 'gray'}" data-buy="${f.id}">${f.cost}${GEM} 购买</button>`;
    } else {
      tip = `${o && o.twoP ? (slot ? '2P' : '1P') + ' 的' : ''}帽子：<b>${cur ? HAT[cur].name : '不戴'}</b> · 已拥有 ${owned}/${HATS.length} · 结晶 ${m.crystals}${GEM}`;
    }
    const lockedRole = !(m.unlocked && m.unlocked[o ? o.sel : 0]);
    el.innerHTML = `<div class="hatbox">
      <div class="hb-prev ${lockedRole ? 'locked' : ''}"><img class="pix" src="${S.spriteURL(previewCanvas(o ? o.sel : 0, cur), 2)}" alt=""></div>
      <div class="hb-grid"><button class="hb none ${cur ? '' : 'on'}" data-hat="" title="不戴帽子">✕</button>${thumbs}</div>
      <div class="hb-tip">${tip}</div></div>`;
    const sel = el.querySelector('.hb-grid .hb.focus') || el.querySelector('.hb-grid .hb.on');
    const gridEl = el.querySelector('.hb-grid');
    // 横屏时帽子是一行可滑动的列表：把当前选中的滚到可见处
    if (sel && gridEl && gridEl.scrollWidth > gridEl.clientWidth + 2) gridEl.scrollLeft = Math.max(0, sel.offsetLeft - gridEl.offsetLeft - gridEl.clientWidth / 2 + sel.offsetWidth / 2);
    el.onclick = (e) => {
      const buy = e.target.closest('[data-buy]');
      if (buy) {
        const h = HAT[buy.dataset.buy];
        if (!h) return;
        if (m.crystals < h.cost) {
          A.play('wrong');
          PF.UI.toast('迷雾结晶不够：还差 ' + (h.cost - m.crystals));
          return;
        }
        m.crystals -= h.cost;
        m.hats[h.id] = true;
        m.outfits[slot] = h.id;
        hatFocus = null;
        PF.Save.saveMeta();
        A.play('success');
        if (o && o.rerender) o.rerender();
        return;
      }
      const b = e.target.closest('[data-hat]');
      if (!b) return;
      const id = b.dataset.hat || null;
      if (id && !hatOwned(id, m)) {
        hatFocus = hatFocus === id ? null : id;
        A.play('click');
      } else {
        hatFocus = null;
        m.outfits[slot] = id;
        PF.Save.saveMeta();
        A.play('pop');
      }
      if (o && o.rerender) o.rerender();
    };
  };

  /* ---------------- 系统 ---------------- */
  PF.Sys.register({
    id: 'meta',
    order: 99, // 放在最后：开局加成叠在无尽模式的初始资源上，结算时能看到其他系统的统计
    init(g, saved, fresh) {
      const m = meta();
      popClear();
      this.chkT = 0;
      if (saved && typeof saved === 'object') {
        g.sys.meta = Object.assign({ tal: {}, t0: 5 }, saved);
      } else {
        g.sys.meta = { tal: Object.assign({}, m.talents), t0: g.world.unlockedCount(), campHurt: false, nk: 0, nh: false, inNight: false, clean: false };
      }
      if (fresh) {
        const l = lvOf(g.sys.meta.tal, 'pack');
        if (l) {
          g.st.res[0] += 20 * l;
          g.st.res[1] += 10 * l;
          g.st.res[3] += 10 * l;
        }
      }
    },
    serialize(g) {
      return g.sys.meta;
    },
    destroy() {
      popClear();
    },
    mods(g, m) {
      const tal = (g.sys.meta && g.sys.meta.tal) || {};
      const l = (id) => Math.min(TAL.find((t) => t.id === id).cost.length, lvOf(tal, id));
      m.playerSpeedMul *= 1 + 0.05 * l('swift');
      m.playerHpAdd += 20 * l('tough');
      m.atkAdd += 2 * l('blade');
      m.workerSpeedMul *= 1 + 0.08 * l('sprite');
      m.campHpAdd += 60 * l('camp');
      m.gatherBonus += 0.08 * l('harvest');
      m.tileCostMul *= 1 - 0.06 * l('fog');
      m.extraFreeRevives += l('revive');
      m.darknessMul *= 1 - 0.15 * l('night');
      m.goldMul *= 1 + 0.1 * l('merchant');
    },
    update(g, dt) {
      this.chkT = (this.chkT || 0) + dt;
      if (this.chkT >= 0.5) {
        this.chkT = 0;
        POP.q.push(...checkAll(g));
      }
      popPump(g, dt);
    },
    // —— 统计 ——
    add(g, k, n) {
      if (g.debug) return;
      const c = meta().achStats;
      c[k] = (c[k] || 0) + (n == null ? 1 : +n || 0);
    },
    unlock(g) {
      this.add(g, 'tiles', 1);
    },
    build(g) {
      this.add(g, 'build', 1);
    },
    hire(g) {
      this.add(g, 'hire', 1);
    },
    stat(g, name, n) {
      if (typeof name === 'string' && name) this.add(g, name, n);
    },
    campHurt(g) {
      if (g.sys.meta) g.sys.meta.campHurt = true;
    },
    playerHurt(g) {
      const R = g.sys.meta;
      if (R && R.inNight) R.nh = true;
    },
    enemyDie(g) {
      const R = g.sys.meta;
      if (R && R.inNight) R.nk++;
    },
    night(g) {
      const R = g.sys.meta;
      if (!R) return;
      R.inNight = true;
      R.nk = 0;
      R.nh = false;
    },
    dawn(g) {
      const R = g.sys.meta;
      if (R && R.inNight) {
        if (!R.nh && R.nk >= 5) R.clean = true;
        R.inNight = false;
      }
      this.add(g, 'nights', 1);
      POP.q.push(...checkAll(g));
    },
    miniEnd(g) {
      POP.q.push(...checkAll(g));
    },
    // —— 结算：发结晶、补上没来得及弹出的成就 ——
    runEnd(g, win, ending, data) {
      if (!data.extra) data.extra = [];
      if (g.debug) {
        data.extra.push('<div class="info small center">测试模式：本局不计迷雾结晶和成就</div>');
        return;
      }
      const m = meta();
      const R = g.sys.meta || {};
      m.runs = (m.runs || 0) + 1;
      const st = g.st;
      const nights = st.day;
      const parts = [
        ['驱散迷雾', Math.max(0, Math.round(g.world.unlockedCount() - (R.t0 || 5)))],
        ['度过夜晚', nights * 3],
        ['击退敌人', Math.round(st.kills * 0.5)],
        ['异世界', Object.keys(st.worlds || {}).length * 10],
      ];
      if (win && ending >= 0) parts.push(['结局', [30, 60, 100][ending] || 0]);
      if (g.endless) parts.push(['守夜加成', nights * 4]);
      const total = parts.reduce((s, p) => s + p[1], 0);
      m.crystals += total;
      m.achStats.earned = (m.achStats.earned || 0) + total;
      // 还没来得及弹出的成就并进结算里显示，顶部横幅收起（结算框会盖住它）
      const got = POP.q.splice(0).concat(checkAll(g, { win, ending }));
      popClear();
      const achCr = got.reduce((s, a) => s + a.rw, 0);
      data.extra.push(
        `<div class="meta-gain"><div class="mg-h">获得迷雾结晶 <b>+${total}</b>${GEM}</div>
        <div class="mg-p">${parts.filter((p) => p[1] > 0).map((p) => `${p[0]} ${p[1]}`).join(' · ') || '这次没攒下结晶，下次加油'}</div>
        ${got.length ? `<div class="mg-a">达成成就：${got.map((a) => `「${a.name}」`).join('')}　奖励 +${achCr}${GEM}</div>` : ''}
        <div class="mg-t">现有结晶 ${m.crystals} · 可以在模式选择页学天赋、买帽子</div></div>`
      );
      PF.Save.saveMeta();
    },
    help() {
      return '<p><b>成就与天赋：</b>每局结算会获得迷雾结晶（驱散迷雾、度过夜晚、击退敌人、通关异世界、达成结局都算）。在模式选择页用结晶学“天赋”，下一局开局生效；达成成就会奖励结晶，部分成就还能解锁帽子，选角时可以换装。</p>';
    },
  });
})();
