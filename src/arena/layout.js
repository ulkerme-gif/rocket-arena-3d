/**
 * Derives gameplay layout (boost pads, kickoff spawns) from the arena
 * dimensions so everything adapts when the arena config changes.
 */
export function buildLayout(arenaConfig, dims, padConfig) {
  const { a, b, Rf, Rc } = dims;
  // Scale RL-normalized coordinates into the flat part of the floor.
  const maxFx = 0.875, maxFz = 0.828;
  const flatX = a - Rf - 1.25, flatZ = b - Rf - 1.6;
  const toWorld = ([fx, fz]) => ({ x: (fx / maxFx) * flatX, z: (fz / maxFz) * flatZ });

  const boostPads = [];
  for (const p of arenaConfig.boostPadLayout.big) boostPads.push({ ...toWorld(p), big: true, radius: padConfig.big.radius });
  for (const p of arenaConfig.boostPadLayout.small) boostPads.push({ ...toWorld(p), big: false, radius: padConfig.small.radius });
  boostPads.forEach((p, i) => (p.index = i));

  const kickoffSpots = arenaConfig.kickoffSpots.map(([fx, fz]) => ({ x: fx * a * 0.97, z: fz * b * 0.97 }));
  const trainingSpawn = { ...arenaConfig.trainingSpawn };
  return { boostPads, kickoffSpots, trainingSpawn, floorFlat: { x: a - Rf, z: b - Rf, cornerRadius: Rc - Rf } };
}

/** Heading (rotation about +Y) that points a car's forward (-Z) from `from` towards `to`. */
export function headingTowards(from, to) {
  const dx = to.x - from.x, dz = to.z - from.z;
  // forward = (-sin(h), 0, -cos(h)) for rotation h about +Y
  return Math.atan2(-dx, -dz);
}

export function yawQuaternion(heading) {
  return { x: 0, y: Math.sin(heading / 2), z: 0, w: Math.cos(heading / 2) };
}
