/* 启动、菜单流程、剧情、结局图鉴、主循环 */
(function () {
  'use strict';
  const PF = (window.PF = window.PF || {});
  const U = PF.U,
    D = PF.Data,
    S = PF.Spr,
    A = PF.Audio,
    UI = PF.UI,
    Save = PF.Save;
  const PX = D.PX;
  const $ = (s, r) => (r || document).querySelector(s);

  const App = {
    cv: null,
    ctx: null,
    dpr: 1,
    W: 0,
    H: 0,
    game: null,
    screen: null,
    twoP: false,
    pick: [],
    pickStep: 0,
    sel: 0,
    introT: 0,
    story: null,
    menuT: 0,
  };

  /* ---------------- 菜单背景：一座漂在雾里的小岛 ---------------- */
  const Menu = {
    init() {
      this.ground = [];
      for (let i = 0; i < 5; i++) this.ground.push(S.ground(['meadow', 'meadow', 'farm', 'forest', 'meadow'][i], 300 + i * 17));
      this.clouds = [];
      for (let k = 0; k < 26; k++) this.clouds.push({ x: Math.random(), y: Math.random(), s: U.rand(0.8, 1.8), v: U.rand(6, 16), k: k % 3 });
      this.gulls = [];
    },
    render(ctx, dpr, W, H, t) {
      const T = D.TILE;
      const z = Math.min(W, H) / 900;
      ctx.setTransform(dpr * z, 0, 0, dpr * z, (dpr * W) / 2, (dpr * H) / 2);
      ctx.imageSmoothingEnabled = false;
      const vw = W / z / 2 + 300,
        vh = H / z / 2 + 300;
      // 海
      const unit = 64 * PX;
      const img = S.sea(Math.floor(t / 0.7) % 3);
      const ox = (t * 5) % unit;
      for (let y = -Math.ceil(vh / unit) * unit; y < vh; y += unit) for (let x = -Math.ceil(vw / unit) * unit - unit + ox; x < vw; x += unit) ctx.drawImage(img, x, y, unit + 0.5, unit + 0.5);
      // 十字形小岛
      const cells = [
        [0, 0],
        [-1, 0],
        [1, 0],
        [0, -1],
        [0, 1],
      ];
      const has = (c, r) => cells.some((p) => p[0] === c && p[1] === r);
      const bob = Math.sin(t * 0.8) * 6;
      ctx.save();
      const portrait = H > W;
      ctx.translate(0, bob + (portrait ? 330 : 190));
      const s = portrait ? 0.5 : 0.48;
      ctx.scale(s, s);
      cells.forEach((p, i) => {
        const x = p[0] * T - T / 2,
          y = p[1] * T - T / 2;
        ctx.drawImage(this.ground[i], x, y, T, T);
        if (!has(p[0], p[1] + 1)) ctx.drawImage(S.cliff('meadow'), x, y + T, T, 56);
      });
      const E = PF.Ent;
      const items = [
        [S.building('camp'), 0, 10],
        [S.tree(1, 'leaf', 0), -T + 90, -40],
        [S.tree(0, 'leaf', 1), -T + 230, 90],
        [S.tree(1, 'pine', 2), 70, -T + 120],
        [S.tree(0, 'autumn', 3), T - 90, -60],
        [S.rice(1, 0), T - 210, 90],
        [S.rice(0, 1), T - 120, 130],
        [S.crystal(1, 0), -60, T - 70],
        [S.crystal(0, 1), 70, T - 110],
        [S.human(1, Math.floor(t * 2) % 2 ? 'idle1' : 'idle0'), -150, 120],
        [S.worker('walk' + (Math.floor(t * 8) % 4)), 160 + Math.sin(t * 0.6) * 90, 150],
      ];
      items.sort((a, b) => a[2] - b[2]);
      for (const it of items) {
        E.shadow(ctx, it[1], it[2], it[0].width * 1.2, 10);
        E.drawSprite(ctx, it[0], it[1], it[2] + 6, { flip: it[0] === items[10] ? false : false });
      }
      ctx.restore();
      // 雾
      for (const c of this.clouds) {
        const cw = 2 * vw;
        const x = ((c.x * cw + t * c.v) % cw) - vw;
        const y = (c.y * 2 - 1) * vh;
        const icy = H > W ? 330 : 190;
        const d = Math.hypot(x, (y - icy) * 1.3);
        if (d < 380) continue;
        const ci = S.cloud(c.k);
        const w = 300 * c.s;
        ctx.globalAlpha = Math.min(1, (d - 380) / 260);
        ctx.drawImage(ci, x - w / 2, y - (w * 0.7) / 2, w, w * 0.7);
      }
      ctx.globalAlpha = 1;
      // 暗角
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      const g = ctx.createRadialGradient((W * dpr) / 2, (H * dpr) / 2, Math.min(W, H) * dpr * 0.35, (W * dpr) / 2, (H * dpr) / 2, Math.max(W, H) * dpr * 0.75);
      g.addColorStop(0, 'rgba(20,14,36,0)');
      g.addColorStop(1, 'rgba(20,14,36,0.55)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W * dpr, H * dpr);
    },
  };

  /* ---------------- 小插画（剧情 / 结局 / 模式卡） ---------------- */
  const Art = {
    clear(x, w, h, col) {
      x.setTransform(1, 0, 0, 1, 0, 0);
      x.imageSmoothingEnabled = false;
      x.fillStyle = col;
      x.fillRect(0, 0, w, h);
    },
    put(x, img, cx, by, sc, flip) {
      sc = sc || 1;
      const w = img.width * sc,
        h = img.height * sc;
      if (flip) {
        x.save();
        x.translate(cx, 0);
        x.scale(-1, 1);
        x.drawImage(img, -w / 2, by - h, w, h);
        x.restore();
      } else x.drawImage(img, Math.round(cx - w / 2), Math.round(by - h), w, h);
    },
    sea(x, w, y0, h, t) {
      x.fillStyle = '#2f8fc0';
      x.fillRect(0, y0, w, h);
      x.fillStyle = '#58b4df';
      for (let k = 0; k < 40; k++) {
        const xx = ((k * 37 + t * 8) % (w + 20)) - 10;
        const yy = y0 + ((k * 23) % h);
        x.fillRect(Math.round(xx), Math.round(yy), 4, 1);
      }
    },
    cloud(x, cx, cy, sc, a) {
      x.globalAlpha = a == null ? 1 : a;
      const c = S.cloud(Math.abs(Math.round(cx + cy)) % 3);
      x.drawImage(c, Math.round(cx - (c.width * sc) / 2), Math.round(cy - (c.height * sc) / 2), c.width * sc, c.height * sc);
      x.globalAlpha = 1;
    },
    story(x, k, t) {
      const W = 320,
        H = 180;
      switch (k) {
        case 0: {
          this.clear(x, W, H, '#3a4258');
          // 雨夜、被淹的房子
          x.fillStyle = '#2a3046';
          x.fillRect(0, 0, W, 60);
          this.sea(x, W, 118, 62, t);
          x.fillStyle = '#4a5a78';
          x.fillRect(0, 112 + Math.sin(t * 2) * 2, W, 8);
          this.put(x, S.building('wood'), 160, 132, 1.4);
          x.fillStyle = 'rgba(47,143,192,0.9)';
          x.fillRect(0, 122 + Math.sin(t * 2) * 2, W, 60);
          this.put(x, S.tree(1, 'leaf', 1), 60, 128, 1);
          this.put(x, S.tree(0, 'leaf', 2), 270, 126, 1);
          x.fillStyle = 'rgba(47,143,192,0.85)';
          x.fillRect(0, 126, W, 60);
          x.fillStyle = 'rgba(200,220,255,0.55)';
          for (let i = 0; i < 70; i++) {
            const rx = (i * 53 + t * 140) % W,
              ry = (i * 29 + t * 260) % H;
            x.fillRect(Math.round(rx), Math.round(ry), 1, 5);
          }
          break;
        }
        case 1: {
          this.clear(x, W, H, '#cdd5e4');
          this.sea(x, W, 70, 110, t);
          const by = 132 + Math.sin(t * 1.6) * 2;
          this.put(x, S.raft(false), 160, by + 8, 1.6);
          this.put(x, S.human(1, Math.floor(t * 2) % 2 ? 'idle1' : 'idle0'), 156, by - 4, 1.2);
          for (let i = 0; i < 8; i++) this.cloud(x, ((i * 60 + t * 6) % 420) - 50, 40 + (i % 3) * 14, 2.2, 0.95);
          this.cloud(x, 20, 120, 2.4, 0.9);
          this.cloud(x, 300, 110, 2.6, 0.9);
          break;
        }
        case 2: {
          this.clear(x, W, H, '#dfe5f0');
          this.sea(x, W, 100, 80, t);
          // 远处的大陆剪影与光
          x.fillStyle = 'rgba(111,191,74,0.55)';
          x.beginPath();
          x.moveTo(110, 100);
          x.lineTo(150, 72);
          x.lineTo(180, 84);
          x.lineTo(220, 64);
          x.lineTo(270, 100);
          x.fill();
          const a = 0.35 + Math.sin(t * 2) * 0.15;
          x.fillStyle = `rgba(255,240,170,${a})`;
          x.beginPath();
          x.moveTo(200, 0);
          x.lineTo(240, 0);
          x.lineTo(260, 100);
          x.lineTo(180, 100);
          x.fill();
          for (let i = 0; i < 7; i++) this.cloud(x, ((i * 70 - t * 5) % 460) + 30, 96 + (i % 2) * 20, 2.4, 0.75);
          this.put(x, S.gull(Math.floor(t * 5) % 2), ((t * 30) % 360) - 20, 50, 1.4, true);
          this.put(x, S.raft(false), 70, 160, 1.4);
          this.put(x, S.human(1, 'idle0'), 66, 150, 1.2);
          break;
        }
        case 3: {
          this.clear(x, W, H, '#2f8fc0');
          this.sea(x, W, 0, H, t);
          const g = S.ground('meadow', 99);
          x.drawImage(g, 70, 30, 180, 120);
          x.drawImage(S.cliff('meadow'), 70, 150, 180, 14);
          this.put(x, S.building('camp'), 150, 112, 1);
          this.put(x, S.tree(1, 'leaf', 0), 228, 120, 1);
          const sw = Math.floor(t * 3) % 2;
          this.put(x, S.human(4, 'idle0'), 205, 140, 1);
          x.save();
          x.translate(212, 125);
          x.rotate(sw ? 0.5 : -1.2);
          x.drawImage(S.tool('axe'), -2, -8, 9, 9);
          x.restore();
          this.put(x, S.worker('walk' + (Math.floor(t * 8) % 4)), 110, 146, 1);
          for (let i = 0; i < 6; i++) this.cloud(x, i * 64, 12, 2, 0.9);
          for (let i = 0; i < 6; i++) this.cloud(x, i * 64 + 20, 172, 2, 0.9);
          break;
        }
      }
    },
    ending(x, k, unlocked) {
      const W = x.canvas.width,
        H = x.canvas.height;
      if (!unlocked) {
        this.clear(x, W, H, '#cdd5e4');
        for (let i = 0; i < 9; i++) this.cloud(x, (i % 3) * 64 + 16, Math.floor(i / 3) * 40 + 10, 2, 1);
        x.fillStyle = 'rgba(28,20,36,0.5)';
        x.font = 'bold 30px sans-serif';
        x.textAlign = 'center';
        x.textBaseline = 'middle';
        x.fillText('?', W / 2, H / 2);
        return;
      }
      const skins = (Save.meta.endingSkins && Save.meta.endingSkins[k]) || [0];
      if (k === 0) {
        this.clear(x, W, H, '#ffcf8a');
        x.fillStyle = '#ffe9b0';
        x.fillRect(0, 0, W, 30);
        x.fillStyle = '#ffd23f';
        x.beginPath();
        x.arc(W / 2, 40, 16, 0, Math.PI * 2);
        x.fill();
        this.sea(x, W, 50, 50, 1);
        x.fillStyle = '#f0d796';
        x.fillRect(0, 80, W, 20);
        x.fillStyle = '#6fbf4a';
        x.fillRect(0, 92, W, 8);
        this.put(x, S.raft(true), 40, 84, 1);
        this.put(x, S.human(skins[0], 'idle0'), 90, 92, 1);
        if (skins[1] != null) this.put(x, S.human(skins[1], 'idle0'), 110, 92, 1);
        this.put(x, S.tree(1, 'leaf', 2), 140, 92, 0.8);
      } else if (k === 1) {
        this.clear(x, W, H, '#2a2440');
        const cols = ['#ff5a4f', '#4fd18b', '#ffcc33', '#4f9dff'];
        cols.forEach((c, i) => this.put(x, S.portal(c, 0), 20 + i * 40, 70, 0.7));
        this.put(x, S.human(skins[0], 'idle0'), W / 2 - (skins[1] != null ? 10 : 0), 98, 1);
        if (skins[1] != null) this.put(x, S.human(skins[1], 'idle0'), W / 2 + 12, 98, 1);
        x.fillStyle = '#ffe36b';
        for (let i = 0; i < 20; i++) x.fillRect((i * 37) % W, (i * 17) % 50, 1, 1);
      } else {
        this.clear(x, W, H, '#7fd0ff');
        this.sea(x, W, 40, 60, 2);
        const g = S.ground('meadow', 5);
        for (let r = 0; r < 3; r++) for (let c = 0; c < 5; c++) x.drawImage(g, 30 + c * 20, 44 + r * 16, 20, 16);
        this.put(x, S.building('camp'), 80, 80, 0.6);
        this.put(x, S.human(skins[0], 'idle0'), 80, 96, 1);
        // 皇冠
        x.fillStyle = '#ffd23f';
        x.fillRect(73, 61, 14, 3);
        x.fillRect(73, 58, 2, 3);
        x.fillRect(79, 57, 2, 4);
        x.fillRect(85, 58, 2, 3);
        if (skins[1] != null) this.put(x, S.human(skins[1], 'idle0'), 104, 96, 1);
      }
    },
  };

  /* ---------------- 屏幕切换 ---------------- */
  function show(name) {
    document.querySelectorAll('.scr').forEach((s) => s.classList.remove('on'));
    App.screen = name;
    if (!name) return;
    const el = $('#scr' + name[0].toUpperCase() + name.slice(1));
    if (el) el.classList.add('on');
    if (name === 'mode') refreshMode();
    if (name === 'endings') refreshEndings();
  }
  function refreshMode() {
    const M = Save.meta;
    $('#best0').textContent = '最好成绩：' + (M.best[0] != null ? U.fmtTime(M.best[0], true) : '--:--:--');
    $('#best1').textContent = '最好成绩：' + (M.best[1] != null ? U.fmtTime(M.best[1], true) : '--:--:--');
    const eb = M.endlessBest || [0, 0];
    $('#bestE').textContent = '最佳：单人 ' + (eb[0] || 0) + ' 夜 · 双人 ' + (eb[1] || 0) + ' 夜';
    $('#btnTalent').style.display = PF.Hooks.openTalents ? '' : 'none';
    $('#btnAch').style.display = PF.Hooks.openAchievements ? '' : 'none';
    $('#crystalNum').textContent = M.crystals || 0;
    $('#crystalBox').style.display = PF.Hooks.openTalents ? '' : 'none';
    $('#btnMusic').textContent = '音乐：' + (M.settings.music ? '开' : '关');
    $('#btnSfx').textContent = '音效：' + (M.settings.sfx ? '开' : '关');
    document.querySelectorAll('.mart').forEach((c) => {
      const x = c.getContext('2d');
      Art.clear(x, c.width, c.height, '#7fcbea');
      Art.sea(x, c.width, 60, 36, 0);
      x.drawImage(S.ground('meadow', 7), 16, 56, 100, 36);
      Art.put(x, S.building('camp'), 66, 76, 0.9);
      if (c.dataset.art === '1') Art.put(x, S.human(M.lastSkins[0] || 0, 'idle0'), 34, 92, 1.4);
      else if (c.dataset.art === 'e') {
        Art.clear(x, c.width, c.height, '#1b2050');
        Art.sea(x, c.width, 60, 36, 0);
        x.globalAlpha = 0.6;
        x.fillStyle = '#0c0e2c';
        x.fillRect(0, 0, c.width, c.height);
        x.globalAlpha = 1;
        x.drawImage(S.ground('meadow', 7), 16, 56, 100, 36);
        Art.put(x, S.building('camp'), 66, 76, 0.9);
        Art.put(x, S.human(M.lastSkins[0] || 0, 'idle0'), 30, 92, 1.4);
        Art.put(x, S.pirate(1, 'idle0'), 104, 92, 1.4, true);
        x.fillStyle = '#ffe36b';
        for (let i = 0; i < 14; i++) x.fillRect((i * 37) % c.width, (i * 13) % 40, 1, 1);
      } else {
        Art.put(x, S.human(M.lastSkins[0] || 0, 'idle0'), 28, 92, 1.4);
        Art.put(x, S.human(M.lastSkins[1] != null ? M.lastSkins[1] : 1, 'idle0'), 104, 92, 1.4, true);
      }
    });
  }
  function refreshEndings() {
    const M = Save.meta;
    const grid = $('#endGrid');
    const info = [
      ['登上新大陆', '驱散迷雾，造好木筏，乘风抵达新大陆。', '找到新大陆并造木筏离开'],
      ['迷雾之子', '你走遍了 4 个异世界，迷雾里的秘密都被你看穿了。', '通关全部 4 个异世界后登陆新大陆'],
      ['迷雾之王', '81 块迷雾全部散尽，整片海域都成了你的家园。', '通关异世界并驱散全部 81 块迷雾后登陆'],
    ];
    grid.innerHTML = info
      .map((e, i) => `<div class="endc panel ${M.endings[i] ? '' : 'locked'}"><canvas width="160" height="100" data-e="${i}"></canvas><div class="et">结局${'一二三'[i]} · ${M.endings[i] ? e[0] : '？？？'}</div><div class="ed">${M.endings[i] ? e[1] : '解锁条件：' + e[2]}</div></div>`)
      .join('');
    grid.querySelectorAll('canvas').forEach((c) => Art.ending(c.getContext('2d'), +c.dataset.e, M.endings[+c.dataset.e]));
  }

  /* ---------------- 角色选择 ---------------- */
  function openRoles() {
    App.pick = [];
    App.pickStep = 0;
    App.sel = Save.meta.lastSkins[0] || 0;
    if (!Save.meta.unlocked[App.sel]) App.sel = 0;
    show('role');
    renderRoles();
  }
  function renderRoles() {
    const M = Save.meta;
    $('#roleTitle').textContent = App.twoP ? (App.pickStep === 0 ? '1P 选择角色' : '2P 选择角色') : '选择角色';
    const grid = $('#roleGrid');
    grid.innerHTML = D.ROLES.map((r, i) => {
      const taken = App.twoP && App.pickStep === 1 && App.pick[0] === i;
      return `<button class="role ${App.sel === i ? 'sel' : ''} ${M.unlocked[i] ? '' : 'locked'} ${taken ? 'taken' : ''}" data-role="${i}">${taken ? '<span class="tag">1P</span>' : ''}<img src="${S.spriteURL(S.human(i, 'idle0'), 3)}" alt=""><span class="rn">${r.name}</span></button>`;
    }).join('');
    const r = D.ROLES[App.sel];
    const ok = M.unlocked[App.sel] && !(App.twoP && App.pickStep === 1 && App.pick[0] === App.sel);
    const last = !App.twoP || App.pickStep === 1;
    $('#roleDetail').innerHTML = `<div class="nm">${r.name}</div><div class="pk">${r.desc}</div>
      <div class="stt"><span>血量</span><b>${r.hp}</b><span>攻击</span><b>${r.atk}</b><span>速度</span><b>${r.speed}</b><span>回血</span><b>${r.regen}/秒</b></div>
      ${M.unlocked[App.sel] ? '' : `<div class="lockt">🔒 解锁条件：${r.unlock.text}<br>当前进度：${Math.min(r.unlock.n, Math.floor(M.stats[r.unlock.stat] || 0))}/${r.unlock.n}</div>`}
      <div id="roleExtra"></div>
      <button class="btn ${ok ? 'green' : 'gray'}" id="roleOk">${ok ? (last ? '出发！' : '下一步：2P 选角') : M.unlocked[App.sel] ? '已被 1P 选择' : '尚未解锁'}</button>`;
    if (PF.Hooks.renderRoleExtra)
      try {
        PF.Hooks.renderRoleExtra($('#roleExtra'), { pickStep: App.pickStep, sel: App.sel, twoP: App.twoP, rerender: renderRoles });
      } catch (e) {
        console.error(e);
      }
    $('#roleOk').onclick = () => {
      if (!ok) return;
      A.play('click');
      App.pick[App.pickStep] = App.sel;
      if (!last) {
        App.pickStep = 1;
        App.sel = M.lastSkins[1] != null && M.lastSkins[1] !== App.pick[0] && M.unlocked[M.lastSkins[1]] ? M.lastSkins[1] : App.pick[0] === 1 ? 0 : 1;
        renderRoles();
        return;
      }
      M.lastSkins = App.pick.slice();
      if (!App.twoP) M.lastSkins[1] = M.lastSkins[1] != null ? M.lastSkins[1] : 1;
      Save.saveMeta();
      startStory();
    };
  }

  /* ---------------- 剧情 ---------------- */
  const STORY = ['洪水淹没了我的家园……', '我被冲到一块木筏上，漂进了一片迷雾。', '听说，迷雾的尽头有一片新的大陆。', '收集资源、驱散迷雾，造一只木筏去找它！'];
  function startStory() {
    if (Save.meta.seenIntro || App.endless) {
      startGame(null);
      return;
    }
    App.story = { k: 0, t: 0 };
    show('story');
    $('#storyCap').textContent = STORY[0];
  }
  function storyNext() {
    if (!App.story) return;
    A.play('click');
    App.story.k++;
    App.story.t = 0;
    if (App.story.k >= STORY.length) {
      App.story = null;
      startGame(null);
      return;
    }
    $('#storyCap').textContent = STORY[App.story.k];
  }

  /* ---------------- 开局 / 返回菜单 ---------------- */
  function chooseEndless() {
    UI.open(
      `<div class="dh center"><span>无尽守夜</span><button class="x" data-act="close">✕</button></div>
      <div class="info center">没有新大陆，只有一夜比一夜凶的敌人。<br>白天抓紧发展，看你能撑过几夜。</div>
      <div class="btns col"><button class="btn green" data-act="one">单人守夜</button><button class="btn" data-act="two">双人守夜</button></div>`,
      'w-sm',
      (act) => {
        if (act === 'close') return UI.close();
        UI.close(true);
        chooseMode(act === 'two', true);
      }
    );
  }
  function chooseMode(two, endless) {
    App.twoP = two;
    App.endless = !!endless;
    PF.Input.twoP = two;
    const sv = Save.loadRun(two, endless);
    if (sv) {
      const day = sv.st ? sv.st.day + 1 : 1;
      UI.open(
        `<div class="dh center"><span>继续${endless ? '守夜' : '探险'}？</span></div>
        <div class="info center">发现${two ? '双人' : '单人'}${endless ? '无尽守夜' : '模式'}未完成的进度（第 ${day} ${endless ? '夜' : '天'}，已驱散 ${sv.world.tiles.filter((t) => t[0]).length - 5} 块迷雾）。</div>
        <div class="btns col"><button class="btn green" data-act="cont">继续上次的探险</button><button class="btn" data-act="new">开始新的探险</button><button class="btn gray2" data-act="close">取消</button></div>`,
        'w-sm',
        (act) => {
          if (act === 'close') return UI.close();
          if (act === 'cont') {
            UI.close(true);
            startGame(sv);
          } else if (act === 'new') {
            UI.close(true);
            UI.open(
              `<div class="dh center"><span>确定重新开始？</span></div><div class="info center">之前的进度会被覆盖。</div><div class="btns"><button class="btn gray2" data-act="no">算了</button><button class="btn red" data-act="yes">重新开始</button></div>`,
              'w-sm',
              (a2) => {
                UI.close(true);
                if (a2 === 'yes') {
                  Save.clearRun(two, endless);
                  openRoles();
                }
              }
            );
          }
        }
      );
    } else openRoles();
  }
  function startGame(sv) {
    const two = App.twoP;
    const skins = sv ? sv.skins : [App.pick[0], two ? App.pick[1] : 1];
    const endless = sv ? !!sv.endless : !!App.endless;
    show(null);
    UI.fade(() => {
      const g = new PF.Game({ twoP: two, skins, save: sv, endless });
      App.game = g;
      UI.game = g;
      PF.Input.twoP = two;
      PF.Input.reset();
      UI.showHUD(true);
      $('#deskHint').textContent = two ? '1P：WASD 移动 · F 交互 · Q 技能　｜　2P：方向键 移动 · Enter 交互 · 右Shift 技能　｜　Esc 暂停' : 'WASD / 方向键 移动 · 停下来自动采集/战斗 · 空格 交互 · Q 技能 · Esc 暂停';
      A.music(g.isNight() ? 'night' : 'day');
      if (!sv) {
        App.introT = 2.4;
        g.cam.zoomMul = 0.45;
        if (!endless) {
          g.later(() => UI.toast('停在树旁边不动，会自动砍树'), 600);
          g.later(() => UI.toast('先攒 30 木材，去左边建木料场'), 3200);
        }
        if (!Save.meta.seenIntro) {
          Save.meta.seenIntro = true;
          Save.saveMeta();
        }
        showMoveHint();
      } else {
        UI.toast('欢迎回来！第 ' + (g.st.day + 1) + ' 天');
      }
      if (window.__pfDebug) window.__pfDebug(g);
    });
  }
  /* 手机第一次进游戏：提示怎么移动 */
  function showMoveHint() {
    if (!U.isTouch() || Save.meta.seenMoveHint) return;
    const el = $('#moveHint');
    el.classList.add('on');
    const off = () => {
      el.classList.remove('on');
      Save.meta.seenMoveHint = true;
      Save.saveMeta();
      $('#touch').removeEventListener('pointerdown', off);
    };
    $('#touch').addEventListener('pointerdown', off);
  }
  function toMenu() {
    if (App.game && !App.game.over && App.game.st.won !== 'ended' && !App.game.mini) App.game.save();
    if (App.game) App.game.destroy();
    $('#moveHint').classList.remove('on');
    App.game = null;
    UI.game = null;
    UI.close(true);
    UI.showHUD(false);
    PF.Input.reset();
    A.music('menu');
    show('mode');
  }

  /* ---------------- 主循环 ---------------- */
  function resize() {
    App.W = window.innerWidth;
    App.H = window.innerHeight;
    App.dpr = Math.min(window.devicePixelRatio || 1, 2);
    // 超大屏限制像素总量，保证帧率
    const px = App.W * App.H * App.dpr * App.dpr;
    if (px > 4.2e6) App.dpr = Math.max(1, Math.sqrt(4.2e6 / (App.W * App.H)));
    App.cv.width = Math.round(App.W * App.dpr);
    App.cv.height = Math.round(App.H * App.dpr);
    if (App.game) {
      App.game.cam.W = App.W;
      App.game.cam.H = App.H;
    }
  }
  let last = 0;
  function frame(ts) {
    const dt = Math.min(0.05, (ts - last) / 1000) || 0.016;
    last = ts;
    const ctx = App.ctx;
    const g = App.game;
    try {
      if (g) {
        g.cam.W = App.W;
        g.cam.H = App.H;
        if (PF.Input.pausePressed()) {
          if (!UI.modal) UI.openPause();
          else {
            // Esc 关闭可关闭的弹窗
            const b = UI.modal.el.querySelector('[data-act="resume"],[data-act="close"],[data-act="ok"]');
            if (b) b.click();
          }
        }
        if (App.introT > 0) {
          App.introT -= dt;
          g.cam.zoomMul = U.lerp(1, 0.45, U.easeInOut(Math.max(0, App.introT) / 2.4));
          if (App.introT <= 0) g.cam.zoomMul = 1;
        }
        g.update(dt);
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.fillStyle = '#1c1424';
        ctx.fillRect(0, 0, App.cv.width, App.cv.height);
        g.render(ctx, App.dpr);
        const hud = $('#hud');
        const mini = !!g.mini;
        if (hud.classList.contains('mini') !== mini) hud.classList.toggle('mini', mini);
        if (!mini) UI.updateHUD(g, dt);
        else {
          UI.promptEls.forEach((e) => e.classList.remove('on'));
          UI.actBtn.classList.remove('on');
        }
      } else {
        App.menuT += dt;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.fillStyle = '#2f8fc0';
        ctx.fillRect(0, 0, App.cv.width, App.cv.height);
        Menu.render(ctx, App.dpr, App.W, App.H, App.menuT);
        if (App.story) {
          App.story.t += dt;
          Art.story(App.storyCx, App.story.k, App.menuT);
        }
      }
    } catch (e) {
      console.error(e);
    }
    PF.Input.endFrame();
    requestAnimationFrame(frame);
  }

  function boot() {
    App.cv = $('#cv');
    App.ctx = App.cv.getContext('2d');
    App.storyCx = $('#storyCv').getContext('2d');
    Save.loadMeta();
    A.setMusic(Save.meta.settings.music);
    A.setSfx(Save.meta.settings.sfx);
    if (U.isTouch()) document.body.classList.add('touch');
    PF.Input.init($('#touch'));
    UI.init();
    Menu.init();
    resize();
    window.addEventListener('resize', resize);
    window.addEventListener('orientationchange', () => setTimeout(resize, 200));
    const unlockAudio = () => {
      A.unlock();
    };
    document.addEventListener('pointerdown', unlockAudio, true);
    document.addEventListener('keydown', unlockAudio, true);
    // 点过的按钮不保留焦点，免得空格键又“按”了它一次
    document.addEventListener('click', (e) => {
      const b = e.target.closest && e.target.closest('button');
      if (b) setTimeout(() => b.blur(), 0);
    });
    // 电脑：滚轮缩放
    window.addEventListener(
      'wheel',
      (e) => {
        if (!App.game || UI.modal || App.game.mini || App.introT > 0) return;
        const c = App.game.cam;
        c.zoomMul = U.clamp(c.zoomMul * (e.deltaY > 0 ? 0.9 : 1.11), 0.6, 1.6);
      },
      { passive: true }
    );
    // 菜单按钮
    document.querySelectorAll('[data-go]').forEach((b) =>
      b.addEventListener('click', () => {
        A.unlock();
        A.play('click');
        const go = b.dataset.go;
        if (go === 'help') return UI.openHelp();
        if (go === 'mode') A.music('menu');
        show(go);
      })
    );
    document.querySelectorAll('[data-mode]').forEach((b) =>
      b.addEventListener('click', () => {
        A.play('click');
        if (b.dataset.mode === 'e') return chooseEndless();
        chooseMode(b.dataset.mode === '2');
      })
    );
    $('#roleGrid').addEventListener('click', (e) => {
      const b = e.target.closest('[data-role]');
      if (!b) return;
      A.play('click');
      App.sel = +b.dataset.role;
      renderRoles();
    });
    $('#btnTalent').addEventListener('click', () => {
      A.play('click');
      if (PF.Hooks.openTalents) PF.Hooks.openTalents(() => refreshMode());
    });
    $('#btnAch').addEventListener('click', () => {
      A.play('click');
      if (PF.Hooks.openAchievements) PF.Hooks.openAchievements(() => refreshMode());
    });
    $('#btnMusic').addEventListener('click', () => {
      const M = Save.meta;
      M.settings.music = !M.settings.music;
      A.setMusic(M.settings.music);
      Save.saveMeta();
      refreshMode();
    });
    $('#btnSfx').addEventListener('click', () => {
      const M = Save.meta;
      M.settings.sfx = !M.settings.sfx;
      A.setSfx(M.settings.sfx);
      Save.saveMeta();
      refreshMode();
      A.play('click');
    });
    $('#scrStory').addEventListener('click', (e) => {
      if (e.target.id === 'storySkip') return;
      storyNext();
    });
    $('#storySkip').addEventListener('click', (e) => {
      e.stopPropagation();
      A.play('click');
      App.story = null;
      startGame(null);
    });
    U.bus.on('toMenu', toMenu);
    U.bus.on('res', (i) => {
      if (i == null) return;
      const el = document.getElementById('r' + i);
      if (!el) return;
      const p = el.parentElement;
      p.classList.remove('bump');
      void p.offsetWidth;
      p.classList.add('bump');
    });
    document.addEventListener('visibilitychange', () => {
      A.duck(document.hidden || (App.game && App.game.paused));
      if (document.hidden && App.game) {
        if (!App.game.mini && !App.game.over) App.game.save();
        if (!UI.modal && !App.game.over && !App.game.cut) UI.openPause();
      }
    });
    window.addEventListener('pagehide', () => {
      if (App.game && !App.game.mini && !App.game.over) App.game.save();
    });
    // 键盘操作菜单：空格/回车开始
    window.addEventListener('keydown', (e) => {
      if (App.game || UI.modal) return;
      if (App.screen === 'title' && (e.code === 'Space' || e.code === 'Enter')) {
        A.unlock();
        show('mode');
      } else if (App.screen === 'story' && (e.code === 'Space' || e.code === 'Enter')) storyNext();
    });
    show('title');
    A.music('menu');
    requestAnimationFrame(frame);
    if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    }
  }

  PF.App = App;
  PF.Art = Art;
  window.addEventListener('DOMContentLoaded', boot);
})();
