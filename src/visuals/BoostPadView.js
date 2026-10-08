import * as THREE from 'three';

/** Boost pads: glowing discs; big pads get a floating orb. Dim while respawning. */
export class BoostPadView {
  constructor(pads, parent) {
    this.group = new THREE.Group();
    this.group.name = 'boost-pads';
    const bigGeo = new THREE.CylinderGeometry(1.25, 1.35, 0.08, 32);
    const smallGeo = new THREE.CylinderGeometry(0.6, 0.66, 0.06, 24);
    const orbGeo = new THREE.SphereGeometry(0.42, 24, 16);
    const orbMat = new THREE.MeshStandardMaterial({ color: 0xffd65a, emissive: 0xffb81f, emissiveIntensity: 1.8, roughness: 0.3 });
    this.items = pads.map((pad) => {
      const mat = new THREE.MeshStandardMaterial({ color: 0x2a2410, emissive: 0xffc531, emissiveIntensity: 0.9, roughness: 0.5 });
      const base = new THREE.Mesh(pad.big ? bigGeo : smallGeo, mat);
      base.position.set(pad.x, 0.04, pad.z);
      base.receiveShadow = true;
      this.group.add(base);
      let orb = null;
      if (pad.big) {
        orb = new THREE.Mesh(orbGeo, orbMat);
        orb.position.set(pad.x, 1, pad.z);
        this.group.add(orb);
      }
      return { pad, mat, orb };
    });
    parent.add(this.group);
  }

  update(time) {
    for (const it of this.items) {
      const active = it.pad.active;
      it.mat.emissiveIntensity = active ? 0.9 + 0.25 * Math.sin(time * 4 + it.pad.index) : 0.06;
      if (it.orb) {
        it.orb.visible = active;
        it.orb.position.y = 1 + 0.12 * Math.sin(time * 2 + it.pad.index);
      }
    }
  }
}
