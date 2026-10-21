/* 异世界小游戏：危险世界（躲避）/ 迷失世界（迷宫）/ 数字世界（答题砖）/ 颠倒世界（反向送货） */
(function () {
  'use strict';
  const PF = (window.PF = window.PF || {});
  const U = PF.U,
    D = PF.Data,
    S = PF.Spr;
  const PX = D.PX;
  const OUT = '#1c1424';
  const FONT = (n) => 'bold ' + n + 'px "PingFang SC","Microsoft YaHei",sans-serif';
  const play = (n) => PF.Audio && PF.Audio.play(n);

  /* ================= 通用小工具 ================= */
  const cache = {};
  function memo(k, fn) {
    if (!cache[k]) cache[k] = fn();
    return cache[k];
  }
  /* 用 ImageData 逐像素生成画布（大图更快）：fn(i,j) → [r,g,b] 或 null */
  function pixCanvas(w, h, fn) {
    const m = S.mk(w, h);
    const d = m.x.createImageData(w, h);
    const a = d.data;
    for (let j = 0; j < h; j++)
      for (let i = 0; i < w; i++) {
        const c = fn(i, j);
        if (!c) continue;
        const k = (j * w + i) * 4;
        a[k] = c[0];
        a[k + 1] = c[1];
        a[k + 2] = c[2];
        a[k + 3] = c[3] == null ? 255 : c[3];
      }
    m.x.putImageData(d, 0, 0);
    return m.c;
  }
  const H = (hex) => S.hex(hex);
  function text(ctx, s, x, y, size, col, align, lw) {
    ctx.font = FONT(size);
    ctx.textAlign = align || 'left';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.lineWidth = lw || Math.max(3, size / 5);
    ctx.strokeStyle = OUT;
    ctx.strokeText(s, x, y);
    ctx.fillStyle = col || '#fff';
    ctx.fillText(s, x, y);
  }
  /* 中文按字折行 */
  function wrapLines(ctx, s, maxW) {
    const lines = [];
    let cur = '';
    for (const ch of s) {
      if (ctx.measureText(cur + ch).width > maxW && cur) {
        lines.push(cur);
        cur = ch;
      } else cur += ch;
    }
    if (cur) lines.push(cur);
    return lines;
  }
  function fmt(sec) {
    sec = Math.max(0, Math.ceil(sec));
    return Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0');
  }
  function drawImg(ctx, img, x, y, sc) {
    const s = (sc || 1) * PX;
    ctx.drawImage(img, x - (img.width * s) / 2, y - (img.height * s) / 2, img.width * s, img.height * s);
  }

  /* 粒子 */
  class Parts {
    constructor() {
      this.list = [];
    }
    burst(x, y, cols, n, spd, grav) {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        const s = U.rand(spd * 0.3, spd);
        this.list.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, col: U.pick(cols), t: 0, life: U.rand(0.35, 0.8), size: U.rand(6, 14), g: grav || 0 });
      }
    }
    update(dt) {
      for (const p of this.list) {
        p.t += dt;
        p.vy += p.g * dt;
        p.vx *= 1 - dt * 2;
        p.vy *= 1 - dt * 2;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
      }
      this.list = this.list.filter((p) => p.t < p.life);
    }
    draw(ctx) {
      for (const p of this.list) {
        ctx.globalAlpha = 1 - p.t / p.life;
        ctx.fillStyle = p.col;
        const s = p.size * (1 - (p.t / p.life) * 0.5);
        ctx.fillRect(Math.round(p.x - s / 2), Math.round(p.y - s / 2), s, s);
      }
      ctx.globalAlpha = 1;
    }
  }

  /* ================= 小游戏里的角色 ================= */
  class Avatar {
    constructor(idx, skin) {
      this.idx = idx;
      this.skin = skin;
      this.x = 0;
      this.y = 0;
      this.face = 1;
      this.t = Math.random();
      this.moving = false;
      this.hearts = 3;
      this.maxHearts = 3;
      this.invuln = 0;
      this.out = false;
      this.speed = 330;
      this.r = 14;
      this.flash = 0;
      this.held = -1;
      this.fallT = 0;
      this.falling = false;
    }
    tick(dt) {
      this.t += dt;
      if (this.invuln > 0) this.invuln -= dt;
      if (this.flash > 0) this.flash -= dt * 3;
    }
    /* 受伤：返回是否真的掉血 */
    hit() {
      if (this.out || this.invuln > 0) return false;
      this.hearts--;
      this.invuln = 1.2;
      this.flash = 0.8;
      play('hurt');
      if (this.hearts <= 0) {
        this.hearts = 0;
        this.out = true;
        this.moving = false;
      }
      return true;
    }
    draw(ctx, twoP) {
      const E = PF.Ent;
      if (this.out && !this.falling) {
        const img = S.human(this.skin, 'idle0');
        E.shadow(ctx, this.x, this.y, 34, 10);
        ctx.save();
        ctx.globalAlpha = 0.55;
        ctx.translate(this.x, this.y - 18);
        ctx.rotate((-Math.PI / 2) * this.face);
        ctx.drawImage(img, (-img.width * PX) / 2, (-img.height * PX) / 2, img.width * PX, img.height * PX);
        ctx.restore();
      } else {
        E.shadow(ctx, this.x, this.y, 30, 10);
        const blink = this.invuln > 0 && Math.floor(this.invuln * 10) % 2 === 0;
        if (blink) ctx.globalAlpha = 0.45;
        E.drawSprite(ctx, S.human(this.skin, E.walkFrame(this.t, this.moving)), this.x, this.y + 4, { flip: this.face < 0, flash: this.flash > 0 ? Math.min(1, this.flash) : 0 });
        ctx.globalAlpha = 1;
      }
      if (twoP) {
        const lab = this.idx ? '2P' : '1P';
        ctx.font = FONT(22);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.lineWidth = 5;
        ctx.strokeStyle = OUT;
        ctx.strokeText(lab, this.x, this.y - 128);
        ctx.fillStyle = this.idx ? '#6fd3ff' : '#ffd23f';
        ctx.fillText(lab, this.x, this.y - 128);
      }
    }
  }

  /* ================= 基类：准备 → 游戏 → 结束 ================= */
  class MiniBase {
    constructor(g, portal, done, key) {
      this.g = g;
      this.portal = portal;
      this._doneFn = done;
      this.key = key;
      this.Wd = D.WORLDS[key];
      this.phase = 'ready';
      this.pt = 0;
      this.ok = null;
      this.endT = 0;
      this._done = false;
      this.time = 0;
      this.shake = 0;
      this.parts = new Parts();
      this.hudTop = 110;
      this.AW = 960;
      this.AH = 960;
      this.reversed = false;
      this.bg = '#0e0b14';
      this.subtitle = '';
      this.avs = [];
      const n = g.twoP ? 2 : 1;
      for (let i = 0; i < n; i++) this.avs.push(new Avatar(i, g.skins && g.skins[i] != null ? g.skins[i] : i));
    }
    get twoP() {
      return this.avs.length > 1;
    }
    update(dt) {
      if (this._done) return;
      dt = Math.min(dt, 0.1);
      this.time += dt;
      this.pt += dt;
      if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * 30);
      this.parts.update(dt);
      for (const a of this.avs) a.tick(dt);
      if (this.phase === 'ready') {
        for (const a of this.avs) a.moving = false;
        if (this.pt >= 2.2) {
          this.phase = 'play';
          this.pt = 0;
          if (this.onStart) this.onStart();
        }
      } else if (this.phase === 'play') {
        this.play(dt);
      } else if (this.phase === 'end') {
        this.endT += dt;
        for (const a of this.avs) a.moving = false;
        if (this.endUpdate) this.endUpdate(dt);
        if (this.endT >= 1.2) this.finish();
      }
    }
    win() {
      this.end(true);
    }
    lose() {
      this.end(false);
    }
    end(ok) {
      if (this.phase === 'end' || this._done) return;
      this.phase = 'end';
      this.ok = ok;
      this.endT = 0;
      play(ok ? 'success' : 'fail');
    }
    finish() {
      if (this._done) return;
      this._done = true;
      this._doneFn(!!this.ok);
    }
    abort() {
      if (this._done) return;
      this._done = true;
      this._doneFn(false);
    }
    _debugWin() {
      if (this.phase === 'ready') this.phase = 'play';
      this.end(true);
    }
    _debugLose() {
      if (this.phase === 'ready') this.phase = 'play';
      this.end(false);
    }
    inputFor(i) {
      const m = PF.Input.move(i);
      return this.reversed ? { x: -m.x, y: -m.y } : m;
    }
    /* 移动角色，collide(a, dx, dy) 负责实际位移与碰撞 */
    moveAvatar(a, dt, mv, collide) {
      const mag = Math.hypot(mv.x, mv.y);
      a.moving = mag > 0.15 && !a.out;
      if (!a.moving) return;
      const sp = a.speed * dt * Math.min(1, mag * 1.15);
      if (Math.abs(mv.x) > 0.1) a.face = mv.x > 0 ? 1 : -1;
      collide(a, mv.x * sp, mv.y * sp);
    }
    clampIn(x0, y0, x1, y1) {
      return (a, dx, dy) => {
        a.x = U.clamp(a.x + dx, x0 + a.r, x1 - a.r);
        a.y = U.clamp(a.y + dy, y0 + a.r, y1 - a.r * 0.4);
      };
    }
    alive() {
      return this.avs.filter((a) => !a.out);
    }
    /* 竞技场镜头：整块场地居中显示 */
    arenaZoom() {
      const W = this.g.cam.W,
        Hh = this.g.cam.H;
      return Math.min(W, Hh - this.hudTop) / 1000;
    }
    arenaXform(ctx, dpr) {
      const W = this.g.cam.W,
        Hh = this.g.cam.H;
      const z = this.arenaZoom();
      const cx = W / 2,
        cy = this.hudTop + (Hh - this.hudTop) / 2;
      const sx = this.shake > 0 ? U.rand(-1, 1) * this.shake : 0;
      const sy = this.shake > 0 ? U.rand(-1, 1) * this.shake : 0;
      ctx.setTransform(dpr * z, 0, 0, dpr * z, dpr * (cx - (this.AW / 2) * z + sx), dpr * (cy - (this.AH / 2) * z + sy));
      ctx.imageSmoothingEnabled = false;
      return z;
    }
    render(ctx, dpr) {
      const W = this.g.cam.W,
        Hh = this.g.cam.H;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.imageSmoothingEnabled = false;
      ctx.fillStyle = this.bg;
      ctx.fillRect(0, 0, W * dpr, Hh * dpr);
      this.drawWorld(ctx, dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.imageSmoothingEnabled = false;
      this.drawHUD(ctx, W, Hh);
      this.drawBanner(ctx, W, Hh);
    }
    drawTitle(ctx) {
      text(ctx, this.Wd.name, 14, 30, 22, this.Wd.color);
    }
    drawHearts(ctx, x, y) {
      const ic = S.icon(4);
      let cx = x;
      for (const a of this.avs) {
        if (this.twoP) {
          text(ctx, a.idx ? '2P' : '1P', cx, y, 16, a.idx ? '#6fd3ff' : '#ffd23f');
          cx += 28;
        }
        for (let k = 0; k < a.maxHearts; k++) {
          ctx.globalAlpha = k < a.hearts ? 1 : 0.22;
          ctx.drawImage(ic, cx, y - 13, 26, 26);
          cx += 26;
        }
        ctx.globalAlpha = 1;
        cx += 14;
      }
    }
    drawBanner(ctx, W, Hh) {
      let big = null,
        col = '#fff',
        sub = '';
      if (this.phase === 'ready') {
        big = this.pt < 1.3 ? '准备！' : '开始！';
        col = this.pt < 1.3 ? '#ffe36b' : '#9be38a';
        sub = this.subtitle;
      } else if (this.phase === 'end') {
        big = this.ok ? '挑战成功！' : '挑战失败';
        col = this.ok ? '#ffe36b' : '#ff7a6b';
      }
      if (!big) return;
      const cy = Hh * 0.45;
      const k = this.phase === 'ready' ? (this.pt % 1.3) / 0.25 : this.endT / 0.25;
      const sc = 1 + Math.max(0, 1 - Math.min(1, k)) * 0.5;
      ctx.fillStyle = 'rgba(14,10,22,0.55)';
      ctx.fillRect(0, cy - 52, W, sub ? 130 : 104);
      ctx.save();
      ctx.translate(W / 2, cy);
      ctx.scale(sc, sc);
      text(ctx, big, 0, 0, Math.min(64, W / 7), col, 'center', 8);
      ctx.restore();
      if (sub) {
        ctx.font = FONT(18);
        const lines = wrapLines(ctx, sub, W - 40);
        lines.slice(0, 2).forEach((l, i) => text(ctx, l, W / 2, cy + 50 + i * 24 - (lines.length > 1 ? 8 : 0), 18, '#fff', 'center'));
      }
    }
  }

  /* ======================================================
     1) 危险世界：躲避炸弹 / 激光 / 导弹，坚持 60 秒
     ====================================================== */
  function dangerFloor() {
    return memo('dangerFloor', () => {
      const W = 240;
      const rnd = U.rng(42);
      const cracks = new Uint8Array(W * W);
      for (let k = 0; k < 16; k++) {
        let x = rnd() * W,
          y = rnd() * W;
        let a = rnd() * Math.PI * 2;
        const len = 10 + rnd() * 26;
        for (let s = 0; s < len; s++) {
          a += (rnd() - 0.5) * 0.9;
          x += Math.cos(a);
          y += Math.sin(a);
          const i = Math.round(x),
            j = Math.round(y);
          if (i >= 0 && j >= 0 && i < W && j < W) cracks[j * W + i] = 1;
        }
      }
      const A1 = H('#3b3447'),
        A2 = H('#342e40'),
        EDGE = H('#28223a'),
        LIT = H('#4a4258'),
        SP = H('#2f2939'),
        CR = H('#ff6a2a'),
        CR2 = H('#ffb238'),
        GLOW = H('#5a2a2a');
      return pixCanvas(W, W, (i, j) => {
        if (cracks[j * W + i]) return U.hash(i, j, 3) < 0.3 ? CR2 : CR;
        const near = (cracks[j * W + i - 1] || cracks[j * W + i + 1] || cracks[(j - 1) * W + i] || cracks[(j + 1) * W + i]) && i > 0 && i < W - 1;
        if (near) return GLOW;
        const bi = i % 20,
          bj = j % 20;
        if (bi === 0 || bj === 0) return EDGE;
        if (bi === 1 || bj === 1) return LIT;
        const n = U.hash(i, j, 9);
        if (n < 0.06) return SP;
        return (Math.floor(i / 20) + Math.floor(j / 20)) % 2 ? A1 : A2;
      });
    });
  }
  function bombSprite() {
    return memo('bomb', () => {
      const p = new S.PC(16, 18);
      p.circ(8, 11, 6, '#22202a');
      p.circ(6.5, 9.5, 2, '#5a5866');
      p.r(7, 3, 3, 3, '#6b6f7a');
      p.line(9, 3, 12, 0, '#c9a26a');
      p.p(13, 0, '#ffe36b');
      p.p(12, 1, '#ff6a2a');
      p.outline(OUT);
      return p.c;
    });
  }
  function rocketSprite() {
    return memo('rocket', () => {
      const p = new S.PC(10, 22);
      p.r(3, 3, 4, 12, '#cfd8e2');
      p.r(3, 3, 1, 12, '#ffffff');
      p.r(4, 1, 2, 2, '#e8423f');
      p.r(3, 2, 4, 2, '#e8423f');
      p.r(1, 12, 2, 4, '#e8423f');
      p.r(7, 12, 2, 4, '#e8423f');
      p.r(4, 15, 2, 3, '#ffb238');
      p.r(4, 18, 2, 2, '#ffe36b');
      p.outline(OUT);
      return p.c;
    });
  }
  function emitterSprite() {
    return memo('emitter', () => {
      const p = new S.PC(12, 12);
      p.r(1, 1, 10, 10, '#4b4766');
      p.r(1, 1, 10, 2, '#6f6a8b');
      p.r(4, 4, 4, 4, '#ff5a4f');
      p.p(5, 5, '#ffd0c8');
      p.outline(OUT);
      return p.c;
    });
  }

  class Danger extends MiniBase {
    constructor(g, portal, done) {
      super(g, portal, done, 'danger');
      this.bg = '#1a0d10';
      this.dur = 60;
      this.left = 60;
      this.haz = [];
      this.spawnT = 0.9;
      this.subtitle = '躲开红色预警区域，坚持 60 秒！';
      this.avs.forEach((a, i) => {
        a.x = 480 + (this.twoP ? (i ? 70 : -70) : 0);
        a.y = 540;
      });
    }
    play(dt) {
      this.left -= dt;
      const col = this.clampIn(30, 30, 930, 930);
      for (const a of this.avs) if (!a.out) this.moveAvatar(a, dt, this.inputFor(a.idx), col);
      const prog = U.clamp((this.dur - this.left) / this.dur, 0, 1);
      this.spawnT -= dt;
      if (this.spawnT <= 0) {
        this.spawnT = U.lerp(1.1, 0.45, prog);
        this.spawn(prog);
        if (prog > 0.45 && Math.random() < prog * 0.55) this.spawn(prog);
      }
      this.updHaz(dt, true);
      if (this.avs.every((a) => a.out)) return this.lose();
      if (this.left <= 0) {
        this.left = 0;
        this.win();
      }
    }
    endUpdate(dt) {
      this.updHaz(dt, false);
    }
    randTarget(spread) {
      const al = this.alive();
      if (al.length && Math.random() < 0.45) {
        const a = U.pick(al);
        return [U.clamp(a.x + U.rand(-spread, spread), 60, 900), U.clamp(a.y - 20 + U.rand(-spread, spread), 60, 900)];
      }
      return [U.rand(60, 900), U.rand(60, 900)];
    }
    spawn(prog) {
      const r = Math.random();
      const rockets = this.haz.filter((h) => h.type === 'rocket').length;
      if (r < 0.5 || (r >= 0.75 && rockets >= 2)) {
        const [x, y] = this.randTarget(130);
        this.haz.push({ type: 'bomb', x, y, r: U.rand(80, 100 + prog * 20), st: 'warn', t: 0 });
      } else if (r < 0.75) {
        const hor = Math.random() < 0.5;
        const [x, y] = this.randTarget(60);
        this.haz.push({ type: 'laser', hor, pos: hor ? y : x, w: 70, st: 'warn', t: 0 });
      } else {
        const al = this.alive();
        if (!al.length) return;
        const a = U.pick(al);
        this.haz.push({ type: 'rocket', tgt: a, x: U.clamp(a.x + U.rand(-160, 160), 40, 920), y: U.clamp(a.y + U.rand(-160, 160), 40, 920), r: 75, st: 'track', t: 0 });
      }
    }
    updHaz(dt, dmg) {
      for (const h of this.haz) {
        h.t += dt;
        if (h.type === 'bomb') {
          if (h.st === 'warn' && h.t >= 1.1) this.explode(h, h.r);
          else if (h.st === 'active' && h.t >= 0.35) h.st = 'done';
        } else if (h.type === 'laser') {
          if (h.st === 'warn' && h.t >= 1.0) {
            h.st = 'active';
            h.t = 0;
            play('laser');
            this.shake = Math.max(this.shake, 4);
          } else if (h.st === 'active' && h.t >= 0.45) h.st = 'done';
        } else if (h.type === 'rocket') {
          if (h.st === 'track') {
            // 准星追踪目标，比人慢一点
            const tx = h.tgt.x,
              ty = h.tgt.y - 20;
            const d = Math.hypot(tx - h.x, ty - h.y);
            const sp = 250 * dt;
            if (d > 1) {
              h.x += ((tx - h.x) / d) * Math.min(sp, d);
              h.y += ((ty - h.y) / d) * Math.min(sp, d);
            }
            if (h.t >= 1.2) {
              h.st = 'lock';
              h.t = 0;
              play('warn');
            }
          } else if (h.st === 'lock' && h.t >= 0.4) this.explode(h, h.r, 0.25);
          else if (h.st === 'active' && h.t >= 0.25) h.st = 'done';
        }
        if (dmg && h.st === 'active') {
          for (const a of this.avs) {
            if (a.out || a.invuln > 0) continue;
            if (this.inZone(h, a) && a.hit()) {
              this.shake = Math.max(this.shake, 9);
              this.parts.burst(a.x, a.y - 50, ['#ffffff', '#ff5a4f'], 8, 260);
            }
          }
        }
      }
      this.haz = this.haz.filter((h) => h.st !== 'done');
    }
    explode(h, r, life) {
      h.st = 'active';
      h.t = 0;
      h.life = life || 0.35;
      play('boom');
      this.shake = Math.max(this.shake, 10);
      this.parts.burst(h.x, h.y, ['#ffe36b', '#ffb238', '#ff6a2a', '#ffffff', '#5a5866'], 22, r * 4, 0);
    }
    inZone(h, a) {
      const bx = a.x,
        by = a.y - 24;
      if (h.type === 'laser') return h.hor ? Math.abs(by - h.pos) < h.w / 2 + 8 : Math.abs(bx - h.pos) < h.w / 2 + 6;
      return U.dist(bx, by, h.x, h.y) < h.r + 6;
    }
    drawWorld(ctx, dpr) {
      this.arenaXform(ctx, dpr);
      // 场地外的岩浆
      const lv = 0.5 + Math.sin(this.time * 2) * 0.5;
      ctx.fillStyle = `rgb(${150 + lv * 50},${40 + lv * 30},20)`;
      ctx.fillRect(-60, -60, 1080, 1080);
      for (let k = 0; k < 40; k++) {
        const x = -60 + ((k * 137 + this.time * 30) % 1080);
        const y = -60 + ((k * 263) % 1080);
        if (x > 0 && x < 960 && y > 0 && y < 960) continue;
        ctx.fillStyle = k % 3 ? '#ffb238' : '#ffe36b';
        ctx.fillRect(Math.round(x / 4) * 4, Math.round(y / 4) * 4, 8, 8);
      }
      ctx.fillStyle = '#1c1424';
      ctx.fillRect(-12, -12, 984, 984);
      ctx.drawImage(dangerFloor(), 0, 0, 960, 960);
      // 预警（地面层）
      for (const h of this.haz) this.drawHazGround(ctx, h);
      // 角色 / 炸弹本体（y 排序）
      const list = this.avs.map((a) => ({ y: a.y, f: () => a.draw(ctx, this.twoP) }));
      for (const h of this.haz) if (h.type === 'bomb' && h.st === 'warn') list.push({ y: h.y, f: () => this.drawBombFall(ctx, h) });
      list.sort((a, b) => a.y - b.y).forEach((o) => o.f());
      // 空中层
      for (const h of this.haz) this.drawHazAir(ctx, h);
      this.parts.draw(ctx);
    }
    drawHazGround(ctx, h) {
      const blink = 0.5 + Math.sin(this.time * 18) * 0.5;
      if (h.type === 'bomb' && h.st === 'warn') {
        const p = h.t / 1.1;
        ctx.fillStyle = `rgba(255,60,60,${0.14 + blink * 0.1})`;
        ctx.beginPath();
        ctx.arc(h.x, h.y, h.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,60,60,0.32)';
        ctx.beginPath();
        ctx.arc(h.x, h.y, h.r * p, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = `rgba(255,110,100,${0.6 + blink * 0.4})`;
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.arc(h.x, h.y, h.r, 0, Math.PI * 2);
        ctx.stroke();
      } else if (h.type === 'laser' && h.st === 'warn') {
        ctx.fillStyle = `rgba(255,60,60,${0.1 + blink * 0.16})`;
        if (h.hor) ctx.fillRect(0, h.pos - h.w / 2, 960, h.w);
        else ctx.fillRect(h.pos - h.w / 2, 0, h.w, 960);
        ctx.fillStyle = 'rgba(255,90,80,0.9)';
        for (let s = 0; s < 960; s += 40) {
          if (h.hor) ctx.fillRect(s + ((this.time * 120) % 40), h.pos - 2, 20, 4);
          else ctx.fillRect(h.pos - 2, s + ((this.time * 120) % 40), 4, 20);
        }
      } else if (h.type === 'rocket' && (h.st === 'track' || h.st === 'lock')) {
        const lock = h.st === 'lock';
        const col = lock ? (blink > 0.5 ? '#ff2a2a' : '#ffffff') : '#ffb238';
        ctx.fillStyle = lock ? 'rgba(255,40,40,0.22)' : 'rgba(255,170,60,0.12)';
        ctx.beginPath();
        ctx.arc(h.x, h.y, h.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = col;
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.arc(h.x, h.y, h.r, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = col;
        ctx.fillRect(h.x - h.r - 16, h.y - 3, 32, 6);
        ctx.fillRect(h.x + h.r - 16, h.y - 3, 32, 6);
        ctx.fillRect(h.x - 3, h.y - h.r - 16, 6, 32);
        ctx.fillRect(h.x - 3, h.y + h.r - 16, 6, 32);
        ctx.fillRect(h.x - 6, h.y - 6, 12, 12);
      }
    }
    drawBombFall(ctx, h) {
      const p = h.t / 1.1;
      const off = (1 - p) * (1 - p) * 760;
      PF.Ent.shadow(ctx, h.x, h.y, 26 * (0.3 + p * 0.7), 9 * (0.3 + p * 0.7), 0.35);
      drawImg(ctx, bombSprite(), h.x, h.y - 30 - off);
    }
    drawHazAir(ctx, h) {
      if (h.type === 'rocket' && h.st === 'lock') {
        const p = h.t / 0.4;
        drawImg(ctx, rocketSprite(), h.x, h.y - (1 - p) * 820 - 30);
      }
      if (h.type === 'laser') {
        const em = emitterSprite();
        if (h.hor) {
          drawImg(ctx, em, -10, h.pos);
          drawImg(ctx, em, 970, h.pos);
        } else {
          drawImg(ctx, em, h.pos, -10);
          drawImg(ctx, em, h.pos, 970);
        }
        if (h.st === 'active') {
          const f = 1 - h.t / 0.45;
          const flick = 0.85 + Math.random() * 0.15;
          ctx.fillStyle = `rgba(255,70,70,${0.55 * f * flick})`;
          if (h.hor) ctx.fillRect(-20, h.pos - h.w / 2, 1000, h.w);
          else ctx.fillRect(h.pos - h.w / 2, -20, h.w, 1000);
          ctx.fillStyle = `rgba(255,220,210,${0.95 * f})`;
          const cw = h.w * 0.36;
          if (h.hor) ctx.fillRect(-20, h.pos - cw / 2, 1000, cw);
          else ctx.fillRect(h.pos - cw / 2, -20, cw, 1000);
        }
      }
      if ((h.type === 'bomb' || h.type === 'rocket') && h.st === 'active') {
        const q = h.t / h.life;
        const r = h.r * (0.65 + 0.45 * U.easeOut(Math.min(1, q * 2)));
        const a = 1 - q;
        const rings = [
          [1, `rgba(255,106,42,${0.75 * a})`],
          [0.78, `rgba(255,178,56,${0.85 * a})`],
          [0.5, `rgba(255,227,107,${0.95 * a})`],
          [0.25, `rgba(255,255,255,${a})`],
        ];
        for (const [k, c] of rings) {
          ctx.fillStyle = c;
          ctx.beginPath();
          ctx.arc(h.x, h.y, r * k, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
    drawHUD(ctx, W) {
      this.drawTitle(ctx);
      const left = this.phase === 'ready' ? this.dur : this.left;
      text(ctx, fmt(left), W / 2, 34, 32, left <= 10 && this.phase === 'play' ? '#ff7a6b' : '#fff', 'center', 6);
      this.drawHearts(ctx, 14, 66);
    }
  }

  /* ======================================================
     2) 迷失世界：漆黑迷宫，找到出口
     ====================================================== */
  class Lost extends MiniBase {
    constructor(g, portal, done) {
      super(g, portal, done, 'lost');
      this.bg = '#050806';
      this.COLS = 13;
      this.ROWS = 9;
      this.CS = 150;
      this.WT = 26;
      this.left = 120;
      this.lightR = 225;
      this.got = 0;
      this.subtitle = '120 秒内找到发光的出口，萤火虫能照亮更远';
      this.gen();
      const s = this.cellC(this.start[0], this.start[1]);
      this.avs.forEach((a, i) => {
        a.x = s[0] + (this.twoP ? (i ? 22 : -22) : 0);
        a.y = s[1] + 20;
        a.speed = 300;
      });
      this.cam = { x: s[0], y: s[1], z: 1 };
      this.lightCv = document.createElement('canvas');
      this.lightCx = this.lightCv.getContext('2d');
      this.hintT = 6;
    }
    cellC(r, c) {
      return [c * this.CS + this.CS / 2, r * this.CS + this.CS / 2];
    }
    gen() {
      const R = this.ROWS,
        C = this.COLS;
      const rnd = U.rng((Math.random() * 1e9) | 0);
      const hw = [],
        vw = [];
      for (let r = 0; r <= R; r++) hw.push(new Array(C).fill(true));
      for (let r = 0; r < R; r++) vw.push(new Array(C + 1).fill(true));
      const seen = [];
      for (let r = 0; r < R; r++) seen.push(new Array(C).fill(false));
      const stack = [[0, 0]];
      seen[0][0] = true;
      while (stack.length) {
        const [r, c] = stack[stack.length - 1];
        const nb = [];
        if (r > 0 && !seen[r - 1][c]) nb.push([r - 1, c, 'n']);
        if (r < R - 1 && !seen[r + 1][c]) nb.push([r + 1, c, 's']);
        if (c > 0 && !seen[r][c - 1]) nb.push([r, c - 1, 'w']);
        if (c < C - 1 && !seen[r][c + 1]) nb.push([r, c + 1, 'e']);
        if (!nb.length) {
          stack.pop();
          continue;
        }
        const [nr, nc, d] = nb[Math.floor(rnd() * nb.length)];
        if (d === 'n') hw[r][c] = false;
        if (d === 's') hw[r + 1][c] = false;
        if (d === 'w') vw[r][c] = false;
        if (d === 'e') vw[r][c + 1] = false;
        seen[nr][nc] = true;
        stack.push([nr, nc]);
      }
      this.hw = hw;
      this.vw = vw;
      // 墙体矩形
      const CS = this.CS,
        WT = this.WT;
      const rects = [];
      for (let r = 0; r <= R; r++)
        for (let c = 0; c < C; c++) if (hw[r][c]) rects.push({ x0: c * CS - WT / 2, y0: r * CS - WT / 2, x1: (c + 1) * CS + WT / 2, y1: r * CS + WT / 2 });
      for (let r = 0; r < R; r++)
        for (let c = 0; c <= C; c++) if (vw[r][c]) rects.push({ x0: c * CS - WT / 2, y0: r * CS - WT / 2, x1: c * CS + WT / 2, y1: (r + 1) * CS + WT / 2 });
      this.rects = rects;
      // 出口：离起点最远的格子
      this.start = [0, 0];
      const dist = [];
      for (let r = 0; r < R; r++) dist.push(new Array(C).fill(-1));
      const q = [[0, 0]];
      dist[0][0] = 0;
      while (q.length) {
        const [r, c] = q.shift();
        const go = (nr, nc, open) => {
          if (open && dist[nr][nc] < 0) {
            dist[nr][nc] = dist[r][c] + 1;
            q.push([nr, nc]);
          }
        };
        if (r > 0) go(r - 1, c, !hw[r][c]);
        if (r < R - 1) go(r + 1, c, !hw[r + 1][c]);
        if (c > 0) go(r, c - 1, !vw[r][c]);
        if (c < C - 1) go(r, c + 1, !vw[r][c + 1]);
      }
      // 出口：在远离起点的半边里，选路程最远的格子（免得一开局就看见出口）
      let far = [R - 1, C - 1];
      for (let r = 0; r < R; r++)
        for (let c = 0; c < C; c++) {
          if (r / R + c / C < 1) continue;
          if (dist[r][c] > dist[far[0]][far[1]]) far = [r, c];
        }
      this.exit = far;
      // 死胡同里放萤火虫
      const ends = [];
      for (let r = 0; r < R; r++)
        for (let c = 0; c < C; c++) {
          const w = (hw[r][c] ? 1 : 0) + (hw[r + 1][c] ? 1 : 0) + (vw[r][c] ? 1 : 0) + (vw[r][c + 1] ? 1 : 0);
          if (w === 3 && !(r === 0 && c === 0) && !(r === far[0] && c === far[1])) ends.push([r, c]);
        }
      U.shuffle(ends, rnd);
      while (ends.length < 4) ends.push([Math.floor(rnd() * R), Math.floor(rnd() * C)]);
      this.flies = ends.slice(0, 4).map(([r, c]) => {
        const p = this.cellC(r, c);
        return { x: p[0], y: p[1], got: false, ph: rnd() * 6 };
      });
      this.mazeCv = this.buildArt();
    }
    buildArt() {
      const CS = this.CS,
        WT = this.WT;
      const Wd = this.COLS * CS + WT,
        Ht = this.ROWS * CS + WT;
      const aw = Math.ceil(Wd / PX),
        ah = Math.ceil(Ht / PX);
      const solid = new Uint8Array(aw * ah);
      for (const r of this.rects) {
        const x0 = Math.floor((r.x0 + WT / 2) / PX),
          y0 = Math.floor((r.y0 + WT / 2) / PX);
        const x1 = Math.ceil((r.x1 + WT / 2) / PX),
          y1 = Math.ceil((r.y1 + WT / 2) / PX);
        for (let j = Math.max(0, y0); j < Math.min(ah, y1); j++) for (let i = Math.max(0, x0); i < Math.min(aw, x1); i++) solid[j * aw + i] = 1;
      }
      const F1 = H('#24402a'),
        F2 = H('#1f3a25'),
        FS = H('#2f5234'),
        FD = H('#18301d');
      const W1 = H('#2f6b2f'),
        W2 = H('#3f8f3a'),
        WTOP = H('#6cc04a'),
        WLIT = H('#9ee06a'),
        WBOT = H('#173a1c'),
        SH = H('#122816');
      const cell = CS / PX;
      return pixCanvas(aw, ah, (i, j) => {
        const k = j * aw + i;
        if (solid[k]) {
          const up = j > 0 && solid[k - aw];
          const dn = j < ah - 1 && solid[k + aw];
          if (!up) return WLIT;
          if (j > 0 && !solid[k - 2 * aw] && up) return WTOP;
          if (!dn) return WBOT;
          const n = U.hash(i, j, 11);
          return n < 0.18 ? W2 : n > 0.93 ? WTOP : W1;
        }
        // 墙下的阴影
        if (j > 0 && solid[k - aw]) return SH;
        const n = U.hash(i, j, 5);
        if (n < 0.05) return FS;
        if (n > 0.97) return FD;
        const ci = Math.floor((i * PX - WT / 2) / (CS / 2)),
          cj = Math.floor((j * PX - WT / 2) / (CS / 2));
        void cell;
        return (ci + cj) % 2 ? F1 : F2;
      });
    }
    collide() {
      return (a, dx, dy) => {
        a.x += dx;
        this.resolve(a);
        a.y += dy;
        this.resolve(a);
      };
    }
    resolve(a) {
      const r = a.r + 2;
      for (const w of this.rects) {
        if (a.x < w.x0 - r || a.x > w.x1 + r || a.y < w.y0 - r || a.y > w.y1 + r) continue;
        const cx = U.clamp(a.x, w.x0, w.x1),
          cy = U.clamp(a.y, w.y0, w.y1);
        const dx = a.x - cx,
          dy = a.y - cy;
        const d = Math.hypot(dx, dy);
        if (d < r) {
          if (d > 0.001) {
            a.x = cx + (dx / d) * r;
            a.y = cy + (dy / d) * r;
          } else {
            const l = a.x - w.x0,
              rr = w.x1 - a.x,
              u = a.y - w.y0,
              dd = w.y1 - a.y;
            const m = Math.min(l, rr, u, dd);
            if (m === l) a.x = w.x0 - r;
            else if (m === rr) a.x = w.x1 + r;
            else if (m === u) a.y = w.y0 - r;
            else a.y = w.y1 + r;
          }
        }
      }
    }
    baseZoom() {
      return Math.min(this.g.cam.W, this.g.cam.H) / 720;
    }
    play(dt) {
      this.left -= dt;
      if (this.hintT > 0) this.hintT -= dt;
      const col = this.collide();
      const maxD = Math.min(this.g.cam.W, this.g.cam.H) / (this.baseZoom() * 0.55) - 240;
      for (const a of this.avs) {
        const ox = a.x,
          oy = a.y;
        this.moveAvatar(a, dt, this.inputFor(a.idx), col);
        if (this.twoP) {
          const o = this.avs[1 - a.idx];
          const nd = U.dist(a.x, a.y, o.x, o.y);
          if (nd > maxD && nd > U.dist(ox, oy, o.x, o.y)) {
            a.x = ox;
            a.y = oy;
          }
        }
      }
      for (const f of this.flies) {
        if (f.got) continue;
        for (const a of this.avs)
          if (U.dist(a.x, a.y - 20, f.x, f.y) < 50) {
            f.got = true;
            this.got++;
            this.lightR += 35;
            play('coin');
            this.parts.burst(f.x, f.y, ['#eaff8a', '#b7f59a', '#ffffff'], 14, 260);
            break;
          }
      }
      const ex = this.cellC(this.exit[0], this.exit[1]);
      for (const a of this.avs)
        if (U.dist(a.x, a.y - 10, ex[0], ex[1]) < 48) {
          this.parts.burst(ex[0], ex[1], ['#9cf5c4', '#ffffff', '#4fd18b'], 30, 400);
          return this.win();
        }
      if (this.left <= 0) {
        this.left = 0;
        this.lose();
      }
    }
    follow(dt) {
      const W = this.g.cam.W,
        Hh = this.g.cam.H;
      let tx = 0,
        ty = 0;
      for (const a of this.avs) {
        tx += a.x;
        ty += a.y;
      }
      tx /= this.avs.length;
      ty /= this.avs.length;
      let tz = this.baseZoom();
      if (this.twoP) {
        const dx = Math.abs(this.avs[0].x - this.avs[1].x) + 400,
          dy = Math.abs(this.avs[0].y - this.avs[1].y) + 360;
        tz = Math.max(tz * 0.55, Math.min(tz, W / dx, (Hh - 80) / dy));
      }
      const k = dt > 0 ? 1 - Math.pow(0.002, dt) : 1;
      this.cam.x += (tx - this.cam.x) * k;
      this.cam.y += (ty - 30 - this.cam.y) * k;
      this.cam.z += (tz - this.cam.z) * k;
    }
    drawWorld(ctx, dpr) {
      const W = this.g.cam.W,
        Hh = this.g.cam.H;
      if (!this._lastT) this._lastT = this.time;
      this.follow(Math.min(0.1, this.time - this._lastT));
      this._lastT = this.time;
      const cam = this.cam;
      const z = cam.z;
      const toS = (x, y) => [(x - cam.x) * z + W / 2, (y - cam.y) * z + Hh / 2 + 30];
      ctx.setTransform(dpr * z, 0, 0, dpr * z, dpr * (W / 2 - cam.x * z), dpr * (Hh / 2 + 30 - cam.y * z));
      ctx.imageSmoothingEnabled = false;
      const WT = this.WT;
      ctx.drawImage(this.mazeCv, -WT / 2, -WT / 2, this.mazeCv.width * PX, this.mazeCv.height * PX);
      // 出口
      const ex = this.cellC(this.exit[0], this.exit[1]);
      const pul = 0.5 + Math.sin(this.time * 4) * 0.5;
      ctx.fillStyle = `rgba(79,209,139,${0.25 + pul * 0.2})`;
      ctx.beginPath();
      ctx.arc(ex[0], ex[1], 58, 0, Math.PI * 2);
      ctx.fill();
      for (let k = 0; k < 3; k++) {
        ctx.strokeStyle = k === 1 ? '#ffffff' : '#9cf5c4';
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.arc(ex[0], ex[1], 18 + k * 14 + pul * 4, this.time * (k + 1), this.time * (k + 1) + 4.2);
        ctx.stroke();
      }
      // 萤火虫
      for (const f of this.flies) {
        if (f.got) continue;
        const fy = f.y + Math.sin(this.time * 3 + f.ph) * 10;
        const fx = f.x + Math.cos(this.time * 2 + f.ph) * 8;
        ctx.fillStyle = 'rgba(234,255,138,0.25)';
        ctx.beginPath();
        ctx.arc(fx, fy, 22, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#eaff8a';
        ctx.fillRect(fx - 6, fy - 6, 12, 12);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(fx - 2, fy - 2, 4, 4);
      }
      this.avs
        .slice()
        .sort((a, b) => a.y - b.y)
        .forEach((a) => a.draw(ctx, this.twoP));
      this.parts.draw(ctx);
      // 黑暗
      const lw = Math.ceil(W / 2),
        lh = Math.ceil(Hh / 2);
      const lc = this.lightCv,
        x = this.lightCx;
      if (lc.width !== lw || lc.height !== lh) {
        lc.width = lw;
        lc.height = lh;
      }
      x.setTransform(1, 0, 0, 1, 0, 0);
      x.globalCompositeOperation = 'source-over';
      x.clearRect(0, 0, lw, lh);
      x.fillStyle = 'rgba(3,7,5,0.97)';
      x.fillRect(0, 0, lw, lh);
      x.globalCompositeOperation = 'destination-out';
      const hole = (wx, wy, r, a) => {
        const [sx0, sy0] = toS(wx, wy);
        const sx = sx0 / 2,
          sy = sy0 / 2,
          sr = (r * z) / 2;
        if (sx < -sr || sy < -sr || sx > lw + sr || sy > lh + sr) return;
        const gr = x.createRadialGradient(sx, sy, 0, sx, sy, sr);
        gr.addColorStop(0, `rgba(0,0,0,${a})`);
        gr.addColorStop(0.6, `rgba(0,0,0,${a * 0.85})`);
        gr.addColorStop(1, 'rgba(0,0,0,0)');
        x.fillStyle = gr;
        x.fillRect(sx - sr, sy - sr, sr * 2, sr * 2);
      };
      for (const a of this.avs) hole(a.x, a.y - 40, this.lightR, 1);
      hole(ex[0], ex[1], 140 + pul * 20, 0.9);
      for (const f of this.flies) if (!f.got) hole(f.x, f.y, 55, 0.7);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(lc, 0, 0, lw, lh, 0, 0, W * dpr, Hh * dpr);
      ctx.imageSmoothingEnabled = false;
    }
    drawHUD(ctx, W) {
      this.drawTitle(ctx);
      const left = this.phase === 'ready' ? 120 : this.left;
      text(ctx, fmt(left), W / 2, 34, 32, left <= 15 && this.phase === 'play' ? '#ff7a6b' : '#fff', 'center', 6);
      text(ctx, '萤火虫 ' + this.got + '/4', 14, 66, 18, '#eaff8a');
      if (this.phase === 'play' && this.hintT > 0) text(ctx, '找到发光的绿色出口！', W / 2, 98, 18, '#9cf5c4', 'center');
    }
  }

  /* ======================================================
     3) 数字世界：读题，站到正确的数字砖上
     ====================================================== */
  const DIGITS = {
    1: ['..#..', '.##..', '..#..', '..#..', '..#..', '..#..', '.###.'],
    2: ['.###.', '#...#', '....#', '...#.', '..#..', '.#...', '#####'],
    3: ['####.', '....#', '....#', '.###.', '....#', '....#', '####.'],
    4: ['...#.', '..##.', '.#.#.', '#..#.', '#####', '...#.', '...#.'],
    5: ['#####', '#....', '####.', '....#', '....#', '#...#', '.###.'],
    6: ['..##.', '.#...', '#....', '####.', '#...#', '#...#', '.###.'],
    7: ['#####', '....#', '...#.', '..#..', '.#...', '.#...', '.#...'],
    8: ['.###.', '#...#', '#...#', '.###.', '#...#', '#...#', '.###.'],
    9: ['.###.', '#...#', '#...#', '.####', '....#', '...#.', '.##..'],
  };
  function numTile(n) {
    return memo('numTile' + n, () => {
      const col = D.NUM_COLORS[n];
      const p = new S.PC(50, 50);
      p.r(0, 0, 50, 50, col);
      p.r(0, 0, 50, 3, S.mix(col, '#ffffff', 0.45));
      p.r(0, 0, 3, 50, S.mix(col, '#ffffff', 0.3));
      p.r(0, 46, 50, 4, S.mix(col, '#000000', 0.3));
      p.r(47, 0, 3, 50, S.mix(col, '#000000', 0.2));
      for (let k = 0; k < 18; k++) p.p(4 + U.hash(k, n, 1) * 42, 4 + U.hash(k, n, 2) * 40, S.mix(col, '#000000', 0.12));
      // 数字
      const dg = new S.PC(22, 30);
      DIGITS[n].forEach((row, j) => {
        for (let i = 0; i < 5; i++) if (row[i] === '#') dg.r(1 + i * 4, 1 + j * 4, 4, 4, '#ffffff');
      });
      dg.outline(OUT);
      p.x.drawImage(dg.c, 14, 10);
      p.r(0, 0, 50, 1, OUT);
      p.r(0, 49, 50, 1, OUT);
      p.r(0, 0, 1, 50, OUT);
      p.r(49, 0, 1, 50, OUT);
      return p.c;
    });
  }

  class NumberWorld extends MiniBase {
    constructor(g, portal, done) {
      super(g, portal, done, 'number');
      this.bg = '#0d1030';
      this.hudTop = 150;
      this.TS = 200;
      this.GAP = 14;
      this.G = this.TS * 3 + this.GAP * 2;
      this.gx = (this.AW - this.G) / 2;
      this.gy = (this.AH - this.G) / 2;
      this.slots = [1, 2, 3, 4, 5, 6, 7, 8, 9];
      this.round = 0;
      this.rounds = 5;
      this.st = 'idle';
      this.cd = 0;
      this.rt = 0;
      this.fallP = 0;
      this.subtitle = '读题后站到正确的数字砖上，错误的砖块会塌落';
      this.qs = this.makeQuestions();
      this.q = null;
      this.avs.forEach((a, i) => {
        const c = this.slotCenter(4);
        a.x = c[0] + (this.twoP ? (i ? 50 : -50) : 0);
        a.y = c[1] + 40;
      });
      this.bgDigits = [];
      const rnd = U.rng(7);
      for (let k = 0; k < 36; k++) this.bgDigits.push({ x: rnd() * 1400 - 220, y: rnd() * 1400 - 220, n: 1 + Math.floor(rnd() * 9), s: 0.5 + rnd(), sp: 10 + rnd() * 30 });
    }
    makeQuestions() {
      const used = new Set();
      const out = [];
      const arith = () => {
        for (let t = 0; t < 200; t++) {
          const k = U.randi(0, 3);
          let s, v;
          if (k === 0) {
            const a = U.randi(2, 9),
              b = U.randi(1, 9),
              c = U.randi(1, 9);
            v = a + b - c;
            s = `${a}+${b}-${c}`;
          } else if (k === 1) {
            const a = U.randi(5, 12),
              b = U.randi(1, 5),
              c = U.randi(1, 9);
            v = a - b + c;
            s = `${a}-${b}+${c}`;
          } else if (k === 2) {
            const a = U.randi(2, 9),
              b = U.randi(2, 9);
            const c = U.randi(1, 80);
            v = a * b - c;
            s = `${a}×${b}-${c}`;
          } else {
            const a = U.randi(2, 9),
              b = U.randi(2, 9);
            const ds = [2, 3, 4, 6, 8, 9].filter((d) => (a * b) % d === 0);
            if (!ds.length) continue;
            const c = U.pick(ds);
            v = (a * b) / c;
            s = `${a}×${b}÷${c}`;
          }
          if (v >= 1 && v <= 9 && !used.has(s)) {
            used.add(s);
            return { text: s + ' = ?', ans: v };
          }
        }
        return { text: '4+5-6 = ?', ans: 3 };
      };
      const fromList = (list, mk) => {
        const cands = list.filter((it) => !used.has(it[0]));
        const it = U.pick(cands.length ? cands : list);
        used.add(it[0]);
        return mk(it);
      };
      const color = () => fromList(D.QUIZ_COLOR, (it) => ({ text: `站到【${it[0]}】的颜色上`, ans: it[1] }));
      const count = () => fromList(D.QUIZ_COUNT, (it) => ({ text: it[0], ans: it[1] }));
      const plan = U.shuffle([arith, color, count, arith, Math.random() < 0.5 ? color : count]);
      for (const f of plan) out.push(f());
      return out;
    }
    slotRect(k) {
      const c = k % 3,
        r = Math.floor(k / 3);
      const x = this.gx + c * (this.TS + this.GAP),
        y = this.gy + r * (this.TS + this.GAP);
      return [x, y, this.TS, this.TS];
    }
    slotCenter(k) {
      const [x, y, w, h] = this.slotRect(k);
      return [x + w / 2, y + h / 2];
    }
    slotAt(px, py) {
      for (let k = 0; k < 9; k++) {
        const [x, y, w, h] = this.slotRect(k);
        if (px >= x && px <= x + w && py >= y && py <= y + h) return k;
      }
      return -1;
    }
    onStart() {
      this.nextRound();
    }
    nextRound() {
      this.round++;
      U.shuffle(this.slots);
      this.q = this.qs[this.round - 1];
      this.cd = this.round <= 2 ? 8 : 6.5;
      this.st = 'ask';
      this.lastTick = Math.ceil(this.cd);
      this.fallP = 0;
      this.rt = 0;
      this.correct = this.slots.indexOf(this.q.ans);
      play('pop');
    }
    play(dt) {
      const col = this.clampIn(this.gx, this.gy, this.gx + this.G, this.gy + this.G + 6);
      for (const a of this.avs) {
        if (a.out || a.falling) {
          a.moving = false;
          continue;
        }
        this.moveAvatar(a, dt, this.inputFor(a.idx), col);
      }
      if (this.st === 'ask') {
        this.cd -= dt;
        const c = Math.ceil(this.cd);
        if (c !== this.lastTick) {
          this.lastTick = c;
          if (c <= 3 && c > 0) play('tick');
        }
        if (this.cd <= 0) {
          this.cd = 0;
          this.st = 'resolve';
          this.rt = 0;
          this.dropped = false;
          this.respawned = false;
        }
      } else if (this.st === 'resolve') {
        this.rt += dt;
        if (this.rt >= 0.5 && !this.dropped) {
          this.dropped = true;
          let anyOk = false;
          for (const a of this.avs) {
            if (a.out) continue;
            const s = this.slotAt(a.x, a.y);
            if (s !== this.correct) {
              a.falling = true;
              a.fallT = 0;
              a.hearts--;
              a.flash = 0.6;
              if (a.hearts <= 0) {
                a.hearts = 0;
                a.out = true;
              }
              play('fall');
            } else anyOk = true;
          }
          if (anyOk) play('right');
        }
        if (this.dropped) this.fallP = Math.min(1, (this.rt - 0.5) / 0.5);
        for (const a of this.avs) if (a.falling) a.fallT += dt;
        if (this.rt >= 1.3 && !this.respawned) {
          this.respawned = true;
          if (this.avs.every((a) => a.out)) return this.lose();
          const c = this.slotCenter(this.correct);
          for (const a of this.avs) {
            if (a.falling && !a.out) {
              a.falling = false;
              a.fallT = 0;
              a.x = c[0] + (this.twoP ? (a.idx ? 30 : -30) : 0);
              a.y = c[1] + 30;
              a.invuln = 1;
            }
          }
        }
        if (this.rt >= 1.75) {
          if (this.round >= this.rounds) return this.win();
          this.nextRound();
        }
      }
    }
    drawWorld(ctx, dpr) {
      this.arenaXform(ctx, dpr);
      // 背景：漂浮的数字
      ctx.globalAlpha = 0.07;
      for (const d of this.bgDigits) {
        const y = ((d.y - this.time * d.sp + 1400) % 1400) - 220;
        drawImg(ctx, numTile(d.n), d.x, y, d.s * 0.4);
      }
      ctx.globalAlpha = 1;
      // 网格底座
      ctx.fillStyle = '#05061a';
      ctx.fillRect(this.gx - 10, this.gy - 10, this.G + 20, this.G + 30);
      const shaking = this.st === 'resolve' && this.rt < 0.5;
      for (let k = 0; k < 9; k++) {
        const n = this.slots[k];
        let [x, y, w, h] = this.slotRect(k);
        const wrong = this.st === 'resolve' && k !== this.correct;
        let sc = 1,
          al = 1;
        if (wrong && shaking) x += Math.sin(this.time * 70 + k) * 5;
        if (wrong && this.fallP > 0) {
          sc = 1 - this.fallP * 0.55;
          al = 1 - this.fallP;
          y += this.fallP * 60;
        }
        if (al <= 0.01) continue;
        ctx.globalAlpha = al;
        const cx = x + w / 2,
          cy = y + h / 2;
        // 厚度
        ctx.fillStyle = S.mix(D.NUM_COLORS[n], '#000000', 0.55);
        ctx.fillRect(cx - (w * sc) / 2, cy - (h * sc) / 2 + 14 * sc, w * sc, h * sc);
        ctx.drawImage(numTile(n), cx - (w * sc) / 2, cy - (h * sc) / 2, w * sc, h * sc);
        if (this.st === 'resolve' && k === this.correct && this.dropped) {
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 8;
          ctx.strokeRect(x + 4, y + 4, w - 8, h - 8);
        }
        ctx.globalAlpha = 1;
      }
      // 角色
      this.avs
        .slice()
        .sort((a, b) => a.y - b.y)
        .forEach((a) => {
          if (a.falling) {
            const p = Math.min(1, a.fallT / 0.8);
            if (p >= 1) return;
            ctx.save();
            ctx.globalAlpha = 1 - p;
            ctx.translate(a.x, a.y + p * 80);
            ctx.rotate(p * 3);
            ctx.scale(1 - p * 0.7, 1 - p * 0.7);
            ctx.translate(-a.x, -a.y);
            const fo = a.out;
            a.out = false;
            a.draw(ctx, this.twoP);
            a.out = fo;
            ctx.restore();
          } else if (a.out) {
            // 出局后不再显示
          } else a.draw(ctx, this.twoP);
        });
      this.parts.draw(ctx);
    }
    drawHUD(ctx, W) {
      this.drawTitle(ctx);
      const r = Math.max(1, this.round);
      text(ctx, `第 ${r}/${this.rounds} 题`, W / 2, 30, 22, '#fff', 'center');
      this.drawHearts(ctx, 14, 58);
      if (!this.q || this.phase === 'ready') return;
      // 题目横幅
      const x0 = 12,
        x1 = W - 12;
      const fs = W < 520 ? 20 : 26;
      ctx.font = FONT(fs);
      const cdW = 56;
      const lines = wrapLines(ctx, this.q.text, x1 - x0 - cdW - 28);
      const lh = fs + 8;
      const y0 = 78,
        hgt = Math.max(56, lines.length * lh + 18);
      ctx.fillStyle = 'rgba(20,16,44,0.92)';
      ctx.fillRect(x0, y0, x1 - x0, hgt);
      ctx.strokeStyle = this.Wd.color;
      ctx.lineWidth = 4;
      ctx.strokeRect(x0 + 2, y0 + 2, x1 - x0 - 4, hgt - 4);
      // 倒计时圆
      const cx = x0 + 12 + cdW / 2,
        cy = y0 + hgt / 2;
      const left = this.st === 'ask' ? this.cd : 0;
      const tot = this.round <= 2 ? 8 : 6.5;
      ctx.fillStyle = '#05061a';
      ctx.beginPath();
      ctx.arc(cx, cy, 24, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = left <= 3 ? '#ff7a6b' : '#ffe36b';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.arc(cx, cy, 22, -Math.PI / 2, -Math.PI / 2 + (left / tot) * Math.PI * 2);
      ctx.stroke();
      text(ctx, String(Math.ceil(left)), cx, cy + 1, 24, left <= 3 ? '#ff7a6b' : '#fff', 'center');
      const tx = (x0 + cdW + 24 + x1) / 2;
      lines.forEach((l, i) => text(ctx, l, tx, y0 + hgt / 2 + (i - (lines.length - 1) / 2) * lh, fs, '#fff', 'center'));
    }
  }

  /* ======================================================
     4) 颠倒世界：方向反转，把水果放进对应的纸箱
     ====================================================== */
  function fruitSprite(k) {
    return memo('fruit' + k, () => {
      const p = new S.PC(12, 12);
      if (k === 0) {
        p.circ(6, 7, 4.6, '#e8423f');
        p.circ(4.5, 5.5, 1.4, '#ff9a8f');
        p.r(6, 1, 1, 3, '#6b4a2f');
        p.r(7, 1, 3, 2, '#5bbf4a');
      } else if (k === 1) {
        p.circ(4, 8, 2.8, '#3f5fd8');
        p.circ(8.2, 8, 2.8, '#3f5fd8');
        p.circ(6, 4.4, 2.8, '#4f73f0');
        p.p(5, 3, '#c8d6ff');
        p.p(3, 7, '#9cb4ff');
        p.p(7, 7, '#9cb4ff');
        p.p(6, 2, '#22307a');
      } else {
        for (let j = 0; j < 12; j++)
          for (let i = 0; i < 12; i++) {
            const dx = (i + 0.5 - 6) / 4.8,
              dy = (j + 0.5 - 7) / 3.9;
            if (dx * dx + dy * dy <= 1) p.p(i, j, dx + dy < -0.5 ? '#ffe36b' : dx + dy < 0.4 ? '#ffc23a' : '#ff9a2e');
          }
        p.r(7, 2, 3, 2, '#5bbf4a');
        p.p(6, 3, '#6b4a2f');
      }
      p.outline(OUT);
      return p.c;
    });
  }
  function boxSprite() {
    return memo('box', () => {
      const p = new S.PC(20, 16);
      p.r(1, 3, 18, 12, '#c9a26a');
      p.r(1, 3, 18, 2, '#e0bd85');
      p.r(14, 3, 5, 12, '#b08a55');
      p.r(8, 3, 4, 12, '#e8d3a8');
      p.r(0, 1, 9, 3, '#d9b47a');
      p.r(11, 1, 9, 3, '#d9b47a');
      p.outline(OUT);
      return p.c;
    });
  }
  function markSprite(ok) {
    return memo('mark' + ok, () => {
      const p = new S.PC(12, 12);
      if (ok) {
        const pts = [[1, 6], [2, 7], [3, 8], [4, 9], [5, 8], [6, 7], [7, 6], [8, 5], [9, 4], [10, 3]];
        for (const [x, y] of pts) p.r(x, y - 1, 2, 3, '#3fbf5a');
      } else {
        for (let i = 1; i < 11; i++) {
          p.r(i, i - 1, 2, 2, '#e8423f');
          p.r(11 - i, i - 1, 2, 2, '#e8423f');
        }
      }
      p.outline(OUT);
      return p.c;
    });
  }
  function crateSprite(k) {
    return memo('crate' + k, () => {
      const p = new S.PC(30, 24);
      p.r(1, 9, 28, 14, '#8a5a35');
      p.r(1, 9, 28, 2, '#b07a45');
      p.r(1, 15, 28, 1, '#6b4024');
      p.r(1, 9, 2, 14, '#6b4024');
      p.r(27, 9, 2, 14, '#6b4024');
      p.line(3, 11, 26, 21, '#6b4024');
      p.outline(OUT);
      const f = fruitSprite(k);
      for (const [x, y] of [[2, 1], [9, 0], [16, 1], [6, 4], [13, 4]]) p.x.drawImage(f, x, y);
      return p.c;
    });
  }
  function revFloor() {
    return memo('revFloor', () => {
      const A1 = H('#cfe0ff'),
        A2 = H('#bfd3f7'),
        E1 = H('#a9c0ea'),
        SP = H('#e6efff');
      return pixCanvas(240, 240, (i, j) => {
        const bi = i % 24,
          bj = j % 24;
        if (bi === 0 || bj === 0) return E1;
        const n = U.hash(i, j, 21);
        if (n < 0.03) return SP;
        return (Math.floor(i / 24) + Math.floor(j / 24)) % 2 ? A1 : A2;
      });
    });
  }

  class Reversal extends MiniBase {
    constructor(g, portal, done) {
      super(g, portal, done, 'reversal');
      this.bg = '#16203a';
      this.reversed = true;
      this.total = this.twoP ? 14 : 10;
      this.spawnInt = this.twoP ? 3.0 : 4.2;
      this.spawnT = 0.4;
      this.boxes = [];
      this.spawned = 0;
      this.correct = 0;
      this.wrong = 0;
      this.beltY0 = 400;
      this.beltY1 = 520;
      this.speed = 70;
      this.crates = [
        { x: 200, y: 830, f: 0 },
        { x: 480, y: 830, f: 1 },
        { x: 760, y: 830, f: 2 },
      ];
      this.subtitle = '方向是反的！拿水果放进要同样水果的纸箱';
      this.avs.forEach((a, i) => {
        a.x = 480 + (this.twoP ? (i ? 70 : -70) : 0);
        a.y = 680;
      });
    }
    play(dt) {
      const col = this.clampIn(20, 60, 940, 940);
      for (const a of this.avs) this.moveAvatar(a, dt, this.inputFor(a.idx), col);
      this.spawnT -= dt;
      if (this.spawnT <= 0 && this.spawned < this.total) {
        this.spawnT = this.spawnInt;
        this.spawned++;
        this.boxes.push({ x: -50, y: (this.beltY0 + this.beltY1) / 2 + 8, need: U.randi(0, 2), res: null, rt: 0 });
      }
      for (const b of this.boxes) {
        b.x += this.speed * dt;
        if (b.res !== null) b.rt += dt;
      }
      // 拿水果
      for (const a of this.avs) {
        for (const c of this.crates) {
          if (U.dist(a.x, a.y, c.x, c.y - 10) < 80 && a.held !== c.f) {
            a.held = c.f;
            play('pop');
          }
        }
      }
      // 送货
      for (const a of this.avs) {
        if (a.held < 0) continue;
        for (const b of this.boxes) {
          if (b.res !== null) continue;
          if (U.dist(a.x, a.y - 20, b.x, b.y - 10) < 75) {
            const ok = a.held === b.need;
            b.res = ok;
            if (ok) {
              this.correct++;
              play('right');
              this.parts.burst(b.x, b.y - 40, ['#3fbf5a', '#ffffff', '#ffe36b'], 12, 280);
            } else {
              this.wrong++;
              play('wrong');
              this.shake = 6;
              this.parts.burst(b.x, b.y - 40, ['#e8423f', '#ffffff'], 10, 240);
            }
            a.held = -1;
            break;
          }
        }
      }
      // 漏掉的箱子
      for (const b of this.boxes) {
        if (b.res === null && b.x > 1000) {
          b.res = false;
          b.missed = true;
          this.wrong++;
          play('wrong');
          this.shake = 6;
        }
      }
      this.boxes = this.boxes.filter((b) => b.x < 1080);
      if (this.wrong >= 3) return this.lose();
      if (this.correct + this.wrong >= this.total) this.win();
    }
    endUpdate(dt) {
      for (const b of this.boxes) b.x += this.speed * dt * 0.3;
    }
    drawWorld(ctx, dpr) {
      this.arenaXform(ctx, dpr);
      ctx.fillStyle = '#1c1424';
      ctx.fillRect(-12, -12, 984, 984);
      ctx.drawImage(revFloor(), 0, 0, 960, 960);
      // 地上的反向箭头
      ctx.fillStyle = 'rgba(79,157,255,0.18)';
      for (const [x, y, d] of [[160, 180, 1], [800, 180, -1], [160, 640, -1], [800, 640, 1]]) {
        for (let k = 0; k < 6; k++) ctx.fillRect(x - 40 + k * 8 * d + (d < 0 ? 40 : 0), y - k * 4, 8, 8 + k * 8);
      }
      // 传送带
      const y0 = this.beltY0,
        y1 = this.beltY1;
      ctx.fillStyle = '#2b2f3d';
      ctx.fillRect(-20, y0 - 8, 1000, y1 - y0 + 16);
      ctx.fillStyle = '#3a3f4f';
      ctx.fillRect(-20, y0, 1000, y1 - y0);
      const off = (this.time * this.speed) % 48;
      ctx.fillStyle = '#4f566b';
      for (let x = -48; x < 1000; x += 48) {
        for (let k = 0; k < 6; k++) ctx.fillRect(Math.round(x + off + k * 4), y0 + 8 + k * 8, 12, 8);
        for (let k = 0; k < 6; k++) ctx.fillRect(Math.round(x + off + 20 - k * 4), y0 + 56 + k * 8, 12, 8);
      }
      ctx.fillStyle = '#6b7186';
      ctx.fillRect(-20, y0 - 8, 1000, 8);
      ctx.fillStyle = '#1c1424';
      ctx.fillRect(-20, y1, 1000, 8);
      // 果箱
      for (const c of this.crates) {
        PF.Ent.shadow(ctx, c.x, c.y, 64, 14);
        PF.Ent.drawSprite(ctx, crateSprite(c.f), c.x, c.y + 8);
        ctx.strokeStyle = 'rgba(255,255,255,0.35)';
        ctx.lineWidth = 4;
        ctx.setLineDash([12, 10]);
        ctx.beginPath();
        ctx.arc(c.x, c.y - 10, 80, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      // 纸箱
      for (const b of this.boxes) {
        PF.Ent.drawSprite(ctx, boxSprite(), b.x, b.y + 20);
        if (b.res === null) {
          // 需求气泡
          const by = b.y - 70 + Math.sin(this.time * 4 + b.x * 0.01) * 4;
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(b.x - 30, by - 30, 60, 56);
          ctx.fillStyle = OUT;
          ctx.fillRect(b.x - 30, by - 30, 60, 4);
          ctx.fillRect(b.x - 30, by + 22, 60, 4);
          ctx.fillRect(b.x - 30, by - 30, 4, 56);
          ctx.fillRect(b.x + 26, by - 30, 4, 56);
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(b.x - 6, by + 26, 12, 8);
          drawImg(ctx, fruitSprite(b.need), b.x, by - 2);
        } else {
          const s = 1 + Math.max(0, 0.4 - b.rt) * 2;
          drawImg(ctx, markSprite(b.res), b.x, b.y - 50, s);
        }
      }
      // 角色与手中水果
      this.avs
        .slice()
        .sort((a, b) => a.y - b.y)
        .forEach((a) => {
          a.draw(ctx, this.twoP);
          if (a.held >= 0) drawImg(ctx, fruitSprite(a.held), a.x, a.y - (this.twoP ? 168 : 140) + Math.sin(this.time * 6) * 3);
        });
      this.parts.draw(ctx);
    }
    drawHUD(ctx, W) {
      this.drawTitle(ctx);
      const left = this.total - this.correct - this.wrong;
      text(ctx, `剩余 ${left} 箱`, W / 2, 30, 22, '#fff', 'center');
      // ✓ 与 ✗
      const mk = markSprite(true);
      ctx.drawImage(mk, 14, 50, 26, 26);
      text(ctx, String(this.correct), 46, 64, 22, '#9be38a');
      const bad = markSprite(false);
      for (let k = 0; k < 3; k++) {
        ctx.globalAlpha = k < this.wrong ? 1 : 0.25;
        ctx.drawImage(bad, 82 + k * 30, 50, 26, 26);
      }
      ctx.globalAlpha = 1;
      if (this.phase === 'play') {
        const bl = 0.6 + Math.sin(this.time * 6) * 0.4;
        ctx.globalAlpha = bl;
        text(ctx, '方向是反的！', 14, 98, 18, '#9cc9ff');
        ctx.globalAlpha = 1;
      }
    }
  }

  PF.Mini = { danger: Danger, lost: Lost, number: NumberWorld, reversal: Reversal };
})();
