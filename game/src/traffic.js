// Aurelia Bay traffic: AI cars driving the road grid.
// One job: keep the streets alive — cars follow lanes, turn at
// intersections, stop for the car ahead, and respawn around the player.
//
// Driving uses pure pursuit: each car steers toward a lookahead point on
// its lane, so the same code works on vertical and horizontal roads.
// Right-hand traffic: the lane sits 3.2 units to the right of the road
// centre line for the car's direction of travel.

import * as THREE from 'three';
import { Car } from './cars.js';
import { CITY } from './city.js';
import { mulberry32 } from './rng.js';

const LANE = 3.2; // lane offset from the road centre line
const CRUISE_MIN = 10;
const CRUISE_MAX = 14;

function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

function pickRoad(rand) {
  return CITY.roads[Math.floor(rand() * CITY.roads.length)];
}

export class Traffic {
  constructor(scene, colliders, playerPos, count = 8) {
    this.scene = scene;
    this.colliders = colliders;
    this.rand = mulberry32(20261119 + 7);
    this.cars = [];
    this.ai = new Map(); // Car -> { axis, road, dir, cruise, inCrossing }
    for (let i = 0; i < count; i++) {
      const car = this._spawnCar(playerPos, 60, 140);
      if (car) this.cars.push(car);
    }
  }

  _laneCoord(axis, road, dir) {
    // Right-hand side of the road for the direction of travel.
    return axis === 'x' ? road + dir * LANE : road - dir * LANE;
  }

  _headingFor(axis, dir) {
    if (axis === 'x') return dir > 0 ? Math.PI / 2 : -Math.PI / 2;
    return dir > 0 ? 0 : Math.PI;
  }

  // Spawn one AI car on a road 60-140 units from the player.
  _spawnCar(playerPos, minDist, maxDist) {
    const rand = this.rand;
    for (let tries = 0; tries < 12; tries++) {
      const axis = rand() < 0.5 ? 'x' : 'z';
      const road = pickRoad(rand);
      const along = -150 + rand() * 300;
      const dir = rand() < 0.5 ? 1 : -1;
      const x = axis === 'x' ? along : this._laneCoord(axis, road, dir);
      const z = axis === 'x' ? this._laneCoord(axis, road, dir) : along;
      if (Math.hypot(x - playerPos.x, z - playerPos.z) < minDist) continue;
      if (Math.hypot(x - playerPos.x, z - playerPos.z) > maxDist && tries < 8) continue;
      const colors = [0xc0392b, 0x2471a3, 0xf1c40f, 0x7d3c98, 0x1e8449, 0xeeeeee, 0x2c3e50];
      const kinds = ['sedan', 'sedan', 'sedan', 'taxi', 'pickup'];
      const kind = kinds[Math.floor(rand() * kinds.length)];
      const color = kind === 'taxi' ? 0xf7c948 : colors[Math.floor(rand() * colors.length)];
      const car = new Car(this.scene, kind, color, x, z, this._headingFor(axis, dir));
      car.driver = 'ai';
      this.ai.set(car, {
        axis, road, dir,
        cruise: CRUISE_MIN + rand() * (CRUISE_MAX - CRUISE_MIN),
        inCrossing: false,
        turnSlow: 0,
      });
      return car;
    }
    return null;
  }

  anyWithin(x, z, radius, exclude) {
    for (const car of this.cars) {
      if (car === exclude) continue;
      if (Math.hypot(car.pos.x - x, car.pos.z - z) < radius) return true;
    }
    return false;
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

  // A carjacked AI car leaves the traffic system; the player owns it now.
  removeCar(car) {
    const i = this.cars.indexOf(car);
    if (i >= 0) this.cars.splice(i, 1);
    this.ai.delete(car);
  }

  update(dt, playerPos, allCars) {
    for (const car of [...this.cars]) {
      const st = this.ai.get(car);
      if (!st) continue;

      // Despawn far away, respawn near the player.
      if (Math.hypot(car.pos.x - playerPos.x, car.pos.z - playerPos.z) > 170) {
        const fresh = this._spawnCar(playerPos, 90, 130);
        if (fresh) {
          const i = this.cars.indexOf(car);
          this.cars[i] = fresh;
          this.scene.remove(car.group);
        }
        continue;
      }

      const fx = Math.sin(car.heading);
      const fz = Math.cos(car.heading);

      // Stop for the car ahead in our lane.
      let targetSpeed = st.cruise;
      if (st.turnSlow > 0) {
        targetSpeed = Math.min(targetSpeed, 6); // slow down for a turn
        st.turnSlow--;
      }
      for (const other of allCars) {
        if (other === car) continue;
        const dx = other.pos.x - car.pos.x;
        const dz = other.pos.z - car.pos.z;
        const ahead = dx * fx + dz * fz;
        const side = Math.abs(dx * fz - dz * fx);
        if (ahead > 0 && ahead < 10 && side < 1.8) {
          targetSpeed = 0;
          break;
        }
      }

      // Pure pursuit: steer toward a point 12 units ahead on our lane.
      const lane = this._laneCoord(st.axis, st.road, st.dir);
      const lookX = st.axis === 'x' ? car.pos.x + st.dir * 12 : lane;
      const lookZ = st.axis === 'x' ? lane : car.pos.z + st.dir * 12;
      const desired = Math.atan2(lookX - car.pos.x, lookZ - car.pos.z);
      const steer = Math.max(-1, Math.min(1, wrapAngle(desired - car.heading) * 2.0));

      const fwd = car.forwardSpeed;
      const throttle = fwd < targetSpeed ? 1 : fwd > targetSpeed + 1 ? -0.6 : 0;
      car.update(dt, { throttle, steer, handbrake: false }, this.colliders);

      // At a crossing, sometimes turn onto the crossing road.
      const along = st.axis === 'x' ? car.pos.x : car.pos.z;
      let nearestCross = null;
      let nearestDist = Infinity;
      for (const road of CITY.roads) {
        const d = Math.abs(along - road);
        if (d < nearestDist) {
          nearestDist = d;
          nearestCross = road;
        }
      }
      if (nearestDist < 4 && !st.inCrossing) {
        st.inCrossing = true;
        if (this.rand() < 0.35) {
          st.axis = st.axis === 'x' ? 'z' : 'x';
          st.road = nearestCross;
          st.dir = this.rand() < 0.5 ? 1 : -1;
          st.turnSlow = 60; // about a second at low speed through the turn
        }
      } else if (nearestDist > 9) {
        st.inCrossing = false;
      }
    }
  }
}
