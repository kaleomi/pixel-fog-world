/* 无尽守夜：开局直接给一块像样的营地，白天短、夜晚长，敌人一夜比一夜多、一夜比一夜强，看能撑几夜
   只在 g.endless 时生效（模式选择页的“无尽守夜”） */
(function () {
  'use strict';
  const PF = window.PF,
    E = PF.Ent;
  const DAY_LEN = 100; // 白天 100 秒
  const NIGHT_LEN = 60; // 夜晚 60 秒
  const START_RES = [150, 80, 20, 60];

  const slot = (g) => (g.twoP ? 1 : 0);
  function bestOf(g) {
    const eb = PF.Save.meta.endlessBest;
    return (Array.isArray(eb) && eb[slot(g)]) || 0;
  }

  PF.Sys.register({
    id: 'endless',
    order: 90,
    init(g, saved, fresh) {
      if (!g.endless) return;
      g.sys.endless = Object.assign({ best0: bestOf(g) }, saved && typeof saved === 'object' ? saved : {});
      // 读档时也要恢复：Game 每次都会把昼夜长度重置成默认值
      g.dayLen = DAY_LEN;
      g.nightLen = NIGHT_LEN;
      if (!fresh) return;
      const st = g.st,
        w = g.world;
      if (!g.debug) st.res = START_RES.slice();
      // 送出中心附近的 13 块地
      for (const t of w.tiles) if (t.d <= 2) t.unlocked = true;
      w.recalc();
      st.baseTiles = w.unlockedCount(); // 结算时“驱散迷雾”不算白送的地
      for (const t of w.tiles) if (t.d <= 2) for (const n of w.nodesByTile[t.i]) n.max = n.hp = g.nodeMax(n);
      // 木料场、粮仓直接建好
      for (const k of ['wood', 'rice']) {
        const b = w.building(k);
        if (b) {
          b.built = true;
          b.prodT = 0;
        }
      }
      // 一只砍树的小精灵
      if (g.workers.length < g.workerCap()) {
        g.workers.push(new E.Worker(g, 0));
        st.hired++;
      }
      // 这些目标已经白送了，不再发奖励、不弹“完成目标”
      for (const i of [0, 1, 2, 3]) st.tasks[i] = true;
    },
    serialize(g) {
      return g.endless ? g.sys.endless : undefined;
    },
    mods(g, m) {
      if (!g.endless) return;
      const n = Math.max(0, g.st.day | 0);
      m.enemyHpMul *= 1 + 0.12 * n;
      m.enemyAtkMul *= 1 + 0.06 * n;
      m.enemyCountMul *= 1 + 0.1 * n;
    },
    dawn(g, day) {
      if (!g.endless) return;
      g.recomputeMods(); // 敌人随天数变强
      const c = g.world.camp();
      g.addRes(3, 10, c.x, c.y - 200);
      g.toast('撑过了第 ' + day + ' 夜！金币 +10 · 今晚的敌人会更多更强');
    },
    taskText(g) {
      if (!g.endless) return null;
      return '无尽守夜 · 已撑过 ' + g.st.day + ' 夜 · 最佳 ' + Math.max(bestOf(g), (g.sys.endless && g.sys.endless.best0) || 0) + ' 夜';
    },
    runEnd(g, win, ending, data) {
      if (!g.endless) return;
      const n = g.st.day;
      const M = PF.Save.meta;
      if (!Array.isArray(M.endlessBest)) M.endlessBest = [0, 0];
      const prev = M.endlessBest[slot(g)] || 0;
      const rec = n > prev && n > 0;
      if (rec && !g.debug) M.endlessBest[slot(g)] = n;
      data.title = '守夜结束';
      if (!data.extra) data.extra = [];
      const who = g.twoP ? '双人' : '单人';
      let line;
      if (rec) line = '★ 新纪录！' + (prev ? `（之前${who}最佳 ${prev} 夜）` : '');
      else if (n === prev && n > 0) line = `平了${who}最佳纪录 ${prev} 夜`;
      else line = `${who}最佳 ${prev} 夜` + (prev > n ? `，还差 ${prev - n} 夜就能破纪录` : '');
      data.extra.push(`<div class="stamp e2">坚持了 ${n} 夜</div>`);
      data.extra.push(`<div class="info center ${rec ? 'gold' : ''}">${line}${rec && g.debug ? '（测试模式不记录）' : ''}</div>`);
    },
    help() {
      return '<p><b>无尽守夜：</b>开局就有 13 块地、木料场、粮仓和一只小精灵。白天 100 秒、夜晚 60 秒，敌人一夜比一夜多、一夜比一夜强；每撑过一夜金币 +10。营地被毁就结束，看看你能守几夜！</p>';
    },
  });
})();
