// Aurelia Bay car meshes: box-built cars, no imported models, no brands.
// One job: build the visible mesh for one car model and hand back the
// wheel groups so the physics can steer and spin them.
//
// Conventions: the car is built pointing along local +z, so its heading
// is its group rotation.y and its forward vector is (sin h, cos h) in
// (x, z). Wheels are nested groups: an outer group steers (front wheels
// only) and an inner group spins around the axle.

import * as THREE from 'three';
import { std, GLASS_STD, CHROME, TRIM_DARK } from './materials.js';

export const CAR_KINDS = {
  sedan: { length: 4.3, width: 1.9, bodyH: 0.62, cabinL: 2.2, topSpeed: 34, accel: 16 },
  taxi: { length: 4.3, width: 1.9, bodyH: 0.62, cabinL: 2.2, topSpeed: 32, accel: 16 },
  pickup: { length: 4.8, width: 2.0, bodyH: 0.7, cabinL: 1.6, topSpeed: 30, accel: 15 },
  // Aurelia Bay patrol car: same body as a sedan, a little faster so it
  // can catch a fleeing sedan. The black-and-white livery and light bar
  // are added by police.js on top of this mesh.
  police: { length: 4.3, width: 1.9, bodyH: 0.62, cabinL: 2.2, topSpeed: 38, accel: 18 },
  // Harbor armored truck: a slow, heavy van with a full cargo box.
  // Mission 7 steals this one; it lumbers, it does not sprint.
  armored: { length: 5.4, width: 2.2, bodyH: 0.9, cabinL: 4.2, topSpeed: 24, accel: 10 },
};

const GLASS = GLASS_STD; // tinted, low roughness: sun glints off it
const TYRE = std(0x141414, 0.95, 0);
const TRIM = TRIM_DARK;
const SIGN = std(0xf8f4e8, 0.5, 0, 0xfff2b0, 0.55); // taxi sign glows slightly
const hubGeo = new THREE.CylinderGeometry(0.16, 0.16, 0.26, 8);

function makeWheel(x, z) {
  // Steer group (rotation.y) -> spin group (rotation.x) -> tyre mesh.
  // The cylinder's axis is along x after the z-rotation, so spinning
  // the group around x rolls the wheel.
  const steer = new THREE.Group();
  steer.position.set(x, 0.34, z);
  const spin = new THREE.Group();
  const tyre = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.24, 10), TYRE);
  tyre.rotation.z = Math.PI / 2;
  tyre.castShadow = true;
  spin.add(tyre);
  const hub = new THREE.Mesh(hubGeo, CHROME);
  hub.rotation.z = Math.PI / 2;
  spin.add(hub);
  steer.add(spin);
  return { steer, spin };
}

export function buildCarMesh(kind, color) {
  const spec = CAR_KINDS[kind] || CAR_KINDS.sedan;
  const group = new THREE.Group();
  const bodyMat = std(color, 0.32, 0.55); // glossy painted metal

  const body = new THREE.Mesh(
    new THREE.BoxGeometry(spec.width, spec.bodyH, spec.length),
    bodyMat,
  );
  body.position.y = 0.55;
  body.castShadow = true;
  group.add(body);

  // Chrome bumpers, dark grille, side mirrors.
  for (const bz of [spec.length / 2 + 0.02, -spec.length / 2 - 0.02]) {
    const bumper = new THREE.Mesh(new THREE.BoxGeometry(spec.width + 0.06, 0.16, 0.1), CHROME);
    bumper.position.set(0, 0.32, bz);
    group.add(bumper);
  }
  const grille = new THREE.Mesh(new THREE.BoxGeometry(spec.width - 0.7, 0.18, 0.05), TRIM);
  grille.position.set(0, 0.55, spec.length / 2 + 0.01);
  group.add(grille);
  for (const sx of [-1, 1]) {
    const mirror = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.12, 0.18), TRIM);
    mirror.position.set(sx * (spec.width / 2 + 0.04), 1.05, 0.6);
    group.add(mirror);
  }

  // Cabin toward the rear for sedans/taxis; pickups get a short cab and
  // an open bed with walls instead of a long cabin. The armored truck
  // gets a full body-coloured cargo box instead of a glass cabin.
  const cabin = new THREE.Mesh(
    new THREE.BoxGeometry(spec.width - 0.2, kind === 'armored' ? 0.95 : 0.55, spec.cabinL),
    kind === 'armored' ? bodyMat : GLASS,
  );
  const cabinZ = kind === 'pickup' ? -(spec.length / 2 - spec.cabinL / 2 - 0.25) : -0.2;
  cabin.position.set(0, kind === 'armored' ? 1.35 : 1.1, cabinZ);
  cabin.castShadow = true;
  group.add(cabin);

  if (kind === 'pickup') {
    const bedZ = spec.length / 2 - (spec.length / 2 - spec.cabinL - 0.5) / 2 - 0.15;
    const bedLen = spec.length / 2 - spec.cabinL - 0.3;
    const wallH = 0.42;
    const wallT = 0.08;
    const mkWall = (w, d, x, z) => {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(w, wallH, d), bodyMat);
      wall.position.set(x, 0.86 + wallH / 2, z);
      wall.castShadow = true;
      group.add(wall);
    };
    mkWall(spec.width, wallT, 0, bedZ + bedLen / 2); // tailgate
    mkWall(wallT, bedLen, -spec.width / 2 + wallT / 2, bedZ); // left wall
    mkWall(wallT, bedLen, spec.width / 2 - wallT / 2, bedZ); // right wall
  }

  if (kind === 'taxi') {
    // Roof sign and a dark stripe down the side: an original livery,
    // no real taxi company marks.
    const sign = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.22, 0.3), SIGN);
    sign.position.set(0, 1.48, -0.2);
    sign.castShadow = true;
    group.add(sign);
    const stripe = new THREE.Mesh(
      new THREE.BoxGeometry(0.02, 0.18, spec.length - 0.4),
      TRIM,
    );
    stripe.position.set(spec.width / 2 + 0.01, 0.62, 0);
    group.add(stripe);
    const stripeL = stripe.clone();
    stripeL.position.x = -spec.width / 2 - 0.01;
    group.add(stripeL);
  }

  // Headlights and taillights as small bright boxes, warmer at sunset.
  const lightMat = new THREE.MeshLambertMaterial({ color: 0xfff6c9, emissive: 0xffedb0, emissiveIntensity: 1.2 });
  const tailMat = new THREE.MeshLambertMaterial({ color: 0xc02020, emissive: 0x800000, emissiveIntensity: 1.2 });
  for (const sx of [-1, 1]) {
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.14, 0.06), lightMat);
    head.position.set(sx * (spec.width / 2 - 0.35), 0.62, spec.length / 2 + 0.01);
    group.add(head);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.14, 0.06), tailMat);
    tail.position.set(sx * (spec.width / 2 - 0.35), 0.62, -spec.length / 2 - 0.01);
    group.add(tail);
  }

  const halfW = spec.width / 2;
  const halfL = spec.length / 2 - 0.85;
  const fl = makeWheel(-halfW, halfL);
  const fr = makeWheel(halfW, halfL);
  const rl = makeWheel(-halfW, -halfL);
  const rr = makeWheel(halfW, -halfL);
  group.add(fl.steer, fr.steer, rl.steer, rr.steer);

  return { group, wheels: { fl, fr, rl, rr }, spec };
}
