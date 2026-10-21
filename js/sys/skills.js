/* 主动技能：每个玩家装备一个技能，右下角按钮（电脑 Q / 右Shift）释放
   旋风斩（默认）、冲刺、治疗图腾、落雷；在集市“技能”页购买和装备 */
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

  const SK = {
    whirl: { name: '旋风斩', cd: 8, cost: null, desc: '原地挥剑一圈：150 内的敌人受到 2.5 倍攻击伤害并被击退' },
    dash: { name: '冲刺', cd: 5, cost: [0, 0, 0, 60], desc: '朝移动方向冲出一段：途中无敌，撞到的敌人受到 1.5 倍攻击伤害' },
    totem: { name: '治疗图腾', cd: 25, cost: [0, 0, 0, 100], desc: '插下图腾 8 秒：周围 220 内的人和精灵每秒回 10 血，营地每秒修 8' },
    bolt: { name: '落雷', cd: 15, cost: [0, 0, 30, 150], desc: '劈中 450 内最近的 5 个敌人：4 倍攻击伤害并眩晕 1 秒' },
  };
  const KEYS = ['whirl', 'dash', 'totem', 'bolt'];
  const WHIRL = { r: 150, mul: 2.5, knock: 60, life: 0.4 };
  const DASH = { dist: 280, time: 0.18, mul: 1.5, hitR: 56 };
  const TOTEM = { life: 8, r: 220, heal: 10, camp: 8 };
  const BOLT = { r: 450, n: 5, mul: 4, stun: 1 };

  /* ---------------- 像素图 ---------------- */
  const ART = {};
  const art = (k, fn) => ART[k] || (ART[k] = fn());
  function icon(k) {
    return art('ic_' + k, () => {
      const p = new S.PC(16, 16);
      if (k === 'whirl') {
        for (let a = 0; a < 26; a++) {
          const ang = (a / 26) * Math.PI * 2;
          if (a % 9 > 6) continue;
          p.r(8 + Math.cos(ang) * 6.2 - 0.5, 8 + Math.sin(ang) * 6.2 - 0.5, 2, 2, a % 9 < 3 ? '#ffffff' : '#9ad7ff');
        }
        p.line(5, 11, 11, 5, '#dfe7ef');
        p.line(6, 11, 11, 6, '#9aa6b5');
        p.p(12, 4, '#ffffff');
        p.r(4, 9, 3, 1, '#ffd23f');
        p.r(6, 10, 1, 3, '#ffd23f');
        p.r(3, 12, 2, 2, '#8a5a35');
      } else if (k === 'dash') {
        p.r(1, 4, 4, 1, '#9ad7ff');
        p.r(0, 7, 5, 1, '#ffffff');
        p.r(1, 10, 4, 1, '#9ad7ff');
        p.r(8, 2, 4, 8, '#8a5a35');
        p.r(8, 2, 4, 1, '#c98a4b');
        p.r(8, 9, 7, 3, '#8a5a35');
        p.r(8, 12, 7, 1, '#3b2414');
        p.r(9, 5, 2, 1, '#ffd23f');
        p.r(12, 9, 2, 1, '#c98a4b');
      } else if (k === 'totem') {
        p.r(5, 4, 6, 10, '#a8693a');
        p.r(5, 4, 1, 10, '#c98a4b');
        p.r(6, 6, 1, 2, OUT);
        p.r(9, 6, 1, 2, OUT);
        p.r(7, 9, 2, 1, OUT);
        p.r(4, 12, 8, 2, '#7a4a2a');
        p.r(6, 0, 4, 4, '#5bd16a');
        p.r(6, 0, 2, 2, '#b7f59a');
        p.r(2, 5, 3, 2, '#5bd16a');
        p.r(11, 5, 3, 2, '#5bd16a');
      } else {
        p.circ(5, 3, 2.6, '#8d87a9');
        p.circ(9, 2.5, 3, '#8d87a9');
        p.circ(12, 3.5, 2.2, '#8d87a9');
        p.r(3, 3, 11, 3, '#8d87a9');
        p.r(3, 5, 11, 1, '#6f6a8a');
        p.r(7, 1, 3, 1, '#cfcbe2');
        p.grid(['...yyy.', '..yyy..', '.yyyyy.', '...yy..', '..yy...', '.yy....', '.y.....'], { y: '#ffd23f' }, 4, 5);
        p.p(7, 6, '#fff4b0');
        p.p(6, 7, '#fff4b0');
      }
      p.outline(OUT);
      return p.c;
    });
  }
  function totemArt() {
    return art('totem', () => {
      const p = new S.PC(14, 30);
      p.r(1, 26, 12, 3, '#8d87a9');
      p.r(1, 26, 12, 1, '#cfcbe2');
      p.r(4, 6, 6, 21, '#a8693a');
      p.r(4, 6, 1, 21, '#c98a4b');
      p.r(9, 6, 1, 21, '#7a4a2a');
      for (const y of [9, 17]) {
        p.r(5, y, 1, 2, OUT);
        p.r(8, y, 1, 2, OUT);
        p.r(6, y + 3, 2, 1, OUT);
        p.r(4, y + 5, 6, 1, '#7a4a2a');
      }
      p.r(0, 8, 4, 3, '#5bd16a');
      p.r(10, 8, 4, 3, '#5bd16a');
      p.r(0, 8, 4, 1, '#b7f59a');
      p.r(10, 8, 4, 1, '#b7f59a');
      p.r(4, 0, 6, 6, '#5bd16a');
      p.r(5, 1, 4, 4, '#9be38a');
      p.r(5, 1, 2, 2, '#e8ffe0');
      p.outline(OUT);
      return p.c;
    });
  }

  /* ---------------- 运行时 ---------------- */
  const RT = new WeakMap();
  function rt(g) {
    let r = RT.get(g);
    if (!r) RT.set(g, (r = { cd: [0, 0], dash: [null, null], totems: [null, null], fx: [], ghosts: [], flash: 0, ui: [{}, {}], colOn: null }));
    return r;
  }
  const hudOK = (g) => !g.over && !g.cut && !g.dead && g.st.won !== 'ended';

  /* 眩晕：给这个敌人包一层 update（每个敌人只包一次） */
  function stun(e, s) {
    e.stunT = Math.max(e.stunT || 0, s);
    if (e._stunWrap) return;
    e._stunWrap = true;
    const orig = e.update;
    e.update = function (dt) {
      if (this.stunT > 0 && !this.dead) {
        this.stunT -= dt;
        this.moving = false;
        if (this.flash > 0) this.flash -= dt * 3;
        return;
      }
      return orig.call(this, dt);
    };
  }

  /* ---------------- 释放 ---------------- */
  function cast(g, pi) {
    const st = g.sys.skills;
    const R = rt(g);
    const p = g.players[pi];
    if (!p || p.down || g.over || g.cut || g.paused || g.mini) return;
    const k = st.equip[pi] || 'whirl';
    if (R.cd[pi] > 0) {
      const u = R.ui[pi];
      if (u.el) {
        u.el.classList.remove('nope');
        void u.el.offsetWidth;
        u.el.classList.add('nope');
      }
      return;
    }
    const ok = DO[k](g, p, pi);
    if (ok === false) return;
    R.cd[pi] = SK[k].cd;
    g.fire('stat', 'skill', 1);
  }
  const DO = {
    whirl(g, p, pi) {
      const R = rt(g);
      const dmg = p.atk * WHIRL.mul;
      let n = 0;
      for (const e of g.pirates) {
        if (e.dead || e.fading) continue;
        const d = U.dist(e.x, e.y, p.x, p.y);
        if (d > WHIRL.r + e.r) continue;
        e.hurt(dmg, p);
        n++;
        if (!e.dead && e.state !== 'sail') {
          const kb = e.isBoss ? WHIRL.knock * 0.3 : WHIRL.knock;
          const dx = d > 1 ? (e.x - p.x) / d : p.face,
            dy = d > 1 ? (e.y - p.y) / d : 0;
          E.moveEnt(g, e, dx * kb, dy * kb, e.r);
        }
      }
      R.fx.push({ k: 'whirl', p, t: 0, life: WHIRL.life });
      A.play('hit');
      if (n) A.play('laser');
      g.cam.shake = Math.max(g.cam.shake, 4);
      p.actKind = null;
    },
    dash(g, p, pi) {
      const R = rt(g);
      const mv = PF.Input.move(pi);
      let dx = mv.x,
        dy = mv.y;
      const l = Math.hypot(dx, dy);
      if (l < 0.2) {
        dx = p.face;
        dy = 0;
      } else {
        dx /= l;
        dy /= l;
      }
      if (Math.abs(dx) > 0.1) p.face = dx > 0 ? 1 : -1;
      R.dash[pi] = { dx, dy, left: DASH.dist, hit: [], gT: 0 };
      p.invuln = Math.max(p.invuln, DASH.time + 0.15);
      p.lockMove = DASH.time + 0.05;
      p.actKind = null;
      A.play('pop');
    },
    totem(g, p, pi) {
      const R = rt(g);
      let x = p.x + p.face * 46,
        y = p.y + 6;
      if (!g.world.walkable(x, y, 12)) {
        x = p.x;
        y = p.y + 6;
      }
      R.totems[pi] = { x, y, t: 0, acc: 0 };
      g.fx.sparkle(x, y - 60, '#9be38a');
      A.play('heal');
    },
    bolt(g, p) {
      const R = rt(g);
      const list = [];
      for (const e of g.pirates) {
        if (e.dead || e.fading) continue;
        const d = U.dist(e.x, e.y, p.x, p.y);
        if (d < BOLT.r) list.push([d, e]);
      }
      if (!list.length) {
        A.play('wrong');
        g.toast('附近没有敌人，落雷没有放出去');
        return false;
      }
      list.sort((a, b) => a[0] - b[0]);
      const dmg = p.atk * BOLT.mul;
      const strikes = [];
      for (let i = 0; i < Math.min(BOLT.n, list.length); i++) {
        const e = list[i][1];
        const pts = [];
        let x = e.x + U.rand(-30, 30);
        const top = e.y - 760;
        for (let y = top; y < e.y - 40; y += 70) {
          pts.push(x, y);
          x += U.rand(-34, 34);
        }
        pts.push(e.x, e.y - 30);
        strikes.push({ pts, x: e.x, y: e.y });
        e.hurt(dmg, p);
        if (!e.dead) stun(e, BOLT.stun);
        g.fx.burst(e.x, e.y - 40, '#fff4b0', 8);
      }
      R.fx.push({ k: 'bolt', strikes, t: 0, life: 0.38 });
      R.flash = 0.35;
      g.cam.shake = Math.max(g.cam.shake, 9);
      A.play('boom');
    },
  };

  function boxDist(x, y, b) {
    const cx = U.clamp(x, b.x0, b.x1),
      cy = U.clamp(y, b.y0, b.y1);
    return Math.hypot(cx - x, cy - y);
  }
  function updDash(g, dt) {
    const R = rt(g);
    for (let i = 0; i < 2; i++) {
      const ds = R.dash[i];
      if (!ds) continue;
      const p = g.players[i];
      if (!p || p.down) {
        R.dash[i] = null;
        continue;
      }
      let move = Math.min(ds.left, (DASH.dist / DASH.time) * dt);
      let stop = false;
      while (move > 0.5 && !stop) {
        const s = Math.min(24, move);
        const ox = p.x,
          oy = p.y;
        E.moveEnt(g, p, ds.dx * s, ds.dy * s, p.r);
        const moved = Math.hypot(p.x - ox, p.y - oy);
        move -= s;
        ds.left -= s;
        if (moved < s * 0.3) stop = true;
        if (g.twoP) {
          const o = g.players[1 - i];
          if (o && U.dist(p.x, p.y, o.x, o.y) > g.cam.maxPairDist()) {
            p.x = ox;
            p.y = oy;
            stop = true;
          }
        }
        for (const e of g.pirates) {
          if (e.dead || e.fading || ds.hit.indexOf(e) >= 0) continue;
          if (U.dist(e.x, e.y, p.x, p.y) < DASH.hitR + e.r) {
            ds.hit.push(e);
            e.hurt(p.atk * DASH.mul, p);
            g.fx.burst(e.x, e.y - 50, '#ffffff', 5);
            A.play('hit');
          }
        }
      }
      ds.gT -= dt;
      if (ds.gT <= 0) {
        ds.gT = 0.035;
        const gh = R.ghosts.length < 12 ? {} : R.ghosts.shift();
        gh.x = p.x;
        gh.y = p.y;
        gh.skin = p.skin;
        gh.face = p.face;
        gh.t = 0;
        R.ghosts.push(gh);
      }
      if (stop || ds.left <= 0.5) R.dash[i] = null;
    }
  }
  function updTotems(g, dt) {
    const R = rt(g);
    for (let i = 0; i < 2; i++) {
      const tm = R.totems[i];
      if (!tm) continue;
      tm.t += dt;
      tm.acc += dt;
      if (tm.acc >= 1) {
        tm.acc -= 1;
        for (const p of g.players) {
          if (p.down || p.hp >= p.hpMax || U.dist(p.x, p.y, tm.x, tm.y) > TOTEM.r) continue;
          p.hp = Math.min(p.hpMax, p.hp + TOTEM.heal);
          g.fx.text(p.x + U.rand(-16, 16), p.y - 130, '+' + TOTEM.heal, '#9be38a');
        }
        for (const w of g.workers) {
          if (w.dead || w.hp >= w.hpMax || U.dist(w.x, w.y, tm.x, tm.y) > TOTEM.r) continue;
          w.hp = Math.min(w.hpMax, w.hp + TOTEM.heal);
          g.fx.text(w.x, w.y - 90, '+' + TOTEM.heal, '#9be38a');
        }
        const camp = g.world.camp();
        if (g.st.campHp > 0 && g.st.campHp < g.campHpMax() && boxDist(tm.x, tm.y, g.world.footprint(camp)) < TOTEM.r) {
          g.st.campHp = Math.min(g.campHpMax(), g.st.campHp + TOTEM.camp);
          g.fx.text(camp.x + U.rand(-40, 40), camp.y - 170, '+' + TOTEM.camp, '#9be38a');
        }
      }
      if (tm.t >= TOTEM.life) {
        g.fx.burst(tm.x, tm.y - 60, '#9be38a', 8);
        R.totems[i] = null;
      }
    }
  }

  /* ---------------- HUD 按钮 ---------------- */
  function setupBtns(g) {
    const R = rt(g);
    const col = document.getElementById('rightCol');
    if (col) col.classList.toggle('cb-2p', g.twoP);
    for (let i = 0; i < 2; i++) {
      const el = document.getElementById('skillBtn' + i);
      if (!el) continue;
      el.innerHTML = '<img class="pix" alt=""><span class="cdv"></span><span class="cdn"></span><span class="kh"></span>';
      el.classList.remove('on', 'cool', 'nope');
      el.onpointerdown = (e) => {
        e.preventDefault();
        e.stopPropagation();
        cast(g, i);
      };
      el.onclick = (e) => e.stopPropagation();
      R.ui[i] = { el, img: el.querySelector('img'), cdv: el.querySelector('.cdv'), cdn: el.querySelector('.cdn'), kh: el.querySelector('.kh'), on: null, k: null, p: -1, n: null };
      R.ui[i].kh.textContent = g.twoP ? (i ? '右Shift' : 'Q') : 'Q';
    }
  }
  function syncBtns(g) {
    const st = g.sys.skills;
    const R = rt(g);
    const ok = hudOK(g);
    for (let i = 0; i < 2; i++) {
      const u = R.ui[i];
      if (!u.el) continue;
      const on = ok && i < g.players.length;
      if (u.on !== on) {
        u.on = on;
        u.el.classList.toggle('on', on);
      }
      if (!on) continue;
      const k = st.equip[i] || 'whirl';
      if (u.k !== k) {
        u.k = k;
        u.img.src = S.spriteURL(icon(k), 3);
        u.el.title = SK[k].name + (g.twoP ? (i ? '（右Shift）' : '（Q）') : '（Q）');
        u.el.setAttribute('aria-label', SK[k].name);
      }
      const cd = R.cd[i];
      const frac = cd > 0 ? Math.round((cd / SK[k].cd) * 100) / 100 : 0;
      if (frac !== u.p) {
        const was = u.p;
        u.p = frac;
        u.cdv.style.setProperty('--p', frac);
        u.el.classList.toggle('cool', frac > 0);
        if (frac === 0 && was > 0) {
          u.el.classList.remove('ready');
          void u.el.offsetWidth;
          u.el.classList.add('ready');
        }
      }
      const n = cd > 0 ? String(Math.ceil(cd)) : '';
      if (n !== u.n) {
        u.n = n;
        u.cdn.textContent = n;
      }
    }
  }

  /* ---------------- 绘制 ---------------- */
  function star(ctx, x, y, s) {
    ctx.fillStyle = OUT;
    ctx.fillRect(x - s / 2 - 2, y - s / 2 - 2, s + 4, s + 4);
    ctx.fillStyle = '#ffd23f';
    ctx.fillRect(x - s / 2, y - s / 2, s, s);
  }
  let CTX = null;
  function drawTotem(g, tm) {
    const ctx = CTX;
    const k = tm.t / TOTEM.life;
    const blink = k > 0.8 && Math.floor(tm.t * 8) % 2 === 0;
    E.shadow(ctx, tm.x, tm.y, 26, 8);
    if (blink) ctx.globalAlpha = 0.6;
    E.drawSprite(ctx, totemArt(), tm.x, tm.y + 6 + Math.sin(g.time * 3) * 2);
    ctx.globalAlpha = 1;
  }

  PF.Sys.register({
    id: 'skills',
    order: 40,
    init(g, saved) {
      const s = saved || {};
      const owned = { whirl: 1 };
      if (s.owned) for (const k of KEYS) if (s.owned[k]) owned[k] = 1;
      const equip = [0, 1].map((i) => (s.equip && owned[s.equip[i]] ? s.equip[i] : 'whirl'));
      g.sys.skills = { owned, equip };
      const R = rt(g);
      R.cd = [0, 0];
      setupBtns(g);
      syncBtns(g);
    },
    serialize(g) {
      const st = g.sys.skills;
      return { owned: st.owned, equip: st.equip };
    },
    destroy(g) {
      for (let i = 0; i < 2; i++) {
        const el = document.getElementById('skillBtn' + i);
        if (!el) continue;
        el.classList.remove('on', 'cool', 'ready', 'nope');
        el.onpointerdown = null;
        el.onclick = null;
      }
      const col = document.getElementById('rightCol');
      if (col) col.classList.remove('cb-2p');
      RT.delete(g);
    },
    update(g, dt) {
      const R = rt(g);
      for (let i = 0; i < 2; i++) if (R.cd[i] > 0) R.cd[i] = Math.max(0, R.cd[i] - dt);
      if (!g.over && !g.cut) for (const p of g.players) if (PF.Input.skill(p.idx)) cast(g, p.idx);
      updDash(g, dt);
      updTotems(g, dt);
      // 特效计时
      let k = 0;
      for (const f of R.fx) {
        f.t += dt;
        if (f.t < f.life) R.fx[k++] = f;
      }
      R.fx.length = k;
      for (const gh of R.ghosts) gh.t += dt;
      while (R.ghosts.length && R.ghosts[0].t > 0.25) R.ghosts.shift();
      if (R.flash > 0) R.flash = Math.max(0, R.flash - dt * 2.2);
      syncBtns(g);
    },
    drawGround(g, ctx) {
      CTX = ctx;
      const R = rt(g);
      for (const tm of R.totems) {
        if (!tm) continue;
        const pulse = 0.5 + Math.sin(g.time * 4) * 0.5;
        ctx.fillStyle = `rgba(120,230,120,${0.08 + pulse * 0.06})`;
        ctx.beginPath();
        ctx.arc(tm.x, tm.y, TOTEM.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(155,227,138,0.7)';
        ctx.lineWidth = 4;
        ctx.setLineDash([16, 10]);
        ctx.lineDashOffset = g.time * 30;
        ctx.beginPath();
        ctx.arc(tm.x, tm.y, TOTEM.r, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      // 冲刺残影
      for (const gh of R.ghosts) {
        ctx.globalAlpha = 0.45 * (1 - gh.t / 0.25);
        E.drawSprite(ctx, S.human(gh.skin, 'walk1'), gh.x, gh.y + 4, { flip: gh.face < 0 });
      }
      ctx.globalAlpha = 1;
    },
    drawables(g, add) {
      const R = rt(g);
      for (const tm of R.totems) {
        if (!tm) continue;
        if (!tm._fn) tm._fn = () => drawTotem(g, tm);
        add(tm.y, tm._fn);
      }
    },
    drawTop(g, ctx) {
      const R = rt(g);
      for (const f of R.fx) {
        if (f.k !== 'whirl') continue;
        const p = f.p;
        const k = f.t / f.life;
        const a0 = f.t * 26 * p.face;
        ctx.globalAlpha = 1 - k;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 16;
        ctx.beginPath();
        ctx.ellipse(p.x, p.y - 40, WHIRL.r * (0.6 + k * 0.4), WHIRL.r * 0.55 * (0.6 + k * 0.4), 0, a0, a0 + 4.2);
        ctx.stroke();
        ctx.strokeStyle = '#9ad7ff';
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.ellipse(p.x, p.y - 40, WHIRL.r * (0.5 + k * 0.4), WHIRL.r * 0.45 * (0.6 + k * 0.4), 0, a0 + 1, a0 + 4.6);
        ctx.stroke();
        for (let i = 0; i < 3; i++) {
          const a = a0 + (i * Math.PI * 2) / 3;
          E.drawTool(ctx, g.st.holySword ? 'holy' : 'sword', p.x + Math.cos(a) * 90, p.y - 40 + Math.sin(a) * 50, a + 0.8, 1);
        }
        ctx.globalAlpha = 1;
      }
      // 被眩晕的敌人头顶冒星星
      for (const e of g.pirates) {
        if (!(e.stunT > 0) || e.dead) continue;
        const sc = e.K ? e.K.scale : 1;
        const y = e.y - 130 * sc;
        for (let i = 0; i < 3; i++) {
          const a = g.time * 6 + (i * Math.PI * 2) / 3;
          star(ctx, e.x + Math.cos(a) * 26, y + Math.sin(a) * 8, 8);
        }
      }
    },
    drawOverFog(g, ctx) {
      const R = rt(g);
      for (const f of R.fx) {
        if (f.k !== 'bolt') continue;
        const k = f.t / f.life;
        const a = k < 0.25 ? 1 : 1 - (k - 0.25) / 0.75;
        for (const s of f.strikes) {
          const pts = s.pts;
          for (const [w, col] of [
            [22, `rgba(120,170,255,${a * 0.55})`],
            [10, `rgba(255,250,200,${a})`],
            [4, `rgba(255,255,255,${a})`],
          ]) {
            ctx.strokeStyle = col;
            ctx.lineWidth = w;
            ctx.lineJoin = 'miter';
            ctx.beginPath();
            ctx.moveTo(pts[0], pts[1]);
            for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
            ctx.stroke();
          }
          ctx.fillStyle = `rgba(255,250,200,${a * 0.6})`;
          ctx.beginPath();
          ctx.ellipse(s.x, s.y, 70 * (0.6 + k), 26 * (0.6 + k), 0, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    },
    lights(g, light) {
      const R = rt(g);
      for (const tm of R.totems) if (tm) light(tm.x, tm.y - 60, 180, 0.75);
      for (const f of R.fx) {
        if (f.k === 'bolt') for (const s of f.strikes) light(s.x, s.y - 40, 260, 1 - f.t / f.life);
        else if (f.k === 'whirl') light(f.p.x, f.p.y - 40, 200, 0.6 * (1 - f.t / f.life));
      }
    },
    drawScreen(g, ctx, dpr, cam) {
      const R = rt(g);
      syncBtns(g);
      if (R.flash > 0) {
        ctx.fillStyle = `rgba(255,252,225,${R.flash * 0.55})`;
        ctx.fillRect(0, 0, cam.W, cam.H);
      }
    },
    shopTabs(g, pi) {
      return {
        id: 'skills',
        title: '技能',
        render(g, ui) {
          const st = g.sys.skills;
          let h = `<div class="info small">技能按钮在右下角${g.twoP ? '（电脑：1P 按 Q，2P 按 右Shift）' : '（电脑按 Q）'}。每人只能装备一个技能，可以随时换。</div>`;
          for (const k of KEYS) {
            const s = SK[k];
            const ic = ui.spriteIcon(icon(k));
            const title = `${s.name} <span class="cb-n">冷却 ${s.cd} 秒</span>`;
            if (!st.owned[k]) {
              h += ui.upRow(ic, title, s.desc, s.cost, 'buy_' + k, g.canAfford(s.cost) ? '' : 'lack', '学习');
              continue;
            }
            let btns = '';
            if (g.twoP) {
              for (let i = 0; i < 2; i++) {
                const on = st.equip[i] === k;
                btns += `<button class="btn sm ${on ? 'gray2 cb-on' : i ? 'blue' : 'yellow'}" data-act="eq${i}_${k}">${on ? i + 1 + 'P ✓' : i + 1 + 'P 装备'}</button>`;
              }
              btns = `<div class="cb-eq">${btns}</div>`;
            } else {
              const on = st.equip[0] === k;
              btns = on ? '<span class="maxed">使用中</span>' : `<button class="btn sm green" data-act="eq0_${k}">装备</button>`;
            }
            h += `<div class="row"><div class="ic">${ic}</div><div class="mid"><div class="t">${title}</div><div class="d">${s.desc}</div></div>${btns}</div>`;
          }
          return h;
        },
        act(g, act, ui) {
          const st = g.sys.skills;
          const R = rt(g);
          if (act.startsWith('buy_')) {
            const k = act.slice(4);
            const s = SK[k];
            if (!s || st.owned[k]) return;
            if (!g.pay(s.cost)) {
              A.play('wrong');
              ui.toast('还差 ' + g.lack(s.cost).map((l) => D.RES[l[0]].name + ' ' + l[1]).join('、'));
              return;
            }
            st.owned[k] = 1;
            const who = Math.min(pi || 0, g.players.length - 1);
            st.equip[who] = k;
            R.cd[who] = Math.min(R.cd[who], 1);
            A.play('success');
            ui.toast('学会了【' + s.name + '】，已经装备上了');
            g.save();
          } else if (/^eq[01]_/.test(act)) {
            const i = +act[2];
            const k = act.slice(4);
            if (!st.owned[k] || i >= g.players.length) return;
            if (st.equip[i] !== k) {
              st.equip[i] = k;
              R.cd[i] = Math.min(R.cd[i], SK[k].cd);
              A.play('pop');
              g.save();
            }
          }
        },
      };
    },
    help() {
      return '<p><b>主动技能：</b>右下角的圆形技能按钮（电脑按 Q，双人时 2P 按 右Shift）。一开始会旋风斩，在集市的“技能”页还能学冲刺、治疗图腾、落雷，每人装备一个。用过之后要等冷却。</p>';
    },
  });
  PF.Skills = { stun, SK };
})();
