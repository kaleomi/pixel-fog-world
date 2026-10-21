/* 通用工具：数学、随机数、缓动、时间格式 */
(function () {
  'use strict';
  const PF = (window.PF = window.PF || {});

  const U = {
    clamp: (v, a, b) => (v < a ? a : v > b ? b : v),
    lerp: (a, b, t) => a + (b - a) * t,
    dist: (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by),
    dist2: (ax, ay, bx, by) => (ax - bx) * (ax - bx) + (ay - by) * (ay - by),
    rand: (a, b) => a + Math.random() * (b - a),
    randi: (a, b) => a + Math.floor(Math.random() * (b - a + 1)),
    pick: (arr) => arr[Math.floor(Math.random() * arr.length)],
    sign: (v) => (v < 0 ? -1 : v > 0 ? 1 : 0),
    easeOut: (t) => 1 - (1 - t) * (1 - t),
    easeIn: (t) => t * t,
    easeInOut: (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
    shuffle(arr, rnd) {
      const r = rnd || Math.random;
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(r() * (i + 1));
        const t = arr[i];
        arr[i] = arr[j];
        arr[j] = t;
      }
      return arr;
    },
    /* 可复现的随机数（mulberry32） */
    rng(seed) {
      let a = seed >>> 0;
      const f = function () {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
      f.range = (lo, hi) => lo + f() * (hi - lo);
      f.int = (lo, hi) => lo + Math.floor(f() * (hi - lo + 1));
      f.pick = (arr) => arr[Math.floor(f() * arr.length)];
      return f;
    },
    hash(x, y, s) {
      let h = (x * 374761393 + y * 668265263 + (s || 0) * 1442695041) | 0;
      h = Math.imul(h ^ (h >>> 13), 1274126177);
      return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
    },
    fmtTime(sec, withHour) {
      sec = Math.max(0, Math.floor(sec));
      const h = Math.floor(sec / 3600);
      const m = Math.floor((sec % 3600) / 60);
      const s = sec % 60;
      const p = (n) => (n < 10 ? '0' + n : '' + n);
      return withHour || h > 0 ? p(h) + ':' + p(m) + ':' + p(s) : p(m) + ':' + p(s);
    },
    angleTo(ax, ay, bx, by) {
      return Math.atan2(by - ay, bx - ax);
    },
    /* 简单事件总线 */
    bus: {
      map: {},
      on(name, fn) {
        (this.map[name] = this.map[name] || []).push(fn);
      },
      off(name, fn) {
        const l = this.map[name];
        if (!l) return;
        const i = l.indexOf(fn);
        if (i >= 0) l.splice(i, 1);
      },
      emit(name, a, b, c) {
        const l = this.map[name];
        if (!l) return;
        for (const fn of l.slice()) fn(a, b, c);
      },
    },
    isTouch: () => 'ontouchstart' in window || navigator.maxTouchPoints > 0,
    qs: new URLSearchParams(location.search),
  };

  PF.U = U;

  /* 玩法插件注册表：每个新玩法（防御塔、天气、钓鱼……）是一个“系统”，
     在自己的文件里 PF.Sys.register({...})，由 Game 在各个时机回调。接口见 docs/PLUGIN_API.md */
  PF.Sys = {
    list: [],
    register(s) {
      const i = this.list.findIndex((x) => x.id === s.id);
      if (i >= 0) this.list.splice(i, 1);
      this.list.push(s);
      this.list.sort((a, b) => (a.order || 0) - (b.order || 0));
    },
    get(id) {
      return this.list.find((s) => s.id === id);
    },
  };
  /* 全局钩子（菜单、角色外观等不属于某一局的扩展点） */
  PF.Hooks = PF.Hooks || {};
})();
