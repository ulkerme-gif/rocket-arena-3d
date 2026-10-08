/**
 * Arena dimensions and layout. All values in meters.
 * Field runs along Z (goal to goal), width along X, +Y up.
 * The BLUE goal is at +Z, the ORANGE goal at -Z.
 */
export const ARENA = {
  width: 70,
  length: 100,
  height: 20,
  cornerRadius: 13,          // vertical rounded corners (plan view)
  floorFilletRadius: 5,      // curved floor-to-wall transition
  ceilingFilletRadius: 3,    // curved wall-to-ceiling transition
  goal: { width: 17.9, height: 6.43, depth: 8.8 },
  segments: {
    floorFillet: 10,
    ceilingFillet: 6,
    corner: 16,
    maxStraight: 4,          // max length of a straight wall segment
    maxWallRow: 5,
    goalGrid: 2.5,
  },
  // Boost pads in normalized RL layout coordinates (x / 4096, z / 5120).
  // They are scaled into the flat part of the floor at runtime.
  boostPadLayout: {
    big: [[-0.875, 0], [0.875, 0], [-0.75, -0.8], [0.75, -0.8], [-0.75, 0.8], [0.75, 0.8]],
    small: [
      [0, -0.828], [-0.4375, -0.817], [0.4375, -0.817], [-0.2295, -0.646], [0.2295, -0.646],
      [0, -0.55], [-0.875, -0.485], [0.875, -0.485], [-0.4365, -0.449], [0.4365, -0.449],
      [-0.5, -0.202], [0, -0.2], [0.5, -0.202], [-0.25, 0], [0.25, 0],
      [-0.5, 0.202], [0, 0.2], [0.5, 0.202], [-0.4365, 0.449], [0.4365, 0.449],
      [-0.875, 0.485], [0.875, 0.485], [0, 0.55], [-0.2295, 0.646], [0.2295, 0.646],
      [-0.4375, 0.817], [0.4375, 0.817], [0, 0.828],
    ],
  },
  // Kickoff spots for BLUE in RL-normalized coords (x / 4096, z / 5120).
  // Orange uses the point-mirrored spot.
  kickoffSpots: [[-0.5, 0.5], [0.5, 0.5], [-0.0625, 0.75], [0.0625, 0.75], [0, 0.88]],
  trainingSpawn: { x: 0, z: 12 },
};
