// Aurelia Bay damage smoke: grey puffs rising off any car whose health
// has dropped below 30. One job: make a battered car look battered.
//
// A small pool of sprites is reused so the effect never allocates during
// play. The puff texture is painted on a canvas at startup; if that
// fails (a headless run with no real canvas) the sprites fall back to
// a plain grey material and the logic still runs.

import * as THREE from 'three';

const POOL = 28;
const SMOKE_HP = 30;

function makePuffTexture() {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    const grad = ctx.createRadialGradient(32, 32, 4, 32, 32, 30);
    grad.addColorStop(0, 'rgba(255,255,255,0.85)');
    grad.addColorStop(0.6, 'rgba(255,255,255,0.35)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(canvas);
  } catch {
    return null;
  }
}

export class Smoke {
  constructor(scene) {
    this.scene = scene;
    this._texture = makePuffTexture();
    this._pool = [];
    for (let i = 0; i < POOL; i++) {
      const material = new THREE.SpriteMaterial({
        map: this._texture,
        color: 0x555555,
        transparent: true,
        opacity: 0,
        depthWrite: false,
      });
      const sprite = new THREE.Sprite(material);
      sprite.visible = false;
      sprite.scale.set(1, 1, 1);
      scene.add(sprite);
      this._pool.push({ sprite, life: 0, maxLife: 1 });
    }
    this._cursor = 0;
    this._spawnTimer = 0;
    this._spawnCount = 0; // deterministic jitter: puffs drift around the hood
  }

  _spawn(x, y, z, strength) {
    const puff = this._pool[this._cursor];
    this._cursor = (this._cursor + 1) % this._pool.length;
    this._spawnCount++;
    const a = this._spawnCount * 2.39996; // golden angle, no randomness
    const r = 0.5 + (this._spawnCount % 3) * 0.3;
    puff.sprite.position.set(x + Math.cos(a) * r, y, z + Math.sin(a) * r);
    puff.sprite.visible = true;
    puff.maxLife = 0.9 + strength * 0.5;
    puff.life = puff.maxLife;
    const size = 1.6 + strength * 1.2;
    puff.sprite.scale.set(size, size, 1);
    puff.sprite.material.opacity = 0.55;
  }

  // dt seconds; cars is every car in the city. A car below 30 hp
  // smokes steadily; a wrecked one (0 hp) smokes twice as hard.
  update(dt, cars) {
    this._spawnTimer -= dt;
    let smoking = 0;
    for (const car of cars) {
      if (typeof car.hp !== 'number' || car.hp >= SMOKE_HP) continue;
      smoking++;
      if (this._spawnTimer <= 0) {
        const strength = car.hp <= 0 ? 1 : 1 - car.hp / SMOKE_HP;
        this._spawn(car.pos.x, 1.2, car.pos.z, strength);
      }
    }
    if (smoking > 0) this._spawnTimer = 0.12;

    for (const puff of this._pool) {
      if (puff.life <= 0) continue;
      puff.life -= dt;
      if (puff.life <= 0) {
        puff.sprite.visible = false;
        puff.sprite.material.opacity = 0;
        continue;
      }
      const k = puff.life / puff.maxLife;
      puff.sprite.position.y += dt * 2.2;
      const s = puff.sprite.scale.x + dt * 1.4;
      puff.sprite.scale.set(s, s, 1);
      puff.sprite.material.opacity = 0.55 * k;
    }
  }
}
