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
import { Police } from './police.js';
import { Combat } from './combat.js';
import { Missions, MISSIONS } from './missions.js';
import { PLACES } from './places.js';
import { Save } from './save.js';
import { Radio } from './radio.js';
import { Smoke } from './effects.js';

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
scene.background = new THREE.Color(0xa8cfe4); // warm sunset-leaning sky
scene.fog = new THREE.Fog(0xc7d8e2, 220, 720);

const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 1200);
camera.position.set(120, 70, 120);

// Low warm sun + sky fill, tuned for a sun-soaked coastal evening.
const sun = new THREE.DirectionalLight(0xffd9a0, 2.8);
sun.position.set(220, 150, 60);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -230;
sun.shadow.camera.right = 230;
sun.shadow.camera.top = 230;
sun.shadow.camera.bottom = -230;
sun.shadow.camera.far = 700;
sun.shadow.bias = -0.0006;
scene.add(sun);
scene.add(new THREE.HemisphereLight(0xcfe0ea, 0x9a7f56, 1.05));

const { colliders, carSpots } = createCity(scene);
const input = new Input(canvas);
const player = new Player(scene, input, colliders);
const cars = new Cars(scene, carSpots);
const traffic = new Traffic(scene, colliders, player.pos);
const pedestrians = new Pedestrians(scene, colliders);
const wanted = new Wanted();
const hud = new Hud();
const police = new Police(scene, colliders);
const combat = new Combat(scene, player, pedestrians, police);
const radio = new Radio();
const smoke = new Smoke(scene);

// Save the run: cash, story progress, pistol, position, health. The
// missions call it on every completion; BUSTED calls it too.
function saveGame() {
  Save.save({
    cash: hud.cash,
    missionIndex: missions.completedCount,
    hasPistol: combat.hasPistol,
    pos: { x: player.pos.x, z: player.pos.z },
    health: hud.health,
  });
}

const missions = new Missions({
  scene, player, cars, combat, pedestrians, traffic, wanted, hud,
  onComplete: saveGame,
});

// BUSTED: the patrol caught the player (or the player was beaten
// down). Respawn at the plaza, wanted cleared, a fine, health back.
// An active mission fails instead of showing the BUSTED banner.
function onBusted(reason) {
  const fine = Math.min(hud.cash, 100);
  hud.cash -= fine;
  hud.health = 100;
  wanted.clear();
  if (cars.current) {
    cars.current.driver = 'parked';
    cars.current.vel.set(0, 0, 0);
    cars.current = null;
    player.group.visible = true;
  }
  player.pos.set(PLACES.respawn.x, 0, PLACES.respawn.z);
  player.group.position.copy(player.pos);
  player.velY = 0;
  const missionFailed = missions.onBusted();
  if (!missionFailed) hud.banner('BUSTED', `${reason} — $${fine} fine`, 3500);
  saveGame();
}

function onDamage(amount) {
  hud.health -= amount;
}

function onCarDamage(car, amount) {
  car.hp = Math.max(0, car.hp - amount);
}

let started = false;
let paused = false;
// Screenshot deep links drive the car themselves so the scene is alive
// with no input (see setupShot below).
let autoDrive = false;

function startGame(withPointerLock) {
  document.getElementById('start').classList.add('hidden');
  document.getElementById('pause').classList.add('hidden');
  hud.hideEnding();
  hud.show();
  if (withPointerLock) input.lockPointer();
  started = true;
  paused = false;
  window.__aureliaStarted = true;
}

// A fresh run: forget the old save and start from the avenue.
function newGame() {
  Save.clear();
  hud.cash = 0;
  hud.health = 100;
  startGame(true);
}

// Pick up a saved run: cash, story progress, pistol and position.
function continueGame() {
  const data = Save.load();
  if (!data) {
    newGame();
    return;
  }
  hud.cash = data.cash;
  hud.health = data.health;
  missions.applySave(data.missionIndex);
  if (data.hasPistol) combat.setPistol(true);
  player.pos.set(data.pos.x, 0, data.pos.z);
  player.group.position.copy(player.pos);
  startGame(true);
}

// The start screen's job list: done, next, locked — plus the cash the
// player has earned so far. The CONTINUE button only shows with a save.
function refreshStartScreen() {
  const list = document.getElementById('missionList');
  const done = missions.completedCount;
  let html = "<b>ROOK'S JOBS</b> — work for Marina Voss, Ocean Drive garage<br>";
  MISSIONS.forEach((m, i) => {
    const mark = i < done ? ' ✓' : i === done ? ' ▶' : ' 🔒';
    const cls = i < done ? 'done' : i === done ? '' : 'locked';
    html += `<span class="${cls}">${i + 1} · ${m.name} — $${m.reward}${mark}</span><br>`;
  });
  if (hud.cash > 0) html += `<span>Cash earned: $${hud.cash.toLocaleString('en-US')}</span>`;
  list.innerHTML = html;
  document.getElementById('continueBtn').classList.toggle('hidden', !Save.exists());
}
refreshStartScreen();

document.querySelector('#start .go').addEventListener('click', () => newGame());
document.getElementById('continueBtn').addEventListener('click', (event) => {
  event.stopPropagation();
  continueGame();
});

