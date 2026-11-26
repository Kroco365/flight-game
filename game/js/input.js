// Meridian Run — input.
// Keyboard for the stick and throttle, mouse for the menu buttons. Keys are
// tracked as a held set plus one-frame "just pressed" edges, so a tap on P
// pauses once instead of toggling every frame it is held.

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.held = new Set();
    this.pressed = new Set();
    this.clicks = [];
    this.mouse = { x: 0, y: 0 };

    window.addEventListener('keydown', (event) => {
      // Arrow keys and Space scroll the page by default — keep them for us.
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' '].includes(event.key)) {
        event.preventDefault();
      }
      if (!event.repeat) this.pressed.add(event.code);
      this.held.add(event.code);
    });
    window.addEventListener('keyup', (event) => {
      this.held.delete(event.code);
    });
    window.addEventListener('blur', () => {
      // Losing the window must never leave a key stuck down mid-flight.
      this.held.clear();
    });
    canvas.addEventListener('mousemove', (event) => {
      const rect = canvas.getBoundingClientRect();
      this.mouse.x = event.clientX - rect.left;
      this.mouse.y = event.clientY - rect.top;
    });
    canvas.addEventListener('click', (event) => {
      const rect = canvas.getBoundingClientRect();
      this.clicks.push({ x: event.clientX - rect.left, y: event.clientY - rect.top });
    });
  }

  // The stick state for this frame: -1..1 pitch and bank, throttle keys.
  stick() {
    const left = this.held.has('ArrowLeft') || this.held.has('KeyA');
    const right = this.held.has('ArrowRight') || this.held.has('KeyD');
    const up = this.held.has('ArrowUp') || this.held.has('KeyW');
    const down = this.held.has('ArrowDown') || this.held.has('KeyS');
    return {
      bank: (right ? 1 : 0) - (left ? 1 : 0),
      pitch: (up ? 1 : 0) - (down ? 1 : 0),
      throttleUp: this.held.has('ShiftLeft') || this.held.has('ShiftRight'),
      throttleDown: this.held.has('ControlLeft') || this.held.has('ControlRight'),
      throttleNudge: 0,
      flare: this.held.has('Space'),
    };
  }

  // True once, on the frame the key went down.
  wasPressed(code) {
    return this.pressed.has(code);
  }

  // The + / - throttle nudge: apply one small step per press.
  consumeThrottleNudge() {
    let nudge = 0;
    if (this.pressed.has('Equal') || this.pressed.has('NumpadAdd')) nudge += 0.08;
    if (this.pressed.has('Minus') || this.pressed.has('NumpadSubtract')) nudge -= 0.08;
    return nudge;
  }

  // Take and clear this frame's clicks, so a button fires once.
  takeClicks() {
    const taken = this.clicks;
    this.clicks = [];
    return taken;
  }

  // Clear the one-frame edges at the end of each frame.
  endFrame() {
    this.pressed.clear();
  }
}

// True when a click point falls inside a button rectangle.
export function hitButton(click, button) {
  return (
    click.x >= button.x &&
    click.x <= button.x + button.w &&
    click.y >= button.y &&
    click.y <= button.y + button.h
  );
}
