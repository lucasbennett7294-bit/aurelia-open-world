// Wanted level: 0..5 stars. Crimes raise it at once; it cools down one
// star every 25 quiet seconds. Day 3's police read this level to decide
// how hard they chase; Day 2 only raises and shows it.

export class Wanted {
  constructor() {
    this.level = 0;
    this._quiet = 0;
  }

  raise(n) {
    this.level = Math.min(5, this.level + n);
    this._quiet = 0;
  }

  clear() {
    this.level = 0;
    this._quiet = 0;
  }

  update(dt) {
    if (this.level <= 0) return;
    this._quiet += dt;
    if (this._quiet > 25) {
      this.level -= 1;
      this._quiet = 0;
    }
  }
}
