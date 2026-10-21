/* 输入：键盘 + 触屏/鼠标浮动摇杆。支持双人（键盘 WASD/方向键；触屏左右半屏各一个摇杆） */
(function () {
  'use strict';
  const PF = (window.PF = window.PF || {});

  const KEYS_SINGLE = {
    up: ['KeyW', 'ArrowUp'],
    down: ['KeyS', 'ArrowDown'],
    left: ['KeyA', 'ArrowLeft'],
    right: ['KeyD', 'ArrowRight'],
    act: ['Space', 'KeyE', 'Enter', 'KeyJ', 'KeyF', 'NumpadEnter'],
    skill: ['KeyQ', 'KeyK', 'ShiftLeft'],
  };
  const KEYS_P1 = { up: ['KeyW'], down: ['KeyS'], left: ['KeyA'], right: ['KeyD'], act: ['KeyF', 'KeyE', 'Space', 'KeyG'], skill: ['KeyQ', 'KeyR'] };
  const KEYS_P2 = { up: ['ArrowUp'], down: ['ArrowDown'], left: ['ArrowLeft'], right: ['ArrowRight'], act: ['Enter', 'KeyL', 'Numpad0', 'Slash', 'NumpadEnter'], skill: ['ShiftRight', 'Period', 'Numpad1', 'KeyK'] };

  const I = {
    keys: {},
    pressed: {},
    twoP: false,
    enabled: true,
    sticks: [mkStick(), mkStick()],
    layer: null,
    usedTouch: false,
    init(layer) {
      this.layer = layer;
      window.addEventListener('keydown', (e) => {
        if (e.repeat) return;
        if (!this.keys[e.code]) this.pressed[e.code] = true;
        this.keys[e.code] = true;
        if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code) && !isTyping(e)) e.preventDefault();
      });
      window.addEventListener('keyup', (e) => {
        this.keys[e.code] = false;
      });
      window.addEventListener('blur', () => {
        this.keys = {};
        this.sticks.forEach((s) => resetStick(s));
      });
      // 浮动摇杆
      const down = (e) => {
        if (!this.enabled) return;
        if (e.pointerType === 'touch') this.usedTouch = true;
        const rect = layer.getBoundingClientRect();
        const x = e.clientX - rect.left;
        let idx = 0;
        if (this.twoP) idx = x < rect.width / 2 ? 0 : 1;
        const s = this.sticks[idx];
        if (s.id !== null) return;
        s.id = e.pointerId;
        s.bx = e.clientX;
        s.by = e.clientY;
        s.cx = e.clientX;
        s.cy = e.clientY;
        s.active = true;
        s.x = s.y = 0;
        try {
          layer.setPointerCapture(e.pointerId);
        } catch (_) {}
        showStick(idx, s);
        e.preventDefault();
      };
      const move = (e) => {
        for (let i = 0; i < 2; i++) {
          const s = this.sticks[i];
          if (s.id !== e.pointerId) continue;
          s.cx = e.clientX;
          s.cy = e.clientY;
          let dx = s.cx - s.bx,
            dy = s.cy - s.by;
          const R = 54;
          const len = Math.hypot(dx, dy);
          if (len > R) {
            // 跟随手指拖动底座
            s.bx += (dx / len) * (len - R);
            s.by += (dy / len) * (len - R);
            dx = s.cx - s.bx;
            dy = s.cy - s.by;
          }
          const l2 = Math.hypot(dx, dy);
          const dead = 8;
          if (l2 < dead) {
            s.x = s.y = 0;
          } else {
            const m = Math.min(1, (l2 - dead) / (R - dead));
            s.x = (dx / l2) * m;
            s.y = (dy / l2) * m;
          }
          showStick(i, s);
          e.preventDefault();
        }
      };
      const up = (e) => {
        for (let i = 0; i < 2; i++) {
          const s = this.sticks[i];
          if (s.id !== e.pointerId) continue;
          resetStick(s);
          hideStick(i);
        }
      };
      layer.addEventListener('pointerdown', down);
      layer.addEventListener('pointermove', move);
      layer.addEventListener('pointerup', up);
      layer.addEventListener('pointercancel', up);
      layer.addEventListener('lostpointercapture', up);
      layer.addEventListener('contextmenu', (e) => e.preventDefault());
    },
    map(pi) {
      if (!this.twoP) return KEYS_SINGLE;
      return pi === 0 ? KEYS_P1 : KEYS_P2;
    },
    any(codes) {
      for (const c of codes) if (this.keys[c]) return true;
      return false;
    },
    anyPressed(codes) {
      for (const c of codes) if (this.pressed[c]) return true;
      return false;
    },
    /* 返回 {x,y}，长度 ≤ 1 */
    move(pi) {
      if (!this.enabled) return { x: 0, y: 0 };
      const m = this.map(pi);
      let x = 0,
        y = 0;
      if (this.any(m.left)) x -= 1;
      if (this.any(m.right)) x += 1;
      if (this.any(m.up)) y -= 1;
      if (this.any(m.down)) y += 1;
      if (x || y) {
        const l = Math.hypot(x, y);
        return { x: x / l, y: y / l };
      }
      const s = this.sticks[this.twoP ? pi : 0];
      if (!this.twoP && pi === 1) return { x: 0, y: 0 };
      return { x: s.x, y: s.y };
    },
    act(pi) {
      return this.enabled && this.anyPressed(this.map(pi).act);
    },
    skill(pi) {
      return this.enabled && this.anyPressed(this.map(pi).skill);
    },
    /* 系统可以注册额外按键（返回本帧是否按下） */
    keyPressed(code) {
      return !!this.pressed[code];
    },
    keyDown(code) {
      return !!this.keys[code];
    },
    pausePressed() {
      return this.pressed['Escape'] || this.pressed['KeyP'];
    },
    endFrame() {
      this.pressed = {};
    },
    /* 只清掉“刚按下”和摇杆；按住的键保持（打开弹窗后松手也能正确处理） */
    reset() {
      this.pressed = {};
      this.sticks.forEach((s, i) => {
        resetStick(s);
        hideStick(i);
      });
    },
  };

  function mkStick() {
    return { id: null, x: 0, y: 0, bx: 0, by: 0, cx: 0, cy: 0, active: false };
  }
  function resetStick(s) {
    s.id = null;
    s.x = s.y = 0;
    s.active = false;
  }
  function isTyping(e) {
    const t = e.target;
    return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA');
  }
  function stickEls(i) {
    return [document.getElementById('stick' + i), document.getElementById('knob' + i)];
  }
  function showStick(i, s) {
    const [b, k] = stickEls(i);
    if (!b) return;
    b.style.display = 'block';
    k.style.display = 'block';
    b.style.transform = `translate(${s.bx}px, ${s.by}px)`;
    k.style.transform = `translate(${s.cx}px, ${s.cy}px)`;
  }
  function hideStick(i) {
    const [b, k] = stickEls(i);
    if (!b) return;
    b.style.display = 'none';
    k.style.display = 'none';
  }

  PF.Input = I;
})();
