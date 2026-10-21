/* 雾中怪物：第 3 夜起（无尽模式第 2 夜起）从迷雾边缘钻出来，专抓小精灵
   - 雾影：快、脆；雾魔：第 6 夜起出现，慢、硬
   - 在篝火的火光里移动 ×0.6、受到伤害 ×1.5（PF.Defense.inBonfire）
   - 天亮时化成雾散掉（不掉金币） */
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
  const KINDS = [
    { id: 'fog0', name: '雾影', hp: 25, atk: 4, speed: 190, gold: 5, scale: 1, atkCD: 1.2 },
    { id: 'fog1', name: '雾魔', hp: 90, atk: 9, speed: 120, gold: 12, scale: 1.3, atkCD: 1.8 },
  ];
  const SPAWN_AT = 5; // 入夜后几秒开始冒出来
  const SPREAD = 30; // 在多少秒内陆续出现

  /* ---------------- 像素图 ---------------- */
  const ART = {};
  function fogArt(k, f) {
    const key = k + '_' + f;
    if (ART[key]) return ART[key];
    const big = k === 1;
    const p = new S.PC(18, 20);
    const c1 = big ? '#7a68b0' : '#cfcaea',
      c2 = big ? '#54458a' : '#9c95c6',
      c3 = big ? '#a597d8' : '#f4f2ff';
    const eye = big ? '#ffd23f' : '#ff4f6a';
    // 身体
    p.circ(9, 8, 6.5, c1);
    p.r(2, 8, 14, 6, c1);
    p.r(2, 12, 14, 2, c2);
    // 飘动的尾巴
    for (let i = 0; i < 5; i++) {
      const x = 2 + i * 3;
      const h = (i + f) % 2 ? 4 : 2;
      p.r(x, 14, i === 4 ? 2 : 3, h, i % 2 ? c2 : c1);
    }
    p.r(4, 3, 3, 2, c3);
    p.p(3, 5, c3);
    if (big) {
      p.r(3, 0, 2, 3, '#2b2340');
      p.r(13, 0, 2, 3, '#2b2340');
      p.p(4, 0, '#4a3d75');
      p.r(0, 9, 2, 3, c2);
      p.r(16, 9, 2, 3, c2);
    }
    // 眼睛和嘴（朝右）
    p.r(7, 7, 2, 3, '#2a1d3a');
    p.r(11, 7, 2, 3, '#2a1d3a');
    p.p(8, 8, eye);
    p.p(12, 8, eye);
    p.r(8, 11, 4, 1, '#2a1d3a');
    p.p(9, 12, '#2a1d3a');
    p.p(11, 12, '#2a1d3a');
    p.outline(OUT);
    return (ART[key] = p.c);
  }

  /* ---------------- 雾怪 ---------------- */
  class FogMon extends E.Pirate {
    constructor(g, k, x, y) {
      super(g, KINDS[k], x, y, { x, y });
      this.fk = k;
      this.state = 'walk';
      this.noSave = true;
      this.isFog = true;
      this.fadeIn = 0;
      this.fade = 0;
      this.fading = false;
      this.retT = 0;
      this.aggroT = 0;
      this.lunge = 0;
      this.bob = Math.random() * 6;
    }
    inFire() {
      return PF.Defense ? PF.Defense.inBonfire(this.g, this.x, this.y) : false;
    }
    hurt(dmg, src) {
      if (this.dead || this.fading) return;
      if (this.inFire()) dmg *= 1.5;
      if (src && src.canBeTargeted) this.aggroT = 2.5;
      super.hurt(dmg, src);
    }
    pickTarget() {
      const g = this.g;
      let best = null,
        bd = 110 * 110;
      // 贴脸的玩家先打
      for (const p of g.players) {
        if (p.down) continue;
        const d = U.dist2(p.x, p.y, this.x, this.y);
        if (d < bd) {
          bd = d;
          best = p;
        }
      }
      if (best) return best;
      // 然后是小精灵（雾怪最爱抓精灵）
      bd = 700 * 700;
      for (const w of g.workers) {
        if (w.dead) continue;
        const d = U.dist2(w.x, w.y, this.x, this.y);
        if (d < bd) {
          bd = d;
          best = w;
        }
      }
      if (best) return best;
      bd = 400 * 400;
      for (const p of g.players) {
        if (p.down) continue;
        const d = U.dist2(p.x, p.y, this.x, this.y);
        if (d < bd) {
          bd = d;
          best = p;
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
    walkTo(tx, ty, ignore, sp, dt) {
      const w = this.g.world;
      let [wx, wy] = w.nextWaypoint(this.x, this.y, w.tileIdx(tx, ty), tx, ty);
      [wx, wy] = w.steer(this.x, this.y, wx, wy, this.r, ignore);
      const dx = wx - this.x,
        dy = wy - this.y;
      const d = Math.hypot(dx, dy);
      if (d < 2) return;
      const s = Math.min(d, sp * dt);
      this.face = dx > 0 ? 1 : -1;
      const ox = this.x,
        oy = this.y;
      E.moveEnt(this.g, this, (dx / d) * s, (dy / d) * s, this.r);
      if (U.dist(ox, oy, this.x, this.y) < s * 0.2) {
        const side = Math.sin(this.t * 1.3 + this.bob) > 0 ? 1 : -1;
        E.moveEnt(this.g, this, (-dy / d) * s * side, (dx / d) * s * side, this.r);
      }
      this.moving = true;
    }
    update(dt) {
      const g = this.g;
      this.t += dt;
      this.moving = false;
      if (this.flash > 0) this.flash -= dt * 3;
      if (this.lunge > 0) this.lunge -= dt;
      if (this.dead) {
        this.deadT -= dt;
        return;
      }
      if (this.fadeIn < 1) this.fadeIn = Math.min(1, this.fadeIn + dt * 1.6);
      if (this.fading) {
        this.fade -= dt;
        if (this.fade <= 0) {
          this.dead = true;
          this.deadT = 0;
        }
        return;
      }
      if (this.fadeIn < 0.6) return; // 刚钻出来，先愣一下
      if (this.aggroT > 0) this.aggroT -= dt;
      const tg = this.target;
      if (tg && (tg.dead || tg.down)) this.target = null;
      this.retT -= dt;
      if (!this.target || (this.retT <= 0 && this.aggroT <= 0)) {
        this.retT = 1;
        this.target = this.pickTarget();
      }
      const sp = this.speed * (this.inFire() ? 0.6 : 1);
      const camp = g.world.camp();
      if (this.target) {
        const t = this.target;
        const d = U.dist(t.x, t.y, this.x, this.y);
        if (d > 44 + this.r) {
          this.walkTo(t.x, t.y, null, sp, dt);
          this.atkT = Math.min(this.atkT, 0.4);
        } else {
          this.face = t.x > this.x ? 1 : -1;
          this.atkT += dt;
          if (this.atkT >= this.K.atkCD) {
            this.atkT = 0;
            this.lunge = 0.25;
            t.hurt(this.atk, this);
          }
        }
        return;
      }
      const fp = g.world.footprint(camp);
      const cx = U.clamp(this.x, fp.x0, fp.x1),
        cy = U.clamp(this.y, fp.y0, fp.y1);
      if (U.dist(cx, cy, this.x, this.y) < this.r + 26) {
        this.face = camp.x > this.x ? 1 : -1;
        this.atkT += dt;
        if (this.atkT >= this.K.atkCD) {
          this.atkT = 0;
          this.lunge = 0.25;
          g.hurtCamp(this.atk);
        }
      } else this.walkTo(camp.x, camp.y, camp, sp, dt);
    }
    draw(ctx) {
      const sc = this.K.scale;
      const a = this.dead ? Math.max(0, this.deadT) : this.fading ? Math.max(0, this.fade) : this.fadeIn;
      if (a <= 0.01) return;
      const hover = Math.sin(this.t * 3 + this.bob) * 6;
      const lift = this.dead ? (1 - Math.max(0, this.deadT)) * 50 : this.fading ? (1 - this.fade) * 40 : 0;
      const lx = this.lunge > 0 ? this.face * Math.sin((this.lunge / 0.25) * Math.PI) * 14 : 0;
      E.shadow(ctx, this.x, this.y, 22 * sc, 7 * sc, 0.2 * a);
      ctx.globalAlpha = a * (this.dead ? 0.7 : 0.88);
      const img = fogArt(this.fk, Math.floor(this.t * 5) % 2);
      E.drawSprite(ctx, img, this.x + lx, this.y - 12 + hover - lift, { flip: this.face < 0, scale: sc });
      if (this.flash > 0 && !this.dead) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = Math.min(1, this.flash) * a;
        E.drawSprite(ctx, img, this.x + lx, this.y - 12 + hover - lift, { flip: this.face < 0, scale: sc });
        ctx.globalCompositeOperation = 'source-over';
      }
      ctx.globalAlpha = 1;
      if (!this.dead && !this.fading && this.hp < this.hpMax) E.hpBar(ctx, this.x, this.y - 100 * sc, 46, this.hp / this.hpMax, '#c79bff');
    }
  }

  /* ---------------- 生成 ---------------- */
  const RT = new WeakMap();
  function rt(g) {
    let r = RT.get(g);
    if (!r) RT.set(g, (r = { prevT: g.st.cycleT, cand: [] }));
    return r;
  }
  function firstNight(g) {
    return g.endless ? 1 : 2;
  }
  function nightCount(g) {
    const day = g.st.day;
    let n = Math.min(8, 1 + Math.floor(day / 2));
    n = Math.round(n * (g.mods.enemyCountMul || 1));
    const ev = g.sys.events;
    if (ev && ev.weather === 'storm') n = Math.round(n * 1.5);
    return Math.max(1, n);
  }
  /* 迷雾边缘（已解锁地块挨着未解锁地块的那一侧）往里一点的位置 */
  function spawnPoint(g) {
    const w = g.world;
    const R = rt(g);
    const cand = R.cand;
    cand.length = 0;
    for (const t of w.tiles) {
      if (!t.unlocked) continue;
      const nb = [t.r > 0 ? t.i - N : -1, t.r < N - 1 ? t.i + N : -1, t.c > 0 ? t.i - 1 : -1, t.c < N - 1 ? t.i + 1 : -1];
      for (let d = 0; d < 4; d++) if (nb[d] >= 0 && !w.tiles[nb[d]].unlocked) cand.push(t.i * 4 + d);
    }
    // 全岛都驱散了：从海边钻出来
    if (!cand.length)
      for (let d = 0; d < 4; d++) for (const t of w.outerTiles(d)) cand.push(t.i * 4 + d);
    if (!cand.length) return null;
    const camp = w.camp();
    for (let k = 0; k < 24; k++) {
      const c = cand[(Math.random() * cand.length) | 0];
      const t = w.tiles[c >> 2],
        d = c & 3;
      let x, y;
      const inset = U.rand(42, 70);
      if (d === 0) {
        y = t.r * T + inset + 10;
        x = U.rand(t.c * T + 60, (t.c + 1) * T - 60);
      } else if (d === 1) {
        y = (t.r + 1) * T - inset;
        x = U.rand(t.c * T + 60, (t.c + 1) * T - 60);
      } else if (d === 2) {
        x = t.c * T + inset;
        y = U.rand(t.r * T + 70, (t.r + 1) * T - 50);
      } else {
        x = (t.c + 1) * T - inset;
        y = U.rand(t.r * T + 70, (t.r + 1) * T - 50);
      }
      if (!w.walkable(x, y, 18)) continue;
      if (k < 16) {
        let close = U.dist(x, y, camp.x, camp.y) < 280;
        for (const p of g.players) if (U.dist(x, y, p.x, p.y) < 240) close = true;
        if (close) continue;
      }
      return [x, y];
    }
    return null;
  }
  function spawnOne(g) {
    const st = g.sys.fogmon;
    const pt = spawnPoint(g);
    if (!pt) return;
    let k = 0;
    if (g.st.day >= 5) k = Math.random() < 0.35 || (st.big === 0 && st.q <= 1) ? 1 : 0;
    if (k) st.big++;
    const m = new FogMon(g, k, pt[0], pt[1]);
    g.pirates.push(m);
    g.fx.burst(pt[0], pt[1] - 30, '#cfcaea', 10);
    g.fx.sparkle(pt[0], pt[1] - 40, '#9c95c6');
    A.play('pop');
    if (!st.told) {
      st.told = true;
      g.toast(st.seen ? '雾怪又从迷雾里钻出来了！' : '迷雾里钻出了雾怪！它们专抓小精灵，篝火能削弱它们');
      st.seen = true;
    }
  }

  PF.Sys.register({
    id: 'fogmon',
    order: 30,
    init(g, saved) {
      const s = saved || {};
      g.sys.fogmon = { q: s.q | 0, nextT: +s.nextT || 0, gap: +s.gap || 3, seen: !!s.seen, told: !!s.told, big: s.big | 0 };
      if (Array.isArray(s.list))
        for (const a of s.list) {
          if (!a || !KINDS[a[0]] || !g.world.walkable(a[1], a[2], 14)) continue;
          const m = new FogMon(g, a[0], a[1], a[2]);
          m.hp = Math.max(1, Math.min(m.hpMax, a[3] || m.hpMax));
          m.fadeIn = 1;
          g.pirates.push(m);
        }
      rt(g).prevT = g.st.cycleT;
    },
    serialize(g) {
      const st = g.sys.fogmon;
      const list = [];
      for (const e of g.pirates) if (e instanceof FogMon && !e.dead && !e.fading) list.push([e.fk, Math.round(e.x), Math.round(e.y), e.hp]);
      return { q: st.q, nextT: st.nextT, gap: st.gap, seen: st.seen, told: st.told, big: st.big, list };
    },
    destroy(g) {
      RT.delete(g);
    },
    update(g) {
      const st = g.sys.fogmon;
      const R = rt(g);
      const ct = g.st.cycleT;
      const at = g.dayLen + SPAWN_AT;
      if (R.prevT < at && ct >= at && g.st.day >= firstNight(g) && !g.over) {
        st.q = nightCount(g);
        st.gap = SPREAD / st.q;
        st.nextT = at;
        st.told = false;
        st.big = 0;
      }
      R.prevT = ct;
      if (st.q > 0) {
        if (!g.isNight() || g.over) st.q = 0;
        else if (ct >= st.nextT) {
          spawnOne(g);
          st.q--;
          st.nextT = ct + st.gap * U.rand(0.6, 1.3);
        }
      }
    },
    dawn(g) {
      const st = g.sys.fogmon;
      st.q = 0;
      let n = 0;
      for (const e of g.pirates) {
        if (!(e instanceof FogMon) || e.dead || e.fading) continue;
        e.fading = true;
        e.fade = 1;
        e.target = null;
        n++;
        g.fx.burst(e.x, e.y - 40, '#cfcaea', 6);
      }
      if (n) g.toast('天亮了，雾怪化成雾气散掉了');
    },
    enemyDie(g, e) {
      if (!(e instanceof FogMon)) return;
      g.fire('stat', 'fogmon', 1);
      g.fx.sparkle(e.x, e.y - 50, '#cfcaea');
    },
    minimap(g, dot) {
      for (const e of g.pirates) if (e instanceof FogMon && !e.dead && !e.fading) dot(e.x, e.y, '#c9b8ff', 4);
    },
    lights(g, light) {
      for (const e of g.pirates) {
        if (!(e instanceof FogMon) || e.dead) continue;
        const a = e.fading ? e.fade : e.fadeIn;
        light(e.x, e.y - 50, 90 * e.K.scale, 0.38 * a);
      }
    },
    help() {
      return '<p><b>雾中怪物：</b>从第 3 夜起，迷雾边缘会钻出雾影（第 6 夜起还有更结实的雾魔）。它们最爱抓小精灵，晚上记得守着精灵；在篝火的火光里，雾怪会变慢并受到 1.5 倍伤害。天一亮它们就化成雾散掉。</p>';
    },
  });
  PF.FogMon = FogMon;
})();
