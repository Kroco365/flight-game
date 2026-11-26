// Meridian Run — sound.
// Every sound is generated in code with the Web Audio API: an engine hum
// whose pitch and loudness follow the throttle, a two-note chime when a ring
// is threaded, a thud for the touchdown and a warning beep near the stall.
// Audio only starts after a user gesture; M mutes everything.

export class SoundEngine {
  constructor() {
    this.context = null;
    this.muted = false;
    this.engineOsc = null;
    this.engineGain = null;
    this.engineFilter = null;
    this.stallTimer = 0;
  }

  // Create the audio context on the first gesture (a click or a key press).
  // Browsers refuse to start audio before the player has interacted.
  ensure() {
    if (this.context) {
      if (this.context.state === 'suspended') void this.context.resume();
      return;
    }
    const AudioContext = window.AudioContext ?? window.webkitAudioContext;
    if (!AudioContext) return;
    this.context = new AudioContext();

    // The engine: a sawtooth hum through a low-pass filter, its pitch and
    // volume following the throttle lever.
    this.engineOsc = this.context.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 55;
    this.engineFilter = this.context.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.value = 320;
    this.engineGain = this.context.createGain();
    this.engineGain.gain.value = 0;
    this.engineOsc.connect(this.engineFilter);
    this.engineFilter.connect(this.engineGain);
    this.engineGain.connect(this.context.destination);
    this.engineOsc.start();
  }

  // Follow the throttle: faster hum and louder as the lever goes forward.
  setEngine(throttle, speed) {
    if (!this.context || !this.engineOsc) return;
    const now = this.context.currentTime;
    const target = this.muted ? 0 : 0.02 + throttle * 0.05;
    this.engineGain.gain.setTargetAtTime(target, now, 0.1);
    const pitch = 42 + throttle * 68 + Math.max(0, speed - 60) * 0.25;
    this.engineOsc.frequency.setTargetAtTime(pitch, now, 0.08);
    this.engineFilter.frequency.setTargetAtTime(220 + throttle * 620, now, 0.1);
  }

  // Silence the engine hum entirely (on crash or game over screens).
  stopEngine() {
    if (this.context && this.engineGain) {
      this.engineGain.gain.setTargetAtTime(0, this.context.currentTime, 0.05);
    }
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.muted) this.stopEngine();
    return this.muted;
  }

  // A short tone from one oscillator, fading out so it never clicks.
  // `when` delays the note, so a chime can stack two notes in time.
  tone(frequency, seconds, type, volume, when = 0) {
    if (!this.context || this.muted) return;
    const start = this.context.currentTime + when;
    const osc = this.context.createOscillator();
    const gain = this.context.createGain();
    osc.type = type;
    osc.frequency.value = frequency;
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(volume, start + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + seconds);
    osc.connect(gain);
    gain.connect(this.context.destination);
    osc.start(start);
    osc.stop(start + seconds + 0.05);
  }

  // Two-note chime for a ring: a bright fifth, high then higher.
  ringChime() {
    this.tone(880, 0.35, 'sine', 0.16);
    this.tone(1318.5, 0.5, 'sine', 0.14, 0.09);
  }

  // A low thud for the touchdown, built from a falling sine.
  touchdownThud(hard) {
    if (!this.context || this.muted) return;
    const start = this.context.currentTime;
    const osc = this.context.createOscillator();
    const gain = this.context.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(hard ? 110 : 85, start);
    osc.frequency.exponentialRampToValueAtTime(38, start + 0.18);
    gain.gain.setValueAtTime(hard ? 0.5 : 0.32, start);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.22);
    osc.connect(gain);
    gain.connect(this.context.destination);
    osc.start(start);
    osc.stop(start + 0.25);
  }

  // A short warning beep, at most once every half second, near the stall.
  stallBeep(dt) {
    this.stallTimer -= dt;
    if (this.stallTimer > 0) return;
    this.stallTimer = 0.5;
    this.tone(1240, 0.12, 'square', 0.05);
  }

  // A dull crunch for a crash, low and short.
  crashSound() {
    if (!this.context || this.muted) return;
    const start = this.context.currentTime;
    const osc = this.context.createOscillator();
    const gain = this.context.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(160, start);
    osc.frequency.exponentialRampToValueAtTime(30, start + 0.5);
    gain.gain.setValueAtTime(0.45, start);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.55);
    osc.connect(gain);
    gain.connect(this.context.destination);
    osc.start(start);
    osc.stop(start + 0.6);
    this.stopEngine();
  }
}
