/* 世界：9×9 地块、迷雾、资源点、建筑/洞窟/宝箱布置、可走判定、寻路与地形绘制 */
(function () {
  'use strict';
  const PF = (window.PF = window.PF || {});
  const U = PF.U,
    D = PF.Data,
    S = PF.Spr;
  const T = D.TILE,
    N = D.N,
    PX = D.PX;
  const CENTER = 40;
  const DEFAULT_TILES = [40, 31, 39, 41, 49];
  const FC = T / 4; // 雾格尺寸
  const FOG_PAD = 4; // 网格外多少个地块的雾
  const FG = (N + FOG_PAD * 2) * 4; // 雾格边长
  const CH = T * 0.9; // 大陆与岛屿之间的海峡宽
  const DIRV = [
    [0, -1],
    [0, 1],
    [-1, 0],
    [1, 0],
  ];

  const BUILD_SPOTS = { camp: 40, wood: 39, rice: 41, shop: 31, crystal: 49 };
  // 建筑占地（世界单位，相对中心点；中心点为脚底）
  const FOOT = {
    camp: { w: 170, h: 60 },
    wood: { w: 150, h: 54 },
    rice: { w: 140, h: 56 },
    crystal: { w: 150, h: 54 },
    shop: { w: 150, h: 50 },
    site: { w: 120, h: 44 },
  };

  class World {
    constructor(seed, saved) {
      this.seed = seed;
      this.ver = 0; // 解锁版本号（缓存失效用）
      this.groundCache = {};
      this.previewTile = -1;
      this.previewAmt = new Float32Array(N * N);
      // 系统添加的障碍物：{x,y,r} 圆 或 {x0,x1,y0,y1} 矩形
      this.solids = [];
      if (saved) this.load(saved);
      else this.generate();
      this.rebuildIndex();
      this.recalc();
    }

    /* ---------- 生成 ---------- */
    generate() {
      const rnd = U.rng(this.seed);
      this.mainDir = rnd.int(0, 3);
      this.tiles = [];
      for (let i = 0; i < N * N; i++) {
        const r = Math.floor(i / N),
          c = i % N;
        const d = Math.abs(r - 4) + Math.abs(c - 4);
        this.tiles.push({ i, r, c, d, unlocked: DEFAULT_TILES.includes(i), biome: 'meadow', bseed: rnd.int(1, 99999) });
      }
      // 群系
      for (const t of this.tiles) {
        let b;
        if (t.d <= 1) b = 'meadow';
        else if (t.d <= 3) b = rnd.pick(['meadow', 'meadow', 'forest', 'farm', 'farm']);
        else if (t.d <= 5) b = rnd.pick(['forest', 'farm', 'rock', 'meadow', 'rock']);
        else b = rnd.pick(['rock', 'snow', 'forest', 'snow']);
        if (this.isMainEdge(t)) b = 'sand';
        t.biome = b;
      }
      // 洞窟
      const worlds = U.shuffle(['danger', 'lost', 'number', 'reversal'], rnd);
      const ptiles = [20, 24, 56, 60];
      this.portals = ptiles.map((ti, k) => {
        const t = this.tiles[ti];
        t.biome = ['rock', 'forest', 'farm', 'meadow'][k];
        return { world: worlds[k], x: t.c * T + T / 2, y: t.r * T + T / 2 + 40, tile: ti, cleared: false };
      });
      // 建筑
      this.buildings = Object.keys(BUILD_SPOTS).map((k) => {
        const t = this.tiles[BUILD_SPOTS[k]];
        return { kind: k, x: t.c * T + T / 2, y: t.r * T + T / 2 + (k === 'camp' ? 10 : 20), tile: t.i, built: k === 'camp', lv: [0, 0, 0, 0], prodT: 0 };
      });
      // 宝箱
      const cand = this.tiles.filter((t) => t.d >= 2 && !ptiles.includes(t.i)).map((t) => t.i);
      U.shuffle(cand, rnd);
      this.chests = [];
      // 资源点
      this.nodes = [];
      let nid = 0;
      for (const t of this.tiles) {
        const occupied = [];
        const b = this.buildings.find((x) => x.tile === t.i);
        if (b) occupied.push([b.x, b.y - 30, b.kind === 'camp' ? 150 : 125]);
        const p = this.portals.find((x) => x.tile === t.i);
        if (p) occupied.push([p.x, p.y - 30, 120]);
        if (cand.indexOf(t.i) >= 0 && cand.indexOf(t.i) < 10) {
          const pos = this.freeSpot(t, occupied, rnd, 60);
          if (pos) {
            this.chests.push({ x: pos[0], y: pos[1], tile: t.i, opened: false, gold: 15 + t.d * 4 + rnd.int(0, 8) });
            occupied.push([pos[0], pos[1], 60]);
          }
        }
        const plan = this.nodePlan(t, rnd);
        for (const it of plan) {
          const pos = this.freeSpot(t, occupied, rnd, it.big ? 62 : 50);
          if (!pos) continue;
          occupied.push([pos[0], pos[1], it.big ? 62 : 50]);
          const variant = it.type === 0 ? (t.biome === 'snow' ? 'pine' : t.biome === 'forest' ? (rnd() < 0.5 ? 'pine' : 'leaf') : rnd() < 0.12 ? 'autumn' : rnd() < 0.1 ? 'fruit' : 'leaf') : null;
          this.nodes.push({ id: nid++, type: it.type, big: it.big, x: pos[0], y: pos[1], tile: t.i, hp: 0, max: 0, regrow: 0, variant, vs: rnd.int(0, 3) });
        }
      }
      for (const n of this.nodes) {
        n.max = n.big ? D.NODE_HP.big : D.NODE_HP.small;
        n.hp = n.max;
      }
      this.dock = null;
    }
    isMainEdge(t) {
      const d = this.mainDir;
      return (d === 0 && t.r === 0) || (d === 1 && t.r === N - 1) || (d === 2 && t.c === 0) || (d === 3 && t.c === N - 1);
    }
    nodePlan(t, rnd) {
      const out = [];
      const add = (type, n) => {
        for (let k = 0; k < n; k++) out.push({ type, big: rnd() < 0.35 });
      };
      if (t.i === CENTER) {
        add(0, 2);
        out.forEach((o) => (o.big = false));
        return out;
      }
      if (t.d === 1) {
        add(0, 2 + (rnd() < 0.5 ? 1 : 0));
        add(1, 1);
        return out;
      }
      switch (t.biome) {
        case 'meadow':
          add(0, rnd.int(2, 4));
          add(1, rnd.int(1, 2));
          if (t.d >= 3) add(2, 1);
          break;
        case 'forest':
          add(0, rnd.int(4, 6));
          add(1, rnd.int(0, 1));
          if (t.d >= 3) add(2, rnd.int(0, 1));
          break;
        case 'farm':
          add(1, rnd.int(3, 5));
          add(0, rnd.int(1, 2));
          if (t.d >= 3) add(2, rnd.int(0, 1));
          break;
        case 'rock':
          add(2, rnd.int(2, 4));
          add(0, rnd.int(0, 1));
          add(1, rnd.int(0, 1));
          break;
        case 'snow':
          add(2, rnd.int(2, 3));
          add(0, rnd.int(1, 3));
          break;
        case 'sand':
          add(0, rnd.int(1, 2));
          add(1, 1);
          add(2, 1);
          break;
      }
      if (t.d === 3 && !out.some((o) => o.type === 2)) out.push({ type: 2, big: false });
      return out;
    }
    freeSpot(t, occ, rnd, rad) {
      const m = 46;
      for (let k = 0; k < 40; k++) {
        const x = t.c * T + m + rnd() * (T - 2 * m);
        const y = t.r * T + m + 20 + rnd() * (T - 2 * m - 20);
        let ok = true;
        for (const o of occ)
          if (U.dist(x, y, o[0], o[1]) < o[2] + rad * 0.6) {
            ok = false;
            break;
          }
        if (ok) return [x, y];
      }
      return null;
    }

    /* ---------- 存/读 ---------- */
    serialize() {
      return {
        seed: this.seed,
        mainDir: this.mainDir,
        tiles: this.tiles.map((t) => [t.unlocked ? 1 : 0, t.biome, t.bseed]),
        nodes: this.nodes.map((n) => [n.type, n.big ? 1 : 0, Math.round(n.x), Math.round(n.y), n.tile, n.hp, n.max, Math.round(n.regrow * 10) / 10, n.variant, n.vs]),
        buildings: this.buildings.map((b) => ({ kind: b.kind, x: b.x, y: b.y, tile: b.tile, built: b.built, lv: b.lv })),
        portals: this.portals.map((p) => ({ world: p.world, x: p.x, y: p.y, tile: p.tile, cleared: p.cleared })),
        chests: this.chests.map((c) => [Math.round(c.x), Math.round(c.y), c.tile, c.opened ? 1 : 0, c.gold]),
        dock: this.dock,
      };
    }
    load(s) {
      this.seed = s.seed;
      this.mainDir = s.mainDir;
      this.tiles = s.tiles.map((a, i) => {
        const r = Math.floor(i / N),
          c = i % N;
        return { i, r, c, d: Math.abs(r - 4) + Math.abs(c - 4), unlocked: !!a[0], biome: a[1], bseed: a[2] };
      });
      this.nodes = s.nodes.map((a, id) => ({ id, type: a[0], big: !!a[1], x: a[2], y: a[3], tile: a[4], hp: a[5], max: a[6], regrow: a[7], variant: a[8], vs: a[9] }));
      this.buildings = s.buildings.map((b) => Object.assign({ prodT: 0 }, b));
      this.portals = s.portals;
      this.chests = s.chests.map((a) => ({ x: a[0], y: a[1], tile: a[2], opened: !!a[3], gold: a[4] }));
      this.dock = s.dock || null;
    }

    /* ---------- 查询 ---------- */
    tileIdx(x, y) {
      const c = Math.floor(x / T),
        r = Math.floor(y / T);
      if (c < 0 || r < 0 || c >= N || r >= N) return -1;
      return r * N + c;
    }
    unlockedAt(x, y) {
      const i = this.tileIdx(x, y);
      return i >= 0 && this.tiles[i].unlocked;
    }
    /* 脚底圆是否全部站在已解锁陆地上 */
    walkable(x, y, r) {
      r = r || 12;
      return this.unlockedAt(x - r, y) && this.unlockedAt(x + r, y) && this.unlockedAt(x, y - r * 0.6) && this.unlockedAt(x, y + r * 0.6);
    }
    neighbors(i) {
      const r = Math.floor(i / N),
        c = i % N;
      const out = [];
      if (r > 0) out.push(i - N);
      if (r < N - 1) out.push(i + N);
      if (c > 0) out.push(i - 1);
      if (c < N - 1) out.push(i + 1);
      return out;
    }
    unlockedCount() {
      let n = 0;
      for (const t of this.tiles) if (t.unlocked) n++;
      return n;
    }
    building(kind) {
      return this.buildings.find((b) => b.kind === kind);
    }
    camp() {
      return this.buildings[0].kind === 'camp' ? this.buildings[0] : this.building('camp');
    }
    rebuildIndex() {
      this.nodesByTile = [];
      for (let i = 0; i < N * N; i++) this.nodesByTile.push([]);
      for (const n of this.nodes) this.nodesByTile[n.tile].push(n);
    }
    /* 附近（3×3 地块）的资源点 */
    nodesNear(x, y) {
      const c = Math.floor(x / T),
        r = Math.floor(y / T);
      const out = [];
      for (let dr = -1; dr <= 1; dr++)
        for (let dc = -1; dc <= 1; dc++) {
          const rr = r + dr,
            cc = c + dc;
          if (rr < 0 || cc < 0 || rr >= N || cc >= N) continue;
          const i = rr * N + cc;
          if (!this.tiles[i].unlocked) continue;
          const l = this.nodesByTile[i];
          for (let k = 0; k < l.length; k++) out.push(l[k]);
        }
      return out;
    }
    nodeSolidR(n) {
      if (n.hp <= 0) return 0;
      if (n.type === 0) return n.big ? 26 : 20;
      if (n.type === 2) return n.big ? 26 : 18;
      return 0; // 水稻不挡路
    }
    footprint(b) {
      const f = b.built || b.kind === 'camp' ? FOOT[b.kind] : FOOT.site;
      return { x0: b.x - f.w / 2, x1: b.x + f.w / 2, y0: b.y - f.h, y1: b.y };
    }
    /* 把圆推出障碍 */
    resolve(ent, r) {
      const near = this.nodesNear(ent.x, ent.y);
      for (const n of near) {
        const sr = this.nodeSolidR(n);
        if (!sr) continue;
        const dx = ent.x - n.x,
          dy = (ent.y - (n.y - 4)) * 1.4;
        const d = Math.hypot(dx, dy);
        const min = sr + r;
        if (d < min && d > 0.001) {
          ent.x = n.x + (dx / d) * min;
          ent.y = n.y - 4 + ((dy / d) * min) / 1.4;
        }
      }
      for (const b of this.buildings) {
        if (Math.abs(ent.x - b.x) > 160 || Math.abs(ent.y - b.y) > 120) continue;
        pushBox(ent, this.footprint(b), r);
      }
      for (const p of this.portals) {
        if (!this.tiles[p.tile].unlocked) continue;
        if (Math.abs(ent.x - p.x) > 120 || Math.abs(ent.y - p.y) > 120) continue;
        // 两根石柱
        pushBox(ent, { x0: p.x - 80, x1: p.x - 48, y0: p.y - 40, y1: p.y }, r);
        pushBox(ent, { x0: p.x + 48, x1: p.x + 80, y0: p.y - 40, y1: p.y }, r);
      }
      for (const o of this.solids) {
        if (o.r != null) {
          const dx = ent.x - o.x,
            dy = ent.y - o.y;
          const d = Math.hypot(dx, dy);
          const min = o.r + r;
          if (d < min && d > 0.001) {
            ent.x = o.x + (dx / d) * min;
            ent.y = o.y + (dy / d) * min;
          }
        } else if (Math.abs(ent.x - (o.x0 + o.x1) / 2) < 260 && Math.abs(ent.y - (o.y0 + o.y1) / 2) < 260) pushBox(ent, o, r);
      }
    }
    /* 障碍物矩形（建筑、洞窟石柱、系统障碍），用于绕路 */
    obstacleBoxes(ignore) {
      const out = [];
      for (const b of this.buildings) if (b !== ignore) out.push(this.footprint(b));
      for (const p of this.portals) {
        if (!this.tiles[p.tile].unlocked) continue;
        out.push({ x0: p.x - 80, x1: p.x - 48, y0: p.y - 40, y1: p.y });
        out.push({ x0: p.x + 48, x1: p.x + 80, y0: p.y - 40, y1: p.y });
      }
      for (const o of this.solids) out.push(o.r != null ? { x0: o.x - o.r, x1: o.x + o.r, y0: o.y - o.r, y1: o.y + o.r } : o);
      return out;
    }
    /* 如果直线会撞上建筑，就改走它的一个角（让精灵、海盗不再卡在建筑后面） */
    steer(x, y, tx, ty, r, ignore) {
      const pad = r + 6;
      let best = null,
        bt = 2;
      const minx = Math.min(x, tx) - pad,
        maxx = Math.max(x, tx) + pad,
        miny = Math.min(y, ty) - pad,
        maxy = Math.max(y, ty) + pad;
      for (const b0 of this.obstacleBoxes(ignore)) {
        if (b0.x1 < minx || b0.x0 > maxx || b0.y1 < miny || b0.y0 > maxy) continue;
        const b = { x0: b0.x0 - pad, x1: b0.x1 + pad, y0: b0.y0 - pad, y1: b0.y1 + pad };
        if (x > b.x0 && x < b.x1 && y > b.y0 && y < b.y1) continue; // 已经贴着了，交给推挤
        const t = segBox(x, y, tx, ty, b);
        if (t != null && t < bt) {
          bt = t;
          best = b;
        }
      }
      if (!best) return [tx, ty];
      const m = 16;
      const corners = [
        [best.x0 - m, best.y0 - m],
        [best.x1 + m, best.y0 - m],
        [best.x0 - m, best.y1 + m],
        [best.x1 + m, best.y1 + m],
      ];
      const inner = { x0: best.x0 + 2, x1: best.x1 - 2, y0: best.y0 + 2, y1: best.y1 - 2 };
      let bc = null,
        bd = 1e12;
      for (const c of corners) {
        if (!this.walkable(c[0], c[1], r)) continue;
        if (segBox(x, y, c[0], c[1], inner) != null) continue;
        const d = Math.hypot(c[0] - x, c[1] - y) + Math.hypot(tx - c[0], ty - c[1]);
        if (d < bd) {
          bd = d;
          bc = c;
        }
      }
      return bc || [tx, ty];
    }

    /* ---------- 寻路（地块级 BFS） ---------- */
    recalc() {
      this.ver++;
      // 到营地的距离场
      const camp = this.camp();
      this.campDist = this.bfs(camp ? camp.tile : CENTER);
      this.pathCache = {};
      this.computeFog();
      this.revealed = this.tiles.some((t) => t.unlocked && this.isMainEdge(t));
    }
    bfs(src) {
      const dist = new Int16Array(N * N).fill(-1);
      if (!this.tiles[src].unlocked) return dist;
      const q = [src];
      dist[src] = 0;
      while (q.length) {
        const i = q.shift();
        for (const j of this.neighbors(i))
          if (dist[j] < 0 && this.tiles[j].unlocked) {
            dist[j] = dist[i] + 1;
            q.push(j);
          }
      }
      return dist;
    }
    distFrom(tile) {
      let d = this.pathCache[tile];
      if (!d) d = this.pathCache[tile] = this.bfs(tile);
      return d;
    }
    /* 从 (x,y) 走向目标地块的下一个路点 */
    nextWaypoint(x, y, goalTile, gx, gy) {
      const cur = this.tileIdx(x, y);
      if (cur < 0 || cur === goalTile) return [gx, gy];
      const dist = this.distFrom(goalTile);
      if (dist[cur] < 0) return [gx, gy];
      let best = -1;
      for (const j of this.neighbors(cur)) if (dist[j] >= 0 && dist[j] < dist[cur] && (best < 0 || dist[j] < dist[best])) best = j;
      if (best < 0) return [gx, gy];
      const r = Math.floor(cur / N),
        c = cur % N;
      const br = Math.floor(best / N),
        bc = best % N;
      // 穿过公共边，取靠近当前位置的点（避开角落）
      const m = 70;
      if (br !== r) {
        const ey = br > r ? (r + 1) * T : r * T;
        const ex = U.clamp((x + gx) / 2, c * T + m, (c + 1) * T - m);
        return [ex, ey + (br > r ? 30 : -30)];
      } else {
        const ex = bc > c ? (c + 1) * T : c * T;
        const ey = U.clamp((y + gy) / 2, r * T + m, (r + 1) * T - m);
        return [ex + (bc > c ? 30 : -30), ey];
      }
    }
    /* 最外圈某方向的已解锁地块（海盗靠岸用） */
    outerTiles(dir) {
      const out = [];
      for (const t of this.tiles) {
        if (!t.unlocked) continue;
        const [dx, dy] = DIRV[dir];
        const rr = t.r + dy,
          cc = t.c + dx;
        const out1 = rr < 0 || cc < 0 || rr >= N || cc >= N || !this.tiles[rr * N + cc].unlocked;
        if (out1) out.push(t);
      }
      return out;
    }

    /* ---------- 迷雾 ---------- */
    computeFog() {
      const dist = new Int16Array(FG * FG).fill(99);
      const q = [];
      for (let cy = 0; cy < FG; cy++)
        for (let cx = 0; cx < FG; cx++) {
          const wx = (cx - FOG_PAD * 4) * FC + FC / 2,
            wy = (cy - FOG_PAD * 4) * FC + FC / 2;
          if (this.unlockedAt(wx, wy)) {
            dist[cy * FG + cx] = 0;
            q.push(cy * FG + cx);
          }
        }
      let h = 0;
      while (h < q.length) {
        const k = q[h++];
        const cx = k % FG,
          cy = (k / FG) | 0;
        const d0 = dist[k];
        if (d0 >= 6) continue;
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            const nx = cx + dx,
              ny = cy + dy;
            if (nx < 0 || ny < 0 || nx >= FG || ny >= FG) continue;
            const j = ny * FG + nx;
            if (dist[j] > d0 + 1) {
              dist[j] = d0 + 1;
              q.push(j);
            }
          }
      }
      const fog = new Float32Array(FG * FG);
      for (let k = 0; k < FG * FG; k++) {
        const d = dist[k];
        fog[k] = d <= 1 ? 0 : d === 2 ? 0.5 : d === 3 ? 0.85 : 1;
      }
      this.fogBase = fog;
    }
    fogAt(cx, cy) {
      if (cx < 0 || cy < 0 || cx >= FG || cy >= FG) return 1;
      return this.fogBase[cy * FG + cx];
    }
    /* 新大陆区域是否在 (wx,wy) 处已被揭开 */
    mainlandClear(wx, wy) {
      if (!this.revealed) return false;
      const d = this.mainDir;
      const L0 = -2 * T,
        L1 = (N + 2) * T;
      const depth = CH + 3 * T - 40;
      if (d === 0) return wy < 0 && wy > -depth && wx > L0 && wx < L1;
      if (d === 1) return wy > N * T && wy < N * T + depth && wx > L0 && wx < L1;
      if (d === 2) return wx < 0 && wx > -depth && wy > L0 && wy < L1;
      return wx > N * T && wx < N * T + depth && wy > L0 && wy < L1;
    }
    mainlandRect() {
      const d = this.mainDir;
      const L0 = -2 * T,
        L = (N + 4) * T,
        Dp = 3 * T;
      if (d === 0) return { x: L0, y: -CH - Dp, w: L, h: Dp };
      if (d === 1) return { x: L0, y: N * T + CH, w: L, h: Dp };
      if (d === 2) return { x: -CH - Dp, y: L0, w: Dp, h: L };
      return { x: N * T + CH, y: L0, w: Dp, h: L };
    }

    /* ---------- 绘制：海、大陆、地块、雾 ---------- */
    groundFor(i) {
      let g = this.groundCache[i];
      if (!g) {
        const t = this.tiles[i];
        g = this.groundCache[i] = S.ground(t.biome, t.bseed);
      }
      return g;
    }
    drawSea(ctx, cam, time) {
      const unit = 64 * PX;
      const f = Math.floor(time / 0.7) % 3;
      const img = S.sea(f);
      const ox = (time * 5) % unit;
      const v = cam.view;
      const x0 = Math.floor((v.x0 - ox) / unit) * unit + ox;
      const y0 = Math.floor(v.y0 / unit) * unit;
      for (let y = y0; y < v.y1; y += unit) for (let x = x0; x < v.x1; x += unit) ctx.drawImage(img, x, y, unit + 0.5, unit + 0.5);
    }
    drawMainland(ctx, cam, time) {
      if (!this.revealed) return;
      if (!this.mainCanvas) {
        const m = S.mainland(this.mainDir, N + 4);
        this.mainCanvas = m.canvas;
        // 大陆上的树
        const R = this.mainlandRect();
        const rnd = U.rng(this.seed + 11);
        this.mainTrees = [];
        for (let k = 0; k < 60; k++) {
          const tx = R.x + rnd() * R.w,
            ty = R.y + rnd() * R.h;
          // 离海岸至少 120
          const coast = this.mainDir === 0 ? R.y + R.h - ty : this.mainDir === 1 ? ty - R.y : this.mainDir === 2 ? R.x + R.w - tx : tx - R.x;
          if (coast < 140) continue;
          this.mainTrees.push({ x: tx, y: ty, big: rnd() < 0.5, v: rnd() < 0.3 ? 'pine' : 'leaf', s: rnd.int(0, 3) });
        }
        this.mainTrees.sort((a, b) => a.y - b.y);
      }
      const R = this.mainlandRect();
      // 只画可见部分
      const v = cam.view;
      const vx0 = Math.max(R.x, v.x0 - 8),
        vy0 = Math.max(R.y, v.y0 - 8),
        vx1 = Math.min(R.x + R.w, v.x1 + 8),
        vy1 = Math.min(R.y + R.h, v.y1 + 8);
      if (vx1 > vx0 && vy1 > vy0) {
        const k = this.mainCanvas.width / R.w;
        const sx = Math.floor((vx0 - R.x) * k),
          sy = Math.floor((vy0 - R.y) * k);
        const sw = Math.ceil((vx1 - vx0) * k) + 1,
          sh = Math.ceil((vy1 - vy0) * k) + 1;
        ctx.drawImage(this.mainCanvas, sx, sy, sw, sh, R.x + sx / k, R.y + sy / k, sw / k, sh / k);
      }
      for (const tr of this.mainTrees) {
        if (!cam.visible(tr.x, tr.y, 200)) continue;
        const img = S.tree(tr.big, tr.v, tr.s);
        ctx.drawImage(img, tr.x - (img.width * PX) / 2, tr.y - img.height * PX, img.width * PX, img.height * PX);
      }
    }
    drawTiles(ctx, cam, time) {
      const v = cam.view;
      const c0 = Math.max(0, Math.floor(v.x0 / T)),
        c1 = Math.min(N - 1, Math.floor(v.x1 / T));
      const r0 = Math.max(0, Math.floor(v.y0 / T) - 1),
        r1 = Math.min(N - 1, Math.floor(v.y1 / T));
      const foamF = Math.floor(time * 3) % 4;
      // 浅水 + 浪花
      for (let r = r0; r <= r1; r++)
        for (let c = c0; c <= c1; c++) {
          const i = r * N + c;
          const t = this.tiles[i];
          if (!t.unlocked) continue;
          const x = c * T,
            y = r * T;
          const up = r > 0 && this.tiles[i - N].unlocked,
            dn = r < N - 1 && this.tiles[i + N].unlocked;
          const lf = c > 0 && this.tiles[i - 1].unlocked,
            rt = c < N - 1 && this.tiles[i + 1].unlocked;
          ctx.fillStyle = 'rgba(140,220,240,0.35)';
          if (!up) ctx.fillRect(x - 10, y - 18, T + 20, 18);
          if (!dn) ctx.fillRect(x - 10, y + T + 56, T + 20, 16);
          if (!lf) ctx.fillRect(x - 18, y - 10, 18, T + 66);
          if (!rt) ctx.fillRect(x + T, y - 10, 18, T + 66);
          const foam = S.foam((foamF + r + c) % 4);
          if (!up) ctx.drawImage(foam, x, y - 16, T, 16);
          if (!dn) ctx.drawImage(foam, x, y + T + 56, T, 16);
          if (!lf) {
            ctx.save();
            ctx.translate(x - 16, y + T + 56);
            ctx.rotate(-Math.PI / 2);
            ctx.drawImage(foam, 0, 0, T + 56, 16);
            ctx.restore();
          }
          if (!rt) {
            ctx.save();
            ctx.translate(x + T + 16, y);
            ctx.rotate(Math.PI / 2);
            ctx.drawImage(foam, 0, 0, T + 56, 16);
            ctx.restore();
          }
        }
      // 地面
      for (let r = r0; r <= r1; r++)
        for (let c = c0; c <= c1; c++) {
          const i = r * N + c;
          const t = this.tiles[i];
          const pa = this.previewAmt[i];
          if (!t.unlocked && pa <= 0.01) continue;
          const x = c * T,
            y = r * T;
          if (!t.unlocked) ctx.globalAlpha = pa * 0.9;
          ctx.drawImage(this.groundFor(i), x, y, T, T);
          const dn = r < N - 1 && this.tiles[i + N].unlocked;
          if (!dn) ctx.drawImage(S.cliff(t.biome), x, y + T, T, 56);
          ctx.globalAlpha = 1;
        }
    }
    drawFog(ctx, cam, time) {
      const v = cam.view;
      const off = FOG_PAD * 4;
      const cx0 = Math.max(0, Math.floor(v.x0 / FC) + off - 2),
        cx1 = Math.min(FG - 1, Math.floor(v.x1 / FC) + off + 2);
      const cy0 = Math.max(0, Math.floor(v.y0 / FC) + off - 2),
        cy1 = Math.min(FG - 1, Math.floor(v.y1 / FC) + off + 2);
      const dens = (cx, cy) => {
        let d = this.fogAt(cx, cy);
        if (d <= 0) return 0;
        const wx = (cx - off) * FC + FC / 2,
          wy = (cy - off) * FC + FC / 2;
        const ti = this.tileIdx(wx, wy);
        if (ti >= 0) {
          const pa = this.previewAmt[ti];
          if (pa > 0) d *= 1 - 0.78 * pa;
        }
        if (this.mainlandClear(wx, wy)) d = 0;
        return d;
      };
      // 实心底
      ctx.fillStyle = '#cdd5e4';
      for (let cy = cy0; cy <= cy1; cy++)
        for (let cx = cx0; cx <= cx1; cx++) {
          const d = dens(cx, cy);
          if (d >= 0.99) ctx.fillRect((cx - off) * FC - 1, (cy - off) * FC - 1, FC + 2, FC + 2);
        }
      // 云团（雾的内部隔一个画一团，镜头拉远时更稀疏）
      const sparse = cam.z < 0.75;
      for (let cy = cy0; cy <= cy1; cy++)
        for (let cx = cx0; cx <= cx1; cx++) {
          const d = dens(cx, cy);
          if (d <= 0.02) continue;
          let scale = 1;
          if (d >= 0.99 && this.fogAt(cx - 1, cy) >= 0.99 && this.fogAt(cx + 1, cy) >= 0.99 && this.fogAt(cx, cy - 1) >= 0.99 && this.fogAt(cx, cy + 1) >= 0.99) {
            if (sparse) {
              if (cx % 2 || cy % 2) continue;
              scale = 1.7;
            } else if ((cx + cy) & 1) continue;
            else scale = 1.25;
          }
          const h = U.hash(cx, cy, 5);
          const img = S.cloud(Math.floor(h * 3));
          const w = FC * 2.3 * scale,
            hh = (w * img.height) / img.width;
          const dx = Math.sin(time * 0.25 + h * 6.28) * 12;
          const dy = Math.cos(time * 0.2 + h * 4) * 6;
          ctx.globalAlpha = Math.min(1, d * 1.05);
          ctx.drawImage(img, (cx - off) * FC + FC / 2 - w / 2 + dx, (cy - off) * FC + FC / 2 - hh / 2 + dy, w, hh);
        }
      ctx.globalAlpha = 1;
    }
  }

  /* 线段与矩形相交：返回进入时刻 t∈[0,1]，否则 null（Liang–Barsky） */
  function segBox(x0, y0, x1, y1, b) {
    let t0 = 0,
      t1 = 1;
    const dx = x1 - x0,
      dy = y1 - y0;
    const p = [-dx, dx, -dy, dy];
    const q = [x0 - b.x0, b.x1 - x0, y0 - b.y0, b.y1 - y0];
    for (let i = 0; i < 4; i++) {
      if (p[i] === 0) {
        if (q[i] < 0) return null;
      } else {
        const t = q[i] / p[i];
        if (p[i] < 0) {
          if (t > t1) return null;
          if (t > t0) t0 = t;
        } else {
          if (t < t0) return null;
          if (t < t1) t1 = t;
        }
      }
    }
    return t0;
  }

  function pushBox(ent, b, r) {
    const cx = U.clamp(ent.x, b.x0, b.x1);
    const cy = U.clamp(ent.y, b.y0, b.y1);
    const dx = ent.x - cx,
      dy = ent.y - cy;
    const d = Math.hypot(dx, dy);
    if (d < r) {
      if (d > 0.001) {
        ent.x = cx + (dx / d) * r;
        ent.y = cy + (dy / d) * r;
      } else {
        // 在盒子内部：推到最近的边
        const l = ent.x - b.x0,
          rr = b.x1 - ent.x,
          u = ent.y - b.y0,
          dd = b.y1 - ent.y;
        const m = Math.min(l, rr, u, dd);
        if (m === l) ent.x = b.x0 - r;
        else if (m === rr) ent.x = b.x1 + r;
        else if (m === u) ent.y = b.y0 - r;
        else ent.y = b.y1 + r;
      }
    }
  }

  World.T = T;
  World.N = N;
  World.CENTER = CENTER;
  World.DEFAULT_TILES = DEFAULT_TILES;
  World.DIRV = DIRV;
  World.CH = CH;
  World.FOOT = FOOT;
  World.segBox = segBox;
  World.pushBox = pushBox;
  PF.World = World;
})();
