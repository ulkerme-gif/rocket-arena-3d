import * as THREE from 'three';
import { getBallTexture } from './textures.js';

export class BallView {
  constructor(radius, parent) {
    this.mesh = new THREE.Mesh(
      new THREE.SphereGeometry(radius, 48, 32),
      new THREE.MeshStandardMaterial({ map: getBallTexture(), roughness: 0.42, metalness: 0.05 }),
    );
    this.mesh.castShadow = true;
    this.mesh.name = 'ball';
    parent.add(this.mesh);
  }

  update(pos, quat, visible) {
    this.mesh.position.copy(pos);
    this.mesh.quaternion.copy(quat);
    this.mesh.visible = visible;
  }
}
