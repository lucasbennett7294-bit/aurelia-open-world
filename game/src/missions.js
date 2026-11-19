// Aurelia Bay story and missions. One job: run the eight story jobs
// for Rook, a driver new to the city, working for Marina Voss out of
// her garage on Ocean Drive — with objectives on the HUD, a marker on
// the minimap, timers where they matter, and cash for finishing.
//
// Flow: press M to start the next mission (or retry a failed one).
// Each mission is a short chain of steps; finishing one unlocks the
// next. Getting busted or running out of time fails the mission, and
// the player can retry it. Finishing all eight shows the ending screen
// and unlocks free roam: pressing M then replays the story from job 1.
// All names are original.

import * as THREE from 'three';
import { PLACES } from './places.js';

export const MISSIONS = [
  {
    name: 'First Wheels',
    reward: 150,
    brief: 'Marina needs wheels. Pick up the pistol from the lockup, steal any car, and bring it back to the garage.',
  },
  {
    name: 'Harbor Run',
    reward: 300,
    brief: 'A package for the harbor pier, and the clock is running. Drive it there in 90 seconds.',
  },
  {
    name: 'Heat',
    reward: 400,
    brief: 'The patrol is on you. Survive the chase for 60 seconds, then slip to the safehouse and cool off.',
  },
  {
    name: 'Payback',
    reward: 500,
    brief: 'A rival crew is muscling in on the plaza. Deal with all three, then report back to the garage.',
  },
  {
    name: 'Night Shift',
    reward: 600,
    brief: 'A getaway car is waiting at the garage. Drive it to the north bridge pickup — then the heat comes down.',
  },
  {
    name: 'The Long Con',
    reward: 750,
    brief: 'Three packages stashed around the city: the plaza, the beach, the harbor. Grab them all — quietly.',
  },
  {
    name: 'Harbor Heist',
    reward: 900,
    brief: 'An armored truck is parked at the harbor. Take it, and bring it home through the patrol.',
  },
  {
    name: 'King of the Bay',
    reward: 1200,
    brief: 'The marina office, four guards, one briefcase. Take it all — and outrun everything the city throws at you.',
  },
];

function distTo(pos, place) {
  return Math.hypot(pos.x - place.x, pos.z - place.z);
}

export class Missions {
  constructor(ctx) {
    this.scene = ctx.scene;
    this.player = ctx.player;
    this.cars = ctx.cars;
    this.combat = ctx.combat;
    this.pedestrians = ctx.pedestrians;
    this.traffic = ctx.traffic || null;
    this.wanted = ctx.wanted;
    this.hud = ctx.hud;
    this.onComplete = ctx.onComplete || null; // called on each completion (save)
    this.index = 0; // next mission to run
    this.status = 'idle'; // 'idle' | 'active' | 'failed' | 'done'
    this.step = 0;
    this.timeLeft = null; // seconds, while a timer runs
    this._stoleCar = false;
    this._rivalBase = 0;
    this._collected = 0;
    this._truck = null;
    this._packages = this._buildPickups([
      PLACES.pkgPlaza, PLACES.pkgBeach, PLACES.pkgHarbor,
    ], 0xffd23e);
    this._briefcase = this._buildPickups([PLACES.marina], 0x2c3e50)[0];
  }

  // A glowing pickup marker: a gold box under a tall light beam, so the
  // player can spot it from across the street. Hidden until its mission.
  _buildPickups(places, color) {
    const out = [];
    for (const place of places) {
      const group = new THREE.Group();
      const box = new THREE.Mesh(
        new THREE.BoxGeometry(0.9, 0.6, 0.9),
        new THREE.MeshLambertMaterial({ color, emissive: color, emissiveIntensity: 0.55 }),
      );
      box.position.y = 0.5;
      box.castShadow = true;
      group.add(box);
      const beam = new THREE.Mesh(
        new THREE.CylinderGeometry(0.18, 0.18, 30, 8),
        new THREE.MeshBasicMaterial({
          color: 0xffd23e, transparent: true, opacity: 0.3, depthWrite: false,
        }),
      );
      beam.position.y = 15;
      group.add(beam);
      group.position.set(place.x, 0, place.z);
      group.visible = false;
      this.scene.add(group);
      out.push({ mesh: group, place, taken: false });
    }
    return out;
  }

