// Aurelia Bay combat: fists and a pistol, on foot. One job: let the
// player fight — punch a pedestrian down up close, or shoot with a
// hitscan pistol once it is picked up from Marina's lockup.
//
// The pistol is a pickup on the garage forecourt; walking over it
// equips it. Ammo is infinite for now. Shots draw a short tracer line
// and a muzzle flash, and damage pedestrians (knock down) and police
// cars (3 hits disables one). Punches only work up close and only on
// people. No audio yet — Day 4.

import * as THREE from 'three';
import { PLACES } from './places.js';

const PUNCH_RANGE = 2.2;
const PUNCH_COOLDOWN = 0.35;
const SHOT_RANGE = 40;
const SHOT_SPREAD = 1.2; // how far off the aim line a target may sit

export class Combat {
  constructor(scene, player, pedestrians, police) {
    this.scene = scene;
    this.player = player;
    this.pedestrians = pedestrians;
    this.police = police;
    this.hasPistol = false;
    this._punchCooldown = 0;
    this._tracers = []; // { line, life }
    this._flash = null;
    this._flashLife = 0;
    this._buildPickup();
  }

  get weaponLabel() {
    return this.hasPistol ? 'PISTOL  ∞' : 'FISTS';
  }

  // Restore the pistol from a save (or grant it for a screenshot
  // deep link): the pickup crate hides, as if it had been collected.
  setPistol(value) {
    this.hasPistol = !!value;
    if (this.hasPistol) this._pickup.visible = false;
  }

  _buildPickup() {
    // A pistol on a gold-ringed crate at the lockup, so the player can
    // see it from the street.
    const group = new THREE.Group();
    const crate = new THREE.Mesh(
      new THREE.BoxGeometry(1.1, 0.7, 1.1),
      new THREE.MeshLambertMaterial({ color: 0x7a5a34 }),
    );
    crate.position.y = 0.35;
    crate.castShadow = true;
    group.add(crate);
    const gun = new THREE.Mesh(
      new THREE.BoxGeometry(0.12, 0.16, 0.55),
      new THREE.MeshLambertMaterial({ color: 0x1a1a1a }),
    );
    gun.position.y = 0.85;
    group.add(gun);
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(1.1, 0.06, 8, 24),
      new THREE.MeshBasicMaterial({ color: 0xffd23e }),
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.08;
    group.add(ring);
    group.position.set(PLACES.lockup.x, 0, PLACES.lockup.z);
    this.scene.add(group);
    this._pickup = group;
  }

  _muzzleFlash(from) {
    if (!this._flash) {
      this._flash = new THREE.Mesh(
        new THREE.PlaneGeometry(0.7, 0.7),
        new THREE.MeshBasicMaterial({
          color: 0xffe9a8, transparent: true, opacity: 0.95,
          side: THREE.DoubleSide, depthWrite: false,
        }),
      );
      this.scene.add(this._flash);
    }
    this._flash.position.copy(from);
    this._flash.visible = true;
    this._flashLife = 0.05;
  }

  _addTracer(from, to) {
    const geo = new THREE.BufferGeometry().setFromPoints([from, to]);
    const line = new THREE.Line(
      geo,
      new THREE.LineBasicMaterial({ color: 0xfff2b0, transparent: true, opacity: 0.9 }),
    );
    this.scene.add(line);
    this._tracers.push({ line, life: 0.09 });
  }

  // Aim direction: where the camera looks, on the ground plane.
  _aimDir(input) {
    return { x: -Math.sin(input.yaw), z: -Math.cos(input.yaw) };
  }

