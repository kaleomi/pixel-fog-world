/* 宠物伙伴（系统 id: pets）
   - 螃蟹：带着鱼走近海滩上的野生螃蟹，喂 1 条鱼即可驯服；会帮主人打附近的敌人，被打晕后自己爬回营地休息 30 秒
   - 海鸥：集市领养（或商船上买）；每 25 秒飞出去一趟，叼回资源或金币
   - 小乌龟：集市领养；跟着主人慢慢走，持续给主人回血，在营地旁还会修营地
   每人同时带一只，喂鱼升级（Lv1 → Lv3，每级能力 +50%）。宠物数据存在 g.sys.pets.owned
   接口说明见 docs/PLUGIN_API.md */
(function () {
  'use strict';
  const PF = window.PF,
    U = PF.U,
    D = PF.Data,
    S = PF.Spr,
    A = PF.Audio,
    E = PF.Ent;
  const OUT = '#1c1424';
  const FISH_KEYS = ['fish_s', 'fish_m', 'fish_l', 'fish_r'];
  const NEED = [0, 3, 6]; // 升到下一级要喂的鱼：Lv1→2 3 条，Lv2→3 再 6 条
  const MAX_LV = 3;
  const ERRAND = 25; // 海鸥出门间隔
  const mult = (lv) => 1 + 0.5 * (lv - 1);

  /* ---------------- 像素图 ---------------- */
  const SP = {};
  const spr = (k, fn) => SP[k] || (SP[k] = fn());
  function drawPetCrab(frame) {
    const p = new S.PC(14, 10);
    p.r(3, 4, 8, 4, '#ff6a3d');
    p.r(4, 3, 6, 1, '#ff8a5c');
    p.p(5, 2, OUT);
    p.p(8, 2, OUT);
    p.r(0, frame ? 2 : 3, 3, 2, '#ff6a3d');
    p.r(11, frame ? 3 : 2, 3, 2, '#ff6a3d');
    for (let k = 0; k < 3; k++) p.p(3 + k * 3, 8 + ((k + frame) % 2), '#d8492c');
    // 蓝色小围巾：一眼看出是自家的
    p.r(3, 6, 8, 1, '#4f9dff');
    p.p(10, 7, '#4f9dff');
    p.p(4, 6, '#9fd0ff');
    p.outline(OUT);
    return p.c;
  }
  function drawTurtle(frame) {
    const p = new S.PC(17, 11);
    const lf = frame ? 1 : 0;
    p.r(2 + lf, 8, 2, 2, '#6fbf4a');
    p.r(11 - lf, 8, 2, 2, '#6fbf4a');
    p.r(5 - lf, 8, 2, 2, '#5aa83f');
    p.r(8 + lf, 8, 2, 2, '#5aa83f');
    p.p(0, 7, '#6fbf4a');
    for (let j = 1; j <= 8; j++)
      for (let i = 1; i < 14; i++) {
        const dx = (i + 0.5 - 7.5) / 6.5,
          dy = (j + 0.5 - 8.4) / 7.4;
        if (dx * dx + dy * dy <= 1) p.p(i, j, j === 8 ? '#c9a24a' : '#4f9a3f');
      }
    p.r(5, 3, 5, 3, '#79c850');
    p.r(2, 5, 2, 2, '#79c850');
    p.r(11, 5, 2, 2, '#79c850');
    p.r(4, 3, 1, 4, '#2f6a3a');
    p.r(10, 3, 1, 4, '#2f6a3a');
    p.r(5, 6, 5, 1, '#2f6a3a');
    p.r(6, 1, 4, 1, '#8fe06a');
    p.r(13, 4, 3, 3, '#7fd05a');
    p.p(15, 4, OUT);
    p.p(14, 6, '#5aa83f');
    p.outline(OUT);
    return p.c;
  }
  const crabImg = (f) => spr('pc' + f, () => drawPetCrab(f));
  const turtleImg = (f) => spr('tt' + f, () => drawTurtle(f));

  const KIND = {
    crab: {
      name: '螃蟹',
      icon: () => crabImg(0),
      desc: (lv) => `帮主人打附近的敌人（每下 ${Math.round(6 * mult(lv))} 伤害，生命 ${crabHpMax(lv)}）`,
    },
    gull: {
      name: '海鸥',
      icon: () => S.gull(0),
      desc: (lv) => `每 ${ERRAND} 秒飞出去一趟，叼回资源或金币（×${mult(lv)}）`,
      cost: [0, 0, 0, 60],
      fish: 2,
    },
    turtle: {
      name: '小乌龟',
      icon: () => turtleImg(0),
      desc: (lv) => `每秒给主人回 ${3 * mult(lv)} 血；在营地旁每秒修 ${2 * mult(lv)} 营地`,
      cost: [0, 60, 0, 40],
      fish: 0,
    },
  };
  const crabHpMax = (lv) => 80 + 40 * (lv - 1);

  /* ---------------- 鱼（和钓鱼系统共用 g.st.items） ---------------- */
  function fishTotal(g) {
    let n = 0;
    for (const k of FISH_KEYS) n += g.item(k);
    return n;
  }
  function takeFish(g, n) {
    if (fishTotal(g) < n) return false;
    let left = n;
    for (const k of FISH_KEYS) {
      const t = Math.min(left, g.item(k));
      if (t > 0) g.addItem(k, -t);
      left -= t;
      if (!left) break;
    }
    return true;
  }

  /* =================== 宠物实体 =================== */
  class Pet {
    constructor(g, d, at) {
      this.g = g;
      this.d = d;
      this.kind = d.kind;
      this.isPet = true;
      this.r = 10;
      this.t = Math.random() * 5;
      this.face = 1;
      this.moving = false;
      this.flash = 0;
      this.stuckT = 0;
      this.dead = false;
      const o = this.owner || g.players[0];
      this.x = at ? at.x : o.x - 50;
      this.y = at ? at.y : o.y + 14;
      if (!g.world.walkable(this.x, this.y, this.r)) {
        this.x = o.x;
        this.y = o.y + 6;
      }
      if (this.kind === 'crab') {
        this.canBeTargeted = true;
        this.down = false;
        this.downT = 0;
        this.hp = d.hp > 0 ? Math.min(d.hp, this.hpMax) : this.hpMax;
        this.atkT = 0;
        this.hurtCD = 0;
        this.regenAcc = 0;
        this.target = null;
        this.snapT = 0;
      } else if (this.kind === 'gull') {
        this.state = 'perch';
        this.errT = ERRAND * 0.6;
        this.st = 0;
        this.h = 96;
        this.vx = 0;
      } else {
        this.healT = 0;
        this.healAcc = 0;
      }
    }
    get owner() {
      return this.g.players[this.d.owner];
    }
    get hpMax() {
      return crabHpMax(this.d.lv);
    }
    get mult() {
      return mult(this.d.lv);
    }
    /* 螃蟹挨打（敌人通过 g.allies 找到它） */
    hurt(dmg) {
      if (this.kind !== 'crab' || this.down || this.dead) return;
      dmg = Math.round(dmg);
      if (dmg <= 0) return;
      this.hp -= dmg;
      this.flash = 0.6;
      this.hurtCD = 5;
      this.g.fx.text(this.x, this.y - 60, '-' + dmg, '#ff5a4f');
      if (this.hp <= 0) {
        this.hp = 0;
        this.down = true;
        this.canBeTargeted = false;
        this.downT = 30;
        this.target = null;
        A.play('hurt');
        this.g.toast('螃蟹被打晕了，它会自己爬回营地休息 30 秒');
      }
    }
    moveToward(tx, ty, sp, dt) {
      const dx = tx - this.x,
        dy = ty - this.y;
      const d = Math.hypot(dx, dy);
      if (d < 3) {
        this.moving = false;
        return true;
      }
      const st = Math.min(d, sp * dt);
      if (Math.abs(dx) > 2) this.face = dx > 0 ? 1 : -1;
      E.moveEnt(this.g, this, (dx / d) * st, (dy / d) * st, this.r);
      this.moving = true;
      return false;
    }
    teleport(x, y) {
      const w = this.g.world;
      if (!w.walkable(x, y, this.r)) {
        const o = this.owner;
        if (!o) return;
        x = o.x;
        y = o.y + 6;
      }
      this.g.fx.burst(this.x, this.y - 20, '#ffffff', 4);
      this.x = x;
      this.y = y;
      this.g.fx.burst(x, y - 20, '#ffffff', 4);
    }
    /* 跟在主人身后，走不过去 / 离太远就“蹦”过去 */
    follow(dt, sp) {
      const o = this.owner;
      if (!o) return;
      const tx = o.x - o.face * 52,
        ty = o.y + 14;
      const d = U.dist(this.x, this.y, tx, ty);
      if (d > 520 || this.stuckT > 2.5) {
        this.stuckT = 0;
        this.teleport(tx, ty);
        return;
      }
      if (d > 30) {
        const px = this.x,
          py = this.y;
        const s = d > 170 ? sp * 1.5 : sp;
        this.moveToward(tx, ty, s, dt);
        if (U.dist(px, py, this.x, this.y) < 0.2 * s * dt) this.stuckT += dt;
        else this.stuckT = Math.max(0, this.stuckT - dt);
      } else {
        this.moving = false;
        this.stuckT = 0;
      }
    }
    update(dt) {
      this.t += dt;
      if (this.flash > 0) this.flash -= dt * 3;
      if (this.kind === 'crab') this.updCrab(dt);
      else if (this.kind === 'gull') this.updGull(dt);
      else this.updTurtle(dt);
    }
    updCrab(dt) {
      const g = this.g,
        o = this.owner;
      if (this.snapT > 0) this.snapT -= dt;
      if (this.down) {
        this.downT -= dt;
        const camp = g.world.camp();
        if (U.dist(this.x, this.y, camp.x, camp.y + 60) > 90) {
          let [wx, wy] = g.world.nextWaypoint(this.x, this.y, camp.tile, camp.x, camp.y + 60);
          [wx, wy] = g.world.steer(this.x, this.y, wx, wy, this.r);
          const px = this.x,
            py = this.y;
          this.moveToward(wx, wy, 55, dt);
          if (U.dist(px, py, this.x, this.y) < 0.2 * 55 * dt) this.stuckT += dt;
          else this.stuckT = 0;
          if (this.stuckT > 4) {
            this.stuckT = 0;
            this.teleport(camp.x + 60, camp.y + 70);
          }
        } else this.moving = false;
        if (this.downT <= 0) {
          this.down = false;
          this.canBeTargeted = true;
          this.hp = this.hpMax;
          g.fx.sparkle(this.x, this.y - 30, '#9be38a');
          g.fx.text(this.x, this.y - 80, '螃蟹满血归来！', '#9be38a');
        }
        return;
      }
      if (this.hurtCD > 0) this.hurtCD -= dt;
      else if (this.hp < this.hpMax) {
        this.regenAcc += dt;
        if (this.regenAcc >= 1) {
          this.regenAcc -= 1;
          this.hp = Math.min(this.hpMax, this.hp + 2);
        }
      }
      // 找主人附近的敌人
      const tg = this.target;
      if (tg && (tg.dead || tg.state === 'sail' || !o || U.dist(tg.x, tg.y, o.x, o.y) > 230)) this.target = null;
      if (!this.target && o) {
        let best = null,
          bd = 150;
        for (const e of g.pirates) {
          if (e.dead || e.state === 'sail') continue;
          const d = U.dist(e.x, e.y, o.x, o.y);
          if (d < bd) {
            bd = d;
            best = e;
          }
        }
        this.target = best;
      }
      if (this.target) {
        const e = this.target;
        const d = U.dist(e.x, e.y, this.x, this.y);
        if (d > 44) {
          this.moveToward(e.x, e.y, 240, dt);
          this.atkT = Math.min(this.atkT, 0.4);
        } else {
          this.moving = false;
          this.face = e.x > this.x ? 1 : -1;
          this.atkT += dt;
          if (this.atkT >= 0.8) {
            this.atkT = 0;
            this.snapT = 0.25;
            e.hurt(Math.round(6 * this.mult), this);
            g.fx.burst(e.x, e.y - 40, '#ff8a5c', 3);
            A.play('hit');
          }
        }
        return;
      }
      this.follow(dt, 230);
    }
    updGull(dt) {
      const g = this.g,
        o = this.owner;
      if (!o) return;
      if (this.state === 'perch') {
        const tx = o.x - o.face * 40,
          ty = o.y - 2;
        const k = Math.min(1, dt * 4);
        this.vx = tx - this.x;
        this.x += (tx - this.x) * k;
        this.y += (ty - this.y) * k;
        this.h += (96 + Math.sin(this.t * 3) * 6 - this.h) * k;
        if (Math.abs(this.vx) > 4) this.face = this.vx > 0 ? 1 : -1;
        this.errT -= dt;
        if (this.errT <= 0 && !g.over) {
          this.state = 'out';
          this.st = 0;
          this.dir = Math.random() * Math.PI * 2;
        }
      } else if (this.state === 'out') {
        this.st += dt;
        this.x += Math.cos(this.dir) * 420 * dt;
        this.y += Math.sin(this.dir) * 260 * dt;
        this.h += 120 * dt;
        this.face = Math.cos(this.dir) >= 0 ? 1 : -1;
        if (this.st >= 2.2) {
          this.state = 'gone';
          this.st = 0;
        }
      } else if (this.state === 'gone') {
        this.st += dt;
        if (this.st >= 2.5) {
          this.state = 'back';
          this.st = 0;
          this.x = o.x + Math.cos(this.dir) * 900;
          this.y = o.y + Math.sin(this.dir) * 560;
          this.h = 360;
        }
      } else if (this.state === 'back') {
        const dx = o.x - this.x,
          dy = o.y - this.y;
        const d = Math.hypot(dx, dy);
        this.face = dx >= 0 ? 1 : -1;
        this.h += (110 - this.h) * Math.min(1, dt * 2);
        if (d < 40 || this.st > 6) {
          this.deliver();
          this.state = 'perch';
          this.errT = ERRAND;
        } else {
          this.st += dt;
          const sp = Math.min(d, 520 * dt);
          this.x += (dx / d) * sp;
          this.y += (dy / d) * sp;
        }
      }
    }
    deliver() {
      const g = this.g,
        o = this.owner;
      if (!o) return;
      const m = this.mult;
      const r = Math.random();
      let k, n;
      if (r < 0.3) (k = 3), (n = U.randi(1, 5));
      else if (r < 0.45) (k = 2), (n = U.randi(2, 5));
      else (k = r < 0.72 ? 0 : 1), (n = U.randi(3, 8));
      n = Math.max(1, Math.round(n * m));
      g.addRes(k, n, o.x, o.y - 170);
      g.fx.burst(this.x, this.y - this.h, '#ffffff', 4);
      A.play(k === 3 ? 'coin' : 'pop');
    }
    updTurtle(dt) {
      const g = this.g,
        o = this.owner;
      this.follow(dt, 130);
      this.healT += dt;
      if (this.healT < 1) return;
      this.healT -= 1;
      const m = this.mult;
      if (o && !o.down && o.hp < o.hpMax && U.dist(o.x, o.y, this.x, this.y) < 150) {
        const add = Math.min(3 * m, o.hpMax - o.hp);
        o.hp += add;
        this.healAcc += add;
        if (this.healAcc >= 6) {
          g.fx.text(o.x, o.y - 130, '+' + Math.round(this.healAcc), '#9be38a');
          this.healAcc = 0;
        }
      }
      const camp = g.world.camp();
      const st = g.st;
      if (!g.over && st.campHp > 0 && st.campHp < g.campHpMax() && U.dist(this.x, this.y, camp.x, camp.y) < 190) {
        st.campHp = Math.min(g.campHpMax(), st.campHp + 2 * m);
        if (Math.floor(this.t) % 3 === 0) g.fx.text(camp.x + U.rand(-30, 30), camp.y - 170, '+' + 2 * m, '#9be38a');
      }
    }
    draw(ctx) {
      const g = this.g;
      if (this.kind === 'gull') {
        if (this.state === 'gone') return;
        E.shadow(ctx, this.x, this.y, 16, 5, 0.18);
        E.drawSprite(ctx, S.gull(Math.floor(this.t * (this.state === 'perch' ? 4 : 7)) % 2), this.x, this.y - this.h, { flip: this.face < 0, scale: 1.05 });
        this.badge(ctx, this.y - this.h - 36);
        return;
      }
      if (this.kind === 'turtle') {
        E.shadow(ctx, this.x, this.y, 30, 8);
        E.drawSprite(ctx, turtleImg(this.moving ? Math.floor(this.t * 5) % 2 : 0), this.x, this.y + 4, { flip: this.face < 0 });
        this.badge(ctx, this.y - 54);
        return;
      }
      // 螃蟹
      E.shadow(ctx, this.x, this.y, 24, 7);
      if (this.down) {
        const img = crabImg(0);
        ctx.save();
        ctx.translate(this.x, this.y - 18);
        ctx.scale(1, -1);
        ctx.globalAlpha = 0.85;
        ctx.drawImage(img, (-img.width * D.PX) / 2, (-img.height * D.PX) / 2, img.width * D.PX, img.height * D.PX);
        ctx.restore();
        const z = E.textImg('Zz', '#bfe9ff', 22);
        const bob = Math.sin(this.t * 2) * 5;
        ctx.drawImage(z, this.x + 10 - z.lw / 2, this.y - 72 + bob, z.lw, z.lh);
        return;
      }
      const f = this.snapT > 0 ? 1 : this.moving ? Math.floor(this.t * 8) % 2 : 0;
      E.drawSprite(ctx, crabImg(f), this.x, this.y + 4, { flip: this.face < 0, flash: this.flash > 0 ? this.flash : 0, scale: 1.15 });
      if (this.hp < this.hpMax) E.hpBar(ctx, this.x, this.y - 62, 40, this.hp / this.hpMax, '#5bd16a');
      else this.badge(ctx, this.y - 58);
    }
    badge(ctx, y) {
      if (this.d.lv <= 1) return;
      // 双人时用主人的颜色（1P 黄 / 2P 蓝）
      const img = E.textImg('Lv' + this.d.lv, this.g.twoP && this.d.owner ? '#6fd3ff' : '#ffe36b', 20);
      ctx.drawImage(img, this.x - img.lw / 2, y - img.lh / 2, img.lw, img.lh);
    }
  }

  /* ---------------- 管理 ---------------- */
  function sync(g, spawnAt) {
    const s = g.sys.pets;
    const keep = [];
    for (const d of s.owned) {
      if (d.owner < 0 || d.owner >= g.players.length) continue;
      let e = s.ents.find((x) => x.d === d);
      if (!e) e = new Pet(g, d, spawnAt && spawnAt.uid === d.uid ? spawnAt : null);
      keep.push(e);
    }
    for (const e of s.ents) if (keep.indexOf(e) < 0 && e.kind === 'crab') e.d.hp = e.hp;
    s.ents = keep;
    g.allies = g.allies.filter((a) => !(a && a.isPet));
    for (const e of keep) if (e.kind === 'crab') g.allies.push(e);
  }
  function canAdopt(g, kind) {
    const s = g.sys.pets;
    return !!s && !!KIND[kind] && !s.owned.some((o) => o.kind === kind);
  }
  function adopt(g, kind, pi, at) {
    const s = g.sys.pets;
    if (!canAdopt(g, kind)) return false;
    pi = Math.min(pi || 0, g.players.length - 1);
    const d = { uid: s.uid++, kind, lv: 1, xp: 0, owner: -1, hp: 0 };
    s.owned.push(d);
    if (!s.owned.some((o) => o !== d && o.owner === pi)) d.owner = pi;
    sync(g, at ? Object.assign({ uid: d.uid }, at) : null);
    const who = d.owner >= 0 ? '' : '（在集市“宠物”里可以换着带）';
    const msg = { crab: '螃蟹成为了你的伙伴！它会帮你打敌人', gull: '海鸥成为了你的伙伴！它会帮你叼回资源', turtle: '小乌龟成为了你的伙伴！它会帮你回血' }[kind];
    g.toast(msg + who);
    A.play('success');
    g.fire('stat', 'pet', 1);
    g.save();
    return true;
  }
  function equip(g, uid, pi) {
    const s = g.sys.pets;
    const d = s.owned.find((o) => o.uid === uid);
    if (!d) return;
    for (const o of s.owned) if (o !== d && o.owner === pi) o.owner = -1;
    d.owner = pi;
    sync(g);
    A.play('pop');
  }
  function rest(g, uid) {
    const s = g.sys.pets;
    const d = s.owned.find((o) => o.uid === uid);
    if (!d) return;
    d.owner = -1;
    sync(g);
  }
  function feed(g, uid) {
    const s = g.sys.pets;
    const d = s.owned.find((o) => o.uid === uid);
    if (!d || d.lv >= MAX_LV) return;
    if (!takeFish(g, 1)) {
      g.toast('没有鱼了，去岸边钓几条吧');
      A.play('wrong');
      return;
    }
    d.xp++;
    const name = KIND[d.kind].name;
    if (d.xp >= NEED[d.lv]) {
      d.lv++;
      d.xp = 0;
      const e = s.ents.find((x) => x.d === d);
      if (e && e.kind === 'crab' && !e.down) e.hp = e.hpMax;
      g.toast(name + '升到了 Lv' + d.lv + '！能力 +50%');
      A.play('success');
    } else A.play('pop');
    g.save();
  }

  PF.Sys.register({
    id: 'pets',
    order: 46,
    init(g, saved) {
      const s = { owned: [], uid: 1, ents: [], tipCrab: false, tipT: 1 };
      if (saved && Array.isArray(saved.owned)) {
        const seen = new Set();
        for (const o of saved.owned) {
          if (!o || !KIND[o.kind] || seen.has(o.kind)) continue;
          seen.add(o.kind);
          const owner = o.owner >= 0 && o.owner < g.players.length ? o.owner | 0 : -1;
          s.owned.push({ uid: o.uid | 0 || s.uid, kind: o.kind, lv: U.clamp(o.lv | 0 || 1, 1, MAX_LV), xp: Math.max(0, o.xp | 0), owner, hp: +o.hp || 0 });
          s.uid = Math.max(s.uid, (o.uid | 0) + 1);
        }
        // 两只宠物不能同时跟着同一个人
        for (let pi = 0; pi < 2; pi++) {
          const mine = s.owned.filter((o) => o.owner === pi);
          for (let k = 1; k < mine.length; k++) mine[k].owner = -1;
        }
        s.tipCrab = !!saved.tipCrab;
      }
      g.sys.pets = s;
      sync(g);
    },
    serialize(g) {
      const s = g.sys.pets;
      if (!s) return null;
      for (const e of s.ents) if (e.kind === 'crab') e.d.hp = e.down ? e.hpMax : Math.round(e.hp);
      return { owned: s.owned.map((d) => ({ uid: d.uid, kind: d.kind, lv: d.lv, xp: d.xp, owner: d.owner, hp: d.hp })), tipCrab: s.tipCrab };
    },
    destroy(g) {
      const s = g.sys.pets;
      if (s) s.ents = [];
      if (g.allies) g.allies = g.allies.filter((a) => !(a && a.isPet));
    },
    update(g, dt) {
      const s = g.sys.pets;
      if (!s) return;
      for (const e of s.ents) e.update(dt);
      // 第一次有鱼的时候提示可以驯服螃蟹
      s.tipT -= dt;
      if (s.tipT <= 0) {
        s.tipT = 1;
        if (!s.tipCrab && fishTotal(g) > 0 && canAdopt(g, 'crab') && g.crabs && g.crabs.length) {
          s.tipCrab = true;
          g.later(() => g.toast('提示：带着鱼走近海滩上的螃蟹，可以驯服它当宠物'), 2500);
        }
      }
    },
    prompt(g, p) {
      const s = g.sys.pets;
      if (!s || !g.crabs || !g.crabs.length || !canAdopt(g, 'crab') || fishTotal(g) <= 0) return null;
      // 野生螃蟹见人就跑（140 以内），所以气泡范围放宽一些，站着别动就能喂
      let best = null,
        bd = 210;
      for (const c of g.crabs) {
        if (!g.world.tiles[c.tile] || !g.world.tiles[c.tile].unlocked) continue;
        const d = U.dist(p.x, p.y, c.x, c.y);
        if (d < bd) {
          bd = d;
          best = c;
        }
      }
      if (!best) return null;
      return { label: '喂螃蟹（1 条鱼）', btn: '喂鱼', note: '驯服它当宠物', what: 'tame', crab: best };
    },
    act(g, pi, pr) {
      if (pr.what !== 'tame') return;
      const c = pr.crab;
      const i = g.crabs ? g.crabs.indexOf(c) : -1;
      if (i < 0 || !canAdopt(g, 'crab')) return;
      if (!takeFish(g, 1)) {
        g.toast('得先钓到鱼才能喂螃蟹');
        return;
      }
      g.crabs.splice(i, 1);
      g.fx.sparkle(c.x, c.y - 20, '#ffb0a8');
      adopt(g, 'crab', pi, { x: c.x, y: c.y });
    },
    drawables(g, add, cam) {
      const s = g.sys.pets;
      if (!s || !CTX_REF.ctx) return;
      for (const e of s.ents) {
        if (!cam.visible(e.x, e.y, e.kind === 'gull' ? 300 : 80)) continue;
        add(e.y + (e.kind === 'gull' ? 2 : 0), () => e.draw(CTX_REF.ctx));
      }
    },
    drawGround(g, ctx) {
      CTX_REF.ctx = ctx;
    },
    shopTabs(g, pi) {
      return {
        id: 'pets',
        title: '宠物',
        render: (g2, ui) => {
          const s = g.sys.pets;
          const fishN = fishTotal(g);
          let body = `<div class="info">宠物会跟着你一起行动，每人带一只。喂鱼可以升级（最高 Lv${MAX_LV}，每级能力 +50%）。<br>现有鱼 <b>${fishN}</b> 条</div>`;
          for (const kind of ['crab', 'gull', 'turtle']) {
            const K = KIND[kind];
            const d = s.owned.find((o) => o.kind === kind);
            const icon = ui.spriteIcon(K.icon());
            let title, desc, cs = '', btns;
            if (d) {
              const mine = d.owner === pi;
              const who = d.owner >= 0 ? (g.twoP ? (d.owner ? '2P' : '1P') + ' 带着' : '正跟着你') : '在营地休息';
              title = `${K.name} Lv${d.lv}`;
              desc = K.desc(d.lv) + '<br>' + (d.lv < MAX_LV ? `再喂 ${NEED[d.lv] - d.xp} 条鱼升到 Lv${d.lv + 1}` : '已满级') + ' · ' + who;
              btns = `<button class="btn sm ${mine ? 'gray2' : 'green'}" data-act="${mine ? 'rest' : 'take'}_${d.uid}">${mine ? '休息' : '带上'}</button>`;
              if (d.lv < MAX_LV) btns += `<button class="btn sm ${fishN ? 'yellow' : 'gray'}" data-act="feed_${d.uid}">喂鱼</button>`;
            } else if (kind === 'crab') {
              title = K.name;
              desc = '海滩上有野生螃蟹：带着鱼走近它，喂 1 条鱼就能驯服。<br>' + K.desc(1);
              btns = '<span class="maxed">去海滩</span>';
            } else {
              const ok = g.canAfford(K.cost) && fishN >= K.fish;
              title = K.name;
              desc = K.desc(1);
              cs = ui.costHTML(K.cost, g) + (K.fish ? `<span class="cost fishc${fishN < K.fish ? ' lack' : ''}"><img src="${S.spriteURL(fishIcon(), 2)}" alt="">×${K.fish}</span>` : '');
              btns = `<button class="btn sm ${ok ? 'green' : 'gray'}" data-act="adopt_${kind}">${ok ? '领养' : '不足'}</button>`;
            }
            body += `<div class="row pet"><div class="ic">${icon}</div><div class="mid"><div class="t">${title}</div><div class="d">${desc}</div>${cs ? '<div class="cs">' + cs + '</div>' : ''}</div><div class="pbtns">${btns}</div></div>`;
          }
          return body;
        },
        act: (g2, act) => {
          const m = /^(take|rest|feed|adopt)_(\w+)$/.exec(act);
          if (!m) return;
          if (m[1] === 'adopt') {
            const K = KIND[m[2]];
            if (!K || !K.cost || !canAdopt(g, m[2])) return;
            if (!g.canAfford(K.cost) || fishTotal(g) < K.fish) {
              g.toast(fishTotal(g) < K.fish ? '鱼不够：要 ' + K.fish + ' 条鱼' : '资源不足');
              A.play('wrong');
              return;
            }
            g.pay(K.cost);
            takeFish(g, K.fish);
            adopt(g, m[2], pi);
            return;
          }
          const uid = +m[2];
          if (m[1] === 'take') equip(g, uid, pi);
          else if (m[1] === 'rest') rest(g, uid);
          else feed(g, uid);
        },
      };
    },
    help() {
      return '<p><b>宠物：</b>带着鱼走近海滩上的螃蟹，喂它 1 条鱼就能驯服，它会帮你打敌人；海鸥、小乌龟可以在集市“宠物”里领养——海鸥会飞出去叼回资源，小乌龟会给你回血、帮忙修营地。每人带一只，喂鱼能升级。</p>';
    },
    /* 给其他系统用（商船卖海鸥等） */
    canAdopt,
    adopt,
  });

  const CTX_REF = { ctx: null };
  function fishIcon() {
    const f = PF.Sys.get('fishing');
    return f && f.fishImg ? f.fishImg('fish_s') : S.icon(1);
  }
})();