// Pause menu: Esc toggles it; the buttons resume, restart, or save and
// quit back to the menu.
function setPaused(value) {
  if (!started) return;
  paused = value;
  document.getElementById('pause').classList.toggle('hidden', !paused);
  if (paused) document.exitPointerLock?.();
}
document.getElementById('resumeBtn').addEventListener('click', () => setPaused(false));
document.getElementById('restartBtn').addEventListener('click', () => window.location.reload());
document.getElementById('quitBtn').addEventListener('click', () => {
  saveGame();
  started = false;
  paused = false;
  document.getElementById('hud').classList.add('hidden');
  document.getElementById('pause').classList.add('hidden');
  refreshStartScreen();
  document.getElementById('start').classList.remove('hidden');
});
document.getElementById('endingBtn').addEventListener('click', () => hud.hideEnding());

// Audio only starts after a gesture, so arm it on the first click or
// keypress anywhere on the page.
function armAudio() {
  radio.ensure();
}
window.addEventListener('pointerdown', armAudio, { once: true });
window.addEventListener('keydown', armAudio, { once: true });

// Screenshot deep links: each boots straight into a live scene with no
// click needed, and none of them throws in a headless run.
//   ?shot=play    — on foot in the street (Day 1)
//   ?shot=drive   — driving through the city with traffic
//   ?shot=chase   — mid police chase, 3 stars, mission objective live
//   ?shot=cover   — alias for chase
//   ?shot=mission — mission 5 in progress, marker and objective live
function setupShot(mode) {
  if (mode === 'play') return;
  if (mode === 'drive') {
    const car = cars.spawn('sedan', 0xc0392b, 52, 100, Math.PI);
    cars.enter(car, player, { traffic, pedestrians, wanted });
    autoDrive = true;
    return;
  }
  if (mode === 'chase' || mode === 'cover') {
    const car = cars.spawn('sedan', 0x2471a3, 52, 100, Math.PI);
    cars.enter(car, player, { traffic, pedestrians, wanted });
    autoDrive = true;
    missions.forceStart(4);
    missions.jumpToStep(2);
    wanted.raise(3);
    return;
  }
  if (mode === 'mission') {
    const car = cars.spawn('sedan', 0xf1c40f, 156, 60, Math.PI);
    cars.enter(car, player, { traffic, pedestrians, wanted });
    autoDrive = true;
    missions.forceStart(4);
    missions.jumpToStep(1);
  }
}

const shotMode = new URLSearchParams(window.location.search).get('shot');
if (shotMode) {
  startGame(false);
  setupShot(shotMode);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// Driving input from the keys: W/S throttle and brake/reverse, A/D steer,
// Space handbrake. A screenshot deep link drives itself instead.
function driveInput() {
  if (autoDrive) return { throttle: 1, steer: 0, handbrake: false };
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
  // Escape toggles pause even while paused (the simulation block below
  // does not run then, so it is read here, once per frame).
  if (started && input.pressed('Escape')) setPaused(!paused);
  if (started && !paused) {
    const allCars = [...cars.all, ...traffic.cars, ...police.all];
    player.vehicles = allCars;

    if (cars.current) {
      // Driving: the car moves, the player rides along hidden inside it.
      cars.updateDriving(dt, driveInput(), colliders, { pedestrians, wanted });
      player.pos.copy(cars.current.pos);
      player.facing = cars.current.heading;
      player.group.position.copy(player.pos);
      hud.setPrompt('Press E to exit the car');
      if (input.pressed('KeyE')) {
        cars.exit(player);
        autoDrive = false;
      }
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
        missions.onCarEntered();
        input.yaw = near.car.heading + Math.PI; // camera swings in behind the car
        hud.setPrompt(null);
      }
    }

    traffic.update(dt, player.pos, allCars);
    pedestrians.update(dt, allCars, player.pos, {
      onRivalPunch: (dmg) => { hud.health -= dmg; },
      playerDriving: !!cars.current,
    });
    resolveCarCollisions(allCars);
    wanted.update(dt);
    hud.wanted = wanted.level;

    police.update(dt, player, cars.current, wanted, { onBusted, onDamage, onCarDamage });
    combat.update(dt, cars.current, input);
    missions.update(dt, cars.current);
    if (hud.health <= 0) onBusted('beaten down');
    if (input.pressed('KeyM')) missions.start();
    if (input.pressed('KeyR')) {
      hud.setRadio(`♪ ${radio.cycle()}`);
    }
    if (input.pressed('Digit0')) {
      hud.setRadio(radio.toggleMute() ? '♪ MUTED' : `♪ ${radio.stationLabel}`);
    }
    hud.setObjective(missions.objectiveText);
    hud.setTimer(missions.timeLeft);
    hud.setWeapon(combat.weaponLabel);
    radio.update(dt, !!cars.current);
    if (cars.current) {
      hud.setRadio(radio.muted ? '♪ MUTED' : `♪ ${radio.stationLabel}`);
    } else {
      hud.setRadio(null);
    }
    smoke.update(dt, allCars);

    const driving = cars.current;
    if (driving) {
      player.updateCamera(camera, dt, false, { x: driving.pos.x, y: 1.4, z: driving.pos.z, dist: 11.5 });
    } else {
      player.updateCamera(camera, dt, false);
    }
    hud.update(player, driving, {
      cars: allCars,
      peds: pedestrians.list,
      police: police.all,
      rivals: pedestrians.rivals,
      marker: missions.marker,
    });
  } else {
    player.updateCamera(camera, dt, true); // slow orbit over the city
  }
  renderer.render(scene, camera);
}
frame();

// Test hook: the harness reads this to confirm the game booted.
window.__aurelia = { ready: true, player, input, hud, cars, traffic, pedestrians, wanted, police, combat, missions, radio };
