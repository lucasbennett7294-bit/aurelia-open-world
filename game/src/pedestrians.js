// Aurelia Bay pedestrians: sidewalk walkers who flee from danger.
// One job: make the streets feel lived in, and react when the player
// causes trouble — walkers run from a speeding car, a carjacking, or a
// neighbour being run over.

import * as THREE from 'three';
import { CITY } from './city.js';
import { mulberry32 } from './rng.js';

const PED_RADIUS = 0.5;
const WALK_SPEED = 1.4;
const FLEE_SPEED = 5.5;

const SHIRTS = [0xe8b48c, 0x9fc3d8, 0xf6d98a, 0xd97b5f, 0x7fb069, 0xb388c9, 0xf2e3c6, 0x5a8a9e];
const SKINS = [0xc98d64, 0x8a5a3b, 0xe8b48c, 0x6e4423];

function collideCircle(pos, colliders, radius) {
  // Axis-separated push-out against building AABBs, like the player.
  let x = pos.x;
  let z = pos.z;
  for (const box of colliders) {
    if (x + radius > box.minX && x - radius < box.maxX &&
        pos.z + radius > box.minZ && pos.z - radius < box.maxZ) {
      x = pos.x;
    }
    if (pos.x + radius > box.minX && pos.x - radius < box.maxX &&
        z + radius > box.minZ && z - radius < box.maxZ) {
      z = pos.z;
    }
  }
  pos.x = x;
  pos.z = z;
}

class Pedestrian {
  constructor(scene, x, z, color, skin) {
    this.pos = new THREE.Vector3(x, 0, z);
    this.heading = 0;
    this.state = 'walk'; // 'walk' | 'flee' | 'down' | 'rival'
    this.timer = 0;
    this.defeated = false; // a rival put down for good (Day 3, mission 4)
    this._punchTimer = 0; // a rival's swing cooldown
    this.targetPos = null; // the player, for rivals to chase
    this.walkAxis = 'x';
    this.walkFixed = z;
    this.walkFrom = -150;
    this.walkTo = 150;
    this.walkDir = 1;
    this.fleeX = 0;
    this.fleeZ = 0;
    this.group = this._buildBody(scene, color, skin);
  }

  _buildBody(scene, color, skin) {
    const group = new THREE.Group();
    const shirt = new THREE.MeshLambertMaterial({ color });
    const pants = new THREE.MeshLambertMaterial({ color: 0x2c3e50 });
    const skinMat = new THREE.MeshLambertMaterial({ color: skin });
    const hair = new THREE.MeshLambertMaterial({ color: 0x2a1c12 });
    const add = (geo, mat, x, y, z) => {
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      group.add(mesh);
      return mesh;
    };
    this.legL = add(new THREE.BoxGeometry(0.2, 0.75, 0.22), pants, -0.13, 0.38, 0);
    this.legR = add(new THREE.BoxGeometry(0.2, 0.75, 0.22), pants, 0.13, 0.38, 0);
    add(new THREE.BoxGeometry(0.58, 0.62, 0.32), shirt, 0, 1.08, 0);
    add(new THREE.BoxGeometry(0.32, 0.34, 0.3), skinMat, 0, 1.6, 0);
    add(new THREE.BoxGeometry(0.34, 0.1, 0.32), hair, 0, 1.8, 0);
    group.position.copy(this.pos);
    scene.add(group);
    return group;
  }

  fleeFrom(x, z, seconds = 2.5) {
    if (this.state === 'down') return;
    this.state = 'flee';
    this.timer = seconds;
    const dx = this.pos.x - x;
    const dz = this.pos.z - z;
    const len = Math.hypot(dx, dz) || 1;
    this.fleeX = dx / len;
    this.fleeZ = dz / len;
    this.heading = Math.atan2(this.fleeX, this.fleeZ);
  }

  knockDown(fromX, fromZ) {
    // A rival put down in a fight stays down: mission 4 counts them.
    if (this.state === 'rival') this.defeated = true;
    this.state = 'down';
    this.timer = 2.5;
    const dx = this.pos.x - fromX;
    const dz = this.pos.z - fromZ;
    const len = Math.hypot(dx, dz) || 1;
    this.pos.x += (dx / len) * 1.2;
    this.pos.z += (dz / len) * 1.2;
    this.group.rotation.z = Math.PI / 2;
    this.group.position.y = 0.3;
  }

