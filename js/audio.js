/* 声音：WebAudio 实时合成音效与芯片风背景音乐（无任何音频文件） */
(function () {
  'use strict';
  const PF = (window.PF = window.PF || {});

  const A = {
    ctx: null,
    master: null,
    sfxBus: null,
    musicBus: null,
    noiseBuf: null,
    sfxOn: true,
    musicOn: true,
    mode: null,
    seqTimer: null,
    step: 0,
    nextTime: 0,
    last: {},
    unlock() {
      if (this.ctx) {
        if (this.ctx.state === 'suspended') this.ctx.resume();
        return;
      }
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      const ctx = (this.ctx = new AC());
      this.master = ctx.createGain();
      this.master.gain.value = 0.9;
      this.master.connect(ctx.destination);
      this.sfxBus = ctx.createGain();
      this.sfxBus.gain.value = this.sfxOn ? 0.55 : 0;
      this.sfxBus.connect(this.master);
      this.musicBus = ctx.createGain();
      this.musicBus.gain.value = this.musicOn ? 0.22 : 0;
      this.musicBus.connect(this.master);
      const len = ctx.sampleRate;
      this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      if (this.mode) {
        const m = this.mode;
        this.mode = null;
        this.music(m);
      }
    },
    setSfx(on) {
      this.sfxOn = on;
      if (this.sfxBus) this.sfxBus.gain.value = on ? 0.55 : 0;
    },
    setMusic(on) {
      this.musicOn = on;
      if (this.musicBus) this.musicBus.gain.value = on && !this.ducked ? 0.22 : 0;
    },
    /* 暂停 / 切到后台时静音音乐 */
    duck(on) {
      this.ducked = !!on;
      if (this.musicBus) this.musicBus.gain.value = this.musicOn && !this.ducked ? 0.22 : 0;
    },
    tone(f, dur, type, vol, slide, when, bus) {
      const ctx = this.ctx;
      if (!ctx) return;
      const t = when || ctx.currentTime;
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = type || 'square';
      o.frequency.setValueAtTime(f, t);
      if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, slide), t + dur);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol || 0.3, t + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g);
      g.connect(bus || this.sfxBus);
      o.start(t);
      o.stop(t + dur + 0.02);
    },
    noise(dur, vol, ftype, freq, when, q) {
      const ctx = this.ctx;
      if (!ctx) return;
      const t = when || ctx.currentTime;
      const s = ctx.createBufferSource();
      s.buffer = this.noiseBuf;
      const f = ctx.createBiquadFilter();
      f.type = ftype || 'lowpass';
      f.frequency.value = freq || 1000;
      f.Q.value = q || 1;
      const g = ctx.createGain();
      g.gain.setValueAtTime(vol || 0.3, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      s.connect(f);
      f.connect(g);
      g.connect(this.sfxBus);
      s.start(t, Math.random() * 0.5);
      s.stop(t + dur + 0.02);
    },
    play(name) {
      if (!this.ctx || !this.sfxOn) return;
      const now = this.ctx.currentTime;
      // 同名音效限频
      const gap = { chop: 0.07, reap: 0.07, mine: 0.07, hit: 0.05, coin: 0.04, pop: 0.05, step: 0.1 }[name] || 0.03;
      if (this.last[name] && now - this.last[name] < gap) return;
      this.last[name] = now;
      const T = (f, d, ty, v, s, w) => this.tone(f, d, ty, v, s, now + (w || 0));
      const N = (d, v, ft, fr, w, q) => this.noise(d, v, ft, fr, now + (w || 0), q);
      switch (name) {
        case 'click': T(880, 0.06, 'square', 0.12, 660); break;
        case 'open': T(520, 0.07, 'square', 0.12, 780); T(780, 0.08, 'square', 0.1, 1040, 0.05); break;
        case 'close': T(700, 0.07, 'square', 0.1, 420); break;
        case 'chop': N(0.08, 0.5, 'lowpass', 900); T(140, 0.09, 'triangle', 0.4, 70); break;
        case 'reap': N(0.12, 0.35, 'highpass', 2500); T(1200, 0.04, 'sine', 0.08, 900); break;
        case 'mine': T(1500, 0.07, 'triangle', 0.25, 1300); T(2200, 0.05, 'sine', 0.12, 2000, 0.02); N(0.04, 0.2, 'highpass', 3000); break;
        case 'hit': N(0.07, 0.45, 'bandpass', 1400); T(220, 0.08, 'square', 0.2, 110); break;
        case 'hurt': T(320, 0.16, 'square', 0.22, 140); break;
        case 'coin': T(988, 0.06, 'square', 0.13); T(1319, 0.12, 'square', 0.13, null, 0.06); break;
        case 'pop': T(660, 0.05, 'sine', 0.2, 990); break;
        case 'build': for (let i = 0; i < 3; i++) { N(0.06, 0.4, 'lowpass', 600, i * 0.12); T(180, 0.08, 'triangle', 0.3, 90, i * 0.12); } T(784, 0.12, 'square', 0.12, null, 0.4); T(1047, 0.2, 'square', 0.12, null, 0.5); break;
        case 'unlock': [523, 659, 784, 1047].forEach((f, i) => T(f, 0.14, 'triangle', 0.2, null, i * 0.07)); N(0.5, 0.15, 'highpass', 1500); break;
        case 'alarm': for (let i = 0; i < 3; i++) { T(660, 0.14, 'square', 0.16, null, i * 0.32); T(880, 0.14, 'square', 0.16, null, i * 0.32 + 0.16); } break;
        case 'splash': N(0.35, 0.35, 'bandpass', 700, 0, 0.8); break;
        case 'portal': T(200, 0.6, 'sine', 0.25, 1200); T(300, 0.6, 'triangle', 0.12, 1800, 0.05); break;
        case 'success': [523, 659, 784, 1047, 1319].forEach((f, i) => T(f, 0.18, 'square', 0.13, null, i * 0.09)); break;
        case 'fail': [392, 330, 262, 196].forEach((f, i) => T(f, 0.22, 'square', 0.13, null, i * 0.14)); break;
        case 'letter': N(0.2, 0.2, 'highpass', 3000); T(1568, 0.25, 'sine', 0.15, null, 0.12); break;
        case 'die': T(400, 0.5, 'square', 0.2, 60); break;
        case 'deposit': T(520, 0.05, 'triangle', 0.15, 780); break;
        case 'heal': T(660, 0.08, 'sine', 0.12, 990); break;
        case 'boom': N(0.5, 0.6, 'lowpass', 400); T(90, 0.4, 'sine', 0.5, 40); break;
        case 'laser': T(1800, 0.4, 'sawtooth', 0.08, 300); break;
        case 'warn': T(1000, 0.08, 'square', 0.08); break;
        case 'tick': T(1200, 0.03, 'square', 0.07); break;
        case 'wrong': T(200, 0.25, 'square', 0.18, 120); break;
        case 'right': T(880, 0.08, 'square', 0.12); T(1320, 0.12, 'square', 0.12, null, 0.08); break;
        case 'fall': T(600, 0.6, 'triangle', 0.2, 80); break;
        case 'step': N(0.03, 0.06, 'lowpass', 500); break;
      }
    },

    /* ---------- 背景音乐：简单步进音序器 ---------- */
    music(mode) {
      if (mode === this.mode) return;
      this.mode = mode;
      if (this.seqTimer) {
        clearInterval(this.seqTimer);
        this.seqTimer = null;
      }
      if (!this.ctx || !mode) return;
      this.step = 0;
      this.nextTime = this.ctx.currentTime + 0.1;
      this.seqTimer = setInterval(() => this.schedule(), 40);
    },
    schedule() {
      const ctx = this.ctx;
      if (!ctx || !this.mode) return;
      const S = SONGS[this.mode];
      if (!S) return;
      const spb = 60 / S.bpm / 4; // 16 分音符
      // 计时器被浏览器节流后不要一口气补一堆音符
      if (this.nextTime < ctx.currentTime - 0.2) this.nextTime = ctx.currentTime + 0.05;
      while (this.nextTime < ctx.currentTime + 0.15) {
        const st = this.step;
        const t = this.nextTime;
        const bar = Math.floor(st / 16) % S.chords.length;
        const root = S.chords[bar];
        const i16 = st % 16;
        if (this.musicOn && !this.ducked) {
          // 低音
          if (S.bass[i16] !== '.') this.tone(midi(root + S.bassOff), spb * (S.bassLen || 2), 'triangle', 0.32, null, t, this.musicBus);
          // 旋律
          const mel = S.mel[(st % S.mel.length)];
          if (mel !== null && mel !== undefined) this.tone(midi(S.base + mel), spb * (S.melLen || 1.6), S.lead || 'square', 0.1, null, t, this.musicBus);
          // 琶音
          if (S.arp && i16 % 2 === 0) {
            const k = S.arp[(i16 / 2) % S.arp.length];
            this.tone(midi(root + 12 + k), spb * 0.9, 'triangle', 0.07, null, t, this.musicBus);
          }
          // 鼓点
          if (S.drum && S.drum[i16] === 'k') {
            this.tone(110, 0.12, 'sine', 0.35, 45, t, this.musicBus);
          } else if (S.drum && S.drum[i16] === 'h') {
            const s = ctx.createBufferSource();
            s.buffer = this.noiseBuf;
            const f = ctx.createBiquadFilter();
            f.type = 'highpass';
            f.frequency.value = 7000;
            const g = ctx.createGain();
            g.gain.setValueAtTime(0.05, t);
            g.gain.exponentialRampToValueAtTime(0.0001, t + 0.04);
            s.connect(f);
            f.connect(g);
            g.connect(this.musicBus);
            s.start(t);
            s.stop(t + 0.05);
          }
        }
        this.nextTime += spb;
        this.step++;
      }
    },
  };

  const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);
  const _ = null;
  const SONGS = {
    menu: {
      bpm: 84, base: 72, chords: [48, 45, 41, 43], bassOff: 0, bass: 'x.......x.......', bassLen: 6,
      arp: [0, 4, 7, 12, 7, 4, 0, 7],
      mel: [7, _, _, _, 4, _, 2, _, 0, _, _, _, _, _, _, _, 9, _, _, _, 7, _, 4, _, 2, _, _, _, _, _, _, _, 5, _, _, _, 4, _, 2, _, 0, _, _, _, 2, _, _, _, 4, _, _, _, 2, _, 0, _, -3, _, _, _, _, _, _, _],
    },
    day: {
      bpm: 104, base: 72, chords: [48, 43, 45, 41], bassOff: 0, bass: 'x...x...x...x.x.', bassLen: 2,
      arp: [0, 7, 4, 7],
      drum: 'k...h...k.k.h...',
      mel: [0, _, 2, _, 4, _, 7, _, 4, _, 2, _, 4, _, _, _, 2, _, 4, _, 7, _, 9, _, 7, _, 4, _, 2, _, _, _, 9, _, 7, _, 4, _, 7, _, 9, _, 12, _, 9, _, 7, _, 5, _, 4, _, 2, _, 0, _, 2, _, 4, _, 0, _, _, _],
    },
    night: {
      bpm: 92, base: 69, chords: [45, 41, 43, 40], bassOff: -12, bass: 'x.x.x.x.x.x.x.x.', bassLen: 1.6,
      arp: [0, 3, 7, 10],
      drum: 'k.....k.k.....h.',
      lead: 'triangle',
      mel: [0, _, _, 3, _, _, 7, _, 5, _, 3, _, 2, _, _, _, 0, _, _, 3, _, _, 7, _, 10, _, 8, _, 7, _, _, _, 8, _, 7, _, 5, _, 3, _, 5, _, 7, _, 3, _, _, _, 2, _, 3, _, 2, _, 0, _, -2, _, _, _, 0, _, _, _],
    },
    mini: {
      bpm: 132, base: 72, chords: [48, 48, 45, 43], bassOff: -12, bass: 'x.xx.xx.x.xx.xx.', bassLen: 1,
      arp: [0, 4, 7, 11, 12, 11, 7, 4],
      drum: 'k.h.k.h.k.h.kkh.',
      mel: [12, _, 11, _, 7, _, 4, _, 7, _, 11, _, 12, _, 14, _, 12, _, _, _, 7, _, _, _, 9, _, 7, _, 4, _, _, _],
    },
  };

  PF.Audio = A;
})();
