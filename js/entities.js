/* 实体：玩家、小精灵、海盗、海盗船、特效、海鸥/鲨鱼鳍/螃蟹 */
(function () {
  'use strict';
  const PF = (window.PF = window.PF || {});
  const U = PF.U,
    D = PF.Data,
    S = PF.Spr,
    A = PF.Audio;
  const PX = D.PX;
  const RES_NAME = ['木材', '水稻', '紫水晶', '金币'];
  const TOOL_BY_TYPE = ['axe', 'sickle', 'pick'];
  const SFX_BY_TYPE = ['chop', 'reap', 'mine'];

  /* ---------- 通用绘制 ---------- */
  function shadow(ctx, x, y, w, h, a) {
    ctx.fillStyle = 'rgba(20,10,30,' + (a || 0.25) + ')';
    ctx.beginPath();
    ctx.ellipse(x, y, w, h, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  function drawSprite(ctx, img, x, y, opts) {
    const sc = (opts && opts.scale) || 1;
    const w = img.width * PX * sc,
      h = img.height * PX * sc;
    const flip = opts && opts.flip;
    if (flip) {
      ctx.save();
      ctx.translate(x, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(img, -w / 2, y - h, w, h);
      if (opts.flash) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = opts.flash;
        ctx.drawImage(img, -w / 2, y - h, w, h);
      }
      ctx.restore();
    } else {
      ctx.drawImage(img, x - w / 2, y - h, w, h);
      if (opts && opts.flash) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = opts.flash;
        ctx.drawImage(img, x - w / 2, y - h, w, h);
        ctx.restore();
      }
    }
  }
  function hpBar(ctx, x, y, w, frac, col, bg) {
    ctx.fillStyle = bg || 'rgba(20,10,30,0.75)';
    ctx.fillRect(x - w / 2 - 3, y - 3, w + 6, 12);
    ctx.fillStyle = '#3a2a3a';
    ctx.fillRect(x - w / 2, y, w, 6);
    ctx.fillStyle = col;
    ctx.fillRect(x - w / 2, y, w * U.clamp(frac, 0, 1), 6);
  }
  function bubble(ctx, x, y, text, z) {
    const fs = Math.round(20 / Math.max(0.6, z * 1.1)) + 6;
    ctx.font = 'bold ' + fs + 'px "PingFang SC","Microsoft YaHei",sans-serif';
    const w = ctx.measureText(text).width + 20;
    const h = fs + 14;
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.strokeStyle = '#1c1424';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.rect(x - w / 2, y - h, w, h);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x - 8, y);
    ctx.lineTo(x, y + 10);
    ctx.lineTo(x + 8, y);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#1c1424';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x, y - h / 2 + 1);
  }
  function walkFrame(t, moving) {
    if (!moving) return Math.floor(t * 2) % 2 ? 'idle1' : 'idle0';
    return 'walk' + (Math.floor(t * 9) % 4);
  }
  /* 移动并处理碰撞与水域 */
  function moveEnt(g, e, dx, dy, r) {
    const w = g.world;
    const nx = e.x + dx,
      ny = e.y + dy;
    if (w.walkable(nx, e.y, r)) e.x = nx;
    if (w.walkable(e.x, ny, r)) e.y = ny;
    const ox = e.x,
      oy = e.y;
    w.resolve(e, r);
    if (!w.walkable(e.x, e.y, r)) {
      e.x = ox;
      e.y = oy;
    }
  }

  /* =================== 玩家 =================== */
  class Player {
    constructor(g, idx, skin) {
      this.g = g;
      this.idx = idx;
      this.skin = skin;
      this.role = D.ROLES[skin];
      this.x = 0;
      this.y = 0;
      this.face = 1;
      this.t = Math.random();
      this.moving = false;
      this.hpMax = this.role.hp;
      this.hp = this.hpMax;
      this.hurtCD = 0;
      this.flash = 0;
      this.down = false;
      this.reviveP = 0;
      this.actT = 0;
      this.actKind = null; // 'atk'|'gather'|'repair'
      this.actTarget = null;
      this.impactDone = false;
      this.r = 14;
      this.invuln = 0;
      this.regenAcc = 0;
      this.lockMove = 0;
      this.carry = 0; // 小游戏用：手里的水果
    }
    get speed() {
      const camp = this.g.world.camp();
      let s = D.CAMP.pspeed.vals[camp.lv[2]];
      if (this.role.perk === 'fast') s += 50;
      if (this.role.perk === 'mech') s *= 1.2;
      return s;
    }
    get atk() {
      let a = this.role.atk + 2 * this.g.st.atkLv;
      if (this.g.st.holySword) a *= 2;
      return a;
    }
    hitPer(type) {
      const key = ['wood', 'rice', 'crystal'][type];
      const b = this.g.world.building(key);
      return D.INDUSTRY[key].hit.vals[b.lv[3]];
    }
    hurt(dmg) {
      if (this.down || this.invuln > 0) return;
      this.hp -= dmg;
      this.hurtCD = 5;
      this.flash = 0.6;
      A.play('hurt');
      this.g.fx.text(this.x, this.y - 120, '-' + dmg, '#ff5a4f');
      if (this.hp <= 0) {
        this.hp = 0;
        this.down = true;
        this.reviveP = 0;
        this.actKind = null;
        A.play('die');
        this.g.onPlayerDown(this);
      }
    }
    revive(frac) {
      this.down = false;
      this.hp = Math.max(1, Math.round(this.hpMax * (frac || 1)));
      this.invuln = 3;
      this.reviveP = 0;
    }
    update(dt, mv) {
      const g = this.g;
      this.t += dt;
      if (this.flash > 0) this.flash -= dt * 3;
      if (this.invuln > 0) this.invuln -= dt;
      if (this.down) {
        this.moving = false;
        // 双人：队友靠近即可扶起
        const o = g.players[1 - this.idx];
        if (o && !o.down && U.dist(o.x, o.y, this.x, this.y) < 110) {
          this.reviveP += dt / 6;
          if (this.reviveP >= 1) {
            this.revive(0.5);
            g.fx.text(this.x, this.y - 130, '多谢帮助！', '#9be38a');
            A.play('heal');
          }
        } else this.reviveP = Math.max(0, this.reviveP - dt / 12);
        return;
      }
      // 回血
      if (this.hurtCD > 0) this.hurtCD -= dt;
      else if (this.hp < this.hpMax) {
        this.regenAcc += dt;
        if (this.regenAcc >= 1) {
          this.regenAcc -= 1;
          this.hp = Math.min(this.hpMax, this.hp + this.role.regen);
        }
      }
      const mag = Math.hypot(mv.x, mv.y);
      this.moving = mag > 0.15 && this.lockMove <= 0;
      if (this.lockMove > 0) this.lockMove -= dt;
      if (this.moving) {
        const sp = this.speed * dt * Math.min(1, mag * 1.15);
        let dx = mv.x * sp,
          dy = mv.y * sp;
        // 双人：不要离队友太远
        const o = g.players[1 - this.idx];
        if (o && g.twoP) {
          const lim = g.cam.maxPairDist();
          const nd = U.dist(this.x + dx, this.y + dy, o.x, o.y);
          if (nd > lim && nd > U.dist(this.x, this.y, o.x, o.y)) {
            dx = 0;
            dy = 0;
          }
        }
        if (Math.abs(mv.x) > 0.1) this.face = mv.x > 0 ? 1 : -1;
        moveEnt(g, this, dx, dy, this.r);
        this.actKind = null;
        this.actT = 0;
        if (Math.floor(this.t * 4) !== Math.floor((this.t - dt) * 4)) A.play('step');
      } else {
        this.autoAct(dt);
      }
    }
    /* 原地不动时自动：打海盗 > 修营地 > 采集 */
    autoAct(dt) {
      const g = this.g;
      if (this.actKind) {
        this.actT += dt;
        const period = this.actPeriod;
        if (!this.impactDone && this.actT >= period * 0.45) {
          this.impactDone = true;
          this.impact();
        }
        if (this.actT >= period) {
          this.actKind = null;
          this.actT = 0;
        }
        return;
      }
      // 选目标
      let best = null,
        bd = 1e9;
      for (const p of g.pirates) {
        if (p.dead || p.state === 'sail') continue;
        const d = U.dist(p.x, p.y, this.x, this.y);
        if (d < 105 && d < bd) {
          bd = d;
          best = p;
        }
      }
      if (best) return this.startAct('atk', best, 0.55);
      const camp = g.world.camp();
      if (g.st.campHp < g.campHpMax() && g.st.campHp > 0 && this.nearBox(g.world.footprint(camp), 70)) return this.startAct('repair', camp, 0.6);
      let node = null;
      bd = 1e9;
      for (const n of g.world.nodesNear(this.x, this.y)) {
        if (n.hp <= 0) continue;
        const reach = (n.type === 1 ? 34 : g.world.nodeSolidR(n)) + 46;
        const d = U.dist(n.x, n.y - 6, this.x, this.y);
        if (d < reach && d < bd) {
          bd = d;
          node = n;
        }
      }
      if (node) {
        const perk = this.role.perk;
        const fast = (perk === 'wood' && node.type === 0) || (perk === 'rice' && node.type === 1) || (perk === 'crystal' && node.type === 2);
        return this.startAct('gather', node, fast ? 0.5 / 1.5 : 0.5);
      }
    }
    nearBox(b, m) {
      const cx = U.clamp(this.x, b.x0, b.x1),
        cy = U.clamp(this.y, b.y0, b.y1);
      return U.dist(cx, cy, this.x, this.y) < m;
    }
    startAct(kind, target, period) {
      this.actKind = kind;
      this.actTarget = target;
      this.actT = 0;
      this.actPeriod = period;
      this.impactDone = false;
      const tx = target.x;
      if (Math.abs(tx - this.x) > 4) this.face = tx > this.x ? 1 : -1;
    }
    impact() {
      const g = this.g;
      const t = this.actTarget;
      if (this.actKind === 'atk') {
        if (t.dead) return;
        t.hurt(this.atk, this);
        A.play('hit');
        g.fx.burst(t.x, t.y - 50, '#ffffff', 5);
      } else if (this.actKind === 'repair') {
        if (g.st.campHp > 0) {
          g.st.campHp = Math.min(g.campHpMax(), g.st.campHp + 5);
          g.fx.text(t.x, t.y - 170, '+5', '#9be38a');
          A.play('chop');
        }
      } else if (this.actKind === 'gather') {
        if (t.hp <= 0) return;
        const amt = Math.min(this.hitPer(t.type), t.hp);
        g.harvest(t, amt, this);
        A.play(SFX_BY_TYPE[t.type]);
        if (this.role.perk === 'mech' && Math.random() < 0.06) {
          g.addRes(3, 1, this.x, this.y - 150);
          A.play('coin');
        }
        g.fx.burst(t.x, t.y - 40, ['#c98a4b', '#e8c55a', '#c79bff'][t.type], 4);
      }
    }
    draw(ctx) {
      const g = this.g;
      shadow(ctx, this.x, this.y, 30, 10);
      if (this.down) {
        const img = S.human(this.skin, 'idle0');
        ctx.save();
        ctx.translate(this.x, this.y - 20);
        ctx.rotate(-Math.PI / 2 * this.face);
        ctx.globalAlpha = 0.85;
        ctx.drawImage(img, (-img.width * PX) / 2, (-img.height * PX) / 2, img.width * PX, img.height * PX);
        ctx.restore();
        // 求助
        if (g.twoP) {
          const p = this.reviveP;
          ctx.strokeStyle = 'rgba(20,10,30,0.6)';
          ctx.lineWidth = 10;
          ctx.beginPath();
          ctx.arc(this.x, this.y - 120, 26, 0, Math.PI * 2);
          ctx.stroke();
          ctx.strokeStyle = '#9be38a';
          ctx.beginPath();
          ctx.arc(this.x, this.y - 120, 26, -Math.PI / 2, -Math.PI / 2 + p * Math.PI * 2);
          ctx.stroke();
          bubble(ctx, this.x, this.y - 160, '救救我！', g.cam.z);
        }
        return;
      }
      let frame = walkFrame(this.t, this.moving);
      const blink = this.invuln > 0 && Math.floor(this.invuln * 10) % 2 === 0;
      if (blink) ctx.globalAlpha = 0.5;
      const img = S.human(this.skin, frame);
      drawSprite(ctx, img, this.x, this.y + 4, { flip: this.face < 0, flash: this.flash > 0 ? this.flash : 0 });
      // 工具
      if (this.actKind) {
        const tool = this.actKind === 'atk' ? (g.st.holySword ? 'holy' : 'sword') : this.actKind === 'repair' ? 'hammer' : TOOL_BY_TYPE[this.actTarget.type];
        const p = this.actT / this.actPeriod;
        const ang = p < 0.45 ? U.lerp(-2.0, 0.7, U.easeIn(p / 0.45)) : U.lerp(0.7, -0.6, (p - 0.45) / 0.55);
        drawTool(ctx, tool, this.x + 22 * this.face, this.y - 44, ang, this.face);
      }
      ctx.globalAlpha = 1;
      // 血条 / 编号
      const by = this.y - 128;
      if (this.hp < this.hpMax) hpBar(ctx, this.x, by, 64, this.hp / this.hpMax, '#5bd16a');
      if (g.twoP) {
        ctx.font = 'bold 22px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = this.idx === 0 ? '#ffd23f' : '#6fd3ff';
        ctx.strokeStyle = '#1c1424';
        ctx.lineWidth = 5;
        const lab = this.idx === 0 ? '1P' : '2P';
        ctx.strokeText(lab, this.x, by - 10);
        ctx.fillText(lab, this.x, by - 10);
      }
    }
  }
  function drawTool(ctx, name, hx, hy, ang, face) {
    const img = S.tool(name);
    ctx.save();
    ctx.translate(hx, hy);
    ctx.scale(face, 1);
    ctx.rotate(ang);
    const w = img.width * PX,
      h = img.height * PX;
    ctx.drawImage(img, -6, -h + 6, w, h);
    ctx.restore();
  }

  /* =================== 小精灵 =================== */
  class Worker {
    constructor(g, type) {
      this.g = g;
      this.type = type == null ? -1 : type; // -1 空闲
      const c = g.world.camp();
      this.x = c.x + U.rand(-60, 60);
      this.y = c.y + U.rand(20, 60);
      this.t = Math.random() * 3;
      this.state = 'idle';
      this.carry = 0;
      this.target = null;
      this.hpMax = 100;
      this.hp = 100;
      this.hurtCD = 0;
      this.flash = 0;
      this.face = 1;
      this.workT = 0;
      this.wander = null;
      this.fightT = 0;
      this.enemy = null;
      this.say = '';
      this.sayT = 0;
      this.r = 12;
      this.dead = false;
      this.regenAcc = 0;
      this.retargetT = 0;
    }
    get sup() {
      return this.g.st.superMan && this.g.workers[0] === this;
    }
    get speed() {
      let s = D.CAMP.wspeed.vals[this.g.world.camp().lv[1]];
      const base = D.CAMP.wspeed.vals[0];
      let k = 0;
      if (this.g.st.speedUpT > 0) k += 0.5;
      if (this.sup) k += 0.5;
      return s + base * k;
    }
    key() {
      return ['wood', 'rice', 'crystal'][this.type];
    }
    setType(t) {
      if (this.target) this.target.reserved = null;
      this.type = t;
      this.target = null;
      this.state = t < 0 ? 'idle' : this.carry > 0 ? 'back' : 'go';
      if (this.carry > 0 && t < 0) this.state = 'back';
    }
    hurt(dmg) {
      if (this.dead) return;
      this.hp -= dmg;
      this.hurtCD = 5;
      this.flash = 0.6;
      this.g.fx.text(this.x, this.y - 80, '-' + dmg, '#ff5a4f');
      if (this.hp <= 0) {
        this.dead = true;
        if (this.target) this.target.reserved = null;
        A.play('die');
        this.g.onWorkerDie(this);
      }
    }
    sayIt(text) {
      if (this.say !== text) {
        this.say = text;
        this.sayT = 4;
      }
    }
    moveTo(tx, ty, dt, goalTile) {
      const w = this.g.world;
      const [wx, wy] = w.nextWaypoint(this.x, this.y, goalTile, tx, ty);
      const dx = wx - this.x,
        dy = wy - this.y;
      const d = Math.hypot(dx, dy);
      if (d < 4) return true;
      const sp = Math.min(d, this.speed * dt);
      if (Math.abs(dx) > 2) this.face = dx > 0 ? 1 : -1;
      moveEnt(this.g, this, (dx / d) * sp, (dy / d) * sp, this.r);
      this.moving = true;
      return false;
    }
    findTarget() {
      const g = this.g;
      const camp = g.world.camp();
      let best = null,
        bd = 1e12;
      for (const n of g.world.nodes) {
        if (n.type !== this.type || n.hp <= 0 || (n.reserved && n.reserved !== this)) continue;
        if (!g.world.tiles[n.tile].unlocked) continue;
        if (g.world.campDist[n.tile] < 0) continue;
        const d = U.dist2(n.x, n.y, camp.x, camp.y);
        if (d < bd) {
          bd = d;
          best = n;
        }
      }
      if (best) best.reserved = this;
      return best;
    }
    update(dt) {
      if (this.dead) return;
      const g = this.g;
      this.t += dt;
      this.moving = false;
      if (this.flash > 0) this.flash -= dt * 3;
      if (this.sayT > 0) this.sayT -= dt;
      if (this.hurtCD > 0) this.hurtCD -= dt;
      else if (this.hp < this.hpMax) {
        this.regenAcc += dt;
        if (this.regenAcc > 1) {
          this.regenAcc -= 1;
          this.hp = Math.min(this.hpMax, this.hp + 3);
        }
      }
      // 迎战附近海盗
      if (!this.enemy || this.enemy.dead || U.dist(this.enemy.x, this.enemy.y, this.x, this.y) > 260) {
        this.enemy = null;
        for (const p of g.pirates) {
          if (p.dead || p.state === 'sail') continue;
          if (U.dist(p.x, p.y, this.x, this.y) < 170) {
            this.enemy = p;
            break;
          }
        }
      }
      if (this.enemy) {
        const e = this.enemy;
        const d = U.dist(e.x, e.y, this.x, this.y);
        if (d > 55) {
          const sp = this.speed * dt;
          this.face = e.x > this.x ? 1 : -1;
          moveEnt(g, this, ((e.x - this.x) / d) * sp, ((e.y - this.y) / d) * sp, this.r);
          this.moving = true;
        } else {
          this.fightT += dt;
          this.face = e.x > this.x ? 1 : -1;
          if (this.fightT >= 1) {
            this.fightT = 0;
            e.hurt(5, this);
            A.play('hit');
          }
        }
        return;
      }
      const camp = g.world.camp();
      switch (this.state) {
        case 'idle': {
          if (this.type >= 0) {
            this.state = 'go';
            break;
          }
          this.sayIt('给我分配工作吧');
          if (!this.wander || this.t > this.wander.t) {
            this.wander = { x: camp.x + U.rand(-140, 140), y: camp.y + U.rand(20, 110), t: this.t + U.rand(2, 5) };
          }
          const dx = this.wander.x - this.x,
            dy = this.wander.y - this.y;
          const d = Math.hypot(dx, dy);
          if (d > 6) {
            this.face = dx > 0 ? 1 : -1;
            moveEnt(g, this, (dx / d) * 60 * dt, (dy / d) * 60 * dt, this.r);
            this.moving = true;
          }
          break;
        }
        case 'go': {
          if (!this.target || this.target.hp <= 0 || !g.world.tiles[this.target.tile].unlocked) {
            if (this.target) this.target.reserved = null;
            this.target = null;
            this.retargetT -= dt;
            if (this.retargetT <= 0) {
              this.target = this.findTarget();
              this.retargetT = 0.6;
            }
            if (!this.target) {
              this.sayIt(['没有木材可采了', '没有水稻可收了', '没有水晶可挖了'][this.type]);
              if (this.carry > 0) this.state = 'back';
              break;
            }
          }
          const n = this.target;
          const reach = (n.type === 1 ? 30 : g.world.nodeSolidR(n)) + 30;
          if (U.dist(n.x, n.y - 4, this.x, this.y) < reach) {
            this.state = 'work';
            this.workT = 0;
          } else if (this.moveTo(n.x, n.y + 20, dt, n.tile)) {
            this.state = 'work';
          }
          break;
        }
        case 'work': {
          const n = this.target;
          if (!n || n.hp <= 0) {
            this.state = this.carry > 0 ? 'back' : 'go';
            break;
          }
          this.face = n.x > this.x ? 1 : -1;
          this.workT += dt * (this.speed / D.CAMP.wspeed.vals[0]);
          if (this.workT >= 0.9) {
            this.workT = 0;
            const key = this.key();
            const b = g.world.building(key);
            const cap = D.INDUSTRY[key].carry.vals[b.lv[2]];
            const per = D.INDUSTRY[key].hit.vals[b.lv[3]];
            const amt = Math.min(per, n.hp, cap - this.carry);
            if (amt > 0) {
              g.harvest(n, amt, null);
              this.carry += amt;
              A.play(SFX_BY_TYPE[n.type]);
            }
            if (this.carry >= cap || n.hp <= 0) {
              n.reserved = null;
              if (n.hp > 0) this.target = n; // 回来继续
              else this.target = null;
              this.state = 'back';
            }
          }
          break;
        }
        case 'back': {
          if (this.moveTo(camp.x, camp.y + 30, dt, camp.tile) || U.dist(camp.x, camp.y + 10, this.x, this.y) < 95) {
            if (this.carry > 0) {
              g.addRes(this.type < 0 ? this.lastType : this.type, this.carry, this.x, this.y - 90);
              A.play('deposit');
              this.carry = 0;
            }
            this.state = this.type >= 0 ? 'go' : 'idle';
          }
          break;
        }
      }
      if (this.type >= 0) this.lastType = this.type;
    }
    draw(ctx) {
      if (this.dead) return;
      const g = this.g;
      shadow(ctx, this.x, this.y, 22, 8);
      const frame = walkFrame(this.t, this.moving);
      const img = S.worker(frame, this.sup);
      let yy = this.y + 4;
      if (this.state === 'work' && !this.moving) yy -= Math.abs(Math.sin(this.workT * Math.PI)) * 8;
      drawSprite(ctx, img, this.x, yy, { flip: this.face < 0, flash: this.flash > 0 ? this.flash : 0, scale: 0.9 });
      if (this.state === 'work' && this.type >= 0) {
        const p = this.workT / 0.9;
        drawTool(ctx, TOOL_BY_TYPE[this.type], this.x + 16 * this.face, this.y - 30, U.lerp(-1.6, 0.6, p), this.face);
      }
      if (this.enemy && !this.moving) drawTool(ctx, 'hammer', this.x + 16 * this.face, this.y - 30, Math.sin(this.fightT * 6) - 0.5, this.face);
      if (this.carry > 0 && this.type >= 0) {
        const ic = S.icon(this.type);
        ctx.drawImage(ic, this.x - 18, this.y - 108, 36, 36);
      }
      if (this.hp < this.hpMax) hpBar(ctx, this.x, this.y - 84, 44, this.hp / this.hpMax, '#5bd16a');
      if (this.sayT > 0 && this.say) bubble(ctx, this.x, this.y - 90, this.say, g.cam.z);
    }
  }

  /* =================== 海盗 =================== */
  class Pirate {
    constructor(g, kind, x, y, land) {
      this.g = g;
      this.kind = kind;
      const K = D.PIRATE_KIND[kind];
      this.K = K;
      this.hp = this.hpMax = K.hp;
      this.atk = K.atk;
      this.speed = K.speed;
      this.x = x;
      this.y = y;
      this.land = land; // {x,y}
      this.state = 'sail';
      this.t = Math.random() * 3;
      this.face = 1;
      this.atkT = 0;
      this.target = null;
      this.flash = 0;
      this.dead = false;
      this.deadT = 0;
      this.r = 14 * K.scale;
      this.moving = false;
    }
    hurt(dmg, src) {
      if (this.dead) return;
      this.hp -= dmg;
      this.flash = 0.7;
      this.g.fx.text(this.x, this.y - 130 * this.K.scale, '-' + dmg, '#ffe36b');
      if (src && src.x !== undefined && this.state !== 'sail') {
        // 被打会转头还手
        this.target = src;
      }
      if (this.hp <= 0) {
        this.dead = true;
        this.deadT = 1;
        this.g.onPirateDie(this, src);
      }
    }
    pickTarget() {
      const g = this.g;
      let best = null,
        bd = 120;
      for (const p of g.players) {
        if (p.down) continue;
        const d = U.dist(p.x, p.y, this.x, this.y);
        if (d < bd) {
          bd = d;
          best = p;
        }
      }
      for (const w of g.workers) {
        if (w.dead) continue;
        const d = U.dist(w.x, w.y, this.x, this.y);
        if (d < bd) {
          bd = d;
          best = w;
        }
      }
      return best;
    }
    update(dt) {
      const g = this.g;
      this.t += dt;
      this.moving = false;
      if (this.flash > 0) this.flash -= dt * 3;
      if (this.dead) {
        this.deadT -= dt;
        return;
      }
      if (this.state === 'sail') {
        const dx = this.land.x - this.x,
          dy = this.land.y - this.y;
        const d = Math.hypot(dx, dy);
        if (d < 6) {
          this.state = 'walk';
          A.play('splash');
          g.fx.splash(this.x, this.y);
        } else {
          const sp = Math.min(d, this.speed * dt);
          this.x += (dx / d) * sp;
          this.y += (dy / d) * sp;
          this.face = dx >= 0 ? 1 : -1;
          this.moving = true;
        }
        return;
      }
      // 目标失效
      if (this.target && (this.target.dead || this.target.down || U.dist(this.target.x, this.target.y, this.x, this.y) > 280)) this.target = null;
      if (!this.target) this.target = this.pickTarget();
      const camp = g.world.camp();
      const fp = g.world.footprint(camp);
      let attackCamp = false;
      if (!this.target) {
        const cx = U.clamp(this.x, fp.x0, fp.x1),
          cy = U.clamp(this.y, fp.y0, fp.y1);
        if (U.dist(cx, cy, this.x, this.y) < this.r + 26) attackCamp = true;
      }
      if (this.target || attackCamp) {
        const tx = this.target ? this.target.x : camp.x;
        const ty = this.target ? this.target.y : camp.y;
        const d = U.dist(tx, ty, this.x, this.y);
        if (this.target && d > 52) {
          const sp = this.speed * dt;
          this.face = tx > this.x ? 1 : -1;
          moveEnt(g, this, ((tx - this.x) / d) * sp, ((ty - this.y) / d) * sp, this.r);
          this.moving = true;
          this.atkT = Math.min(this.atkT, 0.4);
        } else {
          this.face = tx > this.x ? 1 : -1;
          this.atkT += dt;
          if (this.atkT >= this.K.atkCD) {
            this.atkT = 0;
            if (this.target) this.target.hurt(this.atk);
            else g.hurtCamp(this.atk);
          }
        }
        return;
      }
      // 朝营地走
      const [wx, wy] = g.world.nextWaypoint(this.x, this.y, camp.tile, camp.x, camp.y);
      const dx = wx - this.x,
        dy = wy - this.y;
      const d = Math.hypot(dx, dy);
      if (d > 2) {
        const sp = Math.min(d, this.speed * dt);
        this.face = dx > 0 ? 1 : -1;
        const ox = this.x,
          oy = this.y;
        moveEnt(g, this, (dx / d) * sp, (dy / d) * sp, this.r);
        // 被卡住时绕一下
        if (U.dist(ox, oy, this.x, this.y) < sp * 0.2) {
          const side = Math.sin(this.t * 1.3) > 0 ? 1 : -1;
          moveEnt(g, this, (-dy / d) * sp * side, (dx / d) * sp * side, this.r);
        }
        this.moving = true;
      }
    }
    draw(ctx) {
      const sc = this.K.scale;
      if (this.dead) {
        ctx.globalAlpha = Math.max(0, this.deadT);
        const img = S.pirate(this.kind, 'idle0');
        ctx.save();
        ctx.translate(this.x, this.y - 20);
        ctx.rotate((Math.PI / 2) * this.face);
        ctx.drawImage(img, (-img.width * PX * sc) / 2, (-img.height * PX * sc) / 2, img.width * PX * sc, img.height * PX * sc);
        ctx.restore();
        ctx.globalAlpha = 1;
        return;
      }
      if (this.state === 'sail') {
        // 涉水：只露出上半身
        ctx.save();
        ctx.beginPath();
        ctx.rect(this.x - 80, this.y - 200, 160, 170);
        ctx.clip();
        drawSprite(ctx, S.pirate(this.kind, walkFrame(this.t, true)), this.x, this.y + 4, { flip: this.face < 0, scale: sc });
        ctx.restore();
        ctx.fillStyle = 'rgba(255,255,255,0.7)';
        ctx.fillRect(this.x - 34, this.y - 32, 68, 5);
        return;
      }
      shadow(ctx, this.x, this.y, 30 * sc, 10 * sc);
      const img = S.pirate(this.kind, walkFrame(this.t, this.moving));
      drawSprite(ctx, img, this.x, this.y + 4, { flip: this.face < 0, flash: this.flash > 0 ? this.flash : 0, scale: sc });
      const tool = this.kind === 1 ? 'club' : 'sabre';
      const p = this.atkT / this.K.atkCD;
      const ang = this.moving ? -0.4 : p < 0.75 ? U.lerp(-0.4, -1.9, p / 0.75) : U.lerp(-1.9, 0.8, (p - 0.75) / 0.25);
      drawTool(ctx, tool, this.x + 22 * sc * this.face, this.y - 44 * sc, ang, this.face);
      if (this.hp < this.hpMax) hpBar(ctx, this.x, this.y - 128 * sc, 56, this.hp / this.hpMax, '#ff5a4f');
    }
  }

  /* =================== 海盗船 =================== */
  class Ship {
    constructor(g, dir, tile, queue) {
      this.g = g;
      this.dir = dir;
      const T = D.TILE;
      const t = g.world.tiles[tile];
      const cx = t.c * T + T / 2,
        cy = t.r * T + T / 2;
      const off = [
        [0, -T / 2 - 150],
        [0, T / 2 + 210],
        [-T / 2 - 170, 0],
        [T / 2 + 170, 0],
      ][dir];
      const landOff = [
        [0, -T / 2 + 50],
        [0, T / 2 - 40],
        [-T / 2 + 50, 0],
        [T / 2 - 50, 0],
      ][dir];
      this.dock = { x: cx + off[0], y: cy + off[1] };
      this.land = { x: cx + landOff[0], y: cy + landOff[1] };
      const [vx, vy] = PF.World.DIRV[dir];
      this.from = { x: this.dock.x + vx * 900, y: this.dock.y + vy * 900 };
      this.x = this.from.x;
      this.y = this.from.y;
      this.queue = queue.slice();
      this.state = 'arrive';
      this.t = 0;
      this.spawnT = 0;
      this.done = false;
    }
    update(dt) {
      const g = this.g;
      this.t += dt;
      if (this.state === 'arrive') {
        const p = Math.min(1, this.t / 3);
        const e = U.easeOut(p);
        this.x = U.lerp(this.from.x, this.dock.x, e);
        this.y = U.lerp(this.from.y, this.dock.y, e);
        if (p >= 1) {
          this.state = 'unload';
          this.t = 0;
        }
      } else if (this.state === 'unload') {
        this.spawnT -= dt;
        if (this.spawnT <= 0 && this.queue.length) {
          this.spawnT = 0.5;
          const k = this.queue.pop();
          const jitter = (this.dir < 2 ? 1 : 0) * U.rand(-70, 70);
          const jy = (this.dir >= 2 ? 1 : 0) * U.rand(-70, 70);
          g.pirates.push(new Pirate(g, k, this.dock.x + jitter * 0.5, this.dock.y + jy * 0.5, { x: this.land.x + jitter, y: this.land.y + jy }));
        }
        if (!this.queue.length && this.spawnT <= -2) {
          this.state = 'leave';
          this.t = 0;
        }
      } else if (this.state === 'leave') {
        const p = Math.min(1, this.t / 4);
        const e = U.easeIn(p);
        this.x = U.lerp(this.dock.x, this.from.x, e);
        this.y = U.lerp(this.dock.y, this.from.y, e);
        if (p >= 1) this.done = true;
      }
    }
    draw(ctx) {
      const img = S.ship();
      const bob = Math.sin(this.t * 2) * 4;
      const flip = this.dir === 2 ? false : this.dir === 3;
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.fillRect(this.x - 120, this.y - 6 + bob, 240, 8);
      drawSprite(ctx, img, this.x, this.y + 30 + bob, { flip });
    }
  }

  /* =================== 特效 =================== */
  class Fx {
    constructor() {
      this.texts = [];
      this.parts = [];
    }
    text(x, y, s, col, big) {
      this.texts.push({ x, y, s, col: col || '#fff', t: 0, life: 1.1, big: !!big });
    }
    icon(x, y, type, n) {
      this.texts.push({ x, y, s: '+' + n, col: ['#ffd9a8', '#fff2a8', '#e6d4ff', '#ffe36b'][type], t: 0, life: 1.2, icon: type });
    }
    burst(x, y, col, n) {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        const s = U.rand(80, 220);
        this.parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 120, col, t: 0, life: U.rand(0.35, 0.6), size: U.rand(6, 10), g: 600 });
      }
    }
    splash(x, y) {
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + U.rand(-1, 1);
        const s = U.rand(120, 260);
        this.parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, col: '#bfe9ff', t: 0, life: 0.5, size: 8, g: 900 });
      }
    }
    sparkle(x, y, col) {
      for (let i = 0; i < 14; i++) {
        const a = Math.random() * Math.PI * 2;
        const s = U.rand(60, 260);
        this.parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, col: col || '#ffe36b', t: 0, life: U.rand(0.5, 0.9), size: U.rand(6, 12), g: 0 });
      }
    }
    update(dt) {
      for (const t of this.texts) {
        t.t += dt;
        t.y -= dt * 70;
      }
      this.texts = this.texts.filter((t) => t.t < t.life);
      for (const p of this.parts) {
        p.t += dt;
        p.vy += p.g * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
      }
      this.parts = this.parts.filter((p) => p.t < p.life);
    }
    draw(ctx) {
      for (const p of this.parts) {
        ctx.globalAlpha = 1 - p.t / p.life;
        ctx.fillStyle = p.col;
        ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
      }
      ctx.globalAlpha = 1;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (const t of this.texts) {
        const a = 1 - Math.max(0, (t.t - t.life * 0.6) / (t.life * 0.4));
        ctx.globalAlpha = a;
        const fs = t.big ? 40 : 28;
        ctx.font = 'bold ' + fs + 'px "PingFang SC","Microsoft YaHei",sans-serif';
        let x = t.x;
        if (t.icon != null) {
          const ic = S.icon(t.icon);
          ctx.drawImage(ic, x - 44, t.y - 18, 36, 36);
          x += 16;
        }
        ctx.lineWidth = 6;
        ctx.strokeStyle = '#1c1424';
        ctx.strokeText(t.s, x, t.y);
        ctx.fillStyle = t.col;
        ctx.fillText(t.s, x, t.y);
      }
      ctx.globalAlpha = 1;
    }
  }

  /* =================== 环境动物 =================== */
  class Gull {
    constructor(g) {
      this.g = g;
      const w = g.world;
      const cam = g.cam;
      // 从新大陆方向飞来（暗示方向）
      const dir = w.mainDir;
      const [vx, vy] = PF.World.DIRV[dir];
      const v = cam.view;
      const span = 0.7;
      if (vx === 0) {
        this.x = U.rand(v.x0, v.x1);
        this.y = vy < 0 ? v.y0 - 200 : v.y1 + 200;
        this.vx = U.rand(-span, span) * 120;
        this.vy = -vy * 190;
      } else {
        this.y = U.rand(v.y0, v.y1);
        this.x = vx < 0 ? v.x0 - 200 : v.x1 + 200;
        this.vy = U.rand(-span, span) * 120;
        this.vx = -vx * 190;
      }
      this.t = Math.random();
      this.life = 30;
    }
    update(dt) {
      this.t += dt;
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      this.life -= dt;
    }
    drawShadow(ctx) {
      shadow(ctx, this.x + 30, this.y + 200, 22, 6, 0.15);
    }
    draw(ctx) {
      const img = S.gull(Math.floor(this.t * 5) % 2);
      drawSprite(ctx, img, this.x, this.y, { flip: this.vx < 0 });
    }
  }
  class Fin {
    constructor(g, cx, cy, rad) {
      this.g = g;
      this.cx = cx;
      this.cy = cy;
      this.rad = rad;
      this.a = Math.random() * Math.PI * 2;
      this.sp = U.rand(0.15, 0.3) * (Math.random() < 0.5 ? 1 : -1);
    }
    update(dt) {
      this.a += this.sp * dt;
      this.x = this.cx + Math.cos(this.a) * this.rad;
      this.y = this.cy + Math.sin(this.a) * this.rad * 0.7;
    }
    draw(ctx) {
      if (this.g.world.unlockedAt(this.x, this.y) || this.g.world.unlockedAt(this.x, this.y - 60)) return;
      const img = S.fin();
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.fillRect(this.x - 26, this.y - 2, 52, 4);
      drawSprite(ctx, img, this.x, this.y, { flip: this.sp < 0 });
    }
  }
  class Crab {
    constructor(g, tile) {
      this.g = g;
      const T = D.TILE;
      const t = g.world.tiles[tile];
      this.tile = tile;
      this.x = t.c * T + U.rand(40, T - 40);
      this.y = t.r * T + U.rand(60, T - 30);
      this.t = Math.random() * 5;
      this.vx = 0;
      this.next = 0;
      this.r = 10;
    }
    update(dt) {
      this.t += dt;
      const g = this.g;
      let flee = false;
      for (const p of g.players)
        if (U.dist(p.x, p.y, this.x, this.y) < 140) {
          this.vx = (this.x > p.x ? 1 : -1) * 220;
          flee = true;
        }
      if (!flee && this.t > this.next) {
        this.next = this.t + U.rand(1, 3);
        this.vx = Math.random() < 0.4 ? 0 : U.rand(-90, 90);
      }
      const nx = this.x + this.vx * dt;
      if (g.world.walkable(nx, this.y, 10)) this.x = nx;
      else this.vx = -this.vx;
    }
    draw(ctx) {
      if (!this.g.world.tiles[this.tile].unlocked) return;
      shadow(ctx, this.x, this.y, 22, 6);
      drawSprite(ctx, S.crab(this.vx ? Math.floor(this.t * 8) % 2 : 0), this.x, this.y + 4);
    }
  }

  PF.Ent = { Player, Worker, Pirate, Ship, Fx, Gull, Fin, Crab, drawSprite, shadow, hpBar, bubble, drawTool, walkFrame, moveEnt, RES_NAME };
})();
