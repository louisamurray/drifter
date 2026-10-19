import type { Activity, LessonId } from '../game/session';
import { LESSONS } from '../game/lessons';
import type { ChallengeState } from '../game/challenge';
import { challengeTotal } from '../game/challenge';
import { isAssistanceProfile, type AssistanceProfile } from '../game/assistance';
import {
  isControlScheme,
  ZONES,
  type ControlScheme,
  type PadLayout,
  type Zone,
} from '../core/input';
import { GAME_MODES, isGameMode, type GameMode } from '../core/mode';
import type { GameState } from '../core/state';

/**
 * DOM overlay for everything textual: crisper than canvas text and trivially
 * styled. One container per state; the active one is shown.
 */
export class Hud {
  readonly root: HTMLElement;
  private readonly screens = new Map<GameState, HTMLElement>();

  // Playing
  private readonly scoreEl: HTMLElement;
  private readonly timerEl: HTMLElement;
  private readonly timebarEl: HTMLElement;
  private lastWholeSecond = -1;
  private readonly multEl: HTMLElement;
  private readonly ringEl: SVGCircleElement;
  private readonly ringLength: number;
  private readonly zonesEl: HTMLElement;
  private readonly vignetteEl: HTMLElement;
  private zoneEls = new Map<Zone, HTMLElement>();
  private readonly padEl: HTMLElement;
  private readonly padParts: Record<'gas' | 'brake' | 'stick', HTMLElement>;
  private readonly knobEl: HTMLElement;
  private knobTravel = 0;

  // Title / game over
  private readonly titleBestEl: HTMLElement;
  private readonly titleSubEl: HTMLElement;
  private readonly titleTagEl: HTMLElement;
  private readonly hintEl: HTMLElement;
  private readonly installEl: HTMLElement;
  private readonly modeChips: HTMLElement[];
  private readonly controlsChips: HTMLElement[];
  private readonly finalScoreEl: HTMLElement;
  private readonly finalBestEl: HTMLElement;
  private readonly newBestEl: HTMLElement;
  private readonly countdownEl: HTMLElement;
  private readonly overTopEl: HTMLElement;
  private readonly overActionsEl: HTMLElement;
  private readonly shareBtn: HTMLButtonElement;
  private activity: Activity = 'timed';
  private lesson: LessonId | null = null;
  onActivity: ((activity: Activity) => void) | null = null;
  onLesson: ((id: LessonId) => void) | null = null;
  onReset: (() => void) | null = null;
  onExit: (() => void) | null = null;
  onTitle: (() => void) | null = null;
  onLeaveLesson: (() => void) | null = null;
  private mode: GameMode = 'track';
  private bests: Record<GameMode, number> = { track: 0, free: 0 };
  private scheme: ControlScheme = 'thumb';

  onAssistance: ((profile: AssistanceProfile) => void) | null = null;

  onStart: (() => void) | null = null;
  onRestart: (() => void) | null = null;
  onResume: (() => void) | null = null;
  onShare: (() => void) | null = null;
  onPause: (() => void) | null = null;
  onSound: (() => void) | null = null;
  onMode: ((mode: GameMode) => void) | null = null;
  onControls: ((scheme: ControlScheme) => void) | null = null;
  private readonly soundButtons: HTMLElement[] = [];

