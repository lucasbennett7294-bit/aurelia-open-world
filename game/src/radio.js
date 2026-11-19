// Aurelia Bay radio: three self-generated WebAudio stations, no audio
// files, no copyrighted music. One job: play a little sun-soaked music
// while the player drives, and stay silent (never throw) anywhere else.
//
// A lookahead step sequencer: update() schedules 16th-note steps a
// little ahead of the audio clock, so the music keeps time without a
// timer thread. Every AudioContext call is guarded — a browser without
// WebAudio, or a headless run, just gets silence.

import { mulberry32 } from './rng.js';

// Frequencies in Hz, 0 = rest. One bar of 16 steps each.
const STATIONS = [
  {
    name: 'SURF 98.5',
    bpm: 132,
    lead: [440, 0, 554, 659, 0, 659, 554, 0, 494, 0, 587, 659, 740, 659, 587, 0],
    leadType: 'triangle',
    leadGain: 0.16,
    bass: [110, 0, 110, 0, 82, 0, 82, 0, 73, 0, 73, 0, 82, 0, 98, 0],
    kick: [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0],
    hat: [0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0],
  },
  {
    name: 'NEON 101',
    bpm: 100,
    lead: [220, 0, 262, 330, 0, 392, 330, 262, 220, 0, 262, 330, 392, 440, 392, 330],
    leadType: 'sawtooth',
    leadGain: 0.07,
    bass: [55, 110, 55, 131, 55, 110, 55, 165, 55, 110, 55, 131, 55, 110, 165, 196],
    kick: [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0],
    hat: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    pad: [220, 262, 330], // an Am chord held under the whole bar
  },
  {
    name: 'AURELIA TALK',
    bpm: 96,
    // Speech-like blips in bursts with gaps, plus a two-tone station
    // ident at the top of every fourth bar. No words, just the cadence
    // of a talk station drifting over the bay.
    lead: [196, 220, 0, 247, 220, 0, 0, 196, 0, 233, 262, 0, 220, 0, 196, 0],
    leadType: 'square',
    leadGain: 0.05,
    bass: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    kick: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    hat: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    ident: [880, 660], // two-tone beep, every 4th bar, on steps 0-1
  },
];

export class Radio {
  constructor() {
    this.station = 0;
    this.muted = false;
    this._ctx = null;
    this._master = null;
    this._noise = null;
    this._step = 0;
    this._nextTime = 0;
    this._bar = 0;
    this._playing = false;
  }

  get stationLabel() {
    return STATIONS[this.station].name;
  }

  get stationCount() {
    return STATIONS.length;
  }

  // Create the audio graph. Only call from a user gesture (click or
  // keypress): browsers refuse to start audio before one. Safe to call
  // any number of times; returns false when WebAudio is unavailable.
  ensure() {
    if (this._ctx) return true;
    try {
      const AC = typeof AudioContext !== 'undefined'
        ? AudioContext
        : typeof webkitAudioContext !== 'undefined' ? webkitAudioContext : null;
      if (!AC) return false;
      this._ctx = new AC();
      this._master = this._ctx.createGain();
      this._master.gain.value = 0.9;
      this._master.connect(this._ctx.destination);
      // A short noise buffer for the hats, filled from the seeded RNG
      // so every run sounds the same.
      const rand = mulberry32(20261119 + 45);
      const len = Math.floor(this._ctx.sampleRate * 0.05);
      this._noise = this._ctx.createBuffer(1, len, this._ctx.sampleRate);
      const data = this._noise.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = rand() * 2 - 1;
      return true;
    } catch {
      this._ctx = null;
      return false;
    }
  }

  cycle() {
    this.station = (this.station + 1) % STATIONS.length;
    this._step = 0;
    this._bar = 0;
    return this.stationLabel;
  }

  toggleMute() {
    this.muted = !this.muted;
    try {
      if (this._ctx) {
        if (this.muted) this._ctx.suspend();
        else if (this._playing) this._ctx.resume();
      }
    } catch {
      // A suspended context that will not resume is still silence.
    }
    return this.muted;
  }

  _tone(freq, time, dur, type, gainValue) {
    try {
      const osc = this._ctx.createOscillator();
      const gain = this._ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, time);
      gain.gain.setValueAtTime(0, time);
      gain.gain.linearRampToValueAtTime(gainValue, time + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.001, time + dur);
      osc.connect(gain);
      gain.connect(this._master);
      osc.start(time);
      osc.stop(time + dur + 0.05);
    } catch {
      // One bad note must never stop the song.
    }
  }

  _kick(time) {
    try {
      const osc = this._ctx.createOscillator();
      const gain = this._ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(150, time);
      osc.frequency.exponentialRampToValueAtTime(42, time + 0.12);
      gain.gain.setValueAtTime(0.5, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + 0.16);
      osc.connect(gain);
      gain.connect(this._master);
      osc.start(time);
      osc.stop(time + 0.2);
    } catch {
      // See _tone.
    }
  }

  _hat(time) {
    try {
      const src = this._ctx.createBufferSource();
      src.buffer = this._noise;
      const filter = this._ctx.createBiquadFilter();
      filter.type = 'highpass';
      filter.frequency.value = 7000;
      const gain = this._ctx.createGain();
      gain.gain.setValueAtTime(0.12, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + 0.04);
      src.connect(filter);
      filter.connect(gain);
      gain.connect(this._master);
      src.start(time);
      src.stop(time + 0.05);
    } catch {
      // See _tone.
    }
  }

  _scheduleStep(station, step, time, stepDur) {
    const lead = station.lead[step];
    if (lead) this._tone(lead, time, stepDur * 1.8, station.leadType, station.leadGain);
    const bass = station.bass[step];
    if (bass) this._tone(bass, time, stepDur * 1.9, 'sine', 0.22);
    if (station.kick[step]) this._kick(time);
    if (station.hat[step]) this._hat(time);
    if (step === 0 && station.pad) {
      for (const freq of station.pad) {
        this._tone(freq, time, stepDur * 16, 'sawtooth', 0.03);
      }
    }
    if (step === 0 && station.ident && this._bar % 4 === 0) {
      this._tone(station.ident[0], time, 0.12, 'sine', 0.12);
      this._tone(station.ident[1], time + stepDur * 2, 0.12, 'sine', 0.12);
    }
  }

  // dt is unused (the audio clock drives the schedule) but kept so the
  // caller treats radio like every other per-frame system. driving is
  // whether the player is in a car: music only plays while driving.
  update(dt, driving) {
    const want = driving && !this.muted;
    if (!want) {
      this._playing = false;
      return;
    }
    if (!this.ensure()) return;
    try {
      if (this._ctx.state === 'suspended') this._ctx.resume();
    } catch {
      return;
    }
    if (!this._playing) {
      this._playing = true;
      this._step = 0;
      this._bar = 0;
      this._nextTime = this._ctx.currentTime + 0.06;
    }
    const station = STATIONS[this.station];
    const stepDur = 60 / station.bpm / 4;
    try {
      while (this._nextTime < this._ctx.currentTime + 0.18) {
        this._scheduleStep(station, this._step, this._nextTime, stepDur);
        this._nextTime += stepDur;
        this._step++;
        if (this._step >= 16) {
          this._step = 0;
          this._bar++;
        }
      }
    } catch {
      // Scheduling ahead must never crash the frame loop.
    }
  }
}
