import * as THREE from 'three';

const PALETTE = {
  blue: { body: 0x1f74e0, accent: 0x8fd0ff, trim: 0x0d2a52 },
  orange: { body: 0xf0661a, accent: 0xffc68f, trim: 0x5a2208 },
};

function profile(points) {
  const s = new THREE.Shape();
  points.forEach(([x, y], i) => (i ? s.lineTo(x, y) : s.moveTo(x, y)));
  s.closePath();
  return s;
}

/** Extrudes a side profile (x = towards the nose, y = up) across the car width. */
function extrudeProfile(shape, width, bevel) {
  const g = new THREE.ExtrudeGeometry(shape, { depth: width, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, steps: 1, curveSegments: 4 });
  g.translate(0, 0, -width / 2);
  g.rotateY(Math.PI / 2); // nose -> -Z (car forward), width -> X
  return g;
}

/**
 * Original low-poly "Rocket Arena" car. Reads the CarController state each
 * frame (interpolated transform, wheel suspension/steer/spin, boost) and
 * never writes back to physics.
 */
export class CarView {
  constructor(car, parent) {
    this.car = car;
    const pal = PALETTE[car.team] ?? PALETTE.blue;
    this.group = new THREE.Group();
    this.group.name = `car-${car.id}`;
    const bodyMat = new THREE.MeshStandardMaterial({ color: pal.body, metalness: 0.45, roughness: 0.32 });
    const trimMat = new THREE.MeshStandardMaterial({ color: pal.trim, metalness: 0.5, roughness: 0.45 });
    const glassMat = new THREE.MeshStandardMaterial({ color: 0x0c1622, metalness: 0.9, roughness: 0.15 });
    this.accentMat = new THREE.MeshStandardMaterial({ color: pal.accent, emissive: pal.accent, emissiveIntensity: 1.2 });
    const lightMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff2c8, emissiveIntensity: 2 });
    const tailMat = new THREE.MeshStandardMaterial({ color: 0xff2a3a, emissive: 0xff2a3a, emissiveIntensity: 1.6 });

    const body = new THREE.Mesh(extrudeProfile(profile([[-0.6, -0.12], [-0.62, 0.05], [-0.5, 0.1], [0.18, 0.085], [0.56, 0], [0.64, -0.05], [0.6, -0.12]]), 0.76, 0.03), bodyMat);
    const cabin = new THREE.Mesh(extrudeProfile(profile([[-0.34, 0.08], [-0.18, 0.25], [0.1, 0.26], [0.32, 0.075]]), 0.56, 0.02), glassMat);
    const box = (w, h, d, mat, x, y, z) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      m.position.set(x, y, z);
      return m;
    };
    this.group.add(body, cabin,
      box(0.86, 0.035, 0.16, trimMat, 0, 0.24, 0.52),
      box(0.035, 0.13, 0.06, trimMat, 0.28, 0.16, 0.52),
      box(0.035, 0.13, 0.06, trimMat, -0.28, 0.16, 0.52),
      box(0.04, 0.03, 0.92, this.accentMat, 0.405, -0.03, 0),
      box(0.04, 0.03, 0.92, this.accentMat, -0.405, -0.03, 0),
      box(0.16, 0.035, 0.02, lightMat, 0.24, -0.02, -0.66),
      box(0.16, 0.035, 0.02, lightMat, -0.24, -0.02, -0.66),
      box(0.2, 0.035, 0.02, tailMat, 0.27, 0.03, 0.645),
      box(0.2, 0.035, 0.02, tailMat, -0.27, 0.03, 0.645));
    const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.09, 0.08, 14).rotateX(Math.PI / 2), trimMat);
    nozzle.position.set(0, -0.03, 0.64);
    this.group.add(nozzle);
    body.castShadow = true;
    cabin.castShadow = true;

    const tireGeo = new THREE.CylinderGeometry(0.15, 0.15, 0.12, 20).rotateZ(Math.PI / 2);
    const rimGeo = new THREE.CylinderGeometry(0.095, 0.095, 0.125, 6).rotateZ(Math.PI / 2);
    const tireMat = new THREE.MeshStandardMaterial({ color: 0x15171b, roughness: 0.9 });
    const rimMat = new THREE.MeshStandardMaterial({ color: 0xc9d2dc, metalness: 0.8, roughness: 0.3 });
    this.wheels = car.wheels.map(() => {
      const steer = new THREE.Group();
      const spin = new THREE.Group();
      const tire = new THREE.Mesh(tireGeo, tireMat);
      tire.castShadow = true;
      spin.add(tire, new THREE.Mesh(rimGeo, rimMat));
      steer.add(spin);
      this.group.add(steer);
      return { steer, spin };
    });

    const flameOuter = new THREE.ConeGeometry(0.11, 0.75, 14, 1, true).rotateX(Math.PI / 2).translate(0, 0, 0.375);
    const flameInner = new THREE.ConeGeometry(0.06, 0.45, 12, 1, true).rotateX(Math.PI / 2).translate(0, 0, 0.225);
    const flameMat = (color, opacity) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    this.flame = new THREE.Group();
    this.flame.add(new THREE.Mesh(flameOuter, flameMat(0xff8a2a, 0.85)), new THREE.Mesh(flameInner, flameMat(0xfff1b0, 0.95)));
    this.flame.position.set(0, -0.03, 0.68);
    this.flame.visible = false;
    this.group.add(this.flame);

    this.nozzleLocal = new THREE.Vector3(0, -0.03, 0.72);
    this.renderPos = new THREE.Vector3();
    this.renderQuat = new THREE.Quaternion();
    parent.add(this.group);
  }

  update(alpha) {
    const car = this.car;
    car.getRenderTransform(alpha, this.renderPos, this.renderQuat);
    this.group.position.copy(this.renderPos);
    this.group.quaternion.copy(this.renderQuat);
    for (let i = 0; i < 4; i++) {
      const w = car.wheels[i], n = this.wheels[i];
      n.steer.position.set(w.local.x + w.side * 0.02, w.local.y - w.suspension, w.local.z);
      n.steer.rotation.y = -w.steer;
      n.spin.rotation.x = -w.spin;
    }
    const s = car.state;
    this.flame.visible = s.isBoosting;
    if (s.isBoosting) this.flame.scale.set(1, 1, (s.isSupersonic ? 1.45 : 1) * (0.8 + Math.random() * 0.4));
    this.accentMat.emissiveIntensity = s.isSupersonic ? 2.4 : 1.2;
  }

  nozzleWorld(out) {
    return out.copy(this.nozzleLocal).applyQuaternion(this.renderQuat).add(this.renderPos);
  }
}