  update(dt, colliders) {
    let speed = 0;
    if (this.state === 'down') {
      // A defeated rival never gets up again.
      if (this.defeated) return;
      this.timer -= dt;
      if (this.timer <= 0) {
        this.state = 'flee';
        this.timer = 2;
        this.group.rotation.z = 0;
        this.group.position.y = 0;
        this.fleeX = Math.sin(this.heading);
        this.fleeZ = Math.cos(this.heading);
      }
      return;
    }
    if (this.state === 'rival' && this.targetPos) {
      // Chase the player and swing when close; the punch itself is
      // reported by Pedestrians.update through its ctx callback.
      this._punchTimer = Math.max(0, this._punchTimer - dt);
      const dx = this.targetPos.x - this.pos.x;
      const dz = this.targetPos.z - this.pos.z;
      const d = Math.hypot(dx, dz) || 1;
      if (d > 1.4) {
        speed = 2.6;
        this.pos.x += (dx / d) * speed * dt;
        this.pos.z += (dz / d) * speed * dt;
        this.heading = Math.atan2(dx, dz);
      } else if (this._punchTimer <= 0) {
        this._wantPunch = true;
        this._punchTimer = 1.0;
      }
      collideCircle(this.pos, colliders, PED_RADIUS);
      this.pos.x = Math.max(-190, Math.min(400, this.pos.x));
      this.pos.z = Math.max(-190, Math.min(190, this.pos.z));
      this.group.position.set(this.pos.x, this.group.position.y, this.pos.z);
      this.group.rotation.y = this.heading;
      const t = performance.now() * 0.012;
      this.group.position.y = Math.abs(Math.sin(t)) * 0.05;
      return;
    }
    if (this.state === 'flee') {
      this.timer -= dt;
      if (this.timer <= 0) {
        this.state = 'walk';
        this.walkAxis = Math.abs(this.fleeX) > Math.abs(this.fleeZ) ? 'x' : 'z';
        this.walkFixed = this.walkAxis === 'x' ? this.pos.z : this.pos.x;
        this.walkFrom = -150;
        this.walkTo = 150;
        this.walkDir = this.walkAxis === 'x'
          ? Math.sign(this.fleeX) || 1
          : Math.sign(this.fleeZ) || 1;
      }
      speed = FLEE_SPEED;
      this.pos.x += this.fleeX * speed * dt;
      this.pos.z += this.fleeZ * speed * dt;
    } else {
      speed = WALK_SPEED;
      const beforeX = this.pos.x;
      const beforeZ = this.pos.z;
      if (this.walkAxis === 'x') {
        this.pos.x += this.walkDir * speed * dt;
        if (this.pos.x > this.walkTo) this.walkDir = -1;
        if (this.pos.x < this.walkFrom) this.walkDir = 1;
        this.heading = this.walkDir > 0 ? Math.PI / 2 : -Math.PI / 2;
      } else {
        this.pos.z += this.walkDir * speed * dt;
        if (this.pos.z > this.walkTo) this.walkDir = -1;
        if (this.pos.z < this.walkFrom) this.walkDir = 1;
        this.heading = this.walkDir > 0 ? 0 : Math.PI;
      }
      // If a building blocked the step, turn around instead of
      // pushing against the wall forever.
      this._blocked = { x: beforeX, z: beforeZ };
    }
    collideCircle(this.pos, colliders, PED_RADIUS);
    if (this.state === 'walk' && this._blocked) {
      const moved = Math.hypot(this.pos.x - this._blocked.x, this.pos.z - this._blocked.z);
      if (moved < WALK_SPEED * dt * 0.2) this.walkDir *= -1;
      this._blocked = null;
    }
    this.pos.x = Math.max(-190, Math.min(400, this.pos.x));
    this.pos.z = Math.max(-190, Math.min(190, this.pos.z));
    this.group.position.set(this.pos.x, this.group.position.y, this.pos.z);
    this.group.rotation.y = this.heading;
    // Simple walk bob.
    const t = performance.now() * 0.012;
    this.group.position.y = this.state === 'down' ? 0.3 : Math.abs(Math.sin(t)) * 0.05;
  }
}