  constructor(parent: HTMLElement) {
    this.root = el('div', 'hud');
    parent.append(this.root);

    // Title
    const title = el('div', 'screen screen-title');
    title.innerHTML = `
      <button class="chip sound-toggle" data-act="sound" aria-label="Sound">sound on</button>
      <div class="mode-toggle" role="group" aria-label="Mode">
        <button class="chip mode-chip" data-act="mode" data-mode="track">Circuit</button>
        <button class="chip mode-chip" data-act="mode" data-mode="free">Free drift</button>
        <button class="chip activity-chip" data-act="activity" data-activity="practice">Practice</button>
        <button class="chip activity-chip" data-act="activity" data-activity="challenge">Challenge</button>
      </div>
      <div class="title-lockup">
        <div class="title-logo">DRIFTER</div>
        <div class="title-tag">One thumb. Sixty seconds.</div>
      </div>
      <div class="title-scrim"></div>
      <div class="title-foot">
        <div class="controls-toggle" role="group" aria-label="Controls">
          <button class="chip controls-chip" data-act="controls" data-scheme="thumb">One thumb</button>
          <button class="chip controls-chip" data-act="controls" data-scheme="pedals">Two thumbs</button>
        </div>
        <div class="assistance-toggle controls-toggle" role="group" aria-label="Assistance">
          <button class="chip assistance-chip" data-act="assistance" data-profile="assisted">Assisted</button>
          <button class="chip assistance-chip" data-act="assistance" data-profile="reduced">Reduced assistance</button>
        </div>
        <div class="assistance-description keyboard-hint"></div>
        <div class="controller-hint keyboard-hint">Controller: left stick steers · RT gas · A/LT handbrake · Start drive/resume · B pause · Y reset</div>
        <div class="hint"></div>
        <button class="title-cta" data-act="start"><span class="touch-only">Tap to drive</span><span class="keyboard-only">Enter to drive</span></button>
        <div class="keyboard-only keyboard-hint keyboard-driving"></div>
        <div class="title-sub"></div>
        <details class="lesson-menu"><summary>Optional lessons</summary><div class="lesson-options"></div></details>
        <div class="title-best"></div>
        <div class="title-install">Add to Home Screen to play full screen</div>
      </div>`;
    title.addEventListener('click', (e) => {
      if (this.dispatch(e)) return;
      this.onStart?.();
    });
    this.soundButtons.push(must(title.querySelector('.sound-toggle')));
    this.titleBestEl = must(title.querySelector('.title-best'));
    this.titleSubEl = must(title.querySelector('.title-sub'));
    this.titleTagEl = must(title.querySelector('.title-tag'));
    this.hintEl = must(title.querySelector('.hint'));
    this.installEl = must(title.querySelector('.title-install'));
    this.modeChips = [...title.querySelectorAll<HTMLElement>('.mode-chip')];
    this.controlsChips = [...title.querySelectorAll<HTMLElement>('.controls-chip')];
    this.screens.set('title', title);

    // Countdown
    const countdown = el('div', 'screen screen-countdown');
    this.countdownEl = el('div', 'countdown-number');
    countdown.append(this.countdownEl);
    this.screens.set('countdown', countdown);

    // Playing
    const playing = el('div', 'screen screen-playing');
    playing.innerHTML = `
      <div class="vignette"></div>
      <div class="zones"></div>
      <div class="pad">
        <div class="pedal pedal-gas"><span>gas</span></div>
        <div class="pedal pedal-brake"><span>brake</span></div>
        <div class="stick"><div class="stick-knob"></div></div>
      </div>
      <div class="keyboard-only keyboard-hint keyboard-playing keyboard-driving"></div>
      <div class="activity-bar"><span class="activity-name"></span><button class="chip" data-act="reset">Reset</button></div>
      <div class="activity-feedback" role="status" aria-live="polite"><span class="activity-cue"></span><progress class="lesson-progress" max="1" value="0" aria-label="Lesson progress"></progress><button class="chip lesson-leave" data-act="leave-lesson">Free practice</button></div>
      <div class="hud-timebar"></div>
      <div class="hud-score"><span class="label">score</span><span class="value">0</span></div>
      <div class="hud-timer">60.0</div>
      <button class="hud-pause" data-act="pause" aria-label="Pause">
        <svg viewBox="0 0 12 12" aria-hidden="true"><rect x="1.5" y="1" width="3.5" height="10" rx="1" fill="currentColor"/><rect x="7" y="1" width="3.5" height="10" rx="1" fill="currentColor"/></svg>
      </button>
      <div class="hud-mult">
        <svg viewBox="0 0 44 44" class="ring">
          <circle class="ring-track" cx="22" cy="22" r="19"></circle>
          <circle class="ring-fill" cx="22" cy="22" r="19"></circle>
        </svg>
        <span class="mult-value">×1</span>
      </div>`;
    this.scoreEl = must(playing.querySelector('.hud-score .value'));
    this.timerEl = must(playing.querySelector('.hud-timer'));
    this.timebarEl = must(playing.querySelector('.hud-timebar'));
    this.multEl = must(playing.querySelector('.mult-value'));
    this.ringEl = must(playing.querySelector('.ring-fill'));
    this.ringLength = 2 * Math.PI * 19;
    this.ringEl.style.strokeDasharray = String(this.ringLength);
    this.zonesEl = must(playing.querySelector('.zones'));
    this.vignetteEl = must(playing.querySelector('.vignette'));
    this.padEl = must(playing.querySelector('.pad'));
    this.padParts = {
      gas: must(playing.querySelector('.pedal-gas')),
      brake: must(playing.querySelector('.pedal-brake')),
      stick: must(playing.querySelector('.stick')),
    };
    this.knobEl = must(playing.querySelector('.stick-knob'));
    playing.addEventListener('click', (e) => {
      this.dispatch(e);
    });
    this.screens.set('playing', playing);

    // Paused
    const paused = el('div', 'screen screen-paused');
    paused.innerHTML = `
      <div class="panel">
        <div class="panel-title">Paused</div>
        <div class="assistance-status keyboard-hint"></div>
        <div class="keyboard-only keyboard-hint">Enter or Esc / P to resume</div>
        <button class="btn btn-primary" data-act="resume">Resume</button>
        <button class="btn" data-act="restart">Restart</button>
        <button class="btn paused-leave-lesson" data-act="leave-lesson">Free practice</button>
        <button class="btn practice-exit" data-act="exit">End practice</button>
        <button class="btn btn-quiet" data-act="title">Back to title</button>
        <details class="lesson-menu"><summary>Optional lessons</summary><div class="lesson-options"></div></details>
        <button class="btn btn-quiet" data-act="sound">Sound on</button>
      </div>`;
    paused.addEventListener('click', (e) => {
      this.dispatch(e);
    });
    this.soundButtons.push(must(paused.querySelector('[data-act="sound"]')));
    this.screens.set('paused', paused);

    // Game over
    const over = el('div', 'screen screen-over');
    over.innerHTML = `
      <div class="over-top">
        <div class="over-newbest">New best</div>
        <div class="over-score">0</div>
        <div class="over-best">Best 0</div>
        <div class="challenge-breakdown"></div>
        <div class="result-reason"></div>
        <div class="result-identity"></div>
      </div>
      <div class="over-actions">
        <div class="keyboard-only keyboard-hint">Enter to drive again</div>
        <button class="btn btn-primary btn-large" data-act="restart">Drive again</button>
        <button class="btn btn-quiet" data-act="title">Back to title</button>
        <button class="btn" data-act="share">Share drawing</button>
        <div class="share-status" role="status"></div>
      </div>`;
    over.addEventListener('click', (e) => {
      this.dispatch(e);
    });
    this.overTopEl = must(over.querySelector('.over-top'));
    this.overActionsEl = must(over.querySelector('.over-actions'));
    this.finalScoreEl = must(over.querySelector('.over-score'));
    this.finalBestEl = must(over.querySelector('.over-best'));
    this.newBestEl = must(over.querySelector('.over-newbest'));
    this.shareBtn = must(over.querySelector('[data-act="share"]'));
    this.shareBtn.textContent =
      typeof navigator.share === 'function' ? 'Share drawing' : 'Download drawing';
    this.screens.set('gameover', over);

    for (const s of this.screens.values()) this.root.append(s);
    for (const options of this.root.querySelectorAll('.lesson-options')) {
      for (const id of Object.keys(LESSONS) as LessonId[]) {
        const button = el('button', 'btn lesson-option');
        button.dataset.act = 'lesson';
        button.dataset.lesson = id;
        button.textContent = `${LESSONS[id].name} — ${LESSONS[id].objective}`;
        options.append(button);
      }
    }
    this.setActivity('timed');
    this.setControls(this.scheme);
    this.setAssistance('assisted');
  }

