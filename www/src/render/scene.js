import * as THREE from 'three';
import { RENDER, CAMERA, FX } from '../data/balance.js';

// Renderer, Szene, Licht und Kamera.
export function createView(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, RENDER.maxPixelRatio));
  let quality = RENDER.defaultQuality;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog('#ffffff', RENDER.fogNear, RENDER.fogFar);
  const camera = new THREE.PerspectiveCamera(CAMERA.fovDeg, 1, CAMERA.near, CAMERA.far);

  const hemi = new THREE.HemisphereLight('#ffffff', '#444444', RENDER.hemiIntensity);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight('#ffffff', RENDER.sunIntensity);
  sun.castShadow = true;
  sun.shadow.mapSize.set(RENDER.shadowMapSize, RENDER.shadowMapSize);
  const sc = sun.shadow.camera;
  const half = RENDER.shadowHalf;
  sc.left = -half; sc.right = half; sc.top = half; sc.bottom = -half;
  sc.near = RENDER.shadowNear; sc.far = RENDER.shadowFar;
  sun.shadow.bias = RENDER.shadowBias;
  sun.shadow.normalBias = RENDER.shadowNormalBias;
  scene.add(sun, sun.target);

  function resize() {
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);
  resize();

  const skyEl = document.getElementById('sky');
  let flashK = -1;
  function applyPalette(p) {
    scene.fog.color.set(p.fog);
    hemi.color.set(p.hemiSky);
    hemi.groundColor.set(p.hemiGround);
    sun.color.set(p.sun);
    skyEl.style.background = `linear-gradient(to bottom, ${p.skyTop} 0%, ${p.skyBottom} 75%, ${p.fog} 100%)`;
    flash(0);
  }

  // Blitz-Aufleuchten: k = 0 … 1 (Licht und Himmel heller)
  function flash(k) {
    k = Math.max(0, Math.min(1, k));
    if (Math.abs(k - flashK) < 0.01) return;
    flashK = k;
    hemi.intensity = RENDER.hemiIntensity * (1 + k * (FX.flash.hemiMul - 1));
    sun.intensity = RENDER.sunIntensity * (1 + k * 0.5);
    skyEl.style.filter = k > 0.01 ? `brightness(${1 + k * 1.4}) saturate(${1 - k * 0.5})` : '';
  }

  // Sonne und Schatten folgen dem Auto (Render-Koordinaten, also schon relativ zum Ursprung)
  function followSun(x, y) {
    const o = RENDER.sunOffset;
    sun.position.set(x + o.x, y + o.y, o.z);
    sun.target.position.set(x, y, 0);
  }

  // Nebel abhängig vom Kamera-Abstand
  function setFog(dist) {
    scene.fog.near = dist + RENDER.fogNear;
    scene.fog.far = dist + RENDER.fogFar;
  }

  // Grafikqualität 'low' | 'mid' | 'high' → Pixel-Ratio (nie mehr als das Gerät hat)
  function setQuality(q) {
    const max = RENDER.pixelRatio[q] ?? RENDER.maxPixelRatio;
    const pr = Math.min(window.devicePixelRatio || 1, max);
    quality = q;
    if (Math.abs(renderer.getPixelRatio() - pr) < 1e-3) return;
    renderer.setPixelRatio(pr);
    resize();
  }

  function setShadows(on) {
    if (renderer.shadowMap.enabled === on && sun.castShadow === on) return;
    renderer.shadowMap.enabled = on;
    sun.castShadow = on;
    scene.traverse((o) => { if (o.material) o.material.needsUpdate = true; });
  }

  return { renderer, scene, camera, hemi, sun, resize, applyPalette, followSun, setFog, setShadows, setQuality, flash, get quality() { return quality; } };
}
