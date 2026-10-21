/* 界面：HUD、交互气泡、弹窗、菜单页 */
(function () {
  'use strict';
  const PF = (window.PF = window.PF || {});
  const U = PF.U,
    D = PF.Data,
    S = PF.Spr,
    A = PF.Audio;
  const $ = (s, r) => (r || document).querySelector(s);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

  const UI = {
    game: null,
    modal: null,
    hudCache: {},
    mmT: 0,
    clockT: 0,
    init() {
      this.dlgRoot = $('#dlg');
      this.toastRoot = $('#toasts');
      this.promptEls = [$('#prompt0'), $('#prompt1')];
      this.actBtn = $('#actBtn');
      this.mm = $('#minimap');
      this.clock = $('#clock');
      // 资源图标
      document.querySelectorAll('[data-icon]').forEach((el) => {
        el.src = S.iconURL(+el.dataset.icon, 3);
      });
      this.promptEls.forEach((el, i) => {
        el.addEventListener('click', (e) => {
          e.stopPropagation();
          if (this.game) this.game.doPrompt(i);
        });
        el.addEventListener('pointerdown', (e) => e.stopPropagation());
      });
      this.actBtn.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        e.preventDefault();
        this.actBtn.classList.add('press');
      });
      this.actBtn.addEventListener('pointerup', (e) => {
        e.stopPropagation();
        this.actBtn.classList.remove('press');
        const g = this.game;
        if (!g) return;
        const pr = g.prompts[0];
        if (pr && pr.cost && !g.canAfford(pr.cost)) {
          A.play('wrong');
          this.toast('还差 ' + g.lack(pr.cost).map((l) => D.RES[l[0]].name + ' ' + l[1]).join('、'));
          return;
        }
        g.doPrompt(0);
      });
      this.actBtn.addEventListener('pointerleave', () => this.actBtn.classList.remove('press'));
      $('#btnPause').addEventListener('click', () => this.game && this.openPause());
      $('#letterBtn').addEventListener('click', () => this.game && this.openLetter());
      $('#minimap').addEventListener('click', () => this.mm.classList.toggle('big'));
      U.bus.on('toast', (m) => this.toast(m));
      U.bus.on('res', () => {
        this.refreshDialog();
      });
      U.bus.on('task', (i) => this.onTask(i));
      U.bus.on('letter', () => this.toast('收到一封海盗来信'));
      U.bus.on('dusk', () => this.toast('天快黑了……海盗会在夜里出没'));
      U.bus.on('day', (d) => this.dayBanner(d));
      U.bus.on('campAttacked', () => this.flashWarn('营地正在被攻击！'));
      U.bus.on('dialog', (name, data) => this.openNamed(name, data));
    },

    /* ---------------- 通用 ---------------- */
    costHTML(cost, game) {
      if (!cost) return '';
      let h = '';
      for (let i = 0; i < 4; i++) {
        if (!cost[i]) continue;
        const lack = game && game.st.res[i] < cost[i];
        h += `<span class="cost${lack ? ' lack' : ''}"><img src="${S.iconURL(i, 3)}" alt="">${cost[i]}</span>`;
      }
      return h || '<span class="cost free">免费</span>';
    },
    open(html, cls, onAct, opts) {
      this.close(true);
      const wrap = document.createElement('div');
      wrap.className = 'dlg-wrap';
      wrap.innerHTML = `<div class="dlg panel ${cls || ''}">${html}</div>`;
      this.dlgRoot.appendChild(wrap);
      wrap.addEventListener('pointerdown', (e) => e.stopPropagation());
      wrap.addEventListener('click', (e) => {
        const b = e.target.closest('[data-act]');
        if (b && !b.classList.contains('disabled')) {
          A.play('click');
          onAct && onAct(b.dataset.act, b, wrap);
        } else if (e.target === wrap && opts && opts.backdropClose) {
          this.close();
        }
      });
      this.modal = { el: wrap, cls, onAct, opts: opts || {} };
      if (this.game && !(opts && opts.noPause)) {
        this.game.paused = true;
        if (opts && opts.duck) A.duck(true);
      }
      PF.Input.reset();
      A.play('open');
      requestAnimationFrame(() => wrap.classList.add('show'));
      return wrap;
    },
    close(silent) {
      if (!this.modal) return;
      const m = this.modal;
      this.modal = null;
      m.el.remove();
      if (m.opts.onClose) m.opts.onClose();
      if (this.game && !this.modal) this.game.paused = false;
      A.duck(false);
      if (!silent) A.play('close');
    },
    refreshDialog() {
      const m = this.modal;
      if (m && m.opts.refresh) {
        const body = m.el.querySelector('.dlg');
        const scroll = body.querySelector('.scroll');
        const st = scroll ? scroll.scrollTop : 0;
        body.innerHTML = m.opts.refresh();
        const sc2 = body.querySelector('.scroll');
        if (sc2) sc2.scrollTop = st;
      }
    },
    toast(msg) {
      if (!msg) return;
      const el = document.createElement('div');
      el.className = 'toast';
      el.textContent = msg;
      this.toastRoot.appendChild(el);
      while (this.toastRoot.children.length > 3) this.toastRoot.firstChild.remove();
      setTimeout(() => el.classList.add('out'), 2600);
      setTimeout(() => el.remove(), 3100);
    },
    flashWarn(msg) {
      const el = $('#warn');
      el.textContent = msg;
      el.classList.remove('on');
      void el.offsetWidth;
      el.classList.add('on');
    },
    dayBanner(d) {
      const el = $('#banner');
      el.innerHTML = `<div class="big">第 ${d + 1} 天</div><div class="sub">海盗撤退了，抓紧白天发展吧</div>`;
      el.classList.remove('on');
      void el.offsetWidth;
      el.classList.add('on');
    },
    onTask(i) {
      const r = D.TASKS[i].reward;
      let rw = '';
      if (r) for (let k = 0; k < 4; k++) if (r[k]) rw += ` ${D.RES[k].name}+${r[k]}`;
      this.toast('✓ 完成目标：' + D.TASKS[i].text + (rw ? '（奖励' + rw + '）' : ''));
      A.play('success');
      const t = $('#task');
      t.classList.remove('done');
      void t.offsetWidth;
      t.classList.add('done');
    },

    /* ---------------- HUD ---------------- */
    showHUD(on) {
      $('#hud').classList.toggle('hidden', !on);
      if (!on) {
        this.promptEls.forEach((e) => e.classList.remove('on'));
        this.actBtn.classList.remove('on');
      }
    },
    set(id, v) {
      if (this.hudCache[id] === v) return;
      this.hudCache[id] = v;
      const el = document.getElementById(id);
      if (el) el.textContent = v;
    },
    el(id) {
      const c = (this.elCache = this.elCache || {});
      return c[id] || (c[id] = document.getElementById(id));
    },
    toggle(id, cls, on) {
      const e = this.el(id);
      if (e && e.classList.contains(cls) !== on) e.classList.toggle(cls, on);
    },
    updateHUD(g, dt) {
      const st = g.st;
      this.set('r0', st.res[0]);
      this.set('r1', st.res[1]);
      this.set('r2', st.res[2]);
      this.set('r3', st.res[3]);
      this.set('dayLabel', (g.endless ? '第' + (st.day + 1) + '夜' : '第' + (st.day + 1) + '天'));
      const ext = g.collect('taskText');
      if (ext.length) this.set('taskText', ext[0]);
      else {
        const ti = g.currentTask();
        this.set('taskText', ti < 0 ? '全部目标完成！去追求更好的结局吧' : D.TASKS[ti].text + (g.taskProgress(ti) ? ' (' + g.taskProgress(ti) + ')' : ''));
      }
      // 倒计时
      const showCd = st.countdown > 0;
      this.toggle('countdown', 'on', showCd);
      if (showCd) this.set('cdNum', '0:' + String(Math.ceil(st.countdown)).padStart(2, '0'));
      this.toggle('letterBtn', 'on', !!st.letterUnread);
      // 营地血量
      const hpF = st.campHp / g.campHpMax();
      const w = Math.round(U.clamp(hpF, 0, 1) * 100) + '%';
      if (this.hudCache.campW !== w) {
        this.hudCache.campW = w;
        this.el('campHp').style.width = w;
      }
      this.toggle('campHp', 'low', hpF < 0.35);
      this.set('campHpTxt', Math.ceil(st.campHp) + '/' + g.campHpMax());
      let pirN = 0;
      for (const p of g.pirates) if (!p.dead) pirN++;
      this.toggle('pirN', 'on', pirN > 0);
      this.set('pirNum', pirN);
      // 时钟与小地图
      this.clockT -= dt;
      if (this.clockT <= 0) {
        this.clockT = 0.5;
        this.drawClock(g);
      }
      this.mmT -= dt;
      if (this.mmT <= 0) {
        this.mmT = 0.25;
        this.drawMinimap(g);
      }
      this.updatePrompts(g);
    },
    drawClock(g) {
      const c = this.clock;
      const x = c.getContext('2d');
      const W = c.width;
      x.clearRect(0, 0, W, W);
      const DL = g.dayLen;
      const cyc = g.dayLen + g.nightLen;
      const t = g.st.cycleT;
      const r = W / 2 - 4;
      // 白天弧 / 夜晚弧
      x.lineWidth = 7;
      x.strokeStyle = '#ffd23f';
      x.beginPath();
      x.arc(W / 2, W / 2, r - 3, -Math.PI / 2, -Math.PI / 2 + (DL / cyc) * Math.PI * 2);
      x.stroke();
      x.strokeStyle = '#4b5bd1';
      x.beginPath();
      x.arc(W / 2, W / 2, r - 3, -Math.PI / 2 + (DL / cyc) * Math.PI * 2, Math.PI * 1.5);
      x.stroke();
      const night = g.isNight();
      x.fillStyle = night ? '#1b2050' : '#7fd0ff';
      x.beginPath();
      x.arc(W / 2, W / 2, r - 8, 0, Math.PI * 2);
      x.fill();
      // 指针
      const a = -Math.PI / 2 + (t / cyc) * Math.PI * 2;
      x.strokeStyle = '#fff';
      x.lineWidth = 3;
      x.beginPath();
      x.moveTo(W / 2, W / 2);
      x.lineTo(W / 2 + Math.cos(a) * (r - 4), W / 2 + Math.sin(a) * (r - 4));
      x.stroke();
      x.fillStyle = night ? '#e8eef4' : '#ffd23f';
      x.beginPath();
      x.arc(W / 2, W / 2, 5, 0, Math.PI * 2);
      x.fill();
      if (night) {
        x.fillStyle = '#1b2050';
        x.beginPath();
        x.arc(W / 2 + 3, W / 2 - 2, 4, 0, Math.PI * 2);
        x.fill();
      }
    },
    drawMinimap(g) {
      const c = this.mm;
      const x = c.getContext('2d');
      const W = c.width;
      const w = g.world;
      const N = D.N,
        T = D.TILE;
      const pad = 10;
      const cs = (W - pad * 2) / N;
      x.fillStyle = '#2f6f99';
      x.fillRect(0, 0, W, W);
      // 大陆
      if (w.revealed) {
        x.fillStyle = '#6fbf4a';
        const d = w.mainDir;
        if (d === 0) x.fillRect(0, 0, W, pad - 3);
        if (d === 1) x.fillRect(0, W - pad + 3, W, pad);
        if (d === 2) x.fillRect(0, 0, pad - 3, W);
        if (d === 3) x.fillRect(W - pad + 3, 0, pad, W);
      }
      const bcol = { meadow: '#79c850', forest: '#4f9a3f', farm: '#a6cf55', rock: '#8d87a9', snow: '#e2ecf4', sand: '#f0d796' };
      for (const t of w.tiles) {
        const px = pad + t.c * cs,
          py = pad + t.r * cs;
        x.fillStyle = t.unlocked ? bcol[t.biome] : '#c9d1df';
        x.fillRect(px + 0.5, py + 0.5, cs - 1, cs - 1);
      }
      const dot = (wx, wy, col, s) => {
        x.fillStyle = col;
        x.fillRect(pad + (wx / T) * cs - s / 2, pad + (wy / T) * cs - s / 2, s, s);
      };
      for (const p of w.portals) if (w.tiles[p.tile].unlocked) dot(p.x, p.y, D.WORLDS[p.world].color, 6);
      for (const b of w.buildings) if (b.built) dot(b.x, b.y, b.kind === 'camp' ? '#ff5a4f' : '#7a4a2a', b.kind === 'camp' ? 8 : 5);
      for (const ch of w.chests) if (!ch.opened && w.tiles[ch.tile].unlocked) dot(ch.x, ch.y, '#ffd23f', 4);
      if (w.dock) dot(w.dock.x, w.dock.y, '#fff', 6);
      for (const p of g.pirates) if (!p.dead) dot(p.x, p.y, '#ff2a2a', 4);
      for (const p of g.players) dot(p.x, p.y, p.idx ? '#6fd3ff' : '#fff36b', 6);
      x.strokeStyle = 'rgba(255,255,255,0.8)';
      x.lineWidth = 1;
      const v = g.cam.view;
      x.strokeRect(pad + (v.x0 / T) * cs, pad + (v.y0 / T) * cs, ((v.x1 - v.x0) / T) * cs, ((v.y1 - v.y0) / T) * cs);
    },
    updatePrompts(g) {
      const cam = g.cam;
      const touch = PF.Input.usedTouch || U.isTouch();
      // 双人站在一起时把两个气泡左右错开
      const pos = g.players.map((p) => cam.toScreen(p.x, p.y - 150));
      if (pos.length > 1 && g.prompts[0] && g.prompts[1]) {
        const dx = pos[1].x - pos[0].x;
        if (Math.abs(pos[1].y - pos[0].y) < 60 && Math.abs(dx) < 190) {
          const mid = (pos[0].x + pos[1].x) / 2;
          const s = dx >= 0 ? 1 : -1;
          pos[0].x = mid - s * 95;
          pos[1].x = mid + s * 95;
        }
      }
      for (let i = 0; i < 2; i++) {
        const el = this.promptEls[i];
        const pr = g.prompts[i];
        const p = g.players[i];
        const show = !!pr && !!p && !g.paused && !g.cut && !g.over;
        if (!show) {
          if (el.classList.contains('on')) el.classList.remove('on');
          continue;
        }
        const key = pr.kind + '|' + pr.label + '|' + (pr.cost ? pr.cost.join(',') + '|' + g.canAfford(pr.cost) + g.st.res.join(',') : '');
        if (el._key !== key) {
          el._key = key;
          const keyHint = touch ? '' : `<span class="key">${g.twoP ? (i ? 'Enter' : 'F') : '空格'}</span>`;
          const lack = pr.cost ? g.lack(pr.cost) : [];
          const lackTxt = lack.length ? '<div class="lk">还差 ' + lack.map((l) => D.RES[l[0]].name + ' ' + l[1]).join('、') + '</div>' : '';
          el.innerHTML = `<div class="pl">${keyHint}${esc(pr.label)}</div>${pr.cost ? '<div class="pc">' + this.costHTML(pr.cost, g) + '</div>' : ''}${pr.note ? '<div class="lk ok">' + esc(pr.note) + '</div>' : ''}${lackTxt}`;
          el.classList.toggle('cant', !!pr.cost && !g.canAfford(pr.cost));
        }
        const s = pos[i];
        el.style.transform = `translate(${Math.round(s.x)}px, ${Math.round(s.y)}px) translate(-50%, -100%)`;
        if (!el.classList.contains('on')) el.classList.add('on');
      }
      // 单人触屏大按钮
      const pr0 = g.prompts[0];
      const showBtn = touch && !g.twoP && !!pr0 && !g.paused && !g.cut && !g.over;
      this.actBtn.classList.toggle('on', showBtn);
      if (showBtn) {
        const lab = pr0.kind === 'unlock' ? '驱散' : pr0.kind === 'build' || pr0.kind === 'dock' ? '建造' : pr0.kind === 'portal' ? '进入' : pr0.kind === 'sail' ? '启航' : '打开';
        if (this.actBtn._l !== lab) {
          this.actBtn._l = lab;
          this.actBtn.textContent = lab;
        }
      }
    },

    /* ---------------- 弹窗 ---------------- */
    openNamed(name, data) {
      switch (name) {
        case 'camp': return this.openCamp(data || 0);
        case 'industry': return this.openIndustry(data);
        case 'shop': return this.openShop(data || 0);
        case 'revive': return this.openRevive(data);
        case 'over': return this.openOver(data);
        case 'win': return this.openWin();
        case 'portal': return this.openPortal(data);
        case 'miniResult': return this.openMiniResult(data);
      }
    },
    lackShort(cost) {
      const l = this.game ? this.game.lack(cost) : [];
      if (!l.length) return '不足';
      const short = ['木', '稻', '晶', '金'];
      return '差' + l[0][1] + short[l[0][0]];
    },
    upRow(icon, title, desc, cost, act, state, label) {
      // state: 'max' | 'lack' | ''
      const btn = state === 'max' ? '<span class="maxed">已满级</span>' : `<button class="btn sm ${state === 'lack' ? 'gray' : 'green'}" data-act="${act}">${state === 'lack' ? this.lackShort(cost) : label || '升级'}</button>`;
      return `<div class="row"><div class="ic">${icon}</div><div class="mid"><div class="t">${title}</div><div class="d">${desc}</div>${state === 'max' ? '' : '<div class="cs">' + this.costHTML(cost, this.game) + '</div>'}</div>${btn}</div>`;
    },
    imgIcon(k) {
      return `<img class="pix" src="${S.iconURL(k, 3)}" alt="">`;
    },
    spriteIcon(canvas) {
      return `<img class="pix" src="${S.spriteURL(canvas, 3)}" alt="">`;
    },
    /* 带标签页的弹窗。tab: {id, title, render(g, ui) → html, act(g, act, ui)}
       系统可以通过 campTabs / shopTabs 钩子往营地、集市里加标签页 */
    openTabbed(title, tabs, cur) {
      const g = this.game;
      cur = Math.min(cur || 0, tabs.length - 1);
      const render = () => {
        const t = tabs[cur];
        let body = '';
        try {
          body = t.render(g, this);
        } catch (e) {
          console.error(e);
          body = '<div class="info">出错了</div>';
        }
        const tabBar = tabs.length > 1 ? `<div class="tabs${tabs.length > 3 ? ' many' : ''}">${tabs.map((x, i) => `<button class="tab ${i === cur ? 'on' : ''}" data-act="tab${i}">${x.title}</button>`).join('')}</div>` : '';
        return `<div class="dh"><span>${title}</span><button class="x" data-act="close">✕</button></div>${tabBar}<div class="scroll">${body}</div>`;
      };
      this.open(
        render(),
        'w-md',
        (act, btn) => {
          if (act === 'close') return this.close();
          if (/^tab\d+$/.test(act)) cur = +act.slice(3);
          else if (tabs[cur].act) tabs[cur].act(g, act, this, btn);
          if (this.modal) this.refreshDialog();
        },
        { refresh: render }
      );
    },
    openCamp(pi) {
      const g = this.game;
      const keys = ['cap', 'wspeed', 'pspeed', 'hp'];
      const titles = ['精灵上限', '精灵速度', '玩家速度', '营地加固'];
      const tabs = [
        {
          id: 'workers',
          title: '小精灵',
          render: () => {
            let body = '';
            const cap = g.workerCap();
            const n = g.workers.length;
            const idle = g.workers.filter((w) => w.type < 0).length;
            const hc = [0, 0, 0, D.hireCost(n)];
            body += `<div class="info">小精灵会自动去采集资源并搬回营地，遇到敌人也会帮忙打。<br>现有 <b>${n}/${cap}</b> 只，空闲 <b>${idle}</b> 只</div>`;
            const hireLabel = n >= cap ? '已满' : g.canAfford(hc) ? '召唤' : this.lackShort(hc);
            body += `<div class="row"><div class="ic">${this.spriteIcon(S.worker('idle0'))}</div><div class="mid"><div class="t">召唤小精灵</div><div class="d">${n >= cap ? '已达上限，去“升级营地”提升精灵上限' : '新精灵出生后在营地待命，记得指派工作'}</div><div class="cs">${this.costHTML(hc, g)}</div></div><button class="btn sm ${n >= cap || !g.canAfford(hc) ? 'gray' : 'green'}" data-act="hire">${hireLabel}</button></div>`;
            const names = ['伐木', '收稻', '挖晶'];
            for (let t = 0; t < 3; t++) {
              const c = g.workers.filter((w) => w.type === t).length;
              body += `<div class="row assign"><div class="ic">${this.imgIcon(t)}</div><div class="mid"><div class="t">${names[t]}</div><div class="d">最多 ${D.MAX_PER_TYPE} 只</div></div><button class="btn sq ${c ? 'red' : 'gray'}" data-act="dec${t}">－</button><span class="num">${c}</span><button class="btn sq ${idle && c < D.MAX_PER_TYPE ? 'green' : 'gray'}" data-act="inc${t}">＋</button></div>`;
            }
            if (g.st.superMan) body += `<div class="info small">★ 森林先知：第一只精灵速度 +50%</div>`;
            if (g.st.speedUpT > 0) body += `<div class="info small">★ 精灵加速剩余 ${U.fmtTime(g.st.speedUpT)}</div>`;
            return body;
          },
          act: (g2, act) => {
            if (act === 'hire') g.hire();
            else if (act.startsWith('inc')) g.assign(+act[3], 1);
            else if (act.startsWith('dec')) g.assign(+act[3], -1);
          },
        },
        {
          id: 'camp',
          title: '升级营地',
          render: () => {
            const camp = g.world.camp();
            let body = `<div class="info">营地被毁就会失败。站在营地旁边不动，可以用锤子修理营地。<br>营地血量 <b>${Math.ceil(g.st.campHp)}/${g.campHpMax()}</b></div>`;
            for (let k = 0; k < 4; k++) {
              const tbl = D.CAMP[keys[k]];
              const lv = camp.lv[k];
              const max = lv >= D.maxLevel(tbl);
              const v = tbl.vals[lv],
                nv = max ? null : tbl.vals[lv + 1];
              const desc =
                k === 0 ? `可召唤 ${v}${nv != null ? ' → ' + nv : ''} 只` : k === 1 ? `精灵移速 ${v}${nv != null ? ' → ' + nv : ''}` : k === 2 ? `玩家移速 ${v}${nv != null ? ' → ' + nv : ''}` : `营地血量 ${v}${nv != null ? ' → ' + nv : ''}`;
              const cost = max ? null : tbl.cost[lv + 1];
              const icons = [this.spriteIcon(S.worker('idle0')), this.spriteIcon(S.worker('walk0', true)), this.spriteIcon(S.human(g.skins[0], 'walk0')), this.imgIcon(4)];
              body += this.upRow(icons[k], `${titles[k]} Lv${lv + 1}`, desc, cost, 'up' + k, max ? 'max' : g.canAfford(cost) ? '' : 'lack');
            }
            return body;
          },
          act: (g2, act) => {
            if (act.startsWith('up')) g.upgradeCamp(+act[2]);
          },
        },
      ].concat(g.collect('campTabs', pi || 0));
      this.openTabbed('营地', tabs, 0);
    },
    openIndustry(key) {
      const g = this.game;
      const items = D.INDUSTRY_ITEMS[key];
      const type = ['wood', 'rice', 'crystal'].indexOf(key);
      const render = () => {
        const b = g.world.building(key);
        const def = D.BUILDINGS[key];
        let body = `<div class="info">${def.name}每 <b>${def.prod}</b> 秒自动产出 1 ${D.RES[type].name}。在这里升级${D.RES[type].name}相关的能力。</div>`;
        const icons = [S.tree(1, 'leaf', 0), S.rice(1, 0), S.crystal(1, 0)];
        items.forEach((it, k) => {
          const tbl = D.INDUSTRY[key][it.key];
          const lv = b.lv[k];
          const max = lv >= D.maxLevel(tbl);
          const cost = max ? null : tbl.cost[lv + 1];
          const icon = k === 0 ? this.spriteIcon(icons[type]) : k === 1 ? this.imgIcon(type) : k === 2 ? this.spriteIcon(S.worker('idle0')) : this.spriteIcon(S.tool(['axe', 'sickle', 'pick'][type]));
          body += this.upRow(icon, `${it.title} Lv${lv + 1}`, it.desc(tbl.vals[lv], max ? null : tbl.vals[lv + 1]), cost, 'up' + k, max ? 'max' : g.canAfford(cost) ? '' : 'lack');
        });
        return `<div class="dh"><span>${def.name}</span><button class="x" data-act="close">✕</button></div><div class="scroll">${body}</div>`;
      };
      this.open(render(), 'w-md', (act) => {
        if (act === 'close') return this.close();
        if (act.startsWith('up')) g.upgradeIndustry(key, +act[2]);
        this.refreshDialog();
      }, { refresh: render });
    },
    openShop(pi) {
      const g = this.game;
      const tabs = [
        {
          id: 'trade',
          title: '交易',
          render: () => {
            let body = `<div class="info">商人只收木材、水稻和金币。武器越好，打敌人越轻松。</div>`;
            g.shopItems().forEach((it, i) => {
              const icon = typeof it.icon === 'number' ? this.imgIcon(it.icon) : this.spriteIcon(S.tool(g.st.holySword ? 'holy' : 'sword'));
              const state = it.max ? 'max' : g.canAfford(it.cost) ? '' : 'lack';
              const btn = state === 'max' ? '<span class="maxed">已满级</span>' : `<button class="btn sm ${state === 'lack' ? 'gray' : 'green'}" data-act="buy${i}">${state === 'lack' ? this.lackShort(it.cost) : i === 0 ? '升级' : '兑换'}</button>`;
              body += `<div class="row"><div class="ic">${icon}</div><div class="mid"><div class="t">${it.title}</div><div class="d">${it.desc}</div>${state === 'max' ? '' : '<div class="cs">' + this.costHTML(it.cost, g) + '</div>'}</div>${btn}</div>`;
            });
            return body;
          },
          act: (g2, act) => {
            if (act.startsWith('buy')) g.shopBuy(+act[3]);
          },
        },
      ].concat(g.collect('shopTabs', pi || 0));
      this.openTabbed('集市', tabs, 0);
    },
    openLetter() {
      const g = this.game;
      const st = g.st;
      const L = D.LETTERS[Math.min(st.letterIdx, D.LETTERS.length - 1)];
      st.letterUnread = false;
      st.letterIdx = (st.letterIdx + 1) % D.LETTERS.length;
      if (st.letterIdx === 0) st.letterIdx = 1; // 第一封只读一次
      const html = `<div class="letter"><div class="lt">${L.slice(0, -1).map(esc).join('<br>')}</div><div class="sig">${esc(L[L.length - 1])}</div><div class="ld">${this.spriteIcon(S.pirate(2, 'idle0'))}</div></div>
        <div class="btns"><button class="btn" data-act="ok">知道了</button></div>`;
      A.play('letter');
      this.open(html, 'w-sm paper', () => this.close());
    },
    openRevive(reason) {
      const g = this.game;
      if (!g || g.dead) return;
      const st = g.st;
      const render = () => {
        const cost = [0, 0, 0, D.reviveCost(st.revives)];
        const title = reason === 'camp' ? '营地被摧毁了！' : g.twoP ? '你们都被打倒了！' : '你被打倒了！';
        return `<div class="dh center"><span>${title}</span></div>
          <div class="info center">复活后：所有人满血、营地修好，附近的敌人被震退。</div>
          <div class="btns col">
            ${st.freeRevives > 0 ? `<button class="btn green" data-act="free">免费复活（还剩 ${st.freeRevives} 次）</button>` : ''}
            <button class="btn ${g.canAfford(cost) ? 'yellow' : 'gray'}" data-act="pay">花费金币复活 <span class="cost inline"><img src="${S.iconURL(3, 3)}">${cost[3]}</span></button>
            <button class="btn red" data-act="end">结束本局</button>
          </div>`;
      };
      this.open(render(), 'w-sm', (act) => {
        if (act === 'free') {
          if (g.revive(false)) this.close();
        } else if (act === 'pay') {
          if (g.revive(true)) this.close();
          else this.toast('金币不足');
        } else if (act === 'end') {
          this.close(true);
          g.giveUp();
        }
      }, { refresh: render });
    },
    openOver(data) {
      const g = this.game;
      const st = g.st;
      const w = g.world;
      const win = data.win;
      const endNames = ['结局一 · 登上新大陆', '结局二 · 迷雾之子', '结局三 · 迷雾之王'];
      const res = st.gathered;
      let rows = `<div class="stat"><span>用时</span><b>${U.fmtTime(st.elapsed, true)}</b></div>
        <div class="stat"><span>驱散迷雾</span><b>${w.unlockedCount() - 5} 块</b></div>
        <div class="stat"><span>召唤精灵</span><b>${st.hired} 只</b></div>
        <div class="stat"><span>击退海盗</span><b>${st.kills} 个</b></div>
        <div class="stat"><span>坚持天数</span><b>${st.day + 1} 天</b></div>
        <div class="stat"><span>异世界</span><b>${Object.keys(st.worlds).length}/4</b></div>`;
      for (let i = 0; i < g.players.length; i++) {
        rows += `<div class="stat wide"><span>${g.twoP ? (i ? '2P' : '1P') + ' ' : ''}亲手收集</span><b>${this.imgIcon(0)}${res[i][0]} ${this.imgIcon(1)}${res[i][1]} ${this.imgIcon(2)}${res[i][2]}</b></div>`;
      }
      let extra = '';
      if (win) {
        extra += `<div class="stamp e${data.ending}">${endNames[data.ending]}</div>`;
        if (st.newBest) extra += `<div class="info center gold">★ 新纪录！</div>`;
        if (data.ending < 2) extra += `<div class="info small center">${data.ending === 0 ? '提示：通关全部 4 个异世界后再登陆，会解锁新结局' : '提示：通关异世界且驱散全部 81 块迷雾，会解锁最终结局'}</div>`;
      }
      if (data.newly && data.newly.length) extra += `<div class="info center gold">解锁新角色：${data.newly.map((i) => D.ROLES[i].name).join('、')}</div>`;
      if (data.extra && data.extra.length) extra += data.extra.join('');
      const head = data.title || (win ? '探险成功' : '探险失败');
      const html = `<div class="dh center ${win ? 'win' : 'lose'}"><span>${head}</span></div>
        <div class="over-hero">${g.players.map((p) => this.spriteIcon(S.human(p.skin, 'idle0'))).join('')}</div>
        ${extra}<div class="stats">${rows}</div>${data.statsExtra ? '<div class="stats">' + data.statsExtra.join('') + '</div>' : ''}
        <div class="btns"><button class="btn" data-act="back">返回</button></div>`;
      A.play(win ? 'success' : 'fail');
      this.open(html, 'w-md', () => {
        this.close(true);
        U.bus.emit('toMenu');
      }, { noPause: false });
    },
    openWin() {
      const g = this.game;
      const allW = Object.keys(g.st.worlds).length >= 4;
      const html = `<div class="dh center win"><span>找到新大陆了！</span></div>
        <div class="info center">你乘着木筏穿过迷雾，踏上了一片真正的陆地。<br>家园的故事，可以重新开始了。</div>
        <div class="info small center">${allW ? '你已经通关了全部异世界。驱散全部 81 块迷雾再结束，会看到最终结局。' : '还没通关全部 4 个异世界——继续探索可以解锁其他结局。'}</div>
        <div class="btns col"><button class="btn green" data-act="end">结束旅程（结算）</button><button class="btn" data-act="cont">继续探索</button></div>`;
      A.play('success');
      this.open(html, 'w-sm', (act) => {
        this.close(true);
        g.afterSail(act === 'end');
      });
    },
    openPortal(p) {
      const g = this.game;
      const W = D.WORLDS[p.world];
      const cleared = !!g.st.worlds[p.world];
      const html = `<div class="dh center" style="--wc:${W.color}"><span>${W.name}</span><button class="x" data-act="close">✕</button></div>
        <div class="portal-art">${this.spriteIcon(S.portal(W.color, 0))}</div>
        <div class="rule">${esc(W.rule).replace(/\n/g, '<br>')}</div>
        <div class="info center ${cleared ? '' : 'gold'}">${cleared ? '已通关 ★ 再次通关奖励：金币 +15' : '首次通关奖励：' + W.reward}</div>
        <div class="btns"><button class="btn gray2" data-act="close">离开</button><button class="btn green" data-act="go">进入</button></div>`;
      this.open(html, 'w-sm', (act) => {
        if (act === 'close') return this.close();
        if (act === 'go') {
          this.close(true);
          this.fade(() => g.startMini(p));
        }
      });
    },
    openMiniResult(d) {
      const W = D.WORLDS[d.world];
      const html = `<div class="dh center ${d.ok ? 'win' : 'lose'}"><span>${d.ok ? '挑战成功！' : '挑战失败'}</span></div>
        <div class="info center">${d.ok ? esc(W.name) + ' 已通关' : '别灰心，随时可以再来挑战。'}</div>
        ${d.reward ? `<div class="info center gold">${esc(d.reward)}</div>` : ''}
        <div class="btns"><button class="btn" data-act="ok">返回小岛</button></div>`;
      this.open(html, 'w-sm', () => this.close());
    },
    openPause() {
      const g = this.game;
      const M = PF.Save.meta;
      const render = () => `<div class="dh center"><span>暂停</span></div>
        <div class="btns col">
          <button class="btn green" data-act="resume">继续游戏</button>
          <button class="btn" data-act="help">玩法说明</button>
          <button class="btn ${M.settings.music ? 'yellow' : 'gray2'}" data-act="music">音乐：${M.settings.music ? '开' : '关'}</button>
          <button class="btn ${M.settings.sfx ? 'yellow' : 'gray2'}" data-act="sfx">音效：${M.settings.sfx ? '开' : '关'}</button>
          ${PF.Hooks.openAchievements && !g.mini ? '<button class="btn" data-act="ach">成就</button>' : ''}
          ${g.mini ? '<button class="btn red" data-act="giveup">放弃挑战</button>' : '<button class="btn red" data-act="menu">保存并返回菜单</button>'}
        </div>`;
      this.open(render(), 'w-sm', (act) => {
        if (act === 'resume') this.close();
        else if (act === 'music') {
          M.settings.music = !M.settings.music;
          A.setMusic(M.settings.music);
          PF.Save.saveMeta();
          this.refreshDialog();
        } else if (act === 'sfx') {
          M.settings.sfx = !M.settings.sfx;
          A.setSfx(M.settings.sfx);
          PF.Save.saveMeta();
          this.refreshDialog();
        } else if (act === 'help') this.openHelp(() => this.openPause());
        else if (act === 'ach') PF.Hooks.openAchievements(() => this.openPause());
        else if (act === 'giveup') {
          this.close(true);
          if (g.mini) g.mini.abort();
        } else if (act === 'menu') {
          this.close(true);
          if (!g.mini) g.save();
          U.bus.emit('toMenu');
        }
      }, { refresh: render, duck: true });
    },
    openHelp(back) {
      const html = `<div class="dh"><span>玩法说明</span><button class="x" data-act="close">✕</button></div>
        <div class="scroll help">
          <p><b>目标：</b>洪水淹没了家园，你漂到一片迷雾笼罩的小岛。收集资源、驱散迷雾，找到雾外的新大陆，造一只木筏离开。</p>
          <p><b>移动：</b>电脑用 WASD / 方向键；手机在屏幕上任意处按住拖动就是摇杆。</p>
          <p><b>自动采集 / 攻击：</b>停在树、稻田、紫水晶旁边会自动采集；海盗靠近会自动挥剑；站在受损的营地旁边会自动修理。</p>
          <p><b>交互：</b>走到雾边、建筑、洞窟旁会冒出气泡，点气泡（或按空格）就能驱散迷雾、建造、升级。</p>
          <p><b>小精灵：</b>在营地召唤小精灵并指派工作，它们会自动采集并搬回营地。</p>
          <p><b>昼夜：</b>每天 160 秒白天、60 秒黑夜。天黑后会收到海盗的信，接着海盗船靠岸，保护好营地！</p>
          <p><b>异世界：</b>迷雾里藏着 4 个神秘洞窟，各有一个小游戏，通关会得到强力奖励。</p>
          <p><b>结局：</b>登上新大陆即可通关；通关全部异世界、驱散全部迷雾会看到不同的结局。</p>
          <p><b>双人：</b>1P 用 WASD 移动、F 交互、Q 技能；2P 用方向键移动、Enter 交互、右 Shift 技能。手机上左半屏和右半屏各是一个摇杆。倒地的队友，站在旁边就能扶起来。</p>
          ${PF.Sys.list.map((s) => (s.help ? s.help() : '')).join('')}
        </div>
        <div class="btns"><button class="btn" data-act="close">知道了</button></div>`;
      this.open(html, 'w-md', () => {
        this.close();
        if (back) back();
      });
    },
    fade(mid) {
      const f = $('#fade');
      f.classList.add('on');
      setTimeout(() => {
        try {
          mid && mid();
        } catch (e) {
          console.error(e);
          this.toast('出了点问题，已返回菜单');
          U.bus.emit('toMenu');
        } finally {
          setTimeout(() => f.classList.remove('on'), 60);
        }
      }, 380);
    },
  };

  PF.UI = UI;
})();