  /** Route a click to its action. Returns true if a button handled it. */
  private dispatch(e: Event): boolean {
    const target = e.target;
    if (!(target instanceof Element)) return false;
    if (target.closest('details') && !target.closest('[data-act]')) return true;
    const act = target.closest<HTMLElement>('[data-act]')?.dataset.act;
    if (act === 'start') this.onStart?.();
    else if (act === 'activity') {
      const activity = target.closest<HTMLElement>('[data-activity]')?.dataset.activity;
      if (activity === 'practice' || activity === 'challenge') this.onActivity?.(activity);
    } else if (act === 'lesson') {
      const id = target.closest<HTMLElement>('[data-lesson]')?.dataset.lesson;
      if (id === 'initiate' || id === 'sustain' || id === 'transition') this.onLesson?.(id);
    } else if (act === 'reset') this.onReset?.();
    else if (act === 'exit') this.onExit?.();
    else if (act === 'title') this.onTitle?.();
    else if (act === 'leave-lesson') this.onLeaveLesson?.();
    else if (act === 'resume') this.onResume?.();
    else if (act === 'restart') this.onRestart?.();
    else if (act === 'share') this.onShare?.();
    else if (act === 'pause') this.onPause?.();
    else if (act === 'sound') this.onSound?.();
    else if (act === 'mode') {
      const mode = target.closest<HTMLElement>('[data-mode]')?.dataset.mode;
      if (isGameMode(mode)) this.onMode?.(mode);
    } else if (act === 'assistance') {
      const profile = target.closest<HTMLElement>('[data-profile]')?.dataset.profile;
      if (isAssistanceProfile(profile)) this.onAssistance?.(profile);
    } else if (act === 'controls') {
      const scheme = target.closest<HTMLElement>('[data-scheme]')?.dataset.scheme;
      if (isControlScheme(scheme)) this.onControls?.(scheme);
    } else return false;
    return true;
  }

