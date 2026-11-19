// Input: keyboard state and pointer-lock mouse look for Aurelia Bay.
// One job: tell the game which keys are held and how the camera should turn.

export class Input {
  constructor(canvas) {
    this.keys = new Set();
    this._pressed = new Set(); // keys pressed since last pressed() read
    this.yaw = Math.PI; // camera starts looking north down the main avenue
    this.pitch = 0.32; // slightly above the horizon
    this.locked = false;
    this._canvas = canvas;

    window.addEventListener('keydown', (event) => {
      if (event.code === 'Space') event.preventDefault();
      if (!event.repeat) this._pressed.add(event.code);
      this.keys.add(event.code);
    });
    window.addEventListener('keyup', (event) => this.keys.delete(event.code));
    window.addEventListener('blur', () => { this.keys.clear(); this._pressed.clear(); });

    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
    });
    document.addEventListener('mousemove', (event) => {
      if (!this.locked) return;
      this.yaw -= event.movementX * 0.0026;
      this.pitch += event.movementY * 0.0022;
      const limit = 1.15;
      this.pitch = Math.max(-limit, Math.min(limit, this.pitch));
    });
  }

  lockPointer() {
    try {
      const result = this._canvas.requestPointerLock();
      if (result && typeof result.catch === 'function') result.catch(() => {});
    } catch {
      // Headless browsers and iframes may refuse pointer lock; the game
      // still plays with keyboard and a fixed camera yaw.
    }
  }

  get forward() { return this.keys.has('KeyW') || this.keys.has('ArrowUp'); }
  get back() { return this.keys.has('KeyS') || this.keys.has('ArrowDown'); }
  get left() { return this.keys.has('KeyA') || this.keys.has('ArrowLeft'); }
  get right() { return this.keys.has('KeyD') || this.keys.has('ArrowRight'); }
  get run() { return this.keys.has('ShiftLeft') || this.keys.has('ShiftRight'); }
  get jump() { return this.keys.has('Space'); }
  get interact() { return this.keys.has('KeyE'); }

  // Edge-triggered press: true once per physical key press, then clears,
  // so holding E does not re-enter a car every frame.
  pressed(code) {
    const hit = this._pressed.has(code);
    this._pressed.delete(code);
    return hit;
  }

  // -1..1 strafe and -1..1 forward intent, from the held keys.
  moveAxes() {
    const x = (this.right ? 1 : 0) - (this.left ? 1 : 0);
    const z = (this.forward ? 1 : 0) - (this.back ? 1 : 0);
    return { x, z };
  }
}
