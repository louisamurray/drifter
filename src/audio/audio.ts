import { claimPlaybackSession, pausePlaybackSession, resumePlaybackSession } from './session';
import {
  bankRootHz,
  engineCutoff,
  engineFrequency,
  engineGain,
  squealFrequency,
  squealGain,
} from './mapping';

export type Sfx = 'tick' | 'go' | 'multiplier' | 'bank' | 'wide';

export interface AudioTelemetry {
  speedRatio: number;
  throttle: number;
  drifting: boolean;
  handbrake: boolean;
  /** 0..1 slide intensity, as used for skids and smoke. */
  slide: number;
  offTrack: boolean;
}

const MUTE_KEY = 'drifter.muted';
const SMOOTH = 0.06;

/**
 * Procedural audio. Nothing is downloaded: the engine is detuned oscillators
 * through a low-pass, the squeal is band-passed noise plus a vibrato tone, and
 * the effects are short scheduled envelopes. The AudioContext is created and
 * resumed only inside a user gesture, which is what iOS requires.
 */
export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private engineGainNode: GainNode | null = null;
  private engineFilter: BiquadFilterNode | null = null;
  private engineOscs: OscillatorNode[] = [];
  private squealGainNode: GainNode | null = null;
  private squealFilter: BiquadFilterNode | null = null;
  private squealTone: OscillatorNode | null = null;
  private engineOn = false;
  private _muted = loadMuted();

  get muted(): boolean {
    return this._muted;
  }

  get unlocked(): boolean {
    return this.ctx !== null;
  }

  /** Call from inside a user gesture. Safe to call repeatedly. */
  unlock(): void {
    if (!this.ctx) {
      const Ctor = window.AudioContext as typeof AudioContext | undefined;
      if (!Ctor) return;
      this.ctx = new Ctor();
      this.buildGraph(this.ctx);
      claimPlaybackSession();
    }
    if (this.ctx.state !== 'running') {
      void this.ctx.resume();
      resumePlaybackSession();
    }
    this.applyMute();
  }

  /** One line of state for the debug readout. */
  describe(): string {
    if (!this.ctx) return 'audio: not unlocked';
    return `audio: ${this.ctx.state} ${String(this.ctx.sampleRate)}Hz${this._muted ? ' muted' : ''}`;
  }

  setMuted(muted: boolean): void {
    this._muted = muted;
    try {
      localStorage.setItem(MUTE_KEY, muted ? '1' : '0');
    } catch {
      // Preference simply does not persist
    }
    this.applyMute();
  }

  toggleMuted(): boolean {
    this.setMuted(!this._muted);
    return this._muted;
  }

  /** Engine and squeal audible. */
  startEngine(): void {
    this.engineOn = true;
  }

  /** Fade the engine and squeal out over `seconds`. */
  stopEngine(seconds = 0.6): void {
    this.engineOn = false;
    if (!this.ctx || !this.engineGainNode || !this.squealGainNode) return;
    const t = this.ctx.currentTime;
    this.engineGainNode.gain.setTargetAtTime(0, t, seconds / 3);
    this.squealGainNode.gain.setTargetAtTime(0, t, seconds / 4);
  }

  /** Suspend the whole context, e.g. on pause or when the tab is hidden. */
  suspend(): void {
    if (this.ctx?.state === 'running') void this.ctx.suspend();
    pausePlaybackSession();
  }

  resume(): void {
    if (this.ctx && this.ctx.state !== 'running') void this.ctx.resume();
    if (this.ctx) resumePlaybackSession();
  }

  /** Call once per physics step while the engine is on. */
  update(t: AudioTelemetry): void {
    if (!this.ctx || !this.engineOn) return;
    const now = this.ctx.currentTime;
    const f = engineFrequency(t.speedRatio, t.drifting, t.handbrake);
    this.engineOscs[0]?.frequency.setTargetAtTime(f, now, SMOOTH);
    this.engineOscs[1]?.frequency.setTargetAtTime(f / 2, now, SMOOTH);
    this.engineOscs[2]?.frequency.setTargetAtTime(f * 1.007, now, SMOOTH);
    this.engineFilter?.frequency.setTargetAtTime(engineCutoff(t.speedRatio), now, SMOOTH);
    this.engineGainNode?.gain.setTargetAtTime(engineGain(t.speedRatio, t.throttle), now, SMOOTH);

    const sq = squealGain(t.slide, t.offTrack);
    this.squealGainNode?.gain.setTargetAtTime(sq, now, 0.04);
    const sf = squealFrequency(t.slide);
    this.squealFilter?.frequency.setTargetAtTime(sf, now, 0.05);
    this.squealTone?.frequency.setTargetAtTime(sf * 0.8, now, 0.05);
  }

  play(sfx: Sfx, amount = 0): void {
    if (!this.ctx || !this.master) return;
    const t = this.ctx.currentTime;
    switch (sfx) {
      case 'tick':
        this.blip(880, t, 0.06, 0.22, 'sine');
        break;
      case 'go':
        this.blip(1320, t, 0.22, 0.26, 'sine');
        break;
      case 'multiplier':
        this.blip(660, t, 0.07, 0.2, 'triangle');
        this.blip(990, t + 0.07, 0.09, 0.2, 'triangle');
        break;
      case 'bank': {
        const root = bankRootHz(amount);
        this.blip(root, t, 0.08, 0.22, 'triangle');
        this.blip(root * 1.25, t + 0.06, 0.08, 0.2, 'triangle');
        this.blip(root * 1.5, t + 0.12, 0.16, 0.18, 'triangle');
        break;
      }
      case 'wide':
        this.blip(130, t, 0.14, 0.18, 'sawtooth', 500);
        break;
    }
  }

  private blip(
    freq: number,
    at: number,
    duration: number,
    peak: number,
    type: OscillatorType,
    lowpass?: number,
  ): void {
    if (!this.ctx || !this.master) return;
    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(peak, at + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    let tail: AudioNode = osc;
    if (lowpass !== undefined) {
      const lp = this.ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = lowpass;
      tail.connect(lp);
      tail = lp;
    }
    tail.connect(g);
    g.connect(this.master);
    osc.start(at);
    osc.stop(at + duration + 0.02);
  }

  private buildGraph(ctx: AudioContext): void {
    this.master = ctx.createGain();
    this.master.gain.value = this._muted ? 0 : 1;
    this.master.connect(ctx.destination);

    // Engine: saw + sub square + detuned saw, low-passed
    this.engineGainNode = ctx.createGain();
    this.engineGainNode.gain.value = 0;
    this.engineFilter = ctx.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.value = 600;
    this.engineFilter.Q.value = 0.9;
    this.engineFilter.connect(this.engineGainNode);
    this.engineGainNode.connect(this.master);
    const types: OscillatorType[] = ['sawtooth', 'square', 'sawtooth'];
    const levels = [0.5, 0.35, 0.3];
    this.engineOscs = types.map((type, i) => {
      const osc = ctx.createOscillator();
      osc.type = type;
      osc.frequency.value = 58;
      const g = ctx.createGain();
      g.gain.value = levels[i] ?? 0.3;
      osc.connect(g);
      if (this.engineFilter) g.connect(this.engineFilter);
      osc.start();
      return osc;
    });

    // Squeal: band-passed noise plus a vibrato tone
    this.squealGainNode = ctx.createGain();
    this.squealGainNode.gain.value = 0;
    this.squealGainNode.connect(this.master);
    this.squealFilter = ctx.createBiquadFilter();
    this.squealFilter.type = 'bandpass';
    this.squealFilter.frequency.value = 1500;
    this.squealFilter.Q.value = 9;
    this.squealFilter.connect(this.squealGainNode);
    const noise = ctx.createBufferSource();
    noise.buffer = whiteNoise(ctx, 2);
    noise.loop = true;
    noise.connect(this.squealFilter);
    noise.start();

    this.squealTone = ctx.createOscillator();
    this.squealTone.type = 'sine';
    this.squealTone.frequency.value = 1200;
    const toneGain = ctx.createGain();
    toneGain.gain.value = 0.35;
    this.squealTone.connect(toneGain);
    toneGain.connect(this.squealGainNode);
    const vibrato = ctx.createOscillator();
    vibrato.frequency.value = 7;
    const vibratoDepth = ctx.createGain();
    vibratoDepth.gain.value = 24;
    vibrato.connect(vibratoDepth);
    vibratoDepth.connect(this.squealTone.frequency);
    vibrato.start();
    this.squealTone.start();
  }

  private applyMute(): void {
    if (!this.ctx || !this.master) return;
    this.master.gain.setTargetAtTime(this._muted ? 0 : 1, this.ctx.currentTime, 0.02);
  }
}

function whiteNoise(ctx: AudioContext, seconds: number): AudioBuffer {
  const length = Math.floor(ctx.sampleRate * seconds);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
  return buffer;
}

function loadMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
}
