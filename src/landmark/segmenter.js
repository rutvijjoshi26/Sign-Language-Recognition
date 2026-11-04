// Splits a stream of landmark frames into sign segments: a segment starts once `isActive`
// holds for `startFrames` frames in a row and ends after `endGap` inactive frames (or at
// `maxFrames`). `preRoll` frames before the start are kept, so a segment looks like the
// training clips: a little rest, the sign, a little rest.

const hasHand = (f) => f.hands[0] !== null || f.hands[1] !== null;

export class SignSegmenter {
  constructor({ startFrames = 2, endGap = 8, minFrames = 10, maxFrames = 150, preRoll = 2, isActive = hasHand } = {}) {
    Object.assign(this, { startFrames, endGap, minFrames, maxFrames, preRoll, isActive });
    this.reset();
  }

  reset() {
    this.frames = [];
    this.history = [];
    this.run = 0;
    this.gap = 0;
    this.active = false;
  }

  current() {
    return this.active ? this.frames : [];
  }

  // Returns a finished segment (array of frames) or null.
  push(frame) {
    const present = this.isActive(frame);
    if (!this.active) {
      this.history.push(frame);
      if (this.history.length > this.startFrames + this.preRoll) this.history.shift();
      this.run = present ? this.run + 1 : 0;
      if (this.run >= this.startFrames) {
        this.active = true;
        this.gap = 0;
        this.frames = this.history;
        this.history = [];
      }
      return null;
    }
    this.frames.push(frame);
    this.gap = present ? 0 : this.gap + 1;
    if (this.gap >= this.endGap || this.frames.length >= this.maxFrames) {
      const seg = this.frames;
      const hands = seg.filter(this.isActive).length;
      this.active = false;
      this.frames = [];
      this.run = 0;
      return hands >= this.minFrames ? seg : null;
    }
    return null;
  }
}
