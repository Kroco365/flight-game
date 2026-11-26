// Meridian Run — flight model.
// An arcade model for a single-engine mail plane: throttle sets the speed the
// engine wants, pitch trades speed for height, banking turns the nose and
// costs speed, and below stall speed the wing stops flying and the plane sinks.

export const STALL_SPEED = 55; // knots — below this the controls go mushy
export const MAX_SPEED = 150; // knots at full throttle, level flight
export const MIN_SPEED = 35; // knots, the slowest the airframe will sink at
export const KNOT_TO_MS = 0.514444; // metres per second in one knot
export const GRAVITY = 9.81;
export const RUNWAY_HEADING = Math.PI / 2; // 090 degrees, due east

// A fresh aeroplane, sitting on the home runway near its western threshold,
// engine idling. The runway runs east-west, 320 metres long, so x=-140 puts
// the wheels on the strip with 300 metres of it ahead.
export function createPlane() {
  return {
    x: -140, // metres east of the home island centre (west end of the runway)
    z: 0, // metres north of the home island centre
    alt: 2, // metres above sea level
    heading: Math.PI / 2, // radians, 0 = north (+z), PI/2 = east (+x), runway 090
    pitch: 0, // radians, positive = nose up
    bank: 0, // radians, positive = right wing down
    speed: 0, // knots
    throttle: 0, // 0..1
    fuel: 100, // percent
    damage: 0, // percent
    vspeed: 0, // metres per second, positive = climbing
    grounded: true,
    flaring: false,
  };
}

// How much authority the pilot has over the surfaces right now. Near stall
// the stick gets heavy and the plane answers slowly.
export function controlAuthority(plane) {
  if (plane.speed >= STALL_SPEED) return 1;
  const ratio = plane.speed / STALL_SPEED;
  return 0.25 + 0.75 * ratio * ratio;
}

// One simulation step. `stick` carries -1..1 pitch and bank requests plus
// throttle keys; `wind` is a sideways push in knots. Returns nothing, the
// plane object is updated in place.
export function stepFlight(plane, stick, wind, dt) {
  const authority = controlAuthority(plane);

  // Throttle lever: Shift feeds it, Ctrl pulls it back, + / - nudge it.
  if (stick.throttleUp) plane.throttle = Math.min(1, plane.throttle + 0.45 * dt);
  if (stick.throttleDown) plane.throttle = Math.max(0, plane.throttle - 0.6 * dt);
  if (stick.throttleNudge !== 0) {
    plane.throttle = Math.max(0, Math.min(1, plane.throttle + stick.throttleNudge));
  }

  // Pitch and bank ease towards what the stick asks for.
  const targetPitch = stick.pitch * 0.26 * authority;
  const targetBank = stick.bank * 0.61 * authority;
  plane.pitch += (targetPitch - plane.pitch) * Math.min(1, 2.2 * dt);
  plane.bank += (targetBank - plane.bank) * Math.min(1, 2.6 * dt);

  // The engine wants a speed for this throttle; climbing and banking steal
  // from it, descending gives some back.
  let targetSpeed = 30 + plane.throttle * (MAX_SPEED - 30);
  targetSpeed -= Math.sin(plane.pitch) * 55;
  targetSpeed -= Math.abs(Math.sin(plane.bank)) * 22;
  if (plane.flaring) targetSpeed -= 18;
  targetSpeed = Math.max(MIN_SPEED, targetSpeed);
  const accel = plane.speed < targetSpeed ? 7 : 11;
  plane.speed += (targetSpeed - plane.speed) * Math.min(1, accel * dt / 60);

  // Turning: a banked wing pulls the nose around, faster when slow.
  const turnRate = (GRAVITY * Math.tan(plane.bank)) / Math.max(18, plane.speed * KNOT_TO_MS);
  plane.heading += turnRate * dt;

  // Vertical speed comes from pitch and speed; below stall the wing quits
  // and the plane sinks no matter what the nose is doing.
  let climb = Math.sin(plane.pitch) * plane.speed * KNOT_TO_MS;
  if (plane.speed < STALL_SPEED) {
    const shortfall = STALL_SPEED - plane.speed;
    climb -= shortfall * 0.35;
  }
  if (plane.flaring && plane.alt < 25) climb = Math.max(climb, -0.8);
  plane.vspeed += (climb - plane.vspeed) * Math.min(1, 3 * dt);

  // Move through the world, with the wind shoving the whole airframe sideways.
  const forward = plane.speed * KNOT_TO_MS * dt;
  const windPush = wind * KNOT_TO_MS * dt;
  plane.x += Math.sin(plane.heading) * forward + windPush;
  plane.z += Math.cos(plane.heading) * forward;
  plane.alt += plane.vspeed * dt;
  if (plane.alt < 0) plane.alt = 0;

  // Fuel burns with the throttle, faster the harder the engine works.
  plane.fuel = Math.max(0, plane.fuel - (0.10 + plane.throttle * 0.22) * dt);
  if (plane.fuel <= 0 && plane.throttle > 0.12) plane.throttle = 0.12;

  // On the ground the aeroplane rolls straight and the stick does nothing.
  if (plane.grounded) {
    plane.pitch = 0;
    plane.bank = 0;
    plane.vspeed = 0;
  }
}

// True when the wing has stopped flying: the stall warning condition.
export function isStalled(plane) {
  return plane.speed < STALL_SPEED && !plane.grounded;
}

// Distance in three dimensions between the plane and a point in the world.
export function distanceTo(plane, point) {
  const dx = plane.x - point.x;
  const dy = plane.alt - point.alt;
  const dz = plane.z - point.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}