  get current() {
    return MISSIONS[this.index] || null;
  }

  // Missions finished so far, for the start-screen list and the save.
  get completedCount() {
    return Math.min(this.index, MISSIONS.length);
  }

  // Where the minimap marker points right now, or null.
  get marker() {
    if (this.status !== 'active') return null;
    const p = PLACES;
    if (this.index === 0) {
      if (this.step === 0 || this.step === 3) return p.garage;
      if (this.step === 1) return p.lockup;
      return null; // step 2: steal any car
    }
    if (this.index === 1) return this.step === 1 ? p.pier : null;
    if (this.index === 2) return this.step === 1 ? p.safehouse : null;
    if (this.index === 3) {
      if (this.step === 0 || this.step === 1) return p.plaza;
      return p.garage;
    }
    if (this.index === 4) {
      if (this.step === 1) return p.bridge;
      if (this.step === 2) return p.safehouse;
      return null; // step 0: get in a car
    }
    if (this.index === 5) {
      const next = this._packages.find((pkg) => !pkg.taken);
      return next ? next.place : null;
    }
    if (this.index === 6) {
      if (this.step === 0 || this.step === 1) return p.truck;
      return p.garage;
    }
    if (this.index === 7) {
      if (this.step === 0 || this.step === 1 || this.step === 2) return p.marina;
      return p.garage;
    }
    return null;
  }

  get objectiveText() {
    if (this.status === 'done') return 'All missions complete — Aurelia Bay is yours, Rook.';
    if (this.status === 'failed') {
      const m = this.current;
      return m ? `Mission failed — press M to retry: ${m.name}` : '';
    }
    if (this.status !== 'active') {
      const m = this.current;
      return m ? `Press M to start: ${m.name} — $${m.reward}` : '';
    }
    if (this.index === 0) {
      return [
        "Go to Marina's garage on Ocean Drive",
        'Pick up the pistol from the lockup',
        'Steal any car',
        'Bring the car back to the garage',
      ][this.step];
    }
    if (this.index === 1) {
      return this.step === 0 ? 'Get in a car' : 'Deliver the package to the harbor pier';
    }
    if (this.index === 2) {
      return this.step === 0 ? 'Survive the heat — keep moving!' : 'Reach the safehouse to cool off';
    }
    if (this.index === 3) {
      if (this.step === 0) return 'Go to the plaza';
      if (this.step === 1) {
        const done = this.pedestrians.defeatedRivals - this._rivalBase;
        return `Deal with the rival crew (${Math.min(3, done)}/3)`;
      }
      return 'Return to the garage';
    }
    if (this.index === 4) {
      if (this.step === 0) return 'Get in the getaway car';
      if (this.step === 1) return 'Drive to the north bridge pickup';
      return 'Lose the heat — reach the safehouse';
    }
    if (this.index === 5) {
      return `Collect the packages (${this._collected}/3) — stay out of sight`;
    }
    if (this.index === 6) {
      if (this.step === 0) return 'Go to the armored truck at the harbor';
      if (this.step === 1) return 'Steal the armored truck';
      return 'Bring the truck back to the garage';
    }
    if (this.index === 7) {
      if (this.step === 0) return 'Go to the marina office';
      if (this.step === 1) {
        const done = this.pedestrians.defeatedRivals - this._rivalBase;
        return `Deal with the guards (${Math.min(4, done)}/4)`;
      }
      if (this.step === 2) return 'Grab the briefcase';
      return 'Escape to the garage — four stars!';
    }
    return '';
  }

  // Per-mission setup shared by start() and forceStart().
  _setup() {
    this._collected = 0;
    for (const pkg of this._packages) {
      pkg.taken = false;
      pkg.mesh.visible = this.index === 5;
    }
    this._briefcase.mesh.visible = false;
    this._briefcase.taken = false;
    if (this.index === 6) {
      // The armored truck waits at the harbor; a retry puts it back.
      if (!this._truck) {
        this._truck = this.cars.spawn('armored', 0x3a4a5a, PLACES.truck.x, PLACES.truck.z, Math.PI / 2);
      } else {
        this._truck.pos.set(PLACES.truck.x, 0, PLACES.truck.z);
        this._truck.group.position.set(PLACES.truck.x, 0, PLACES.truck.z);
        this._truck.heading = Math.PI / 2;
        this._truck.group.rotation.y = Math.PI / 2;
        this._truck.vel.set(0, 0, 0);
        this._truck.hp = 100;
        this._truck.driver = 'parked';
      }
    }
  }

