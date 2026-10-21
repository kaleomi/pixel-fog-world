/* 主玩法：资源、建筑、升级、昼夜、海盗来袭、任务、存档、渲染与夜间光照
   新玩法以“系统”插件接入（PF.Sys），接口说明见 docs/PLUGIN_API.md */
(function () {
  'use strict';
  const PF = (window.PF = window.PF || {});
  const U = PF.U,
    D = PF.Data,
    S = PF.Spr,
    A = PF.Audio,
    E = PF.Ent;
  const T = D.TILE,
    N = D.N,
    PX = D.PX;
  const SAVE_VER = 1;
  // 目标显示顺序：先建木料场、召唤精灵，再驱散迷雾
  const TASK_ORDER = [2, 1, 0, 3, 4, 5, 6, 7];
  const DIR_NAME = ['北', '南', '西', '东'];

  const defaultMods = () => ({
    playerSpeedMul: 1,
    playerHpAdd: 0,
    playerRegenAdd: 0,
    atkAdd: 0,
    atkMul: 1,
    workerSpeedMul: 1,
    workerCarryAdd: 0,
    campHpAdd: 0,
    tileCostMul: 1,
    gatherBonus: 0, // 每次采集额外 +1 的几率
    darknessMul: 1,
    regrowMul: 1,
    prodMul: 1,
    goldMul: 1,
    enemyHpMul: 1,
    enemyAtkMul: 1,
    enemyCountMul: 1,
    extraFreeRevives: 0,
  });

  const defaultSt = () => ({
    res: [10, 0, 0, 15],
    items: {}, // 系统用的道具（鱼、宠物粮……）
    day: 0,
    cycleT: 0,
    elapsed: 0,
    campHp: D.CAMP.hp.vals[0],
    atkLv: 0,
    holySword: false,
    superMan: false,
    speedUpT: 0,
    tasks: [false, false, false, false, false, false, false, false],
    kills: 0,
    hired: 0,
    gathered: [
      [0, 0, 0],
      [0, 0, 0],
    ],
    worlds: {},
    revives: 0,
    freeRevives: 1,
    letterIdx: 0,
    letterUnread: false,
    won: false,
    countdown: -1,
    raidDay: -1, // 最近一次已出发的海盗夜
  });

  /* =================== 镜头 =================== */
  class Camera {
    constructor() {
      this.x = 4.5 * T;
      this.y = 4.5 * T;
      this.z = 1;
      this.W = 800;
      this.H = 600;
      this.view = { x0: 0, y0: 0, x1: 0, y1: 0 };
      this.zoomMul = 1;
      this.shake = 0;
    }
    baseZoom() {
      // 竖屏稍微拉近一点，人物不至于太小
      const ref = this.H > this.W ? 640 : 720;
      return (Math.min(this.W, this.H) / ref) * this.zoomMul;
    }
    maxPairDist() {
      const z = this.baseZoom() * 0.58;
      return Math.min(this.W / z - 260, this.H / z - 240) + 120;
    }
    follow(pts, dt, snap) {
      let tx = 0,
        ty = 0;
      for (const p of pts) {
        tx += p.x;
        ty += p.y;
      }
      tx /= pts.length;
      ty /= pts.length;
      ty -= 40;
      let tz = this.baseZoom();
      if (pts.length > 1) {
        const dx = Math.abs(pts[0].x - pts[1].x) + 520,
          dy = Math.abs(pts[0].y - pts[1].y) + 460;
        tz = Math.max(tz * 0.58, Math.min(tz, this.W / dx, this.H / dy));
      }
      const k = snap ? 1 : 1 - Math.pow(0.002, dt);
      this.x += (tx - this.x) * k;
      this.y += (ty - this.y) * k;
      this.z += (tz - this.z) * (snap ? 1 : 1 - Math.pow(0.05, dt));
      this.updateView();
    }
    updateView() {
      const hw = this.W / 2 / this.z,
        hh = this.H / 2 / this.z;
      this.view.x0 = this.x - hw;
      this.view.x1 = this.x + hw;
      this.view.y0 = this.y - hh;
      this.view.y1 = this.y + hh;
    }
    visible(x, y, m) {
      const v = this.view;
      return x > v.x0 - m && x < v.x1 + m && y > v.y0 - m && y < v.y1 + m * 1.6;
    }
    toScreen(x, y) {
      return { x: (x - this.x) * this.z + this.W / 2, y: (y - this.y) * this.z + this.H / 2 };
    }
    apply(ctx, dpr) {
      const sx = this.shake > 0 ? U.rand(-1, 1) * this.shake : 0;
      const sy = this.shake > 0 ? U.rand(-1, 1) * this.shake : 0;
      ctx.setTransform(dpr * this.z, 0, 0, dpr * this.z, dpr * (this.W / 2 - this.x * this.z + sx), dpr * (this.H / 2 - this.y * this.z + sy));
    }
  }

  /* =================== 游戏 =================== */
  class Game {
    constructor(opts) {
      this.twoP = !!opts.twoP;
      this.endless = !!opts.endless;
      this.skins = opts.skins.slice();
      this.cam = new Camera();
      this.fx = new E.Fx();
      this.pirates = []; // 所有敌人（海盗、雾怪、首领……）
      this.allies = []; // 系统加入的友方单位（宠物、可被攻击的塔……）
      this.ships = [];
      this.gulls = [];
      this.time = 0;
      this.paused = false;
      this.mini = null;
      this.cut = null; // 过场
      this.saveT = 0;
      this.toastCD = 0;
      this.gullT = 4;
      this.prompts = [null, null];
      this.over = false;
      this.dead = false;
      this.timers = [];
      this.dayLen = D.DAY_LEN;
      this.nightLen = D.NIGHT_LEN;
      this.mods = defaultMods();
      this.sys = {};
      this.timeScale = Number(U.qs.get('fast')) || 1;
      this.debug = !!(U.qs.get('rich') || U.qs.get('fast'));
      const sv = opts.save;
      const fresh = !(sv && sv.v === SAVE_VER);
      if (!fresh) this.load(sv);
      else this.fresh();
      // 初始化各玩法系统
      for (const s of PF.Sys.list) {
        if (!s.init) continue;
        try {
          s.init(this, fresh ? undefined : sv.sys && sv.sys[s.id], fresh);
        } catch (e) {
          console.error('[sys init]', s.id, e);
        }
      }
      this.recomputeMods();
      if (fresh) {
        this.st.freeRevives = 1 + this.mods.extraFreeRevives;
        this.st.campHp = this.campHpMax();
        for (const p of this.players) p.hp = p.hpMax;
      }
      this.cam.follow(this.players, 0, true);
      this.initAmbient();
      this.lightCv = document.createElement('canvas');
      this.lightCx = this.lightCv.getContext('2d');
    }
    fresh() {
      const seed = (Math.random() * 1e9) | 0;
      this.world = new PF.World(seed);
      this.st = defaultSt();
      this.st.endless = this.endless;
      if (U.qs.get('rich')) this.st.res = [5000, 5000, 5000, 5000];
      const camp = this.world.camp();
      this.players = [];
      for (let i = 0; i < (this.twoP ? 2 : 1); i++) {
        const p = new E.Player(this, i, this.skins[i]);
        p.x = camp.x + (this.twoP ? (i ? 60 : -60) : 0);
        p.y = camp.y + 110;
        this.players.push(p);
      }
      this.workers = [];
    }
    initAmbient() {
      this.fins = [];
      const cx = 4.5 * T,
        cy = 4.5 * T;
      for (let k = 0; k < 3; k++) this.fins.push(new E.Fin(this, cx + U.rand(-200, 200), cy + U.rand(-200, 200), U.rand(T * 1.9, T * 2.6)));
      this.crabs = [];
      const w = this.world;
      const beach = w.tiles.filter((t) => t.biome === 'sand' || (t.d >= 2 && U.hash(t.i, 3, w.seed) < 0.2));
      for (const t of beach.slice(0, 10)) this.crabs.push(new E.Crab(this, t.i));
    }
    /* 汇总各系统的数值修正 */
    recomputeMods() {
      const m = defaultMods();
      for (const s of PF.Sys.list)
        if (s.mods)
          try {
            s.mods(this, m);
          } catch (e) {
            console.error('[sys mods]', s.id, e);
          }
      this.mods = m;
    }
    /* 调用所有系统的同名钩子 */
    fire(name, a, b, c, d) {
      const l = PF.Sys.list;
      for (let i = 0; i < l.length; i++) {
        const f = l[i][name];
        if (f)
          try {
            f.call(l[i], this, a, b, c, d);
          } catch (e) {
            console.error('[sys ' + name + ']', l[i].id, e);
          }
      }
    }
    /* 收集各系统钩子的返回值（非空） */
    collect(name, a, b, c) {
      const out = [];
      for (const s of PF.Sys.list) {
        const f = s[name];
        if (!f) continue;
        try {
          const r = f.call(s, this, a, b, c);
          if (r != null) Array.isArray(r) ? out.push(...r) : out.push(r);
        } catch (e) {
          console.error('[sys ' + name + ']', s.id, e);
        }
      }
      return out;
    }
    later(fn, ms) {
      const id = setTimeout(() => {
        if (!this.dead) fn();
      }, ms);
      this.timers.push(id);
    }
    destroy() {
      this.dead = true;
      for (const id of this.timers) clearTimeout(id);
      this.timers = [];
      this.fire('destroy');
    }

    /* ---------- 存档 ---------- */
    serialize() {
      const sys = {};
      for (const s of PF.Sys.list)
        if (s.serialize)
          try {
            sys[s.id] = s.serialize(this);
          } catch (e) {
            console.error('[sys serialize]', s.id, e);
          }
      // 还在船上 / 涉水的海盗：存成已登陆
      const pir = [];
      for (const p of this.pirates) {
        if (p.dead || p.noSave) continue;
        const onLand = p.state !== 'sail';
        pir.push({ kind: p.kind, x: Math.round(onLand ? p.x : p.land.x), y: Math.round(onLand ? p.y : p.land.y), hp: p.hp });
      }
      for (const s of this.ships) if (s.queue && s.queue.length && !s.noSave) for (const k of s.queue) pir.push({ kind: k, x: Math.round(s.land.x + U.rand(-50, 50)), y: Math.round(s.land.y), hp: D.PIRATE_KIND[k].hp * this.mods.enemyHpMul });
      return {
        v: SAVE_VER,
        twoP: this.twoP,
        endless: this.endless,
        skins: this.skins,
        st: this.st,
        world: this.world.serialize(),
        players: this.players.map((p) => ({ x: Math.round(p.x), y: Math.round(p.y), hp: p.hp, down: p.down })),
        workers: this.workers.filter((w) => !w.dead).map((w) => ({ type: w.type, lastType: w.lastType, x: Math.round(w.x), y: Math.round(w.y), hp: w.hp, carry: w.carry })),
        pirates: pir,
        sys,
      };
    }
    load(sv) {
      this.world = new PF.World(sv.world.seed, sv.world);
      const st = Object.assign(defaultSt(), sv.st);
      if (typeof sv.st.freeRevive === 'boolean' && sv.st.freeRevives == null) st.freeRevives = sv.st.freeRevive ? 1 : 0;
      this.st = st;
      this.endless = !!(sv.endless || st.endless);
      const camp = this.world.camp();
      this.players = sv.players.map((d, i) => {
        const p = new E.Player(this, i, this.skins[i]);
        p.x = d.x;
        p.y = d.y;
        // 存在海上 / 大陆上的旧存档：放回营地旁边
        if (!this.world.walkable(p.x, p.y, p.r)) {
          p.x = camp.x + (i ? 60 : -60);
          p.y = camp.y + 110;
        }
        p.hp = Math.max(1, d.hp);
        if (d.down && this.twoP) {
          p.hp = 0;
          p.down = true;
        }
        return p;
      });
      if (this.players.every((p) => p.down)) this.players.forEach((p) => p.revive(0.5));
      this.workers = sv.workers.map((d) => {
        const w = new E.Worker(this, d.type);
        w.x = d.x;
        w.y = d.y;
        if (!this.world.walkable(w.x, w.y, w.r)) {
          w.x = camp.x;
          w.y = camp.y + 60;
        }
        w.hp = d.hp;
        w.carry = d.carry || 0;
        w.lastType = d.lastType != null ? d.lastType : d.type >= 0 ? d.type : 0;
        if (w.carry > 0) w.state = 'back';
        return w;
      });
      this.pirates = (sv.pirates || [])
        .filter((d) => D.PIRATE_KIND[d.kind])
        .map((d) => {
          const p = new E.Pirate(this, d.kind, d.x, d.y, { x: d.x, y: d.y });
          p.state = 'walk';
          p.hp = d.hp;
          if (!this.world.walkable(p.x, p.y, p.r)) {
            const t = this.world.outerTiles(0)[0] || this.world.tiles[PF.World.CENTER];
            p.x = t.c * T + T / 2;
            p.y = t.r * T + 60;
          }
          return p;
        });
    }
    save() {
      if (this.over || this.st.won === 'ended' || this.cut || this.mini || this.dead) return;
      PF.Save.saveRun(this.twoP, this.serialize(), this.endless);
      PF.Save.saveMeta();
    }

    /* ---------- 经济 ---------- */
    canAfford(cost) {
      if (!cost) return true;
      for (let i = 0; i < 4; i++) if (cost[i] > this.st.res[i]) return false;
      return true;
    }
    lack(cost) {
      // 还差多少：[[资源下标, 数量], ...]
      const out = [];
      if (!cost) return out;
      for (let i = 0; i < 4; i++) if (cost[i] > this.st.res[i]) out.push([i, cost[i] - this.st.res[i]]);
      return out;
    }
    pay(cost) {
      if (!this.canAfford(cost)) return false;
      for (let i = 0; i < 4; i++) this.st.res[i] -= cost[i] || 0;
      U.bus.emit('res');
      return true;
    }
    addRes(i, n, x, y) {
      if (!n) return;
      this.st.res[i] = Math.max(0, this.st.res[i] + n);
      if (x != null) this.fx.icon(x, y, i, n);
      U.bus.emit('res', i);
    }
    item(k) {
      return this.st.items[k] || 0;
    }
    addItem(k, n) {
      this.st.items[k] = Math.max(0, (this.st.items[k] || 0) + n);
      U.bus.emit('res');
    }
    harvest(node, amt, player) {
      node.hp -= amt;
      node.shake = 0.18;
      const key = ['wood', 'rice', 'crystal'][node.type];
      let got = amt;
      if (player && this.mods.gatherBonus > 0 && Math.random() < this.mods.gatherBonus) got += 1;
      if (player) {
        this.addRes(node.type, got, player.x, player.y - 140);
        this.st.gathered[player.idx][node.type] += got;
      }
      PF.Save.addStat(key, got);
      this.fire('harvest', node, got, player);
      if (node.hp <= 0) {
        node.hp = 0;
        const b = this.world.building(key);
        const grow = D.INDUSTRY[key].grow.vals[b.lv[1]];
        node.regrow = this.st.elapsed < 120 ? 30 : grow;
        this.fx.burst(node.x, node.y - 30, '#ffffff', 6);
        if (node.reserved) node.reserved = null;
      }
    }
    nodeMax(n) {
      const key = ['wood', 'rice', 'crystal'][n.type];
      const b = this.world.building(key);
      return (n.big ? D.NODE_HP.big : D.NODE_HP.small) + D.INDUSTRY[key].hpAdd.vals[b.lv[0]];
    }
    campHpMax() {
      return D.CAMP.hp.vals[this.world.camp().lv[3]] + this.mods.campHpAdd;
    }
    workerCap() {
      return D.CAMP.cap.vals[this.world.camp().lv[0]];
    }
    tileCost(t) {
      const c = D.TILE_COST[Math.min(8, Math.max(2, t.d))];
      const m = this.mods.tileCostMul;
      return m === 1 ? c : c.map((v) => Math.round(v * m));
    }

    /* ---------- 动作（UI 调用） ---------- */
    unlockTile(i) {
      const w = this.world;
      const t = w.tiles[i];
      if (t.unlocked) return false;
      if (!this.pay(this.tileCost(t))) {
        this.toast('资源不足');
        A.play('wrong');
        return false;
      }
      t.unlocked = true;
      const wasRevealed = w.revealed;
      w.recalc();
      for (const n of w.nodesByTile[i]) n.max = n.hp = this.nodeMax(n);
      A.play('unlock');
      this.fx.sparkle(t.c * T + T / 2, t.r * T + T / 2, '#ffffff');
      this.fx.text(t.c * T + T / 2, t.r * T + T / 2, '迷雾散去！', '#fff4b0', true);
      this.checkTasks();
      if (!wasRevealed && w.revealed && !this.endless) {
        this.placeDock(t);
        this.later(() => this.toast('雾的尽头出现了一片大陆！在岸边造木筏就能过去'), 600);
        A.play('success');
      }
      this.fire('unlock', t);
      this.save();
      return true;
    }
    placeDock(t) {
      const d = this.world.mainDir;
      const cx = t.c * T + T / 2,
        cy = t.r * T + T / 2;
      const pos = [
        [cx, t.r * T + 62],
        [cx, (t.r + 1) * T - 24],
        [t.c * T + 70, cy],
        [(t.c + 1) * T - 70, cy],
      ][d];
      this.world.dock = { tile: t.i, x: pos[0], y: pos[1], built: false, dir: d };
      // 清掉挡路的资源点
      for (const n of this.world.nodesByTile[t.i])
        if (U.dist(n.x, n.y, pos[0], pos[1]) < 80) {
          n.hp = 0;
          n.regrow = 99999;
        }
    }
    build(kind) {
      const w = this.world;
      const b = w.building(kind);
      if (!b || b.built) return false;
      const def = D.BUILDINGS[kind];
      if (!this.pay(def.cost)) {
        this.toast('资源不足');
        A.play('wrong');
        return false;
      }
      b.built = true;
      b.prodT = 0;
      A.play('build');
      this.fx.sparkle(b.x, b.y - 80, '#ffe36b');
      this.fx.text(b.x, b.y - 180, def.name + '建好了！', '#fff4b0', true);
      this.toast({ wood: '木料场建成：每 2 秒自动产出 1 木材', rice: '粮仓建成：每 3 秒自动产出 1 水稻', crystal: '晶矿场建成：每 5 秒自动产出 1 紫水晶', shop: '集市开张：可以升级武器、兑换资源' }[kind]);
      this.checkTasks();
      this.fire('build', kind);
      this.save();
      return true;
    }
    buildDock() {
      const dk = this.world.dock;
      if (!dk || dk.built) return;
      if (!this.pay(D.BUILDINGS.dock.cost)) {
        this.toast('资源不足');
        A.play('wrong');
        return;
      }
      dk.built = true;
      A.play('build');
      this.fx.sparkle(dk.x, dk.y, '#ffe36b');
      this.toast('木筏造好了！走到木筏旁边就可以启航');
      this.fire('build', 'dock');
      this.save();
    }
    upgradeCamp(k) {
      const keys = ['cap', 'wspeed', 'pspeed', 'hp'];
      const tbl = D.CAMP[keys[k]];
      const camp = this.world.camp();
      const lv = camp.lv[k];
      if (lv >= D.maxLevel(tbl)) return false;
      if (!this.pay(tbl.cost[lv + 1])) {
        this.toast('资源不足');
        A.play('wrong');
        return false;
      }
      camp.lv[k]++;
      if (k === 3) this.st.campHp += tbl.vals[lv + 1] - tbl.vals[lv];
      A.play('success');
      this.fire('upgrade', 'camp', k);
      this.save();
      return true;
    }
    upgradeIndustry(key, k) {
      const items = D.INDUSTRY_ITEMS[key];
      const tbl = D.INDUSTRY[key][items[k].key];
      const b = this.world.building(key);
      const lv = b.lv[k];
      if (lv >= D.maxLevel(tbl)) return false;
      if (!this.pay(tbl.cost[lv + 1])) {
        this.toast('资源不足');
        A.play('wrong');
        return false;
      }
      b.lv[k]++;
      if (k === 0) {
        const add = tbl.vals[lv + 1] - tbl.vals[lv];
        const type = ['wood', 'rice', 'crystal'].indexOf(key);
        for (const n of this.world.nodes)
          if (n.type === type) {
            n.max = this.nodeMax(n);
            if (n.hp > 0) n.hp += add;
          }
      }
      A.play('success');
      this.fire('upgrade', key, k);
      this.save();
      return true;
    }
    hire() {
      if (this.workers.length >= this.workerCap()) {
        this.toast('精灵数量已达上限，先在“升级营地”里提升精灵上限');
        A.play('wrong');
        return false;
      }
      const cost = [0, 0, 0, D.hireCost(this.workers.length)];
      if (!this.pay(cost)) {
        this.toast('金币不足：夜里击退海盗、打开宝箱都能拿金币');
        A.play('wrong');
        return false;
      }
      const w = new E.Worker(this, -1);
      this.workers.push(w);
      this.st.hired++;
      this.fx.sparkle(w.x, w.y - 40, '#9be38a');
      A.play('pop');
      this.fire('hire', w);
      this.save();
      return true;
    }
    assign(type, delta) {
      if (delta > 0) {
        const n = this.workers.filter((w) => w.type === type).length;
        if (n >= D.MAX_PER_TYPE) {
          this.toast('这项工作人数已满');
          return false;
        }
        const idle = this.workers.find((w) => w.type < 0 && !w.dead);
        if (!idle) {
          this.toast(this.workers.length < this.workerCap() ? '没有空闲的精灵，先召唤一只吧' : '没有空闲的精灵');
          return false;
        }
        idle.setType(type);
        this.checkTasks();
      } else {
        const ws = this.workers.filter((w) => w.type === type);
        if (!ws.length) return false;
        ws[ws.length - 1].setType(-1);
      }
      A.play('click');
      this.save();
      return true;
    }
    shopBuy(i) {
      const st = this.st;
      const items = this.shopItems();
      const it = items[i];
      if (it.max) {
        this.toast('已经满级');
        return false;
      }
      if (!this.pay(it.cost)) {
        this.toast('资源不足');
        A.play('wrong');
        return false;
      }
      switch (i) {
        case 0: st.atkLv++; break;
        case 1: this.addRes(0, 100); break;
        case 2: this.addRes(1, 100); break;
        case 3: this.addRes(2, 50); break;
        case 4: this.addRes(3, 20); break;
      }
      A.play('coin');
      this.save();
      return true;
    }
    shopItems() {
      const lv = this.st.atkLv;
      const c = (w, r, k, g) => [w || 0, r || 0, k || 0, g || 0];
      return [
        { title: '武器升级 ' + (lv + 1), desc: lv >= 10 ? '武器已满级' : `攻击力 +2（当前 +${2 * lv}）`, cost: c(0, 0, 0, 20 + 10 * lv), max: lv >= 10, icon: 'sword' },
        { title: '兑换木材', desc: '立即获得 100 木材', cost: c(0, 50), icon: 0 },
        { title: '兑换水稻', desc: '立即获得 100 水稻', cost: c(200), icon: 1 },
        { title: '兑换紫水晶', desc: '立即获得 50 紫水晶', cost: c(200, 100), icon: 2 },
        { title: '卖给商人', desc: '换 20 金币', cost: c(100, 50), icon: 3 },
      ];
    }
    revive(paid) {
      const st = this.st;
      if (paid) {
        const cost = [0, 0, 0, D.reviveCost(st.revives)];
        if (!this.pay(cost)) return false;
        st.revives++;
      } else {
        if (!(st.freeRevives > 0)) return false;
        st.freeRevives--;
      }
      for (const p of this.players) p.revive(1);
      st.campHp = this.campHpMax();
      // 震退附近敌人
      for (const pr of this.pirates) {
        for (const p of this.players) {
          const d = U.dist(pr.x, pr.y, p.x, p.y);
          if (d < 260 && d > 1) {
            const nx = pr.x + ((pr.x - p.x) / d) * 200,
              ny = pr.y + ((pr.y - p.y) / d) * 200;
            if (this.world.walkable(nx, ny, pr.r)) {
              pr.x = nx;
              pr.y = ny;
            }
          }
        }
      }
      this.fx.sparkle(this.players[0].x, this.players[0].y - 60, '#9be38a');
      A.play('heal');
      this.over = false;
      this.fire('revive');
      return true;
    }

    /* ---------- 事件 ---------- */
    toast(msg) {
      U.bus.emit('toast', msg);
    }
    hurtCamp(dmg) {
      if (this.st.campHp <= 0 || this.over) return;
      this.st.campHp -= dmg;
      const c = this.world.camp();
      c.flash = 0.4;
      this.fx.text(c.x + U.rand(-40, 40), c.y - 170, '-' + Math.round(dmg), '#ff5a4f');
      if (this.toastCD <= 0) {
        this.toastCD = 6;
        U.bus.emit('campAttacked');
        A.play('alarm');
      }
      this.fire('campHurt', dmg);
      if (this.st.campHp <= 0) {
        this.st.campHp = 0;
        this.gameOver('camp');
      }
    }
    onPlayerDown(p) {
      this.fire('playerDown', p);
      if (!this.twoP || this.players.every((q) => q.down)) this.gameOver('player');
    }
    onWorkerDie(w) {
      this.toast('一只小精灵被打倒了……');
      this.later(() => {
        const i = this.workers.indexOf(w);
        if (i >= 0) this.workers.splice(i, 1);
      }, 900);
    }
    onPirateDie(p, src) {
      this.st.kills++;
      PF.Save.addStat('kills', 1);
      const gold = Math.round((p.K.gold || 0) * this.mods.goldMul);
      if (gold) {
        this.addRes(3, gold, p.x, p.y - 150);
        A.play('coin');
      }
      this.fire('enemyDie', p, src);
    }
    gameOver(reason) {
      if (this.over) return;
      this.over = true;
      this.overReason = reason;
      this.fire('gameOver', reason);
      this.later(() => U.bus.emit('dialog', 'revive', reason), 700);
    }
    giveUp() {
      this.finish(false);
    }
    finish(win) {
      const st = this.st;
      const w = this.world;
      let ending = -1;
      const M = PF.Save.meta;
      if (win && !this.endless) {
        const allWorlds = Object.keys(st.worlds).length >= 4;
        const all = w.unlockedCount() >= N * N;
        ending = allWorlds ? (all ? 2 : 1) : 0;
        if (!this.debug) {
          M.endings[ending] = true;
          M.endingSkins[ending] = this.skins.slice();
          st.newBest = PF.Save.setBest(this.twoP, st.elapsed);
        }
      }
      st.won = 'ended';
      PF.Save.clearRun(this.twoP, this.endless);
      const data = { win, ending, newly: [], extra: [] };
      this.fire('runEnd', win, ending, data);
      data.newly = this.debug ? [] : PF.Save.refreshUnlocks();
      PF.Save.saveMeta();
      U.bus.emit('dialog', 'over', data);
    }
    checkTasks() {
      const st = this.st,
        w = this.world;
      const done = [
        w.unlockedCount() - 5 >= 6,
        this.workers.some((x) => x.type >= 0),
        w.building('wood').built,
        w.building('rice').built,
        w.building('shop').built,
        w.building('crystal').built,
        st.tasks[6],
        st.tasks[7],
      ];
      for (let i = 0; i < 8; i++) {
        if (!st.tasks[i] && done[i]) {
          st.tasks[i] = true;
          const r = D.TASKS[i].reward;
          if (r) for (let k = 0; k < 4; k++) if (r[k]) this.addRes(k, r[k]);
          U.bus.emit('task', i);
          this.fire('task', i);
        }
      }
    }
    currentTask() {
      if (this.endless) return -1;
      for (const i of TASK_ORDER) if (!this.st.tasks[i]) return i;
      return -1;
    }
    taskProgress(i) {
      if (i === 0) return Math.min(6, this.world.unlockedCount() - 5) + '/6';
      return '';
    }
    enterPortal(p) {
      if (this.isNight() || this.pirates.some((e) => !e.dead)) {
        this.toast(this.isNight() ? '夜里洞窟被迷雾封住了，天亮再来吧' : '先把附近的敌人打退再进洞窟');
        A.play('wrong');
        return;
      }
      if (!this.st.tasks[6]) {
        this.st.tasks[6] = true;
        const r = D.TASKS[6].reward;
        if (r) this.addRes(3, r[3]);
        U.bus.emit('task', 6);
        this.fire('task', 6);
      }
      U.bus.emit('dialog', 'portal', p);
    }
    startMini(p) {
      A.play('portal');
      this.mini = new PF.Mini[p.world](this, p, (ok) => this.endMini(p, ok));
      A.music('mini');
    }
    endMini(p, ok) {
      const st = this.st;
      let reward = '';
      if (ok) {
        const first = !st.worlds[p.world];
        st.worlds[p.world] = true;
        p.cleared = true;
        PF.Save.meta.stats.worldSet[p.world] = true;
        if (first) {
          switch (p.world) {
            case 'danger':
              st.holySword = true;
              this.addRes(3, 30);
              reward = '获得【神光剑】攻击力翻倍 · 金币 +30';
              break;
            case 'lost':
              st.superMan = true;
              this.addRes(3, 30);
              reward = '一只精灵进化为【森林先知】' + (this.workers.length ? '' : '（召唤精灵后生效）') + ' · 金币 +30';
              break;
            case 'number':
              this.addRes(3, 80);
              reward = '金币 +80';
              break;
            case 'reversal':
              st.speedUpT += 600;
              this.addRes(3, 40);
              reward = '精灵加速 10 分钟 · 金币 +40';
              break;
          }
        } else {
          this.addRes(3, 15);
          reward = '再次通关：金币 +15';
        }
        PF.Save.refreshUnlocks();
        PF.Save.saveMeta();
      }
      this.mini = null;
      for (const pl of this.players) {
        pl.x = p.x + (this.players.length > 1 ? (pl.idx ? 40 : -40) : 0);
        pl.y = p.y + 70;
        pl.actKind = null;
        pl.invuln = 1;
      }
      this.cam.follow(this.players, 0, true);
      A.music(this.isNight() ? 'night' : 'day');
      this.fire('miniEnd', p.world, ok);
      U.bus.emit('dialog', 'miniResult', { world: p.world, ok, reward });
      this.save();
    }
    sail() {
      const dk = this.world.dock;
      if (!dk || !dk.built || this.cut) return;
      const [vx, vy] = PF.World.DIRV[dk.dir];
      const dist = PF.World.CH + T * 0.55;
      this.cut = { kind: 'sail', t: 0, dur: 3.2, x0: dk.x + vx * 70, y0: dk.y + vy * 70, x1: dk.x + vx * (70 + dist), y1: dk.y + vy * (70 + dist) };
      A.play('splash');
      A.music('menu');
    }
    afterSail(endNow) {
      if (endNow) {
        this.st.tasks[7] = true;
        this.fire('win');
        this.finish(true);
      } else {
        const dk = this.world.dock;
        const [vx, vy] = PF.World.DIRV[dk.dir];
        for (const p of this.players) {
          p.x = dk.x - vx * 170 + (p.idx ? 40 : 0);
          p.y = dk.y - vy * 170 + 10;
          if (!this.world.walkable(p.x, p.y, p.r)) {
            const c = this.world.camp();
            p.x = c.x;
            p.y = c.y + 110;
          }
        }
        this.cut = null;
        this.st.won = true;
        A.music(this.isNight() ? 'night' : 'day');
        this.save();
      }
    }

    /* ---------- 昼夜 ---------- */
    cycleLen() {
      return this.dayLen + this.nightLen;
    }
    isNight() {
      const t = this.st.cycleT;
      return t >= this.dayLen - D.DUSK / 2 && t < this.cycleLen() - D.DUSK / 2;
    }
    darkness() {
      const t = this.st.cycleT;
      const a = this.dayLen - D.DUSK;
      const C = this.cycleLen();
      let v;
      if (t < a) v = 0;
      else if (t < this.dayLen) v = (t - a) / D.DUSK;
      else if (t < C - D.DUSK) v = 1;
      else v = 1 - (t - (C - D.DUSK)) / D.DUSK;
      return U.clamp(v * this.mods.darknessMul, 0, 1);
    }
    stepCycle(dt) {
      const st = this.st;
      const prev = st.cycleT;
      const L = this.dayLen,
        C = this.cycleLen();
      st.cycleT += dt;
      const cross = (x) => prev < x && st.cycleT >= x;
      if (cross(L - D.DUSK)) {
        A.music('night');
        U.bus.emit('dusk');
        this.fire('dusk');
      }
      if (cross(L)) {
        if (!this.endless) {
          st.letterUnread = true;
          A.play('letter');
          U.bus.emit('letter');
        }
        this.fire('night');
      }
      if (cross(L + 10)) {
        st.countdown = 10;
        A.play('alarm');
      }
      if (cross(L + 20)) this.spawnRaid();
      if (cross(C - D.DUSK)) A.music('day');
      if (st.countdown > 0) st.countdown = Math.max(0, L + 20 - st.cycleT);
      if (st.cycleT >= C) {
        st.cycleT -= C;
        st.day++;
        st.countdown = -1;
        U.bus.emit('day', st.day);
        this.fire('dawn', st.day);
        this.save();
      }
    }
    raidPlan(day) {
      const row = D.PIRATES[Math.min(day, D.PIRATES.length - 1)].slice();
      // 第 20 天以后继续变强
      if (day >= D.PIRATES.length) {
        const extra = day - D.PIRATES.length + 1;
        row[0] += Math.floor(extra / 2);
        row[1] += Math.floor(extra / 3);
        row[2] += Math.floor(extra / 4);
      }
      const q = [];
      row.forEach((n, k) => {
        const m = Math.max(0, Math.round(n * this.mods.enemyCountMul));
        for (let i = 0; i < m; i++) q.push(k);
      });
      return U.shuffle(q);
    }
    spawnRaid() {
      const st = this.st;
      st.countdown = -1;
      st.raidDay = st.day;
      const q = this.raidPlan(st.day);
      const dirs = U.shuffle([0, 1, 2, 3]);
      let ship = null;
      for (const d of dirs) {
        const outer = this.world.outerTiles(d).filter((t) => t.i !== PF.World.CENTER);
        if (!outer.length) continue;
        const t = U.pick(outer);
        ship = this.spawnShip(d, t.i, q);
        this.toast('海盗从' + DIR_NAME[d] + '边登陆了！停在海盗旁边会自动挥剑');
        U.bus.emit('raid', d);
        break;
      }
      this.fire('raid', ship);
    }
    spawnShip(dir, tile, queue) {
      const s = new E.Ship(this, dir, tile, queue);
      this.ships.push(s);
      return s;
    }

    /* ---------- 交互提示 ---------- */
    findPrompt(p) {
      if (p.down || this.cut) return null;
      const w = this.world;
      for (const b of w.buildings) {
        if (Math.abs(p.x - b.x) > 200 || Math.abs(p.y - b.y) > 200) continue;
        if (!p.nearBox(w.footprint(b), 62)) continue;
        if (b.kind === 'camp') return { kind: 'camp', label: '营地', target: b };
        if (!b.built) return { kind: 'build', label: '建造' + D.BUILDINGS[b.kind].name, cost: D.BUILDINGS[b.kind].cost, target: b };
        if (b.kind === 'shop') return { kind: 'shop', label: '集市', target: b };
        return { kind: 'industry', label: D.BUILDINGS[b.kind].name, target: b };
      }
      const dk = w.dock;
      if (dk && U.dist(p.x, p.y, dk.x, dk.y) < 110) {
        if (!dk.built) return { kind: 'dock', label: '建造木筏', cost: D.BUILDINGS.dock.cost, target: dk };
        return { kind: 'sail', label: '启航！', target: dk };
      }
      for (const pt of w.portals) {
        if (!w.tiles[pt.tile].unlocked) continue;
        if (U.dist(p.x, p.y, pt.x, pt.y + 10) < 95) return { kind: 'portal', label: '进入' + D.WORLDS[pt.world].name, target: pt };
      }
      // 各玩法系统的交互点
      for (const s of PF.Sys.list) {
        if (!s.prompt) continue;
        let r = null;
        try {
          r = s.prompt(this, p);
        } catch (e) {
          console.error('[sys prompt]', s.id, e);
        }
        if (r) {
          r.kind = 'sys';
          r.sys = s.id;
          return r;
        }
      }
      // 地块边缘
      const c = Math.floor(p.x / T),
        r = Math.floor(p.y / T);
      if (c < 0 || r < 0 || c >= N || r >= N) return null;
      const lx = p.x - c * T,
        ly = p.y - r * T;
      const M = 72;
      let best = null,
        bd = 1e9;
      const cand = (rr, cc, d) => {
        if (rr < 0 || cc < 0 || rr >= N || cc >= N) return;
        const t = w.tiles[rr * N + cc];
        if (t.unlocked) return;
        if (d < bd) {
          bd = d;
          best = t;
        }
      };
      if (ly < M + 10) cand(r - 1, c, ly);
      if (ly > T - M) cand(r + 1, c, T - ly);
      if (lx < M) cand(r, c - 1, lx);
      if (lx > T - M) cand(r, c + 1, T - lx);
      if (best) return { kind: 'unlock', label: '驱散迷雾', cost: this.tileCost(best), target: best };
      return null;
    }
    doPrompt(pi) {
      const pr = this.prompts[pi];
      if (!pr || this.paused || this.mini || this.over) return;
      A.play('click');
      switch (pr.kind) {
        case 'unlock':
          this.unlockTile(pr.target.i);
          break;
        case 'build':
          this.build(pr.target.kind);
          break;
        case 'camp':
          U.bus.emit('dialog', 'camp', pi);
          break;
        case 'industry':
          U.bus.emit('dialog', 'industry', pr.target.kind);
          break;
        case 'shop':
          U.bus.emit('dialog', 'shop', pi);
          break;
        case 'dock':
          this.buildDock();
          break;
        case 'sail':
          this.sail();
          break;
        case 'portal':
          this.enterPortal(pr.target);
          break;
        case 'sys': {
          const s = PF.Sys.get(pr.sys);
          if (s && s.act)
            try {
              s.act(this, pi, pr);
            } catch (e) {
              console.error('[sys act]', s.id, e);
            }
          break;
        }
      }
    }

    /* ---------- 更新 ---------- */
    update(dt) {
      dt *= this.timeScale;
      if (this.mini) {
        if (this.paused) return;
        this.st.elapsed += dt;
        this.mini.update(dt);
        return;
      }
      if (this.paused) return;
      const st = this.st,
        w = this.world;
      this.time += dt;
      if (!this.over) st.elapsed += dt;
      if (this.toastCD > 0) this.toastCD -= dt;
      if (st.speedUpT > 0) st.speedUpT = Math.max(0, st.speedUpT - dt);
      this.cam.shake = Math.max(0, this.cam.shake - dt * 20);

      // 过场：乘木筏
      if (this.cut) {
        const c = this.cut;
        c.t += dt;
        const k = U.easeInOut(Math.min(1, c.t / c.dur));
        c.x = U.lerp(c.x0, c.x1, k);
        c.y = U.lerp(c.y0, c.y1, k);
        this.players.forEach((p, i) => {
          p.x = c.x + (i ? 30 : -10);
          p.y = c.y - 20;
          p.moving = false;
        });
        if (c.t >= c.dur && !c.fired) {
          c.fired = true;
          U.bus.emit('dialog', 'win');
        }
        this.cam.follow([{ x: c.x, y: c.y }], dt);
        this.fx.update(dt);
        return;
      }

      if (!this.over) this.stepCycle(dt);
      // 玩家
      for (const p of this.players) {
        const mv = PF.Input.move(p.idx);
        if (this.over) p.update(dt, { x: 0, y: 0 });
        else p.update(dt, mv);
      }
      // 交互提示
      const pv = w.previewAmt;
      let want0 = -1,
        want1 = -1;
      for (const p of this.players) {
        const pr = this.findPrompt(p);
        this.prompts[p.idx] = pr;
        if (pr && pr.kind === 'unlock') {
          if (p.idx === 0) want0 = pr.target.i;
          else want1 = pr.target.i;
        }
        if (PF.Input.act(p.idx) && pr) this.doPrompt(p.idx);
      }
      for (let i = 0; i < N * N; i++) {
        const tgt = i === want0 || i === want1;
        if (!tgt && pv[i] === 0) continue;
        pv[i] = U.clamp(pv[i] + (tgt ? dt * 3 : -dt * 2.5), 0, 1);
      }
      // 宝箱
      for (const ch of w.chests) {
        if (ch.opened || !w.tiles[ch.tile].unlocked) continue;
        for (const p of this.players) {
          if (!p.down && U.dist(p.x, p.y, ch.x, ch.y) < 64) {
            ch.opened = true;
            this.addRes(3, ch.gold, ch.x, ch.y - 90);
            this.fx.sparkle(ch.x, ch.y - 30, '#ffe36b');
            A.play('coin');
            this.toast('打开宝箱：金币 +' + ch.gold);
            this.fire('chest', ch, p);
            break;
          }
        }
      }
      // 资源再生
      const rg = this.mods.regrowMul;
      for (const n of w.nodes) {
        if (n.shake > 0) n.shake -= dt;
        if (n.hp > 0 || !w.tiles[n.tile].unlocked) continue;
        n.regrow -= dt * rg;
        if (n.regrow <= 0) {
          n.max = this.nodeMax(n);
          n.hp = n.max;
        }
      }
      // 建筑产出
      const pm = this.mods.prodMul;
      for (const b of w.buildings) {
        const def = D.BUILDINGS[b.kind];
        if (b.flash > 0) b.flash -= dt;
        if (!b.built || !def.prod) continue;
        b.prodT += dt * pm;
        if (b.prodT >= def.prod) {
          b.prodT -= def.prod;
          this.addRes(def.res, 1, b.x + U.rand(-30, 30), b.y - 170);
        }
      }
      // 精灵、敌人、船
      for (const wk of this.workers) wk.update(dt);
      for (const p of this.pirates) p.update(dt);
      if (this.pirates.some((p) => p.dead && !(p.deadT > 0))) this.pirates = this.pirates.filter((p) => !p.dead || p.deadT > 0);
      for (const s of this.ships) s.update(dt);
      if (this.ships.some((s) => s.done)) this.ships = this.ships.filter((s) => !s.done);
      // 各玩法系统
      this.fire('update', dt);
      // 环境
      this.gullT -= dt;
      if (this.gullT <= 0) {
        this.gullT = U.rand(6, 12);
        const n = U.randi(1, 3);
        for (let k = 0; k < n; k++) {
          const gl = new E.Gull(this);
          gl.x += U.rand(-80, 80);
          gl.y += U.rand(-80, 80);
          this.gulls.push(gl);
        }
      }
      for (const g of this.gulls) g.update(dt);
      if (this.gulls.some((g) => g.life <= 0)) this.gulls = this.gulls.filter((g) => g.life > 0);
      for (const f of this.fins) f.update(dt);
      for (const c of this.crabs) c.update(dt);
      this.fx.update(dt);
      // 镜头
      const alive = this.players.filter((p) => !p.down);
      this.cam.follow(alive.length ? alive : this.players, dt);
      // 自动存档
      this.saveT += dt;
      if (this.saveT > 8) {
        this.saveT = 0;
        this.save();
      }
    }

    /* ---------- 绘制 ---------- */
    render(ctx, dpr) {
      if (this.mini) return this.mini.render(ctx, dpr);
      const cam = this.cam;
      const w = this.world;
      const time = this.time;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.imageSmoothingEnabled = false;
      cam.updateView();
      cam.apply(ctx, dpr);
      ctx.imageSmoothingEnabled = false;
      w.drawSea(ctx, cam, time);
      for (const f of this.fins) if (cam.visible(f.x, f.y, 60)) f.draw(ctx);
      w.drawMainland(ctx, cam, time);
      w.drawTiles(ctx, cam, time);
      this.drawTargetRings(ctx);
      this.fire('drawGround', ctx, cam);
      // y 排序的物体
      const list = [];
      const add = (y, fn) => list.push({ y, fn });
      for (const n of w.nodes) {
        if (!w.tiles[n.tile].unlocked && w.previewAmt[n.tile] < 0.05) continue;
        if (!cam.visible(n.x, n.y, 160)) continue;
        add(n.y, () => this.drawNode(ctx, n));
      }
      for (const b of w.buildings) if (cam.visible(b.x, b.y, 260)) add(b.y, () => this.drawBuilding(ctx, b));
      for (const p of w.portals) if ((w.tiles[p.tile].unlocked || w.previewAmt[p.tile] > 0.05) && cam.visible(p.x, p.y, 200)) add(p.y, () => this.drawPortal(ctx, p));
      for (const c of w.chests) if ((w.tiles[c.tile].unlocked || w.previewAmt[c.tile] > 0.05) && cam.visible(c.x, c.y, 80)) add(c.y, () => this.drawChest(ctx, c));
      if (w.dock && cam.visible(w.dock.x, w.dock.y, 300)) add(w.dock.y - (w.dock.dir === 1 ? -60 : 0), () => this.drawDock(ctx, w.dock));
      for (const c of this.crabs) if (cam.visible(c.x, c.y, 60)) add(c.y, () => c.draw(ctx));
      for (const p of this.players) add(p.y, () => p.draw(ctx));
      for (const wk of this.workers) if (cam.visible(wk.x, wk.y, 120)) add(wk.y, () => wk.draw(ctx));
      for (const p of this.pirates) if (cam.visible(p.x, p.y, 160)) add(p.y, () => p.draw(ctx));
      for (const s of this.ships) add(s.y - 40, () => s.draw(ctx));
      if (this.cut) add(this.cut.y + 1, () => this.drawSailRaft(ctx));
      this.fire('drawables', add, cam);
      list.sort((a, b) => a.y - b.y);
      for (const it of list) it.fn();
      this.fx.draw(ctx);
      this.fire('drawTop', ctx, cam);
      for (const g of this.gulls) g.drawShadow(ctx);
      w.drawFog(ctx, cam, time);
      for (const g of this.gulls) if (cam.visible(g.x, g.y, 80)) g.draw(ctx);
      this.fire('drawOverFog', ctx, cam);
      // 夜晚光照
      this.drawLight(ctx, dpr);
      // 屏幕空间
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      this.fire('drawScreen', ctx, dpr, cam);
      this.drawOffscreen(ctx);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    }
    /* 正在采集 / 攻击的目标脚下画个圈，让“停下=自动干活”看得见 */
    drawTargetRings(ctx) {
      for (const p of this.players) {
        if (!p.actKind || !p.actTarget || p.down) continue;
        const t = p.actTarget;
        const col = p.actKind === 'atk' ? 'rgba(255,90,79,0.8)' : p.actKind === 'repair' ? 'rgba(155,227,138,0.8)' : 'rgba(255,240,170,0.85)';
        const r = p.actKind === 'repair' ? 90 : 36;
        ctx.strokeStyle = col;
        ctx.lineWidth = 5;
        ctx.setLineDash([12, 8]);
        ctx.lineDashOffset = -this.time * 30;
        ctx.beginPath();
        ctx.ellipse(t.x, t.y + 2, r, r * 0.38, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }
    /* 屏幕外的敌人：边缘红色箭头 */
    drawOffscreen(ctx) {
      const cam = this.cam;
      const W = cam.W,
        H = cam.H;
      let n = 0;
      const arrow = (sx, sy, col, label) => {
        const cx = W / 2,
          cy = H / 2;
        const dx = sx - cx,
          dy = sy - cy;
        const m = 36;
        const k = Math.min((W / 2 - m) / Math.abs(dx || 1e-6), (H / 2 - m) / Math.abs(dy || 1e-6));
        const ax = cx + dx * k,
          ay = cy + dy * k;
        const ang = Math.atan2(dy, dx);
        ctx.save();
        ctx.translate(ax, ay);
        ctx.rotate(ang);
        ctx.fillStyle = col;
        ctx.strokeStyle = '#1c1424';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(16, 0);
        ctx.lineTo(-10, -12);
        ctx.lineTo(-4, 0);
        ctx.lineTo(-10, 12);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.restore();
        if (label) {
          ctx.font = 'bold 13px sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.lineWidth = 4;
          ctx.strokeStyle = '#1c1424';
          ctx.strokeText(label, ax - Math.cos(ang) * 24, ay - Math.sin(ang) * 24);
          ctx.fillStyle = '#fff';
          ctx.fillText(label, ax - Math.cos(ang) * 24, ay - Math.sin(ang) * 24);
        }
      };
      const pulse = 0.65 + Math.sin(this.time * 8) * 0.35;
      for (const e of this.pirates) {
        if (e.dead || n >= 8) continue;
        const s = cam.toScreen(e.x, e.y - 40);
        if (s.x > -10 && s.x < W + 10 && s.y > -10 && s.y < H + 10) continue;
        n++;
        arrow(s.x, s.y, `rgba(255,70,60,${pulse})`, e.isBoss ? '首领' : null);
      }
      for (const s of this.ships) {
        if (s.state === 'leave') continue;
        const p = cam.toScreen(s.x, s.y);
        if (p.x > 0 && p.x < W && p.y > 0 && p.y < H) continue;
        arrow(p.x, p.y, `rgba(255,70,60,${pulse})`, '海盗船');
      }
      const camp = this.world.camp();
      if (camp.flash > 0 || (this.st.campHp < this.campHpMax() * 0.5 && this.pirates.some((e) => !e.dead))) {
        const p = cam.toScreen(camp.x, camp.y - 60);
        if (p.x < 0 || p.x > W || p.y < 0 || p.y > H) arrow(p.x, p.y, '#ffb238', '营地');
      }
    }
    drawNode(ctx, n) {
      const w = this.world;
      const locked = !w.tiles[n.tile].unlocked;
      if (locked) ctx.globalAlpha = w.previewAmt[n.tile] * 0.85;
      let img,
        sx = 0;
      if (n.shake > 0) sx = Math.sin(n.shake * 80) * 4;
      if (n.hp > 0) {
        if (n.type === 0) {
          img = S.tree(n.big, n.variant || 'leaf', n.vs);
          E.shadow(ctx, n.x, n.y, n.big ? 46 : 32, n.big ? 14 : 10);
        } else if (n.type === 1) img = S.rice(n.big, n.vs);
        else {
          img = S.crystal(n.big, n.vs);
          E.shadow(ctx, n.x, n.y, n.big ? 44 : 30, 10);
        }
      } else {
        if (n.regrow > 99000) {
          ctx.globalAlpha = 1;
          return;
        }
        img = n.type === 0 ? S.stump(n.big) : n.type === 1 ? S.stubble(n.big) : S.rubble(n.big);
      }
      E.drawSprite(ctx, img, n.x + sx, n.y + 6);
      ctx.globalAlpha = 1;
    }
    drawBuilding(ctx, b) {
      const fp = this.world.footprint(b);
      const built = b.built || b.kind === 'camp';
      const img = built ? S.building(b.kind) : S.building('site');
      E.shadow(ctx, b.x, b.y - 4, (fp.x1 - fp.x0) * 0.55, 22, 0.22);
      E.drawSprite(ctx, img, b.x, b.y + 8, { flash: b.flash > 0 ? 0.5 : 0 });
      if (b.kind === 'camp') {
        // 营火
        const fx = b.x + 110,
          fy = b.y + 30;
        ctx.fillStyle = '#5b3a24';
        ctx.fillRect(fx - 24, fy - 8, 48, 10);
        const fl = Math.sin(this.time * 18) * 3;
        ctx.fillStyle = '#ff6a2a';
        ctx.fillRect(fx - 14, fy - 30 - fl, 28, 26 + fl);
        ctx.fillStyle = '#ffd23f';
        ctx.fillRect(fx - 8, fy - 24 + fl, 16, 18 - fl);
        ctx.fillStyle = '#fff4b0';
        ctx.fillRect(fx - 4, fy - 14, 8, 8);
        const hpF = this.st.campHp / this.campHpMax();
        if (hpF < 1 || this.isNight()) E.hpBar(ctx, b.x, b.y - 190, 120, hpF, hpF > 0.35 ? '#5bd16a' : '#ff5a4f');
        // 小游戏通关标志（旗子）
        const ws = Object.keys(this.st.worlds);
        ws.forEach((k, i) => {
          const fx2 = b.x - 120 + i * 26;
          ctx.fillStyle = '#6b4a2f';
          ctx.fillRect(fx2, b.y - 50, 4, 50);
          ctx.fillStyle = D.WORLDS[k].color;
          ctx.fillRect(fx2 + 4, b.y - 50, 18, 12);
        });
      }
      // 名牌
      const name = b.kind === 'camp' ? '营地' : D.BUILDINGS[b.kind].name + (built ? '' : '（待建）');
      this.namePlate(ctx, b.x, b.y - (built ? 176 : 150), name, built ? '#fff4b0' : '#ffffff');
    }
    namePlate(ctx, x, y, text, col) {
      ctx.font = 'bold 24px "PingFang SC","Microsoft YaHei",sans-serif';
      const w = ctx.measureText(text).width + 22;
      ctx.fillStyle = 'rgba(28,20,36,0.78)';
      ctx.fillRect(x - w / 2, y - 18, w, 34);
      ctx.fillStyle = col || '#fff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, x, y);
    }
    drawPortal(ctx, p) {
      const w = this.world;
      const locked = !w.tiles[p.tile].unlocked;
      if (locked) ctx.globalAlpha = w.previewAmt[p.tile] * 0.85;
      const W = D.WORLDS[p.world];
      E.shadow(ctx, p.x, p.y, 80, 16);
      E.drawSprite(ctx, S.portal(W.color, Math.floor(this.time * 6) % 4), p.x, p.y + 8);
      if (!locked) this.namePlate(ctx, p.x, p.y - 196, W.name + (p.cleared ? ' ★' : ''), p.cleared ? '#ffe36b' : '#fff');
      ctx.globalAlpha = 1;
    }
    drawChest(ctx, c) {
      const w = this.world;
      const locked = !w.tiles[c.tile].unlocked;
      if (locked) ctx.globalAlpha = w.previewAmt[c.tile] * 0.85;
      E.shadow(ctx, c.x, c.y, 34, 9);
      const bob = c.opened ? 0 : Math.abs(Math.sin(this.time * 3)) * -4;
      E.drawSprite(ctx, S.chest(c.opened), c.x, c.y + 4 + bob);
      if (!c.opened && !locked) {
        ctx.fillStyle = 'rgba(255,230,120,' + (0.4 + Math.sin(this.time * 4) * 0.3) + ')';
        ctx.fillRect(c.x - 3, c.y - 92, 6, 14);
        ctx.fillRect(c.x - 3, c.y - 72, 6, 6);
      }
      ctx.globalAlpha = 1;
    }
    drawDock(ctx, dk) {
      const [vx, vy] = PF.World.DIRV[dk.dir];
      if (!dk.built) {
        E.drawSprite(ctx, S.building('dockSite'), dk.x, dk.y + 10);
        this.namePlate(ctx, dk.x, dk.y - 120, '木筏（待建）', '#fff');
      } else {
        if (this.cut) return;
        const bob = Math.sin(this.time * 2) * 3;
        E.drawSprite(ctx, S.raft(true), dk.x + vx * 70, dk.y + vy * 70 + 30 + bob);
        this.namePlate(ctx, dk.x + vx * 70, dk.y + vy * 70 - 130, '木筏', '#fff4b0');
      }
    }
    drawSailRaft(ctx) {
      const c = this.cut;
      const bob = Math.sin(this.time * 2) * 3;
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.fillRect(c.x - 80, c.y + 26 + bob, 160, 6);
      E.drawSprite(ctx, S.raft(true), c.x, c.y + 30 + bob);
    }
    drawLight(ctx, dpr) {
      const dark = this.darkness();
      if (dark <= 0.01) return;
      const cam = this.cam;
      const LS = 3; // 光照层分辨率 = 屏幕 / 3
      const lw = Math.ceil(cam.W / LS),
        lh = Math.ceil(cam.H / LS);
      const lc = this.lightCv;
      if (lc.width !== lw || lc.height !== lh) {
        lc.width = lw;
        lc.height = lh;
      }
      const stamps = lightStamps();
      const x = this.lightCx;
      x.setTransform(1, 0, 0, 1, 0, 0);
      x.globalCompositeOperation = 'source-over';
      x.globalAlpha = 1;
      x.clearRect(0, 0, lw, lh);
      const t = this.st.cycleT;
      const dusk = t < this.dayLen ? U.clamp(1 - (t - (this.dayLen - D.DUSK)) / D.DUSK, 0, 1) : 0;
      const col = dusk > 0 ? `rgba(${Math.round(U.lerp(12, 70, dusk))},${Math.round(U.lerp(14, 30, dusk))},${Math.round(U.lerp(44, 50, dusk))},${0.8 * dark})` : `rgba(12,14,44,${0.8 * dark})`;
      x.fillStyle = col;
      x.fillRect(0, 0, lw, lh);
      x.globalCompositeOperation = 'destination-out';
      const light = (wx, wy, r, a) => {
        const s = cam.toScreen(wx, wy);
        const sx = s.x / LS,
          sy = s.y / LS,
          sr = (r * cam.z) / LS;
        if (sx < -sr || sy < -sr || sx > lw + sr || sy > lh + sr) return;
        x.globalAlpha = a == null ? 1 : a;
        x.drawImage(stamps.cut, sx - sr, sy - sr, sr * 2, sr * 2);
      };
      const camp = this.world.camp();
      const flick = 1 + Math.sin(this.time * 9) * 0.03;
      light(camp.x + 60, camp.y - 20, 380 * flick, 1);
      for (const p of this.players) light(p.x, p.y - 50, p.down ? 160 : 260, 0.95);
      for (const b of this.world.buildings) if (b.built && b.kind !== 'camp') light(b.x, b.y - 60, 220, 0.85);
      for (const p of this.world.portals) if (this.world.tiles[p.tile].unlocked) light(p.x, p.y - 60, 200, 0.8);
      for (const w of this.workers) if (!w.dead) light(w.x, w.y - 30, w.sup ? 150 : 90, 0.6);
      for (const s of this.ships) light(s.x, s.y - 60, 200, 0.7);
      if (this.world.dock && this.world.dock.built) light(this.world.dock.x, this.world.dock.y, 160, 0.7);
      if (this.cut) light(this.cut.x, this.cut.y, 300, 1);
      this.fire('lights', light);
      x.globalAlpha = 1;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(lc, 0, 0, lw, lh, 0, 0, lw * LS * dpr, lh * LS * dpr);
      // 暖色火光
      ctx.globalCompositeOperation = 'lighter';
      const s = cam.toScreen(camp.x + 110, camp.y + 10);
      const r = 200 * cam.z * dpr;
      ctx.globalAlpha = 0.22 * dark;
      ctx.drawImage(stamps.warm, s.x * dpr - r, s.y * dpr - r, r * 2, r * 2);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      ctx.imageSmoothingEnabled = false;
    }
  }

  /* 预先画好的光斑（避免每帧创建渐变） */
  let STAMPS = null;
  function lightStamps() {
    if (STAMPS) return STAMPS;
    const mkStamp = (stops) => {
      const c = document.createElement('canvas');
      c.width = c.height = 128;
      const x = c.getContext('2d');
      const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
      for (const s of stops) g.addColorStop(s[0], s[1]);
      x.fillStyle = g;
      x.fillRect(0, 0, 128, 128);
      return c;
    };
    STAMPS = {
      cut: mkStamp([
        [0, 'rgba(0,0,0,1)'],
        [0.55, 'rgba(0,0,0,0.75)'],
        [1, 'rgba(0,0,0,0)'],
      ]),
      warm: mkStamp([
        [0, 'rgba(255,140,40,1)'],
        [1, 'rgba(255,140,40,0)'],
      ]),
    };
    return STAMPS;
  }

  PF.Camera = Camera;
  PF.Game = Game;
  PF.Game.TASK_ORDER = TASK_ORDER;
  PF.Game.DIR_NAME = DIR_NAME;
  PF.Game.lightStamps = lightStamps;
})();
