/* 像素美术：全部用代码逐像素绘制，启动时生成并缓存为离屏画布 */
(function () {
  'use strict';
  const PF = (window.PF = window.PF || {});
  const U = PF.U;

  const OUT = '#1c1424'; // 描边色

  function mk(w, h) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const x = c.getContext('2d');
    x.imageSmoothingEnabled = false;
    return { c, x, w, h };
  }

  /* 像素画布小工具 */
  class PC {
    constructor(w, h) {
      const m = mk(w, h);
      this.c = m.c;
      this.x = m.x;
      this.w = w;
      this.h = h;
    }
    p(i, j, col) {
      if (!col) return;
      this.x.fillStyle = col;
      this.x.fillRect(Math.round(i), Math.round(j), 1, 1);
    }
    r(i, j, w, h, col) {
      if (!col) return;
      this.x.fillStyle = col;
      this.x.fillRect(Math.round(i), Math.round(j), Math.round(w), Math.round(h));
    }
    circ(cx, cy, rad, col) {
      this.x.fillStyle = col;
      for (let j = Math.floor(cy - rad); j <= cy + rad; j++)
        for (let i = Math.floor(cx - rad); i <= cx + rad; i++) {
          const dx = i + 0.5 - cx,
            dy = j + 0.5 - cy;
          if (dx * dx + dy * dy <= rad * rad) this.x.fillRect(i, j, 1, 1);
        }
    }
    line(x0, y0, x1, y1, col) {
      x0 = Math.round(x0);
      y0 = Math.round(y0);
      x1 = Math.round(x1);
      y1 = Math.round(y1);
      const dx = Math.abs(x1 - x0),
        sx = x0 < x1 ? 1 : -1;
      const dy = -Math.abs(y1 - y0),
        sy = y0 < y1 ? 1 : -1;
      let err = dx + dy;
      this.x.fillStyle = col;
      for (;;) {
        this.x.fillRect(x0, y0, 1, 1);
        if (x0 === x1 && y0 === y1) break;
        const e2 = 2 * err;
        if (e2 >= dy) {
          err += dy;
          x0 += sx;
        }
        if (e2 <= dx) {
          err += dx;
          y0 += sy;
        }
      }
    }
    grid(rows, pal, ox, oy) {
      ox = ox || 0;
      oy = oy || 0;
      for (let j = 0; j < rows.length; j++)
        for (let i = 0; i < rows[j].length; i++) {
          const ch = rows[j][i];
          if (ch !== '.' && ch !== ' ' && pal[ch]) this.p(ox + i, oy + j, pal[ch]);
        }
    }
    outline(col) {
      const d = this.x.getImageData(0, 0, this.w, this.h);
      const a = d.data;
      const W = this.w,
        H = this.h;
      const solid = (i, j) => i >= 0 && j >= 0 && i < W && j < H && a[(j * W + i) * 4 + 3] > 40;
      const add = [];
      for (let j = 0; j < H; j++)
        for (let i = 0; i < W; i++) {
          if (solid(i, j)) continue;
          if (solid(i - 1, j) || solid(i + 1, j) || solid(i, j - 1) || solid(i, j + 1)) add.push(i, j);
        }
      this.x.fillStyle = col || OUT;
      for (let k = 0; k < add.length; k += 2) this.x.fillRect(add[k], add[k + 1], 1, 1);
      return this;
    }
    /* 给不透明像素按函数改色（做光影） */
    shade(fn) {
      const d = this.x.getImageData(0, 0, this.w, this.h);
      const a = d.data;
      for (let j = 0; j < this.h; j++)
        for (let i = 0; i < this.w; i++) {
          const k = (j * this.w + i) * 4;
          if (a[k + 3] < 10) continue;
          const col = fn(i, j, a[k], a[k + 1], a[k + 2]);
          if (col) {
            a[k] = col[0];
            a[k + 1] = col[1];
            a[k + 2] = col[2];
          }
        }
      this.x.putImageData(d, 0, 0);
      return this;
    }
  }

  const hex = (h) => {
    const n = parseInt(h.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };
  const mix = (a, b, t) => {
    const A = hex(a),
      B = hex(b);
    const r = (i) => Math.round(A[i] + (B[i] - A[i]) * t);
    return '#' + ((1 << 24) | (r(0) << 16) | (r(1) << 8) | r(2)).toString(16).slice(1);
  };

  const cache = new Map();
  function memo(key, fn) {
    let v = cache.get(key);
    if (!v) {
      v = fn();
      cache.set(key, v);
    }
    return v;
  }

  /* ---------------- 角色 ---------------- */
  // 皮肤：头/发/衣/裤/鞋 + 装饰
  const SKINS = [
    { // 0 熊猫人
      skin: '#f4f1ea', shirt: '#2b2a33', shirt2: '#f4f1ea', pants: '#2b2a33', shoe: '#17161c', eye: '#17161c',
      deco(p, f) {
        p.r(5, 1, 3, 3, '#2b2a33'); p.r(12, 1, 3, 3, '#2b2a33');
        p.r(9, 5, 2, 3, '#2b2a33'); p.r(12, 5, 3, 3, '#2b2a33');
        p.p(10, 6, '#ffffff'); p.p(13, 6, '#ffffff');
        p.r(10, 9, 2, 1, '#2b2a33');
        p.r(7, 12, 4, 4, '#f4f1ea');
      },
      noEyes: true,
    },
    { // 1 小呆
      skin: '#f2c69b', hair: '#5b3a24', shirt: '#ff8a3d', shirt2: '#ffb36b', pants: '#5d6b80', shoe: '#2c2f3a', eye: '#222',
      deco(p) {
        p.r(5, 1, 10, 3, '#3a7bd5'); p.r(4, 3, 12, 1, '#2a5fae'); p.r(9, 0, 2, 1, '#ffffff');
        p.p(9, 8, '#d9895f'); p.p(14, 8, '#d9895f');
        p.r(9, 11, 2, 2, '#ffb36b');
      },
    },
    { // 2 小龙
      skin: '#f2c69b', shirt: '#43a85a', shirt2: '#f6e7a6', pants: '#43a85a', shoe: '#2f6e3c', eye: '#222',
      deco(p) {
        p.r(4, 1, 12, 4, '#43a85a'); p.r(4, 4, 2, 6, '#43a85a'); p.r(14, 4, 2, 5, '#43a85a');
        p.r(5, 0, 2, 2, '#f6e7a6'); p.r(13, 0, 2, 2, '#f6e7a6'); p.p(5, -1, '#f6e7a6');
        p.r(7, 2, 1, 1, '#2f6e3c'); p.r(10, 2, 1, 1, '#2f6e3c');
        p.r(1, 16, 4, 2, '#43a85a'); p.r(0, 14, 2, 2, '#43a85a'); p.p(0, 13, '#f6e7a6');
        p.r(8, 12, 4, 4, '#f6e7a6');
      },
    },
    { // 3 樱妹
      skin: '#f7d2b4', hair: '#ff8fb8', shirt: '#ffffff', shirt2: '#ffc1d8', pants: '#ffc1d8', shoe: '#c94f7c', eye: '#3a2230',
      deco(p) {
        p.r(4, 1, 12, 3, '#ff8fb8'); p.r(4, 3, 2, 9, '#ff8fb8'); p.r(14, 3, 2, 5, '#ff8fb8'); p.r(6, 3, 3, 1, '#ff8fb8');
        p.r(5, 1, 3, 1, '#ffd0e2');
        p.p(15, 2, '#ffffff'); p.p(16, 1, '#ffffff'); p.p(16, 3, '#ffffff'); p.p(17, 2, '#ffffff'); p.p(16, 2, '#ffd23f');
        p.p(9, 8, '#ff9eb5'); p.p(14, 8, '#ff9eb5');
        p.r(6, 15, 8, 2, '#ffc1d8');
      },
    },
    { // 4 火火
      skin: '#f2c69b', hair: '#ff6a2a', shirt: '#d8342c', shirt2: '#ffb238', pants: '#3b3240', shoe: '#1d1820', eye: '#222',
      deco(p) {
        p.r(5, 2, 10, 2, '#ff6a2a'); p.r(4, 3, 3, 3, '#ff6a2a');
        p.r(5, 0, 2, 2, '#ffb238'); p.r(8, -1, 2, 3, '#ffb238'); p.r(11, 0, 2, 2, '#ffb238'); p.r(14, 1, 2, 2, '#ff6a2a');
        p.p(9, -2, '#ffe36b'); p.p(6, -1, '#ffe36b'); p.p(12, -1, '#ffe36b');
        p.r(9, 11, 2, 5, '#ffb238');
      },
    },
    { // 5 豆子
      skin: '#f2c69b', shirt: '#8a5a35', shirt2: '#5bbf4a', pants: '#8a5a35', shoe: '#4b2f1c', eye: '#222',
      deco(p) {
        p.r(4, 1, 12, 4, '#5bbf4a'); p.r(4, 4, 2, 7, '#5bbf4a'); p.r(14, 4, 2, 4, '#5bbf4a'); p.r(5, 1, 4, 1, '#8be06f');
        p.r(9, -2, 1, 3, '#3f8f3a'); p.r(10, -3, 3, 2, '#8be06f'); p.r(7, -2, 2, 1, '#8be06f');
        p.r(7, 11, 6, 2, '#5bbf4a');
      },
    },
    { // 6 绿野仙子
      skin: '#f7d9bf', hair: '#9be38a', shirt: '#f2fff0', shirt2: '#bdf2b0', pants: '#bdf2b0', shoe: '#5aa34f', eye: '#2c3a28',
      wings: true,
      deco(p) {
        p.r(4, 1, 12, 3, '#9be38a'); p.r(4, 3, 2, 8, '#9be38a'); p.r(14, 3, 2, 4, '#9be38a');
        p.p(6, 0, '#ffe36b'); p.p(9, -1, '#ff8fb8'); p.p(12, 0, '#ffe36b'); p.r(5, 1, 10, 1, '#5aa34f');
        p.p(9, 8, '#ffb0c0'); p.p(14, 8, '#ffb0c0');
        p.r(6, 15, 8, 2, '#bdf2b0');
      },
    },
    { // 7 未来机甲
      skin: '#c9d4e3', shirt: '#7c8aa3', shirt2: '#3fe0ff', pants: '#5a6680', shoe: '#2c3446', eye: '#3fe0ff',
      noEyes: true,
      deco(p) {
        p.r(4, 1, 12, 10, '#9fb0c8'); p.r(5, 2, 10, 2, '#c9d4e3');
        p.r(8, 5, 8, 3, '#18223a'); p.r(9, 6, 6, 1, '#3fe0ff'); p.p(15, 6, '#aaf3ff');
        p.r(9, -1, 1, 2, '#9fb0c8'); p.p(9, -2, '#ff5a4f');
        p.r(9, 12, 2, 2, '#3fe0ff'); p.r(4, 11, 2, 2, '#c9d4e3'); p.r(14, 11, 2, 2, '#c9d4e3');
      },
    },
  ];

  // 海盗外观
  const PIRATE_SKINS = [
    { // 小喽啰
      skin: '#e6b48a', shirt: '#f2f2f2', shirt2: '#3a5fae', pants: '#6b4a2f', shoe: '#2b1d14', eye: '#222',
      deco(p) {
        p.r(5, 1, 10, 3, '#d8342c'); p.r(4, 3, 3, 1, '#d8342c'); p.p(4, 4, '#d8342c'); p.p(3, 5, '#d8342c'); p.p(6, 2, '#ffffff'); p.p(10, 2, '#ffffff');
        p.r(10, 9, 5, 1, '#5b3a24');
        p.r(6, 12, 8, 1, '#3a5fae'); p.r(6, 14, 8, 1, '#3a5fae');
      },
    },
    { // 壮汉
      skin: '#d99c70', shirt: '#7a4a2a', shirt2: '#d99c70', pants: '#3b3240', shoe: '#1d1820', eye: '#222',
      deco(p) {
        p.r(5, 2, 10, 1, '#c98a5c');
        p.r(9, 8, 7, 4, '#5b3a24'); p.r(10, 12, 5, 2, '#5b3a24'); p.r(11, 9, 3, 1, '#a0522d');
        p.r(5, 4, 4, 1, '#3b2414'); p.r(12, 4, 3, 1, '#3b2414');
        p.r(8, 11, 4, 5, '#d99c70');
      },
    },
    { // 船长
      skin: '#e6b48a', shirt: '#b8232f', shirt2: '#ffd23f', pants: '#2b2a33', shoe: '#17161c', eye: '#222',
      deco(p) {
        p.r(3, 2, 14, 2, '#22202a'); p.r(5, -1, 10, 3, '#22202a'); p.r(3, 3, 14, 1, '#ffd23f'); p.r(8, 0, 3, 2, '#f2f2f2');
        p.r(14, -2, 2, 3, '#ff5a4f'); p.p(16, -3, '#ff5a4f');
        p.r(12, 6, 3, 2, '#17161c'); p.line(11, 5, 15, 4, '#17161c');
        p.r(9, 9, 6, 2, '#2b1d14');
        p.r(9, 11, 2, 5, '#ffd23f');
      },
    },
  ];

  /* 画一个 Q 版人物（朝右），frame: idle0/idle1/walk0..3 */
  function drawHuman(skinDef, frame) {
    const W = 22,
      H = 28,
      OY = 4; // 顶部留白，给帽子
    const p = new PC(W, H);
    const s = skinDef;
    const P = {
      p: (i, j, c) => p.p(i + 1, j + OY, c),
      r: (i, j, w, h, c) => p.r(i + 1, j + OY, w, h, c),
      line: (a, b, c2, d, col) => p.line(a + 1, b + OY, c2 + 1, d + OY, col),
    };
    let bob = 0,
      lA = 0,
      rA = 0,
      lL = 0,
      rL = 0;
    if (frame === 'idle1') bob = 1;
    if (frame === 'walk0') { lL = -1; rL = 1; lA = 1; rA = -1; }
    if (frame === 'walk1') { bob = 1; }
    if (frame === 'walk2') { lL = 1; rL = -1; lA = -1; rA = 1; }
    if (frame === 'walk3') { bob = 1; }
    if (s.wings) {
      P.r(0, 9 + bob, 5, 6, 'rgba(170,240,255,0.75)');
      P.r(1, 8 + bob, 3, 1, 'rgba(170,240,255,0.75)');
      P.r(1, 10 + bob, 2, 3, 'rgba(230,255,255,0.9)');
    }
    // 腿
    P.r(6 + lL, 17, 3, 4 - (frame === 'walk1' ? 1 : 0), s.pants);
    P.r(11 + rL, 17, 3, 4 - (frame === 'walk3' ? 1 : 0), s.pants);
    P.r(6 + lL, 21 - (frame === 'walk1' ? 1 : 0), 3, 2, s.shoe);
    P.r(11 + rL, 21 - (frame === 'walk3' ? 1 : 0), 3, 2, s.shoe);
    // 身体
    P.r(5, 11 + bob, 10, 6, s.shirt);
    P.r(5, 16 + bob, 10, 1, mix(s.shirt, '#000000', 0.25));
    // 手臂
    P.r(3, 11 + bob + lA, 2, 5, s.shirt);
    P.r(15, 11 + bob + rA, 2, 5, s.shirt);
    P.r(3, 16 + bob + lA, 2, 1, s.skin);
    P.r(15, 16 + bob + rA, 2, 1, s.skin);
    // 头
    P.r(4, 1 + bob, 12, 10, s.skin);
    P.r(4, 10 + bob, 12, 1, mix(s.skin, '#000000', 0.18));
    if (s.hair) {
      P.r(4, 1 + bob, 12, 3, s.hair);
      P.r(4, 4 + bob, 2, 3, s.hair);
    }
    if (!s.noEyes) {
      const blink = frame === 'idle1';
      P.r(10, 5 + bob + (blink ? 1 : 0), 1, blink ? 1 : 2, s.eye);
      P.r(13, 5 + bob + (blink ? 1 : 0), 1, blink ? 1 : 2, s.eye);
    }
    if (s.deco) {
      const B = {
        p: (i, j, c) => P.p(i, j + bob, c),
        r: (i, j, w, h, c) => P.r(i, j + bob, w, h, c),
        line: (a, b, c2, d, col) => P.line(a, b + bob, c2, d + bob, col),
      };
      s.deco(B, frame);
    }
    p.outline(OUT);
    return p.c;
  }

  /* 小精灵 */
  function drawSprite(frame, superMan) {
    const p = new PC(16, 18);
    const body = superMan ? '#b98cff' : '#6fd36a';
    const dark = superMan ? '#7b4fd1' : '#3f9a45';
    const light = superMan ? '#e6d4ff' : '#b7f59a';
    const bob = frame === 'idle1' || frame === 'walk1' || frame === 'walk3' ? 1 : 0;
    const legL = frame === 'walk0' ? -1 : frame === 'walk2' ? 1 : 0;
    p.r(5 + legL, 15, 2, 2, dark);
    p.r(9 - legL, 15, 2, 2, dark);
    p.circ(8, 10 + bob, 5.6, body);
    p.r(4, 12 + bob, 9, 3, dark);
    p.circ(6.5, 8 + bob, 2, light);
    p.r(9, 9 + bob, 1, 2, '#1c1424');
    p.r(12, 9 + bob, 1, 2, '#1c1424');
    p.p(13, 11 + bob, '#ff9eb5');
    // 头顶叶子
    p.r(8, 2 + bob, 1, 3, dark);
    p.r(9, 1 + bob, 3, 2, superMan ? '#ffd23f' : '#9be38a');
    p.r(5, 2 + bob, 3, 1, superMan ? '#ffd23f' : '#9be38a');
    if (superMan) {
      p.r(3, 0 + bob, 10, 1, 'rgba(255,230,120,0.9)');
    }
    p.outline(OUT);
    return p.c;
  }

  /* ---------------- 工具 ---------------- */
  const TOOL_DEF = {
    axe: { rows: ['....aaa', '...abba', '...abba', '..h.aa.', '.h.....', 'h......', 'h......'], pal: { a: '#9aa6b5', b: '#dfe7ef', h: '#8a5a35' } },
    sickle: { rows: ['..aaaa.', '.a...ba', '......a', '.....h.', '....h..', '...h...', '..h....'], pal: { a: '#cfd8e2', b: '#ffffff', h: '#8a5a35' } },
    pick: { rows: ['.aaaaa.', 'a..h..a', '...h...', '...h...', '...h...', '...h...', '...h...'], pal: { a: '#9aa6b5', h: '#8a5a35' } },
    sword: { rows: ['......b', '.....ba', '....ba.', '.g.ba..', '..gb...', '.hg....', 'h......'], pal: { a: '#cfd8e2', b: '#ffffff', g: '#ffd23f', h: '#6b4a2f' } },
    holy: { rows: ['......b', '.....bc', '....bc.', '.g.bc..', '..gb...', '.hg....', 'h......'], pal: { b: '#fffbd0', c: '#ffe36b', g: '#ffb238', h: '#6b4a2f' } },
    hammer: { rows: ['.aaa...', '.aaah..', '.aaa.h.', '......h', '.......', '.......', '.......'], pal: { a: '#9aa6b5', h: '#8a5a35' } },
    club: { rows: ['....aa.', '...aaaa', '...aaa.', '..h....', '.h.....', 'h......', '.......'], pal: { a: '#8a5a35', h: '#5b3a24' } },
    sabre: { rows: ['.....bb', '....ba.', '...ba..', '..ba...', '.ga....', 'hg.....', '.......'], pal: { a: '#cfd8e2', b: '#ffffff', g: '#ffd23f', h: '#5b3a24' } },
  };
  function drawTool(name) {
    const d = TOOL_DEF[name];
    const p = new PC(9, 9);
    p.grid(d.rows, d.pal, 1, 1);
    p.outline(OUT);
    return p.c;
  }

  /* ---------------- 资源点 ---------------- */
  function drawTree(big, variant, seed) {
    const W = big ? 34 : 24,
      H = big ? 42 : 30;
    const p = new PC(W, H);
    const rnd = U.rng(seed || 7);
    const cx = W / 2;
    // 树干
    const tw = big ? 6 : 4;
    const th = big ? 12 : 9;
    p.r(cx - tw / 2, H - th - 1, tw, th, '#7a4a2a');
    p.r(cx - tw / 2, H - th - 1, 2, th, '#9a6338');
    p.r(cx - tw / 2 - 1, H - 2, tw + 2, 1, '#6b4024');
    if (variant === 'pine') {
      const cols = ['#2f7a4f', '#3c9a5f', '#5cc07a'];
      const layers = big ? 4 : 3;
      for (let k = 0; k < layers; k++) {
        const y0 = (big ? 3 : 2) + k * (big ? 7 : 6);
        const hw = (big ? 6 : 4) + k * (big ? 3 : 2.2);
        for (let j = 0; j < (big ? 10 : 8); j++) {
          const w = (hw * (j + 2)) / (big ? 11 : 9);
          p.r(cx - w, y0 + j, w * 2, 1, j < 3 ? cols[2] : j < 6 ? cols[1] : cols[0]);
        }
      }
      p.r(cx - 1, 1, 2, 2, '#5cc07a');
    } else {
      const blobs = big
        ? [[cx, 13, 11], [cx - 7, 19, 8], [cx + 7, 19, 8], [cx, 7, 7], [cx - 4, 22, 7], [cx + 4, 22, 7]]
        : [[cx, 10, 8], [cx - 5, 14, 6], [cx + 5, 14, 6], [cx, 6, 5]];
      const leaf = variant === 'autumn' ? ['#b8562a', '#e07b33', '#f5a742', '#ffd27a'] : ['#2f6b2f', '#3f8f3a', '#5fb648', '#9ee06a'];
      for (const b of blobs) p.circ(b[0], b[1], b[2], leaf[1]);
      p.shade((i, j) => {
        let best = 9;
        for (const b of blobs) {
          const dx = i + 0.5 - (b[0] - b[2] * 0.35),
            dy = j + 0.5 - (b[1] - b[2] * 0.4);
          best = Math.min(best, Math.hypot(dx, dy) / b[2]);
        }
        if (j >= H - th - 1 && Math.abs(i + 0.5 - cx) < tw / 2 + 0.5 && j > (big ? 26 : 18)) return null;
        const n = U.hash(i, j, seed) * 0.25;
        const v = best + n;
        const col = v < 0.45 ? leaf[3] : v < 0.85 ? leaf[2] : v < 1.25 ? leaf[1] : leaf[0];
        return hex(col);
      });
      // 树叶小点
      for (let k = 0; k < (big ? 10 : 6); k++) {
        const b = blobs[Math.floor(rnd() * blobs.length)];
        const a = rnd() * Math.PI * 2;
        const rr = rnd() * b[2] * 0.8;
        p.p(b[0] + Math.cos(a) * rr, b[1] + Math.sin(a) * rr, leaf[0]);
      }
      if (variant === 'fruit') for (let k = 0; k < 4; k++) p.r(cx - 8 + rnd() * 16, 8 + rnd() * 14, 2, 2, '#ff4d4d');
    }
    p.outline(OUT);
    return p.c;
  }
  function drawStump(big) {
    const p = new PC(big ? 16 : 12, big ? 10 : 8);
    const w = big ? 10 : 7;
    const x0 = (p.w - w) / 2;
    p.r(x0, 3, w, p.h - 4, '#7a4a2a');
    p.r(x0, 2, w, 2, '#d9a066');
    p.r(x0 + 2, 2, w - 4, 1, '#b07a45');
    p.r(x0 - 1, p.h - 2, w + 2, 1, '#6b4024');
    p.r(x0 + w - 1, 0, 1, 2, '#5fb648');
    p.p(x0 + w, 0, '#9ee06a');
    p.outline(OUT);
    return p.c;
  }
  function drawRice(big, seed) {
    const W = big ? 24 : 16,
      H = big ? 24 : 18;
    const p = new PC(W, H);
    const rnd = U.rng(seed || 3);
    const n = big ? 9 : 5;
    p.r(2, H - 3, W - 4, 2, '#6b8f2f');
    for (let k = 0; k < n; k++) {
      const x = 3 + ((W - 6) * (k + 0.5)) / n + (rnd() - 0.5) * 2;
      const top = 3 + rnd() * (big ? 6 : 4);
      const lean = rnd() < 0.5 ? -1 : 1;
      p.line(x, H - 2, x + lean, top + 3, '#5f9a2f');
      p.line(x - 1, H - 3, x - 3, H - 8, '#7dbb3a');
      // 稻穗
      for (let j = 0; j < (big ? 6 : 4); j++) {
        p.p(x + lean + (j > 2 ? lean : 0), top + j, j % 2 ? '#e8c55a' : '#f6dc7a');
        p.p(x + lean + 1 + (j > 2 ? lean : 0), top + j + 1, '#c9a23e');
      }
    }
    p.outline(OUT);
    return p.c;
  }
  function drawStubble(big) {
    const p = new PC(big ? 20 : 14, 8);
    for (let k = 0; k < (big ? 7 : 4); k++) {
      const x = 2 + k * 2.4;
      p.line(x, 6, x, 3 + (k % 2), '#b59a4a');
    }
    p.r(1, 6, p.w - 2, 1, '#6b8f2f');
    p.outline(OUT);
    return p.c;
  }
  function drawCrystal(big, seed) {
    const W = big ? 26 : 18,
      H = big ? 28 : 20;
    const p = new PC(W, H);
    const rnd = U.rng(seed || 5);
    // 底座岩石
    p.circ(W / 2, H - 4, big ? 9 : 6.5, '#7b7690');
    p.r(2, H - 4, W - 4, 3, '#6a6580');
    const prisms = big
      ? [[W / 2, 3, 5, H - 5], [W / 2 - 6, 9, 4, H - 4], [W / 2 + 6, 8, 4, H - 4], [W / 2 + 2, 13, 3, H - 3]]
      : [[W / 2, 3, 4, H - 4], [W / 2 - 4, 8, 3, H - 3], [W / 2 + 4, 9, 3, H - 3]];
    for (const pr of prisms) {
      const [x, top, hw, bot] = pr;
      for (let j = top; j < bot; j++) {
        const t = Math.min(1, (j - top) / 3);
        const w = Math.max(1, Math.round(hw * t));
        p.r(x - w, j, w, 1, '#c79bff');
        p.r(x, j, w, 1, '#8a55e0');
        if (j > top + 1) p.p(x - w, j, '#efdcff');
      }
      p.p(x - 1, top + 1, '#ffffff');
    }
    for (let k = 0; k < 3; k++) p.p(3 + rnd() * (W - 6), H - 4 + rnd() * 2, '#c79bff');
    p.outline(OUT);
    return p.c;
  }
  function drawRubble(big) {
    const p = new PC(big ? 18 : 14, 9);
    p.circ(p.w / 2, 6, big ? 6 : 4.5, '#7b7690');
    p.r(p.w / 2 - 2, 3, 2, 2, '#9b6cf0');
    p.p(p.w / 2 + 2, 4, '#c79bff');
    p.outline(OUT);
    return p.c;
  }

  /* ---------------- 建筑 ---------------- */
  function roof(p, x, y, w, h, c1, c2, c3) {
    for (let j = 0; j < h; j++) {
      const inset = Math.round(((h - j) * 3) / h);
      p.r(x - 2 + inset, y + j, w + 4 - inset * 2, 1, j % 3 === 0 ? c3 : j % 2 ? c1 : c2);
    }
  }
  function drawCamp() {
    const p = new PC(48, 42);
    // 大帐篷
    const cx = 24;
    for (let j = 0; j < 26; j++) {
      const hw = 3 + j * 0.78;
      for (let i = Math.round(cx - hw); i < cx + hw; i++) {
        const stripe = Math.floor((i - cx + 30) / 4) % 2 === 0;
        p.p(i, 12 + j, i < cx ? (stripe ? '#f2e6c9' : '#e2553f') : stripe ? '#dccfae' : '#c4432f');
      }
    }
    // 门帘
    for (let j = 0; j < 12; j++) {
      const hw = 1 + j * 0.45;
      p.r(cx - hw, 26 + j, hw * 2, 1, '#3b2414');
    }
    p.r(cx - 1, 26, 2, 12, '#5b3a24');
    // 旗杆与旗
    p.r(cx - 0.5, 2, 1, 11, '#6b4a2f');
    p.r(cx + 0.5, 2, 8, 5, '#3fbf5a');
    p.r(cx + 0.5, 4, 8, 1, '#8be06f');
    p.p(cx + 4, 3, '#ffffff');
    // 木桩
    p.r(2, 34, 3, 4, '#7a4a2a');
    p.r(43, 34, 3, 4, '#7a4a2a');
    p.line(4, 34, 12, 26, '#c9b48a');
    p.line(44, 34, 36, 26, '#c9b48a');
    p.outline(OUT);
    return p.c;
  }
  function drawLumber() {
    const p = new PC(46, 40);
    // 木屋
    p.r(8, 16, 30, 20, '#b07a45');
    for (let j = 16; j < 36; j += 3) p.r(8, j, 30, 1, '#8a5a35');
    roof(p, 7, 6, 32, 11, '#7a3f22', '#8f4a28', '#5e2f19');
    p.r(19, 25, 8, 11, '#5b3a24');
    p.r(22, 25, 1, 11, '#3b2414');
    p.r(11, 20, 5, 4, '#ffe9a8');
    p.r(13, 20, 1, 4, '#8a5a35');
    // 圆木堆
    for (let k = 0; k < 3; k++) {
      p.r(36 + 0, 26 + k * 4, 9, 4, '#8a5a35');
      p.circ(44, 28 + k * 4, 2, '#d9a066');
    }
    p.r(38, 22, 7, 4, '#8a5a35');
    p.circ(44, 24, 2, '#d9a066');
    // 树桩+斧
    p.r(1, 31, 7, 5, '#7a4a2a');
    p.r(1, 30, 7, 2, '#d9a066');
    p.line(4, 29, 7, 24, '#8a5a35');
    p.r(6, 22, 3, 3, '#9aa6b5');
    p.outline(OUT);
    return p.c;
  }
  function drawGranary() {
    const p = new PC(44, 44);
    // 谷仓
    p.r(6, 18, 26, 22, '#c94040');
    for (let i = 6; i < 32; i += 3) p.r(i, 18, 1, 22, '#a83232');
    roof(p, 5, 9, 28, 10, '#f2e6c9', '#e8dcc0', '#d1c5a8');
    p.r(13, 26, 12, 14, '#7a2a2a');
    p.line(13, 26, 24, 39, '#f2e6c9');
    p.line(24, 26, 13, 39, '#f2e6c9');
    p.r(13, 26, 12, 1, '#f2e6c9');
    p.r(16, 13, 6, 4, '#3b2414');
    // 筒仓
    p.r(32, 10, 10, 30, '#d9d2c2');
    for (let j = 12; j < 40; j += 4) p.r(32, j, 10, 1, '#b5ad9b');
    p.circ(37, 10, 5, '#9aa6b5');
    p.r(32, 10, 10, 2, '#9aa6b5');
    // 稻草堆
    p.circ(5, 38, 4, '#e8c55a');
    p.r(1, 38, 9, 3, '#e8c55a');
    p.line(2, 37, 8, 36, '#c9a23e');
    p.outline(OUT);
    return p.c;
  }
  function drawMine() {
    const p = new PC(46, 40);
    // 石屋
    p.r(6, 16, 30, 20, '#8f8aa6');
    for (let j = 16; j < 36; j += 4)
      for (let i = 6 + ((j / 4) % 2) * 3; i < 36; i += 6) p.r(i, j, 5, 3, '#a7a2bd');
    roof(p, 5, 7, 32, 10, '#4b3f6b', '#5a4d80', '#3a3058');
    p.r(17, 24, 9, 12, '#2c2440');
    p.r(17, 24, 9, 2, '#6a5f8c');
    // 屋顶水晶
    p.r(26, 0, 3, 8, '#c79bff');
    p.r(29, 2, 2, 6, '#8a55e0');
    p.r(23, 3, 3, 5, '#c79bff');
    p.p(27, 1, '#ffffff');
    // 矿车
    p.r(35, 30, 10, 6, '#6b6f7a');
    p.r(35, 30, 10, 1, '#9aa6b5');
    p.circ(37, 37, 1.6, '#2c2f3a');
    p.circ(43, 37, 1.6, '#2c2f3a');
    p.r(36, 27, 3, 3, '#c79bff');
    p.r(40, 28, 3, 2, '#8a55e0');
    p.outline(OUT);
    return p.c;
  }
  function drawShop() {
    const p = new PC(46, 38);
    // 摊位
    p.r(5, 20, 36, 14, '#b07a45');
    p.r(5, 20, 36, 2, '#d9a066');
    p.r(6, 8, 2, 26, '#6b4a2f');
    p.r(38, 8, 2, 26, '#6b4a2f');
    // 条纹雨棚
    for (let i = 0; i < 40; i++) {
      const col = Math.floor(i / 5) % 2 ? '#ffffff' : '#3f8cff';
      p.r(3 + i, 5, 1, 6, col);
      p.p(3 + i, 11 + (i % 5 === 2 ? 1 : 0), col);
    }
    p.r(3, 4, 40, 1, '#2a5fae');
    // 货物
    p.circ(12, 18, 2.5, '#ff5a4f');
    p.circ(16, 18, 2.5, '#ff8c2e');
    p.r(21, 15, 6, 5, '#e8c55a');
    p.r(29, 16, 3, 4, '#c79bff');
    p.r(33, 15, 4, 5, '#ffd23f');
    p.r(34, 16, 2, 1, '#fff4b0');
    // 招牌
    p.r(17, 25, 12, 7, '#f2e6c9');
    p.r(21, 27, 4, 1, '#3b2414');
    p.r(22, 26, 2, 5, '#3b2414');
    p.r(20, 29, 6, 1, '#3b2414');
    // 木箱
    p.r(0, 28, 6, 6, '#8a5a35');
    p.line(0, 28, 5, 33, '#5b3a24');
    p.outline(OUT);
    return p.c;
  }
  function drawSite() {
    const p = new PC(40, 34);
    // 脚手架
    for (const x of [6, 18, 30]) p.r(x, 6, 2, 24, '#c9a26a');
    p.r(4, 10, 32, 2, '#c9a26a');
    p.r(4, 20, 32, 2, '#c9a26a');
    p.line(8, 12, 18, 20, '#a8844f');
    p.line(20, 12, 30, 20, '#a8844f');
    // 木板堆
    p.r(2, 28, 16, 3, '#b07a45');
    p.r(4, 25, 14, 3, '#d9a066');
    // 告示牌
    p.r(24, 22, 14, 9, '#f2e6c9');
    p.r(30, 30, 2, 4, '#6b4a2f');
    p.r(26, 24, 10, 1, '#8a5a35');
    p.r(26, 26, 8, 1, '#8a5a35');
    p.r(26, 28, 9, 1, '#8a5a35');
    p.outline(OUT);
    return p.c;
  }
  function drawChest(open) {
    const p = new PC(18, 16);
    if (open) {
      p.r(2, 2, 14, 4, '#8a5a35');
      p.r(2, 2, 14, 1, '#b07a45');
      p.r(3, 6, 12, 2, '#ffd23f');
      p.p(5, 6, '#fff4b0');
      p.p(10, 5, '#fff4b0');
    } else {
      p.r(2, 4, 14, 5, '#a8693a');
      p.r(2, 4, 14, 1, '#c98a4b');
      p.r(2, 8, 14, 1, '#7a4a2a');
    }
    p.r(2, 8, 14, 7, '#8a5a35');
    p.r(2, 8, 14, 1, '#b07a45');
    p.r(2, 8, 2, 7, '#ffd23f');
    p.r(14, 8, 2, 7, '#ffd23f');
    p.r(8, open ? 8 : 7, 2, 3, '#ffd23f');
    p.outline(OUT);
    return p.c;
  }
  function drawPortal(color, frame) {
    const p = new PC(40, 44);
    // 石拱门
    const stone = '#8f8aa6',
      stoneD = '#6f6a86',
      stoneL = '#b7b2cc';
    for (let a = 0; a <= 180; a += 2) {
      const rad = (a * Math.PI) / 180;
      for (let r = 14; r < 19; r++) {
        const x = 20 + Math.cos(rad) * r;
        const y = 22 - Math.sin(rad) * r;
        p.p(x, y, r === 14 ? stoneD : r === 18 ? stoneD : (Math.floor(a / 20) + r) % 3 ? stone : stoneL);
      }
    }
    p.r(1, 22, 5, 18, stone);
    p.r(34, 22, 5, 18, stone);
    p.r(1, 22, 5, 1, stoneL);
    p.r(34, 22, 5, 1, stoneL);
    for (let j = 24; j < 40; j += 4) {
      p.r(1, j, 5, 1, stoneD);
      p.r(34, j, 5, 1, stoneD);
    }
    p.r(0, 40, 40, 3, stoneD);
    // 漩涡
    const col2 = mix(color, '#ffffff', 0.55);
    const col3 = mix(color, '#000000', 0.35);
    for (let j = 6; j < 40; j++)
      for (let i = 6; i < 34; i++) {
        const dx = i + 0.5 - 20,
          dy = j + 0.5 - 22;
        const rr = Math.hypot(dx, dy / 1.05);
        if (rr > 13.5 && j < 23) continue;
        if (j >= 23 && (i < 6 || i > 33)) continue;
        const ang = Math.atan2(dy, dx) + rr * 0.35 - frame * 0.9;
        const v = Math.sin(ang * 3) * 0.5 + 0.5;
        p.p(i, j, rr < 3 ? '#ffffff' : v > 0.7 ? col2 : v > 0.35 ? color : col3);
      }
    p.outline(OUT);
    return p.c;
  }
  function drawShip() {
    const p = new PC(70, 56);
    // 船身
    for (let j = 0; j < 14; j++) {
      const inset = Math.round(j * j * 0.06);
      p.r(4 + inset, 36 + j, 62 - inset * 2, 1, j < 3 ? '#8a5a35' : j % 4 === 0 ? '#5b3a24' : '#6b4024');
    }
    p.r(2, 34, 66, 3, '#3b2414');
    for (let i = 10; i < 60; i += 10) p.circ(i, 42, 1.5, '#2b1d14');
    // 桅杆
    p.r(34, 2, 3, 34, '#5b3a24');
    // 帆
    for (let j = 0; j < 22; j++) {
      const w = 18 + Math.sin((j / 22) * Math.PI) * 4;
      p.r(35 - w, 6 + j, w * 2, 1, j % 6 === 0 ? '#2c2a36' : '#3a3746');
    }
    // 旗上的骷髅
    p.r(30, 12, 10, 8, '#f2f2f2');
    p.r(32, 14, 2, 2, '#22202a');
    p.r(36, 14, 2, 2, '#22202a');
    p.r(32, 19, 6, 3, '#f2f2f2');
    p.p(33, 21, '#22202a');
    p.p(36, 21, '#22202a');
    p.r(34, 0, 10, 3, '#d8342c');
    p.outline(OUT);
    return p.c;
  }
  function drawRaft(sail) {
    const p = new PC(36, 34);
    for (let k = 0; k < 6; k++) {
      p.r(2 + k * 5.5, 22, 5, 10, k % 2 ? '#a8693a' : '#c98a4b');
      p.r(2 + k * 5.5, 22, 5, 1, '#d9a066');
    }
    p.r(1, 24, 34, 1, '#6b4024');
    p.r(1, 29, 34, 1, '#6b4024');
    if (sail) {
      p.r(17, 2, 2, 21, '#6b4a2f');
      for (let j = 0; j < 15; j++) p.r(19, 4 + j, 12 - Math.abs(j - 7) * 0.8, 1, j % 5 === 0 ? '#e6dcc4' : '#f6efdc');
      p.r(19, 9, 6, 1, '#3fbf5a');
    }
    p.outline(OUT);
    return p.c;
  }
  function drawDockSite() {
    const p = new PC(36, 24);
    // 木桩与半成品木筏
    for (const x of [3, 15, 27]) p.r(x, 4, 3, 16, '#7a4a2a');
    for (let k = 0; k < 4; k++) p.r(6 + k * 5.5, 12, 5, 8, k % 2 ? '#a8693a' : '#c98a4b');
    p.r(4, 2, 28, 3, '#f2e6c9');
    p.r(8, 3, 20, 1, '#8a5a35');
    p.outline(OUT);
    return p.c;
  }

  /* ---------------- 动物 ---------------- */
  function drawGull(frame) {
    const p = new PC(16, 9);
    const up = frame % 2 === 0;
    p.r(6, 4, 5, 3, '#ffffff');
    p.r(10, 3, 3, 2, '#ffffff');
    p.p(13, 4, '#ffb238');
    p.p(11, 3, '#1c1424');
    if (up) {
      p.line(7, 4, 2, 0, '#e8eef4');
      p.line(9, 4, 13, 0, '#e8eef4');
    } else {
      p.line(7, 5, 1, 7, '#e8eef4');
      p.line(9, 5, 15, 7, '#e8eef4');
    }
    p.outline(OUT);
    return p.c;
  }
  function drawCrab(frame) {
    const p = new PC(14, 9);
    p.r(3, 3, 8, 4, '#ff6a3d');
    p.r(4, 2, 6, 1, '#ff8a5c');
    p.p(5, 1, '#1c1424');
    p.p(8, 1, '#1c1424');
    p.r(0, frame ? 1 : 2, 3, 2, '#ff6a3d');
    p.r(11, frame ? 2 : 1, 3, 2, '#ff6a3d');
    for (let k = 0; k < 3; k++) {
      p.p(3 + k * 3, 7 + ((k + frame) % 2), '#d8492c');
    }
    p.outline(OUT);
    return p.c;
  }
  function drawFin() {
    const p = new PC(10, 7);
    for (let j = 0; j < 6; j++) p.r(5 - j * 0.3, j, 1 + j * 0.9, 1, j < 2 ? '#7d8ea3' : '#5d6e85');
    return p.c;
  }

  /* ---------------- 图标 ---------------- */
  function drawIcon(kind) {
    const p = new PC(12, 12);
    switch (kind) {
      case 0: // 木材
        p.r(1, 5, 9, 5, '#8a5a35');
        p.r(1, 5, 9, 1, '#b07a45');
        p.circ(9.5, 7.5, 2.6, '#d9a066');
        p.p(9, 7, '#a8693a');
        p.r(3, 2, 7, 3, '#a8693a');
        p.circ(10, 3.5, 1.6, '#d9a066');
        break;
      case 1: // 水稻
        for (let k = 0; k < 4; k++) p.line(3 + k * 2, 11, 4 + k * 2, 4, '#5f9a2f');
        for (let k = 0; k < 4; k++) {
          p.r(4 + k * 2, 1 + (k % 2), 2, 4, '#f6dc7a');
          p.p(5 + k * 2, 2 + (k % 2), '#c9a23e');
        }
        p.r(2, 7, 9, 2, '#c9a23e');
        break;
      case 2: // 紫水晶
        p.r(4, 2, 4, 9, '#8a55e0');
        p.r(4, 2, 2, 9, '#c79bff');
        p.r(1, 6, 3, 5, '#8a55e0');
        p.r(8, 5, 3, 6, '#c79bff');
        p.p(5, 3, '#ffffff');
        break;
      case 3: // 金币
        p.circ(6, 6, 5, '#ffb238');
        p.circ(6, 6, 4, '#ffd23f');
        p.r(5, 3, 2, 6, '#fff4b0');
        p.r(4, 4, 1, 4, '#e09a1f');
        break;
      case 4: // 爱心
        p.grid(['.rr.rr.', 'rwrrrrr', 'rrrrrrr', '.rrrrr.', '..rrr..', '...r...'], { r: '#ff4d5e', w: '#ffffff' }, 2, 3);
        break;
      case 5: // 精灵
        p.circ(6, 7, 4, '#6fd36a');
        p.r(6, 2, 1, 2, '#3f9a45');
        p.r(7, 1, 3, 2, '#9be38a');
        p.r(6, 6, 1, 2, '#1c1424');
        p.r(8, 6, 1, 2, '#1c1424');
        break;
      case 6: // 骷髅（海盗）
        p.circ(6, 5, 4, '#f2f2f2');
        p.r(4, 8, 5, 3, '#f2f2f2');
        p.r(4, 4, 2, 2, '#22202a');
        p.r(7, 4, 2, 2, '#22202a');
        p.p(5, 10, '#22202a');
        p.p(7, 10, '#22202a');
        break;
      case 7: // 地块
        p.r(1, 3, 10, 6, '#5fb648');
        p.r(1, 9, 10, 2, '#8a5a35');
        p.r(3, 4, 2, 1, '#9ee06a');
        break;
    }
    p.outline(OUT);
    return p.c;
  }

  /* ---------------- 地面 / 海 / 雾 ---------------- */
  const BIOME = {
    meadow: { a: '#79c850', b: '#6dbb47', spot: '#5aa83c', light: '#9ad96b', deco: 'flower' },
    forest: { a: '#4f9a3f', b: '#478f39', spot: '#3c7f31', light: '#68b553', deco: 'leaf' },
    farm: { a: '#a6cf55', b: '#9ac34d', spot: '#86b03f', light: '#c0e070', deco: 'dirt' },
    rock: { a: '#8d87a9', b: '#827c9e', spot: '#6f6a8b', light: '#a7a2c0', deco: 'pebble' },
    snow: { a: '#eaf2f8', b: '#dfe9f2', spot: '#c4d4e3', light: '#ffffff', deco: 'ice' },
    sand: { a: '#f0d796', b: '#e7cc86', spot: '#d7b56c', light: '#fbe9b8', deco: 'shell' },
  };
  function drawGround(biome, seed) {
    const B = BIOME[biome] || BIOME.meadow;
    const S = 88;
    const p = new PC(S, S);
    const rnd = U.rng(seed);
    const sq = 11;
    for (let j = 0; j < S; j++)
      for (let i = 0; i < S; i++) {
        const chk = (Math.floor(i / sq) + Math.floor(j / sq)) % 2;
        let col = chk ? B.a : B.b;
        const n = U.hash(i, j, seed);
        if (n < 0.05) col = B.spot;
        else if (n > 0.975) col = B.light;
        p.p(i, j, col);
      }
    // 装饰
    const N = biome === 'forest' ? 26 : 18;
    for (let k = 0; k < N; k++) {
      const x = Math.floor(rnd() * (S - 6)) + 3;
      const y = Math.floor(rnd() * (S - 6)) + 3;
      switch (B.deco) {
        case 'flower': {
          const r = rnd();
          if (r < 0.55) {
            p.p(x, y, B.spot);
            p.p(x + 2, y, B.spot);
            p.p(x + 1, y + 1, B.spot);
          } else {
            const fc = U.pick(['#ffffff', '#ffe36b', '#ff9eb5', '#a8d8ff']);
            p.p(x, y - 1, fc);
            p.p(x - 1, y, fc);
            p.p(x + 1, y, fc);
            p.p(x, y + 1, fc);
            p.p(x, y, '#ffd23f');
          }
          break;
        }
        case 'leaf':
          p.p(x, y, rnd() < 0.5 ? '#2f6b2f' : '#6b8f2f');
          p.p(x + 1, y, B.spot);
          if (rnd() < 0.12) {
            p.r(x, y, 3, 1, '#d8342c');
            p.p(x + 1, y + 1, '#f2e6c9');
          }
          break;
        case 'dirt':
          if (rnd() < 0.5) p.r(x, y, 4, 1, '#c2a565');
          else {
            p.p(x, y, B.spot);
            p.p(x + 1, y - 1, B.spot);
          }
          break;
        case 'pebble':
          p.r(x, y, 2, 2, '#6f6a8b');
          p.p(x, y, '#b7b2cc');
          if (rnd() < 0.2) p.p(x + 3, y + 1, '#c79bff');
          break;
        case 'ice':
          p.r(x, y, 3, 1, '#c4d4e3');
          if (rnd() < 0.3) p.p(x + 1, y - 1, '#ffffff');
          break;
        case 'shell':
          p.p(x, y, '#ffffff');
          p.p(x + 1, y, '#ffb3a8');
          break;
      }
    }
    return p.c;
  }
  /* 地块下边缘的悬崖 */
  function drawCliff(biome) {
    const B = BIOME[biome] || BIOME.meadow;
    const p = new PC(88, 14);
    const dirt = biome === 'snow' ? ['#9fb3c6', '#8299b0', '#6c849c'] : biome === 'rock' ? ['#6f6a8b', '#5c5878', '#4b4766'] : ['#9a6338', '#7a4a2a', '#5e3820'];
    for (let i = 0; i < 88; i++) {
      const lip = 2 + (U.hash(i, 1, 9) < 0.3 ? 1 : 0);
      p.r(i, 0, 1, lip, B.b);
      for (let j = lip; j < 12; j++) {
        const n = U.hash(i, j, 3);
        p.p(i, j, j < 6 ? (n < 0.1 ? dirt[2] : dirt[0]) : n < 0.15 ? dirt[0] : dirt[1]);
      }
      p.p(i, 12, dirt[2]);
    }
    for (let k = 0; k < 9; k++) {
      const x = Math.floor(U.hash(k, 7, 2) * 84) + 2;
      p.r(x, 5 + (k % 4), 3, 2, '#8a8a99');
      p.p(x, 5 + (k % 4), '#b0b0bf');
    }
    return p.c;
  }
  function drawSea(frame) {
    const S = 64;
    const p = new PC(S, S);
    p.r(0, 0, S, S, '#2f8fc0');
    for (let k = 0; k < 40; k++) {
      const x = Math.floor(U.hash(k, 1, 11) * S);
      const y = Math.floor(U.hash(k, 2, 11) * S);
      const ph = (frame + k) % 3;
      if (ph === 0) p.r(x, y, 4, 1, '#58b4df');
      else if (ph === 1) {
        p.r(x + 1, y, 3, 1, '#58b4df');
        p.p(x, y + 1, '#3d9fcf');
      } else p.r(x, y, 2, 1, '#7fcbea');
    }
    for (let k = 0; k < 14; k++) {
      const x = Math.floor(U.hash(k, 5, 12) * S);
      const y = Math.floor(U.hash(k, 6, 12) * S);
      p.r(x, y, 3, 2, '#2a80b0');
    }
    return p.c;
  }
  function drawCloud(v) {
    const W = 34,
      H = 24;
    const p = new PC(W, H);
    const blobs = [
      [[10, 14, 8], [20, 11, 9], [27, 15, 6], [16, 17, 7]],
      [[9, 13, 7], [17, 10, 8], [25, 13, 7], [18, 17, 7]],
      [[12, 12, 9], [22, 14, 8], [8, 17, 6], [26, 18, 5]],
    ][v % 3];
    for (const b of blobs) p.circ(b[0], b[1], b[2], '#dfe5f0');
    p.shade((i, j) => {
      let best = 9;
      for (const b of blobs) best = Math.min(best, Math.hypot(i + 0.5 - (b[0] - 2), j + 0.5 - (b[1] - 3)) / b[2]);
      return hex(best < 0.5 ? '#ffffff' : best < 0.9 ? '#eef2f8' : best < 1.2 ? '#d6deeb' : '#bcc7da');
    });
    return p.c;
  }
  function drawFoam(frame) {
    const p = new PC(88, 4);
    for (let i = 0; i < 88; i++) {
      const v = Math.sin((i + frame * 5) * 0.45) + Math.sin(i * 0.17 + frame);
      if (v > 0.4) p.p(i, 1, 'rgba(255,255,255,0.85)');
      if (v > 1.1) p.p(i, 2, 'rgba(255,255,255,0.6)');
      if (v < -1.2) p.p(i, 0, 'rgba(255,255,255,0.5)');
    }
    return p.c;
  }

  /* 新大陆（俯视，海岸朝向岛屿一侧）——按方向生成 */
  function drawMainland(dir, lenTiles) {
    const L = lenTiles * 88,
      D = 3 * 88;
    const horiz = dir === 0 || dir === 1;
    const W = horiz ? L : D,
      H = horiz ? D : L;
    const p = new PC(W, H);
    const rnd = U.rng(dir * 97 + 5);
    // 离岸距离：海岸在靠近岛屿那一侧
    const coastDist = (i, j) => {
      const wob = Math.sin((horiz ? i : j) * 0.07) * 5 + Math.sin((horiz ? i : j) * 0.19) * 3;
      if (dir === 0) return H - j - 14 + wob; // 大陆在上，海岸在下
      if (dir === 1) return j - 14 + wob;
      if (dir === 2) return W - i - 14 + wob;
      return i - 14 + wob;
    };
    for (let j = 0; j < H; j++)
      for (let i = 0; i < W; i++) {
        const d = coastDist(i, j);
        if (d < 0) continue;
        const n = U.hash(i, j, 77);
        let col;
        if (d < 10) col = n < 0.08 ? '#d7b56c' : '#f0d796';
        else if (d < 12) col = '#c9b07a';
        else col = (Math.floor(i / 11) + Math.floor(j / 11)) % 2 ? '#6fbf4a' : '#66b444';
        if (d >= 12 && n > 0.985) col = '#9ad96b';
        p.p(i, j, col);
      }
    return { canvas: p.c, rnd };
  }

  /* 角色帧缓存 */
  const S = {
    PC,
    mix,
    hex,
    SKINS,
    PIRATE_SKINS,
    BIOME,
    human(skinId, frame) {
      return memo('h' + skinId + frame, () => drawHuman(SKINS[skinId], frame));
    },
    pirate(kind, frame) {
      return memo('p' + kind + frame, () => drawHuman(PIRATE_SKINS[kind], frame));
    },
    worker(frame, sup) {
      return memo('w' + frame + (sup ? 's' : ''), () => drawSprite(frame, sup));
    },
    tool(name) {
      return memo('t' + name, () => drawTool(name));
    },
    tree(big, variant, seedIdx) {
      return memo('tr' + big + variant + seedIdx, () => drawTree(big, variant, 100 + seedIdx * 13 + (big ? 7 : 0)));
    },
    stump(big) {
      return memo('st' + big, () => drawStump(big));
    },
    rice(big, seedIdx) {
      return memo('ri' + big + seedIdx, () => drawRice(big, 50 + seedIdx * 7));
    },
    stubble(big) {
      return memo('sb' + big, () => drawStubble(big));
    },
    crystal(big, seedIdx) {
      return memo('cr' + big + seedIdx, () => drawCrystal(big, 30 + seedIdx * 5));
    },
    rubble(big) {
      return memo('rb' + big, () => drawRubble(big));
    },
    building(kind) {
      return memo('b' + kind, () => {
        switch (kind) {
          case 'camp': return drawCamp();
          case 'wood': return drawLumber();
          case 'rice': return drawGranary();
          case 'crystal': return drawMine();
          case 'shop': return drawShop();
          case 'site': return drawSite();
          case 'dockSite': return drawDockSite();
        }
      });
    },
    chest(open) {
      return memo('ch' + open, () => drawChest(open));
    },
    portal(color, frame) {
      return memo('po' + color + frame, () => drawPortal(color, frame));
    },
    ship() {
      return memo('ship', drawShip);
    },
    raft(sail) {
      return memo('raft' + sail, () => drawRaft(sail));
    },
    gull(f) {
      return memo('gull' + f, () => drawGull(f));
    },
    crab(f) {
      return memo('crab' + f, () => drawCrab(f));
    },
    fin() {
      return memo('fin', drawFin);
    },
    icon(k) {
      return memo('ic' + k, () => drawIcon(k));
    },
    iconURL(k, scale) {
      return memo('icu' + k + '_' + (scale || 3), () => {
        const src = drawIcon(k);
        const s = scale || 3;
        const m = mk(src.width * s, src.height * s);
        m.x.imageSmoothingEnabled = false;
        m.x.drawImage(src, 0, 0, m.w, m.h);
        return m.c.toDataURL();
      });
    },
    spriteURL(canvas, scale) {
      const s = scale || 3;
      const m = mk(canvas.width * s, canvas.height * s);
      m.x.imageSmoothingEnabled = false;
      m.x.drawImage(canvas, 0, 0, m.w, m.h);
      return m.c.toDataURL();
    },
    ground: drawGround,
    cliff(biome) {
      return memo('cl' + biome, () => drawCliff(biome));
    },
    sea(f) {
      return memo('sea' + f, () => drawSea(f));
    },
    cloud(v) {
      return memo('cloud' + v, () => drawCloud(v));
    },
    foam(f) {
      return memo('foam' + f, () => drawFoam(f));
    },
    mainland: drawMainland,
    mk,
  };
  PF.Spr = S;
})();
