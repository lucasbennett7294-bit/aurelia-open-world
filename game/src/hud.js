// Aurelia Bay HUD: health, cash, wanted stars, speed, and a 2D canvas
// minimap drawn top-down from the city layout. One job: show game state.

import { CITY } from './city.js';

export class Hud {
  constructor() {
    this.health = 100;
    this.cash = 0;
    this.wanted = 0; // 0..5 stars; Day 1 has no police yet, so it stays 0
    this._healthFill = document.getElementById('healthfill');
    this._cash = document.getElementById('cash');
    this._wanted = document.getElementById('wanted');
    this._speedo = document.getElementById('speedo');
    this._prompt = document.getElementById('prompt');
    this._map = document.getElementById('minimap');
    this._mapCtx = this._map.getContext('2d');
    this._objective = document.getElementById('objective');
    this._timer = document.getElementById('timer');
    this._ammo = document.getElementById('ammo');
    this._radio = document.getElementById('radio');
    this._banner = document.getElementById('banner');
    this._bannerTitle = document.getElementById('bannerTitle');
    this._bannerSub = document.getElementById('bannerSub');
    this._bannerUntil = 0;
    this._ending = document.getElementById('ending');
  }

  show() {
    document.getElementById('hud').classList.remove('hidden');
  }

  // Context prompt ("Press E to enter the taxi"); null hides it.
  setPrompt(text) {
    if (text) {
      this._prompt.textContent = text;
      this._prompt.classList.remove('hidden');
    } else {
      this._prompt.classList.add('hidden');
    }
  }

  // Mission objective line across the top of the screen.
  setObjective(text) {
    this._objective.textContent = text || '';
  }

