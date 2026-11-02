/**
 * The page's soundtrack, synthesised in the browser with the Web Audio API (no audio files): a mellow 92 BPM
 * beat in eight bars, built from separate layers that the scroll position fades in and out.
 *
 *   pad and keys   always, once the sound is on
 *   arpeggio       from the design chapter
 *   hats           from inside
 *   bass           from inside, fully by the driver
 *   kick and clap  at the driver, the battery
 *   street noise   in the noise-cancelling chapter, until noise cancelling switches it off
 *
 * Notes are scheduled a little ahead on the audio clock (the usual "lookahead" pattern), so timing stays tight
 * even if the page is busy. An analyser on the output measures the low end, which moves the driver cones.
 */

const BPM = 92, STEP = 60 / BPM / 4; // sixteenth notes
const hz = (m: number) => 440 * 2 ** ((m - 69) / 12);

// Eight bars in D minor-ish: Dm9 · Bbmaj7 · Gm9 · A7sus, then the same with a lift at the end
const CHORDS = [
  [50, 57, 60, 64, 65], [46, 53, 57, 62, 65], [43, 50, 53, 58, 62], [45, 52, 55, 60, 62],
  [50, 57, 60, 64, 65], [46, 53, 57, 62, 65], [43, 50, 53, 58, 62], [45, 52, 57, 61, 64]
];
const ROOTS = [38, 34, 31, 33, 38, 34, 31, 33];
// Bass rhythm per sixteenth: root, octave, fifth, or rest
const BASS = ["R", "", "", "R", "", "", "O", "", "R", "", "", "F", "", "R", "", ""];
const ARP = [0, 2, 3, 4, 3, 2, 1, 2]; // which chord note, eighth notes

/** How loud each layer is, 0..1. */
export interface Mix { energy: number; noise: number }

type Layer = "pad" | "arp" | "hats" | "bass" | "drums" | "noise";

const smooth = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** Which layers play at a given energy (0 = just the pad, 1 = everything). Exported for the tests. */
export function layerLevels(m: Mix): Record<Layer, number> {
  return {
    pad: 1,
    arp: smooth(0.15, 0.35, m.energy),
    hats: smooth(0.35, 0.5, m.energy),
    bass: smooth(0.5, 0.7, m.energy),
    drums: smooth(0.75, 0.92, m.energy),
    noise: Math.min(1, Math.max(0, m.noise))
  };
}

const LAYER_VOLUME: Record<Layer, number> = { pad: 0.5, arp: 0.32, hats: 0.5, bass: 0.6, drums: 0.85, noise: 0.5 };

export class Soundtrack {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private layers = {} as Record<Layer, GainNode>;
  private levels = {} as Record<Layer, number>;
  private analyser: AnalyserNode | null = null;
  private data = new Uint8Array(64);
  private timer = 0;
  private step = 0;
  private next = 0;
  private noiseBuffer: AudioBuffer | null = null;
  playing = false;

  start(): void {
    if (this.playing) return;
    if (!this.ctx) this.setUp();
    const ctx = this.ctx!;
    void ctx.resume();
    this.master!.gain.cancelScheduledValues(ctx.currentTime);
    this.master!.gain.setTargetAtTime(0.7, ctx.currentTime, 0.4); // fade in
    this.playing = true;
    this.step = 0;
    this.next = ctx.currentTime + 0.08;
    this.timer = window.setInterval(() => this.schedule(), 25);
  }

  stop(): void {
    if (!this.playing || !this.ctx || !this.master) return;
    this.playing = false;
    clearInterval(this.timer);
    this.master.gain.setTargetAtTime(0, this.ctx.currentTime, 0.12);
    const ctx = this.ctx;
    setTimeout(() => { if (!this.playing) void ctx.suspend(); }, 900); // let it fade, then let the device rest
  }

