import * as THREE from 'three';
import { FX } from '../config/balance.js';

// Renderer, Szene, Licht und Kamera.
export function createView(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, FX.maxPixelRatio));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog('#ffffff', 150, 700);
  const camera = new THREE.PerspectiveCamera(45, 1, 0.5, 2500);

  const hemi = new THREE.HemisphereLight('#ffffff', '#444444', 1.6);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight('#ffffff', 2.4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  const sc = sun.shadow.camera;
  sc.left = -28; sc.right = 28; sc.top = 28; sc.bottom = -28; sc.near = 1; sc.far = 160;
  sun.shadow.bias = -0.0008;
  sun.shadow.normalBias = 0.05;
  scene.add(sun, sun.target);

  function resize() {
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);
  resize();

  function applyPalette(p) {
    scene.fog.color.set(p.fog);
    hemi.color.set(p.hemiSky);
    hemi.groundColor.set(p.hemiGround);
    sun.color.set(p.sun);
    document.getElementById('sky').style.background = `linear-gradient(to bottom, ${p.skyTop} 0%, ${p.skyBottom} 75%, ${p.fog} 100%)`;
  }

  // Sonne und Schatten folgen dem Auto
  function followSun(x, y) {
    sun.position.set(x + 25, y + 45, 35);
    sun.target.position.set(x, y, 0);
  }

  function setShadows(on) {
    renderer.shadowMap.enabled = on;
    sun.castShadow = on;
    scene.traverse((o) => { if (o.material) o.material.needsUpdate = true; });
  }

  return { renderer, scene, camera, hemi, sun, resize, applyPalette, followSun, setShadows };
}
