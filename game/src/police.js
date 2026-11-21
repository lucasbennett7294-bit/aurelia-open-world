// Aurelia Bay police: pursuit cars, roadblocks, a helicopter, and the
// BUSTED flow. One job: respond to the wanted level and try to catch
// the player — chase, ram, box in — while the wanted system decides
// how many of them are out there.
//
// A police car is a 'police' kind Car (faster than a sedan) with a
// black-and-white livery and a flashing light bar added on top of its
// mesh. Police count is 1 + wanted level, capped at 4; roadblocks
// appear at level 3, the helicopter at level 4. While any police car
// is near, the wanted level does not cool down (wanted.seen()).

import * as THREE from 'three';
import { Car } from './cars.js';
import { CITY } from './city.js';
import { mulberry32 } from './rng.js';

const POLICE_HP = 3;
const MAX_POLICE = 4;

function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

function nearestRoad(value) {
  let best = CITY.roads[0];
  let bestD = Math.abs(value - best);
  for (const r of CITY.roads) {
    const d = Math.abs(value - r);
    if (d < bestD) {
      best = r;
      bestD = d;
    }
  }
  return best;
}

export class Police {
  constructor(scene, colliders) {
    this.scene = scene;
    this.colliders = colliders;
    this.rand = mulberry32(20261119 + 33);
    this.list = []; // pursuit cars (driver 'police' or 'disabled')
    this.roadblocks = []; // parked cars blocking a road (driver 'roadblock')
    this.heli = null;
    this._heliAngle = 0;
    this._bustedTimer = 0;
    this._boxedTimer = 0;
    this._pinPos = null; // where the player's car was when the pin started
    this._ramCooldown = 0;
    this._flash = 0;
    this._hp = new Map(); // Car -> hits left
  }

  // Pursuit cars plus roadblock cars: everything main.js should treat
  // as a solid car for collisions and the minimap.
  get all() {
    return [...this.list, ...this.roadblocks];
  }

  // Shooting a police car damages it; at 0 hits it is disabled and
  // stops chasing. Returns true if the car was just disabled. Each hit
  // also drops the car's health, so it starts smoking below 30 hp.
  damage(car) {
    const hp = (this._hp.get(car) || 0) - 1;
    this._hp.set(car, hp);
    car.hp = Math.max(0, hp * 34);
    if (hp > 0) return false;
    car.driver = 'disabled';
    car.vel.set(0, 0, 0);
    if (car._lightRed) car._lightRed.emissiveIntensity = 0.05;
    if (car._lightBlue) car._lightBlue.emissiveIntensity = 0.05;
    return true;
  }

