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

  // Refresh the DOM readouts; cheap enough to run every frame.
  // driving is the Car the player is in, or null on foot; extras holds
  // { cars, peds } for the minimap dots.
  update(player, driving, extras) {
    this._healthFill.style.width = `${this.health}%`;
    this._cash.textContent = `$${this.cash.toLocaleString('en-US')}`;
    const stars = this._wanted.children;
    for (let i = 0; i < stars.length; i++) {
      stars[i].classList.toggle('off', i >= this.wanted);
    }
    const speed = driving ? driving.forwardSpeed : player.speed;
    const mph = Math.round(Math.abs(speed) * 2.237);
    this._speedo.textContent = `${mph} mph`;
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
        ctx.fillStyle = car.driver === 'ai' ? '#ff8c42' : '#bbbbbb';
        ctx.fillRect(px(car.pos.x) - 1.5, py(car.pos.z) - 1.5, 3, 3);
      }
      ctx.fillStyle = '#ffffff';
      for (const ped of extras.peds || []) {
        ctx.fillRect(px(ped.pos.x) - 1, py(ped.pos.z) - 1, 2, 2);
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