export class Pedestrians {
  constructor(scene, colliders, count = 14) {
    this.scene = scene;
    this.colliders = colliders;
    this.rand = mulberry32(20261119 + 21);
    this.list = [];
    for (let i = 0; i < count; i++) {
      const ped = this._spawnWalker();
      if (ped) this.list.push(ped);
    }
  }

  _spawnWalker() {
    const rand = this.rand;
    const road = CITY.roads[Math.floor(rand() * CITY.roads.length)];
    const side = rand() < 0.5 ? -10 : 10; // sidewalk, just off the road
    const axis = rand() < 0.5 ? 'x' : 'z';
    const along = -150 + rand() * 300;
    const x = axis === 'x' ? along : road + side;
    const z = axis === 'x' ? road + side : along;
    const color = SHIRTS[Math.floor(rand() * SHIRTS.length)];
    const skin = SKINS[Math.floor(rand() * SKINS.length)];
    const ped = new Pedestrian(this.scene, x, z, color, skin);
    ped.walkAxis = axis;
    ped.walkFixed = axis === 'x' ? z : x;
    ped.walkDir = rand() < 0.5 ? 1 : -1;
    return ped;
  }

  // The driver of a carjacked car runs away on foot.
  spawnFleeing(x, z) {
    const rand = this.rand;
    const color = SHIRTS[Math.floor(rand() * SHIRTS.length)];
    const skin = SKINS[Math.floor(rand() * SKINS.length)];
    const ped = new Pedestrian(this.scene, x + 2, z + 2, color, skin);
    ped.fleeFrom(x, z, 3);
    this.list.push(ped);
    return ped;
  }

  // A rival crew member for mission 4: dark red shirt, chases the
  // player and swings at them. Returns the pedestrian.
  spawnRival(x, z) {
    const skin = SKINS[Math.floor(this.rand() * SKINS.length)];
    const ped = new Pedestrian(this.scene, x, z, 0x8e2f23, skin);
    ped.state = 'rival';
    ped.defeated = false;
    this.list.push(ped);
    return ped;
  }

  get rivals() {
    return this.list.filter((p) => p.state === 'rival' || p.defeated);
  }

  get defeatedRivals() {
    return this.list.filter((p) => p.defeated).length;
  }

  anyWithin(x, z, radius) {
    for (const ped of this.list) {
      if (ped.state === 'down') continue;
      if (Math.hypot(ped.pos.x - x, ped.pos.z - z) < radius) return true;
    }
    return false;
  }

  alert(x, z, radius) {
    for (const ped of this.list) {
      // Rivals are in a fight: gunfire does not make them run.
      if (ped.state === 'rival' || ped.state === 'down') continue;
      if (Math.hypot(ped.pos.x - x, ped.pos.z - z) < radius) {
        ped.fleeFrom(x, z);
      }
    }
  }

  // A fast car hitting a pedestrian knocks them down; if it was the
  // player's car, the crime raises the wanted level.
  checkCarHit(car, wanted) {
    for (const ped of this.list) {
      if (ped.state === 'down') continue;
      const d = Math.hypot(ped.pos.x - car.pos.x, ped.pos.z - car.pos.z);
      if (d < 2.2) {
        ped.knockDown(car.pos.x, car.pos.z);
        if (car.driver === 'player' && wanted) wanted.raise(1);
        this.alert(car.pos.x, car.pos.z, 20);
      }
    }
  }

  // ctx (optional): { onRivalPunch, playerDriving } — onRivalPunch is
  // called with the damage when a rival lands a swing on the player.
  // Rivals only chase a player on foot; against a car they mill about.
  update(dt, cars, playerPos, ctx) {
    for (const ped of this.list) {
      // Rivals chase the player; their target is this frame's position.
      if (ped.state === 'rival') {
        ped.targetPos = ctx && ctx.playerDriving ? null : playerPos;
      }
      // Flee from any fast car closing in.
      if (ped.state === 'walk') {
        for (const car of cars) {
          if (car.speed < 5) continue;
          const d = Math.hypot(ped.pos.x - car.pos.x, ped.pos.z - car.pos.z);
          if (d < 6) {
            ped.fleeFrom(car.pos.x, car.pos.z);
            break;
          }
        }
      }
      ped.update(dt, this.colliders);
      if (ped._wantPunch) {
        ped._wantPunch = false;
        if (ctx && ctx.onRivalPunch) ctx.onRivalPunch(8);
      }
    }
  }
}
