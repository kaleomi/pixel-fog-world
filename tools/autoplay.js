/* 自动试玩（平衡测试用，不随游戏加载）
   在页面里注入后调用 runAutoplay({minutes, seed}) → 返回进度日志与通关时间。
   机器人：白天就近采集最缺的资源，按顺序建造、召唤精灵、驱散迷雾；夜里守营地打海盗；发现新大陆后造木筏。 */
(function () {
  'use strict';
  window.runAutoplay = function (opts) {
    opts = opts || {};
    const PF = window.PF;
    const U = PF.U,
      D = PF.Data;
    const T = D.TILE;
    const g = new PF.Game({ twoP: false, skins: [opts.skin || 0, 1] });
    PF.UI.game = null;
    const p = g.players[0];
    const bot = { vec: { x: 0, y: 0 }, target: null, thinkT: 0, ecoT: 0, stuckT: 0, lastX: 0, lastY: 0, blocked: new Map() };
    PF.Input.move = (pi) => (pi === 0 ? bot.vec : { x: 0, y: 0 });
    PF.Input.act = () => false;
    const log = [];
    const events = [];
    let deaths = 0,
      won = null,
      minCamp = 1e9,
      lastDay = -1;
    const w = g.world;
    const goTo = (tx, ty, tile, stopDist) => {
      const d = Math.hypot(tx - p.x, ty - p.y);
      if (d < (stopDist || 40)) {
        bot.vec = { x: 0, y: 0 };
        return true;
      }
      const [wx, wy] = w.nextWaypoint(p.x, p.y, tile, tx, ty);
      const dx = wx - p.x,
        dy = wy - p.y;
      const l = Math.hypot(dx, dy) || 1;
      bot.vec = { x: dx / l, y: dy / l };
      return false;
    };
    const need = () => {
      // 下一个目标的花费
      const order = ['wood', 'rice', 'shop', 'crystal'];
      for (const k of order) if (!w.building(k).built) return D.BUILDINGS[k].cost;
      if (w.revealed && w.dock && !w.dock.built) return D.BUILDINGS.dock.cost;
      const c = nextTile();
      return c ? g.tileCost(c) : [100, 100, 50, 0];
    };
    const nextTile = () => {
      let best = null,
        bs = 1e9;
      for (const t of w.tiles) {
        if (t.unlocked) continue;
        if (!w.neighbors(t.i).some((j) => w.tiles[j].unlocked)) continue;
        const c = g.tileCost(t);
        // 优先朝四条轴线往外扩（找大陆），其次便宜的
        const axis = t.r === 4 || t.c === 4 ? 0 : 1;
        const s = c[0] + c[1] * 1.5 + c[2] * 4 + axis * 60 + (w.revealed ? 0 : 0);
        if (s < bs) {
          bs = s;
          best = t;
        }
      }
      return best;
    };
    const economy = () => {
      // 建造
      for (const k of ['wood', 'rice', 'shop', 'crystal']) {
        const b = w.building(k);
        if (!b.built && g.canAfford(D.BUILDINGS[k].cost)) {
          g.build(k);
          events.push([Math.round(g.st.elapsed), 'build ' + k]);
        }
      }
      // 精灵
      const camp = w.camp();
      if (g.workers.length >= g.workerCap() && camp.lv[0] < 9 && g.canAfford(D.CAMP.cap.cost[camp.lv[0] + 1]) && g.st.res[3] > 60) g.upgradeCamp(0);
      while (g.workers.length < g.workerCap() && g.canAfford([0, 0, 0, D.hireCost(g.workers.length)])) {
        g.hire();
        events.push([Math.round(g.st.elapsed), 'hire']);
      }
      for (const wk of g.workers) {
        if (wk.type >= 0) continue;
        const cnt = [0, 1, 2].map((t) => g.workers.filter((x) => x.type === t).length);
        const hasCrystal = w.nodes.some((n) => n.type === 2 && w.tiles[n.tile].unlocked);
        const t = !hasCrystal ? (cnt[0] <= cnt[1] ? 0 : 1) : cnt.indexOf(Math.min(...cnt));
        g.assign(t, 1);
      }
      // 武器
      if (g.st.res[3] > 80 && w.building('shop').built && g.st.atkLv < 5) g.shopBuy(0);
      // 营地血量
      if (camp.lv[3] < 4 && g.canAfford(D.CAMP.hp.cost[camp.lv[3] + 1]) && g.st.day >= 2) g.upgradeCamp(3);
      // 木筏
      if (w.dock && !w.dock.built && g.canAfford(D.BUILDINGS.dock.cost)) {
        g.buildDock();
        events.push([Math.round(g.st.elapsed), 'dock built']);
      }
      if (w.dock && w.dock.built && won == null) {
        won = g.st.elapsed;
        events.push([Math.round(won), 'WIN day ' + (g.st.day + 1)]);
      }
      // 驱散迷雾（建好木料场之后再大量开图；发现大陆后攒钱造木筏）
      const t = nextTile();
      const saving = w.revealed && w.dock && !w.dock.built;
      if (t && !saving && g.canAfford(g.tileCost(t)) && (w.building('wood').built || w.unlockedCount() < 8)) {
        // 留点余量给建筑
        g.unlockTile(t.i);
        events.push([Math.round(g.st.elapsed), 'unlock d' + t.d + ' #' + w.unlockedCount()]);
      }
    };
    const dt = 0.05;
    const maxT = (opts.minutes || 40) * 60;
    for (let step = 0; g.st.elapsed < maxT; step++) {
      if (g.over) {
        deaths++;
        events.push([Math.round(g.st.elapsed), 'DOWN ' + g.overReason + ' day ' + (g.st.day + 1)]);
        if (!g.revive(false) && !g.revive(true)) {
          events.push([Math.round(g.st.elapsed), 'GAME OVER']);
          break;
        }
      }
      bot.thinkT -= dt;
      bot.ecoT -= dt;
      if (bot.ecoT <= 0) {
        bot.ecoT = 1;
        economy();
      }
      if (bot.thinkT <= 0) {
        bot.thinkT = 0.2;
        const pir = g.pirates.filter((q) => !q.dead && q.state !== 'sail');
        const camp = w.camp();
        if (pir.length) {
          let best = null,
            bd = 1e9;
          for (const q of pir) {
            const d = U.dist(q.x, q.y, camp.x, camp.y);
            if (d < bd) {
              bd = d;
              best = q;
            }
          }
          goTo(best.x, best.y, w.tileIdx(best.x, best.y), 70);
        } else if (g.st.campHp < g.campHpMax() * 0.9) {
          goTo(camp.x, camp.y + 50, camp.tile, 40);
        } else {
          // 采集最缺的资源
          const c = need();
          const r = g.st.res;
          const def = [0, 1, 2].map((i) => (c[i] > 0 ? (c[i] - r[i]) / c[i] : -1));
          let type = def.indexOf(Math.max(...def));
          if (def[type] <= 0) type = 0;
          if (!bot.target || bot.target.hp <= 0 || bot.target.type !== type) {
            let best = null,
              bd = 1e12;
            for (const n of w.nodes) {
              if (n.type !== type || n.hp <= 0 || !w.tiles[n.tile].unlocked) continue;
              if ((bot.blocked.get(n) || 0) > g.st.elapsed) continue;
              const d = U.dist2(n.x, n.y, p.x, p.y);
              if (d < bd) {
                bd = d;
                best = n;
              }
            }
            if (!best && type !== 0) {
              for (const n of w.nodes)
                if (n.type === 0 && n.hp > 0 && w.tiles[n.tile].unlocked) {
                  const d = U.dist2(n.x, n.y, p.x, p.y);
                  if (d < bd) {
                    bd = d;
                    best = n;
                  }
                }
            }
            bot.target = best;
          }
          if (bot.target) {
            const n = bot.target;
            const reach = (n.type === 1 ? 34 : w.nodeSolidR(n)) + 40;
            goTo(n.x, n.y + 10, n.tile, reach);
          } else bot.vec = { x: 0, y: 0 };
        }
        // 卡住检测
        const moved = Math.hypot(p.x - bot.lastX, p.y - bot.lastY);
        if ((bot.vec.x || bot.vec.y) && moved < 3) {
          bot.stuckT += 0.2;
          if (bot.stuckT > 2 && bot.target) {
            bot.blocked.set(bot.target, g.st.elapsed + 30);
            bot.target = null;
            bot.stuckT = 0;
          }
        } else bot.stuckT = 0;
        bot.lastX = p.x;
        bot.lastY = p.y;
      }
      g.update(dt);
      minCamp = Math.min(minCamp, g.st.campHp);
      if (g.st.day !== lastDay) {
        lastDay = g.st.day;
        log.push({ day: g.st.day + 1, t: Math.round(g.st.elapsed), tiles: w.unlockedCount() - 5, res: g.st.res.slice(), workers: g.workers.length, kills: g.st.kills, camp: Math.round(g.st.campHp), atk: g.st.atkLv });
      }
      if (won != null && opts.stopOnWin !== false) break;
    }
    return { won: won != null ? Math.round(won) : null, deaths, minCamp: Math.round(minCamp), final: { day: g.st.day + 1, tiles: w.unlockedCount() - 5, res: g.st.res, workers: g.workers.length, kills: g.st.kills, revealed: w.revealed, mainDir: w.mainDir }, log, events: events.slice(0, 80) };
  };
})();