  setAssistance(profile: AssistanceProfile): void {
    for (const chip of this.root.querySelectorAll<HTMLElement>('.assistance-chip')) {
      const selected = chip.dataset.profile === profile;
      chip.classList.toggle('on', selected);
      chip.setAttribute('aria-pressed', String(selected));
    }
    for (const description of this.root.querySelectorAll(
      '.assistance-description, .assistance-status',
    )) {
      description.textContent =
        profile === 'assisted'
          ? this.activity === 'timed' && this.mode === 'track'
            ? 'Assisted: road following, corner braking with automatic gas, and countersteer.'
            : 'Assisted: helps catch slides with countersteer. The lot has no road-following or corner braking.'
          : 'Reduced assistance: no road following, automatic corner braking or countersteer. Best not saved.';
      description.textContent += ' One thumb retains auto-throttle; controller uses RT.';
    }
  }

  setSound(on: boolean): void {
    for (const b of this.soundButtons) {
      b.textContent = on ? 'Sound on' : 'Sound off';
      b.classList.toggle('off', !on);
    }
  }

  /** Highlights the chosen course and says what the player is in for. */
  setMode(mode: GameMode): void {
    this.mode = mode;
    for (const chip of this.modeChips) chip.classList.toggle('on', chip.dataset.mode === mode);
    this.refreshTitleText();
    this.renderBests();
  }

  /**
   * Highlights the chosen control scheme and rebuilds the cues that teach it:
   * the hint thumbs on the title and the hold zones during play.
   */
  setControls(scheme: ControlScheme): void {
    this.scheme = scheme;
    for (const chip of this.controlsChips) {
      chip.classList.toggle('on', chip.dataset.scheme === scheme);
    }
    const zones = ZONES[scheme];
    this.hintEl.classList.toggle('pedals', scheme === 'pedals');
    this.hintEl.replaceChildren(
      ...zones.map((z) => {
        const thumb = el('div', `hint-thumb hint-${z}`);
        thumb.append(el('span', ''));
        must(thumb.firstElementChild).textContent = HINT_LABEL[scheme][z];
        return thumb;
      }),
    );
    // Two thumbs draws its own controls; one thumb gets the faint hold cues
    this.padEl.classList.toggle('show', scheme === 'pedals');
    this.zoneEls = new Map(
      (scheme === 'thumb' ? zones : []).map((z) => {
        const zone = el('div', `zone zone-${z}`);
        zone.textContent = ZONE_LABEL[scheme][z];
        return [z, zone];
      }),
    );
    this.zonesEl.replaceChildren(...this.zoneEls.values());
    for (const hint of this.root.querySelectorAll('.keyboard-driving')) {
      hint.textContent = `A/D or Left/Right to steer · ${scheme === 'pedals' ? 'W/Up for gas' : 'Auto accelerate'} · Space or S/Down for handbrake · Esc/P to pause · R reset in practice/challenge`;
    }
    this.refreshTitleText();
  }

