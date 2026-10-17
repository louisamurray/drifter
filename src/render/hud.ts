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
  private readonly multEl: HTMLElement;
  private readonly ringEl: SVGCircleElement;
  private readonly ringLength: number;

  // Title / game over
  private readonly titleBestEl: HTMLElement;
  private readonly finalScoreEl: HTMLElement;
  private readonly finalBestEl: HTMLElement;
  private readonly newBestEl: HTMLElement;
  private readonly countdownEl: HTMLElement;
  private readonly shareBtn: HTMLButtonElement;

  onStart: (() => void) | null = null;
  onRestart: (() => void) | null = null;
  onResume: (() => void) | null = null;
  onShare: (() => void) | null = null;

  constructor(parent: HTMLElement) {
    this.root = el('div', 'hud');
    parent.append(this.root);

    // Title
    const title = el('button', 'screen screen-title');
    title.innerHTML = `
      <div class="title-logo">DRIFTER</div>
      <div class="hint"><div class="hint-thumb"></div></div>
      <div class="title-cta">Tap to drive</div>
      <div class="title-best"></div>`;
    title.addEventListener('click', () => {
      this.onStart?.();
    });
    this.titleBestEl = must(title.querySelector('.title-best'));
    this.screens.set('title', title);

    // Countdown
    const countdown = el('div', 'screen screen-countdown');
    this.countdownEl = el('div', 'countdown-number');
    countdown.append(this.countdownEl);
    this.screens.set('countdown', countdown);

    // Playing
    const playing = el('div', 'screen screen-playing');
    playing.innerHTML = `
      <div class="hud-score"><span class="label">score</span><span class="value">0</span></div>
      <div class="hud-timer">60.0</div>
      <div class="hud-mult">
        <svg viewBox="0 0 44 44" class="ring">
          <circle class="ring-track" cx="22" cy="22" r="19"></circle>
          <circle class="ring-fill" cx="22" cy="22" r="19"></circle>
        </svg>
        <span class="mult-value">×1</span>
      </div>`;
    this.scoreEl = must(playing.querySelector('.hud-score .value'));
    this.timerEl = must(playing.querySelector('.hud-timer'));
    this.multEl = must(playing.querySelector('.mult-value'));
    this.ringEl = must(playing.querySelector('.ring-fill'));
    this.ringLength = 2 * Math.PI * 19;
    this.ringEl.style.strokeDasharray = String(this.ringLength);
    this.screens.set('playing', playing);

    // Paused
    const paused = el('div', 'screen screen-paused');
    paused.innerHTML = `
      <div class="panel">
        <div class="panel-title">Paused</div>
        <button class="btn btn-primary" data-act="resume">Resume</button>
        <button class="btn" data-act="restart">Restart</button>
      </div>`;
    paused.addEventListener('click', (e) => {
      this.dispatch(e);
    });
    this.screens.set('paused', paused);

    // Game over
    const over = el('div', 'screen screen-over');
    over.innerHTML = `
      <div class="over-top">
        <div class="over-newbest">New best</div>
        <div class="over-score">0</div>
        <div class="over-best">best 0</div>
      </div>
      <div class="over-actions">
        <button class="btn btn-primary btn-large" data-act="restart">Drive again</button>
        <button class="btn" data-act="share">Share</button>
      </div>`;
    over.addEventListener('click', (e) => {
      this.dispatch(e);
    });
    this.finalScoreEl = must(over.querySelector('.over-score'));
    this.finalBestEl = must(over.querySelector('.over-best'));
    this.newBestEl = must(over.querySelector('.over-newbest'));
    this.shareBtn = must(over.querySelector('[data-act="share"]'));
    if (!('share' in navigator)) this.shareBtn.hidden = true;
    this.screens.set('gameover', over);

    for (const s of this.screens.values()) this.root.append(s);
  }

  private dispatch(e: Event): void {
    const target = e.target;
    if (!(target instanceof HTMLElement)) return;
    const act = target.closest<HTMLElement>('[data-act]')?.dataset.act;
    if (act === 'resume') this.onResume?.();
    else if (act === 'restart') this.onRestart?.();
    else if (act === 'share') this.onShare?.();
  }

  show(state: GameState): void {
    for (const [name, screen] of this.screens) {
      screen.classList.toggle('active', name === state);
    }
  }

  setTitleBest(best: number): void {
    this.titleBestEl.textContent = best > 0 ? `best ${fmtScore(best)}` : '';
  }

  setCountdown(secondsLeft: number): void {
    const n = Math.ceil(secondsLeft);
    const text = n <= 0 ? 'GO' : String(n);
    if (this.countdownEl.textContent !== text) {
      this.countdownEl.textContent = text;
      restartAnimation(this.countdownEl, 'pop');
    }
  }

  setPlaying(score: number, timeLeft: number, multiplier: number, progress: number): void {
    this.scoreEl.textContent = fmtScore(score);
    this.timerEl.textContent = timeLeft.toFixed(1);
    this.timerEl.classList.toggle('urgent', timeLeft <= 10);
    const label = `×${multiplier % 1 === 0 ? String(multiplier) : multiplier.toFixed(1)}`;
    if (this.multEl.textContent !== label) {
      this.multEl.textContent = label;
      this.punch(this.multEl.parentElement);
    }
    this.multEl.parentElement?.classList.toggle('hot', multiplier > 1);
    this.ringEl.style.strokeDashoffset = String(this.ringLength * (1 - progress));
  }

  setGameOver(score: number, best: number, isNewBest: boolean): void {
    this.finalScoreEl.textContent = fmtScore(score);
    this.finalBestEl.textContent = `best ${fmtScore(best)}`;
    this.newBestEl.classList.toggle('show', isNewBest);
  }

  private punch(target: HTMLElement | null): void {
    if (target) restartAnimation(target, 'punch');
  }
}

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
