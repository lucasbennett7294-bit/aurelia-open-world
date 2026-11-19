// Shared materials for Aurelia Bay: one place for the PBR look.
// std(color, roughness, metalness, emissive, emissiveIntensity) builds a
// MeshStandardMaterial; painted metal is glossier than concrete or cloth.
import * as THREE from 'three';

export const std = (c, r = 0.6, m = 0.1, e = 0, ei = 0) =>
  new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m,
    ...(e ? { emissive: e, emissiveIntensity: ei } : {}) });

// Tinted glass, dark chrome trim and warm concrete, shared by every mesh.
export const GLASS_STD = std(0x1d2f42, 0.12, 0.65);
export const CHROME = std(0xd8dde2, 0.25, 0.9);
export const TRIM_DARK = std(0x1a1a1a, 0.7, 0.3);
export const CONCRETE = std(0xb8a88e, 0.95, 0);
export const WOOD = std(0x8a6a42, 0.85, 0);
