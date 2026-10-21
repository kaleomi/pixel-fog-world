/* 随机事件与天气（系统 id: events）
   - 每天黎明决定天气：晴 / 雨（资源长得快）/ 暴风雨（长得更快，但走得慢、夜更黑，还会打雷劈树）
   - 白天随机来一件事：商船来访、流星雨、漂流瓶（藏宝图）、补给箱
   - 其他系统只读 g.sys.events.weather
   接口说明见 docs/PLUGIN_API.md */
(function () {
  'use strict';
  const PF = window.PF,
    U = PF.U,
    D = PF.Data,
    S = PF.Spr,
    A = PF.Audio,
    E = PF.Ent;
  const T = D.TILE,
    N = D.N;
  const OUT = '#1c1424';
  const DIR_NAME = ['北', '南', '西', '东'];
  const DIRV = [
    [0, -1],
    [0, 1],
    [-1, 0],
    [1, 0],
  ];

  const WEATHER = {
    clear: { name: '晴', tip: '晴天：一切如常' },
    rain: { name: '雨', tip: '雨天：树木、稻田、水晶再生速度 ×1.8' },
    storm: { name: '暴风雨', tip: '暴风雨：资源再生 ×1.5，但移动稍慢、夜里更黑；闪电会劈倒附近的树（能捡到木材）' },
  };
  const MERCHANT_STAY = 70; // 商船停靠秒数
  const BOAT_SCALE = 0.78;

  /* ---------------- 像素图（画一次缓存） ---------------- */
  const SP = {};
  const spr = (k, fn) => SP[k] || (SP[k] = fn());

  function drawSun() {
    const p = new S.PC(12, 12);
    p.r(5, 0, 2, 2, '#ffb238');
    p.r(5, 10, 2, 2, '#ffb238');
    p.r(0, 5, 2, 2, '#ffb238');
    p.r(10, 5, 2, 2, '#ffb238');
    p.p(2, 2, '#ffb238');
    p.p(9, 2, '#ffb238');
    p.p(2, 9, '#ffb238');
    p.p(9, 9, '#ffb238');
    p.circ(6, 6, 3.3, '#ffd23f');
    p.p(4, 5, '#fff4b0');
    p.p(5, 4, '#fff4b0');
    p.outline(OUT);
    return p.c;
  }
  function drawCloudIcon(storm) {
    const p = new S.PC(13, 12);
    const c1 = storm ? '#7a7f9c' : '#eef3f8',
      c2 = storm ? '#55597a' : '#b9c4d4';
    p.circ(4.5, 5.2, 2.6, c1);
    p.circ(8.2, 4.2, 3.2, c1);
    p.r(2, 5, 9, 3, c1);
    p.r(2, 7, 9, 1, c2);
    if (storm) {
      p.p(7, 8, '#ffd23f');
      p.p(6, 9, '#ffd23f');
      p.p(7, 9, '#ffd23f');
      p.p(6, 10, '#ffd23f');
      p.p(5, 11, '#ffd23f');
    } else {
      p.p(3, 10, '#6fd3ff');
      p.p(6, 11, '#6fd3ff');
      p.p(9, 10, '#6fd3ff');
    }
    p.outline(OUT);
    return p.c;
  }
  function wxIcon(w) {
    return spr('wx' + w, () => (w === 'clear' ? drawSun() : drawCloudIcon(w === 'storm')));
  }
  /* 商船：黄白条纹帆 */
  function drawBoat() {
    const p = new S.PC(46, 34);
    p.r(22, 3, 2, 23, '#6b4a2f');
    for (let j = 0; j < 16; j++) {
      const w = 4 + Math.floor(j * 0.9);
      for (let i = 0; i < w; i++) p.p(24 + i, 5 + j, Math.floor(i / 3) % 2 ? '#fff4d6' : '#ffcf3f');
    }
    for (let j = 0; j < 12; j++) {
      const w = 2 + Math.floor(j * 0.7);
      for (let i = 0; i < w; i++) p.p(21 - i, 9 + j, Math.floor(i / 2) % 2 ? '#ffcf3f' : '#fff4d6');
    }
    p.r(24, 1, 6, 3, '#5bd16a');
    p.p(26, 2, '#ffd23f');
    for (let j = 0; j < 8; j++) {
      const x0 = 2 + Math.floor(j * 0.9),
        x1 = 44 - Math.floor(j * 0.9);
      p.r(x0, 25 + j, x1 - x0, 1, j < 2 ? '#b07a45' : j < 4 ? '#8a5a35' : '#6b4a2f');
    }
    p.r(2, 25, 42, 1, '#d9a066');
    p.p(12, 28, '#ffe9a8');
    p.p(32, 28, '#ffe9a8');
    p.r(6, 21, 5, 4, '#c98a4b');
    p.r(6, 21, 5, 1, '#e0a865');
    p.r(35, 22, 4, 3, '#c98a4b');
    p.r(39, 20, 4, 5, '#a8693a');
    p.outline(OUT);
    return p.c;
  }
  function drawCrate() {
    const p = new S.PC(12, 11);
    p.r(1, 2, 10, 8, '#b07a45');
    p.r(1, 2, 10, 1, '#d9a066');
    p.r(1, 5, 10, 1, '#8a5a35');
    p.r(1, 9, 10, 1, '#6b4a2f');
    p.r(5, 2, 2, 8, '#e8c55a');
    p.r(4, 0, 4, 2, '#e8c55a');
    p.outline(OUT);
    return p.c;
  }
  function drawChute() {
    const p = new S.PC(20, 12);
    for (let j = 0; j < 6; j++) {
      const hw = Math.round(Math.sqrt(1 - Math.pow((5 - j) / 6, 2)) * 9.5);
      for (let i = 10 - hw; i < 10 + hw; i++) p.p(i, j, Math.floor(i / 4) % 2 ? '#ffffff' : '#ff5a4f');
    }
    p.outline(OUT);
    p.line(2, 6, 8, 11, '#e8eef4');
    p.line(17, 6, 11, 11, '#e8eef4');
    p.line(10, 6, 10, 11, '#e8eef4');
    return p.c;
  }
  function drawPotion() {
    const p = new S.PC(10, 12);
    p.r(4, 0, 2, 2, '#c98a4b');
    p.r(3, 2, 4, 2, '#e8eef4');
    p.circ(5, 7.5, 3.6, '#e8eef4');
    p.circ(5, 8, 2.8, '#5bd16a');
    p.p(3, 6, '#ffffff');
    p.outline(OUT);
    return p.c;
  }
  function drawMapIcon() {
    const p = new S.PC(12, 10);
    p.r(1, 1, 10, 8, '#f3e2bf');
    p.r(1, 1, 10, 1, '#ecd6aa');
    p.r(1, 8, 10, 1, '#d9be8c');
    [[2, 7], [3, 6], [4, 6], [5, 5], [6, 5]].forEach((q) => p.p(q[0], q[1], '#b07a45'));
    [[7, 2], [9, 2], [8, 3], [7, 4], [9, 4]].forEach((q) => p.p(q[0], q[1], '#e0473c'));
    p.outline(OUT);
    return p.c;
  }
  function drawBait() {
    const p = new S.PC(10, 12);
    p.line(7, 0, 7, 8, '#c9ccd8');
    p.line(7, 8, 5, 10, '#c9ccd8');
    p.p(4, 9, '#c9ccd8');
    p.r(2, 3, 2, 2, '#ff8fb0');
    p.r(3, 5, 2, 2, '#ff8fb0');
    p.r(2, 7, 2, 2, '#ff8fb0');
    p.p(2, 3, '#ffc2d4');
    p.outline(OUT);
    return p.c;
  }

  /* ---------------- 工具 ---------------- */
  // drawables 的回调拿不到画布：在同一帧更早的 drawGround 里记下来
  let CTX = null;
  function banner(big, sub) {
    const el = document.getElementById('banner');
    if (!el) return;
    el.innerHTML = `<div class="big">${big}</div><div class="sub">${sub}</div>`;
    el.classList.remove('on');
    void el.offsetWidth;
    el.classList.add('on');
  }
  function livePlayers(g) {
    return g.players.filter((p) => !p.down);
  }
  /* 这个点附近有没有东西挡着（资源点、建筑、洞窟、宝箱、木筏、特殊地块） */
  function clearAt(g, x, y, r) {
    const w = g.world;
    const ti = w.tileIdx(x, y);
    if (ti < 0) return false;
    for (const n of w.nodesByTile[ti]) if (n.regrow < 99000 && U.dist(n.x, n.y, x, y) < r) return false;
    for (const b of w.buildings) if (U.dist(b.x, b.y - 30, x, y) < 150) return false;
    for (const p of w.portals) if (U.dist(p.x, p.y - 20, x, y) < 130) return false;
    for (const c of w.chests) if (U.dist(c.x, c.y, x, y) < 60) return false;
    if (w.dock && U.dist(w.dock.x, w.dock.y, x, y) < 140) return false;
    const lm = g.sys.landmarks;
    if (lm && lm.list) for (const l of lm.list) if (U.dist(l.x, l.y, x, y) < 150) return false;
    return true;
  }
  /* 屏幕外目标：边缘箭头（屏幕坐标） */
  function edgeArrow(g, ctx, wx, wy, col, label) {
    const cam = g.cam;
    const W = cam.W,
      H = cam.H;
    const s = cam.toScreen(wx, wy);
    if (s.x > 0 && s.x < W && s.y > 0 && s.y < H) return;
    const cx = W / 2,
      cy = H / 2;
    const dx = s.x - cx,
      dy = s.y - cy;
    const m = 44;
    const k = Math.min((W / 2 - m) / Math.abs(dx || 1e-6), (H / 2 - m) / Math.abs(dy || 1e-6));
    const ax = cx + dx * k,
      ay = cy + dy * k;
    const ang = Math.atan2(dy, dx);
    ctx.save();
    ctx.translate(ax, ay);
    ctx.rotate(ang);
    ctx.fillStyle = col;
    ctx.strokeStyle = OUT;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(15, 0);
    ctx.lineTo(-9, -11);
    ctx.lineTo(-3, 0);
    ctx.lineTo(-9, 11);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    if (label) {
      const lx = ax - Math.cos(ang) * 26,
        ly = ay - Math.sin(ang) * 22;
      ctx.font = 'bold 13px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = 4;
      ctx.strokeStyle = OUT;
      ctx.strokeText(label, lx, ly);
      ctx.fillStyle = '#fff4b0';
      ctx.fillText(label, lx, ly);
    }
  }

  /* ---------------- 天气 ---------------- */
  function rollWeather(day) {
    const r = Math.random();
    let w = r < 0.65 ? 'clear' : r < 0.87 ? 'rain' : 'storm';
    if (w === 'storm' && day <= 1) w = 'clear'; // 前两天不刮暴风雨
    return w;
  }
  function setWeather(g, w, announce) {
    const s = g.sys.events;
    const prev = s.weather;
    s.weather = w;
    g.recomputeMods();
    refreshHud(g);
    if (!announce || prev === w) return;
    if (w === 'rain') g.toast('下雨了：树木和稻田会长得更快');
    else if (w === 'storm') g.toast('暴风雨来了！走路会慢一点，小心闪电劈树');
    else g.toast(prev === 'storm' ? '暴风雨过去了，天晴了' : '雨停了，天晴了');
  }
  /* 闪电：劈倒玩家附近的一棵树 */
  function lightning(g) {
    const s = g.sys.events;
    const w = g.world;
    const ps = livePlayers(g);
    const trees = [];
    for (const n of w.nodes) {
      if (n.type !== 0 || n.hp <= 0 || !w.tiles[n.tile].unlocked) continue;
      if (ps.some((p) => U.dist(p.x, p.y, n.x, n.y) < 600)) trees.push(n);
    }
    A.play('boom');
    if (!trees.length) {
      s.flash = 0.6;
      return;
    }
    const n = U.pick(trees);
    n.hp = 0;
    if (n.reserved) n.reserved = null;
    const b = w.building('wood');
    n.regrow = D.INDUSTRY.wood.grow.vals[b ? b.lv[1] : 0];
    s.flash = 1;
    s.bolt = { x: n.x, y: n.y - 20, t: 0.35, seed: Math.random() * 1000 };
    g.cam.shake = Math.max(g.cam.shake, 10);
    g.fx.burst(n.x, n.y - 40, '#fff4b0', 10);
    g.fx.burst(n.x, n.y - 30, '#c98a4b', 8);
    g.fx.text(n.x, n.y - 170, '轰！雷劈倒了一棵树', '#fff4b0');
    g.addRes(0, 8, n.x, n.y - 110);
  }

  /* ---------------- HUD：天气小牌 ---------------- */
  let HUD = null;
  function mountHud(g) {
    const box = document.getElementById('weatherBox');
    if (!box) return;
    box.innerHTML = '<button class="wx-chip" type="button" aria-label="天气"><img class="pix" alt=""><span></span></button>';
    box.classList.add('on');
    const btn = box.firstChild;
    const onClick = (e) => {
      e.stopPropagation();
      const gg = PF.UI && PF.UI.game;
      if (gg && gg.sys.events) PF.UI.toast(WEATHER[gg.sys.events.weather].tip);
    };
    btn.addEventListener('click', onClick);
    HUD = { box, btn, img: btn.querySelector('img'), lab: btn.querySelector('span'), cur: '', onClick };
    refreshHud(g);
  }
  function refreshHud(g) {
    if (!HUD || !g.sys.events) return;
    const w = g.sys.events.weather;
    if (HUD.cur === w) return;
    HUD.cur = w;
    HUD.img.src = S.spriteURL(wxIcon(w), 3);
    HUD.lab.textContent = WEATHER[w].name;
    HUD.btn.className = 'wx-chip ' + w;
  }
  function unmountHud() {
    if (!HUD) return;
    HUD.btn.removeEventListener('click', HUD.onClick);
    HUD.box.classList.remove('on');
    HUD.box.innerHTML = '';
    HUD = null;
  }

  /* ---------------- 商船 ---------------- */
  const OFFERS = {
    chest: {
      title: '神秘宝箱',
      desc: '打开看看是什么好东西',
      cost: [0, 0, 0, 40],
      icon: () => S.chest(false),
      buy(g) {
        const r = Math.random();
        let k, n;
        if (r < 0.35) (k = 3), (n = U.randi(45, 80));
        else if (r < 0.6) (k = 0), (n = U.randi(80, 150));
        else if (r < 0.8) (k = 1), (n = U.randi(60, 120));
        else if (r < 0.95) (k = 2), (n = U.randi(25, 45));
        else (k = 3), (n = 120);
        const p = g.players[0];
        g.addRes(k, n, p.x, p.y - 150);
        g.toast('宝箱里有：' + D.RES[k].name + ' +' + n + (n >= 120 && k === 3 ? '（大奖！）' : ''));
      },
    },
    potion: {
      title: '疾行药水',
      desc: '2 分钟内移动速度 +30%',
      cost: [0, 0, 0, 30],
      icon: () => spr('potion', drawPotion),
      buy(g) {
        g.sys.events.potionT = 120;
        g.recomputeMods();
        g.toast('喝下疾行药水：2 分钟内移动速度 +30%');
      },
    },
    food: {
      title: '精灵口粮',
      desc: '小精灵加速 3 分钟',
      cost: [0, 0, 0, 25],
      icon: () => S.worker('idle0'),
      buy(g) {
        g.st.speedUpT += 180;
        g.toast('小精灵吃饱了：加速 3 分钟');
      },
    },
    crystal: {
      title: '紫水晶 ×30',
      desc: '用木材和水稻交换',
      cost: [120, 60, 0, 0],
      icon: () => S.icon(2),
      buy(g) {
        const p = g.players[0];
        g.addRes(2, 30, p.x, p.y - 150);
      },
    },
    map: {
      title: '古旧地图',
      desc: '上面画着新大陆的方向',
      cost: [0, 0, 0, 50],
      icon: () => spr('map', drawMapIcon),
      avail: (g) => !g.endless && !g.world.revealed && !(g.sys.landmarks && g.sys.landmarks.compass),
      buy(g) {
        if (g.sys.landmarks) g.sys.landmarks.compass = true;
        g.toast('古旧地图上画着：新大陆在' + DIR_NAME[g.world.mainDir] + '边！');
      },
    },
    gull: {
      title: '海鸥伙伴',
      desc: '会飞出去帮你叼回资源的宠物',
      cost: [0, 0, 0, 50],
      icon: () => S.gull(0),
      avail: (g) => {
        const ps = PF.Sys.get('pets');
        return !!(ps && ps.canAdopt && ps.canAdopt(g, 'gull'));
      },
      buy(g, pi) {
        const ps = PF.Sys.get('pets');
        if (ps && ps.adopt) ps.adopt(g, 'gull', pi);
      },
    },
    bait: {
      title: '高级鱼饵 ×3',
      desc: '钓鱼时更容易钓到大鱼',
      cost: [0, 0, 0, 15],
      icon: () => spr('bait', drawBait),
      avail: () => !!PF.Sys.get('fishing'),
      buy(g) {
        g.addItem('bait', 3);
        g.toast('高级鱼饵 +3：下一次抛竿会自动使用');
      },
    },
  };
  function pickOffers(g) {
    const ids = Object.keys(OFFERS).filter((k) => !OFFERS[k].avail || OFFERS[k].avail(g));
    U.shuffle(ids);
    return ids.slice(0, 3).map((id) => ({ id, bought: false }));
  }
  /* 商船停靠位置：最外圈的海岸，靠近玩家的优先 */
  function placeMerchant(g) {
    const w = g.world;
    const opts = [];
    const p0 = livePlayers(g)[0] || g.players[0];
    for (let d = 0; d < 4; d++)
      for (const t of w.outerTiles(d)) {
        if (w.dock && w.dock.tile === t.i && w.dock.dir === d) continue;
        const cx = t.c * T + T / 2,
          cy = t.r * T + T / 2;
        opts.push({ t, d, wt: 1 / (1 + U.dist(cx, cy, p0.x, p0.y) / 700) });
      }
    if (!opts.length) return null;
    let sum = 0;
    for (const o of opts) sum += o.wt;
    let r = Math.random() * sum,
      pick = opts[0];
    for (const o of opts) {
      r -= o.wt;
      if (r <= 0) {
        pick = o;
        break;
      }
    }
    const t = pick.t,
      d = pick.d;
    const a = U.rand(-70, 70);
    const cx = t.c * T + T / 2 + (d < 2 ? a : 0),
      cy = t.r * T + T / 2 + (d >= 2 ? a : 0);
    let bx, by, sx, sy;
    if (d === 0) (bx = cx), (by = t.r * T - 40), (sx = cx), (sy = t.r * T + 40);
    else if (d === 1) (bx = cx), (by = (t.r + 1) * T + 96), (sx = cx), (sy = (t.r + 1) * T - 30);
    else if (d === 2) (bx = t.c * T - 76), (by = cy + 30), (sx = t.c * T + 40), (sy = cy);
    else (bx = (t.c + 1) * T + 76), (by = cy + 30), (sx = (t.c + 1) * T - 40), (sy = cy);
    if (!w.walkable(sx, sy, 14)) return null;
    return { tile: t.i, dir: d, x: bx, y: by, sx, sy };
  }
  function startMerchant(g) {
    const s = g.sys.events;
    const pos = placeMerchant(g);
    if (!pos) return false;
    s.merchant = Object.assign(pos, { t: MERCHANT_STAY, state: 'arrive', at: 0, offers: pickOffers(g) });
    banner('商船来访', '带来了稀罕货，停留 ' + MERCHANT_STAY + ' 秒');
    g.toast('一艘商船停靠在' + DIR_NAME[pos.dir] + '边的岸边！');
    A.play('success');
    return true;
  }
  function merchantLeave(g, msg) {
    const m = g.sys.events.merchant;
    if (!m || m.state === 'leave') return;
    m.state = 'leave';
    m.at = 0;
    if (msg) g.toast(msg);
  }
  function openMerchant(g, pi) {
    const UI = PF.UI;
    const s = g.sys.events;
    const render = () => {
      const m = s.merchant;
      if (!m) return `<div class="dh"><span>商船</span><button class="x" data-act="close">✕</button></div><div class="info">商船已经起航了。</div>`;
      let body = `<div class="info">远方来的商船只停一小会儿，每样货只卖一次。<br>还有 <b>${Math.ceil(m.t)}</b> 秒起航</div>`;
      m.offers.forEach((o, i) => {
        const def = OFFERS[o.id];
        if (!def) return;
        const icon = UI.spriteIcon(def.icon());
        if (o.bought) body += `<div class="row sold"><div class="ic">${icon}</div><div class="mid"><div class="t">${def.title}</div><div class="d">${def.desc}</div></div><span class="maxed">已售出</span></div>`;
        else body += UI.upRow(icon, def.title, def.desc, def.cost, 'buy' + i, g.canAfford(def.cost) ? '' : 'lack', '购买');
      });
      return `<div class="dh"><span>商船</span><button class="x" data-act="close">✕</button></div><div class="scroll">${body}</div>`;
    };
    UI.open(
      render(),
      'w-md',
      (act) => {
        if (act === 'close') return UI.close();
        if (act.startsWith('buy')) buyOffer(g, +act.slice(3), pi);
        UI.refreshDialog();
      },
      { refresh: render }
    );
  }
  function buyOffer(g, i, pi) {
    const m = g.sys.events.merchant;
    if (!m) return;
    const o = m.offers[i];
    if (!o || o.bought) return;
    const def = OFFERS[o.id];
    if (!def) return;
    if (def.avail && !def.avail(g)) {
      g.toast('这件货现在用不上了');
      return;
    }
    if (!g.pay(def.cost)) {
      g.toast('资源不足');
      A.play('wrong');
      return;
    }
    o.bought = true;
    try {
      def.buy(g, pi);
    } catch (e) {
      console.error('[events merchant]', e);
    }
    A.play('coin');
    g.fire('stat', 'merchant', 1);
    g.save();
  }

  /* ---------------- 流星雨 / 漂流瓶 / 补给箱 ---------------- */
  function startMeteor(g) {
    const s = g.sys.events;
    if (!livePlayers(g).length) return false;
    s.shower = { t: 20, left: U.randi(6, 10), next: 1.2 };
    banner('流星雨', '躲开地上的红圈，捡起掉落的水晶碎片');
    g.toast('流星雨来了！红圈里会落下陨石');
    A.play('warn');
    return true;
  }
  function spawnMeteor(g) {
    const s = g.sys.events;
    const ps = livePlayers(g);
    if (!ps.length) return;
    const p = U.pick(ps);
    for (let k = 0; k < 20; k++) {
      const a = Math.random() * Math.PI * 2,
        d = U.rand(60, 320);
      const x = p.x + Math.cos(a) * d,
        y = p.y + Math.sin(a) * d * 0.8;
      if (!g.world.walkable(x, y, 16)) continue;
      s.meteors.push({ x, y, t: 1.1, dur: 1.1 });
      return;
    }
  }
  function meteorHit(g, m) {
    const s = g.sys.events;
    A.play('boom');
    g.cam.shake = Math.max(g.cam.shake, 6);
    g.fx.burst(m.x, m.y - 10, '#ff8a3d', 10);
    g.fx.burst(m.x, m.y - 10, '#c79bff', 6);
    for (const p of g.players) if (!p.down && U.dist(p.x, p.y, m.x, m.y) < 50) p.hurt(10, null);
    for (const w of g.workers) if (!w.dead && U.dist(w.x, w.y, m.x, m.y) < 50) w.hurt(10);
    for (const a of g.allies) if (a && !a.dead && a.canBeTargeted && a.hurt && U.dist(a.x, a.y, m.x, m.y) < 50) a.hurt(10);
    s.shards.push({ x: m.x + U.rand(-10, 10), y: m.y + U.rand(-4, 4), n: U.randi(5, 10), life: 60, t: Math.random() * 3 });
  }
  function randomTreasureSpot(g) {
    const w = g.world;
    const banned = new Set(PF.World.DEFAULT_TILES.concat([20, 24, 56, 60]));
    const cand = w.tiles.filter((t) => t.d >= 2 && !banned.has(t.i));
    const locked = cand.filter((t) => !t.unlocked),
      open = cand.filter((t) => t.unlocked);
    // 一半几率藏在迷雾里（得先驱散才能挖）
    const pool = (Math.random() < 0.5 && locked.length) || !open.length ? locked : open;
    for (let k = 0; k < 40 && pool.length; k++) {
      const t = U.pick(pool);
      const x = t.c * T + U.rand(70, T - 70),
        y = t.r * T + U.rand(90, T - 60);
      if (clearAt(g, x, y, 56)) return { x: Math.round(x), y: Math.round(y), tile: t.i };
    }
    return null;
  }
  function startBottle(g) {
    const s = g.sys.events;
    if (s.treasure) return false;
    const spot = randomTreasureSpot(g);
    if (!spot) return false;
    s.treasure = spot;
    banner('漂流瓶', '瓶子里有一张藏宝图！跟着金色箭头去挖宝');
    g.toast(g.world.tiles[spot.tile].unlocked ? '藏宝图标出了一个 ✕，去那里挖宝吧' : '宝藏埋在迷雾里——先驱散那块迷雾才能挖');
    A.play('pop');
    return true;
  }
  function startCrates(g) {
    const s = g.sys.events;
    const ps = livePlayers(g);
    if (!ps.length || s.crates.length >= 4) return false; // 地上没捡的箱子太多就不再掉
    const n = U.randi(2, 3);
    let made = 0;
    for (let i = 0; i < n; i++) {
      const p = U.pick(ps);
      for (let k = 0; k < 40; k++) {
        const a = Math.random() * Math.PI * 2,
          d = U.rand(200, 450);
        const x = p.x + Math.cos(a) * d,
          y = p.y + Math.sin(a) * d * 0.75;
        if (!g.world.walkable(x, y, 24) || !clearAt(g, x, y, 50)) continue;
        if (s.crates.some((c) => U.dist(c.x, c.y, x, y) < 90)) continue;
        s.crates.push({ x: Math.round(x), y: Math.round(y), res: Math.random() < 0.5 ? 0 : 1, n: U.randi(20, 40), fall: 1.6 + i * 0.4 });
        made++;
        break;
      }
    }
    if (!made) return false;
    banner('补给箱', '天上掉下了补给箱，快去捡');
    g.toast('补给箱从天而降：走过去就能捡');
    A.play('pop');
    return true;
  }
  const KINDS = ['merchant', 'meteor', 'bottle', 'crates'];
  function startEvent(g, kind) {
    let ok = false;
    try {
      if (kind === 'merchant') ok = startMerchant(g);
      else if (kind === 'meteor') ok = startMeteor(g);
      else if (kind === 'bottle') ok = startBottle(g);
      else if (kind === 'crates') ok = startCrates(g);
      // 这件事办不成（没地方停船、已有宝藏……）就换一件
      if (!ok && kind !== 'crates') ok = startCrates(g);
      if (!ok && kind !== 'meteor') ok = startMeteor(g);
    } catch (e) {
      console.error('[events start]', kind, e);
    }
    if (ok) g.fire('stat', 'event', 1);
    return ok;
  }
  function planDay(g, day) {
    const s = g.sys.events;
    s.plan = null;
    if (day < 1 || Math.random() >= 0.7) return;
    const wts = { merchant: 30, meteor: 22, bottle: s.treasure ? 0 : 23, crates: 25 };
    let sum = 0;
    for (const k of KINDS) sum += wts[k];
    let r = Math.random() * sum,
      kind = 'crates';
    for (const k of KINDS) {
      r -= wts[k];
      if (r <= 0) {
        kind = k;
        break;
      }
    }
    const hi = Math.max(30, g.dayLen - 40);
    s.plan = { day, at: Math.round(U.rand(25, hi)), kind };
  }
  function digTreasure(g, p) {
    const s = g.sys.events;
    const tr = s.treasure;
    if (!tr) return;
    s.treasure = null;
    const gold = U.randi(50, 120);
    const k = U.randi(0, 2);
    const n = k === 2 ? U.randi(15, 30) : U.randi(40, 80);
    g.addRes(3, gold, tr.x, tr.y - 120);
    g.later(() => g.addRes(k, n, tr.x, tr.y - 120), 350);
    g.fx.sparkle(tr.x, tr.y - 30, '#ffe36b');
    g.fx.burst(tr.x, tr.y - 10, '#a8693a', 10);
    A.play('coin');
    g.toast('挖到宝藏：金币 +' + gold + '，' + D.RES[k].name + ' +' + n);
    g.fire('stat', 'treasure', 1);
    g.save();
  }

  /* ---------------- 绘制辅助 ---------------- */
  function drawX(ctx, x, y, a) {
    ctx.globalAlpha = a;
    ctx.fillStyle = 'rgba(90,58,36,0.55)';
    ctx.beginPath();
    ctx.ellipse(x, y, 46, 18, 0, 0, Math.PI * 2);
    ctx.fill();
    const sq = (col, pad) => {
      ctx.fillStyle = col;
      for (let k = -3; k <= 3; k++) {
        ctx.fillRect(x + k * 9 - 6 - pad, y + k * 4 - 4 - pad, 12 + pad * 2, 8 + pad * 2);
        ctx.fillRect(x - k * 9 - 6 - pad, y + k * 4 - 4 - pad, 12 + pad * 2, 8 + pad * 2);
      }
    };
    sq(OUT, 3);
    sq('#e0473c', 0);
    ctx.globalAlpha = 1;
  }
  function boatPos(g, m) {
    const [vx, vy] = DIRV[m.dir];
    let off = 0;
    if (m.state === 'arrive') off = (1 - U.easeOut(Math.min(1, m.at / 3))) * 600;
    else if (m.state === 'leave') off = U.easeIn(Math.min(1, m.at / 3)) * 600;
    return { x: m.x + vx * off, y: m.y + vy * off };
  }

  PF.Sys.register({
    id: 'events',
    order: 40,
    init(g, saved, fresh) {
      const s = {
        weather: 'clear',
        plan: null,
        merchant: null,
        treasure: null,
        crates: [],
        potionT: 0,
      };
      if (saved && typeof saved === 'object') {
        if (WEATHER[saved.weather]) s.weather = saved.weather;
        if (saved.plan && saved.plan.day === g.st.day && KINDS.includes(saved.plan.kind)) s.plan = saved.plan;
        const m = saved.merchant;
        if (m && g.world.tiles[m.tile] && g.world.tiles[m.tile].unlocked && m.t > 0 && Array.isArray(m.offers)) {
          s.merchant = Object.assign({}, m, { state: 'dock', at: 0, offers: m.offers.filter((o) => OFFERS[o.id]) });
        }
        const tr = saved.treasure;
        if (tr && g.world.tiles[tr.tile]) s.treasure = { x: tr.x, y: tr.y, tile: tr.tile };
        if (Array.isArray(saved.crates)) s.crates = saved.crates.filter((c) => c && g.world.unlockedAt(c.x, c.y)).map((c) => ({ x: c.x, y: c.y, res: c.res ? 1 : 0, n: c.n | 0, fall: 0 }));
        s.potionT = Math.max(0, +saved.potionT || 0);
      }
      // 只在本局里用的临时状态（不存档）
      s.shards = [];
      s.meteors = [];
      s.shower = null;
      s.boltT = U.rand(12, 20);
      s.bolt = null;
      s.flash = 0;
      g.sys.events = s;
      mountHud(g);
    },
    serialize(g) {
      const s = g.sys.events;
      if (!s) return null;
      const m = s.merchant;
      return {
        weather: s.weather,
        plan: s.plan,
        merchant: m && m.state !== 'leave' ? { tile: m.tile, dir: m.dir, x: m.x, y: m.y, sx: m.sx, sy: m.sy, t: Math.round(m.t), offers: m.offers } : null,
        treasure: s.treasure,
        crates: s.crates.map((c) => ({ x: c.x, y: c.y, res: c.res, n: c.n })),
        potionT: Math.round(s.potionT),
      };
    },
    destroy() {
      unmountHud();
    },
    mods(g, m) {
      const s = g.sys.events;
      if (!s) return;
      if (s.weather === 'rain') m.regrowMul *= 1.8;
      else if (s.weather === 'storm') {
        m.regrowMul *= 1.5;
        m.playerSpeedMul *= 0.92;
        m.darknessMul *= 1.1;
      }
      if (s.potionT > 0) m.playerSpeedMul *= 1.3;
    },
    dawn(g, day) {
      const s = g.sys.events;
      if (!s) return;
      setWeather(g, rollWeather(day), true);
      planDay(g, day);
    },
    night(g) {
      if (g.sys.events && g.sys.events.merchant) merchantLeave(g, '天黑了，商船起航离开了');
    },
    unlock(g, tile) {
      const s = g.sys.events;
      if (s && s.treasure && s.treasure.tile === tile.i) g.later(() => g.toast('迷雾散开，藏宝图上的 ✕ 露出来了！'), 900);
    },
    update(g, dt) {
      const s = g.sys.events;
      if (!s) return;
      const st = g.st;
      // 疾行药水
      if (s.potionT > 0) {
        s.potionT -= dt;
        if (s.potionT <= 0) {
          s.potionT = 0;
          g.recomputeMods();
          g.toast('疾行药水的效果消失了');
        }
      }
      // 暴风雨：打雷
      if (s.flash > 0) s.flash = Math.max(0, s.flash - dt * 2.5);
      if (s.bolt) {
        s.bolt.t -= dt;
        if (s.bolt.t <= 0) s.bolt = null;
      }
      if (s.weather === 'storm' && !g.over) {
        s.boltT -= dt;
        if (s.boltT <= 0) {
          s.boltT = U.rand(12, 20);
          lightning(g);
        }
      }
      // 当天的随机事件
      if (s.plan) {
        if (s.plan.day !== st.day) s.plan = null;
        else if (st.cycleT >= s.plan.at && !g.isNight() && !g.over) {
          const k = s.plan.kind;
          s.plan = null;
          startEvent(g, k);
        }
      }
      // 商船
      const m = s.merchant;
      if (m) {
        m.at += dt;
        if (m.state === 'arrive' && m.at >= 3) {
          m.state = 'dock';
          m.at = 0;
        } else if (m.state === 'dock') {
          m.t -= dt;
          if (m.t <= 0) merchantLeave(g, '商船起航离开了');
        } else if (m.state === 'leave' && m.at >= 3) s.merchant = null;
      }
      // 流星雨
      if (s.shower) {
        const sh = s.shower;
        sh.t -= dt;
        sh.next -= dt;
        if (sh.left > 0 && sh.next <= 0) {
          sh.left--;
          sh.next = Math.max(0.8, (sh.t - 1.5) / Math.max(1, sh.left));
          spawnMeteor(g);
        }
        if (sh.t <= 0 || (sh.left <= 0 && !s.meteors.length)) s.shower = null;
      }
      if (s.meteors.length) {
        for (const mt of s.meteors) {
          mt.t -= dt;
          if (mt.t <= 0 && !mt.hit) {
            mt.hit = true;
            meteorHit(g, mt);
          }
        }
        s.meteors = s.meteors.filter((mt) => !mt.hit);
      }
      // 水晶碎片 / 补给箱：走过去自动捡
      if (s.shards.length) {
        for (const sd of s.shards) {
          sd.life -= dt;
          sd.t += dt;
          for (const p of g.players) {
            if (p.down || sd.got) continue;
            if (U.dist(p.x, p.y, sd.x, sd.y) < 56) {
              sd.got = true;
              g.addRes(2, sd.n, sd.x, sd.y - 80);
              g.fx.sparkle(sd.x, sd.y - 20, '#c79bff');
              A.play('mine');
            }
          }
        }
        s.shards = s.shards.filter((sd) => !sd.got && sd.life > 0);
      }
      if (s.crates.length) {
        for (const c of s.crates) {
          if (c.fall > 0) {
            c.fall -= dt;
            if (c.fall <= 0) {
              c.fall = 0;
              g.fx.burst(c.x, c.y, '#d9c08a', 6);
              A.play('fall');
            }
            continue;
          }
          for (const p of g.players) {
            if (p.down || c.got) continue;
            if (U.dist(p.x, p.y, c.x, c.y) < 62) {
              c.got = true;
              g.addRes(c.res, c.n, c.x, c.y - 90);
              g.fx.burst(c.x, c.y - 20, '#b07a45', 8);
              A.play('pop');
            }
          }
        }
        if (s.crates.some((c) => c.got)) s.crates = s.crates.filter((c) => !c.got);
      }
    },
    prompt(g, p) {
      const s = g.sys.events;
      if (!s) return null;
      const m = s.merchant;
      if (m && m.state === 'dock' && U.dist(p.x, p.y, m.sx, m.sy) < 120) return { label: '商船', btn: '交易', note: '每样货只卖一次', what: 'merchant' };
      const tr = s.treasure;
      if (tr && g.world.tiles[tr.tile].unlocked && U.dist(p.x, p.y, tr.x, tr.y) < 72) return { label: '挖宝', btn: '挖宝', what: 'treasure' };
      return null;
    },
    act(g, pi, pr) {
      if (pr.what === 'merchant') openMerchant(g, pi);
      else if (pr.what === 'treasure') digTreasure(g, g.players[pi]);
    },
    drawGround(g, ctx, cam) {
      CTX = ctx;
      const s = g.sys.events;
      if (!s) return;
      const w = g.world;
      const tr = s.treasure;
      if (tr && cam.visible(tr.x, tr.y, 80)) {
        const a = w.tiles[tr.tile].unlocked ? 1 : w.previewAmt[tr.tile] * 0.85;
        if (a > 0.04) drawX(ctx, tr.x, tr.y, a);
      }
      // 商船的跳板
      const m = s.merchant;
      if (m && m.state === 'dock' && cam.visible(m.sx, m.sy, 260)) {
        ctx.fillStyle = '#8a5a35';
        const bp = { x: m.x, y: m.y - 20 };
        if (m.dir < 2) {
          const y0 = Math.min(bp.y, m.sy),
            y1 = Math.max(bp.y, m.sy);
          ctx.fillRect(m.sx - 16, y0, 32, y1 - y0);
          ctx.fillStyle = '#b07a45';
          for (let y = y0 + 4; y < y1; y += 14) ctx.fillRect(m.sx - 16, y, 32, 6);
        } else {
          const x0 = Math.min(bp.x, m.sx),
            x1 = Math.max(bp.x, m.sx);
          ctx.fillRect(x0, m.sy - 14, x1 - x0, 28);
          ctx.fillStyle = '#b07a45';
          for (let x = x0 + 4; x < x1; x += 14) ctx.fillRect(x, m.sy - 14, 6, 28);
        }
      }
      // 陨石落点预警
      for (const mt of s.meteors) {
        const p = 1 - mt.t / mt.dur;
        ctx.globalAlpha = 0.35 + 0.35 * Math.abs(Math.sin(g.time * 14));
        ctx.strokeStyle = '#ff3b30';
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.ellipse(mt.x, mt.y, 50, 22, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 0.25 + 0.3 * p;
        ctx.fillStyle = '#ff3b30';
        ctx.beginPath();
        ctx.ellipse(mt.x, mt.y, 50 * p, 22 * p, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    },
    drawables(g, add, cam) {
      const s = g.sys.events;
      if (!s || !CTX) return;
      for (const c of s.crates) {
        if (!cam.visible(c.x, c.y, 600)) continue;
        add(c.y, () => {
          const ctx = CTX;
          const h = c.fall > 0 ? c.fall * 340 : 0;
          const k = 1 - Math.min(1, h / 600);
          E.shadow(ctx, c.x, c.y, 30 * (0.5 + 0.5 * k), 9 * (0.5 + 0.5 * k), 0.25);
          if (h > 0) E.drawSprite(ctx, spr('chute', drawChute), c.x, c.y - h - 36);
          E.drawSprite(ctx, spr('crate', drawCrate), c.x, c.y + 4 - h, { scale: 1.25 });
        });
      }
      for (const sd of s.shards) {
        if (!cam.visible(sd.x, sd.y, 60)) continue;
        add(sd.y, () => {
          const ctx = CTX;
          if (sd.life < 8 && Math.floor(sd.life * 6) % 2 === 0) return;
          const bob = Math.abs(Math.sin(sd.t * 3)) * 6;
          ctx.globalAlpha = 0.25 + Math.sin(sd.t * 5) * 0.12;
          ctx.fillStyle = '#c79bff';
          ctx.beginPath();
          ctx.ellipse(sd.x, sd.y, 34, 13, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha = 1;
          E.shadow(ctx, sd.x, sd.y, 20, 7, 0.25);
          E.drawSprite(ctx, S.crystal(false, 1), sd.x, sd.y + 2 - bob, { scale: 0.8 });
        });
      }
    },
    /* 商船停在雾边的海面上：画在迷雾上面，免得被云团盖住 */
    drawOverFog(g, ctx, cam) {
      const s = g.sys.events;
      const m = s && s.merchant;
      if (!m) return;
      const bp = boatPos(g, m);
      if (!cam.visible(bp.x, bp.y, 300)) return;
      const bob = Math.sin(g.time * 2) * 3;
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.fillRect(bp.x - 80, bp.y - 6 + bob, 160, 6);
      E.drawSprite(ctx, spr('boat', drawBoat), bp.x, bp.y + 10 + bob, { scale: BOAT_SCALE, flip: m.dir === 2 });
      if (m.state === 'dock') g.namePlate(ctx, bp.x, bp.y - 150, '商船 ' + Math.ceil(m.t) + '秒', '#fff4b0');
    },
    drawTop(g, ctx, cam) {
      const s = g.sys.events;
      if (!s) return;
      // 下落中的陨石
      for (const mt of s.meteors) {
        const p = 1 - mt.t / mt.dur;
        const k = 1 - p;
        const x = mt.x + k * 260,
          y = mt.y - k * 760;
        ctx.globalAlpha = 0.5;
        ctx.fillStyle = '#ffb238';
        for (let i = 1; i <= 5; i++) {
          const sz = 18 - i * 2.5;
          ctx.fillRect(x + i * 16 - sz / 2, y - i * 46 - sz / 2, sz, sz);
        }
        ctx.globalAlpha = 1;
        ctx.fillStyle = OUT;
        ctx.fillRect(x - 15, y - 15, 30, 30);
        ctx.fillStyle = '#ff6a2a';
        ctx.fillRect(x - 12, y - 12, 24, 24);
        ctx.fillStyle = '#ffd23f';
        ctx.fillRect(x - 6, y - 10, 12, 12);
      }
    },
    lights(g, light) {
      const s = g.sys.events;
      if (!s) return;
      if (s.merchant) {
        const bp = boatPos(g, s.merchant);
        light(bp.x, bp.y - 60, 220, 0.75);
      }
      for (const sd of s.shards) light(sd.x, sd.y - 20, 90, 0.5);
      for (const mt of s.meteors) light(mt.x, mt.y, 110, 0.6);
    },
    minimap(g, dot) {
      const s = g.sys.events;
      if (!s) return;
      if (s.treasure) dot(s.treasure.x, s.treasure.y, '#ffd23f', 5);
      if (s.merchant && s.merchant.state === 'dock') dot(s.merchant.x, s.merchant.y, '#7fe08a', 6);
      for (const c of s.crates) dot(c.x, c.y, '#c98a4b', 4);
    },
    drawScreen(g, ctx, dpr, cam) {
      const s = g.sys.events;
      if (!s) return;
      const W = cam.W,
        H = cam.H;
      const wx = s.weather;
      if (wx !== 'clear') {
        const storm = wx === 'storm';
        const dark = g.darkness();
        ctx.fillStyle = storm ? `rgba(28,36,70,${0.22 * (1 - dark * 0.5)})` : `rgba(40,64,96,${0.1 * (1 - dark * 0.5)})`;
        ctx.fillRect(0, 0, W, H);
        const n = Math.round((storm ? 150 : 90) * Math.min(1.4, (W * H) / (1000 * 700) + 0.3));
        const sl = storm ? 0.32 : 0.16,
          len = storm ? 28 : 18,
          sp = storm ? 1250 : 850;
        ctx.strokeStyle = storm ? 'rgba(205,220,255,0.55)' : 'rgba(195,225,255,0.45)';
        ctx.lineWidth = storm ? 2 : 1.5;
        ctx.beginPath();
        for (let i = 0; i < n; i++) {
          const h1 = U.hash(i, 7, 3),
            h2 = U.hash(i, 11, 5);
          const y = ((h2 * (H + 60) + g.time * sp * (0.8 + h1 * 0.4)) % (H + 60)) - 30;
          const x = ((((h1 * (W + 120) + y * sl) % (W + 120)) + (W + 120)) % (W + 120)) - 60;
          ctx.moveTo(x, y);
          ctx.lineTo(x - len * sl, y - len);
        }
        ctx.stroke();
      }
      // 闪电（画在迷雾和夜色之上）
      const b = s.bolt;
      if (b) {
        const r = U.rng(b.seed | 0);
        const pts = [];
        let x = b.x + (r() - 0.5) * 160;
        for (let i = 0; i <= 8; i++) {
          const y = b.y - 900 + (900 * i) / 8;
          const q = cam.toScreen(i === 8 ? b.x : x, y);
          pts.push([q.x, q.y]);
          x += (r() - 0.5) * 90 + (b.x - x) * 0.25;
        }
        ctx.globalAlpha = Math.min(1, b.t * 4);
        ctx.lineJoin = 'miter';
        for (const [lw, col] of [
          [14, 'rgba(255,240,150,0.55)'],
          [5, '#ffffff'],
        ]) {
          ctx.strokeStyle = col;
          ctx.lineWidth = Math.max(2, lw * cam.z);
          ctx.beginPath();
          pts.forEach((q, i) => (i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1])));
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
      }
      if (s.flash > 0) {
        ctx.fillStyle = `rgba(255,255,255,${s.flash * 0.45})`;
        ctx.fillRect(0, 0, W, H);
      }
      // 屏幕外的宝藏 / 商船
      if (s.treasure) edgeArrow(g, ctx, s.treasure.x, s.treasure.y, '#ffd23f', '宝藏');
      if (s.merchant && s.merchant.state === 'dock') edgeArrow(g, ctx, s.merchant.sx, s.merchant.sy, '#7fe08a', '商船');
    },
    help() {
      return '<p><b>天气：</b>每天清晨会变天。下雨时树木、稻田长得更快；暴风雨时长得也快，但走路慢一点、夜里更黑，闪电还会劈倒附近的树（能捡到木材）。点右上角的天气牌可以看说明。</p>' + '<p><b>随机事件：</b>白天偶尔会有商船来访（限时买稀罕货）、流星雨（躲开红圈，捡水晶碎片）、漂流瓶（跟着金色箭头去挖宝）或补给箱。</p>';
    },
    /* 调试 / 其他系统用 */
    start(g, kind) {
      return startEvent(g, kind);
    },
    setWeather(g, w) {
      if (WEATHER[w] && g.sys.events) setWeather(g, w, true);
    },
  });
})();