  private refreshTitleText(): void {
    if (this.activity !== 'timed') {
      this.titleTagEl.textContent =
        this.activity === 'challenge' ? 'Two corners. One linked slide.' : 'Your pace. No timer.';
      this.titleSubEl.textContent = this.lesson
        ? LESSONS[this.lesson].objective
        : this.activity === 'challenge'
          ? 'Follow the targets in order. Scored on line, angle and transition.'
          : 'Build speed, start a slide, then catch it. Reset any time.';
      const button = must(this.root.querySelector('.title-cta'));
      button.textContent = this.lesson
        ? `Start ${LESSONS[this.lesson].name}`
        : this.activity === 'challenge'
          ? 'Start challenge'
          : 'Start practice';
      return;
    }
    must(this.root.querySelector('.title-cta')).innerHTML =
      '<span class="touch-only">Tap to drive</span><span class="keyboard-only">Enter to drive</span>';
    const where = this.mode === 'free' ? 'An open lot and nothing to follow. ' : '';
    const how =
      this.scheme === 'thumb'
        ? 'Hold a side to steer, both for handbrake'
        : 'Point the stick where you want to go. Left thumb holds the gas or pulls the handbrake';
    this.titleSubEl.textContent = where + how;
    this.titleTagEl.textContent = `${this.scheme === 'thumb' ? 'One thumb' : 'Two thumbs'}. Sixty seconds.`;
  }

  show(state: GameState): void {
    if (document.activeElement instanceof HTMLElement && this.root.contains(document.activeElement))
      document.activeElement.blur();
    for (const [name, screen] of this.screens) {
      screen.classList.toggle('active', name === state);
      screen.inert = name !== state;
    }
  }

  /**
   * Best score per mode, listed in the title foot so it is plain that each
   * mode keeps its own: the chosen mode's first and brightest, the other
   * dimmed, and a mode with no score yet left out.
   */
  setBests(bests: Readonly<Record<GameMode, number>>): void {
    this.bests = { ...bests };
    this.renderBests();
  }

  private renderBests(): void {
    const order: GameMode[] = [this.mode, ...GAME_MODES.filter((m) => m !== this.mode)];
    this.titleBestEl.replaceChildren(
      ...order
        .filter((m) => this.bests[m] > 0)
        .map((m) => {
          const row = el('div', m === this.mode ? 'best-row on' : 'best-row');
          row.textContent = `${MODE_NAME[m]} best ${fmtScore(this.bests[m])}`;
          return row;
        }),
    );
  }

  /** Shown in a browser on a touch device, where its toolbar sits under the thumb. */
  setInstallHint(show: boolean): void {
    this.installEl.classList.toggle('show', show);
  }

  setCountdown(secondsLeft: number): void {
    const n = Math.ceil(secondsLeft);
    const text = n <= 0 ? 'GO' : String(n);
    if (this.countdownEl.textContent !== text) {
      this.countdownEl.textContent = text;
      restartAnimation(this.countdownEl, 'pop');
    }
  }

  setPlaying(
    score: number,
    timeLeft: number,
    timeTotal: number,
    multiplier: number,
    progress: number,
  ): void {
    this.scoreEl.textContent = fmtScore(score);
    this.timerEl.textContent = timeLeft.toFixed(1);
    const urgent = timeLeft <= 10;
    this.timerEl.classList.toggle('urgent', urgent);
    this.timebarEl.classList.toggle('urgent', urgent);
    this.timebarEl.style.setProperty('--time', (timeLeft / timeTotal).toFixed(4));
    // In the last ten seconds each whole second lands with a snap, not just a digit change
    const whole = Math.ceil(timeLeft);
    if (whole !== this.lastWholeSecond) {
      this.lastWholeSecond = whole;
      if (urgent && timeLeft > 0) restartAnimation(this.timerEl, 'tick');
    }
    const label = `×${multiplier % 1 === 0 ? String(multiplier) : multiplier.toFixed(1)}`;
    if (this.multEl.textContent !== label) {
      this.multEl.textContent = label;
      this.punch(this.multEl.parentElement);
    }
    this.multEl.parentElement?.classList.toggle('hot', multiplier > 1);
    this.ringEl.style.strokeDashoffset = String(this.ringLength * (1 - progress));
  }

