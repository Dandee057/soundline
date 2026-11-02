/**
 * A short demo loop, synthesised in the browser (no audio files): kick, bass, a soft chord pad and hats at
 * 96 BPM, scheduled a little ahead of time on the Web Audio clock. An analyser reports how hard the low end is
 * hitting, and that moves the driver cones on screen.
 */

const BPM = 96, STEP = 60 / BPM / 4; // sixteenth notes
const BASS = [36, 0, 0, 36, 0, 0, 43, 0, 41, 0, 0, 41, 0, 0, 39, 0]; // MIDI notes, 0 = rest; one bar, repeated with a turn
const CHORDS = [[60, 63, 67, 70], [58, 62, 65, 69], [56, 60, 63, 67], [55, 58, 62, 65]];

const hz = (m: number) => 440 * 2 ** ((m - 69) / 12);

export class DemoLoop {
  private ctx: AudioContext | null = null;
  private out: GainNode | null = null;
  private analyser: AnalyserNode | null = null;
  private data = new Uint8Array(64);
  private timer = 0;
  private step = 0;
  private next = 0;
  playing = false;

  start(): void {
    if (this.playing) return;
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 128;
      this.analyser.smoothingTimeConstant = 0.5;
      this.out = this.ctx.createGain();
      this.out.connect(this.analyser).connect(this.ctx.destination);
    }
    void this.ctx.resume();
    this.out!.gain.cancelScheduledValues(this.ctx.currentTime);
    this.out!.gain.setTargetAtTime(0.55, this.ctx.currentTime, 0.05);
    this.playing = true;
    this.step = 0;
    this.next = this.ctx.currentTime + 0.05;
    this.timer = window.setInterval(() => this.schedule(), 25);
  }

  stop(): void {
    if (!this.playing || !this.ctx || !this.out) return;
    this.playing = false;
    clearInterval(this.timer);
    this.out.gain.setTargetAtTime(0, this.ctx.currentTime, 0.08);
  }

  /** 0..1: how loud the bass is right now. */
  level(): number {
    if (!this.analyser || !this.playing) return 0;
    this.analyser.getByteFrequencyData(this.data);
    const low = (this.data[1] + this.data[2] + this.data[3]) / (3 * 255);
    return Math.max(0, (low - 0.35) / 0.65);
  }

  private schedule(): void {
    const ctx = this.ctx!;
    while (this.next < ctx.currentTime + 0.12) {
      const s = this.step % 16, bar = Math.floor(this.step / 16) % 4, t = this.next;
      if (s % 4 === 0) this.kick(t);
      if (s % 2 === 1) this.hat(t, s % 4 === 3 ? 0.06 : 0.035);
      if (s === 4 || s === 12) this.clap(t);
      const b = BASS[s];
      if (b) this.bass(hz(b + (bar === 3 && s >= 8 ? 2 : 0)), t);
      if (s === 0) for (const n of CHORDS[bar]) this.pad(hz(n), t, STEP * 16);
      this.next += STEP;
      this.step++;
    }
  }

  private env(t: number, peak: number, attack: number, decay: number): GainNode {
    const g = this.ctx!.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    g.connect(this.out!);
    return g;
  }

  private kick(t: number): void {
    const o = this.ctx!.createOscillator();
    o.frequency.setValueAtTime(140, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    o.connect(this.env(t, 0.9, 0.003, 0.32));
    o.start(t); o.stop(t + 0.4);
  }

  private bass(f: number, t: number): void {
    const o = this.ctx!.createOscillator(), filter = this.ctx!.createBiquadFilter();
    o.type = "sawtooth"; o.frequency.value = f;
    filter.type = "lowpass"; filter.frequency.setValueAtTime(900, t); filter.frequency.exponentialRampToValueAtTime(180, t + 0.25);
    o.connect(filter).connect(this.env(t, 0.32, 0.005, 0.3));
    o.start(t); o.stop(t + 0.35);
  }

  private pad(f: number, t: number, len: number): void {
    for (const detune of [-7, 7]) {
      const o = this.ctx!.createOscillator(), filter = this.ctx!.createBiquadFilter();
      o.type = "sawtooth"; o.frequency.value = f; o.detune.value = detune;
      filter.type = "lowpass"; filter.frequency.value = 1400;
      o.connect(filter).connect(this.env(t, 0.025, 0.4, len - 0.4));
      o.start(t); o.stop(t + len + 0.05);
    }
  }

  private noiseBuffer: AudioBuffer | null = null;
  private noise(t: number, vol: number, freq: number, decay: number, type: BiquadFilterType): void {
    const ctx = this.ctx!;
    if (!this.noiseBuffer) {
      this.noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
      const d = this.noiseBuffer.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    const src = ctx.createBufferSource(), filter = ctx.createBiquadFilter();
    src.buffer = this.noiseBuffer;
    filter.type = type; filter.frequency.value = freq;
    src.connect(filter).connect(this.env(t, vol, 0.002, decay));
    src.start(t); src.stop(t + decay + 0.05);
  }
  private hat(t: number, vol: number): void { this.noise(t, vol, 7000, 0.05, "highpass"); }
  private clap(t: number): void { this.noise(t, 0.18, 1500, 0.16, "bandpass"); }
}
