/* 海盗首领战：每 5 夜（第 5、10、15……夜）独眼船长坐红帆大船亲自登陆
   - 黄昏时预警；海盗出发时，首领船从另一个方向靠岸
   - 招式：横扫（近身范围伤害）、炮击（地上先出红圈，1.3 秒后落弹）、召唤小喽啰
   - 血量低于 40% 暴怒：更快、炮击更频繁
   - 击败后掉落宝箱 */
(function () {
  'use strict';
  const PF = window.PF,
    U = PF.U,
    D = PF.Data,
    S = PF.Spr,
    A = PF.Audio,
    E = PF.Ent;
  const OUT = '#1c1424';
  const DIR_NAME = ['北', '南', '西', '东'];
  const SWEEP = { r: 115, every: 2.6, wind: 0.6 };
  const BARRAGE = { n: 5, r: 80, delay: 1.3, dmg: 16, every: 9, everyEnr: 6 };
  const SUMMON = { every: 18, n: 2, cap: 6 };

  /* ---------------- 像素图 ---------------- */
  // 借用人物画法：往海盗皮肤表里加两套（普通 / 暴怒）
  const bossDeco = (p) => {
    // 大三角帽 + 骷髅
    p.r(1, 2, 18, 2, '#17161c');
    p.r(4, -2, 12, 4, '#17161c');
    p.r(1, 3, 18, 1, '#ffd23f');
    p.r(8, -1, 4, 3, '#f2f2f2');
    p.p(9, 0, '#17161c');
    p.p(10, 0, '#17161c');
    p.r(15, -3, 2, 2, '#ff5a4f');
    p.p(17, -3, '#ff5a4f');
    // 眼罩
    p.r(12, 5, 3, 3, '#17161c');
    p.line(4, 4, 12, 6, '#17161c');
    // 大胡子
    p.r(7, 8, 9, 2, '#3b2414');
    p.r(8, 10, 7, 2, '#3b2414');
    p.r(10, 12, 3, 1, '#3b2414');
    p.r(10, 8, 3, 1, '#c98a5c');
    // 金肩章、扣子、腰带
    p.r(3, 11, 3, 1, '#ffd23f');
    p.r(14, 11, 3, 1, '#ffd23f');
    p.r(8, 13, 1, 1, '#ffd23f');
    p.r(8, 15, 1, 1, '#ffd23f');
    p.r(5, 15, 10, 1, '#2b1d14');
    p.r(9, 15, 2, 1, '#ffd23f');
  };
  if (S.PIRATE_SKINS && !S.PIRATE_SKINS.boss) {
    S.PIRATE_SKINS.boss = { skin: '#e6b48a', shirt: '#8a1d22', shirt2: '#ffd23f', pants: '#2b2a33', shoe: '#17161c', eye: '#222', deco: bossDeco };
    S.PIRATE_SKINS.bossR = { skin: '#f0907a', shirt: '#c4141f', shirt2: '#ffd23f', pants: '#3a1a22', shoe: '#17161c', eye: '#ff2a2a', deco: bossDeco };
  }
  const ART = {};
  function shipArt() {
    if (ART.ship) return ART.ship;
    const src = S.ship();
    const p = new S.PC(src.width, src.height);
    p.x.drawImage(src, 0, 0);
    // 帆染成红色，骷髅保持白色
    p.shade((i, j, r, g, b) => {
      if (r === 0x2c && g === 0x2a && b === 0x36) return [0x8a, 0x1d, 0x22];
      if (r === 0x3a && g === 0x37 && b === 0x46) return [0xb8, 0x23, 0x2f];
      if (r === 0xd8 && g === 0x34 && b === 0x2c) return [0x17, 0x16, 0x1c];
      return null;
    });
    // 金边
    p.r(4, 34, 62, 1, '#ffd23f');
    return (ART.ship = p.c);
  }

  /* ---------------- 首领船 ---------------- */
  class BossShip extends E.Ship {
    constructor(g, dir, tile) {
      super(g, dir, tile, []);
      this.noSave = true;
      this.dropped = false;
      this.isBossShip = true;
    }
    update(dt) {
      if (this.state === 'unload') {
        this.t += dt;
        if (!this.dropped) {
          this.dropped = true;
          spawnBoss(this.g, this.dock.x, this.dock.y, { x: this.land.x, y: this.land.y }, false);
        }
        if (this.t > 2.5) {
          this.state = 'leave';
          this.t = 0;
        }
        return;
      }
      super.update(dt);
    }
    draw(ctx) {
      const img = shipArt();
      const bob = Math.sin(this.t * 1.6) * 5;
      const flip = this.dir === 3;
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.fillRect(this.x - 160, this.y - 4 + bob, 320, 10);
      E.drawSprite(ctx, img, this.x, this.y + 40 + bob, { flip, scale: 1.25 });
    }
  }

  /* ---------------- 独眼船长 ---------------- */
  class Boss extends E.Pirate {
    constructor(g, x, y, land, n) {
      const st = g.sys.boss;
      super(g, { id: 'boss', name: '独眼船长', hp: 400 + 250 * st.defeated, atk: 11 + 3 * Math.min(st.defeated, 4), speed: 110, gold: 120, scale: 1.6, atkCD: 1 }, x, y, land);
      this.isBoss = true;
      this.noSave = true;
      this.n = n;
      this.enraged = false;
      this.sweepT = 1.6;
      this.windT = 0;
      this.swingT = 0;
      this.barT = 5;
      this.sumT = 10;
      this.shells = [];
      this.minions = [];
      this.retT = 0;
    }
    hurt(dmg, src) {
      if (this.dead) return;
      super.hurt(dmg, src);
      if (!this.dead && !this.enraged && this.hp < this.hpMax * 0.4) this.enrage();
    }
    enrage() {
      const g = this.g;
      this.enraged = true;
      this.kind = 'bossR';
      this.speed = this.K.speed * 1.3;
      this.barT = Math.min(this.barT, 2);
      g.cam.shake = 10;
      A.play('alarm');
      g.fx.text(this.x, this.y - 230, '暴怒！', '#ff5a4f', true);
      g.toast('独眼船长暴怒了！他变得更快，炮击也更猛');
    }
    pick() {
      const g = this.g;
      let best = null,
        bd = 360 * 360;
      for (const p of g.players) {
        if (p.down) continue;
        const d = U.dist2(p.x, p.y, this.x, this.y);
        if (d < bd) {
          bd = d;
          best = p;
        }
      }
      if (best) return best;
      bd = 200 * 200;
      for (const w of g.workers) {
        if (w.dead) continue;
        const d = U.dist2(w.x, w.y, this.x, this.y);
        if (d < bd) {
          bd = d;
          best = w;
        }
      }
      for (const a of g.allies) {
        if (a.dead || !a.canBeTargeted) continue;
        const d = U.dist2(a.x, a.y, this.x, this.y);
        if (d < bd) {
          bd = d;
          best = a;
        }
      }
      return best;
    }
    walkTo(tx, ty, ignore, dt) {
      const w = this.g.world;
      let [wx, wy] = w.nextWaypoint(this.x, this.y, w.tileIdx(tx, ty), tx, ty);
      [wx, wy] = w.steer(this.x, this.y, wx, wy, this.r, ignore);
      const dx = wx - this.x,
        dy = wy - this.y;
      const d = Math.hypot(dx, dy);
      if (d < 2) return;
      const s = Math.min(d, this.speed * dt);
      this.face = dx > 0 ? 1 : -1;
      const ox = this.x,
        oy = this.y;
      E.moveEnt(this.g, this, (dx / d) * s, (dy / d) * s, this.r);
      if (U.dist(ox, oy, this.x, this.y) < s * 0.2) {
        const side = Math.sin(this.t * 1.1) > 0 ? 1 : -1;
        E.moveEnt(this.g, this, (-dy / d) * s * side, (dx / d) * s * side, this.r);
      }
      this.moving = true;
    }
    campNear(m) {
      const g = this.g;
      const fp = g.world.footprint(g.world.camp());
      const cx = U.clamp(this.x, fp.x0, fp.x1),
        cy = U.clamp(this.y, fp.y0, fp.y1);
      return U.dist(cx, cy, this.x, this.y) < m;
    }
    anyoneNear(r) {
      const g = this.g;
      for (const p of g.players) if (!p.down && U.dist(p.x, p.y, this.x, this.y) < r + p.r) return true;
      for (const w of g.workers) if (!w.dead && U.dist(w.x, w.y, this.x, this.y) < r + w.r) return true;
      for (const a of g.allies) if (!a.dead && a.canBeTargeted && U.dist(a.x, a.y, this.x, this.y) < r + 12) return true;
      return this.campNear(this.r + 60);
    }
    doSweep() {
      const g = this.g;
      const r = SWEEP.r;
      for (const p of g.players) if (!p.down && U.dist(p.x, p.y, this.x, this.y) < r + p.r) p.hurt(this.atk, this);
      for (const w of g.workers) if (!w.dead && U.dist(w.x, w.y, this.x, this.y) < r + w.r) w.hurt(this.atk, this);
      for (const a of g.allies) if (!a.dead && a.canBeTargeted && a.hurt && U.dist(a.x, a.y, this.x, this.y) < r + 12) a.hurt(this.atk, this);
      if (this.campNear(this.r + 60)) g.hurtCamp(Math.round(this.atk * 1.5));
      this.swingT = 0.22;
      g.cam.shake = Math.max(g.cam.shake, 5);
      g.fx.burst(this.x + this.face * 60, this.y - 60, '#ffffff', 8);
      A.play('hit');
    }
    barrage() {
      const g = this.g;
      const w = g.world;
      const camp = w.camp();
      const pts = [];
      const ok = (x, y) => {
        if (!w.walkable(x, y, 10)) return false;
        for (const s of pts) if (U.dist(s[0], s[1], x, y) < BARRAGE.r * 1.1) return false;
        return true;
      };
      const alive = g.players.filter((p) => !p.down);
      for (const p of alive) if (ok(p.x, p.y)) pts.push([p.x, p.y]);
      for (let k = 0; k < 40 && pts.length < BARRAGE.n; k++) {
        const c = alive.length && Math.random() < 0.75 ? U.pick(alive) : Math.random() < 0.5 ? camp : this;
        const a = Math.random() * Math.PI * 2,
          d = U.rand(90, 280);
        const x = c.x + Math.cos(a) * d,
          y = c.y + Math.sin(a) * d * 0.8;
        if (ok(x, y)) pts.push([x, y]);
      }
      for (const s of pts) this.shells.push({ x: s[0], y: s[1], t: BARRAGE.delay });
      if (pts.length) {
        A.play('warn');
        g.fx.text(this.x, this.y - 240, '开炮！', '#ffb238', true);
      }
    }
    boom(s) {
      const g = this.g;
      const r = BARRAGE.r;
      const dmg = Math.round(BARRAGE.dmg * (g.mods.enemyAtkMul || 1));
      for (const p of g.players) if (!p.down && U.dist(p.x, p.y, s.x, s.y) < r + p.r) p.hurt(dmg, this);
      for (const w of g.workers) if (!w.dead && U.dist(w.x, w.y, s.x, s.y) < r + w.r) w.hurt(dmg, this);
      for (const a of g.allies) if (!a.dead && a.canBeTargeted && a.hurt && U.dist(a.x, a.y, s.x, s.y) < r + 12) a.hurt(dmg, this);
      const fp = g.world.footprint(g.world.camp());
      const cx = U.clamp(s.x, fp.x0, fp.x1),
        cy = U.clamp(s.y, fp.y0, fp.y1);
      if (U.dist(cx, cy, s.x, s.y) < r) g.hurtCamp(dmg);
      g.fx.burst(s.x, s.y - 20, '#ffb238', 10);
      g.fx.burst(s.x, s.y - 20, '#5b5566', 6);
      g.cam.shake = Math.max(g.cam.shake, 6);
    }
    summon() {
      const g = this.g;
      this.minions = this.minions.filter((m) => !m.dead);
      if (this.minions.length >= SUMMON.cap) return;
      let n = 0;
      for (let k = 0; k < 10 && n < SUMMON.n; k++) {
        const a = Math.random() * Math.PI * 2;
        const x = this.x + Math.cos(a) * 80,
          y = this.y + Math.sin(a) * 50;
        if (!g.world.walkable(x, y, 16)) continue;
        const m = new E.Pirate(g, 0, x, y, { x, y });
        m.state = 'walk';
        g.pirates.push(m);
        this.minions.push(m);
        g.fx.burst(x, y - 40, '#9aa6b5', 8);
        n++;
      }
      if (n) {
        A.play('alarm');
        g.fx.text(this.x, this.y - 240, '小的们，上！', '#ffffff', true);
      }
    }
    update(dt) {
      const g = this.g;
      if (this.dead) {
        this.t += dt;
        this.deadT -= dt * 0.6;
        return;
      }
      if (this.state === 'sail') return super.update(dt);
      this.t += dt;
      this.moving = false;
      if (this.flash > 0) this.flash -= dt * 3;
      if (this.swingT > 0) this.swingT -= dt;
      // 炮弹
      let boomed = false;
      for (let i = this.shells.length - 1; i >= 0; i--) {
        const s = this.shells[i];
        s.t -= dt;
        if (s.t <= 0) {
          this.boom(s);
          boomed = true;
          this.shells.splice(i, 1);
        }
      }
      if (boomed) A.play('boom');
      if (g.over) return;
      // 招式计时
      this.barT -= dt;
      if (this.barT <= 0) {
        this.barT = this.enraged ? BARRAGE.everyEnr : BARRAGE.every;
        this.barrage();
      }
      this.sumT -= dt;
      if (this.sumT <= 0) {
        this.sumT = SUMMON.every;
        this.summon();
      }
      // 横扫：抬刀蓄力（站住不动），然后砍下去
      if (this.windT > 0) {
        this.windT -= dt;
        this.atkT = (1 - this.windT / SWEEP.wind) * 0.75;
        if (this.windT <= 0) this.doSweep();
        return;
      }
      this.atkT = this.swingT > 0 ? 0.75 + (1 - this.swingT / 0.22) * 0.25 : 0;
      // 目标
      this.retT -= dt;
      let tg = this.target;
      if (tg && (tg.dead || tg.down || U.dist(tg.x, tg.y, this.x, this.y) > 450)) tg = this.target = null;
      if (!tg || this.retT <= 0) {
        this.retT = 1.2;
        const nt = this.pick();
        if (nt || !tg) tg = this.target = nt;
      }
      const camp = g.world.camp();
      let near;
      if (tg) {
        near = U.dist(tg.x, tg.y, this.x, this.y) < 72 + this.r;
        if (!near) this.walkTo(tg.x, tg.y, null, dt);
        else this.face = tg.x > this.x ? 1 : -1;
      } else {
        near = this.campNear(this.r + 40);
        if (!near) this.walkTo(camp.x, camp.y, camp, dt);
        else this.face = camp.x > this.x ? 1 : -1;
      }
      this.sweepT -= dt;
      if (this.sweepT <= 0 && this.anyoneNear(SWEEP.r)) {
        this.sweepT = SWEEP.every;
        this.windT = SWEEP.wind;
      }
    }
    draw(ctx) {
      const g = this.g;
      if (!this.dead && this.state !== 'sail') {
        // 脚下的光环
        const pulse = 0.5 + Math.sin(g.time * (this.enraged ? 10 : 4)) * 0.2;
        ctx.fillStyle = this.enraged ? `rgba(255,40,40,${0.28 * pulse + 0.1})` : `rgba(255,190,60,${0.18 * pulse})`;
        ctx.beginPath();
        ctx.ellipse(this.x, this.y + 2, 70, 24, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      super.draw(ctx);
    }
  }

  /* ---------------- 系统 ---------------- */
  const RT = new WeakMap();
  function rt(g) {
    let r = RT.get(g);
    if (!r) RT.set(g, (r = { boss: null, ship: null, barOn: null, pct: -1, enr: null, warnEl: null }));
    return r;
  }
  const isBossNight = (g) => (g.st.day + 1) % 5 === 0;

  function spawnBoss(g, x, y, land, onLand) {
    const st = g.sys.boss;
    const R = rt(g);
    const b = new Boss(g, x, y, land, st.count);
    if (onLand) b.state = 'walk';
    g.pirates.push(b);
    R.boss = b;
    R.pct = -1;
    R.enr = null;
    R.label = null;
    return b;
  }
  function launch(g, coreShip) {
    const st = g.sys.boss;
    const R = rt(g);
    const w = g.world;
    const CENTER = PF.World.CENTER;
    const pick = (allowSame) => {
      for (const d of U.shuffle([0, 1, 2, 3])) {
        if (!allowSame && coreShip && d === coreShip.dir) continue;
        let outer = w.outerTiles(d).filter((t) => t.i !== CENTER);
        if (allowSame && coreShip && d === coreShip.dir && outer.length > 1) {
          const T = D.TILE;
          outer = outer.filter((t) => U.dist(t.c * T + T / 2, t.r * T + T / 2, coreShip.land.x, coreShip.land.y) > T * 0.8);
        }
        if (outer.length) return [d, U.pick(outer)];
      }
      return null;
    };
    const pk = pick(false) || pick(true);
    st.count++;
    if (pk) {
      const s = new BossShip(g, pk[0], pk[1].i);
      g.ships.push(s);
      R.ship = s;
      g.later(() => g.toast('独眼船长的红帆大船从' + DIR_NAME[pk[0]] + '边靠岸了！'), 1800);
    } else {
      const c = w.camp();
      spawnBoss(g, c.x, c.y + 260, { x: c.x, y: c.y + 260 }, true);
    }
    A.play('alarm');
  }
  function showWarn(g) {
    const host = document.getElementById('extHud');
    if (!host) return;
    const R = rt(g);
    if (!R.warnEl) {
      R.warnEl = document.createElement('div');
      R.warnEl.id = 'cbBossWarn';
      host.appendChild(R.warnEl);
    }
    const n = g.sys.boss.count + 1;
    R.warnEl.innerHTML = `<b>首领来袭</b><span>独眼船长今晚亲自登陆${n > 1 ? '（第 ' + n + ' 次）' : ''}！</span>`;
    R.warnEl.classList.remove('on');
    void R.warnEl.offsetWidth;
    R.warnEl.classList.add('on');
    g.later(() => R.warnEl && R.warnEl.classList.remove('on'), 6500);
  }
  function syncBar(g) {
    const R = rt(g);
    const bar = document.getElementById('bossBar');
    if (!bar) return;
    const b = R.boss;
    const on = !!b && !b.dead && !g.over && !g.cut && !g.dead;
    if (R.barOn !== on) {
      R.barOn = on;
      bar.classList.toggle('on', on);
    }
    if (!on) return;
    const label = '独眼船长 · 第 ' + b.n + ' 次来袭';
    if (R.label !== label || !bar.firstChild) {
      R.label = label;
      bar.innerHTML = `<div class="bn"><i class="sk"></i><span>${label}</span><em></em></div><div class="bb"><i></i></div>`;
      R.fill = bar.querySelector('.bb i');
      R.tag = bar.querySelector('.bn em');
      R.pct = -1;
      R.enr = null;
    }
    const pct = Math.max(0, Math.round((b.hp / b.hpMax) * 400) / 4);
    if (pct !== R.pct) {
      R.pct = pct;
      R.fill.style.width = pct + '%';
    }
    if (R.enr !== b.enraged) {
      R.enr = b.enraged;
      bar.classList.toggle('enr', b.enraged);
      R.tag.textContent = b.enraged ? '暴怒' : '';
    }
  }

  PF.Sys.register({
    id: 'boss',
    order: 35,
    init(g, saved) {
      const s = saved || {};
      g.sys.boss = { defeated: s.defeated | 0, count: s.count | 0, lastNight: s.lastNight == null ? -1 : s.lastNight };
      const R = rt(g);
      R.barOn = null;
      if (Array.isArray(s.b)) {
        const [x, y, hp, enr, n] = s.b;
        const w = g.world;
        let px = x,
          py = y;
        if (!w.walkable(px, py, 20)) {
          const c = w.camp();
          px = c.x;
          py = c.y + 260;
        }
        const b = spawnBoss(g, px, py, { x: px, y: py }, true);
        if (n) b.n = n;
        if (hp > 0) b.hp = Math.min(b.hpMax, hp);
        if (enr || b.hp < b.hpMax * 0.4) {
          b.enraged = true;
          b.kind = 'bossR';
          b.speed = b.K.speed * 1.3;
        }
      }
      syncBar(g);
    },
    serialize(g) {
      const st = g.sys.boss;
      const R = rt(g);
      let b = null;
      if (R.boss && !R.boss.dead) {
        const e = R.boss;
        const onLand = e.state !== 'sail';
        b = [Math.round(onLand ? e.x : e.land.x), Math.round(onLand ? e.y : e.land.y), e.hp, e.enraged ? 1 : 0, e.n];
      } else if (R.ship && !R.ship.dropped && !R.ship.done) b = [Math.round(R.ship.land.x), Math.round(R.ship.land.y), -1, 0, st.count];
      return { defeated: st.defeated, count: st.count, lastNight: st.lastNight, b };
    },
    destroy(g) {
      const R = rt(g);
      const bar = document.getElementById('bossBar');
      if (bar) {
        bar.classList.remove('on', 'enr');
        bar.innerHTML = '';
      }
      if (R.warnEl) R.warnEl.remove();
      RT.delete(g);
    },
    dusk(g) {
      if (!isBossNight(g)) return;
      const R = rt(g);
      if (R.boss && !R.boss.dead) return;
      showWarn(g);
      A.play('warn');
      g.toast('⚠ 首领要来了：提前修好营地、备好防御');
    },
    raid(g, ship) {
      const st = g.sys.boss;
      const R = rt(g);
      if (!isBossNight(g) || st.lastNight === g.st.day) return;
      if (R.boss && !R.boss.dead) return;
      st.lastNight = g.st.day;
      launch(g, ship);
    },
    update(g) {
      syncBar(g);
    },
    // 天亮还没打倒：首领撤退（不给奖励），下一个首领夜再来，免得白天一直被他追着打
    dawn(g) {
      const R = rt(g);
      const b = R.boss;
      if (!b || b.dead) return;
      b.shells.length = 0;
      b.dead = true;
      b.deadT = 0;
      g.fx.text(b.x, b.y - 250, '首领撤退了', '#ffd0a0', true);
      g.toast('天亮了，独眼船长骂骂咧咧地撤退了——下一个首领夜他还会再来');
      R.boss = null;
      syncBar(g);
    },
    enemyDie(g, e) {
      const R = rt(g);
      if (!(e instanceof Boss)) return;
      const st = g.sys.boss;
      st.defeated++;
      e.shells.length = 0;
      const w = g.world;
      let x = e.x,
        y = e.y + 30;
      if (!w.walkable(x, y, 20)) {
        x = e.x;
        y = e.y;
      }
      const tile = w.tileIdx(x, y);
      if (tile >= 0 && w.tiles[tile].unlocked) w.chests.push({ x: Math.round(x), y: Math.round(y), tile, opened: false, gold: 80 });
      g.fire('stat', 'boss', 1);
      g.cam.shake = 12;
      g.fx.sparkle(e.x, e.y - 80, '#ffe36b');
      g.fx.text(e.x, e.y - 250, '击败首领！', '#ffe36b', true);
      A.play('success');
      g.toast('击败了独眼船长！他留下了一个宝箱');
      R.boss = null;
      syncBar(g);
      g.save();
    },
    drawGround(g, ctx) {
      const b = rt(g).boss;
      if (!b || b.dead) return;
      // 横扫蓄力：红圈
      if (b.windT > 0) {
        const k = 1 - b.windT / SWEEP.wind;
        ctx.fillStyle = `rgba(255,60,50,${0.12 + k * 0.22})`;
        ctx.beginPath();
        ctx.ellipse(b.x, b.y, SWEEP.r, SWEEP.r * 0.62, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,90,79,0.9)';
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.ellipse(b.x, b.y, SWEEP.r * k, SWEEP.r * 0.62 * k, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      // 炮击预警
      for (const s of b.shells) {
        const k = 1 - s.t / BARRAGE.delay;
        const pulse = 0.5 + Math.sin(g.time * 18) * 0.5;
        ctx.fillStyle = `rgba(255,60,50,${0.1 + k * 0.25})`;
        ctx.beginPath();
        ctx.arc(s.x, s.y, BARRAGE.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = `rgba(255,${Math.round(90 + pulse * 120)},79,0.95)`;
        ctx.lineWidth = 5;
        ctx.setLineDash([12, 8]);
        ctx.beginPath();
        ctx.arc(s.x, s.y, BARRAGE.r, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = 'rgba(255,90,79,0.55)';
        ctx.beginPath();
        ctx.arc(s.x, s.y, BARRAGE.r * k, 0, Math.PI * 2);
        ctx.fill();
      }
    },
    drawTop(g, ctx) {
      const b = rt(g).boss;
      if (!b || b.dead) return;
      // 横扫刀光
      if (b.swingT > 0) {
        const k = b.swingT / 0.22;
        ctx.strokeStyle = `rgba(255,255,255,${k})`;
        ctx.lineWidth = 14;
        ctx.beginPath();
        const a0 = b.face > 0 ? -1.4 : Math.PI + 1.4;
        ctx.arc(b.x, b.y - 60, SWEEP.r * 0.85, a0, a0 + b.face * 2.6 * (1 - k * 0.5), b.face < 0);
        ctx.stroke();
      }
      // 落下的炮弹
      for (const s of b.shells) {
        if (s.t > 0.45) continue;
        const k = s.t / 0.45;
        const y = s.y - 20 - k * 560;
        E.shadow(ctx, s.x, s.y, 26 * (1 - k * 0.6), 9 * (1 - k * 0.6), 0.35);
        ctx.fillStyle = OUT;
        ctx.fillRect(s.x - 16, y - 16, 32, 32);
        ctx.fillStyle = '#4a4458';
        ctx.fillRect(s.x - 12, y - 12, 24, 24);
        ctx.fillStyle = '#8d87a9';
        ctx.fillRect(s.x - 8, y - 8, 8, 8);
      }
    },
    lights(g, light) {
      const b = rt(g).boss;
      if (b && !b.dead) light(b.x, b.y - 80, 220, 0.6);
      if (b) for (const s of b.shells) light(s.x, s.y, BARRAGE.r * 1.3, 0.5);
    },
    drawScreen(g) {
      syncBar(g);
    },
    minimap(g, dot) {
      const b = rt(g).boss;
      if (!b || b.dead) return;
      dot(b.x, b.y, '#1c1424', 10);
      dot(b.x, b.y, b.enraged ? '#ff2a2a' : '#d8342c', 7);
      dot(b.x, b.y, '#ffd23f', 3);
    },
    help() {
      return '<p><b>海盗首领：</b>每到第 5、10、15……夜，独眼船长会坐着红帆大船亲自登陆。他会横扫身边、往地上开炮（看到红圈快跑开），还会叫来小喽啰；血量低于 40% 时会暴怒。打倒他能得到一个宝箱，之后他会带着更多血量卷土重来；天亮前没打倒，他会先撤退，下个首领夜再来。</p>';
    },
  });
  PF.Boss = { Boss, BossShip, isBossNight };
})();