  // Start the next mission, or retry the failed one. After the finale,
  // M replays the story from job 1 (free roam with replayable missions).
  start() {
    if (this.status === 'active') return false;
    if (this.status === 'done') {
      this.index = 0;
      this.status = 'idle';
    }
    if (this.index >= MISSIONS.length) return false;
    this.status = 'active';
    this.step = 0;
    this.timeLeft = null;
    this._stoleCar = false;
    const m = this.current;
    this.hud.banner(m.name.toUpperCase(), m.brief, 4000);
    this._setup();
    // Every job starts with a clean slate: the wanted level a mission
    // sets (M3's 2 stars, M5/M7's 3, M8's 4) is exact, never stacked
    // on heat left over from free roam or the previous job.
    this.wanted.clear();
    if (this.index === 1) this.timeLeft = 90;
    if (this.index === 2) {
      this.wanted.clear();
      this.wanted.raise(2);
      this.timeLeft = 60;
    }
    if (this.index === 3) this._rivalBase = this.pedestrians.defeatedRivals;
    if (this.index === 7) this._rivalBase = this.pedestrians.defeatedRivals;
    return true;
  }

  // Start any mission regardless of story progress. Only the screenshot
  // deep links use this — the player unlocks missions in order.
  forceStart(index) {
    if (this.status === 'active') return false;
    if (index < 0 || index >= MISSIONS.length) return false;
    this.index = index;
    this.status = 'active';
    this.step = 0;
    this.timeLeft = null;
    this._stoleCar = false;
    const m = this.current;
    this.hud.banner(m.name.toUpperCase(), m.brief, 4000);
    this._setup();
    this.wanted.clear();
    if (this.index === 7) this._rivalBase = this.pedestrians.defeatedRivals;
    return true;
  }

  // Jump to a later step of the active mission. Only the screenshot
  // deep links use this (a chase shot starts mid-escape).
  jumpToStep(step) {
    if (this.status !== 'active') return false;
    this.step = step;
    return true;
  }

  // Restore story progress from a save: index missions are done.
  applySave(missionIndex) {
    this.index = Math.max(0, Math.min(MISSIONS.length, missionIndex));
    this.status = this.index >= MISSIONS.length ? 'done' : 'idle';
    this.step = 0;
    this.timeLeft = null;
  }

  // The player just entered a car (main.js reports it).
  onCarEntered() {
    if (this.status === 'active' && this.index === 0 && this.step === 2) {
      this._stoleCar = true;
    }
  }

  // The player was busted: an active mission fails. Returns true if a
  // mission was running (the caller then shows the failure banner
  // instead of its own BUSTED banner).
  onBusted() {
    if (this.status !== 'active') return false;
    this.fail('Busted by the patrol');
    return true;
  }

  fail(reason) {
    this.status = 'failed';
    this.timeLeft = null;
    this.hud.banner('MISSION FAILED', `${reason} — press M to retry`, 3500);
  }

  _complete() {
    const m = this.current;
    const wasFinale = this.index === MISSIONS.length - 1;
    this.hud.cash += m.reward;
    this.hud.banner('MISSION COMPLETE', `${m.name} — +$${m.reward}`, 3500);
    this.index++;
    this.status = this.index >= MISSIONS.length ? 'done' : 'idle';
    this.step = 0;
    this.timeLeft = null;
    if (wasFinale && this.hud.showEnding) this.hud.showEnding();
    if (this.onComplete) this.onComplete();
  }

