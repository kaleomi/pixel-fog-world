/* 主玩法：资源、建筑、升级、昼夜、海盗来袭、任务、存档、渲染与夜间光照 */
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
  const CYCLE = D.DAY_LEN + D.NIGHT_LEN; // 220
  const SAVE_VER = 1;

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
      this.skins = opts.skins.slice();
      this.cam = new Camera();
      this.fx = new E.Fx();
      this.pirates = [];
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
      this.timeScale = Number(U.qs.get('fast')) || 1;
      const sv = opts.save;
      if (sv && sv.v === SAVE_VER) this.load(sv);
      else this.fresh();
      this.cam.follow(this.players, 0, true);
      this.initAmbient();
      this.lightCv = document.createElement('canvas');
      this.lightCx = this.lightCv.getContext('2d');
    }
    fresh() {
      const seed = (Math.random() * 1e9) | 0;
      this.world = new PF.World(seed);
      this.st = {
        res: [10, 0, 0, 15],
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
        freeRevive: true,
        letterIdx: 0,
        letterUnread: false,
        won: false,
        lettersRead: 0,
        countdown: -1,
      };
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

    /* ---------- 存档 ---------- */
    serialize() {
      return {
        v: SAVE_VER,
        twoP: this.twoP,
        skins: this.skins,
        st: this.st,
        world: this.world.serialize(),
        players: this.players.map((p) => ({ x: Math.round(p.x), y: Math.round(p.y), hp: p.hp, down: p.down })),
        workers: this.workers.map((w) => ({ type: w.type, x: Math.round(w.x), y: Math.round(w.y), hp: w.hp, carry: w.carry })),
        pirates: this.pirates.filter((p) => !p.dead && p.state !== 'sail').map((p) => ({ kind: p.kind, x: Math.round(p.x), y: Math.round(p.y), hp: p.hp })),
      };
    }
    load(sv) {
      this.world = new PF.World(sv.world.seed, sv.world);
      this.st = sv.st;
      this.players = sv.players.map((d, i) => {
        const p = new E.Player(this, i, this.skins[i]);
        p.x = d.x;
        p.y = d.y;
        p.hp = Math.max(1, d.hp);
        return p;
      });
      this.workers = sv.workers.map((d) => {
        const w = new E.Worker(this, d.type);
        w.x = d.x;
        w.y = d.y;
        w.hp = d.hp;
        w.carry = d.carry || 0;
        if (w.carry > 0) w.state = 'back';
        return w;
      });
      this.pirates = (sv.pirates || []).map((d) => {
        const p = new E.Pirate(this, d.kind, d.x, d.y, { x: d.x, y: d.y });
        p.state = 'walk';
        p.hp = d.hp;
        return p;
      });
    }
    save() {
      if (this.over || this.st.won === 'ended') return;
      PF.Save.saveRun(this.twoP, this.serialize());
    }

    /* ---------- 经济 ---------- */
    canAfford(cost) {
      if (!cost) return true;
      for (let i = 0; i < 4; i++) if (cost[i] > this.st.res[i]) return false;
      return true;
    }
    pay(cost) {
      if (!this.canAfford(cost)) return false;
      for (let i = 0; i < 4; i++) this.st.res[i] -= cost[i] || 0;
      U.bus.emit('res');
      return true;
    }
    addRes(i, n, x, y) {
      if (!n) return;
      this.st.res[i] += n;
      if (x != null) this.fx.icon(x, y, i, n);
      U.bus.emit('res', i);
    }
    harvest(node, amt, player) {
      node.hp -= amt;
      node.shake = 0.18;
      if (player) {
        this.addRes(node.type, amt, player.x, player.y - 140);
        this.st.gathered[player.idx][node.type] += amt;
        PF.Save.addStat(['wood', 'rice', 'crystal'][node.type], amt);
      } else {
        PF.Save.addStat(['wood', 'rice', 'crystal'][node.type], amt);
      }
      if (node.hp <= 0) {
        node.hp = 0;
        const key = ['wood', 'rice', 'crystal'][node.type];
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
      return D.CAMP.hp.vals[this.world.camp().lv[3]];
    }
    workerCap() {
      return D.CAMP.cap.vals[this.world.camp().lv[0]];
    }
    tileCost(t) {
      return D.TILE_COST[Math.min(8, Math.max(2, t.d))];
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
      if (!wasRevealed && w.revealed) {
        this.placeDock(t);
        setTimeout(() => this.toast('雾的尽头出现了一片大陆！在岸边造木筏就能过去'), 600);
        A.play('success');
      }
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
      for (const n of this.world.nodesByTile[t.i]) if (U.dist(n.x, n.y, pos[0], pos[1]) < 80) n.hp = 0, (n.regrow = 99999);
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
      this.save();
      return true;
    }
    hire() {
      if (this.workers.length >= this.workerCap()) {
        this.toast('精灵数量已达上限，去营地升级“精灵上限”');
        A.play('wrong');
        return false;
      }
      const cost = [0, 0, 0, D.hireCost(this.workers.length)];
      if (!this.pay(cost)) {
        this.toast('金币不足');
        A.play('wrong');
        return false;
      }
      const w = new E.Worker(this, -1);
      this.workers.push(w);
      this.st.hired++;
      this.fx.sparkle(w.x, w.y - 40, '#9be38a');
      A.play('pop');
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
        const idle = this.workers.find((w) => w.type < 0);
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
      const c = (w, r, k, g) => [w || 0, r || 0, k || 0, g || 0];
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
      void c;
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
        if (!st.freeRevive) return false;
        st.freeRevive = false;
      }
      for (const p of this.players) p.revive(1);
      if (st.campHp <= 0) st.campHp = this.campHpMax();
      // 震退附近海盗
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
      return true;
    }

    /* ---------- 事件 ---------- */
    toast(msg) {
      U.bus.emit('toast', msg);
    }
    hurtCamp(dmg) {
      if (this.st.campHp <= 0) return;
      this.st.campHp -= dmg;
      const c = this.world.camp();
      c.flash = 0.4;
      this.fx.text(c.x + U.rand(-40, 40), c.y - 170, '-' + dmg, '#ff5a4f');
      if (this.toastCD <= 0) {
        this.toastCD = 6;
        U.bus.emit('campAttacked');
        A.play('alarm');
      }
      if (this.st.campHp <= 0) {
        this.st.campHp = 0;
        this.gameOver('camp');
      }
    }
    onPlayerDown(p) {
      if (!this.twoP || this.players.every((q) => q.down)) this.gameOver('player');
    }
    onWorkerDie(w) {
      this.toast('一只小精灵被海盗打倒了……');
      setTimeout(() => {
        const i = this.workers.indexOf(w);
        if (i >= 0) this.workers.splice(i, 1);
      }, 900);
    }
    onPirateDie(p, src) {
      this.st.kills++;
      PF.Save.addStat('kills', 1);
      this.addRes(3, p.K.gold, p.x, p.y - 150);
      A.play('coin');
    }
    gameOver(reason) {
      if (this.over) return;
      this.over = true;
      this.overReason = reason;
      setTimeout(() => U.bus.emit('dialog', 'revive', reason), 700);
    }
    giveUp() {
      this.finish(false);
    }
    finish(win) {
      const st = this.st;
      const w = this.world;
      let ending = -1;
      if (win) {
        const allWorlds = Object.keys(st.worlds).length >= 4;
        const all = w.unlockedCount() >= N * N;
        ending = allWorlds ? (all ? 2 : 1) : 0;
        const M = PF.Save.meta;
        M.endings[ending] = true;
        M.endingSkins[ending] = this.skins.slice();
        st.newBest = PF.Save.setBest(this.twoP, st.elapsed);
      }
      st.won = 'ended';
      PF.Save.clearRun(this.twoP);
      const newly = PF.Save.refreshUnlocks();
      PF.Save.saveMeta();
      U.bus.emit('dialog', 'over', { win, ending, newly });
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
        }
      }
    }
    currentTask() {
      const i = this.st.tasks.findIndex((x) => !x);
      return i;
    }
    taskProgress(i) {
      if (i === 0) return Math.min(6, this.world.unlockedCount() - 5) + '/6';
      return '';
    }
    enterPortal(p) {
      if (!this.st.tasks[6]) {
        this.st.tasks[6] = true;
        this.checkTasks();
        const r = D.TASKS[6].reward;
        if (r) this.addRes(3, r[3]);
        U.bus.emit('task', 6);
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
              reward = '一只精灵进化为【森林先知】· 金币 +30';
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
        this.finish(true);
      } else {
        const dk = this.world.dock;
        const [vx, vy] = PF.World.DIRV[dk.dir];
        for (const p of this.players) {
          p.x = dk.x - vx * 80 + (p.idx ? 40 : 0);
          p.y = dk.y - vy * 80 + 10;
        }
        this.cut = null;
        this.st.won = true;
        A.music(this.isNight() ? 'night' : 'day');
      }
    }

    /* ---------- 昼夜 ---------- */
    isNight() {
      const t = this.st.cycleT;
      return t >= D.DAY_LEN - D.DUSK / 2 && t < CYCLE - D.DUSK / 2;
    }
    darkness() {
      const t = this.st.cycleT;
      const a = D.DAY_LEN - D.DUSK; // 150
      if (t < a) return 0;
      if (t < D.DAY_LEN) return (t - a) / D.DUSK;
      if (t < CYCLE - D.DUSK) return 1;
      return 1 - (t - (CYCLE - D.DUSK)) / D.DUSK;
    }
    stepCycle(dt) {
      const st = this.st;
      const prev = st.cycleT;
      st.cycleT += dt;
      const cross = (x) => prev < x && st.cycleT >= x;
      if (cross(D.DAY_LEN - D.DUSK)) {
        A.music('night');
        U.bus.emit('dusk');
      }
      if (cross(D.DAY_LEN)) {
        st.letterUnread = true;
        A.play('letter');
        U.bus.emit('letter');
      }
      if (cross(D.DAY_LEN + 10)) {
        st.countdown = 10;
        A.play('alarm');
      }
      if (cross(D.DAY_LEN + 20)) this.spawnRaid();
      if (cross(CYCLE - D.DUSK)) A.music('day');
      if (st.countdown > 0) st.countdown = Math.max(0, D.DAY_LEN + 20 - st.cycleT);
      if (st.cycleT >= CYCLE) {
        st.cycleT -= CYCLE;
        st.day++;
        st.countdown = -1;
        U.bus.emit('day', st.day);
        this.save();
      }
    }
    spawnRaid() {
      const st = this.st;
      this.st.countdown = -1;
      const row = D.PIRATES[Math.min(st.day, D.PIRATES.length - 1)];
      const q = [];
      row.forEach((n, k) => {
        for (let i = 0; i < n; i++) q.push(k);
      });
      U.shuffle(q);
      // 选一个有外圈地块的方向
      const dirs = U.shuffle([0, 1, 2, 3]);
      for (const d of dirs) {
        const outer = this.world.outerTiles(d).filter((t) => t.i !== PF.World.CENTER);
        if (!outer.length) continue;
        const t = U.pick(outer);
        this.ships.push(new E.Ship(this, d, t.i, q));
        this.toast('海盗来袭，保护好营地！');
        U.bus.emit('raid', d);
        return;
      }
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
          U.bus.emit('dialog', 'shop');
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
      const prevPreview = w.previewAmt.slice();
      const want = new Set();
      for (const p of this.players) {
        const pr = this.findPrompt(p);
        this.prompts[p.idx] = pr;
        if (pr && pr.kind === 'unlock') want.add(pr.target.i);
        if (PF.Input.act(p.idx) && pr) this.doPrompt(p.idx);
      }
      for (let i = 0; i < N * N; i++) {
        const tgt = want.has(i) ? 1 : 0;
        w.previewAmt[i] = U.clamp(prevPreview[i] + (tgt ? dt * 3 : -dt * 2.5), 0, 1);
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
            break;
          }
        }
      }
      // 资源再生
      for (const n of w.nodes) {
        if (n.shake > 0) n.shake -= dt;
        if (n.hp > 0 || !w.tiles[n.tile].unlocked) continue;
        n.regrow -= dt;
        if (n.regrow <= 0) {
          n.max = this.nodeMax(n);
          n.hp = n.max;
        }
      }
      // 建筑产出
      for (const b of w.buildings) {
        const def = D.BUILDINGS[b.kind];
        if (!b.built || !def.prod) continue;
        b.prodT += dt;
        if (b.prodT >= def.prod) {
          b.prodT -= def.prod;
          this.addRes(def.res, 1, b.x + U.rand(-30, 30), b.y - 170);
        }
        if (b.flash > 0) b.flash -= dt;
      }
      const camp = w.camp();
      if (camp.flash > 0) camp.flash -= dt;
      // 精灵、海盗、船
      for (const wk of this.workers) wk.update(dt);
      for (const p of this.pirates) p.update(dt);
      this.pirates = this.pirates.filter((p) => !p.dead || p.deadT > 0);
      for (const s of this.ships) s.update(dt);
      this.ships = this.ships.filter((s) => !s.done);
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
      this.gulls = this.gulls.filter((g) => g.life > 0);
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
      list.sort((a, b) => a.y - b.y);
      for (const it of list) it.fn();
      this.fx.draw(ctx);
      for (const g of this.gulls) g.drawShadow(ctx);
      w.drawFog(ctx, cam, time);
      for (const g of this.gulls) if (cam.visible(g.x, g.y, 80)) g.draw(ctx);
      // 夜晚光照
      this.drawLight(ctx, dpr);
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
        img = n.type === 0 ? S.stump(n.big) : n.type === 1 ? S.stubble(n.big) : S.rubble(n.big);
        if (n.regrow > 99000) {
          ctx.globalAlpha = 1;
          return;
        }
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
      const dusk = t < D.DAY_LEN ? 1 - (t - (D.DAY_LEN - D.DUSK)) / D.DUSK : 0;
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
        x.globalAlpha = a;
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
})();
