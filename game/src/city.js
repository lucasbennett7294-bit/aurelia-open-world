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

function makeWindowTexture() {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, 256, 256);
  // 8 x 8 windows per tile; each window a dark pane with a lighter frame.
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const x = col * 32 + 6;
      const y = row * 32 + 6;
      g.fillStyle = '#cfd6dd';
      g.fillRect(x - 1, y - 1, 22, 24);
      g.fillStyle = (row + col) % 5 === 0 ? '#3a4a5a' : '#20262e';
      g.fillRect(x, y, 20, 22);
      g.fillStyle = 'rgba(255,255,255,0.25)';
      g.fillRect(x, y, 20, 4);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

function makeGroundTexture(rand) {
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
  const colliders = [];

  // --- ground ---
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(CITY.maxX - CITY.minX, CITY.maxZ - CITY.minZ),
    new THREE.MeshLambertMaterial({ map: makeGroundTexture(rand) }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set((CITY.minX + CITY.maxX) / 2, 0, 0);
  ground.receiveShadow = true;
  scene.add(ground);

  // --- buildings ---
  const windowTex = makeWindowTexture();
  const wallMaterials = PALETTE.map(
    (color) => new THREE.MeshLambertMaterial({ color, map: windowTex }),
  );
  const roofMaterial = new THREE.MeshLambertMaterial({ color: 0x5a4a3c });
  const tankMaterial = new THREE.MeshLambertMaterial({ color: 0x8a97a3 });

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

        const roof = new THREE.Mesh(new THREE.BoxGeometry(w + 0.8, 0.6, d + 0.8), roofMaterial);
        roof.position.set(x, h + 0.3, z);
        roof.castShadow = true;
        scene.add(roof);

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