  /** Fade the layers towards the mix for this point on the page. */
  setMix(m: Mix): void {
    if (!this.ctx) return;
    const want = layerLevels(m), now = this.ctx.currentTime;
    for (const k of Object.keys(want) as Layer[]) {
      if (Math.abs((this.levels[k] ?? -1) - want[k]) < 0.01) continue;
      this.levels[k] = want[k];
      this.layers[k].gain.setTargetAtTime(want[k] * LAYER_VOLUME[k], now, 0.25);
    }
  }

  /** 0..1: how hard the bass is hitting right now. */
  level(): number {
    if (!this.analyser || !this.playing) return 0;
    this.analyser.getByteFrequencyData(this.data);
    const low = (this.data[1] + this.data[2] + this.data[3]) / (3 * 255);
    return Math.max(0, (low - 0.3) / 0.7);
  }

  private setUp(): void {
    const ctx = (this.ctx = new AudioContext());
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 128;
    this.analyser.smoothingTimeConstant = 0.5;
    // a gentle compressor keeps the layers sitting together as they come and go
    const glue = ctx.createDynamicsCompressor();
    glue.threshold.value = -18; glue.ratio.value = 3; glue.attack.value = 0.01; glue.release.value = 0.2;
    this.master = ctx.createGain();
    this.master.gain.value = 0;
    this.master.connect(glue).connect(this.analyser).connect(ctx.destination);
    for (const k of Object.keys(LAYER_VOLUME) as Layer[]) {
      const g = ctx.createGain();
      g.gain.value = 0;
      g.connect(this.master);
      this.layers[k] = g;
    }
    // a little space: a short feedback echo on the keys and the arpeggio
    const echo = ctx.createDelay(1), feedback = ctx.createGain(), wet = ctx.createGain(), tone = ctx.createBiquadFilter();
    echo.delayTime.value = STEP * 3; feedback.gain.value = 0.32; wet.gain.value = 0.35;
    tone.type = "lowpass"; tone.frequency.value = 2400;
    for (const k of ["pad", "arp"] as Layer[]) this.layers[k].connect(echo);
    echo.connect(tone).connect(feedback).connect(echo);
    tone.connect(wet).connect(this.master);

    this.noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = this.noiseBuffer.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this.startStreet();
  }

