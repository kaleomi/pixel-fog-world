/* 存档：长期进度（结局、角色、最好成绩、累计数据）+ 单局进度（单人/双人各一份） */
(function () {
  'use strict';
  const PF = (window.PF = window.PF || {});
  const META_KEY = 'pfw_meta_v1';
  const RUN_KEY = (two) => (two ? 'pfw_run_v1_double' : 'pfw_run_v1_single');

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
    hasRun(two) {
      return !!store.get(RUN_KEY(two));
    },
    loadRun(two) {
      const raw = store.get(RUN_KEY(two));
      if (!raw) return null;
      try {
        return JSON.parse(raw);
      } catch (e) {
        return null;
      }
    },
    saveRun(two, data) {
      return store.set(RUN_KEY(two), JSON.stringify(data));
    },
    clearRun(two) {
      store.del(RUN_KEY(two));
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