  // dt seconds; driving is the car being driven, or null on foot.
  update(dt, driving) {
    if (this.status !== 'active') return;
    const pos = this.player.pos;
    if (this.index === 0) {
      if (this.step === 0 && distTo(pos, PLACES.garage) < 10) this.step = 1;
      else if (this.step === 1 && this.combat.hasPistol) this.step = 2;
      else if (this.step === 2 && (this._stoleCar || driving)) this.step = 3;
      else if (this.step === 3 && driving && distTo(pos, PLACES.garage) < 10) this._complete();
    } else if (this.index === 1) {
      this.timeLeft -= dt;
      if (this.timeLeft <= 0) {
        this.fail('Out of time');
        return;
      }
      if (this.step === 0 && driving) this.step = 1;
      else if (this.step === 1 && distTo(pos, PLACES.pier) < 10) this._complete();
    } else if (this.index === 2) {
      if (this.step === 0) {
        this.timeLeft -= dt;
        if (this.timeLeft <= 0) {
          this.step = 1;
          this.timeLeft = null;
        }
      } else if (distTo(pos, PLACES.safehouse) < 10) {
        this.wanted.clear();
        this._complete();
      }
    } else if (this.index === 3) {
      if (this.step === 0 && distTo(pos, PLACES.plaza) < 12) {
        // The crew is waiting at the plaza.
        this.pedestrians.spawnRival(6, -6);
        this.pedestrians.spawnRival(-6, 6);
        this.pedestrians.spawnRival(0, -10);
        this.step = 1;
      } else if (this.step === 1) {
        const done = this.pedestrians.defeatedRivals - this._rivalBase;
        if (done >= 3) this.step = 2;
      } else if (this.step === 2 && distTo(pos, PLACES.garage) < 10) {
        this._complete();
      }
    } else if (this.index === 4) {
      if (this.step === 0 && driving) this.step = 1;
      else if (this.step === 1 && distTo(pos, PLACES.bridge) < 10) {
        // The pickup is a setup: three stars the moment the car stops.
        this.wanted.raise(3);
        this.hud.banner('THE HEAT IS ON', 'Three stars — lose them at the safehouse', 3500);
        this.step = 2;
      } else if (this.step === 2 && distTo(pos, PLACES.safehouse) < 10) {
        this.wanted.clear();
        this._complete();
      }
    } else if (this.index === 5) {
      // On foot, collect all three packages. A walker or a traffic car
      // close enough to see the grab calls it in: +1 star per witness.
      for (const pkg of this._packages) {
        if (pkg.taken) continue;
        if (distTo(pos, pkg.place) < 3) {
          pkg.taken = true;
          pkg.mesh.visible = false;
          this._collected++;
          const witnessed = this.pedestrians.anyWithin(pos.x, pos.z, 25)
            || (this.traffic && this.traffic.anyWithin(pos.x, pos.z, 18));
          if (witnessed) this.wanted.raise(1);
        }
      }
      if (this._collected >= 3) this._complete();
    } else if (this.index === 6) {
      if (this.step === 0 && distTo(pos, PLACES.truck) < 10) this.step = 1;
      else if (this.step === 1 && driving === this._truck) {
        this.wanted.raise(3);
        this.hud.banner('TRUCK HEIST', 'Three stars — get the truck to the garage', 3500);
        this.step = 2;
      } else if (this.step === 2 && driving && distTo(pos, PLACES.garage) < 10) {
        this._complete();
      }
    } else if (this.index === 7) {
      if (this.step === 0 && distTo(pos, PLACES.marina) < 12) {
        // Four guards hold the marina office.
        this.pedestrians.spawnRival(PLACES.marina.x - 6, PLACES.marina.z - 6);
        this.pedestrians.spawnRival(PLACES.marina.x + 6, PLACES.marina.z - 6);
        this.pedestrians.spawnRival(PLACES.marina.x - 6, PLACES.marina.z + 6);
        this.pedestrians.spawnRival(PLACES.marina.x + 6, PLACES.marina.z + 6);
        this._rivalBase = this.pedestrians.defeatedRivals;
        this.step = 1;
      } else if (this.step === 1) {
        const done = this.pedestrians.defeatedRivals - this._rivalBase;
        if (done >= 4) {
          this.step = 2;
          this._briefcase.mesh.visible = true;
        }
      } else if (this.step === 2 && distTo(pos, PLACES.marina) < 3) {
        this._briefcase.mesh.visible = false;
        this._briefcase.taken = true;
        this.wanted.raise(4);
        this.hud.banner('FOUR STARS', 'The whole patrol is coming — run for the garage', 3500);
        this.step = 3;
      } else if (this.step === 3 && driving && distTo(pos, PLACES.garage) < 10) {
        this._complete();
      }
    }
  }
}
