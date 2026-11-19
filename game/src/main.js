// Aurelia Bay bootstrap: renderer, sun, sky, game loop, start screen.
// One job: wire the city, the player, the cars, traffic, pedestrians,
// the HUD and the input together.

import * as THREE from 'three';
import { createCity } from './city.js';
import { Player } from './player.js';
import { Hud } from './hud.js';
import { Input } from './input.js';
import { Cars, resolveCarCollisions } from './cars.js';
import { Traffic } from './traffic.js';
import { Pedestrians } from './pedestrians.js';
import { Wanted } from './wanted.js';

// Surface any load failure to the test harness.
window.__aureliaError = null;
window.addEventListener('error', (event) => {
  window.__aureliaError = String(event.message || event.error || 'unknown error');
});

const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9fd3e8); // warm late-afternoon sky
scene.fog = new THREE.Fog(0xbfd9e8, 220, 720);

const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 1200);
camera.position.set(120, 70, 120);

// Warm sun + sky fill, tuned for a sun-soaked coastal look.
const sun = new THREE.DirectionalLight(0xffe7c2, 2.6);
sun.position.set(180, 240, 90);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -230;
sun.shadow.camera.right = 230;
sun.shadow.camera.top = 230;
sun.shadow.camera.bottom = -230;
sun.shadow.camera.far = 700;
sun.shadow.bias = -0.0006;
scene.add(sun);
scene.add(new THREE.HemisphereLight(0xbfe3f2, 0x8a6f4d, 1.1));

const { colliders, carSpots } = createCity(scene);
const input = new Input(canvas);
const player = new Player(scene, input, colliders);
const cars = new Cars(scene, carSpots);
const traffic = new Traffic(scene, colliders, player.pos);
const pedestrians = new Pedestrians(scene, colliders);
const wanted = new Wanted();
const hud = new Hud();

let started = false;

function startGame(withPointerLock) {
  document.getElementById('start').classList.add('hidden');
  hud.show();
  if (withPointerLock) input.lockPointer();
  started = true;
  window.__aureliaStarted = true;
}

document.getElementById('start').addEventListener('click', () => startGame(true));

// Deep link for screenshots and testing: ?shot=play starts the game
// straight into the street (the kit's own starter used ?shot= the same way).
if (new URLSearchParams(window.location.search).get('shot') === 'play') {
  startGame(false);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// Driving input from the keys: W/S throttle and brake/reverse, A/D steer,
// Space handbrake.
function driveInput() {
  return {
    throttle: (input.forward ? 1 : 0) - (input.back ? 1 : 0),
    steer: (input.left ? 1 : 0) - (input.right ? 1 : 0),
    handbrake: input.keys.has('Space'),
  };
}

const clock = new THREE.Clock();

function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(clock.getDelta(), 0.05);
  if (started) {
    const allCars = [...cars.all, ...traffic.cars];
    player.vehicles = allCars;

    if (cars.current) {
      // Driving: the car moves, the player rides along hidden inside it.
      cars.updateDriving(dt, driveInput(), colliders, { pedestrians, wanted });
      player.pos.copy(cars.current.pos);
      player.facing = cars.current.heading;
      player.group.position.copy(player.pos);
      hud.setPrompt('Press E to exit the car');
      if (input.pressed('KeyE')) cars.exit(player);
    } else {
      // On foot: walk, and offer the nearest car.
      player.update(dt);
      const nearParked = cars.nearestDrivable(player.pos, 3.5);
      const nearAi = traffic.nearestDrivable(player.pos, 3.5);
      const near = nearParked && (!nearAi || nearParked.dist <= nearAi.dist)
        ? nearParked
        : nearAi;
      hud.setPrompt(near ? `Press E to enter the ${near.car.kind}` : null);
      if (near && input.pressed('KeyE')) {
        const result = cars.enter(near.car, player, { traffic, pedestrians, wanted });
        if (result.witnessed) wanted.raise(1);
        input.yaw = near.car.heading + Math.PI; // camera swings in behind the car
        hud.setPrompt(null);
      }
    }

    traffic.update(dt, player.pos, allCars);
    pedestrians.update(dt, allCars, player.pos);
    resolveCarCollisions(allCars);
    wanted.update(dt);
    hud.wanted = wanted.level;

    const driving = cars.current;
    if (driving) {
      player.updateCamera(camera, dt, false, { x: driving.pos.x, y: 1.4, z: driving.pos.z, dist: 11.5 });
    } else {
      player.updateCamera(camera, dt, false);
    }
    hud.update(player, driving, { cars: allCars, peds: pedestrians.list });
  } else {
    player.updateCamera(camera, dt, true); // slow orbit over the city
  }
  renderer.render(scene, camera);
}
frame();

// Test hook: the harness reads this to confirm the game booted.
window.__aurelia = { ready: true, player, input, hud, cars, traffic, pedestrians, wanted };
