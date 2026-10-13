import * as THREE from 'three';
import { part, merge, flatMat } from './models.js';
import { hash1 } from '../game/rng.js';

const TILE = 900;

// Berge und Wolken in der Ferne. Sie wandern langsamer mit (Parallaxe) und wiederholen sich.
export class Background {
  constructor(scene, pal) {
    const mGeo = this.mountains(pal);
    const cGeo = this.clouds(pal);
    this.layers = [
      { geo: mGeo, z: 0, follow: 0.55, meshes: [] },
      { geo: cGeo, z: 0, follow: 0.75, meshes: [] },
    ];
    for (const l of this.layers) {
      for (let k = 0; k < 3; k++) {
        const m = new THREE.Mesh(l.geo, flatMat);
        scene.add(m);
        l.meshes.push(m);
      }
    }
  }

  mountains(pal) {
    const parts = [];
    for (let i = 0; i < 26; i++) {
      const x = (i / 26) * TILE + hash1(i) * 25;
      const h = 30 + hash1(i + 50) * 55;
      const r = 45 + hash1(i + 90) * 45;
      const z = -320 - hash1(i + 20) * 140;
      const y0 = -25;
      parts.push(part('cone7', pal.mountain[i % pal.mountain.length], { x, y: y0 + h / 2, z, sx: r, sz: r * 0.7, sy: h, ry: hash1(i + 3) * 3 }, 0.12));
      if (h > 70) parts.push(part('cone7', '#f4efe6', { x, y: y0 + h * 0.875, z: z + 0.5, sx: r * 0.26, sz: r * 0.19, sy: h * 0.25, ry: hash1(i + 3) * 3 }));
    }
    return merge(parts);
  }

  clouds(pal) {
    const parts = [];
    for (let i = 0; i < 9; i++) {
      const x = (i / 9) * TILE + hash1(i + 7) * 60;
      const y = 45 + hash1(i + 17) * 90;
      const z = -140 - hash1(i + 27) * 60;
      const s = 5 + hash1(i + 37) * 6;
      for (let j = 0; j < 4; j++) {
        parts.push(part('ico', pal.cloud, { x: x + (j - 1.5) * s * 0.9, y: y + (j % 2) * s * 0.3, z, s: s * (0.7 + hash1(i * 4 + j) * 0.5), sy: s * 0.55 }, 0.05));
      }
    }
    return merge(parts);
  }

  update(camX, camY) {
    for (const l of this.layers) {
      const rel = camX * (1 - l.follow);
      const offset = (((-rel) % TILE) + TILE) % TILE;
      l.meshes.forEach((m, k) => {
        m.position.x = camX + offset + (k - 1.5) * TILE;
        m.position.y = camY * (l.follow * 0.6);
      });
    }
  }
}