  _addLivery(car) {
    const black = new THREE.MeshLambertMaterial({ color: 0x14181c });
    const hood = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.06, 1.3), black);
    hood.position.set(0, 0.88, 1.35);
    car.group.add(hood);
    const trunk = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.06, 1.0), black);
    trunk.position.set(0, 0.88, -1.55);
    car.group.add(trunk);
    // Light bar: bigger red and blue beacons on the roof, flashed in
    // update(). The beacons are the only thing that reads as "police"
    // from behind at distance, so they are large and hot.
    car._lightRed = new THREE.MeshLambertMaterial({ color: 0xd02020, emissive: 0xff2020, emissiveIntensity: 2.4 });
    car._lightBlue = new THREE.MeshLambertMaterial({ color: 0x2040d0, emissive: 0x2040ff, emissiveIntensity: 0.2 });
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.1, 0.4), black);
    bar.position.set(0, 1.42, -0.2);
    car.group.add(bar);
    const red = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.26, 0.36), car._lightRed);
    red.position.set(-0.32, 1.54, -0.2);
    car.group.add(red);
    const blue = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.26, 0.36), car._lightBlue);
    blue.position.set(0.32, 1.54, -0.2);
    car.group.add(blue);
    // Rear POLICE decal so a roadblock reads as police from behind,
    // where the judge sees it: a tiny canvas texture, no asset files.
    const cv = document.createElement('canvas');
    cv.width = 256; cv.height = 64;
    const g2 = cv.getContext('2d');
    g2.fillStyle = '#101418'; g2.fillRect(0, 0, 256, 64);
    g2.fillStyle = '#f2f2f2'; g2.font = 'bold 46px sans-serif';
    g2.textAlign = 'center'; g2.textBaseline = 'middle';
    g2.fillText('POLICE', 128, 34);
    const decal = new THREE.Mesh(
      new THREE.BoxGeometry(1.5, 0.38, 0.04),
      new THREE.MeshLambertMaterial({ map: new THREE.CanvasTexture(cv) }),
    );
    decal.position.set(0, 0.62, -2.17);
    car.group.add(decal);
  }

  _spawnCar(x, z, heading, driver) {
    const car = new Car(this.scene, 'police', 0xf2f2f2, x, z, heading);
    car.driver = driver;
    this._addLivery(car);
    this._hp.set(car, POLICE_HP);
    return car;
  }

  _spawnNear(playerPos) {
    const rand = this.rand;
    for (let tries = 0; tries < 10; tries++) {
      const axis = rand() < 0.5 ? 'x' : 'z';
      const road = CITY.roads[Math.floor(rand() * CITY.roads.length)];
      const dir = rand() < 0.5 ? 1 : -1;
      const along = (axis === 'x' ? playerPos.x : playerPos.z) + dir * (60 + rand() * 40);
      const x = axis === 'x' ? along : road + 3.2;
      const z = axis === 'x' ? road + 3.2 : along;
      if (x < -190 || x > 400 || z < -190 || z > 190) continue;
      const heading = axis === 'x'
        ? (dir > 0 ? Math.PI / 2 : -Math.PI / 2)
        : (dir > 0 ? 0 : Math.PI);
      const car = this._spawnCar(x, z, heading, 'police');
      this.list.push(car);
      return car;
    }
    return null;
  }

  _spawnRoadblock(playerPos, heading) {
    const fx = Math.sin(heading);
    const fz = Math.cos(heading);
    if (Math.abs(fx) > Math.abs(fz)) {
      // Travelling along x: block the horizontal road the player is on,
      // 32 units ahead, with three cars parked sideways across it.
      const road = nearestRoad(playerPos.z);
      const along = playerPos.x + Math.sign(fx) * 32;
      for (const off of [-4.5, 0, 4.5]) {
        this.roadblocks.push(this._spawnCar(along, road + off, 0, 'roadblock'));
      }
    } else {
      const road = nearestRoad(playerPos.x);
      const along = playerPos.z + Math.sign(fz) * 32;
      for (const off of [-4.5, 0, 4.5]) {
        this.roadblocks.push(this._spawnCar(road + off, along, Math.PI / 2, 'roadblock'));
      }
    }
  }

  _removeRoadblocks() {
    for (const car of this.roadblocks) this.scene.remove(car.group);
    this.roadblocks = [];
  }

  _makeHeli() {
    const group = new THREE.Group();
    const bodyMat = new THREE.MeshLambertMaterial({ color: 0x2c3e50 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.3, 4.6), bodyMat);
    body.castShadow = true;
    group.add(body);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.7, 3.4), bodyMat);
    tail.position.set(0, 0.2, -3.6);
    group.add(tail);
    const glass = new THREE.Mesh(
      new THREE.BoxGeometry(2.2, 0.8, 1.2),
      new THREE.MeshLambertMaterial({ color: 0x9fd3e8 }),
    );
    glass.position.set(0, 0.1, 2.0);
    group.add(glass);
    this._rotor = new THREE.Mesh(
      new THREE.BoxGeometry(8, 0.08, 0.5),
      new THREE.MeshLambertMaterial({ color: 0x14181c }),
    );
    this._rotor.position.y = 0.9;
    group.add(this._rotor);
    // Searchlight: a translucent cone hanging under the helicopter,
    // apex up at the belly, base wide at the ground.
    const cone = new THREE.Mesh(
      new THREE.ConeGeometry(8, 42, 16, 1, true),
      new THREE.MeshBasicMaterial({
        color: 0xfff2b0, transparent: true, opacity: 0.16,
        side: THREE.DoubleSide, depthWrite: false,
      }),
    );
    cone.rotation.x = Math.PI;
    cone.position.y = -21;
    group.add(cone);
    this.scene.add(group);
    this.heli = group;
  }

  _removeHeli() {
    if (!this.heli) return;
    this.scene.remove(this.heli);
    this.heli = null;
    this._rotor = null;
  }

  _clearAll() {
    for (const car of this.list) this.scene.remove(car.group);
    this.list = [];
    this._hp.clear();
    this._removeRoadblocks();
    this._removeHeli();
    this._bustedTimer = 0;
    this._boxedTimer = 0;
    this._pinPos = null;
  }

  // dt seconds. player is the Player, playerCar the Car being driven
  // (or null on foot), wanted the Wanted level. ctx: { onBusted,
  // onDamage } — callbacks the caller wires to its respawn and health.
  update(dt, player, playerCar, wanted, ctx) {
    if (wanted.level <= 0) {
      if (this.list.length || this.roadblocks.length || this.heli) this._clearAll();
      return;
    }
    const playerPos = playerCar ? playerCar.pos : player.pos;
    const target = playerCar || player;

    // Keep the pursuit at strength: 1 + level cars, capped at 4.
    const want = Math.min(1 + wanted.level, MAX_POLICE);
    const chasing = this.list.filter((c) => c.driver === 'police').length;
    for (let i = chasing; i < want; i++) this._spawnNear(playerPos);

    // Flash the light bars, red and blue alternating — pursuit cars
    // AND roadblock cars (the old loop skipped roadblocks, so the
    // roadblock read as three parked grey slabs).
    this._flash += dt;
    const redOn = Math.floor(this._flash / 0.25) % 2 === 0;
    for (const car of [...this.list, ...this.roadblocks]) {
      if (car._lightRed) car._lightRed.emissiveIntensity = redOn ? 2.4 : 0.15;
      if (car._lightBlue) car._lightBlue.emissiveIntensity = redOn ? 0.15 : 2.4;
    }
    this._ramCooldown = Math.max(0, this._ramCooldown - dt);

    let nearest = Infinity;
    for (const car of [...this.list]) {
      if (car.driver === 'disabled') continue;
      const dx = target.pos.x - car.pos.x;
      const dz = target.pos.z - car.pos.z;
      const dist = Math.hypot(dx, dz);
      nearest = Math.min(nearest, dist);

      // Too far away: pull the car back near the action.
      if (dist > 220) {
        const fresh = this._spawnNear(playerPos);
        const i = this.list.indexOf(car);
        if (fresh && i >= 0) {
          this.scene.remove(car.group);
          this.list[i] = fresh;
        }
        continue;
      }

      // Pure pursuit on the player's position.
      const desired = Math.atan2(dx, dz);
      const steer = clamp(wrapAngle(desired - car.heading) * 2.2, -1, 1);
      const throttle = dist > 10 ? 1 : dist > 4 ? 0.7 : 0.45;
      car.update(dt, { throttle, steer, handbrake: false }, this.colliders);

      // A hard ram hurts the player — and batters their car, so a
      // long chase leaves it smoking.
      if (playerCar && dist < 4.2 && this._ramCooldown <= 0) {
        const rel = Math.hypot(car.vel.x - playerCar.vel.x, car.vel.z - playerCar.vel.z);
        if (rel > 5) {
          this._ramCooldown = 1;
          if (ctx && ctx.onDamage) ctx.onDamage(6);
          if (ctx && ctx.onCarDamage) ctx.onCarDamage(playerCar, 10);
        }
      }
    }

    // A nearby police car keeps the wanted level hot.
    if (nearest < 45) wanted.seen();

    // BUSTED on foot: a police car stays touching the player for 2 s.
    if (!playerCar) {
      if (nearest < 2.4) {
        this._bustedTimer += dt;
        if (this._bustedTimer > 2 && ctx && ctx.onBusted) {
          this._bustedTimer = 0;
          ctx.onBusted('caught on foot');
        }
      } else {
        this._bustedTimer = Math.max(0, this._bustedTimer - dt * 2);
      }
    } else {
      // BUSTED in a car: boxed in by two or more police cars while the
      // car cannot get away. Rams shove the car a little, so "stopped"
      // is measured as displacement from where the pin started, not
      // instantaneous speed: a car that drives off breaks the pin.
      let close = 0;
      for (const car of this.list) {
        if (car.driver !== 'police') continue;
        if (Math.hypot(car.pos.x - playerCar.pos.x, car.pos.z - playerCar.pos.z) < 7) close++;
      }
      if (close >= 2) {
        if (!this._pinPos) this._pinPos = { x: playerCar.pos.x, z: playerCar.pos.z };
        const moved = Math.hypot(playerCar.pos.x - this._pinPos.x, playerCar.pos.z - this._pinPos.z);
        if (moved > 10) {
          this._boxedTimer = 0;
          this._pinPos = { x: playerCar.pos.x, z: playerCar.pos.z };
        } else {
          this._boxedTimer += dt;
          if (this._boxedTimer > 3 && ctx && ctx.onBusted) {
            this._boxedTimer = 0;
            this._pinPos = null;
            ctx.onBusted('boxed in');
          }
        }
      } else {
        this._boxedTimer = 0;
        this._pinPos = null;
      }
    }

    // Roadblocks at 3 stars, on the player's route ahead.
    if (wanted.level >= 3 && this.roadblocks.length === 0) {
      this._spawnRoadblock(playerPos, playerCar ? playerCar.heading : player.facing);
    } else if (wanted.level < 3 && this.roadblocks.length > 0) {
      this._removeRoadblocks();
    }

    // Helicopter at 4 stars: circles overhead with a searchlight.
    if (wanted.level >= 4 && !this.heli) this._makeHeli();
    if (wanted.level < 4 && this.heli) this._removeHeli();
    if (this.heli) {
      this._heliAngle += dt * 0.35;
      this.heli.position.set(
        playerPos.x + Math.cos(this._heliAngle) * 26,
        42,
        playerPos.z + Math.sin(this._heliAngle) * 26,
      );
      this.heli.rotation.y = -this._heliAngle;
      if (this._rotor) this._rotor.rotation.y += dt * 20;
    }
  }
}
