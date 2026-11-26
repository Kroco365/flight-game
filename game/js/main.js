// Meridian Run — boot, game loop and state machine.
// States: menu, howto, briefing, flying, paused, debrief, crashed, complete.
// A ?shot= parameter (flight, approach, rings, landing) freezes one fixed
// scene for a repeatable screenshot instead of starting the game.

import { createPlane, stepFlight, isStalled, distanceTo, RUNWAY_HEADING } from './physics.js';
import { buildWorld, groundHeightAt, overRunway, overLand, PALETTES } from './terrain.js';
import {
  MISSIONS, startMission, nextRing, ringsComplete, checkRing,
  scoreLanding, timeBonusFor, missionTotal,
} from './missions.js';
import { SoundEngine } from './audio.js';
import { Input, hitButton } from './input.js';
import {
  drawWorld, drawHUD, drawMenu, drawHowTo, drawBriefing,
  drawDebrief, drawCrashed, drawGameComplete, drawPaused,
} from './render.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const statusLine = document.getElementById('status');
const input = new Input(canvas);
const sound = new SoundEngine();

// The one shared game object the renderer reads.
const game = {
  state: 'menu',
  plane: createPlane(),
  world: buildWorld(MISSIONS[0].seed),
  mission: null,
  palette: PALETTES.day,
  missionIndex: 0,
  totalScore: 0,
  elapsed: 0, // seconds since the game (or the shot scene) began
  time: 0, // wall-clock seconds for glitter and cloud shimmer
  stallWarning: false,
  lowWarning: false,
  flarePrompt: false,
  buttons: [],
  hoverId: null,
  crashReason: '',
};

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');

// ---- Sortie flow ----

function beginMission(index) {
  const definition = MISSIONS[index];
  game.missionIndex = index;
  game.world = buildWorld(definition.seed);
  game.palette = PALETTES[definition.palette];
  game.mission = startMission(definition, game.world);
  game.plane = createPlane();
  game.plane.fuel = definition.fuelStart;
  game.state = 'briefing';
  game.buttons = [];
  announce(`Briefing: ${definition.name}. ${definition.briefing}`);
}

function launchSortie() {
  game.plane = createPlane();
  game.plane.fuel = game.mission.definition.fuelStart;
  game.state = 'flying';
  game.elapsed = 0;
  sound.ensure();
  announce(`${game.mission.definition.name}: fly through the rings, then land on runway 09.`);
}

function endSortieLanded(sinkAtTouch) {
  const mission = game.mission;
  mission.timeBonus = timeBonusFor(mission);
  const total = missionTotal(mission, mission.damageTaken ?? 0);
  game.totalScore += total;
  game.plane.grounded = true;
  sound.stopEngine();
  sound.touchdownThud(Math.abs(sinkAtTouch ?? 0) > 5);
  game.state = 'debrief';
  game.buttons = [];
  announce(`Sortie complete. Score ${total}. Campaign total ${game.totalScore}.`);
}

function endSortieCrashed(reason) {
  const mission = game.mission;
  if (mission) {
    mission.failed = true;
    mission.failReason = reason;
    mission.damageTaken = 100;
  }
  game.crashReason = reason;
  game.state = 'crashed';
  game.buttons = [];
  sound.crashSound();
  announce(`Sortie lost: ${reason}`);
}

function announce(text) {
  if (statusLine) statusLine.textContent = text;
}

// ---- Flying update ----

function updateFlying(dt) {
  const plane = game.plane;
  const mission = game.mission;
  const stick = input.stick();
  stick.throttleNudge = input.consumeThrottleNudge();
  plane.flaring = stick.flare && plane.alt < 60 && plane.alt > 0.5;

  // Lift-off: once the mail plane is fast enough and the pilot pulls back,
  // she leaves the runway.
  if (plane.grounded && plane.speed > 58 && stick.pitch > 0.2) {
    plane.grounded = false;
    plane.alt = 1;
  }

  const wind = mission.definition.wind;
  stepFlight(plane, stick, wind, dt);
  mission.elapsed += dt;
  game.elapsed += dt;

  // Engine sound follows the throttle; stall beeps near the stall.
  sound.setEngine(plane.throttle, plane.speed);
  game.stallWarning = isStalled(plane);
  if (game.stallWarning) sound.stallBeep(dt);
  game.lowWarning = !plane.grounded && plane.alt < 60 && plane.vspeed < -1;
  const ring = nextRing(mission);
  game.flarePrompt =
    ringsComplete(mission) && !plane.grounded && plane.alt < 70 && plane.alt > 2 && overRunway(game.world, plane.x, plane.z);

  // Rings: thread the next one in order.
  if (ring && distanceTo(plane, ring) < ring.radius + 12) {
    if (checkRing(mission, plane)) sound.ringChime();
  }
  if (mission.messageTimer > 0) mission.messageTimer -= dt;

  // The clock on timed sorties.
  if (mission.definition.timeLimit && mission.elapsed > mission.definition.timeLimit) {
    endSortieCrashed('Out of time — the mail never reached the islands.');
    return;
  }

  // Fuel out: the engine quits and the plane glides down.
  if (plane.fuel <= 0 && !plane.grounded) {
    game.lowWarning = true;
  }

  // Touching the ground: runway, hillside or sea — each reads differently.
  const ground = groundHeightAt(game.world, plane.x, plane.z);
  if (!plane.grounded && plane.alt <= ground + 0.4) {
    plane.alt = ground;
    if (overRunway(game.world, plane.x, plane.z)) {
      handleRunwayTouch();
    } else if (overLand(game.world, plane.x, plane.z)) {
      plane.damage = 100;
      endSortieCrashed('Struck the hillside — the islands are not runways.');
    } else {
      plane.damage = 100;
      endSortieCrashed('Ditched in the sea — the mail is swimming now.');
    }
    return;
  }

  // A hard arrival on the runway bends the airframe even if it stays down.
  if (plane.grounded && plane.damage >= 100) {
    endSortieCrashed('The landing broke the aeroplane.');
  }
}

