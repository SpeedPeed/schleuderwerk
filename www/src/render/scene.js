import * as THREE from 'three';
import { RENDER, CAMERA } from '../data/balance.js';

// Renderer, Szene, Licht und Kamera.
export function createView(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, RENDER.maxPixelRatio));
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

  function applyPalette(p) {
    scene.fog.color.set(p.fog);
    hemi.color.set(p.hemiSky);
    hemi.groundColor.set(p.hemiGround);
    sun.color.set(p.sun);
    document.getElementById('sky').style.background = `linear-gradient(to bottom, ${p.skyTop} 0%, ${p.skyBottom} 75%, ${p.fog} 100%)`;
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

  function setShadows(on) {
    renderer.shadowMap.enabled = on;
    sun.castShadow = on;
    scene.traverse((o) => { if (o.material) o.material.needsUpdate = true; });
  }

  return { renderer, scene, camera, hemi, sun, resize, applyPalette, followSun, setFog, setShadows };
}
