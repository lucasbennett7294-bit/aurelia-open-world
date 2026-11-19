// Aurelia Bay city: a procedural sun-soaked coastal city, built only from
// boxes, cylinders and colours — no network assets, no imported models.
// One job: build the 3D city and hand back its layout and colliders.

import * as THREE from 'three';

// Deterministic RNG so the city is identical on every load.
function mulberry32(seed) {
  let a = seed >>> 0;
  return function random() {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const CITY = {
  roadSpacing: 52,
  roadWidth: 14,
  roads: [-156, -104, -52, 0, 52, 104, 156],
  blocks: [-130, -78, -26, 26, 78, 130],
  minX: -196, maxX: 420, minZ: -196, maxZ: 196,
  beachX: 182, seaX: 212,
  plaza: { x: 0, z: 0, r: 16 },
};

const PALETTE = [
  0xf2e3c6, // sand cream
  0xe8b48c, // terracotta light
  0xd97b5f, // coral
  0xf6d98a, // pale gold
  0xffffff, // white stucco
  0xf0a35e, // sunset orange
  0x9fc3d8, // sea blue
  0xe07856, // brick red
];

function makeFacadeTexture(style) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 256;
  const g = c.getContext('2d');
  // Backing: brick courses, warm stucco, or a blue glass curtain wall.
  // Kept pale so the palette colour multiplies cleanly over it.
  if (style === 0) {
    g.fillStyle = '#c08a70';
    g.fillRect(0, 0, 256, 256);
    g.fillStyle = 'rgba(60,30,20,0.35)';
    for (let y = 0; y < 256; y += 16) g.fillRect(0, y, 256, 2);
    for (let y = 8; y < 256; y += 16) {
      for (let x = (y % 32 ? 16 : 0); x < 256; x += 32) g.fillRect(x, y, 2, 8);
    }
  } else if (style === 2) {
    g.fillStyle = '#a8c2d4';
    g.fillRect(0, 0, 256, 256);
    g.fillStyle = 'rgba(255,255,255,0.14)';
    for (let x = 0; x < 256; x += 32) g.fillRect(x, 0, 2, 256);
  } else {
    g.fillStyle = '#efe0c0';
    g.fillRect(0, 0, 256, 256);
    g.fillStyle = 'rgba(120,90,50,0.10)';
    for (let i = 0; i < 90; i++) g.fillRect((i * 53) % 256, (i * 97) % 256, 2, 2);
  }
  // 8 x 8 windows: pale frame, tinted pane, mullion cross, some lit warm.
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const x = col * 32 + 6;
      const y = row * 32 + 6;
      const k = (row * 7 + col * 3) % 9;
      g.fillStyle = '#e8e2d2';
      g.fillRect(x - 1, y - 1, 22, 24);
      g.fillStyle = k === 0 ? '#f7c873' : k === 1 ? '#2e4a5e' : k === 2 ? '#3d5a6e' : '#222e3a';
      g.fillRect(x, y, 20, 22);
      g.fillStyle = 'rgba(255,255,255,0.28)';
      g.fillRect(x, y, 20, 3);
      g.fillStyle = '#e8e2d2';
      g.fillRect(x + 9, y, 2, 22);
      g.fillRect(x, y + 10, 20, 2);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

function makeGroundTexture(rand, rand2) {
  const W = 2048; const H = 1280;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  const sx = (x) => ((x - CITY.minX) / (CITY.maxX - CITY.minX)) * W;
  const sz = (z) => ((z - CITY.minZ) / (CITY.maxZ - CITY.minZ)) * H;
  const w = (u) => (u / (CITY.maxX - CITY.minX)) * W;
  const h = (u) => (u / (CITY.maxZ - CITY.minZ)) * H;

  // Base: warm sidewalk paving across the whole map.
  g.fillStyle = '#c9b18c';
  g.fillRect(0, 0, W, H);

  // Sidewalk pavers: a faint grid over the paving (roads and sea are
  // painted over it below, so it only shows on the walks).
  g.strokeStyle = 'rgba(90,70,40,0.14)';
  g.lineWidth = 1;
  for (let x = CITY.minX + 8; x < CITY.maxX; x += 8) {
    g.beginPath(); g.moveTo(sx(x), 0); g.lineTo(sx(x), H); g.stroke();
  }
  for (let z = CITY.minZ + 8; z < CITY.maxZ; z += 8) {
    g.beginPath(); g.moveTo(0, sz(z)); g.lineTo(W, sz(z)); g.stroke();
  }

  // Sea (east) with a soft gradient and a few wave arcs.
  const sea = g.createLinearGradient(sx(CITY.seaX), 0, W, 0);
  sea.addColorStop(0, '#3f9ec4');
  sea.addColorStop(1, '#1d6f9e');
  g.fillStyle = sea;
  g.fillRect(sx(CITY.seaX), 0, W - sx(CITY.seaX), H);
  g.strokeStyle = 'rgba(255,255,255,0.5)';
  g.lineWidth = 3;
  for (let i = 0; i < 10; i++) {
    const y = 60 + i * 120 + ((i * 53) % 40);
    g.beginPath();
    g.moveTo(sx(CITY.seaX) + 8, y);
    g.quadraticCurveTo(sx(CITY.seaX) + 60, y - 14, sx(CITY.seaX) + 120, y);
    g.stroke();
  }

  // Beach sand between the city and the sea.
  g.fillStyle = '#e8d5a4';
  g.fillRect(sx(CITY.beachX), 0, sx(CITY.seaX) - sx(CITY.beachX), H);
  g.fillStyle = 'rgba(180,150,100,0.5)';
  for (let i = 0; i < 260; i++) {
    g.fillRect(sx(CITY.beachX) + rand() * (sx(CITY.seaX) - sx(CITY.beachX)), rand() * H, 3, 3);
  }

  // Asphalt roads.
  g.fillStyle = '#3d3a38';
  for (const x of CITY.roads) g.fillRect(sx(x - CITY.roadWidth / 2), 0, w(CITY.roadWidth), H);
  for (const z of CITY.roads) g.fillRect(0, sz(z - CITY.roadWidth / 2), W, h(CITY.roadWidth));

  // Dashed centre lines.
  g.fillStyle = '#e8c33c';
  for (const x of CITY.roads) {
    for (let z = CITY.minZ + 8; z < CITY.maxZ; z += 16) {
      g.fillRect(sx(x) - 1.5, sz(z), 3, h(8));
    }
  }
  for (const z of CITY.roads) {
    for (let x = CITY.minX + 8; x < CITY.maxX - 40; x += 16) {
      g.fillRect(sx(x), sz(z) - 1.5, w(8), 3);
    }
  }

  // Crosswalks at every intersection.
  g.fillStyle = 'rgba(255,255,255,0.85)';
  for (const x of CITY.roads) {
    for (const z of CITY.roads) {
      for (let i = -2; i <= 2; i++) {
        g.fillRect(sx(x + i * 3) - 1, sz(z - CITY.roadWidth / 2), 2, h(3));
        g.fillRect(sx(x + i * 3) - 1, sz(z + CITY.roadWidth / 2) - h(3), 2, h(3));
        g.fillRect(sx(x - CITY.roadWidth / 2), sz(z + i * 3) - 1, w(3), 2);
        g.fillRect(sx(x + CITY.roadWidth / 2) - w(3), sz(z + i * 3) - 1, w(3), 2);
      }
    }
  }

  // Curbs: pale strips along every road edge.
  g.fillStyle = 'rgba(240,230,200,0.55)';
  for (const x of CITY.roads) {
    g.fillRect(sx(x - 7.6), 0, 2, H);
    g.fillRect(sx(x + 7.6) - 2, 0, 2, H);
  }
  for (const z of CITY.roads) {
    g.fillRect(0, sz(z - 7.6), W, 2);
    g.fillRect(0, sz(z + 7.6) - 2, W, 2);
  }

  // Asphalt wear: seeded dark and light blotches on the roads.
  for (let i = 0; i < 90; i++) {
    const x = CITY.roads[Math.floor(rand2() * CITY.roads.length)] + (rand2() - 0.5) * 12;
    const z = CITY.minZ + rand2() * (CITY.maxZ - CITY.minZ);
    g.fillStyle = rand2() < 0.5 ? 'rgba(0,0,0,0.10)' : 'rgba(255,255,255,0.06)';
    g.beginPath();
    g.ellipse(sx(x), sz(z), 4 + rand2() * 10, 3 + rand2() * 7, 0, 0, Math.PI * 2);
    g.fill();
  }

  // Central plaza: a roundabout with a fountain ring at the (0,0) crossing.
  g.fillStyle = '#d9c49a';
  g.beginPath();
  g.arc(sx(0), sz(0), w(CITY.plaza.r), 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = '#8a7a5c';
  g.lineWidth = 4;
  g.beginPath();
  g.arc(sx(0), sz(0), w(CITY.plaza.r), 0, Math.PI * 2);
  g.stroke();
  g.fillStyle = '#4fa8cf';
  g.beginPath();
  g.arc(sx(0), sz(0), w(5), 0, Math.PI * 2);
  g.fill();

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

export function createCity(scene) {
  const rand = mulberry32(20261119);
  // A second seeded stream for the visual-detail pass only, so the
  // original stream (buildings, tanks, car spots) stays byte-identical
  // to before and no gameplay layout moves.
  const rand2 = mulberry32(20261120);
  const colliders = [];

  // --- ground ---
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(CITY.maxX - CITY.minX, CITY.maxZ - CITY.minZ),
    new THREE.MeshLambertMaterial({ map: makeGroundTexture(rand, rand2) }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set((CITY.minX + CITY.maxX) / 2, 0, 0);
  ground.receiveShadow = true;
  scene.add(ground);

  // --- buildings ---
  const facadeTex = [makeFacadeTexture(0), makeFacadeTexture(1), makeFacadeTexture(2)];
  const wallMaterials = PALETTE.map(
    (color, i) => new THREE.MeshLambertMaterial({ color, map: facadeTex[i % 3] }),
  );
  const roofMaterial = new THREE.MeshLambertMaterial({ color: 0x5a4a3c });
  const tankMaterial = new THREE.MeshLambertMaterial({ color: 0x8a97a3 });
  // Shared detail geometry/materials: one unit box scaled per use, so
  // the detail pass adds meshes, not new geometries.
  const unitBox = new THREE.BoxGeometry(1, 1, 1);
  const acGeo = new THREE.BoxGeometry(0.9, 0.6, 0.9);
  const acMat = new THREE.MeshLambertMaterial({ color: 0x9aa4a8 });
  const pentMat = new THREE.MeshLambertMaterial({ color: 0x6b5a48 });
  const awnMat = new THREE.MeshLambertMaterial({ color: 0x2c7a6e });
  const signMat = new THREE.MeshLambertMaterial({ color: 0xf7c948, emissive: 0x8a6a20, emissiveIntensity: 0.5 });

  for (const bx of CITY.blocks) {
    for (const bz of CITY.blocks) {
      // The four blocks around the centre plaza stay low so the skyline opens up.
      const nearCentre = Math.abs(bx) <= 26 && Math.abs(bz) <= 26;
      const count = nearCentre ? 1 : 1 + Math.floor(rand() * 3);
      for (let i = 0; i < count; i++) {
        const w = 12 + rand() * 16;
        const d = 12 + rand() * 16;
        const h = nearCentre ? 8 + rand() * 8 : 10 + rand() * rand() * 42;
        const x = bx + (rand() - 0.5) * (38 - w);
        const z = bz + (rand() - 0.5) * (38 - d);

        const geo = new THREE.BoxGeometry(w, h, d);
        // Scale UVs so windows stay ~1.5 units apart whatever the building size.
        const uv = geo.attributes.uv;
        for (let v = 0; v < uv.count; v++) {
          uv.setXY(v, uv.getX(v) * (w / 12), uv.getY(v) * (h / 12));
        }
        const body = new THREE.Mesh(geo, wallMaterials[Math.floor(rand() * wallMaterials.length)]);
        body.position.set(x, h / 2, z);
        body.castShadow = true;
        body.receiveShadow = true;
        scene.add(body);

        // Roof slab doubled as a parapet rim: taller and darker so the
        // roofline reads from the street.
        const roof = new THREE.Mesh(new THREE.BoxGeometry(w + 0.8, 1.0, d + 0.8), roofMaterial);
        roof.position.set(x, h + 0.5, z);
        roof.castShadow = true;
        scene.add(roof);

        // Rooftop detail: AC unit, a penthouse box on tall buildings,
        // and a balcony slab + rail on the south face.
        if (rand2() < 0.45) {
          const ac = new THREE.Mesh(acGeo, acMat);
          ac.position.set(x + (rand2() - 0.5) * (w * 0.5), h + 1.3, z + (rand2() - 0.5) * (d * 0.5));
          ac.castShadow = true;
          scene.add(ac);
        }
        if (h > 20 && rand2() < 0.5) {
          const pent = new THREE.Mesh(unitBox, pentMat);
          pent.scale.set(w * 0.35, 2.2, d * 0.35);
          pent.position.set(x, h + 2.1, z);
          pent.castShadow = true;
          scene.add(pent);
        }
        if (h > 16 && rand2() < 0.4) {
          const bal = new THREE.Mesh(unitBox, roofMaterial);
          bal.scale.set(Math.min(w * 0.6, 8), 0.18, 1.4);
          bal.position.set(x, h * 0.55, z + d / 2 + 0.7);
          bal.castShadow = true;
          scene.add(bal);
          const rail = new THREE.Mesh(unitBox, tankMaterial);
          rail.scale.set(Math.min(w * 0.6, 8), 0.9, 0.1);
          rail.position.set(x, h * 0.55 + 0.5, z + d / 2 + 1.35);
          scene.add(rail);
        }
        // Ocean Drive shopfronts (blocks at bx = 130): a sloping awning
        // and a warm sign band on the face toward the road.
        if (bx === 130 && rand2() < 0.7) {
          const awn = new THREE.Mesh(unitBox, awnMat);
          awn.scale.set(1.6, 0.12, Math.min(w * 0.7, 10));
          awn.position.set(x + w / 2 + 0.8, 3.4, z);
          awn.rotation.z = -0.25;
          scene.add(awn);
          const sign = new THREE.Mesh(unitBox, signMat);
          sign.scale.set(0.3, 0.9, Math.min(w * 0.7, 10));
          sign.position.set(x + w / 2 + 0.15, 4.6, z);
          scene.add(sign);
        }

        if (rand() < 0.5) {
          const tank = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 2.2, 10), tankMaterial);
          tank.position.set(x + (rand() - 0.5) * (w * 0.5), h + 1.7, z + (rand() - 0.5) * (d * 0.5));
          tank.castShadow = true;
          scene.add(tank);
        }
        colliders.push({ minX: x - w / 2 - 0.3, maxX: x + w / 2 + 0.3, minZ: z - d / 2 - 0.3, maxZ: z + d / 2 + 0.3 });
      }
    }
  }

  // --- plaza fountain ---
  const basin = new THREE.Mesh(
    new THREE.CylinderGeometry(5.4, 5.8, 1.1, 24),
    new THREE.MeshLambertMaterial({ color: 0xd8cdb8 }),
  );
  basin.position.set(0, 0.55, 0);
  basin.castShadow = true;
  basin.receiveShadow = true;
  scene.add(basin);
  const water = new THREE.Mesh(
    new THREE.CylinderGeometry(4.9, 4.9, 0.3, 24),
    new THREE.MeshLambertMaterial({ color: 0x4fa8cf }),
  );
  water.position.set(0, 1.0, 0);
  scene.add(water);
  const spout = new THREE.Mesh(
    new THREE.CylinderGeometry(0.5, 0.8, 3.2, 10),
    new THREE.MeshLambertMaterial({ color: 0xf2e3c6 }),
  );
  spout.position.set(0, 2.4, 0);
  spout.castShadow = true;
  scene.add(spout);
  colliders.push({ minX: -6, maxX: 6, minZ: -6, maxZ: 6 });

  // --- street lamps at every other intersection corner ---
  const poleGeo = new THREE.CylinderGeometry(0.09, 0.13, 5.2, 6);
  const poleMat = new THREE.MeshLambertMaterial({ color: 0x2e3438 });
  const lampGeo = new THREE.SphereGeometry(0.32, 8, 6);
  const lampMat = new THREE.MeshLambertMaterial({ color: 0xffe9a8, emissive: 0xffc860, emissiveIntensity: 0.9 });
  for (const x of CITY.roads) {
    for (const z of CITY.roads) {
      if (((x + z) / 52) % 2 !== 0) continue;
      const lamp = new THREE.Mesh(poleGeo, poleMat);
      lamp.position.set(x + 8.5, 2.6, z + 8.5);
      lamp.castShadow = true;
      scene.add(lamp);
      const bulb = new THREE.Mesh(lampGeo, lampMat);
      bulb.position.set(x + 8.5, 5.3, z + 8.5);
      scene.add(bulb);
    }
  }

  // --- north bridge arch: the landmark at the north end of Ocean
  // Drive (x = 156, z = -156), where mission 5's pickup waits. Fixed
  // geometry, no randomness, so the seeded city is unchanged.
  const archMat = new THREE.MeshLambertMaterial({ color: 0xe8dcc0 });
  const archTrim = new THREE.MeshLambertMaterial({ color: 0x2c7a6e });
  for (const px of [147, 165]) {
    const pillar = new THREE.Mesh(new THREE.BoxGeometry(2.2, 7, 2.2), archMat);
    pillar.position.set(px, 3.5, -156);
    pillar.castShadow = true;
    scene.add(pillar);
    colliders.push({ minX: px - 1.1, maxX: px + 1.1, minZ: -157.1, maxZ: -154.9 });
  }
  const beam = new THREE.Mesh(new THREE.BoxGeometry(20.2, 1.6, 2.4), archMat);
  beam.position.set(156, 7.6, -156);
  beam.castShadow = true;
  scene.add(beam);
  const beamTrim = new THREE.Mesh(new THREE.BoxGeometry(20.4, 0.4, 2.6), archTrim);
  beamTrim.position.set(156, 6.6, -156);
  scene.add(beamTrim);

  // --- palm trees along Ocean Drive (x = 156) and the plaza ---
  const trunkGeo = new THREE.CylinderGeometry(0.16, 0.3, 4.6, 6);
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x8a6a4a });
  const crownGeo = new THREE.ConeGeometry(1.9, 1.6, 7);
  const crownMat = new THREE.MeshLambertMaterial({ color: 0x3f8f4f });
  const palmSpots = [];
  for (let z = -150; z <= 150; z += 26) palmSpots.push([168, z + 6]);
  for (let z = -150; z <= 150; z += 26) palmSpots.push([144, z - 8]);
  palmSpots.push([-20, -20], [20, -20], [-20, 20], [20, 20]);
  for (const [x, z] of palmSpots) {
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.position.set(x, 2.3, z);
    trunk.rotation.z = (rand() - 0.5) * 0.12;
    trunk.castShadow = true;
    scene.add(trunk);
    const crown = new THREE.Mesh(crownGeo, crownMat);
    crown.position.set(x, 5.2, z);
    crown.scale.y = 0.55;
    crown.rotation.y = rand() * Math.PI;
    crown.castShadow = true;
    scene.add(crown);
  }

  // --- palm fronds: one InstancedMesh of flattened cones, five per
  // palm, drooping out from the crown. One draw call for all of them.
  const frondGeo = new THREE.ConeGeometry(0.45, 2.4, 4);
  frondGeo.scale(1, 1, 0.22);
  const frondMat = new THREE.MeshLambertMaterial({ color: 0x2f7a3d });
  const fronds = new THREE.InstancedMesh(frondGeo, frondMat, palmSpots.length * 5);
  const dummy = new THREE.Object3D();
  let fi = 0;
  for (const [px, pz] of palmSpots) {
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2 + rand2() * 0.5;
      dummy.rotation.set(0, 0, 0);
      dummy.rotateY(a);
      dummy.rotateX(1.7);
      dummy.position.set(px + Math.sin(a) * 1.0, 5.9, pz + Math.cos(a) * 1.0);
      dummy.updateMatrix();
      fronds.setMatrixAt(fi++, dummy.matrix);
    }
  }
  fronds.instanceMatrix.needsUpdate = true;
  fronds.castShadow = true;
  scene.add(fronds);

  // --- street props: traffic lights, benches, hydrants, signs,
  // beach umbrellas + towels, plaza planters. Visual only, no new
  // colliders, so no mission path or gameplay layout changes.
  const tlHeadGeo = new THREE.BoxGeometry(0.5, 1.1, 0.5);
  const tlDotGeo = new THREE.BoxGeometry(0.3, 0.3, 0.06);
  const tlDark = new THREE.MeshLambertMaterial({ color: 0x22262a });
  const tlGreen = new THREE.MeshLambertMaterial({ color: 0x2fae5f, emissive: 0x1d8a45, emissiveIntensity: 1.2 });
  for (const [x, z] of [[8.5, -8.5], [-8.5, 8.5], [-8.5, -8.5], [164.5, -104], [164.5, -52], [164.5, 52], [164.5, 104]]) {
    const p = new THREE.Mesh(poleGeo, poleMat);
    p.position.set(x, 2.6, z);
    p.castShadow = true;
    scene.add(p);
    const head = new THREE.Mesh(tlHeadGeo, tlDark);
    head.position.set(x, 5.6, z);
    scene.add(head);
    const dot = new THREE.Mesh(tlDotGeo, tlGreen);
    dot.position.set(x, 5.35, z + 0.26);
    scene.add(dot);
  }
  const benchMat = new THREE.MeshLambertMaterial({ color: 0x8a6a42 });
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const bx2 = Math.cos(a) * 12;
    const bz2 = Math.sin(a) * 12;
    const seat = new THREE.Mesh(unitBox, benchMat);
    seat.scale.set(2.2, 0.18, 0.7);
    seat.position.set(bx2, 0.55, bz2);
    seat.rotation.y = -a;
    scene.add(seat);
    const back = new THREE.Mesh(unitBox, benchMat);
    back.scale.set(2.2, 0.7, 0.12);
    back.position.set(bx2 + Math.cos(a) * 0.35, 0.95, bz2 + Math.sin(a) * 0.35);
    back.rotation.y = -a;
    scene.add(back);
  }
  const hydGeo = new THREE.CylinderGeometry(0.22, 0.28, 0.8, 8);
  const hydMat = new THREE.MeshLambertMaterial({ color: 0xc0392b });
  for (const [x, z] of [[-60.5, -43.5], [60.5, 43.5], [-8.5, 60.5], [8.5, -60.5], [112.5, -8.5], [-112.5, 8.5]]) {
    const hyd = new THREE.Mesh(hydGeo, hydMat);
    hyd.position.set(x, 0.4, z);
    hyd.castShadow = true;
    scene.add(hyd);
  }
  const signPlateGeo = new THREE.BoxGeometry(1.6, 0.4, 0.06);
  const signGreen = new THREE.MeshLambertMaterial({ color: 0x2c7a4e });
  for (const [x, z] of [[9.5, 9.5], [-9.5, 9.5], [9.5, -9.5], [-9.5, -9.5]]) {
    const sp = new THREE.Mesh(unitBox, poleMat);
    sp.scale.set(0.12, 2.6, 0.12);
    sp.position.set(x, 1.3, z);
    scene.add(sp);
    const plate = new THREE.Mesh(signPlateGeo, signGreen);
    plate.position.set(x, 2.6, z);
    scene.add(plate);
  }
  const umbPoleGeo = new THREE.CylinderGeometry(0.05, 0.05, 2.2, 6);
  const umbTopGeo = new THREE.ConeGeometry(1.6, 0.7, 8);
  const umbMat = new THREE.MeshLambertMaterial({ color: 0xe07856 });
  const towelMats = [0xe84a7a, 0x3fa7d6, 0xf7c948].map(
    (c) => new THREE.MeshLambertMaterial({ color: c }));
  for (let i = 0; i < 5; i++) {
    const ux = 190 + rand2() * 16;
    const uz = -140 + i * 60 + rand2() * 20;
    const up = new THREE.Mesh(umbPoleGeo, poleMat);
    up.position.set(ux, 1.1, uz);
    scene.add(up);
    const top = new THREE.Mesh(umbTopGeo, umbMat);
    top.position.set(ux, 2.4, uz);
    top.castShadow = true;
    scene.add(top);
    const towel = new THREE.Mesh(unitBox, towelMats[i % 3]);
    towel.scale.set(1.8, 0.06, 0.9);
    towel.position.set(ux + 2.5, 0.05, uz + 1);
    towel.rotation.y = rand2() * 3;
    scene.add(towel);
  }
  const planterMat = new THREE.MeshLambertMaterial({ color: 0x9a7f56 });
  const shrubGeo = new THREE.SphereGeometry(0.7, 8, 6);
  const shrubMat = new THREE.MeshLambertMaterial({ color: 0x4a8f3f });
  for (const [x, z] of [[-20, 0], [20, 0], [0, -20], [0, 20]]) {
    const box = new THREE.Mesh(unitBox, planterMat);
    box.scale.set(1.6, 0.8, 1.6);
    box.position.set(x, 0.4, z);
    box.castShadow = true;
    scene.add(box);
    const shrub = new THREE.Mesh(shrubGeo, shrubMat);
    shrub.position.set(x, 1.1, z);
    scene.add(shrub);
  }

  // --- parked car spots: cars.js builds these as drivable cars (Day 2) ---
  // 16 spots: 8 along vertical roads, 8 along horizontal roads, parked at
  // the road edge (offset 5.2 from the centre line, inside the 14-wide
  // road). Kinds and colours come from the same seeded stream, so the
  // spots are identical on every load.
  const carColors = [0xc0392b, 0x2471a3, 0xf1c40f, 0x7d3c98, 0x1e8449, 0xeeeeee, 0x2c3e50];
  const carSpots = [];
  for (let i = 0; i < 8; i++) {
    const road = CITY.roads[1 + Math.floor(rand() * 5)];
    const along = -140 + rand() * 280;
    const kindA = i % 4 === 1 ? 'taxi' : i % 4 === 3 ? 'pickup' : 'sedan';
    const kindB = i % 4 === 2 ? 'taxi' : i % 4 === 0 ? 'pickup' : 'sedan';
    const colorA = kindA === 'taxi' ? 0xf7c948 : carColors[Math.floor(rand() * carColors.length)];
    const colorB = kindB === 'taxi' ? 0xf7c948 : carColors[Math.floor(rand() * carColors.length)];
    carSpots.push({ x: road + 5.2, z: along, angle: 0, kind: kindA, color: colorA });
    carSpots.push({ x: along, z: road + 5.2, angle: Math.PI / 2, kind: kindB, color: colorB });
  }

  return { colliders, layout: CITY, carSpots };
}
