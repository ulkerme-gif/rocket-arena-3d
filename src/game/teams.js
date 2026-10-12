import { TEAM } from './constants.js';

/** Supported match formats: 1v1, 2v2, 3v3. */
export const TEAM_SIZES = Object.freeze([1, 2, 3]);

export function normalizeTeamSize(value) {
  const n = Number(value);
  return TEAM_SIZES.includes(n) ? n : 1;
}

export const formatLabel = (teamSize) => `${normalizeTeamSize(teamSize)}V${normalizeTeamSize(teamSize)}`;

/**
 * Every car on the field is a seat: blue-1..N and orange-1..N.
 * A seat is driven either by a human or by a bot; online, humans can take
 * over a bot seat mid-match and a bot takes over when a human leaves.
 */
export function seatList(teamSize) {
  const n = normalizeTeamSize(teamSize);
  const seats = [];
  for (const team of [TEAM.BLUE, TEAM.ORANGE]) {
    for (let i = 1; i <= n; i++) seats.push({ id: `${team}-${i}`, team });
  }
  return seats;
}