function handleRunwayTouch() {
  const plane = game.plane;
  const mission = game.mission;
  const sink = Math.abs(plane.vspeed);

  if (!ringsComplete(mission)) {
    endSortieCrashed('Landed before the rings were done — the mail is still in the air.');
    return;
  }

  // Heading must be roughly runway heading, speed in the landing window.
  const headingError = Math.abs(((plane.heading - RUNWAY_HEADING) % (Math.PI * 2) + Math.PI * 3) % (Math.PI * 2) - Math.PI);
  if (headingError > 0.45 || plane.speed > 105) {
    plane.damage = 100;
    endSortieCrashed(headingError > 0.45 ? 'Came in across the runway and ran off the strip.' : 'Touched down far too fast and overran the runway.');
    return;
  }

  // Centreline offset: how far across the strip the wheels touched.
  const centreOffset = plane.z;
  if (sink > 12) {
    plane.damage = 100;
    endSortieCrashed('Slammed onto the runway — the gear gave way.');
    return;
  }
  if (sink > 7) {
    plane.damage = Math.min(100, plane.damage + 30);
    mission.damageTaken = (mission.damageTaken ?? 0) + 30;
  }
  // Capture the sink rate before the wheels stop the descent: the landing
  // score is judged on how gently the plane arrived.
  const sinkAtTouch = plane.vspeed;
  plane.grounded = true;
  plane.vspeed = 0;
  mission.damageTaken = mission.damageTaken ?? 0;
  scoreLanding(mission, plane, sinkAtTouch, centreOffset);
  endSortieLanded(sinkAtTouch);
}

// ---- Buttons ----
// Clicks arrive in canvas CSS pixels; button rectangles are in canvas pixels,
// so each click is scaled by the canvas's displayed size before testing.

function updateHover() {
  // input.mouse is in canvas CSS pixels; convert to canvas pixels.
  const rect = canvas.getBoundingClientRect();
  const px = (input.mouse.x / rect.width) * canvas.width;
  const py = (input.mouse.y / rect.height) * canvas.height;
  game.hoverId = null;
  for (const button of game.buttons) {
    if (px >= button.x && px <= button.x + button.w && py >= button.y && py <= button.y + button.h) {
      game.hoverId = button.id;
    }
  }
}

function handleClicks() {
  const rect = canvas.getBoundingClientRect();
  for (const click of input.takeClicks()) {
    const px = (click.x / rect.width) * canvas.width;
    const py = (click.y / rect.height) * canvas.height;
    for (const button of game.buttons) {
      if (hitButton({ x: px, y: py }, button)) {
        sound.ensure();
        pressButton(button.id);
        break;
      }
    }
  }
}

function pressButton(id) {
  if (id === 'start') beginMission(0);
  else if (id === 'howto') game.state = 'howto';
  else if (id === 'back') game.state = 'menu';
  else if (id === 'fly') launchSortie();
  else if (id === 'next') beginMission(game.missionIndex + 1);
  else if (id === 'finish') game.state = 'complete';
  else if (id === 'retry') beginMission(game.missionIndex);
  else if (id === 'again') {
    game.totalScore = 0;
    beginMission(0);
  } else if (id === 'menu') {
    game.state = 'menu';
    game.mission = null;
    game.world = buildWorld(MISSIONS[0].seed);
    game.palette = PALETTES.day;
    game.plane = createPlane();
    sound.stopEngine();
  } else if (id === 'resume') game.state = 'flying';
}

// ---- Screenshot scenes ----
// Each scene fixes the seed and the plane state so the render repeats
// exactly: the same frame every time the URL is opened.

