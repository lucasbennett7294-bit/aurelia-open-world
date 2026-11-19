// Aurelia Bay story places: the named spots the missions send the
// player to. One job: hold the coordinates so the missions, the combat
// pickup and the HUD markers all agree on where things are.
//
// The garage sits just west of Ocean Drive (the x = 156 road) at z = 60;
// the lockup with Marina's pistol is beside it. The harbor pier is out
// on the beach at the east edge; the safehouse is a quiet corner in the
// north-west blocks; the plaza is the city centre at (0, 0).

export const PLACES = {
  garage: { x: 148, z: 60 },
  lockup: { x: 141, z: 58 },
  pier: { x: 198, z: -52 },
  safehouse: { x: -104, z: 130 },
  plaza: { x: 0, z: 0 },
  // Where a busted player wakes up: the plaza ring, clear of the fountain.
  respawn: { x: 14, z: 0 },
  // Day 4: the north end of Ocean Drive (the x = 156 road), where the
  // getaway pickup waits for mission 5.
  bridge: { x: 156, z: -156 },
  // Day 4: the marina office by the harbor, and the armored truck
  // parked beside it for mission 7.
  marina: { x: 186, z: -40 },
  truck: { x: 178, z: -64 },
  // Day 4: the three hidden packages for mission 6 — plaza edge (clear
  // of the fountain), the beach, and the harbor.
  pkgPlaza: { x: 10, z: 10 },
  pkgBeach: { x: 195, z: 40 },
  pkgHarbor: { x: 186, z: -70 },
};