  // Mission countdown in mm:ss; null hides it.
  setTimer(seconds) {
    if (seconds === null || seconds === undefined) {
      this._timer.classList.add('hidden');
      return;
    }
    const s = Math.max(0, Math.ceil(seconds));
    this._timer.textContent = `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
    this._timer.classList.remove('hidden');
  }

  // Current weapon readout ("FISTS" or "PISTOL  ∞").
  setWeapon(label) {
    this._ammo.textContent = label || '';
  }

  // Radio station readout ("♪ SURF 98.5" or "♪ MUTED"); null hides it.
  setRadio(label) {
    if (!this._radio) return;
    if (label) {
      this._radio.textContent = label;
      this._radio.classList.remove('hidden');
    } else {
      this._radio.classList.add('hidden');
    }
  }

  // The story ending screen after the finale: the city is Rook's.
  showEnding() {
    if (!this._ending) return;
    const cash = document.getElementById('endingCash');
    if (cash) cash.textContent = `You finished with $${this.cash.toLocaleString('en-US')} in your pocket.`;
    this._ending.classList.remove('hidden');
  }

  hideEnding() {
    if (this._ending) this._ending.classList.add('hidden');
  }

  // Big centre banner (MISSION COMPLETE, BUSTED, ...) for ms.
  banner(title, sub, ms = 3000) {
    this._bannerTitle.textContent = title;
    this._bannerSub.textContent = sub || '';
    this._banner.classList.remove('hidden');
    this._bannerUntil = performance.now() + ms;
  }

  // Refresh the DOM readouts; cheap enough to run every frame.
  // driving is the Car the player is in, or null on foot; extras holds
  // { cars, peds, police, rivals, marker } for the minimap dots.
  update(player, driving, extras) {
    this._healthFill.style.width = `${Math.max(0, this.health)}%`;
    this._cash.textContent = `$${this.cash.toLocaleString('en-US')}`;
    const stars = this._wanted.children;
    for (let i = 0; i < stars.length; i++) {
      stars[i].classList.toggle('off', i >= this.wanted);
    }
    const speed = driving ? driving.forwardSpeed : player.speed;
    const mph = Math.round(Math.abs(speed) * 2.237);
    this._speedo.textContent = `${mph} mph`;
    if (this._bannerUntil && performance.now() > this._bannerUntil) {
      this._banner.classList.add('hidden');
      this._bannerUntil = 0;
    }
    this._drawMinimap(player, driving, extras);
  }

  _drawMinimap(player, driving, extras) {
    const ctx = this._mapCtx;
    const S = this._map.width; // 180
    const worldW = CITY.maxX - CITY.minX;
    const worldH = CITY.maxZ - CITY.minZ;
    const scale = S / Math.max(worldW, worldH);
    const ox = (S - worldW * scale) / 2;
    const oy = (S - worldH * scale) / 2;
    const px = (x) => ox + (x - CITY.minX) * scale;
    const py = (z) => oy + (z - CITY.minZ) * scale;

    // Sea and land.
    ctx.fillStyle = '#123a52';
    ctx.fillRect(0, 0, S, S);
    ctx.fillStyle = '#2f7fb0';
    ctx.fillRect(px(CITY.seaX), 0, S - px(CITY.seaX), S);
    ctx.fillStyle = '#e8d5a4';
    ctx.fillRect(px(CITY.beachX), 0, px(CITY.seaX) - px(CITY.beachX), S);
    ctx.fillStyle = '#8a7a5c';
    ctx.fillRect(0, 0, px(CITY.beachX), S);

    // Roads.
    ctx.fillStyle = '#3d3a38';
    for (const x of CITY.roads) ctx.fillRect(px(x - 7), 0, 14 * scale, S);
    for (const z of CITY.roads) ctx.fillRect(0, py(z - 7), S, 14 * scale);

    // Plaza ring.
    ctx.strokeStyle = '#ffd23e';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(px(0), py(0), 16 * scale, 0, Math.PI * 2);
    ctx.stroke();

    // Traffic and parked cars as dots (orange = moving traffic,
    // grey = parked), pedestrians as tiny white dots.
    if (extras) {
      for (const car of extras.cars || []) {
        // Police are drawn blue below, so skip them here.
        if (car.driver === 'police' || car.driver === 'roadblock' || car.driver === 'disabled') continue;
        ctx.fillStyle = car.driver === 'ai' ? '#ff8c42' : '#bbbbbb';
        ctx.fillRect(px(car.pos.x) - 1.5, py(car.pos.z) - 1.5, 3, 3);
      }
      // Police cars as blue dots, rival crew as red dots.
      ctx.fillStyle = '#4fa8ff';
      for (const car of extras.police || []) {
        ctx.fillRect(px(car.pos.x) - 2, py(car.pos.z) - 2, 4, 4);
      }
      ctx.fillStyle = '#ff4d4d';
      for (const ped of extras.rivals || []) {
        if (ped.defeated) continue;
        ctx.fillRect(px(ped.pos.x) - 2, py(ped.pos.z) - 2, 4, 4);
      }
      ctx.fillStyle = '#ffffff';
      for (const ped of extras.peds || []) {
        ctx.fillRect(px(ped.pos.x) - 1, py(ped.pos.z) - 1, 2, 2);
      }
      // Mission marker: a pulsing yellow diamond.
      const marker = extras.marker;
      if (marker) {
        const pulse = 6 + Math.sin(performance.now() * 0.006) * 2;
        ctx.save();
        ctx.translate(px(marker.x), py(marker.z));
        ctx.rotate(Math.PI / 4);
        ctx.fillStyle = '#ffd23e';
        ctx.strokeStyle = '#3a2400';
        ctx.lineWidth = 1;
        ctx.fillRect(-pulse / 2, -pulse / 2, pulse, pulse);
        ctx.strokeRect(-pulse / 2, -pulse / 2, pulse, pulse);
        ctx.restore();
      }
    }

    // Player arrow (at the car when driving). The arrow is drawn pointing
    // north (up); the facing is atan2 of the world direction, so rotate
    // by PI - facing.
    const focus = driving || player;
    const facing = driving ? driving.heading : player.facing;
    const x = px(focus.pos.x);
    const y = py(focus.pos.z);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(Math.PI - facing);
    ctx.fillStyle = '#ffd23e';
    ctx.strokeStyle = '#3a2400';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, -7);
    ctx.lineTo(5, 6);
    ctx.lineTo(0, 3);
    ctx.lineTo(-5, 6);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    // North indicator.
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('N', S / 2, 12);
  }
}
