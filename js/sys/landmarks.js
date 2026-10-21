/* 特殊地块（系统 id: landmarks）
   按世界种子固定生成，藏在迷雾里，驱散后才能用（预览时淡淡显示）：
   - 灯塔：点亮后夜里光柱扫向新大陆，左侧出现方向提示
   - 温泉（2 处）：站进去快速回血，夜里会发光
   - 沉船：打捞一次，得到金币、水晶，可能还有稀罕货
   - 遗迹：触摸石碑记住 4 块石板的亮起顺序，20 秒内按顺序踩上去，获得“古代祝福”
   接口说明见 docs/PLUGIN_API.md */
(function () {
  'use strict';
  const PF = window.PF,
    U = PF.U,
    D = PF.Data,
    S = PF.Spr,
    A = PF.Audio,
    E = PF.Ent;
  const T = D.TILE;
  const OUT = '#1c1424';
  const DIR_NAME = ['北', '南', '西', '东'];
  const DIR_ARROW = ['↑', '↓', '←', '→'];
  const DIR_ANG = [-Math.PI / 2, Math.PI / 2, Math.PI, 0];
  const BANNED = [40, 31, 39, 41, 49, 20, 24, 56, 60]; // 初始地块 + 建筑 + 洞窟
  const KINDS = ['lighthouse', 'spring', 'wreck', 'ruins'];
  const CLEAR_R = { lighthouse: 125, spring: 125, wreck: 150, ruins: 175 };
  const LH_COST = [60, 0, 5, 0];
  // 遗迹石板：相对石碑的位置与颜色
  const PLATES = [
    { dx: -118, dy: 64, col: '#ff5a4f', dim: '#7a3a3a', name: '红' },
    { dx: -44, dy: 102, col: '#ffd23f', dim: '#7a6a30', name: '黄' },
    { dx: 44, dy: 102, col: '#4f9dff', dim: '#30487a', name: '蓝' },
    { dx: 118, dy: 64, col: '#5bd16a', dim: '#2f6a3a', name: '绿' },
  ];
  const PUZZLE_TIME = 20;
  const PUZZLE_CD = 30;

  /* ---------------- 像素图 ---------------- */
  const SP = {};
  const spr = (k, fn) => SP[k] || (SP[k] = fn());

  function drawLighthouse(lit) {
    const p = new S.PC(22, 54);
    // 礁石底座
    p.r(3, 46, 16, 2, '#a7a2c0');
    p.r(1, 48, 20, 3, '#8d87a9');
    p.r(0, 51, 22, 3, '#6f6b82');
    // 塔身：上窄下宽，红白条纹
    for (let j = 14; j < 47; j++) {
      const w = Math.round(10 + ((j - 14) * 5) / 32);
      const x0 = 11 - Math.floor(w / 2);
      p.r(x0, j, w, 1, Math.floor((j - 14) / 6) % 2 ? '#f4efe6' : '#e0473c');
    }
    p.r(9, 40, 4, 6, '#5b3a24');
    p.p(12, 43, '#ffd23f');
    p.r(10, 25, 2, 3, '#3a3550');
    p.r(10, 32, 2, 3, '#3a3550');
    // 平台与灯室
    p.r(4, 12, 14, 2, '#3a3550');
    p.r(5, 11, 12, 1, '#55597a');
    p.r(7, 5, 8, 6, '#3a3550');
    p.r(8, 6, 6, 4, lit ? '#fff4b0' : '#5a6a80');
    if (lit) p.r(9, 7, 4, 2, '#ffd23f');
    else p.p(9, 6, '#8a9ab0');
    // 屋顶
    for (let j = 0; j < 5; j++) p.r(11 - (j + 1), j, (j + 1) * 2, 1, j < 1 ? '#ff7a6a' : '#b8322b');
    p.outline(OUT);
    p.shade((i, j, r, g, b) => (i >= 13 && j > 13 && j < 46 && r + g + b > 120 ? [(r * 0.82) | 0, (g * 0.82) | 0, (b * 0.82) | 0] : null));
    return p.c;
  }
  function drawWreck(looted) {
    const p = new S.PC(50, 30);
    // 歪倒的船身：左边船头翘起，右边断开露出肋骨
    for (let i = 2; i < 40; i++) {
      const top = i < 9 ? 9 + Math.round((9 - i) * -0.6) + 1 : 14 + Math.round((i - 9) * 0.08);
      const bot = 26 - Math.round(Math.pow(Math.abs(i - 21) / 19, 2) * 6);
      for (let j = top; j < bot; j++) p.p(i, j, (j - top) % 4 === 0 ? '#8a5a35' : (j - top) % 4 === 3 ? '#5b3a24' : '#6b4a2f');
      p.p(i, top, '#b07a45');
    }
    for (let k = 0; k < 4; k++) p.r(40 + k * 2, 15 + k, 1, 9 - k * 2, '#8a5a35');
    p.r(15, 18, 4, 3, '#2a1a14');
    p.r(28, 18, 3, 2, '#2a1a14');
    // 斜着的断桅杆 + 破帆
    p.line(22, 14, 14, 1, '#5b3a24');
    p.line(23, 14, 15, 1, '#6b4a2f');
    p.line(9, 4, 21, 1, '#5b3a24');
    for (let j = 0; j < 8; j++) {
      const x0 = 10 + Math.round(j * 0.3),
        x1 = 19 - Math.round(j * 0.2) - (j > 5 ? (j % 2) * 2 : 0);
      for (let i = x0; i < x1; i++) p.p(i, 4 + j - Math.round((i - 10) * 0.2), j === 3 ? '#e0473c' : '#e8e2d0');
    }
    // 海草 / 藤壶
    p.r(4, 24, 3, 2, '#3f8a4a');
    p.r(32, 24, 4, 2, '#3f8a4a');
    p.p(35, 23, '#5bd16a');
    p.p(6, 23, '#5bd16a');
    p.p(12, 22, '#d8d2c0');
    p.p(25, 23, '#d8d2c0');
    if (!looted) {
      p.r(42, 23, 7, 5, '#b07a45');
      p.r(42, 23, 7, 1, '#d9a066');
      p.r(45, 23, 1, 5, '#ffd23f');
    }
    p.outline(OUT);
    return p.c;
  }
  function drawTablet(solved) {
    const p = new S.PC(16, 24);
    p.r(1, 20, 14, 4, '#6f6b82');
    p.r(2, 19, 12, 1, '#8d87a9');
    p.r(3, 3, 10, 17, '#9a96a8');
    p.r(4, 2, 8, 1, '#9a96a8');
    p.r(5, 1, 6, 1, '#9a96a8');
    p.r(3, 3, 1, 17, '#b5b1c4');
    p.r(12, 3, 1, 17, '#7a7690');
    const rune = solved ? '#8ff0ff' : '#55516a';
    [[5, 6], [7, 6], [9, 6], [10, 7], [5, 8], [6, 9], [8, 9], [10, 10], [5, 12], [7, 12], [8, 13], [10, 13], [6, 15], [9, 15], [7, 17], [8, 17]].forEach((q) => p.p(q[0], q[1], rune));
    p.p(5, 3, '#ff5a4f');
    p.p(7, 3, '#ffd23f');
    p.p(9, 3, '#4f9dff');
    p.p(11, 3, '#5bd16a');
    p.r(3, 17, 3, 3, '#4f9a3f');
    p.p(6, 19, '#4f9a3f');
    p.p(11, 18, '#79c850');
    p.outline(OUT);
    return p.c;
  }
  function drawSpring() {
    const p = new S.PC(38, 20);
    const cx = 19,
      cy = 10;
    for (let j = 0; j < 20; j++)
      for (let i = 0; i < 38; i++) {
        const dx = (i + 0.5 - cx) / 18.5,
          dy = (j + 0.5 - cy) / 9.5;
        if (dx * dx + dy * dy > 1) continue;
        const ex = (i + 0.5 - cx) / 15,
          ey = (j + 0.5 - cy) / 7;
        const d2 = ex * ex + ey * ey;
        if (d2 <= 1) p.p(i, j, d2 < 0.3 ? '#a8eef4' : d2 < 0.68 ? '#72d4e4' : '#4fb8d0');
        else p.p(i, j, U.hash(i >> 1, j >> 1, 9) < 0.5 ? '#a7a2c0' : '#7a7690');
      }
    p.r(12, 7, 3, 1, '#ffffff');
    p.p(24, 12, '#e8fbff');
    p.p(25, 12, '#e8fbff');
    p.outline(OUT);
    return p.c;
  }
  function drawCompass() {
    const p = new S.PC(12, 12);
    p.circ(6, 6, 5.4, '#f3e2bf');
    p.circ(6, 6, 4.2, '#fff7e6');
    p.r(5.5, 1.5, 1, 4.5, '#e0473c');
    p.r(5, 2, 2, 3, '#e0473c');
    p.r(5, 7, 2, 3, '#55597a');
    p.p(6, 6, OUT);
    p.outline(OUT);
    return p.c;
  }

  /* ---------------- 生成 ---------------- */
  function tileDist(w, a, b) {
    const ta = w.tiles[a],
      tb = w.tiles[b];
    return Math.abs(ta.r - tb.r) + Math.abs(ta.c - tb.c);
  }
  function generate(w) {
    const rnd = U.rng(((w.seed ^ 0x2545f491) >>> 0) + 7);
    const used = new Set(BANNED);
    for (const b of w.buildings) used.add(b.tile);
    for (const p of w.portals) used.add(p.tile);
    const chestT = new Set(w.chests.map((c) => c.tile));
    const list = [];
    const pickTile = (f, sep) => {
      let c = w.tiles.filter((t) => !used.has(t.i) && !w.isMainEdge(t) && f(t) && list.every((l) => tileDist(w, l.tile, t.i) >= (sep || 1)));
      const nc = c.filter((t) => !chestT.has(t.i));
      if (nc.length) c = nc;
      if (!c.length) return null;
      const t = rnd.pick(c);
      used.add(t.i);
      return t;
    };
    const place = (kind, t) => {
      const k = kind === 'ruins' ? 0.25 : 1;
      let x = 0,
        y = 0;
      for (let n = 0; n < 12; n++) {
        x = t.c * T + T / 2 + rnd.range(-50, 50) * k;
        y = t.r * T + T / 2 + rnd.range(-25, 40) * k + (kind === 'ruins' ? -22 : kind === 'lighthouse' ? 20 : 0);
        if (!w.chests.some((c) => U.dist(c.x, c.y, x, y) < CLEAR_R[kind] + 20)) break;
      }
      list.push({ kind, tile: t.i, x: Math.round(x), y: Math.round(y) });
    };
    let t;
    if ((t = pickTile((q) => q.d >= 4 && q.d <= 6))) place('ruins', t);
    if ((t = pickTile((q) => q.d === 3))) place('lighthouse', t);
    if ((t = pickTile((q) => q.d >= 5, 2))) place('wreck', t);
    if ((t = pickTile((q) => q.d >= 2 && q.d <= 5, 2))) place('spring', t);
    if ((t = pickTile((q) => q.d >= 2 && q.d <= 5, 3))) place('spring', t);
    return list;
  }
  /* 清掉地标周围的资源点（驱散迷雾时核心会把这块地的资源点补满，所以解锁后要再清一次） */
  function clearNodes(g, l) {
    const R = CLEAR_R[l.kind];
    for (const n of g.world.nodes) {
      if (U.dist(n.x, n.y, l.x, l.y + (l.kind === 'ruins' ? 50 : 0)) < R) {
        n.hp = 0;
        n.regrow = 99999;
        if (n.reserved) n.reserved = null;
      }
    }
  }
  /* 清资源点、把挡路的宝箱挪开、加上障碍 */
  function settle(g, s) {
    const w = g.world;
    s.solids = [];
    for (const l of s.list) {
      const R = CLEAR_R[l.kind];
      clearNodes(g, l);
      for (const c of w.chests) {
        if (c.tile !== l.tile || U.dist(c.x, c.y, l.x, l.y) >= R) continue;
        const t = w.tiles[l.tile];
        c.x = U.clamp(l.x + (l.x < t.c * T + T / 2 ? R + 20 : -R - 20), t.c * T + 50, (t.c + 1) * T - 50);
        c.y = U.clamp(l.y - 60, t.r * T + 70, (t.r + 1) * T - 40);
      }
      let o = null;
      if (l.kind === 'lighthouse') o = { x: l.x, y: l.y - 10, r: 34 };
      else if (l.kind === 'wreck') o = { x0: l.x - 84, x1: l.x + 66, y0: l.y - 36, y1: l.y - 2 };
      else if (l.kind === 'ruins') o = { x: l.x, y: l.y - 8, r: 26 };
      if (o) {
        w.solids.push(o);
        s.solids.push(o);
      }
    }
  }
  function validSaved(g, saved) {
    if (!saved || !Array.isArray(saved.list) || !saved.list.length) return false;
    return saved.list.every((l) => l && KINDS.includes(l.kind) && g.world.tiles[l.tile] && isFinite(l.x) && isFinite(l.y));
  }

  /* ---------------- 交互 ---------------- */
  const usable = (g, l) => g.world.tiles[l.tile].unlocked;
  function lightUp(g, l) {
    if (l.lit) return;
    if (!g.pay(LH_COST)) {
      g.toast('资源不足');
      A.play('wrong');
      return;
    }
    const s = g.sys.landmarks;
    l.lit = true;
    A.play('success');
    g.fx.sparkle(l.x, l.y - 180, '#fff4b0');
    if (!g.endless && !g.world.revealed) {
      s.compass = true;
      g.toast('灯塔的光指向' + DIR_NAME[g.world.mainDir] + '方——新大陆在那边！');
    } else g.toast('灯塔亮了：夜里会照亮附近的海面');
    g.fire('stat', 'landmark', 1);
    refreshBadge(g);
    g.save();
  }
  function salvage(g, l) {
    if (l.looted) return;
    l.looted = true;
    const gold = U.randi(60, 100);
    g.addRes(3, gold, l.x, l.y - 150);
    g.later(() => g.addRes(2, 20, l.x, l.y - 150), 300);
    let extra = '';
    if (Math.random() < 0.35) {
      const fishing = !!PF.Sys.get('fishing');
      const pool = fishing ? ['fish_r', 'bait', 'speed'] : ['speed'];
      const k = U.pick(pool);
      if (k === 'fish_r') {
        g.addItem('fish_r', 1);
        extra = '，还有一条彩虹鱼标本！';
      } else if (k === 'bait') {
        g.addItem('bait', 5);
        extra = '，还有高级鱼饵 ×5';
      } else {
        g.st.speedUpT += 240;
        extra = '，还有一袋精灵口粮（精灵加速 4 分钟）';
      }
    }
    g.fx.sparkle(l.x + 40, l.y - 40, '#ffe36b');
    A.play('coin');
    g.toast('打捞沉船：金币 +' + gold + '，紫水晶 +20' + extra);
    g.fire('stat', 'landmark', 1);
    g.save();
  }
  function startPuzzle(g, l) {
    const s = g.sys.landmarks;
    const seq = [];
    for (let i = 0; i < 4; i++) {
      let k;
      do k = U.randi(0, 3);
      while (i > 0 && k === seq[i - 1]);
      seq.push(k);
    }
    s.pz = { l, phase: 'show', seq, t: -0.5, idx: 0, last: [-1, -1], flash: null };
    A.play('portal');
    g.toast('记住石板亮起的顺序……');
  }
  function puzzleFail(g, why) {
    const s = g.sys.landmarks;
    const l = s.pz.l;
    s.pz = null;
    l.cd = PUZZLE_CD;
    A.play('fail');
    g.toast(why + '石碑沉寂了，' + PUZZLE_CD + ' 秒后可以再试');
  }
  function puzzleWin(g) {
    const s = g.sys.landmarks;
    const l = s.pz.l;
    s.pz = null;
    l.solved = true;
    g.recomputeMods();
    g.addRes(3, 40, l.x, l.y - 160);
    g.fx.sparkle(l.x, l.y - 60, '#8ff0ff');
    A.play('success');
    g.toast('获得古代祝福：采集时有 20% 几率多得 1 个（金币 +40）');
    g.fire('stat', 'puzzle', 1);
    g.fire('stat', 'landmark', 1);
    g.save();
  }
  function plateAt(l, x, y) {
    for (let k = 0; k < 4; k++) {
      const pl = PLATES[k];
      if (Math.abs(x - (l.x + pl.dx)) < 34 && Math.abs(y - (l.y + pl.dy)) < 24) return k;
    }
    return -1;
  }
  function updatePuzzle(g, dt) {
    const s = g.sys.landmarks;
    const pz = s.pz;
    if (pz.flash) {
      pz.flash.t -= dt;
      if (pz.flash.t <= 0) pz.flash = null;
    }
    if (pz.phase === 'show') {
      const prev = Math.floor(pz.t / 0.75);
      pz.t += dt;
      const cur = Math.floor(pz.t / 0.75);
      if (cur !== prev && cur >= 0 && cur < 4) A.play('tick');
      if (pz.t >= 4 * 0.75 + 0.3) {
        pz.phase = 'input';
        pz.t = PUZZLE_TIME;
        pz.last = g.players.map((p) => plateAt(pz.l, p.x, p.y));
        g.toast('按刚才的顺序踩石板！' + PUZZLE_TIME + ' 秒内完成');
      }
      return;
    }
    pz.t -= dt;
    if (pz.t <= 0) return puzzleFail(g, '时间到了……');
    for (const p of g.players) {
      if (p.down) continue;
      const k = plateAt(pz.l, p.x, p.y);
      const was = pz.last[p.idx];
      pz.last[p.idx] = k;
      if (k < 0 || k === was) continue;
      if (k === pz.seq[pz.idx]) {
        pz.idx++;
        pz.flash = { k, t: 0.5, ok: true };
        A.play('right');
        if (pz.idx >= 4) return puzzleWin(g);
      } else {
        pz.flash = { k, t: 0.5, ok: false };
        return puzzleFail(g, '顺序错了……');
      }
    }
  }

  /* ---------------- HUD：大陆方向牌 ---------------- */
  let BADGE = null;
  function mountBadge() {
    const box = document.getElementById('alerts');
    if (!box) return;
    box.querySelectorAll('.lm-compass').forEach((e) => e.remove()); // 上一局没清干净的
    const el = document.createElement('div');
    el.className = 'lm-compass';
    el.innerHTML = `<img class="pix" alt="" src="${S.spriteURL(spr('compass', drawCompass), 3)}"><span></span>`;
    box.appendChild(el);
    BADGE = { el, lab: el.querySelector('span'), on: false, txt: '' };
  }
  function refreshBadge(g) {
    if (!BADGE) return;
    const s = g.sys.landmarks;
    const on = !!(s && s.compass && !g.world.revealed && !g.endless);
    if (on) {
      const d = g.world.mainDir;
      const txt = '新大陆在' + DIR_NAME[d] + '边 ' + DIR_ARROW[d];
      if (BADGE.txt !== txt) BADGE.lab.textContent = BADGE.txt = txt;
    }
    if (BADGE.on !== on) {
      BADGE.on = on;
      BADGE.el.classList.toggle('on', on);
    }
  }
  function unmountBadge() {
    if (BADGE) BADGE.el.remove();
    BADGE = null;
  }

  /* ---------------- 绘制辅助 ---------------- */
  let CTX = null;
  function alphaFor(g, l) {
    const w = g.world;
    if (w.tiles[l.tile].unlocked) return 1;
    return w.previewAmt[l.tile] * 0.85;
  }
  function beamAngle(g, s) {
    if (!g.endless && (s.compass || g.world.revealed)) return DIR_ANG[g.world.mainDir] + Math.sin(g.time * 0.55) * 0.5;
    return g.time * 0.45;
  }
  function drawPlates(g, ctx, l, s) {
    const pz = s.pz && s.pz.l === l ? s.pz : null;
    let showK = -1;
    if (pz && pz.phase === 'show') {
      const i = Math.floor(pz.t / 0.75);
      if (i >= 0 && i < 4 && pz.t - i * 0.75 < 0.55) showK = pz.seq[i];
    }
    PLATES.forEach((pl, k) => {
      const x = l.x + pl.dx,
        y = l.y + pl.dy;
      let lit = l.solved ? 0.55 + Math.sin(g.time * 2 + k) * 0.25 : 0;
      let col = pl.col;
      if (k === showK) lit = 1;
      if (pz && pz.flash && pz.flash.k === k) {
        lit = 1;
        if (!pz.flash.ok) col = '#ff2a2a';
      }
      ctx.fillStyle = OUT;
      ctx.fillRect(x - 32, y - 18, 64, 36);
      ctx.fillStyle = lit > 0 ? col : pl.dim;
      ctx.fillRect(x - 28, y - 14, 56, 28);
      if (lit > 0) {
        const a0 = ctx.globalAlpha;
        ctx.globalAlpha = a0 * lit * 0.6;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(x - 20, y - 10, 40, 8);
        ctx.globalAlpha = a0 * lit * 0.35;
        ctx.fillStyle = col;
        ctx.fillRect(x - 40, y - 24, 80, 48);
        ctx.globalAlpha = a0;
      } else {
        ctx.fillStyle = 'rgba(255,255,255,0.18)';
        ctx.fillRect(x - 28, y - 14, 56, 4);
      }
    });
  }

  PF.Sys.register({
    id: 'landmarks',
    order: 42,
    init(g, saved) {
      const list = validSaved(g, saved) ? saved.list.map((l) => Object.assign({}, l)) : generate(g.world);
      for (const l of list) {
        if (l.kind === 'lighthouse') l.lit = !!l.lit;
        if (l.kind === 'wreck') l.looted = !!l.looted;
        if (l.kind === 'ruins') {
          l.solved = !!l.solved;
          l.cd = Math.max(0, +l.cd || 0);
        }
      }
      const s = { list, compass: !!(saved && saved.compass), pz: null, healT: 0, badgeT: 0, solids: [] };
      settle(g, s);
      g.sys.landmarks = s;
      mountBadge();
      refreshBadge(g);
    },
    serialize(g) {
      const s = g.sys.landmarks;
      if (!s) return null;
      return { list: s.list.map((l) => ({ kind: l.kind, tile: l.tile, x: l.x, y: l.y, lit: l.lit, looted: l.looted, solved: l.solved, cd: l.cd ? Math.round(l.cd) : 0 })), compass: s.compass };
    },
    destroy(g) {
      unmountBadge();
      const s = g.sys.landmarks;
      if (s && g.world) g.world.solids = g.world.solids.filter((o) => s.solids.indexOf(o) < 0);
    },
    mods(g, m) {
      const s = g.sys.landmarks;
      if (s && s.list.some((l) => l.kind === 'ruins' && l.solved)) m.gatherBonus += 0.2;
    },
    unlock(g, tile) {
      const s = g.sys.landmarks;
      if (!s) return;
      // 同一地块的资源点被核心补满了：再清一次
      for (const x of s.list) clearNodes(g, x);
      const l = s.list.find((x) => x.tile === tile.i);
      if (!l) return;
      const msg = {
        lighthouse: '发现了一座灯塔！带 60 木材、5 紫水晶就能点亮它',
        spring: '发现了温泉：站在里面能快速回血',
        wreck: '发现了一艘沉船，去打捞看看',
        ruins: '发现了古代遗迹：触摸石碑开始解谜',
      }[l.kind];
      g.later(() => g.toast(msg), 1200);
    },
    update(g, dt) {
      const s = g.sys.landmarks;
      if (!s) return;
      for (const l of s.list) if (l.cd > 0) l.cd = Math.max(0, l.cd - dt);
      if (s.pz) updatePuzzle(g, dt);
      // 温泉：每秒回血
      s.healT += dt;
      if (s.healT >= 1) {
        s.healT -= 1;
        for (const l of s.list) {
          if (l.kind !== 'spring' || !usable(g, l)) continue;
          for (const p of g.players) {
            if (p.down || p.hp >= p.hpMax || U.dist(p.x, p.y, l.x, l.y) > 70) continue;
            const add = Math.min(12, p.hpMax - p.hp);
            p.hp += add;
            g.fx.text(p.x, p.y - 130, '+' + Math.round(add), '#9be38a');
          }
          for (const w of g.workers) {
            if (w.dead || w.hp >= w.hpMax || U.dist(w.x, w.y, l.x, l.y) > 70) continue;
            w.hp = Math.min(w.hpMax, w.hp + 6);
          }
          for (const a of g.allies) {
            if (!a || a.dead || a.down || !(a.hpMax > 0) || a.hp >= a.hpMax || U.dist(a.x, a.y, l.x, l.y) > 70) continue;
            a.hp = Math.min(a.hpMax, a.hp + 6);
          }
        }
      }
      s.badgeT -= dt;
      if (s.badgeT <= 0) {
        s.badgeT = 0.5;
        refreshBadge(g);
      }
    },
    prompt(g, p) {
      const s = g.sys.landmarks;
      if (!s) return null;
      for (const l of s.list) {
        if (Math.abs(p.x - l.x) > 140 || Math.abs(p.y - l.y) > 140) continue;
        if (!usable(g, l)) continue;
        const d = U.dist(p.x, p.y, l.x, l.y);
        if (l.kind === 'lighthouse' && !l.lit && d < 115) return { label: '点亮灯塔', cost: LH_COST, btn: '点亮', what: 'lh', l };
        if (l.kind === 'wreck' && !l.looted && d < 120) return { label: '打捞沉船', btn: '打捞', what: 'wreck', l };
        if (l.kind === 'ruins' && !l.solved && !s.pz && d < 95) {
          if (l.cd > 0) return { label: '石碑沉睡中 ' + Math.ceil(l.cd) + ' 秒', btn: '等待', what: 'wait', l };
          return { label: '触摸石碑', btn: '触摸', note: '记住石板亮起的顺序', what: 'ruins', l };
        }
      }
      return null;
    },
    act(g, pi, pr) {
      const l = pr.l;
      if (!l) return;
      if (pr.what === 'lh') lightUp(g, l);
      else if (pr.what === 'wreck') salvage(g, l);
      else if (pr.what === 'ruins') startPuzzle(g, l);
      else if (pr.what === 'wait') g.toast('石碑还在沉睡，过一会儿再来');
    },
    drawGround(g, ctx, cam) {
      CTX = ctx;
      const s = g.sys.landmarks;
      if (!s) return;
      for (const l of s.list) {
        if (!cam.visible(l.x, l.y, 240)) continue;
        const a = alphaFor(g, l);
        if (a < 0.05) continue;
        ctx.globalAlpha = a;
        if (l.kind === 'spring') {
          E.drawSprite(ctx, spr('spring', drawSpring), l.x, l.y + 40);
          // 水面闪光
          const k = Math.floor(g.time * 2) % 4;
          ctx.fillStyle = 'rgba(255,255,255,0.7)';
          ctx.fillRect(l.x - 30 + k * 14, l.y - 6 + (k % 2) * 8, 8, 4);
        } else if (l.kind === 'ruins') drawPlates(g, ctx, l, s);
        ctx.globalAlpha = 1;
      }
    },
    drawables(g, add, cam) {
      const s = g.sys.landmarks;
      if (!s || !CTX) return;
      for (const l of s.list) {
        if (l.kind === 'spring' || !cam.visible(l.x, l.y, 280)) continue;
        const a = alphaFor(g, l);
        if (a < 0.05) continue;
        add(l.y, () => {
          const ctx = CTX;
          ctx.globalAlpha = a;
          const open = a >= 1;
          if (l.kind === 'lighthouse') {
            E.shadow(ctx, l.x, l.y, 54, 16);
            E.drawSprite(ctx, spr('lh' + (l.lit ? 1 : 0), () => drawLighthouse(l.lit)), l.x, l.y + 8);
            if (open) g.namePlate(ctx, l.x, l.y - 236, l.lit ? '灯塔 ★' : '灯塔', l.lit ? '#ffe36b' : '#fff');
          } else if (l.kind === 'wreck') {
            E.shadow(ctx, l.x, l.y - 4, 90, 14, 0.2);
            E.drawSprite(ctx, spr('wr' + (l.looted ? 1 : 0), () => drawWreck(l.looted)), l.x, l.y + 8);
            if (open) g.namePlate(ctx, l.x, l.y - 120, l.looted ? '沉船（已打捞）' : '沉船', l.looted ? '#d8d2c0' : '#fff');
          } else if (l.kind === 'ruins') {
            E.shadow(ctx, l.x, l.y, 40, 12);
            E.drawSprite(ctx, spr('tb' + (l.solved ? 1 : 0), () => drawTablet(l.solved)), l.x, l.y + 6);
            if (open) {
              const pz = s.pz && s.pz.l === l ? s.pz : null;
              const txt = l.solved ? '遗迹 ★' : pz && pz.phase === 'input' ? '剩 ' + Math.ceil(pz.t) + ' 秒 · ' + pz.idx + '/4' : pz ? '记住顺序！' : '遗迹';
              g.namePlate(ctx, l.x, l.y - 118, txt, l.solved ? '#8ff0ff' : pz ? '#fff4b0' : '#fff');
            }
          }
          ctx.globalAlpha = 1;
        });
      }
    },
    drawTop(g, ctx, cam) {
      const s = g.sys.landmarks;
      if (!s) return;
      for (const l of s.list) {
        if (l.kind !== 'spring' || !usable(g, l) || !cam.visible(l.x, l.y, 200)) continue;
        // 蒸汽
        for (let k = 0; k < 6; k++) {
          const ph = (g.time * 0.32 + k / 6) % 1;
          const px = l.x + Math.sin(k * 2.1 + g.time * 0.8) * 34 * (0.4 + ph);
          const py = l.y - 6 - ph * 130;
          const sz = 10 + ph * 18;
          ctx.globalAlpha = (1 - ph) * 0.38;
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(px - sz / 2, py - sz / 2, sz, sz);
        }
        ctx.globalAlpha = 1;
        g.namePlate(ctx, l.x, l.y + 64, '温泉', '#bff4ff');
      }
    },
    lights(g, light) {
      const s = g.sys.landmarks;
      if (!s) return;
      for (const l of s.list) {
        if (!usable(g, l)) continue;
        if (l.kind === 'spring') light(l.x, l.y, 170, 0.7);
        else if (l.kind === 'ruins' && l.solved) light(l.x, l.y - 30, 150, 0.6);
        else if (l.kind === 'lighthouse' && l.lit) {
          light(l.x, l.y - 120, 320, 1);
          const a = beamAngle(g, s);
          for (let k = 1; k <= 7; k++) {
            const d = k * 170;
            light(l.x + Math.cos(a) * d, l.y - 178 + Math.sin(a) * d, 80 + k * 26, 0.85 - k * 0.08);
          }
        }
      }
    },
    minimap(g, dot) {
      const s = g.sys.landmarks;
      if (!s) return;
      const col = { lighthouse: '#ff7a6a', spring: '#7fd8e8', wreck: '#a8693a', ruins: '#8ff0ff' };
      for (const l of s.list) if (usable(g, l)) dot(l.x, l.y, col[l.kind], 5);
    },
    drawScreen(g, ctx, dpr, cam) {
      const s = g.sys.landmarks;
      if (!s) return;
      const dark = g.darkness();
      if (dark < 0.05) return;
      for (const l of s.list) {
        if (l.kind !== 'lighthouse' || !l.lit || !usable(g, l)) continue;
        const o = cam.toScreen(l.x, l.y - 178);
        const a = beamAngle(g, s);
        const len = 1250 * cam.z,
          spread = 0.16;
        const gr = ctx.createLinearGradient(o.x, o.y, o.x + Math.cos(a) * len, o.y + Math.sin(a) * len);
        gr.addColorStop(0, `rgba(255,240,170,${0.32 * dark})`);
        gr.addColorStop(1, 'rgba(255,240,170,0)');
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = gr;
        ctx.beginPath();
        ctx.moveTo(o.x, o.y);
        ctx.lineTo(o.x + Math.cos(a - spread) * len, o.y + Math.sin(a - spread) * len);
        ctx.lineTo(o.x + Math.cos(a + spread) * len, o.y + Math.sin(a + spread) * len);
        ctx.closePath();
        ctx.fill();
        // 灯头
        ctx.globalAlpha = dark;
        ctx.fillStyle = 'rgba(255,244,176,0.9)';
        const r = 10 * cam.z + 4;
        ctx.fillRect(o.x - r, o.y - r, r * 2, r * 2);
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
      }
    },
    help() {
      return '<p><b>特殊地块：</b>迷雾里藏着灯塔（点亮后光柱指向新大陆）、温泉（站进去快速回血）、沉船（可以打捞一次）和古代遗迹（触摸石碑，记住石板亮起的顺序，20 秒内按顺序踩上去，获得“古代祝福”：采集时有几率多得资源）。</p>';
    },
  });
})();