function applyShot(name) {
  game.state = 'flying';
  game.elapsed = 42; // fixed, so clouds and glitter sit still
  game.time = 42;
  const definition = MISSIONS[0];
  game.world = buildWorld(definition.seed);
  game.palette = PALETTES[definition.palette];
  game.mission = startMission(definition, game.world);
  game.totalScore = 350;

  if (name === 'flight') {
    // Cruising north along the route: Turtle island ahead-left, the next
    // ring ahead-right, open sea below.
    game.plane = Object.assign(createPlane(), {
      x: 180, z: 1000, alt: 300, heading: 0.06, pitch: 0.02, bank: 0.08,
      speed: 102, throttle: 0.65, fuel: 78, damage: 0, grounded: false,
    });
    game.mission.ringIndex = 1;
    game.mission.rings[0].passed = true;
    game.mission.ringScore = 100;
  } else if (name === 'approach') {
    // On final for runway 09, 800 metres out and descending, offset
    // slightly south of the centreline so the strip reads beside the nose:
    // the home island and the runway sit ahead, the sea below.
    game.plane = Object.assign(createPlane(), {
      x: -800, z: 120, alt: 110, heading: RUNWAY_HEADING, pitch: -0.06, bank: 0,
      speed: 82, throttle: 0.45, fuel: 61, damage: 0, grounded: false, vspeed: -2.5,
    });
    game.mission.ringIndex = 5;
    for (const ring of game.mission.rings) ring.passed = true;
    game.mission.ringScore = 500;
    game.flarePrompt = true;
  } else if (name === 'rings') {
    game.plane = Object.assign(createPlane(), {
      x: 420, z: 1560, alt: 315, heading: 0.02, pitch: 0, bank: -0.1,
      speed: 96, throttle: 0.6, fuel: 84, damage: 0, grounded: false,
    });
    game.mission.ringIndex = 1;
    game.mission.rings[0].passed = true;
    game.mission.ringScore = 100;
    game.mission.message = 'RING 1/5';
    game.mission.messageTimer = 10;
  } else if (name === 'landing') {
    // Flaring over the threshold, twenty-five metres up: the runway strip
    // fans out below the nose, the whole home island around it.
    game.plane = Object.assign(createPlane(), {
      x: -260, z: 2, alt: 25, heading: RUNWAY_HEADING, pitch: -0.02, bank: 0,
      speed: 68, throttle: 0.18, fuel: 52, damage: 0, grounded: false,
      vspeed: -2.5, flaring: true,
    });
    game.mission.ringIndex = 5;
    for (const ring of game.mission.rings) ring.passed = true;
    game.mission.ringScore = 500;
    game.mission.message = 'FLARE!';
    game.mission.messageTimer = 10;
  } else {
    // Unknown shot name: fall back to the flight scene.
    applyShot('flight');
  }
}

// ---- Frame loop ----

function drawFrame() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (game.state === 'menu') {
    game.buttons = drawMenu(ctx, game.hoverId);
  } else if (game.state === 'howto') {
    game.buttons = drawHowTo(ctx, game.hoverId);
  } else if (game.state === 'briefing') {
    game.buttons = drawBriefing(ctx, game.mission.definition, game.hoverId);
  } else if (game.state === 'flying' || game.state === 'paused') {
    drawWorld(ctx, game, game.time);
    drawHUD(ctx, game);
    if (game.state === 'paused') game.buttons = drawPaused(ctx, game.hoverId);
  } else if (game.state === 'debrief') {
    drawWorld(ctx, game, game.time);
    drawHUD(ctx, game);
    game.buttons = drawDebrief(ctx, game.mission, game.totalScore, game.hoverId, game.missionIndex === MISSIONS.length - 1);
  } else if (game.state === 'crashed') {
    game.buttons = drawCrashed(ctx, game.crashReason, game.hoverId);
  } else if (game.state === 'complete') {
    game.buttons = drawGameComplete(ctx, game.totalScore, game.hoverId);
  }
}

let lastTimestamp = 0;

function frame(timestamp) {
  const dt = Math.min(0.05, Math.max(0.001, (timestamp - lastTimestamp) / 1000 || 0.016));
  lastTimestamp = timestamp;

  if (!shot) game.time += dt;

  // Global keys: pause, mute, restart, and Enter to advance screens.
  if (input.wasPressed('KeyP') && (game.state === 'flying' || game.state === 'paused')) {
    game.state = game.state === 'flying' ? 'paused' : 'flying';
    announce(game.state === 'paused' ? 'Paused.' : 'Resumed.');
  }
  if (input.wasPressed('KeyM')) {
    const muted = sound.toggleMute();
    announce(muted ? 'Sound muted.' : 'Sound on.');
  }
  if (input.wasPressed('KeyR') && game.mission && (game.state === 'flying' || game.state === 'paused' || game.state === 'crashed')) {
    beginMission(game.missionIndex);
  }
  if (input.wasPressed('Enter')) {
    if (game.state === 'menu') beginMission(0);
    else if (game.state === 'briefing') launchSortie();
  }
  if (input.wasPressed('KeyF') && game.state === 'flying') {
    // F is a spare flap key on some keyboards; treat it as a flare tap.
    game.plane.flaring = true;
  }

  updateHover();
  handleClicks();

  if (game.state === 'flying' && !shot) updateFlying(dt);
  drawFrame();
  input.endFrame();
  requestAnimationFrame(frame);
}

// Boot.
if (shot) {
  applyShot(shot);
} else {
  announce('Meridian Run: a mail-plane courier across the island chain. Press Enter or click Start.');
}
requestAnimationFrame(frame);
