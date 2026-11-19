// Aurelia Bay cars: arcade driving physics, enter/exit and carjacking.
// One job: own every car in the city and drive the one the player is in.
//
// Conventions: a car points along local +z, heading is its rotation.y,
// forward is (sin h, cos h) in (x, z). Speed is a velocity vector: the
// engine pushes along the heading and lateral grip bleeds the slide off,
// which gives a light drift feel without a full tyre model.

import * as THREE from 'three';
import { buildCarMesh, CAR_KINDS } from './carmesh.js';

const WHEELBASE = 2.6;
const CAR_RADIUS = 2.0; // collision circle around the car centre
const MAP = { minX: -190, maxX: 400, minZ: -190, maxZ: 190 };

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

// Circle (car) vs building AABBs, axis by axis like the player: sliding
// along a wall keeps the velocity component that runs parallel to it.
function collideBuildings(pos, vel, colliders) {
  let nextX = pos.x;
  let nextZ = pos.z;
  for (const box of colliders) {
    if (nextX + CAR_RADIUS > box.minX && nextX - CAR_RADIUS < box.maxX &&
        pos.z + CAR_RADIUS > box.minZ && pos.z - CAR_RADIUS < box.maxZ) {
      nextX = pos.x;
      vel.x *= -0.15;
    }
    if (pos.x + CAR_RADIUS > box.minX && pos.x - CAR_RADIUS < box.maxX &&
        nextZ + CAR_RADIUS > box.minZ && nextZ - CAR_RADIUS < box.maxZ) {
      nextZ = pos.z;
      vel.z *= -0.15;
    }
  }
  pos.x = nextX;
  pos.z = nextZ;
}

// Pairwise circle push-apart for cars, with a small velocity exchange
// along the contact normal so a shunt slows both cars down.
export function resolveCarCollisions(cars) {
  for (let i = 0; i < cars.length; i++) {
    for (let j = i + 1; j < cars.length; j++) {
      const a = cars[i];
      const b = cars[j];
      const dx = b.pos.x - a.pos.x;
      const dz = b.pos.z - a.pos.z;
      const dist = Math.hypot(dx, dz);
      const min = CAR_RADIUS * 2 - 0.2;
      if (dist >= min || dist === 0) continue;
      const nx = dx / dist;
      const nz = dz / dist;
      const push = (min - dist) / 2;
      a.pos.x -= nx * push;
      a.pos.z -= nz * push;
      b.pos.x += nx * push;
      b.pos.z += nz * push;
      const rvn = (b.vel.x - a.vel.x) * nx + (b.vel.z - a.vel.z) * nz;
      if (rvn < 0) {
        const impulse = (-(1 + 0.25) * rvn) / 2;
        a.vel.x -= nx * impulse;
        a.vel.z -= nz * impulse;
        b.vel.x += nx * impulse;
        b.vel.z += nz * impulse;
      }
    }
  }
}

export class Car {
  constructor(scene, kind, color, x, z, heading) {
    this.kind = kind;
    this.color = color;
    this.spec = CAR_KINDS[kind] || CAR_KINDS.sedan;
    this.pos = new THREE.Vector3(x, 0, z);
    this.heading = heading;
    this.vel = new THREE.Vector3(0, 0, 0);
    this.steerAngle = 0;
    this.wheelSpin = 0;
    this.driver = 'parked'; // 'parked' | 'player' | 'ai'
    this.radius = CAR_RADIUS; // collision circle, read by the player
    const built = buildCarMesh(kind, color);
    this.group = built.group;
    this.wheels = built.wheels;
    this.group.position.set(x, 0, z);
    this.group.rotation.y = heading;
    scene.add(this.group);
  }

  // Signed speed along the car's heading (negative when reversing).
  get forwardSpeed() {
    return this.vel.x * Math.sin(this.heading) + this.vel.z * Math.cos(this.heading);
  }

  get speed() {
    return Math.hypot(this.vel.x, this.vel.z);
  }

