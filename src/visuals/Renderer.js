import * as THREE from 'three';
import { createSkyDome } from './textures.js';

/** WebGL renderer, scene, camera and stadium lighting. Visual only. */
export class Renderer {
  constructor(canvas, config) {
    this.config = config;
    const g = config.graphics;
    const r = new THREE.WebGLRenderer({ canvas, antialias: g.antialias, powerPreference: 'high-performance' });
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, g.maxPixelRatio));
    r.setSize(window.innerWidth, window.innerHeight, false);
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.0;
    r.shadowMap.enabled = g.shadows;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer = r;

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0x0b1828, 140, 420);
    this.camera = new THREE.PerspectiveCamera(config.camera.fov, window.innerWidth / window.innerHeight, config.camera.near, config.camera.far);
    this.camera.position.set(0, 14, 45);
    this.sky = createSkyDome();
    this.scene.add(this.sky);

    this.scene.add(new THREE.HemisphereLight(0xc9dcff, 0x26341f, 0.9));
    const sun = new THREE.DirectionalLight(0xfff4e6, 2.4);
    sun.position.set(14, 60, 22);
    sun.target.position.set(0, 0, 0);
    sun.castShadow = g.shadows;
    sun.shadow.mapSize.set(g.shadowMapSize, g.shadowMapSize);
    const sc = sun.shadow.camera;
    sc.left = -48; sc.right = 48; sc.top = 64; sc.bottom = -64; sc.near = 10; sc.far = 140;
    sun.shadow.bias = -0.0005;
    sun.shadow.normalBias = 0.03;
    this.scene.add(sun, sun.target);
    this.sun = sun;
    const fill = new THREE.DirectionalLight(0x9fc4ff, 0.5);
    fill.position.set(-30, 25, -40);
    this.scene.add(fill);

    this._onResize = () => this.resize();
    window.addEventListener('resize', this._onResize);
  }

  get pixelHeight() {
    return this.renderer.domElement.height;
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
  }

  setShadows(on) {
    this.renderer.shadowMap.enabled = on;
    this.sun.castShadow = on;
    this.scene.traverse((o) => {
      if (!o.material) return;
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) m.needsUpdate = true;
    });
  }

  render() {
    this.sky.position.copy(this.camera.position);
    this.renderer.render(this.scene, this.camera);
  }
}
