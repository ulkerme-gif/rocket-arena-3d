import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
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
    r.setClearColor(new THREE.Color(g.fogColor), 1);
    this.renderer = r;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(g.skyTopColor);
    this.scene.fog = new THREE.Fog(g.fogColor, 80, 420);
    this.camera = new THREE.PerspectiveCamera(config.camera.fov, window.innerWidth / window.innerHeight, config.camera.near, config.camera.far);
    this.camera.position.set(0, 14, 45);
    this.sky = createSkyDome(g.skyTopColor, g.skyHorizonColor, g.skyGlowColor);
    this.scene.add(this.sky);

    const hemi = new THREE.HemisphereLight(0xdfeeff, 0x1f3123, g.ambientIntensity);
    const sun = new THREE.DirectionalLight(0xfff4dc, g.sunIntensity);
    sun.position.set(14, 60, 22);
    sun.target.position.set(0, 0, 0);
    sun.castShadow = g.shadows;
    sun.shadow.mapSize.set(g.shadowMapSize, g.shadowMapSize);
    const sc = sun.shadow.camera;
    sc.left = -48; sc.right = 48; sc.top = 64; sc.bottom = -64; sc.near = 10; sc.far = 140;
    sun.shadow.bias = -0.0005;
    sun.shadow.normalBias = 0.03;
    const fill = new THREE.DirectionalLight(0x82b4ff, g.rimIntensity);
    fill.position.set(-30, 25, -40);
    this.scene.add(hemi, sun, sun.target, fill);
    this.sun = sun;

    const glowRing = new THREE.Mesh(
      new THREE.CircleGeometry(160, 64),
      new THREE.MeshBasicMaterial({ color: 0x163860, transparent: true, opacity: 0.12, side: THREE.DoubleSide }),
    );
    glowRing.rotation.x = -Math.PI / 2;
    glowRing.position.y = 0.15;
    this.scene.add(glowRing);
    this.groundGlow = glowRing;

    this.composer = new EffectComposer(r);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    if (g.bloom) {
      this.bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), g.bloomStrength, g.bloomRadius, g.bloomThreshold);
      this.bloomPass.enabled = true;
      this.composer.addPass(this.bloomPass);
    }

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
    if (this.composer) this.composer.setSize(w, h);
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
    if (this.composer) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
  }
}