  /** Darkens the screen edges while the car is on the grass. */
  setOffRoad(off: boolean): void {
    this.vignetteEl.classList.toggle('show', off);
  }

  /** Sizes and places the pedals and stick from the layout the input reads touches with. */
  setPadLayout(pad: PadLayout): void {
    const style = this.root.style;
    style.setProperty('--pad-inset', `${String(pad.inset)}px`);
    style.setProperty('--pedal-size', `${String(pad.pedalSize)}px`);
    style.setProperty('--pedal-gap', `${String(pad.pedalGap)}px`);
    style.setProperty('--stick-radius', `${String(pad.stickRadius)}px`);
    this.knobTravel = pad.stickRadius - KNOB_RADIUS;
  }

  /** Lights the held pedals and moves the stick knob under the thumb. `stick` is -1..1 per axis. */
  setPad(held: Readonly<Record<Zone, boolean>>, stick: { x: number; y: number }): void {
    for (const part of ['gas', 'brake', 'stick'] as const) {
      this.padParts[part].classList.toggle('held', held[part]);
    }
    this.knobEl.style.setProperty('--knob-x', `${(stick.x * this.knobTravel).toFixed(1)}px`);
    this.knobEl.style.setProperty('--knob-y', `${(stick.y * this.knobTravel).toFixed(1)}px`);
  }

  /** Faint column cues for new players, up to their first lap; `show` fades them in and out. */
  setZones(show: boolean, held: Readonly<Record<Zone, boolean>>): void {
    this.zonesEl.classList.toggle('show', show);
    for (const [zone, zoneEl] of this.zoneEls) zoneEl.classList.toggle('held', held[zone]);
  }

  /** Screen band between the game-over score and its buttons, where the track overview fits. */
  overviewBand(): { top: number; bottom: number } {
    const top = this.overTopEl.getBoundingClientRect().bottom;
    const bottom = this.overActionsEl.getBoundingClientRect().top;
    return bottom > top ? { top, bottom } : { top: 0, bottom: window.innerHeight };
  }

  setGameOver(score: number, best: number, isNewBest: boolean, competitive = true): void {
    must(this.root.querySelector('.challenge-breakdown')).textContent = '';
    must(this.root.querySelector('.result-reason')).textContent = '';
    must(this.root.querySelector('.result-identity')).textContent = '';
    this.finalScoreEl.textContent = fmtScore(score);
    this.finalBestEl.textContent = competitive
      ? `${MODE_NAME[this.mode]} best ${fmtScore(best)}`
      : 'Handling prototype · best not saved';
    this.newBestEl.classList.toggle('show', competitive && isNewBest);
  }

  setActivity(activity: Activity, lesson: LessonId | null = null): void {
    this.activity = activity;
    this.lesson = lesson;
    this.root.dataset.activity = activity;
    for (const chip of this.modeChips) {
      const selected = activity === 'timed' && chip.dataset.mode === this.mode;
      chip.classList.toggle('on', selected);
      chip.setAttribute('aria-pressed', String(selected));
    }
    for (const chip of this.root.querySelectorAll<HTMLElement>('.activity-chip')) {
      const selected =
        chip.dataset.activity === activity ||
        (activity === 'lesson' && chip.dataset.activity === 'practice');
      chip.classList.toggle('on', selected);
      chip.setAttribute('aria-pressed', String(selected));
    }
    for (const menu of this.root.querySelectorAll<HTMLDetailsElement>('.lesson-menu')) {
      menu.hidden = activity === 'timed' || activity === 'challenge';
      menu.open = false;
    }
    must(this.root.querySelector('.activity-name')).textContent = lesson
      ? LESSONS[lesson].name
      : activity === 'challenge'
        ? 'Challenge'
        : 'Practice';
    must(this.root.querySelector('.activity-cue')).textContent = lesson
      ? LESSONS[lesson].objective
      : 'Build speed, steer into a slide, then countersteer to catch it.';
    must(this.root.querySelector<HTMLElement>('.lesson-progress')).hidden = activity !== 'lesson';
    must(this.root.querySelector<HTMLElement>('.lesson-leave')).hidden = activity !== 'lesson';
    must(this.root.querySelector<HTMLElement>('.paused-leave-lesson')).hidden =
      activity !== 'lesson';
    must(this.root.querySelector('.panel-title')).textContent = 'Paused';
    must(this.root.querySelector<HTMLElement>('.practice-exit')).hidden = activity === 'timed';
    must(this.root.querySelector<HTMLElement>('.practice-exit')).textContent =
      activity === 'challenge' ? 'Finish attempt' : 'End practice';
    must(this.root.querySelector('.screen-paused [data-act="restart"]')).textContent =
      activity === 'timed' ? 'Restart' : 'Reset';
    must(this.root.querySelector('.screen-over [data-act="restart"]')).textContent =
      activity === 'timed'
        ? 'Drive again'
        : activity === 'challenge'
          ? 'Retry challenge'
          : 'Practice again';
    this.refreshTitleText();
  }