  // drive: { throttle: -1..1, steer: -1..1, handbrake: bool }
  update(dt, drive, colliders) {
    const fx = Math.sin(this.heading);
    const fz = Math.cos(this.heading);
    let fwd = this.vel.x * fx + this.vel.z * fz;

    if (drive.throttle > 0 && fwd < this.spec.topSpeed) {
      fwd += this.spec.accel * drive.throttle * dt;
    } else if (drive.throttle < 0) {
      if (fwd > 0.5) fwd -= 26 * -drive.throttle * dt; // brake
      else fwd = Math.max(-10, fwd + 9 * drive.throttle * dt); // reverse
    }
    // Rolling drag when coasting; the handbrake scrubs speed hard.
    if (drive.throttle === 0) fwd *= Math.exp(-0.35 * dt);
    if (drive.handbrake) fwd *= Math.exp(-2.2 * dt);

    // Rebuild the velocity: forward component plus a lateral part that
    // grip bleeds away (weakly with the handbrake, for a drift feel).
    const latX = this.vel.x - fwd * fx;
    const latZ = this.vel.z - fwd * fz;
    const grip = drive.handbrake ? 2.2 : 9;
    const latK = Math.exp(-grip * dt);
    this.vel.x = fwd * fx + latX * latK;
    this.vel.z = fwd * fz + latZ * latK;

    // Steering: less lock at speed, turn rate from the bicycle model.
    const speedAbs = Math.abs(fwd);
    const maxSteer = 0.55 - 0.35 * Math.min(1, speedAbs / 30);
    const targetSteer = drive.steer * maxSteer;
    this.steerAngle += clamp(targetSteer - this.steerAngle, -dt * 6, dt * 6);
    this.heading += (fwd / WHEELBASE) * Math.tan(this.steerAngle) * dt;

    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
    collideBuildings(this.pos, this.vel, colliders);
    this.pos.x = clamp(this.pos.x, MAP.minX, MAP.maxX);
    this.pos.z = clamp(this.pos.z, MAP.minZ, MAP.maxZ);

    // Mesh: position, yaw, steering wheels, rolling wheels.
    this.group.position.set(this.pos.x, 0, this.pos.z);
    this.group.rotation.y = this.heading;
    this.wheels.fl.steer.rotation.y = this.steerAngle;
    this.wheels.fr.steer.rotation.y = this.steerAngle;
    this.wheelSpin += (fwd / 0.34) * dt;
    for (const w of Object.values(this.wheels)) w.spin.rotation.x = this.wheelSpin;
  }
}

export class Cars {
  constructor(scene, spots) {
    this.cars = spots.map(
      (s) => new Car(scene, s.kind, s.color, s.x, s.z, s.angle),
    );
    this.current = null; // the car the player is driving
  }

  get all() {
    return this.cars;
  }

  nearestDrivable(pos, maxDist) {
    let best = null;
    let bestDist = maxDist;
    for (const car of this.cars) {
      const d = Math.hypot(car.pos.x - pos.x, car.pos.z - pos.z);
      if (d < bestDist) {
        best = car;
        bestDist = d;
      }
    }
    return best ? { car: best, dist: bestDist } : null;
  }

  // Enter a car. Returns { stolen: bool, witnessed: bool } so the caller
  // can raise the wanted level. A carjacked AI car hands its driver over
  // to the pedestrian system through the ctx callbacks.
  enter(car, player, ctx) {
    const wasAi = car.driver === 'ai';
    let witnessed = false;
    if (ctx) {
      if (ctx.pedestrians) {
        witnessed = ctx.pedestrians.anyWithin(car.pos.x, car.pos.z, 25);
      }
      if (!witnessed && ctx.traffic) {
        witnessed = ctx.traffic.anyWithin(car.pos.x, car.pos.z, 30, car);
      }
      if (wasAi && ctx.traffic) ctx.traffic.removeCar(car);
      if (wasAi && ctx.pedestrians) {
        ctx.pedestrians.spawnFleeing(car.pos.x, car.pos.z);
      }
    }
    car.driver = 'player';
    this.current = car;
    player.group.visible = false;
    player.pos.copy(car.pos);
    return { stolen: true, witnessed, wasAi };
  }

  // Step out beside the car, on its right-hand side.
  exit(player) {
    const car = this.current;
    if (!car) return null;
    car.driver = 'parked';
    car.vel.set(0, 0, 0);
    this.current = null;
    const rx = -Math.cos(car.heading);
    const rz = Math.sin(car.heading);
    player.pos.set(car.pos.x + rx * 2.4, 0, car.pos.z + rz * 2.4);
    player.facing = car.heading;
    player.group.position.copy(player.pos);
    player.group.rotation.y = player.facing;
    player.group.visible = true;
    return car;
  }

  // Drive the player's car one step. Car-vs-car separation runs once
  // per frame in main.js over every car, so this only handles the
  // pedestrian check. ctx: { pedestrians, wanted }
  updateDriving(dt, drive, colliders, ctx) {
    const car = this.current;
    if (!car) return;
    car.update(dt, drive, colliders);
    if (ctx && ctx.pedestrians && car.speed > 3) {
      ctx.pedestrians.checkCarHit(car, ctx.wanted);
    }
  }
}
