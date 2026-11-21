// Aurelia Bay player: a third-person character built from boxes, with
// WASD movement relative to the camera, running, jumping, and a smooth
// chase camera. One job: move the character and the camera.

import * as THREE from 'three';

const WALK_SPEED = 6;
const RUN_SPEED = 10.5;
const JUMP_SPEED = 8.5;
const GRAVITY = 24;
const PLAYER_RADIUS = 0.55;
const CAMERA_DISTANCE = 7.5;

export class Player {
  constructor(scene, input, colliders) {
    this.input = input;
    this.colliders = colliders;
    this.vehicles = []; // cars to collide with as circles { pos, radius }
    this.pos = new THREE.Vector3(-26, 0, 60); // spawn on the avenue south of the plaza
    this.velY = 0;
    this.onGround = true;
    this.facing = 0; // radians, 0 = facing north (-z)
    this.speed = 0; // current horizontal speed, for the HUD
    this._walkPhase = 0;
    this.group = this._buildBody(scene);
  }

  _buildBody(scene) {
    const group = new THREE.Group();
    const skin = new THREE.MeshLambertMaterial({ color: 0xc98d64 });
    const jacket = new THREE.MeshLambertMaterial({ color: 0x1f7a6d });
    const shirt = new THREE.MeshLambertMaterial({ color: 0xf2e3c6 });
    const jeans = new THREE.MeshLambertMaterial({ color: 0x2c4a6e });
    const hair = new THREE.MeshLambertMaterial({ color: 0x2a1c12 });

    const add = (geo, mat, x, y, z) => {
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      group.add(mesh);
      return mesh;
    };

    // Legs (pivot at the hip so they can swing). Shoes ride on the legs
    // so they swing with the walk cycle.
    this.legL = add(new THREE.BoxGeometry(0.22, 0.8, 0.24), jeans, -0.14, 0.4, 0);
    this.legL.geometry.translate(0, -0.4, 0);
    this.legL.position.y = 0.8;
    this.legR = add(new THREE.BoxGeometry(0.22, 0.8, 0.24), jeans, 0.14, 0.4, 0);
    this.legR.geometry.translate(0, -0.4, 0);
    this.legR.position.y = 0.8;
    const shoeMat = new THREE.MeshLambertMaterial({ color: 0x2a2320 });
    for (const leg of [this.legL, this.legR]) {
      const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.12, 0.36), shoeMat);
      shoe.position.set(0, -0.74, 0.05);
      shoe.castShadow = true;
      leg.add(shoe);
    }
    // Torso, shirt stripe, belt, and arms (pivot at the shoulder).
    add(new THREE.BoxGeometry(0.62, 0.68, 0.34), jacket, 0, 1.14, 0);
    add(new THREE.BoxGeometry(0.64, 0.12, 0.36), shirt, 0, 1.42, 0);
    add(new THREE.BoxGeometry(0.64, 0.08, 0.36), shoeMat, 0, 0.82, 0);
    this.armL = add(new THREE.BoxGeometry(0.18, 0.62, 0.2), jacket, -0.42, 1.18, 0);
    this.armL.geometry.translate(0, -0.31, 0);
    this.armL.position.y = 1.48;
    this.armR = add(new THREE.BoxGeometry(0.18, 0.62, 0.2), jacket, 0.42, 1.18, 0);
    this.armR.geometry.translate(0, -0.31, 0);
    this.armR.position.y = 1.48;
    // Head and hair.
    add(new THREE.BoxGeometry(0.34, 0.36, 0.32), skin, 0, 1.68, 0);
    add(new THREE.BoxGeometry(0.36, 0.12, 0.34), hair, 0, 1.88, 0);
    add(new THREE.BoxGeometry(0.36, 0.2, 0.1), hair, 0, 1.78, -0.14);

    group.position.copy(this.pos);
    scene.add(group);
    return group;
  }

  update(dt) {
    const { x: strafe, z: fwd } = this.input.moveAxes();
    const yaw = this.input.yaw;
    // Camera-relative movement: forward is where the camera looks,
    // (-sin yaw, -cos yaw); right is forward rotated -90° about Y.
    const sin = Math.sin(yaw);
    const cos = Math.cos(yaw);
    const mx = -sin * fwd + cos * strafe;
    const mz = -cos * fwd - sin * strafe;
    const moving = mx !== 0 || mz !== 0;
    const targetSpeed = moving ? (this.input.run ? RUN_SPEED : WALK_SPEED) : 0;
    const len = Math.hypot(mx, mz) || 1;
    const nx = mx / len;
    const nz = mz / len;

    // Accelerate toward the target speed for a less twitchy feel.
    this.speed += (targetSpeed - this.speed) * Math.min(1, dt * 10);
    let nextX = this.pos.x + nx * this.speed * dt;
    let nextZ = this.pos.z + nz * this.speed * dt;

    // Collide: circle vs building/car AABBs, axis by axis.
    for (const box of this.colliders) {
      if (nextX + PLAYER_RADIUS > box.minX && nextX - PLAYER_RADIUS < box.maxX &&
          this.pos.z + PLAYER_RADIUS > box.minZ && this.pos.z - PLAYER_RADIUS < box.maxZ) {
        nextX = this.pos.x;
      }
      if (this.pos.x + PLAYER_RADIUS > box.minX && this.pos.x - PLAYER_RADIUS < box.maxX &&
          nextZ + PLAYER_RADIUS > box.minZ && nextZ - PLAYER_RADIUS < box.maxZ) {
        nextZ = this.pos.z;
      }
    }
    // Collide with cars: push the player out of each car's circle.
    for (const v of this.vehicles) {
      const dx = nextX - v.pos.x;
      const dz = nextZ - v.pos.z;
      const dist = Math.hypot(dx, dz);
      const min = (v.radius || 2.0) + PLAYER_RADIUS;
      if (dist < min && dist > 0.0001) {
        nextX = v.pos.x + (dx / dist) * min;
        nextZ = v.pos.z + (dz / dist) * min;
      }
    }
    // Stay inside the playable map (city + beach).
    nextX = Math.max(-190, Math.min(400, nextX));
    nextZ = Math.max(-190, Math.min(190, nextZ));
    this.pos.x = nextX;
    this.pos.z = nextZ;

    // Jump and gravity.
    if (this.input.jump && this.onGround) {
      this.velY = JUMP_SPEED;
      this.onGround = false;
    }
    this.velY -= GRAVITY * dt;
    this.pos.y += this.velY * dt;
    if (this.pos.y <= 0) {
      this.pos.y = 0;
      this.velY = 0;
      this.onGround = true;
    }

    // Face the direction of travel.
    if (moving && this.speed > 0.5) {
      const targetFacing = Math.atan2(nx, nz);
      let diff = targetFacing - this.facing;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      this.facing += diff * Math.min(1, dt * 12);
    }

    // Walk-cycle swing, scaled by speed.
    if (this.speed > 0.5 && this.onGround) this._walkPhase += dt * this.speed * 1.6;
    const swing = Math.sin(this._walkPhase) * Math.min(1, this.speed / WALK_SPEED) * 0.65;
    this.legL.rotation.x = swing;
    this.legR.rotation.x = -swing;
    this.armL.rotation.x = -swing * 0.8;
    this.armR.rotation.x = swing * 0.8;

    this.group.position.copy(this.pos);
    this.group.rotation.y = this.facing;
  }

  // Chase camera: orbit behind the focus from the mouse yaw/pitch.
  // focus defaults to the player; driving passes the car with a longer,
  // higher chase (dist 11.5, look height 1.4).
  updateCamera(camera, dt, cinematic, focus) {
    if (cinematic) {
      const t = performance.now() * 0.00004;
      camera.position.set(Math.cos(t) * 150, 70, Math.sin(t) * 150);
      camera.lookAt(0, 0, 0);
      return;
    }
    const f = focus || { x: this.pos.x, y: this.pos.y + 1.6, z: this.pos.z, dist: CAMERA_DISTANCE };
    // yawOff/pitchOff let screenshot deep links frame the car at a rear
    // three-quarter angle, low and close; a dead rear view turns every
    // car into a black box. Gameplay never passes them.
    const yaw = this.input.yaw + (f.yawOff || 0);
    const pitch = this.input.pitch + (f.pitchOff || 0);
    const dist = f.dist;
    const cx = f.x + Math.sin(yaw) * Math.cos(pitch) * dist;
    const cz = f.z + Math.cos(yaw) * Math.cos(pitch) * dist;
    const cy = f.y + Math.sin(pitch) * dist;
    const k = 1 - Math.exp(-dt * 12);
    camera.position.x += (cx - camera.position.x) * k;
    camera.position.y += (cy - camera.position.y) * k;
    camera.position.z += (cz - camera.position.z) * k;
    camera.lookAt(f.x, f.y, f.z);
  }
}
