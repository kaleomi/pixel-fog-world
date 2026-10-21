/* 防御工事：玩家自己放置的箭塔、尖刺陷阱、篝火
   - 右下角“防御”按钮（电脑按 B）打开建造面板，放在玩家脚下
   - 站在已建的防御旁边会出现“管理”气泡：升级 / 拆除
   - 对外：PF.Defense.inBonfire(g, x, y) 供雾怪判断是否在火光里 */
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

  const TYPES = {
    tower: { name: '箭塔', cost: [60, 20, 0, 0], max: 6, solid: 34, near: 84, up: [null, [80, 40, 10, 0], [120, 60, 25, 0]], stat: 'tower' },
    trap: { name: '尖刺陷阱', cost: [30, 0, 5, 0], max: 8, solid: 0, near: 42, up: [null, [40, 10, 5, 0], [60, 20, 15, 0]], stat: 'trap' },
    bonfire: { name: '篝火', cost: [40, 0, 0, 0], max: 4, solid: 22, near: 72, up: [null, [40, 20, 0, 0], [60, 30, 10, 0]], stat: 'bonfire' },
  };
  const ORDER = ['tower', 'trap', 'bonfire'];
  const MAXLV = 3;
  const TOWER = { range: (lv) => 300 + 40 * (lv - 1), cd: [1.2, 1.0, 0.85], dmg: [8, 13, 18], speed: 950 };
  const TRAP = { trig: 36, hitR: 50, dmg: [25, 35, 50], rearm: 4 };
  const FIRE = { light: [280, 340, 400], heal: 200, regen: 2 };
  // 伤害来源（不会被敌人当成目标）
  const SRC_TOWER = { kind: 'tower', isDefense: true };
  const SRC_TRAP = { kind: 'trap', isDefense: true };

  /* ---------------- 像素图 ---------------- */
  const ART = {};
  const art = (k, fn) => ART[k] || (ART[k] = fn());

  function towerArt(lv) {
    return art('tw' + lv, () => {
      const p = new S.PC(22, 36);
      // 底座
      if (lv >= 2) {
        p.r(3, 22, 16, 14, '#8d93a6');
        p.r(3, 22, 16, 1, '#b4bacb');
        for (let j = 25; j < 36; j += 3) p.r(3, j, 16, 1, '#6f7487');
        for (let j = 22, k = 0; j < 36; j += 3, k++) for (let i = 4 + (k % 2) * 3; i < 19; i += 6) p.r(i, j + 1, 1, 2, '#6f7487');
        p.r(3, 22, 1, 14, '#6f7487');
        p.r(9, 29, 4, 7, '#3b2a20');
        p.r(10, 28, 2, 1, '#3b2a20');
      } else {
        p.r(4, 22, 2, 14, '#6b4024');
        p.r(16, 22, 2, 14, '#6b4024');
        p.r(4, 22, 1, 14, '#8a5a35');
        p.r(16, 22, 1, 14, '#8a5a35');
        p.line(6, 24, 15, 33, '#7a4a2a');
        p.line(15, 24, 6, 33, '#7a4a2a');
        p.r(6, 34, 10, 1, '#7a4a2a');
      }
      // 平台
      p.r(1, 19, 20, 3, '#8a5a35');
      p.r(1, 19, 20, 1, '#c98a4b');
      p.r(1, 21, 20, 1, '#5b3a24');
      if (lv >= 3) {
        // 石头垛口 + 金旗
        p.r(3, 12, 16, 7, '#9aa6b5');
        p.r(3, 12, 16, 1, '#c9d1df');
        p.r(3, 17, 16, 2, '#7a8496');
        for (const x of [3, 8, 13]) {
          p.r(x, 9, 3, 3, '#9aa6b5');
          p.r(x, 9, 3, 1, '#c9d1df');
        }
        p.r(16, 9, 3, 3, '#9aa6b5');
        p.r(10, 13, 2, 4, '#2b1d14');
        // 弩
        p.r(6, 10, 10, 1, '#5b3a24');
        p.r(15, 9, 2, 3, '#cfd8e2');
        p.r(10, 0, 1, 10, '#5b3a24');
        p.r(11, 0, 6, 4, '#ffd23f');
        p.r(11, 3, 6, 1, '#e0951f');
        p.p(16, 1, '#e0951f');
      } else {
        // 木屋 + 尖顶
        p.r(3, 11, 16, 8, '#a8693a');
        for (let i = 5; i < 19; i += 3) p.r(i, 11, 1, 8, '#8a5a35');
        p.r(3, 11, 16, 1, '#c98a4b');
        p.r(10, 13, 2, 4, '#2b1d14');
        const roof = lv >= 2 ? ['#d8342c', '#b8322b'] : ['#9a6338', '#7a4a2a'];
        for (let j = 0; j < 9; j++) {
          const w = 2 + j * 2.4;
          p.r(11 - w / 2, 2 + j, w, 1, j % 3 === 2 ? roof[1] : roof[0]);
        }
        p.r(1, 10, 20, 1, roof[1]);
        p.r(10, 0, 2, 2, '#ffd23f');
      }
      p.outline(OUT);
      return p.c;
    });
  }
  function trapArt(lv, armed) {
    return art('tp' + lv + (armed ? 1 : 0), () => {
      const p = new S.PC(18, 9);
      const frame = lv >= 2 ? '#7a8496' : '#7a4a2a';
      p.r(1, 5, 16, 3, lv >= 2 ? '#5f6878' : '#8a5a35');
      p.r(1, 5, 16, 1, lv >= 2 ? '#9aa6b5' : '#c98a4b');
      p.r(1, 7, 16, 1, frame);
      p.p(2, 6, '#2b1d14');
      p.p(15, 6, '#2b1d14');
      const tip = lv >= 3 ? '#ffd23f' : '#ffffff';
      for (let k = 0; k < 5; k++) {
        const x = 2 + k * 3;
        if (armed) {
          p.r(x, 2, 2, 3, '#cfd8e2');
          p.r(x, 2, 1, 3, '#eef2f7');
          p.p(x, 1, tip);
          p.p(x + 1, 1, tip);
        } else p.r(x - 1, 4, 3, 1, '#9aa6b5');
      }
      p.outline(OUT);
      return p.c;
    });
  }
  function bonfireArt(lv, f) {
    return art('bf' + lv + f, () => {
      const p = new S.PC(20, 24);
      // 后面的石头
      p.r(3, 17, 3, 2, '#6f6a8a');
      p.r(14, 17, 3, 2, '#6f6a8a');
      // 柴火
      p.line(4, 21, 15, 16, '#6b4024');
      p.line(4, 20, 15, 15, '#8a5a35');
      p.line(4, 16, 15, 21, '#7a4a2a');
      p.line(4, 15, 15, 20, '#a8693a');
      // 火焰
      const hh = [8, 10, 12][lv - 1] + (f === 1 ? 1 : 0);
      const wide = 5 + lv;
      for (let j = 0; j < hh; j++) {
        const k = j / hh;
        const w = Math.max(1, Math.round(wide * (1 - k * k) * (j < 1 ? 0.8 : 1)));
        const wob = Math.round(Math.sin(j * 0.9 + f * 2.1) * (k > 0.4 ? 1 : 0));
        const col = k > 0.7 ? '#ffd23f' : '#ff6a2a';
        p.r(10 - w / 2 + wob, 17 - j, w, 1, col);
        if (k < 0.6 && w > 3) p.r(10 - w / 4 + wob, 17 - j, Math.max(1, w / 2), 1, k < 0.3 ? '#fff4b0' : '#ffd23f');
      }
      if (f === 2) p.p(12, 17 - hh - 1, '#ffd23f');
      // 前面的石头
      p.r(1, 19, 4, 3, '#8d87a9');
      p.r(5, 20, 4, 3, '#a9a4c2');
      p.r(9, 21, 3, 2, '#8d87a9');
      p.r(12, 20, 4, 3, '#a9a4c2');
      p.r(16, 19, 3, 3, '#8d87a9');
      for (const x of [1, 5, 12, 16]) p.r(x, 19 + (x === 5 || x === 12 ? 1 : 0), 2, 1, '#cfcbe2');
      if (lv >= 3) {
        p.r(0, 22, 20, 2, '#6f6a8a');
        p.r(0, 22, 20, 1, '#a9a4c2');
      }
      p.outline(OUT);
      return p.c;
    });
  }
  function arrowArt() {
    return art('arrow', () => {
      const p = new S.PC(12, 5);
      p.r(2, 2, 7, 1, '#8a5a35');
      p.r(9, 1, 1, 3, '#cfd8e2');
      p.p(10, 2, '#ffffff');
      p.r(1, 1, 2, 1, '#f2f2f2');
      p.r(1, 3, 2, 1, '#f2f2f2');
      p.outline(OUT);
      return p.c;
    });
  }
  function hammerIcon() {
    return art('hammer', () => {
      const p = new S.PC(14, 14);
      p.r(2, 2, 8, 4, '#9aa6b5');
      p.r(2, 2, 8, 1, '#dfe7ef');
      p.r(2, 5, 8, 1, '#6f7a8a');
      p.r(10, 3, 2, 2, '#6f7a8a');
      p.r(5, 6, 2, 7, '#8a5a35');
      p.r(5, 6, 1, 7, '#c98a4b');
      p.outline(OUT);
      return p.c;
    });
  }
  function iconFor(t) {
    if (t === 'tower') return towerArt(1);
    if (t === 'trap') return trapArt(1, true);
    return bonfireArt(1, 0);
  }

  /* ---------------- 运行时（不进存档） ---------------- */
  const RT = new WeakMap();
  function rt(g) {
    let r = RT.get(g);
    if (!r) RT.set(g, (r = { arrows: [], pool: [], btnOn: null, who: 0, hitSnd: 0, acc: [0, 0] }));
    return r;
  }
  const hudOK = (g) => !g.over && !g.cut && !g.dead && g.st.won !== 'ended';

  function boxDist(x, y, b) {
    const cx = U.clamp(x, b.x0, b.x1),
      cy = U.clamp(y, b.y0, b.y1);
    return Math.hypot(cx - x, cy - y);
  }
  function count(g, t) {
    let n = 0;
    for (const d of g.sys.defense.list) if (d.t === t) n++;
    return n;
  }
  function addSolid(g, d) {
    const T = TYPES[d.t];
    if (!T.solid) return;
    d._solid = { x: d.x, y: d.y, r: T.solid, def: true };
    g.world.solids.push(d._solid);
  }
  function removeSolid(g, d) {
    if (!d._solid) return;
    const i = g.world.solids.indexOf(d._solid);
    if (i >= 0) g.world.solids.splice(i, 1);
    d._solid = null;
  }
  function spent(d) {
    const T = TYPES[d.t];
    const s = T.cost.slice();
    for (let l = 1; l < d.lv; l++) for (let i = 0; i < 4; i++) s[i] += T.up[l][i];
    return s;
  }
  function desc(t, lv) {
    if (t === 'tower') return `射程 ${TOWER.range(lv)} · 每 ${TOWER.cd[lv - 1]} 秒一箭 · 伤害 ${TOWER.dmg[lv - 1]}`;
    if (t === 'trap') return `敌人踩上去受到 ${TRAP.dmg[lv - 1]} 伤害，${TRAP.rearm} 秒后重新张开`;
    return `夜里照亮 ${FIRE.light[lv - 1]} 范围，旁边的人每秒回 ${FIRE.regen} 血，雾怪进火光会变慢、更怕疼`;
  }

  /* 能不能在 (x,y) 放 t：返回 null 或原因 */
  function whyNot(g, t, x, y) {
    const T = TYPES[t];
    if (count(g, t) >= T.max) return T.name + '最多只能建 ' + T.max + ' 个';
    return whySpot(g, x, y, T.solid);
  }
  function whySpot(g, x, y, solid) {
    const w = g.world;
    if (!w.walkable(x, y, 28)) return '这里放不下，要站在岛上的空地上';
    for (const b of w.buildings) {
      const fp = w.footprint(b);
      if (boxDist(x, y, fp) < 70) return '离建筑太近了，换块空地吧';
      // 建筑正前方（高的东西会挡住建筑）或正后方（会被建筑挡住）都不行
      const inX = x > fp.x0 - 40 && x < fp.x1 + 40 + (b.kind === 'camp' ? 70 : 0);
      const bn = b.kind === 'camp' ? '营地' : '建筑';
      if (inX && solid && y > b.y && y < b.y + 170) return '会挡住' + bn + '，往旁边挪一点';
      if (inX && y <= b.y && y > b.y - 210) return '会被' + bn + '挡住，往旁边挪一点';
    }
    for (const pt of w.portals) if (w.tiles[pt.tile].unlocked && U.dist(x, y, pt.x, pt.y - 20) < 150) return '离洞窟太近了';
    if (w.dock && U.dist(x, y, w.dock.x, w.dock.y) < 130) return '离木筏太近了';
    for (const d of g.sys.defense.list) if (U.dist(x, y, d.x, d.y) < 70) return '离别的防御太近了';
    for (const n of w.nodesNear(x, y)) {
      if (n.hp <= 0) continue;
      if (n.type === 1) {
        if (solid && U.dist(x, y, n.x, n.y) < 40) return '会压坏稻田，挪开一点吧';
        continue;
      }
      if (U.dist(x, y, n.x, n.y) < 40 + w.nodeSolidR(n)) return '离树木或水晶太近了';
    }
    for (const c of w.chests) if (!c.opened && U.dist(x, y, c.x, c.y) < 70) return '离宝箱太近了';
    return null;
  }

  function place(g, t, pi) {
    const p = g.players[pi] || g.players[0];
    const T = TYPES[t];
    if (p.down) return '倒地时不能建造';
    const why = whyNot(g, t, p.x, p.y);
    if (why) return why;
    if (!g.pay(T.cost)) return '还差 ' + g.lack(T.cost).map((l) => D.RES[l[0]].name + ' ' + l[1]).join('、');
    const d = { t, x: Math.round(p.x), y: Math.round(p.y), lv: 1, cd: 0.5 };
    g.sys.defense.list.push(d);
    addSolid(g, d);
    // 把玩家挪出去，别卡在塔里
    if (T.solid) {
      const off = T.solid + p.r + 6;
      for (const [ox, oy] of [[0, off], [off, 0], [-off, 0], [0, -off]]) {
        if (g.world.walkable(d.x + ox, d.y + oy, p.r)) {
          p.x = d.x + ox;
          p.y = d.y + oy;
          break;
        }
      }
    }
    A.play('build');
    g.fx.sparkle(d.x, d.y - 40, '#fff4b0');
    g.fx.text(d.x, d.y - 150, T.name, '#fff4b0');
    g.fire('stat', T.stat, 1);
    g.save();
    return null;
  }

  /* ---------------- 弹窗 ---------------- */
  function openBuild(g) {
    const UI = PF.UI;
    if (UI.modal || g.paused || !hudOK(g)) return;
    const R = rt(g);
    if (!g.twoP) R.who = 0;
    if (g.players[R.who] && g.players[R.who].down && g.players[1 - R.who]) R.who = 1 - R.who;
    const render = () => {
      const p = g.players[R.who] || g.players[0];
      let h = `<div class="dh"><span>防御工事</span><button class="x" data-act="close">✕</button></div>`;
      if (g.twoP) h += `<div class="cb-who">放在<button class="${R.who === 0 ? 'on' : ''}" data-act="who0">1P 脚下</button><button class="${R.who === 1 ? 'on p2' : 'p2'}" data-act="who1">2P 脚下</button></div>`;
      // 当前位置能不能放（先按最宽松的陷阱规则，再看塔和篝火；不算数量上限）
      const why = p.down ? '倒地时不能建造' : whySpot(g, p.x, p.y, 0);
      const some = !why && ORDER.some((t) => whySpot(g, p.x, p.y, TYPES[t].solid));
      h += why
        ? `<div class="info small cb-bad">当前位置：${why}</div>`
        : `<div class="info small cb-ok">✓ ${some ? '这里能放一部分，写着红字的要换个位置' : '站在这里就能建'}。建好后靠近它可以升级或拆除</div>`;
      h += '<div class="scroll">';
      for (const t of ORDER) {
        const T = TYPES[t];
        const n = count(g, t);
        const full = n >= T.max;
        const w2 = full ? null : p.down ? '倒地' : whyNot(g, t, p.x, p.y);
        const can = !w2 && g.canAfford(T.cost);
        let btn;
        if (full) btn = '<span class="maxed">已满</span>';
        else if (!g.canAfford(T.cost)) btn = `<button class="btn sm gray" data-act="b_${t}">${PF.UI.lackShort(T.cost)}</button>`;
        else btn = `<button class="btn sm ${can ? 'green' : 'gray'}" data-act="b_${t}">建造</button>`;
        const whyRow = !full && w2 && !why ? `<div class="d cb-why">${w2}</div>` : '';
        h += `<div class="row"><div class="ic">${UI.spriteIcon(iconFor(t))}</div><div class="mid"><div class="t">${T.name} <span class="cb-n">${n}/${T.max}</span></div><div class="d">${desc(t, 1)}</div>${whyRow}<div class="cs">${UI.costHTML(T.cost, g)}</div></div>${btn}</div>`;
      }
      h += '<div class="info small">提示：箭塔会自动射击附近的敌人；陷阱放在海盗必经的路上；篝火让雾怪变慢、更怕疼。</div></div>';
      return h;
    };
    UI.open(
      render(),
      'w-md',
      (act) => {
        if (act === 'close') return UI.close();
        if (act === 'who0' || act === 'who1') {
          R.who = +act.slice(3);
          return UI.refreshDialog();
        }
        if (act.startsWith('b_')) {
          const t = act.slice(2);
          const err = place(g, t, R.who);
          if (err) {
            A.play('wrong');
            UI.toast(err);
            return UI.refreshDialog();
          }
          UI.close(true);
          UI.toast('建好了' + TYPES[t].name + '！');
        }
      },
      { refresh: render }
    );
  }
  function openManage(g, d) {
    const UI = PF.UI;
    if (UI.modal) return;
    let confirmRm = false;
    const render = () => {
      const T = TYPES[d.t];
      const icon = UI.spriteIcon(d.t === 'tower' ? towerArt(d.lv) : d.t === 'trap' ? trapArt(d.lv, true) : bonfireArt(d.lv, 0));
      let h = `<div class="dh"><span>${T.name}</span><button class="x" data-act="close">✕</button></div><div class="scroll">`;
      h += `<div class="row"><div class="ic">${icon}</div><div class="mid"><div class="t">${T.name} <span class="cb-lv">${'★'.repeat(d.lv)}${'☆'.repeat(MAXLV - d.lv)}</span></div><div class="d">${desc(d.t, d.lv)}</div></div></div>`;
      if (d.lv < MAXLV) {
        const c = T.up[d.lv];
        h += UI.upRow(icon, `升级到 Lv${d.lv + 1}`, desc(d.t, d.lv + 1), c, 'up', g.canAfford(c) ? '' : 'lack');
      } else h += '<div class="info small center">已经升到最高级了</div>';
      const back = spent(d).map((v) => Math.floor(v / 2));
      h += `<div class="row"><div class="mid"><div class="t">拆除</div><div class="d">返还一半材料</div><div class="cs">${UI.costHTML(back, g)}</div></div><button class="btn sm red" data-act="rm">${confirmRm ? '确定拆除？' : '拆除'}</button></div></div>`;
      return h;
    };
    UI.open(
      render(),
      'w-sm',
      (act) => {
        if (act === 'close') return UI.close();
        const T = TYPES[d.t];
        if (act === 'up' && d.lv < MAXLV) {
          const c = T.up[d.lv];
          if (!g.pay(c)) {
            A.play('wrong');
            UI.toast('还差 ' + g.lack(c).map((l) => D.RES[l[0]].name + ' ' + l[1]).join('、'));
            return;
          }
          d.lv++;
          A.play('build');
          g.fx.sparkle(d.x, d.y - 60, '#ffe36b');
          UI.toast(T.name + '升到了 Lv' + d.lv);
          g.save();
          UI.refreshDialog();
        } else if (act === 'rm') {
          if (!confirmRm) {
            confirmRm = true;
            return UI.refreshDialog();
          }
          const back = spent(d).map((v) => Math.floor(v / 2));
          for (let i = 0; i < 4; i++) if (back[i]) g.addRes(i, back[i]);
          removeSolid(g, d);
          const st = g.sys.defense;
          st.list.splice(st.list.indexOf(d), 1);
          g.fx.burst(d.x, d.y - 30, '#c98a4b', 8);
          A.play('pop');
          g.save();
          UI.close(true);
          UI.toast('拆掉了' + T.name + '，返还了一半材料');
        }
      },
      { refresh: render }
    );
  }

  /* ---------------- 战斗 ---------------- */
  function nearestEnemy(g, x, y, range) {
    let best = null,
      bd = range * range;
    for (const e of g.pirates) {
      if (e.dead || e.fading) continue;
      const dx = e.x - x,
        dy = e.y - y;
      const d = dx * dx + dy * dy;
      if (d < bd) {
        bd = d;
        best = e;
      }
    }
    return best;
  }
  function shoot(g, d, e) {
    const R = rt(g);
    const a = R.pool.pop() || {};
    a.x = d.x;
    a.y = d.y - 84;
    a.e = e;
    a.tx = e.x;
    a.ty = e.y - 50;
    a.dmg = TOWER.dmg[d.lv - 1];
    a.life = 1.4;
    a.ang = Math.atan2(a.ty - a.y, a.tx - a.x);
    R.arrows.push(a);
  }
  function updArrows(g, dt) {
    const R = rt(g);
    const L = R.arrows;
    let k = 0;
    for (let i = 0; i < L.length; i++) {
      const a = L[i];
      if (a.e && !a.e.dead) {
        a.tx = a.e.x;
        a.ty = a.e.y - 40 * (a.e.K ? a.e.K.scale : 1);
      }
      const dx = a.tx - a.x,
        dy = a.ty - a.y;
      const dist = Math.hypot(dx, dy);
      const step = TOWER.speed * dt;
      a.life -= dt;
      let keep = true;
      if (dist <= step || a.life <= 0) {
        if (a.e && !a.e.dead && dist <= step + 30) {
          a.e.hurt(a.dmg, SRC_TOWER);
          g.fx.burst(a.tx, a.ty, '#ffffff', 3);
          if (R.hitSnd <= 0) {
            A.play('hit');
            R.hitSnd = 0.18;
          }
        }
        keep = false;
      } else {
        a.x += (dx / dist) * step;
        a.y += (dy / dist) * step;
        a.ang = Math.atan2(dy, dx);
      }
      if (keep) L[k++] = a;
      else {
        a.e = null;
        R.pool.push(a);
      }
    }
    L.length = k;
  }

  function inBonfire(g, x, y) {
    const st = g.sys && g.sys.defense;
    if (!st) return false;
    for (const d of st.list) {
      if (d.t !== 'bonfire') continue;
      const r = FIRE.light[d.lv - 1] * 0.75;
      const dx = d.x - x,
        dy = d.y - y;
      if (dx * dx + dy * dy < r * r) return true;
    }
    return false;
  }
  PF.Defense = { inBonfire, TYPES, canPlace: (g, t, x, y) => whyNot(g, t, x, y), openBuild };

  /* ---------------- HUD 按钮 ---------------- */
  function setupBtn(g) {
    const btn = document.getElementById('buildBtn');
    if (!btn) return;
    btn.innerHTML = `<img class="pix" src="${S.spriteURL(hammerIcon(), 3)}" alt=""><span class="lb">防御</span><span class="kh">B</span>`;
    btn.title = '建造防御（B）';
    btn.onclick = (e) => {
      e.stopPropagation();
      A.play('click');
      openBuild(g);
    };
    btn.onpointerdown = (e) => e.stopPropagation();
  }
  function syncBtn(g) {
    const R = rt(g);
    const on = hudOK(g);
    if (R.btnOn === on) return;
    R.btnOn = on;
    const btn = document.getElementById('buildBtn');
    if (btn) btn.classList.toggle('on', on);
  }

  /* ---------------- 绘制 ---------------- */
  let CTX = null;
  function drawDef(g, d) {
    const ctx = CTX;
    if (d.t === 'tower') {
      E.shadow(ctx, d.x, d.y, 44, 13);
      E.drawSprite(ctx, towerArt(d.lv), d.x, d.y + 8);
      if (d.flash > 0) {
        // 射箭时弩口一闪
        ctx.fillStyle = 'rgba(255,240,170,' + d.flash * 2 + ')';
        ctx.fillRect(d.x - 6, d.y - 92, 12, 12);
      }
    } else if (d.t === 'bonfire') {
      E.shadow(ctx, d.x, d.y + 2, 40, 11);
      const f = Math.floor(g.time * 8 + d.x * 0.01) % 3;
      E.drawSprite(ctx, bonfireArt(d.lv, f), d.x, d.y + 10);
    }
    if (d.lv > 1) {
      const y = d.y - (d.t === 'tower' ? 158 : 110);
      ctx.fillStyle = 'rgba(28,20,36,0.7)';
      ctx.fillRect(d.x - d.lv * 9 - 3, y - 4, d.lv * 18 + 6, 16);
      ctx.fillStyle = '#ffd23f';
      for (let i = 0; i < d.lv; i++) ctx.fillRect(d.x - d.lv * 9 + i * 18 + 4, y, 10, 8);
    }
  }

  PF.Sys.register({
    id: 'defense',
    order: 20,
    init(g, saved) {
      const list = [];
      if (saved && Array.isArray(saved.list))
        for (const a of saved.list) {
          if (!a || !TYPES[a[0]]) continue;
          list.push({ t: a[0], x: a[1], y: a[2], lv: U.clamp(a[3] | 0, 1, MAXLV), cd: 0.5 });
        }
      g.sys.defense = { list };
      for (const d of list) addSolid(g, d);
      const R = rt(g);
      R.btnOn = null;
      setupBtn(g);
      syncBtn(g);
    },
    serialize(g) {
      return { list: g.sys.defense.list.map((d) => [d.t, d.x, d.y, d.lv]) };
    },
    destroy(g) {
      const btn = document.getElementById('buildBtn');
      if (btn) {
        btn.classList.remove('on');
        btn.onclick = null;
        btn.onpointerdown = null;
      }
      RT.delete(g);
    },
    update(g, dt) {
      const st = g.sys.defense;
      const R = rt(g);
      syncBtn(g);
      if (R.hitSnd > 0) R.hitSnd -= dt;
      if (PF.Input.keyPressed('KeyB') && !PF.UI.modal && hudOK(g)) openBuild(g);
      const night = g.isNight();
      let fireNear0 = false,
        fireNear1 = false;
      for (const d of st.list) {
        if (d.flash > 0) d.flash -= dt;
        if (d.t === 'tower') {
          d.cd -= dt;
          if (d.cd <= 0) {
            const e = nearestEnemy(g, d.x, d.y - 40, TOWER.range(d.lv));
            if (e) {
              d.cd = TOWER.cd[d.lv - 1];
              d.flash = 0.15;
              shoot(g, d, e);
            } else d.cd = 0.25;
          }
        } else if (d.t === 'trap') {
          if (d.cd > 0) {
            d.cd -= dt;
            continue;
          }
          let hit = false;
          for (const e of g.pirates) {
            if (e.dead || e.fading || e.state === 'sail') continue;
            if (Math.abs(e.x - d.x) < TRAP.trig + e.r && Math.abs(e.y - d.y) < TRAP.trig) {
              hit = true;
              break;
            }
          }
          if (hit) {
            d.cd = TRAP.rearm;
            const dmg = TRAP.dmg[d.lv - 1];
            for (const e of g.pirates) {
              if (e.dead || e.fading || e.state === 'sail') continue;
              if (U.dist(e.x, e.y, d.x, d.y) < TRAP.hitR + e.r) e.hurt(dmg, SRC_TRAP);
            }
            g.fx.burst(d.x, d.y - 10, '#dfe7ef', 6);
            A.play('hit');
          }
        } else if (night) {
          for (const p of g.players) {
            if (p.down) continue;
            if (U.dist(p.x, p.y, d.x, d.y) < FIRE.heal) {
              if (p.idx === 0) fireNear0 = true;
              else fireNear1 = true;
            }
          }
        }
      }
      // 篝火旁回血（每秒 +2）
      for (const p of g.players) {
        const near = p.idx === 0 ? fireNear0 : fireNear1;
        if (!near || p.down || p.hp >= p.hpMax) {
          R.acc[p.idx] = 0;
          continue;
        }
        R.acc[p.idx] += dt;
        if (R.acc[p.idx] >= 1) {
          R.acc[p.idx] -= 1;
          p.hp = Math.min(p.hpMax, p.hp + FIRE.regen);
          if (Math.random() < 0.35) g.fx.text(p.x + U.rand(-20, 20), p.y - 120, '+' + FIRE.regen, '#9be38a');
        }
      }
      updArrows(g, dt);
    },
    drawGround(g, ctx, cam) {
      CTX = ctx;
      const st = g.sys.defense;
      for (const d of st.list) {
        if (!cam.visible(d.x, d.y, 420)) continue;
        if (d.t === 'trap') {
          E.drawSprite(ctx, trapArt(d.lv, !(d.cd > 0)), d.x, d.y + 8);
          if (d.cd > 0) {
            // 重新张开的进度
            const k = 1 - d.cd / TRAP.rearm;
            ctx.fillStyle = 'rgba(28,20,36,0.6)';
            ctx.fillRect(d.x - 26, d.y + 14, 52, 6);
            ctx.fillStyle = '#ffd23f';
            ctx.fillRect(d.x - 26, d.y + 14, 52 * k, 6);
          }
        } else if (d.t === 'tower') {
          // 有玩家靠近时显示射程
          let near = false;
          for (const p of g.players) if (!p.down && U.dist(p.x, p.y, d.x, d.y) < 150) near = true;
          if (near) {
            ctx.strokeStyle = 'rgba(255,244,176,0.55)';
            ctx.lineWidth = 4;
            ctx.setLineDash([14, 12]);
            ctx.lineDashOffset = -g.time * 20;
            ctx.beginPath();
            ctx.arc(d.x, d.y - 40, TOWER.range(d.lv), 0, Math.PI * 2);
            ctx.stroke();
            ctx.setLineDash([]);
          }
        }
      }
    },
    drawables(g, add, cam) {
      const st = g.sys.defense;
      for (const d of st.list) {
        if (d.t === 'trap' || !cam.visible(d.x, d.y, 200)) continue;
        if (!d._fn) d._fn = () => drawDef(g, d);
        add(d.y, d._fn);
      }
    },
    drawTop(g, ctx) {
      CTX = ctx;
      const R = rt(g);
      if (!R.arrows.length) return;
      const img = arrowArt();
      const w = img.width * PX,
        h = img.height * PX;
      for (const a of R.arrows) {
        ctx.save();
        ctx.translate(a.x, a.y);
        ctx.rotate(a.ang);
        ctx.drawImage(img, -w / 2, -h / 2, w, h);
        ctx.restore();
      }
    },
    lights(g, light) {
      const flick = 1 + Math.sin(g.time * 9) * 0.04;
      for (const d of g.sys.defense.list) {
        if (d.t === 'bonfire') light(d.x, d.y - 30, FIRE.light[d.lv - 1] * flick, 1);
        else if (d.t === 'tower') light(d.x, d.y - 90, 150, 0.55);
      }
    },
    drawScreen(g, ctx, dpr, cam) {
      syncBtn(g);
      const dark = g.darkness();
      if (dark <= 0.01) return;
      const stamps = PF.Game.lightStamps && PF.Game.lightStamps();
      if (!stamps) return;
      ctx.globalCompositeOperation = 'lighter';
      ctx.imageSmoothingEnabled = true;
      for (const d of g.sys.defense.list) {
        if (d.t !== 'bonfire' || !cam.visible(d.x, d.y, 300)) continue;
        const s = cam.toScreen(d.x, d.y - 20);
        const r = (110 + d.lv * 30) * cam.z * (1 + Math.sin(g.time * 7 + d.x) * 0.04);
        ctx.globalAlpha = 0.24 * dark;
        ctx.drawImage(stamps.warm, s.x - r, s.y - r, r * 2, r * 2);
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      ctx.imageSmoothingEnabled = false;
    },
    minimap(g, dot) {
      for (const d of g.sys.defense.list) {
        if (d.t === 'tower') dot(d.x, d.y, '#8a5a35', 5);
        else if (d.t === 'bonfire') dot(d.x, d.y, '#ff9a3c', 5);
      }
    },
    prompt(g, p) {
      const st = g.sys.defense;
      let best = null,
        bd = 1e9;
      for (const d of st.list) {
        const dd = U.dist(p.x, p.y, d.x, d.y);
        if (dd < TYPES[d.t].near && dd < bd) {
          bd = dd;
          best = d;
        }
      }
      if (!best) return null;
      return { label: TYPES[best.t].name + ' Lv' + best.lv, note: best.lv < MAXLV ? '升级 / 拆除' : '拆除', btn: '管理', def: best };
    },
    act(g, pi, pr) {
      if (pr && pr.def && g.sys.defense.list.includes(pr.def)) openManage(g, pr.def);
    },
    help() {
      return '<p><b>防御工事：</b>点右下角的“防御”按钮（电脑按 B），在脚下放箭塔、尖刺陷阱或篝火。箭塔自动射击附近的敌人；陷阱被踩到会扎伤周围的敌人，过几秒重新张开；篝火在夜里照亮四周、给旁边的人回血，还会让雾怪变慢、受到更多伤害。走到已建好的防御旁边可以升级或拆除（返还一半材料）。</p>';
    },
  });
})();
