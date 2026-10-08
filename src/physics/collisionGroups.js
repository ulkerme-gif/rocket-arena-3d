/**
 * Rapier collision groups: 16-bit membership in the high half,
 * 16-bit filter in the low half.
 */
export const GROUP = { ARENA: 1, CAR: 2, BALL: 4 };

export function interactionGroups(membership, filter) {
  return (((membership & 0xffff) << 16) | (filter & 0xffff)) >>> 0;
}

export const GROUPS = {
  arena: interactionGroups(GROUP.ARENA, GROUP.CAR | GROUP.BALL),
  car: interactionGroups(GROUP.CAR, GROUP.ARENA | GROUP.CAR | GROUP.BALL),
  ball: interactionGroups(GROUP.BALL, GROUP.ARENA | GROUP.CAR),
  // Scene queries (wheel rays, probes) that should only see the arena.
  arenaQuery: interactionGroups(GROUP.CAR, GROUP.ARENA),
};
