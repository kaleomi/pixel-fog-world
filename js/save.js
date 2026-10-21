/* 存档：长期进度（结局、角色、最好成绩、累计数据）+ 单局进度（单人/双人各一份） */
(function () {
  'use strict';
  const PF = (window.PF = window.PF || {});
  const META_KEY = 'pfw_meta_v1';
  const RUN_KEY = (two, endless) => 'pfw_run_v1_' + (endless ? 'endless_' : '') + (two ? 'double' : 'single');

  const store = {
    get(k) {
      try {
        return localStorage.getItem(k);
      } catch (e) {
        return null;
      }
    },
    set(k, v) {
      try {
        localStorage.setItem(k, v);
        return true;
      } catch (e) {
        return false;
      }
    },
    del(k) {
      try {
        localStorage.removeItem(k);
      } catch (e) {}
    },
  };

  const defMeta = () => ({
    best: [null, null],
    endings: [false, false, false],
    endingSkins: [null, null, null],
    stats: { wood: 0, rice: 0, crystal: 0, kills: 0, worlds: 0, endings: 0, worldSet: {} },
    unlocked: [true, true, false, false, false, false, false, false],
    lastSkins: [0, 1],
    settings: { music: true, sfx: true },
    seenIntro: false,
    seenMoveHint: false,
    // 长线玩法（成就 / 天赋 / 外观 / 无尽模式）——由对应系统读写
    crystals: 0, // 迷雾结晶
    talents: {},
    ach: {},
    outfits: [null, null],
    endlessBest: [0, 0],
    runs: 0,
  });

  const Save = {
    meta: defMeta(),
    loadMeta() {
      const raw = store.get(META_KEY);
      if (raw) {
        try {
          const m = JSON.parse(raw);
          const d = defMeta();
          this.meta = Object.assign(d, m);
          this.meta.stats = Object.assign(defMeta().stats, m.stats || {});
          this.meta.settings = Object.assign(defMeta().settings, m.settings || {});
          for (const k of ['talents', 'ach']) if (!this.meta[k] || typeof this.meta[k] !== 'object') this.meta[k] = {};
          if (!Array.isArray(this.meta.outfits)) this.meta.outfits = [null, null];
          if (!Array.isArray(this.meta.endlessBest)) this.meta.endlessBest = [0, 0];
          if (!Array.isArray(this.meta.unlocked) || this.meta.unlocked.length < 8) this.meta.unlocked = d.unlocked;
        } catch (e) {
          this.meta = defMeta();
        }
      }
      this.refreshUnlocks();
      return this.meta;
    },
    saveMeta() {
      store.set(META_KEY, JSON.stringify(this.meta));
    },
    addStat(k, n) {
      this.meta.stats[k] = (this.meta.stats[k] || 0) + n;
    },
    /* 根据累计数据解锁角色，返回新解锁的角色下标 */
    refreshUnlocks() {
      const out = [];
      const st = this.meta.stats;
      st.worlds = Object.keys(st.worldSet || {}).length;
      st.endings = this.meta.endings.filter(Boolean).length;
      PF.Data.ROLES.forEach((r, i) => {
        if (this.meta.unlocked[i]) return;
        if (!r.unlock) {
          this.meta.unlocked[i] = true;
          return;
        }
        if ((st[r.unlock.stat] || 0) >= r.unlock.n) {
          this.meta.unlocked[i] = true;
          out.push(i);
        }
      });
      return out;
    },
    hasRun(two, endless) {
      return !!this.loadRun(two, endless);
    },
    /* 读取并校验单局存档；损坏的存档直接丢弃 */
    loadRun(two, endless) {
      const raw = store.get(RUN_KEY(two, endless));
      if (!raw) return null;
      try {
        const sv = JSON.parse(raw);
        const okSkin = (x) => Number.isInteger(x) && x >= 0 && x < PF.Data.ROLES.length;
        const valid =
          sv &&
          sv.v === 1 &&
          sv.st &&
          Array.isArray(sv.st.res) &&
          sv.world &&
          Array.isArray(sv.world.tiles) &&
          sv.world.tiles.length === PF.Data.N * PF.Data.N &&
          Array.isArray(sv.world.nodes) &&
          Array.isArray(sv.world.buildings) &&
          Array.isArray(sv.players) &&
          sv.players.length >= 1 &&
          Array.isArray(sv.workers) &&
          Array.isArray(sv.skins) &&
          sv.skins.slice(0, sv.players.length).every(okSkin);
        if (!valid) {
          store.del(RUN_KEY(two, endless));
          return null;
        }
        return sv;
      } catch (e) {
        store.del(RUN_KEY(two, endless));
        return null;
      }
    },
    saveRun(two, data, endless) {
      return store.set(RUN_KEY(two, endless), JSON.stringify(data));
    },
    clearRun(two, endless) {
      store.del(RUN_KEY(two, endless));
    },
    setBest(two, sec) {
      const i = two ? 1 : 0;
      if (this.meta.best[i] == null || sec < this.meta.best[i]) {
        this.meta.best[i] = Math.floor(sec);
        return true;
      }
      return false;
    },
  };
  PF.Save = Save;
})();