  setActivityFeedback(cue: string, progress = 0): void {
    const text = must(this.root.querySelector('.activity-cue'));
    if (text.textContent !== cue) text.textContent = cue;
    const bar = this.root.querySelector<HTMLProgressElement>('.lesson-progress');
    if (bar) bar.value = Math.min(1, Math.max(0, progress));
  }

  setPracticeOverview(): void {
    this.setGameOver(0, 0, false, false);
    this.finalScoreEl.textContent = 'Your practice';
    this.finalBestEl.textContent = 'No timer. No score. Just your rubber.';
    must(this.root.querySelector('.share-status')).textContent = '';
  }

  setChallengeResults(
    result: ChallengeState,
    best: number,
    saved: boolean,
    identity: string,
  ): void {
    this.setGameOver(challengeTotal(result), best, saved && challengeTotal(result) > best, false);
    this.finalBestEl.textContent = saved
      ? `Best for this setup ${fmtScore(Math.max(best, challengeTotal(result)))}`
      : best > 0
        ? `Previous best ${fmtScore(best)} · this attempt not saved`
        : 'No best saved for this setup';
    this.newBestEl.classList.toggle('show', saved && challengeTotal(result) > best);
    must(this.root.querySelector('.challenge-breakdown')).textContent =
      `Line ${fmtScore(result.line)} + Angle ${fmtScore(result.angle)} + Transition ${fmtScore(result.transition)}`;
    must(this.root.querySelector('.result-reason')).textContent =
      result.reason || 'Clean link. Carry the same control into your next attempt.';
    must(this.root.querySelector('.result-identity')).textContent = identity;
    must(this.root.querySelector('.share-status')).textContent = saved
      ? 'Best saved for this setup.'
      : 'Result kept here. Saving unavailable or this attempt is not eligible.';
  }

  setLessonComplete(): void {
    must(this.root.querySelector('.panel-title')).textContent = 'Lesson complete';
  }

  setShareStatus(text: string): void {
    must(this.root.querySelector('.share-status')).textContent = text;
  }

  private punch(target: HTMLElement | null): void {
    if (target) restartAnimation(target, 'punch');
  }
}

/** Half the stick knob's CSS size; the knob travels the rest of the radius. */
const KNOB_RADIUS = 28;

/** The courses as the mode chips name them. */
const MODE_NAME: Record<GameMode, string> = { track: 'Circuit', free: 'Free drift' };

const HINT_LABEL: Record<ControlScheme, Record<Zone, string>> = {
  thumb: { left: 'hold', right: 'hold', brake: '', gas: '', stick: '' },
  pedals: { left: '', right: '', brake: 'brake', gas: 'gas', stick: '◀▲▼▶' },
};

const ZONE_LABEL: Record<ControlScheme, Record<Zone, string>> = {
  thumb: { left: '◀ hold', right: 'hold ▶', brake: '', gas: '', stick: '' },
  pedals: { left: '', right: '', brake: '', gas: '', stick: '' },
};

export function fmtScore(n: number): string {
  return Math.round(n).toLocaleString('en-NZ');
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = className;
  return e;
}

function must<T>(v: T | null): T {
  if (v === null) throw new Error('HUD element missing');
  return v;
}

/** Re-trigger a CSS animation class by removing it and adding it back next frame. */
function restartAnimation(el: HTMLElement, cls: string): void {
  el.classList.remove(cls);
  requestAnimationFrame(() => {
    el.classList.add(cls);
  });
}
