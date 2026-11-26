// Meridian Run — the sorties.
// Three mail runs across the archipelago, flown in order. Each one has a
// briefing, a string of golden rings to thread, and a landing back on the
// home runway. Scoring rewards rings, quick flying and a gentle touchdown,
// and takes points away for bending the aeroplane.

import { buildRings } from './terrain.js';

export const RING_POINTS = 100;
export const MAX_LANDING_POINTS = 500;
export const RING_BONUS_MESSAGE = 'RING'; // prefix shown on the centre banner

// The three sorties, in the order the pilot flies them.
export const MISSIONS = [
  {
    id: 'first-light',
    name: 'First Light',
    number: 1,
    palette: 'day',
    seed: 7,
    timeLimit: 0, // no clock on the first run — learn the aeroplane
    wind: 0, // knots of sideways push
    fuelStart: 100,
    briefing:
      'Morning mail run, pilot. Thread the five golden rings in order, ' +
      'then bring her home and land on runway 09. Gentle on the throttle, ' +
      'gentler on the touchdown.',
    waypoints: [
      { x: 120, z: 900, alt: 300 },
      { x: 420, z: 1700, alt: 320 },
      { x: -260, z: 2600, alt: 280 },
      { x: 500, z: 3600, alt: 330 },
      { x: -120, z: 4700, alt: 300 },
    ],
  },
  {
    id: 'storm-mail',
    name: 'Storm Mail',
    number: 2,
    palette: 'storm',
    seed: 21,
    timeLimit: 240, // seconds — the mail must be in before the front hits
    wind: 14, // knots of crosswind shoving the plane sideways
    fuelStart: 100,
    briefing:
      'A front is coming in and the mail cannot wait. Six rings, a stiff ' +
      'crosswind pushing you sideways, and 4 minutes on the clock. Land ' +
      'before the time runs out or the sortie is lost.',
    waypoints: [
      { x: 200, z: 800, alt: 310 },
      { x: -320, z: 1600, alt: 280 },
      { x: 560, z: 2400, alt: 340 },
      { x: -480, z: 3300, alt: 290 },
      { x: 300, z: 4200, alt: 320 },
      { x: -80, z: 5100, alt: 300 },
    ],
  },
  {
    id: 'night-courier',
    name: 'Night Courier',
    number: 3,
    palette: 'dusk',
    seed: 33,
    timeLimit: 300,
    wind: 6,
    fuelStart: 100,
    briefing:
      'Last run of the day, flown into the dusk. Five tighter rings, then a ' +
      'landing scored on your touchdown speed and how close you hold the ' +
      'centreline. Slow her down, flare late, and keep her straight.',
    waypoints: [
      { x: 160, z: 1000, alt: 260, radius: 32 },
      { x: -300, z: 1900, alt: 240, radius: 32 },
      { x: 440, z: 2800, alt: 270, radius: 32 },
      { x: -360, z: 3700, alt: 250, radius: 32 },
      { x: 100, z: 4600, alt: 260, radius: 32 },
    ],
  },
];

// A live sortie: the mission definition plus its rings, clock and score.
export function startMission(definition, world) {
  return {
    definition,
    rings: buildRings(world, definition.waypoints),
    ringIndex: 0,
    elapsed: 0,
    ringScore: 0,
    timeBonus: 0,
    landingScore: 0,
    landed: false,
    failed: false,
    failReason: '',
    message: '',
    messageTimer: 0,
  };
}

// The next ring the pilot must fly through, or null when all are done.
export function nextRing(mission) {
  return mission.ringIndex < mission.rings.length ? mission.rings[mission.ringIndex] : null;
}

// True when every ring is threaded and only the landing is left.
export function ringsComplete(mission) {
  return mission.ringIndex >= mission.rings.length;
}

// Check the plane against the next ring; call once per frame.
export function checkRing(mission, plane, distance) {
  const ring = nextRing(mission);
  if (!ring) return false;
  if (distance < ring.radius + 12) {
    ring.passed = true;
    mission.ringIndex += 1;
    mission.ringScore += RING_POINTS;
    mission.message = `RING ${mission.ringIndex}/${mission.rings.length}`;
    mission.messageTimer = 1.6;
    return true;
  }
  return false;
}

// Score a touchdown. A gentle sink rate, a speed near 65 knots and a
// centreline landing earn up to MAX_LANDING_POINTS; a hard arrival earns
// little and bends the airframe.
export function scoreLanding(mission, plane, vspeed, centreOffset) {
  const sink = Math.abs(vspeed);
  const speedError = Math.abs(plane.speed - 65) / 30;
  const centreError = Math.min(1, Math.abs(centreOffset) / 13);
  const sinkScore = Math.max(0, 1 - sink / 7);
  const speedScore = Math.max(0, 1 - speedError);
  const centreScore = Math.max(0, 1 - centreError);
  const quality = sinkScore * 0.5 + speedScore * 0.3 + centreScore * 0.2;
  mission.landingScore = Math.round(MAX_LANDING_POINTS * quality);
  mission.landed = true;
  return mission.landingScore;
}

// Time bonus for a timed sortie: a point a second left on the clock.
export function timeBonusFor(mission) {
  const limit = mission.definition.timeLimit;
  if (!limit) return 0;
  const left = Math.max(0, limit - mission.elapsed);
  return Math.round(left);
}

// The sortie's total: rings, landing, time bonus, minus damage.
export function missionTotal(mission, damage) {
  return Math.max(
    0,
    mission.ringScore + mission.landingScore + timeBonusFor(mission) - Math.round(damage),
  );
}

// A short line describing how the landing went, for the debrief screen.
export function landingVerdict(mission) {
  const score = mission.landingScore;
  if (score >= 420) return 'A greaser — the mail never felt a thing.';
  if (score >= 300) return 'A tidy touchdown, well held on the centreline.';
  if (score >= 150) return 'Down in one piece, but the old girl felt that one.';
  return 'A firm arrival — the ground crew is already checking the gear.';
}
