/* 钓鱼（系统 id: fishing）
   - 岸边浅水里会冒出 2~3 个“冒泡点”，站在旁边的岸上点“钓鱼”抛竿
   - 浮漂一沉、头顶出现“！”，下方出现计时条：标记扫到绿色区域时点“收竿！”
   - 鱼放在 g.st.items 里（fish_s / fish_m / fish_l / fish_r，高级鱼饵 bait）
   - 营地“烹饪”：烤鱼、鱼汤、海鲜大餐；集市“卖鱼”换金币
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

  // 渔获表：p 普通概率，pb 用了高级鱼饵的概率；zone 绿色区宽度（越稀有越窄），speed 标记来回扫的速度
  const CATCH = [
    { key: 'fish_s', name: '小鱼', p: 60, pb: 40, price: 4, zone: 0.3, speed: 3.0 },
    { key: 'fish_m', name: '鲈鱼', p: 25, pb: 33, price: 8, zone: 0.24, speed: 3.8 },
    { key: 'fish_l', name: '金枪鱼', p: 8, pb: 15, price: 20, zone: 0.17, speed: 4.6 },
    { key: 'fish_r', name: '彩虹鱼', p: 2, pb: 6, price: 50, zone: 0.12, speed: 5.4 },
    { key: 'chest', name: '小宝箱', p: 3, pb: 5, zone: 0.22, speed: 3.6 },
    { key: 'boot', name: '破靴子', p: 2, pb: 1, zone: 0.32, speed: 2.6 },
  ];
  const FISH = CATCH.slice(0, 4);
  const FISH_KEYS = FISH.map((f) => f.key);
  const byKey = {};
  for (const c of CATCH) byKey[c.key] = c;
  const SPOT_LIFE = 90;
  const RESPAWN = 20;
  const BITE_TIME = 3.5;

  const RECIPES = [
    { id: 'grill', title: '烤鱼', desc: '回复 60 生命，移动速度 +10%（90 秒）', keys: ['fish_s', 'fish_m'], n: 1 },
    { id: 'soup', title: '鱼汤', desc: '小精灵速度 +30%（2 分钟）', keys: ['fish_s'], n: 3 },
    { id: 'feast', title: '海鲜大餐', desc: '攻击力 +5，一直持续到天亮', keys: ['fish_l', 'fish_r'], n: 1 },
  ];

  /* ---------------- 像素图 ---------------- */
  const SP = {};
  const spr = (k, fn) => SP[k] || (SP[k] = fn());
  const FISH_ROWS = [
    '....bbbb.......',
    '..bbbbbbbb...f.',
    '.bbebbbbbbb.ff.',
    'bbbbbbbbbbbbfff',
    'bwwwwwwwwwbbfff',
    '.wwwwwwwwwb.ff.',
    '..wwwwwwww...f.',
    '....wwww.......',
  ];
  const RAINBOW = ['#ff5a4f', '#ffb238', '#ffd23f', '#5bd16a', '#4f9dff', '#b17cff'];
  function drawFish(key) {
    const p = new S.PC(15, 8);
    if (key === 'fish_r') {
      for (let j = 0; j < FISH_ROWS.length; j++)
        for (let i = 0; i < 15; i++) {
          const ch = FISH_ROWS[j][i];
          if (ch === 'b') p.p(i, j, RAINBOW[Math.floor(i / 2.2) % 6]);
          else if (ch === 'w') p.p(i, j, S.mix(RAINBOW[Math.floor(i / 2.2) % 6], '#ffffff', 0.6));
          else if (ch === 'f') p.p(i, j, '#ff8fb0');
          else if (ch === 'e') p.p(i, j, OUT);
        }
    } else {
      const pal = { fish_s: ['#8fc9e8', '#e8f4fb', '#5b9cc4'], fish_m: ['#7fb85a', '#e8f0c8', '#4f8a3f'], fish_l: ['#3f5f9a', '#c8d4e8', '#2a3f6a'], grill: ['#c98a4b', '#e8c08a', '#8a5a35'] }[key];
      p.grid(FISH_ROWS, { b: pal[0], w: pal[1], f: pal[2], e: OUT });
      if (key === 'fish_m') for (const i of [4, 7]) for (let j = 1; j < 5; j++) if (FISH_ROWS[j][i] === 'b') p.p(i, j, '#4f8a3f');
      if (key === 'fish_l') p.r(1, 3, 11, 1, '#ffd23f');
      if (key === 'grill') for (const i of [3, 6, 9]) p.p(i, 3, '#5b3a24');
    }
    p.outline(OUT);
    return p.c;
  }
  const fishImg = (key) => spr('f' + key, () => drawFish(key));
  function drawBoot() {
    const p = new S.PC(11, 11);
    p.r(2, 0, 5, 7, '#8a5a35');
    p.r(2, 7, 8, 3, '#8a5a35');
    p.r(2, 10, 9, 1, '#5b3a24');
    p.r(3, 1, 1, 5, '#a8693a');
    p.p(8, 8, '#5b3a24');
    p.p(5, 3, '#2a1a14');
    p.p(9, 7, '#2a1a14');
    p.outline(OUT);
    return p.c;
  }
  function drawGrill() {
    const p = new S.PC(16, 11);
    p.line(0, 10, 15, 2, '#d9c08a');
    p.outline(OUT);
    const f = fishImg('grill');
    p.x.drawImage(f, 0, 1);
    return p.c;
  }
  function drawSoup() {
    const p = new S.PC(13, 11);
    p.r(1, 5, 11, 2, '#c98a4b');
    p.r(2, 7, 9, 2, '#a8693a');
    p.r(4, 9, 5, 1, '#8a5a35');
    p.r(2, 4, 9, 1, '#e8c55a');
    p.r(8, 2, 2, 2, '#8fc9e8');
    p.p(10, 3, '#8fc9e8');
    p.outline(OUT);
    p.p(3, 0, '#ffffff');
    p.p(4, 1, '#ffffff');
    p.p(6, 1, '#ffffff');
    return p.c;
  }
  function drawFeast() {
    const p = new S.PC(17, 10);
    for (let i = 0; i < 17; i++) for (let j = 5; j < 10; j++) if (Math.pow((i + 0.5 - 8.5) / 8.5, 2) + Math.pow((j + 0.5 - 7.5) / 2.5, 2) <= 1) p.p(i, j, j < 7 ? '#ffffff' : '#c9ccd8');
    p.outline(OUT);
    p.x.drawImage(fishImg('fish_l'), 1, 0);
    p.p(14, 4, '#5bd16a');
    p.p(15, 5, '#5bd16a');
    p.p(2, 6, '#ff5a4f');
    return p.c;
  }
  function catchImg(key) {
    if (key === 'boot') return spr('boot', drawBoot);
    if (key === 'chest') return S.chest(false);
    return fishImg(key);
  }
  const recipeImg = (id) => (id === 'grill' ? spr('grill', drawGrill) : id === 'soup' ? spr('soup', drawSoup) : spr('feast', drawFeast));

  /* ---------------- 工具 ---------------- */
  let CTX = null;
  function fishTotal(g) {
    let n = 0;
    for (const k of FISH_KEYS) n += g.item(k);
    return n;
  }
  /* 按 keys 的顺序拿走 n 条鱼，不够就不拿，返回是否成功 */
  function takeFish(g, n, keys) {
    keys = keys || FISH_KEYS;
    let have = 0;
    for (const k of keys) have += g.item(k);
    if (have < n) return false;
    let left = n;
    for (const k of keys) {
      const t = Math.min(left, g.item(k));
      if (t > 0) g.addItem(k, -t);
      left -= t;
      if (!left) break;
    }
    return true;
  }
  function rollCatch(bait) {
    let sum = 0;
    for (const c of CATCH) sum += bait ? c.pb : c.p;
    let r = Math.random() * sum;
    for (const c of CATCH) {
      r -= bait ? c.pb : c.p;
      if (r <= 0) return c;
    }
    return CATCH[0];
  }
  function canFishYet(g) {
    return g.world.unlockedCount() > 5 || g.st.day >= 1;
  }

  /* ---------------- 冒泡点 ---------------- */
  /* 所有露在外面的海岸边：[地块, 方向, 外面是锁着的地块?] */
  function shoreEdges(g) {
    const w = g.world;
    const out = [];
    for (const t of w.tiles) {
      if (!t.unlocked) continue;
      for (let d = 0; d < 4; d++) {
        const rr = t.r + [-1, 1, 0, 0][d],
          cc = t.c + [0, 0, -1, 1][d];
        const off = rr < 0 || cc < 0 || rr >= N || cc >= N;
        if (!off && w.tiles[rr * N + cc].unlocked) continue;
        if (w.dock && w.dock.tile === t.i && w.dock.dir === d) continue;
        const m = g.sys.events && g.sys.events.merchant;
        if (m && m.tile === t.i && m.dir === d) continue;
        out.push({ t, d, locked: !off });
      }
    }
    return out;
  }
  function spotFor(g, e) {
    const t = e.t,
      d = e.d;
    const a = U.rand(70, T - 70);
    let x, y, ax, ay;
    if (d === 0) {
      x = ax = t.c * T + a;
      y = t.r * T - U.rand(30, 48);
      ay = t.r * T + 28;
    } else if (d === 1) {
      x = ax = t.c * T + a;
      y = (t.r + 1) * T + 56 + U.rand(14, 28);
      ay = (t.r + 1) * T - 22;
    } else if (d === 2) {
      y = ay = t.r * T + a;
      x = t.c * T - U.rand(30, 48);
      ax = t.c * T + 26;
    } else {
      y = ay = t.r * T + a;
      x = (t.c + 1) * T + U.rand(30, 48);
      ax = (t.c + 1) * T - 26;
    }
    const w = g.world;
    if (w.unlockedAt(x, y) || !w.walkable(ax, ay, 14)) return null;
    return { x: Math.round(x), y: Math.round(y), ax: Math.round(ax), ay: Math.round(ay), tile: t.i, dir: d, locked: e.locked, life: SPOT_LIFE, t: Math.random() * 5 };
  }
  function spawnSpot(g) {
    const s = g.sys.fishing;
    const edges = shoreEdges(g);
    if (!edges.length) return false;
    const ps = g.players.filter((p) => !p.down);
    const ref = ps.length ? ps : g.players;
    // 离玩家近的岸边、朝外海的岸边更容易冒泡
    for (const e of edges) {
      const cx = e.t.c * T + T / 2,
        cy = e.t.r * T + T / 2;
      let dmin = 1e9;
      for (const p of ref) dmin = Math.min(dmin, U.dist(p.x, p.y, cx, cy));
      e.wt = (e.locked ? 1 : 1.6) / Math.pow(1 + dmin / 600, 2);
    }
    for (let k = 0; k < 12; k++) {
      let sum = 0;
      for (const e of edges) sum += e.wt;
      let r = Math.random() * sum,
        pick = edges[0];
      for (const e of edges) {
        r -= e.wt;
        if (r <= 0) {
          pick = e;
          break;
        }
      }
      const sp = spotFor(g, pick);
      if (!sp) continue;
      if (s.spots.some((o) => U.dist(o.x, o.y, sp.x, sp.y) < 260)) continue;
      s.spots.push(sp);
      if (!s.tip) {
        s.tip = true;
        g.toast('岸边的水面在冒泡——站在旁边的岸上就能钓鱼！');
      }
      return true;
    }
    return false;
  }

  /* ---------------- 抛竿 / 收竿 ---------------- */
  function cast(g, pi, spot) {
    const s = g.sys.fishing;
    const p = g.players[pi];
    if (!p || p.down || !spot) return;
    let bait = false;
    if (g.item('bait') > 0) {
      g.addItem('bait', -1);
      bait = true;
    }
    const fish = rollCatch(bait);
    s.act[pi] = { spot, phase: 'cast', t: 0, wait: U.rand(1, 3), fish, bait, zc: U.rand(0.28, 0.72), m: 0 };
    p.actKind = null;
    p.face = spot.x >= p.x ? 1 : -1;
    A.play('pop');
  }
  function stopFishing(g, pi, msg, col) {
    const s = g.sys.fishing;
    const f = s.act[pi];
    if (!f) return;
    s.act[pi] = null;
    const p = g.players[pi];
    if (msg && p) g.fx.text(p.x, p.y - 140, msg, col || '#ffffff');
  }
  function reel(g, pi) {
    const s = g.sys.fishing;
    const f = s.act[pi];
    if (!f) return;
    if (f.phase !== 'bite') {
      A.play('wrong');
      return stopFishing(g, pi, '太早了，鱼被吓跑了', '#ffb0a8');
    }
    const half = f.fish.zone / 2;
    if (Math.abs(f.m - f.zc) <= half + 0.02) landCatch(g, pi, f);
    else {
      A.play('fail');
      stopFishing(g, pi, '鱼跑了……', '#ffb0a8');
    }
  }
  function landCatch(g, pi, f) {
    const s = g.sys.fishing;
    const p = g.players[pi];
    s.act[pi] = null;
    const c = f.fish;
    s.spots = s.spots.filter((x) => x !== f.spot);
    g.fx.splash(f.spot.x, f.spot.y);
    s.fly.push({ key: c.key, x0: f.spot.x, y0: f.spot.y, x1: p.x, y1: p.y - 60, t: 0 });
    if (byKey[c.key] && FISH_KEYS.includes(c.key)) {
      g.addItem(c.key, 1);
      s.caught++;
      g.fx.text(p.x, p.y - 150, c.name + ' +1', c.key === 'fish_r' ? '#ffe36b' : '#bfe9ff', c.key === 'fish_r' || c.key === 'fish_l');
      A.play('success');
      g.fire('stat', 'fish', 1);
      if (c.key === 'fish_r') {
        g.fire('stat', 'rareFish', 1);
        g.toast('钓到了传说中的彩虹鱼！');
      } else if (c.key === 'fish_l') g.toast('钓到一条大金枪鱼！');
    } else if (c.key === 'chest') {
      g.addRes(3, 30, p.x, p.y - 150);
      A.play('coin');
      g.toast('钓到一个小宝箱：金币 +30');
    } else {
      g.fx.text(p.x, p.y - 150, '破靴子……', '#d8d2c0');
      A.play('pop');
    }
  }

  /* ---------------- 料理 ---------------- */
  function canCook(g, r) {
    if (r.id === 'feast' && g.sys.fishing.buffs.feast) return false;
    let have = 0;
    for (const k of r.keys) have += g.item(k);
    return have >= r.n;
  }
  function cook(g, id, pi) {
    const s = g.sys.fishing;
    const r = RECIPES.find((x) => x.id === id);
    if (!r) return;
    if (r.id === 'feast' && s.buffs.feast) {
      g.toast('海鲜大餐的力量还在，天亮前不用再吃');
      return;
    }
    if (!takeFish(g, r.n, r.keys)) {
      g.toast('鱼不够，去岸边钓几条吧');
      A.play('wrong');
      return;
    }
    const b = s.buffs;
    if (r.id === 'grill') {
      const p = g.players[pi] || g.players[0];
      if (!p.down) {
        const add = Math.min(60, p.hpMax - p.hp);
        p.hp += add;
        if (add > 0) g.fx.text(p.x, p.y - 140, '+' + Math.round(add), '#9be38a');
      }
      b.grillT = 90;
      g.toast('吃了烤鱼：回复生命，移动速度 +10%（90 秒）');
    } else if (r.id === 'soup') {
      b.soupT = 120;
      g.toast('小精灵喝了鱼汤：速度 +30%（2 分钟）');
    } else {
      b.feast = true;
      g.toast('海鲜大餐！攻击力 +5，持续到天亮');
    }
    g.recomputeMods();
    A.play('heal');
    g.fire('stat', 'cook', 1);
    g.save();
  }
  function fishCostHTML(g, keys, n) {
    let have = 0;
    for (const k of keys) have += g.item(k);
    const lack = have < n;
    return `<span class="cost fishc${lack ? ' lack' : ''}">${keys.map((k) => `<img src="${S.spriteURL(fishImg(k), 2)}" alt="">`).join('<i>/</i>')}×${n}</span>`;
  }
  function bagHTML(g) {
    return `<div class="fishbag">${FISH.map((f) => `<span class="${g.item(f.key) ? '' : 'none'}"><img class="pix" src="${S.spriteURL(fishImg(f.key), 2)}" alt="">${f.name} ${g.item(f.key)}</span>`).join('')}${g.item('bait') ? `<span>高级鱼饵 ${g.item('bait')}</span>` : ''}</div>`;
  }

  /* ---------------- HUD：鱼的数量 ---------------- */
  let PILL = null;
  function mountPill() {
    const res = document.querySelector('#hud .res');
    if (!res) return;
    res.querySelectorAll('.fishpill').forEach((e) => e.remove()); // 上一局没清干净的
    const el = document.createElement('div');
    el.className = 'pill fishpill';
    el.innerHTML = `<img alt="鱼" src="${S.spriteURL(fishImg('fish_s'), 3)}"><span>0</span>`;
    res.appendChild(el);
    PILL = { el, num: el.querySelector('span'), n: -1, on: false };
  }
  function refreshPill(g) {
    if (!PILL) return;
    const n = fishTotal(g);
    if (n !== PILL.n) {
      if (n > PILL.n && PILL.n >= 0) {
        PILL.el.classList.remove('bump');
        void PILL.el.offsetWidth;
        PILL.el.classList.add('bump');
      }
      PILL.n = n;
      PILL.num.textContent = n;
    }
    const on = n > 0;
    if (on !== PILL.on) {
      PILL.on = on;
      PILL.el.classList.toggle('on', on);
    }
  }
  function unmountPill() {
    if (PILL) PILL.el.remove();
    PILL = null;
  }

  PF.Sys.register({
    id: 'fishing',
    order: 44,
    init(g, saved) {
      const s = {
        spots: [],
        act: [null, null],
        fly: [],
        respawnT: 8,
        caught: 0,
        tip: false,
        buffs: { grillT: 0, soupT: 0, feast: false },
        pillT: 0,
      };
      if (saved && typeof saved === 'object') {
        s.caught = saved.caught | 0;
        s.tip = !!saved.tip;
        const b = saved.buffs || {};
        s.buffs.grillT = Math.max(0, +b.grillT || 0);
        s.buffs.soupT = Math.max(0, +b.soupT || 0);
        s.buffs.feast = !!b.feast;
      }
      g.sys.fishing = s;
      mountPill();
      refreshPill(g);
    },
    serialize(g) {
      const s = g.sys.fishing;
      if (!s) return null;
      return { caught: s.caught, tip: s.tip, buffs: { grillT: Math.round(s.buffs.grillT), soupT: Math.round(s.buffs.soupT), feast: s.buffs.feast } };
    },
    destroy() {
      unmountPill();
    },
    mods(g, m) {
      const s = g.sys.fishing;
      if (!s) return;
      const b = s.buffs;
      if (b.grillT > 0) m.playerSpeedMul *= 1.1;
      if (b.soupT > 0) m.workerSpeedMul *= 1.3;
      if (b.feast) m.atkAdd += 5;
    },
    dawn(g) {
      const s = g.sys.fishing;
      if (s && s.buffs.feast) {
        s.buffs.feast = false;
        g.recomputeMods();
        g.toast('海鲜大餐的力量随着天亮消退了');
      }
    },
    unlock(g) {
      const s = g.sys.fishing;
      if (s) s.spots = s.spots.filter((sp) => !g.world.unlockedAt(sp.x, sp.y) || s.act.some((f) => f && f.spot === sp));
    },
    update(g, dt) {
      const s = g.sys.fishing;
      if (!s) return;
      const w = g.world;
      // 料理效果
      const b = s.buffs;
      let changed = false;
      if (b.grillT > 0 && (b.grillT -= dt) <= 0) (b.grillT = 0), (changed = true);
      if (b.soupT > 0 && (b.soupT -= dt) <= 0) (b.soupT = 0), (changed = true);
      if (changed) g.recomputeMods();
      // 冒泡点
      for (const sp of s.spots) {
        sp.t += dt;
        if (!s.act.some((f) => f && f.spot === sp)) sp.life -= dt;
      }
      s.spots = s.spots.filter((sp) => (sp.life > 0 && !w.unlockedAt(sp.x, sp.y)) || s.act.some((f) => f && f.spot === sp));
      if (canFishYet(g)) {
        s.respawnT -= dt;
        const want = w.unlockedCount() >= 9 ? 3 : 2;
        if (s.respawnT <= 0 && s.spots.length < want) s.respawnT = spawnSpot(g) ? RESPAWN : 3;
      }
      // 每个玩家的钓鱼进度
      for (let pi = 0; pi < 2; pi++) {
        const f = s.act[pi];
        if (!f) continue;
        const p = g.players[pi];
        if (!p || p.down || g.over || p.moving || p.actKind === 'atk' || s.spots.indexOf(f.spot) < 0) {
          stopFishing(g, pi, p && p.moving ? '收线' : null);
          continue;
        }
        p.face = f.spot.x >= p.x ? 1 : -1;
        f.t += dt;
        if (f.phase === 'cast' && f.t >= 0.45) {
          f.phase = 'wait';
          f.t = 0;
          A.play('splash');
        } else if (f.phase === 'wait' && f.t >= f.wait) {
          f.phase = 'bite';
          f.t = 0;
          g.fx.splash(f.spot.x, f.spot.y);
          A.play('warn');
        } else if (f.phase === 'bite') {
          f.m = 0.5 - 0.5 * Math.cos(f.t * f.fish.speed);
          if (f.t >= BITE_TIME) {
            A.play('fail');
            stopFishing(g, pi, '鱼跑了……', '#ffb0a8');
          }
        }
      }
      if (s.fly.length) {
        for (const fl of s.fly) fl.t += dt;
        s.fly = s.fly.filter((fl) => fl.t < 0.6);
      }
      s.pillT -= dt;
      if (s.pillT <= 0) {
        s.pillT = 0.3;
        refreshPill(g);
      }
    },
    prompt(g, p) {
      const s = g.sys.fishing;
      if (!s) return null;
      if (s.act[p.idx]) return { label: '收竿！', btn: '收竿', what: 'reel' };
      let best = null,
        bd = 1e9;
      for (const sp of s.spots) {
        if (s.act.some((f) => f && f.spot === sp)) continue;
        const d = Math.min(U.dist(p.x, p.y, sp.ax, sp.ay) * 1.2, U.dist(p.x, p.y, sp.x, sp.y));
        if (d < 110 && d < bd) {
          bd = d;
          best = sp;
        }
      }
      if (!best) return null;
      return { label: '钓鱼', btn: '钓鱼', note: best.locked ? '往旁边走一点可以驱散迷雾' : '鱼咬钩时收竿', what: 'cast', spot: best };
    },
    act(g, pi, pr) {
      if (pr.what === 'reel') reel(g, pi);
      else if (pr.what === 'cast') cast(g, pi, pr.spot);
    },
    drawGround(g, ctx, cam) {
      CTX = ctx;
      const s = g.sys.fishing;
      if (!s) return;
      for (const sp of s.spots) {
        if (!cam.visible(sp.x, sp.y, 80)) continue;
        const fade = Math.min(1, sp.life / 8, sp.t / 1.5);
        for (let k = 0; k < 3; k++) {
          const ph = (sp.t * 0.7 + k / 3) % 1;
          const rr = 14 + ph * 42;
          ctx.globalAlpha = (1 - ph) * 0.6 * fade;
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.ellipse(sp.x, sp.y, rr, rr * 0.4, 0, 0, Math.PI * 2);
          ctx.stroke();
        }
        for (let k = 0; k < 4; k++) {
          const ph = (sp.t * 1.3 + k * 0.27) % 1;
          const bx = sp.x + Math.sin(k * 1.9 + sp.t * 0.5) * 18;
          const by = sp.y - ph * 16;
          const sz = 8 - ph * 4;
          ctx.globalAlpha = (1 - ph) * 0.9 * fade;
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(bx - sz / 2, by - sz / 2, sz, sz);
        }
        ctx.globalAlpha = 1;
      }
    },
    drawTop(g, ctx, cam) {
      const s = g.sys.fishing;
      if (!s) return;
      for (let pi = 0; pi < 2; pi++) {
        const f = s.act[pi];
        const p = g.players[pi];
        if (!f || !p) continue;
        const face = p.face;
        const hx = p.x + 16 * face,
          hy = p.y - 52;
        const tx = p.x + 58 * face,
          ty = p.y - 122;
        // 鱼竿
        ctx.strokeStyle = OUT;
        ctx.lineWidth = 8;
        ctx.beginPath();
        ctx.moveTo(hx, hy);
        ctx.lineTo(tx, ty);
        ctx.stroke();
        ctx.strokeStyle = '#a8693a';
        ctx.lineWidth = 4;
        ctx.stroke();
        // 浮漂位置
        let bx = f.spot.x,
          by = f.spot.y - 6;
        if (f.phase === 'cast') {
          const k = Math.min(1, f.t / 0.45);
          bx = U.lerp(tx, f.spot.x, k);
          by = U.lerp(ty, f.spot.y - 6, k) - Math.sin(k * Math.PI) * 90;
        } else if (f.phase === 'bite') by += 8 + Math.sin(f.t * 30) * 3;
        else by += Math.sin(g.time * 4) * 3;
        // 鱼线
        ctx.strokeStyle = 'rgba(255,255,255,0.85)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(tx, ty);
        ctx.quadraticCurveTo((tx + bx) / 2, Math.max(ty, by) + (f.phase === 'bite' ? 6 : 30), bx, by);
        ctx.stroke();
        // 浮漂
        ctx.fillStyle = OUT;
        ctx.fillRect(bx - 8, by - 10, 16, 18);
        ctx.fillStyle = '#ff5a4f';
        ctx.fillRect(bx - 5, by - 7, 10, 6);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(bx - 5, by - 1, 10, 6);
        f.bx = bx;
        f.by = by;
      }
      // 飞向玩家的渔获
      for (const fl of s.fly) {
        const k = fl.t / 0.6;
        const x = U.lerp(fl.x0, fl.x1, k),
          y = U.lerp(fl.y0, fl.y1, k) - Math.sin(k * Math.PI) * 140;
        E.drawSprite(ctx, catchImg(fl.key), x, y, { flip: fl.x1 < fl.x0 });
      }
    },
    /* 咬钩提示和计时条画在屏幕层：不会被迷雾、夜色盖住，大小也不随镜头缩放 */
    drawScreen(g, ctx, dpr, cam) {
      const s = g.sys.fishing;
      if (!s) return;
      for (let pi = 0; pi < 2; pi++) {
        const f = s.act[pi];
        const p = g.players[pi];
        if (!f || !p || f.phase !== 'bite') continue;
        // “！”：画在玩家头旁边（朝鱼的那一侧），不挡浮漂和计时条
        const q = cam.toScreen(p.x + p.face * 70, p.y - 110);
        const jump = Math.abs(Math.sin(f.t * 10)) * 6;
        const bx = Math.round(q.x - 14),
          by = Math.round(q.y - 34 - jump);
        ctx.fillStyle = OUT;
        ctx.fillRect(bx - 3, by - 3, 34, 40);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(bx, by, 28, 34);
        ctx.fillStyle = '#ff3b30';
        ctx.fillRect(bx + 10, by + 5, 8, 15);
        ctx.fillRect(bx + 10, by + 23, 8, 6);
        // 计时条（脚下）
        const o = cam.toScreen(p.x, p.y);
        const W = 160,
          H = 16;
        const x0 = Math.round(U.clamp(o.x - W / 2, 8, cam.W - W - 8)),
          y0 = Math.round(Math.min(o.y + 14, cam.H - H - 18));
        ctx.fillStyle = OUT;
        ctx.fillRect(x0 - 3, y0 - 3, W + 6, H + 6);
        ctx.fillStyle = '#3a2a3a';
        ctx.fillRect(x0, y0, W, H);
        const zw = f.fish.zone * W;
        ctx.fillStyle = f.fish.key === 'fish_r' || f.fish.key === 'fish_l' ? '#ffd23f' : '#5bd16a';
        ctx.fillRect(Math.round(x0 + f.zc * W - zw / 2), y0, Math.round(zw), H);
        ctx.fillStyle = 'rgba(255,255,255,0.3)';
        ctx.fillRect(Math.round(x0 + f.zc * W - zw / 2), y0, Math.round(zw), 4);
        const mx = Math.round(x0 + f.m * W);
        ctx.fillStyle = OUT;
        ctx.fillRect(mx - 4, y0 - 6, 8, H + 12);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(mx - 2, y0 - 4, 4, H + 8);
        ctx.fillStyle = '#ffb238';
        ctx.fillRect(x0, y0 + H + 4, Math.round(W * Math.max(0, 1 - f.t / BITE_TIME)), 3);
      }
    },
    minimap(g, dot) {
      const s = g.sys.fishing;
      if (s) for (const sp of s.spots) dot(sp.x, sp.y, '#e8fbff', 3);
    },
    campTabs(g, pi) {
      return {
        id: 'cook',
        title: '烹饪',
        render: (g2, ui) => {
          const s = g.sys.fishing;
          let body = `<div class="info">在岸边冒泡的水面钓鱼，回来做成料理。${bagHTML(g)}</div>`;
          for (const r of RECIPES) {
            const ok = canCook(g, r);
            const done = r.id === 'feast' && s.buffs.feast;
            const btn = done ? '<span class="maxed">已生效</span>' : `<button class="btn sm ${ok ? 'green' : 'gray'}" data-act="cook_${r.id}">${ok ? '做' : '缺鱼'}</button>`;
            body += `<div class="row"><div class="ic">${ui.spriteIcon(recipeImg(r.id))}</div><div class="mid"><div class="t">${r.title}</div><div class="d">${r.desc}</div><div class="cs">${fishCostHTML(g, r.keys, r.n)}</div></div>${btn}</div>`;
          }
          const b = s.buffs;
          const on = [];
          if (b.grillT > 0) on.push('烤鱼加速 ' + U.fmtTime(b.grillT));
          if (b.soupT > 0) on.push('鱼汤 ' + U.fmtTime(b.soupT));
          if (b.feast) on.push('海鲜大餐（到天亮）');
          if (on.length) body += `<div class="info small">★ 生效中：${on.join(' · ')}</div>`;
          return body;
        },
        act: (g2, act) => {
          if (act.startsWith('cook_')) cook(g, act.slice(5), pi);
        },
      };
    },
    shopTabs(g) {
      return {
        id: 'sellfish',
        title: '卖鱼',
        render: (g2, ui) => {
          let total = 0;
          for (const f of FISH) total += g.item(f.key) * f.price;
          let body = `<div class="info">商人收购新鲜的鱼。${total ? '全部卖掉能换 <b>' + total + '</b> 金币。' : '还没有鱼——去岸边冒泡的地方钓吧。'}</div>`;
          for (const f of FISH) {
            const n = g.item(f.key);
            body += `<div class="row"><div class="ic">${ui.spriteIcon(fishImg(f.key))}</div><div class="mid"><div class="t">${f.name} ×${n}</div><div class="d">每条 ${f.price} 金币</div></div><div class="pbtns"><button class="btn sm ${n ? 'green' : 'gray'}" data-act="sell1_${f.key}">卖 1 条</button><button class="btn sm ${n > 1 ? 'yellow' : 'gray'}" data-act="sellall_${f.key}">全卖</button></div></div>`;
          }
          return body;
        },
        act: (g2, act) => {
          const m = /^sell(1|all)_(\w+)$/.exec(act);
          if (!m) return;
          const f = byKey[m[2]];
          if (!f || !FISH_KEYS.includes(f.key)) return;
          const have = g.item(f.key);
          const n = m[1] === '1' ? Math.min(1, have) : have;
          if (!n) {
            g.toast('没有' + f.name + '可卖');
            return;
          }
          g.addItem(f.key, -n);
          g.addRes(3, n * f.price);
          A.play('coin');
          g.save();
        },
      };
    },
    runEnd(g, win, ending, data) {
      const s = g.sys.fishing;
      if (s && s.caught > 0) (data.statsExtra = data.statsExtra || []).push(`<div class="stat"><span>钓到的鱼</span><b>${s.caught} 条</b></div>`);
    },
    help() {
      return '<p><b>钓鱼：</b>岸边的浅水会冒泡，站在旁边的岸上点“钓鱼”抛竿。浮漂一沉、出现“！”时，脚下会出现计时条，白色标记扫到绿色区域时点“收竿！”。鱼可以在营地“烹饪”成料理（烤鱼回血加速、鱼汤让精灵变快、海鲜大餐提升攻击），也能在集市卖钱。</p>';
    },
    /* 给其他系统用（宠物喂鱼等） */
    fishTotal,
    takeFish,
    FISH_KEYS,
    fishImg,
    start(g) {
      return spawnSpot(g);
    },
  });
})();