  _punch() {
    const p = this.player;
    const dir = { x: Math.sin(p.facing), z: Math.cos(p.facing) };
    let best = null;
    let bestD = PUNCH_RANGE;
    for (const ped of this.pedestrians.list) {
      if (ped.state === 'down') continue;
      const dx = ped.pos.x - p.pos.x;
      const dz = ped.pos.z - p.pos.z;
      const d = Math.hypot(dx, dz);
      if (d >= bestD) continue;
      // Only what is in front of the player.
      if (d > 0.01 && (dx * dir.x + dz * dir.z) / d < 0.3) continue;
      best = ped;
      bestD = d;
    }
    if (!best) return false;
    best.knockDown(p.pos.x, p.pos.z);
    return true;
  }

  _shoot(input) {
    const p = this.player;
    const from = new THREE.Vector3(p.pos.x, 1.4, p.pos.z);
    const dir = this._aimDir(input);
    // Nearest thing in the shot cone: a pedestrian, or a police car.
    let bestD = SHOT_RANGE;
    let bestPed = null;
    let bestCar = null;
    for (const ped of this.pedestrians.list) {
      if (ped.state === 'down') continue;
      const dx = ped.pos.x - p.pos.x;
      const dz = ped.pos.z - p.pos.z;
      const fwd = dx * dir.x + dz * dir.z;
      if (fwd < 0.5 || fwd > bestD) continue;
      const side = Math.abs(dx * dir.z - dz * dir.x);
      if (side > SHOT_SPREAD) continue;
      bestD = fwd;
      bestPed = ped;
      bestCar = null;
    }
    if (this.police) {
      for (const car of this.police.all) {
        if (car.driver === 'disabled' || car.driver === 'roadblock') continue;
        const dx = car.pos.x - p.pos.x;
        const dz = car.pos.z - p.pos.z;
        const fwd = dx * dir.x + dz * dir.z;
        if (fwd < 0.5 || fwd > bestD) continue;
        const side = Math.abs(dx * dir.z - dz * dir.x);
        if (side > SHOT_SPREAD + 1) continue;
        bestD = fwd;
        bestPed = null;
        bestCar = car;
      }
    }
    const to = new THREE.Vector3(
      p.pos.x + dir.x * bestD,
      1.2,
      p.pos.z + dir.z * bestD,
    );
    this._muzzleFlash(new THREE.Vector3(
      p.pos.x + dir.x * 0.8, 1.4, p.pos.z + dir.z * 0.8,
    ));
    this._addTracer(from, to);
    if (bestPed) {
      bestPed.knockDown(p.pos.x, p.pos.z);
      this.pedestrians.alert(p.pos.x, p.pos.z, 25);
      return 'ped';
    }
    if (bestCar) {
      this.police.damage(bestCar);
      return 'car';
    }
    return 'miss';
  }

  // dt seconds; driving is the car being driven, or null on foot.
  // input is the Input (for the click edge and the aim yaw).
  update(dt, driving, input) {
    this._punchCooldown = Math.max(0, this._punchCooldown - dt);
    // Tracer and muzzle flash fade out fast.
    for (let i = this._tracers.length - 1; i >= 0; i--) {
      const t = this._tracers[i];
      t.life -= dt;
      t.line.material.opacity = Math.max(0, t.life / 0.09) * 0.9;
      if (t.life <= 0) {
        this.scene.remove(t.line);
        this._tracers.splice(i, 1);
      }
    }
    if (this._flash) {
      this._flashLife -= dt;
      if (this._flashLife <= 0) this._flash.visible = false;
    }

    // Pistol pickup: walk over the lockup crate while on foot.
    if (!this.hasPistol && !driving && this._pickup.visible !== false) {
      const d = Math.hypot(
        this.player.pos.x - PLACES.lockup.x,
        this.player.pos.z - PLACES.lockup.z,
      );
      if (d < 2.2) {
        this.hasPistol = true;
        this._pickup.visible = false;
      }
    }

    // Click to fight, on foot only: pistol shoots, fists punch.
    if (!driving && input.clicked()) {
      if (this.hasPistol) this._shoot(input);
      else if (this._punchCooldown <= 0) {
        if (this._punch()) this._punchCooldown = PUNCH_COOLDOWN;
      }
    }
  }
}