  /** The noise for the noise-cancelling chapter: a low rumble and hiss, like a train carriage, always running underneath. */
  private startStreet(): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer; src.loop = true;
    const rumble = ctx.createBiquadFilter(); rumble.type = "lowpass"; rumble.frequency.value = 260;
    const hiss = ctx.createBiquadFilter(); hiss.type = "bandpass"; hiss.frequency.value = 1800; hiss.Q.value = 0.6;
    const hissGain = ctx.createGain(); hissGain.gain.value = 0.18;
    // a slow wobble, so it sounds like movement rather than static
    const lfo = ctx.createOscillator(), depth = ctx.createGain();
    lfo.frequency.value = 0.23; depth.gain.value = 120;
    lfo.connect(depth).connect(rumble.frequency);
    src.connect(rumble).connect(this.layers.noise);
    src.connect(hiss).connect(hissGain).connect(this.layers.noise);
    src.start(); lfo.start();
  }

  private schedule(): void {
    const ctx = this.ctx!;
    while (this.next < ctx.currentTime + 0.15) {
      const s = this.step % 16, bar = Math.floor(this.step / 16) % 8, t = this.next;
      const chord = CHORDS[bar], root = ROOTS[bar];
      if (s === 0) this.pad(chord, t, STEP * 16);
      if (s === 8 && bar % 2 === 1) this.keys(chord.slice(2), t);
      if (s % 2 === 0) this.pluck(hz(chord[ARP[(s / 2) % 8]] + 12), t, s % 4 === 0 ? 0.11 : 0.07);
      if (s % 2 === 1) this.hat(t, s % 4 === 3 ? 0.07 : 0.035);
      if (s === 14 && bar % 4 === 3) this.hat(t, 0.09, 0.14); // an open hat into the turnaround
      const b = BASS[s];
      if (b) this.bass(hz(root + (b === "O" ? 12 : b === "F" ? 7 : 0)), t, b === "R" && s === 0 ? 0.42 : 0.3);
      if (s === 0 || s === 10 || (s === 7 && bar % 2 === 1)) this.kick(t);
      if (s === 4 || s === 12) this.clap(t);
      this.next += STEP;
      this.step++;
    }
  }

  private env(layer: Layer, t: number, peak: number, attack: number, decay: number): GainNode {
    const g = this.ctx!.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    g.connect(this.layers[layer]);
    return g;
  }

  private pad(chord: number[], t: number, len: number): void {
    for (const n of chord) for (const detune of [-8, 8]) {
      const o = this.ctx!.createOscillator(), f = this.ctx!.createBiquadFilter();
      o.type = "sawtooth"; o.frequency.value = hz(n); o.detune.value = detune;
      f.type = "lowpass"; f.frequency.setValueAtTime(500, t); f.frequency.linearRampToValueAtTime(1300, t + len * 0.5); f.frequency.linearRampToValueAtTime(600, t + len);
      o.connect(f).connect(this.env("pad", t, 0.018, 0.6, len - 0.5));
      o.start(t); o.stop(t + len + 0.1);
    }
  }

  /** Soft electric-piano stabs. */
  private keys(notes: number[], t: number): void {
    for (const n of notes) {
      const o = this.ctx!.createOscillator(), m = this.ctx!.createOscillator(), mg = this.ctx!.createGain();
      o.type = "sine"; o.frequency.value = hz(n + 12);
      m.frequency.value = hz(n + 12) * 2; mg.gain.value = hz(n) * 0.9; // a touch of FM for the bell-like attack
      m.connect(mg).connect(o.frequency);
      o.connect(this.env("pad", t, 0.05, 0.004, 0.9));
      o.start(t); m.start(t); o.stop(t + 1); m.stop(t + 1);
    }
  }

  private pluck(f: number, t: number, vol: number): void {
    const o = this.ctx!.createOscillator(), filter = this.ctx!.createBiquadFilter();
    o.type = "triangle"; o.frequency.value = f;
    filter.type = "lowpass"; filter.frequency.setValueAtTime(3000, t); filter.frequency.exponentialRampToValueAtTime(600, t + 0.2);
    o.connect(filter).connect(this.env("arp", t, vol, 0.003, 0.22));
    o.start(t); o.stop(t + 0.3);
  }

  private bass(f: number, t: number, vol: number): void {
    const o = this.ctx!.createOscillator(), sub = this.ctx!.createOscillator(), filter = this.ctx!.createBiquadFilter();
    o.type = "sawtooth"; o.frequency.value = f;
    sub.type = "sine"; sub.frequency.value = f / 2;
    filter.type = "lowpass"; filter.Q.value = 4; filter.frequency.setValueAtTime(700, t); filter.frequency.exponentialRampToValueAtTime(160, t + 0.22);
    const g = this.env("bass", t, vol, 0.006, 0.32);
    o.connect(filter).connect(g);
    sub.connect(g);
    o.start(t); sub.start(t); o.stop(t + 0.4); sub.stop(t + 0.4);
  }

  private kick(t: number): void {
    const o = this.ctx!.createOscillator();
    o.frequency.setValueAtTime(130, t);
    o.frequency.exponentialRampToValueAtTime(45, t + 0.11);
    o.connect(this.env("drums", t, 0.95, 0.003, 0.34));
    o.start(t); o.stop(t + 0.4);
  }

  private burst(layer: Layer, t: number, vol: number, freq: number, decay: number, type: BiquadFilterType): void {
    const ctx = this.ctx!, src = ctx.createBufferSource(), filter = ctx.createBiquadFilter();
    src.buffer = this.noiseBuffer;
    filter.type = type; filter.frequency.value = freq;
    src.connect(filter).connect(this.env(layer, t, vol, 0.002, decay));
    src.start(t, Math.random() * 1.5); src.stop(t + decay + 0.05);
  }
  private hat(t: number, vol: number, decay = 0.045): void { this.burst("hats", t, vol, 7500, decay, "highpass"); }
  private clap(t: number): void { this.burst("drums", t, 0.22, 1400, 0.18, "bandpass"); }

}
