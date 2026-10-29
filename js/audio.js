/* Battle City — звук на WebAudio API. Без внешних файлов. */
(function () {
  'use strict';

  function GameAudio() {
    this.ctx = null;
    this.master = null;
    this.noiseBuffer = null;
    this.muted = false;
    this.volume = 0.24;
  }

  GameAudio.prototype.ensure = function () {
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;

    if (!this.ctx) {
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : this.volume;
      this.master.connect(this.ctx.destination);

      var len = Math.floor(this.ctx.sampleRate * 0.8);
      var buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      var data = buf.getChannelData(0);
      for (var i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      this.noiseBuffer = buf;
    }

    if (this.ctx.state === 'suspended') this.ctx.resume();
  };

  GameAudio.prototype.setMuted = function (m) {
    this.muted = !!m;
    if (this.master) this.master.gain.value = this.muted ? 0 : this.volume;
  };

  GameAudio.prototype.toggleMute = function () {
    this.setMuted(!this.muted);
    return this.muted;
  };

  GameAudio.prototype.tone = function (freq, dur, type, vol, slideTo, delay) {
    if (!this.ctx || this.muted) return;
    var t0 = this.ctx.currentTime + (delay || 0);
    var osc = this.ctx.createOscillator();
    var gain = this.ctx.createGain();
    osc.type = type || 'square';
    osc.frequency.setValueAtTime(Math.max(20, freq), t0);
    if (slideTo) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
    }
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol || 0.15), t0 + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.03);
  };

  GameAudio.prototype.noise = function (dur, vol, freq, delay, type) {
    if (!this.ctx || this.muted || !this.noiseBuffer) return;
    var t0 = this.ctx.currentTime + (delay || 0);
    var src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    var filter = this.ctx.createBiquadFilter();
    filter.type = type || 'lowpass';
    filter.frequency.setValueAtTime(freq || 900, t0);
    var gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol || 0.2), t0 + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    src.start(t0);
    src.stop(t0 + dur + 0.03);
  };

  GameAudio.prototype.shoot = function () {
    this.tone(900, 0.09, 'square', 0.11, 260);
    this.noise(0.05, 0.05, 2400, 0, 'highpass');
  };

  GameAudio.prototype.enemyShoot = function () {
    this.tone(620, 0.08, 'square', 0.05, 220);
  };

  GameAudio.prototype.brick = function () {
    this.noise(0.09, 0.16, 1400);
    this.tone(180, 0.06, 'square', 0.05, 90);
  };

  GameAudio.prototype.steel = function () {
    this.tone(1500, 0.06, 'square', 0.06, 900);
    this.noise(0.04, 0.07, 3600, 0, 'highpass');
  };

  GameAudio.prototype.explodeSmall = function () {
    this.noise(0.3, 0.3, 800);
    this.tone(110, 0.22, 'sawtooth', 0.1, 50);
  };

  GameAudio.prototype.explodeBig = function () {
    this.noise(0.55, 0.4, 600);
    this.tone(80, 0.45, 'sawtooth', 0.14, 32);
  };

  GameAudio.prototype.powerup = function () {
    var notes = [523, 659, 784, 1046];
    for (var i = 0; i < notes.length; i++) {
      this.tone(notes[i], 0.11, 'square', 0.11, null, i * 0.07);
    }
  };

  GameAudio.prototype.extraLife = function () {
    var notes = [392, 523, 659, 784, 1046];
    for (var i = 0; i < notes.length; i++) {
      this.tone(notes[i], 0.14, 'triangle', 0.12, null, i * 0.09);
    }
  };

  GameAudio.prototype.spawn = function () {
    this.tone(220, 0.28, 'triangle', 0.06, 880);
  };

  GameAudio.prototype.pause = function () {
    this.tone(440, 0.12, 'square', 0.08, 330);
  };

  GameAudio.prototype.start = function () {
    this.tone(262, 0.1, 'square', 0.1);
    this.tone(330, 0.1, 'square', 0.1, null, 0.11);
    this.tone(392, 0.1, 'square', 0.1, null, 0.22);
    this.tone(523, 0.2, 'square', 0.12, null, 0.33);
  };

  GameAudio.prototype.levelClear = function () {
    this.tone(523, 0.12, 'square', 0.11);
    this.tone(659, 0.12, 'square', 0.11, null, 0.13);
    this.tone(784, 0.12, 'square', 0.11, null, 0.26);
    this.tone(1046, 0.28, 'square', 0.12, null, 0.39);
  };

  GameAudio.prototype.victory = function () {
    var seq = [523, 659, 784, 1046, 784, 1046, 1318];
    for (var i = 0; i < seq.length; i++) {
      this.tone(seq[i], i === seq.length - 1 ? 0.5 : 0.16, 'square', 0.11, null, i * 0.14);
    }
  };

  GameAudio.prototype.gameover = function () {
    var seq = [392, 330, 262, 196];
    for (var i = 0; i < seq.length; i++) {
      this.tone(seq[i], 0.24, 'sawtooth', 0.1, null, i * 0.2);
    }
    this.noise(0.5, 0.12, 500, 0.1);
  };

  window.BCAudio = new GameAudio();
})();
