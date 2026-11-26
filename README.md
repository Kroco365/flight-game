# Meridian Run

[![make.fun bounty](https://make.fun/badge/best-flight-game-20261126-0057.svg)](https://make.fun/bounty/best-flight-game-20261126-0057)
[![make.fun rank](https://make.fun/badge/best-flight-game-20261126-0057/Kroco365/flight-game/rank.svg)](https://make.fun/bounty/best-flight-game-20261126-0057)
[![make.fun reward](https://make.fun/badge/best-flight-game-20261126-0057/Kroco365/flight-game/reward.svg)](https://make.fun/bounty/best-flight-game-20261126-0057)

**Meridian Run** is an original 2D flight game: you are a courier pilot flying a single-engine mail plane across the Meridian Archipelago. Thread golden target rings along the mail routes, mind your fuel and your airspeed, then bring her home and land on runway 09. Every line of code, every pixel of art and every sound in it was made for this entry — nothing is copied from another game.

Entry for the make.fun bounty [Make the best flight game](https://make.fun/bounty/best-flight-game-20261126-0057).

## Play it

Serve `game/` with any static server and open `index.html` in a desktop browser:

```sh
node serve.ts
# then open http://localhost:8080
```

No build step, no network requests, no libraries — plain static files and a canvas.

## The game

- **Flight model** — speed follows throttle and pitch; banking turns the plane and bleeds speed; climbing bleeds speed; below the 55-knot stall speed the plane sinks and the controls go mushy; fuel burns with the throttle; a hard touchdown, a ditching in the sea or a hillside strike ends the sortie.
- **Three sorties** — *First Light* (5 rings, then land), *Storm Mail* (6 rings against a gusty crosswind, on a 4-minute clock), *Night Courier* (dusk palette, 5 tighter rings, landing scored on speed and centreline).
- **Scoring** — +100 per ring, a time bonus on timed sorties, up to +500 for landing quality, damage subtracted.
- **World** — a seeded procedural archipelago: five islands, a home runway on heading 090, drifting parallax clouds, sun glitter on the sea.
- **HUD** — airspeed and altimeter dials, a heading compass tape, throttle, fuel and damage bars, objective and timer, score, and centre messages (`RING 3/5`, `FLARE!`, `TOO LOW`, `STALL`).
- **Sound** — WebAudio only, generated in code: an engine hum that follows the throttle, a two-note ring chime, a touchdown thud, a stall warning beep. Audio starts after a user gesture; `M` mutes.

## Controls

| Key | Action |
| --- | --- |
| Left / Right or A / D | Bank and turn |
| Up / Down or W / S | Pitch climb / descend |
| Shift / Ctrl | Throttle up / down (`+` / `-` nudge) |
| Space | Flare / airbrake on final approach |
| P | Pause |
| M | Mute |
| R | Restart the sortie |
| Mouse | Click the menu buttons |

## Screenshots

Deterministic scenes are available through a `?shot=` parameter (each sets a fixed seed and plane state, so the render repeats):

- `?shot=flight` — cruising with rings ahead
- `?shot=approach` — final approach, runway ahead
- `?shot=rings` — close to a ring
- `?shot=landing` — touchdown moment

The four screenshots in `screenshots/` were taken from these scenes in a headless browser.

## Files

- `game/index.html` — opens the game, loads the scripts
- `game/css/style.css` — page and canvas styling
- `game/js/main.js` — boot, game loop, state machine, `?shot=` scenes
- `game/js/physics.js` — the flight model
- `game/js/terrain.js` — seeded islands, sea, runway, rings, clouds, sun
- `game/js/render.js` — chase-view renderer, plane sprite, HUD, screens
- `game/js/audio.js` — WebAudio sounds
- `game/js/missions.js` — the three sorties, objectives, scoring
- `game/js/input.js` — keyboard and mouse
- `main.ts` — hands the game in: copies `game/` and `screenshots/` to `/output` and writes `dossier.json`
- `serve.ts` — tiny static server for local play-testing

## License

MIT — see [LICENSE](LICENSE).
