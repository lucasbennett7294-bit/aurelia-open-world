// Aurelia Bay save game: one JSON blob in localStorage holding cash,
// story progress, the pistol, and where the player stands. One job:
// remember the run so CONTINUE on the start screen picks it back up.
//
// Everything is guarded: a browser with no localStorage (or a quota
// error) just means no save, never a crash.

const KEY = 'aurelia-bay-save-v1';

function storage() {
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage;
  } catch {
    return null;
  }
}

export const Save = {
  KEY,

  exists() {
    const store = storage();
    if (!store) return false;
    try {
      return store.getItem(KEY) !== null;
    } catch {
      return false;
    }
  },

  // data: { cash, missionIndex, hasPistol, pos: {x, z}, health }
  save(data) {
    const store = storage();
    if (!store) return false;
    try {
      store.setItem(KEY, JSON.stringify({
        cash: Math.max(0, Math.floor(data.cash || 0)),
        missionIndex: Math.max(0, Math.floor(data.missionIndex || 0)),
        hasPistol: !!data.hasPistol,
        pos: { x: data.pos ? data.pos.x : -26, z: data.pos ? data.pos.z : 60 },
        health: Math.max(1, Math.min(100, Math.floor(data.health ?? 100))),
        savedAt: Date.now(),
      }));
      return true;
    } catch {
      return false;
    }
  },

  load() {
    const store = storage();
    if (!store) return null;
    try {
      const raw = store.getItem(KEY);
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (typeof data !== 'object' || data === null) return null;
      return {
        cash: Math.max(0, Math.floor(data.cash || 0)),
        missionIndex: Math.max(0, Math.min(8, Math.floor(data.missionIndex || 0))),
        hasPistol: !!data.hasPistol,
        pos: {
          x: Number.isFinite(data.pos?.x) ? data.pos.x : -26,
          z: Number.isFinite(data.pos?.z) ? data.pos.z : 60,
        },
        health: Math.max(1, Math.min(100, Math.floor(data.health ?? 100))),
      };
    } catch {
      return null;
    }
  },

  clear() {
    const store = storage();
    if (!store) return;
    try {
      store.removeItem(KEY);
    } catch {
      // Nothing to do: a missing save is the same as a cleared one.
    }
  },
};
