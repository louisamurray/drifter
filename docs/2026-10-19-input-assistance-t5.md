# T5 — Input response and assistance

Date: 19 October 2026
Status: implemented and checked locally. T4/Gate 1, physical controller/touch evaluation and human handling acceptance remain pending. This slice does not complete those gates or implement T6/T7.

## Response and ownership

The previous digital controller used the centre-release rate to cross centre, then repeated the full initial steering ramp. Force-prototype reversal now retains its own intent through centre: full left-to-right travel takes 0.24 seconds, independently of 0.12-second full-lock centre return and roughly 0.42-second initial turn-in (previously roughly 0.8 seconds). Both directions use the same coefficients. Releasing or changing intent cancels reversal; reset clears its history.

Force-prototype binary throttle rises over 0.12 seconds and releases over 0.04 seconds; handbrake cuts automatic throttle immediately. Keys remain binary demands. Standard controller triggers retain their analogue values without this ramp. The touch stick remains a desired-heading input, independently tuned to full lock at 0.75 radians of heading error rather than 0.6; its 18% positional deadzone remains. Direct keyboard/controller steering does not pass through the heading controller.

These new response coefficients live in `config.input.force` and apply to the force model selected with `?debug` → Handling. Legacy timed input coefficients and trajectories remain unchanged. Debug sliders distinguish legacy and force steering. These are deterministic starting values for playtesting, not evidence of better subjective handling.

## Controller policy

- Standard-mapped devices only. First available device is selected and kept until disconnected; other devices cannot steal control. Newly selected devices must first return to neutral.
- Left stick X steers, with a rescaled 0.15 deadzone. RT supplies throttle, with a rescaled 0.05 deadzone. A or LT pulls the handbrake. Start starts/retries/resumes; B pauses. Actions are edge-triggered.
- Controls are sampled on physics steps, including action buttons in menus. Keyboard driving keys or a valid canvas touch take over immediately. The controller must return to neutral before it can take over again. A controller always uses manual RT throttle, without changing the saved touch scheme.
- Pause, reset, blur and backgrounding clear input. Held controller values and action buttons cannot reactivate until released. Disconnecting an actively used controller pauses play/countdown, including when another controller is already connected.
- Browser absence/restriction of the Gamepad API leaves keyboard/touch usable.

## Assistance and records

Assisted and Reduced assistance are explicit policies in `src/game/assistance.ts`, applied at the handling boundary for both solvers. Assisted preserves the existing road-following/corner-lift coefficients and force countersteer coefficient of 1. Reduced disables road following, automatic corner braking and automatic countersteer (including legacy self-alignment); it preserves input mapping, tyre dynamics and one-thumb automatic throttle. Manual pedals/controller throttle already bypasses automatic corner lift. The title selector and pause description name the profile and explain automatic throttle; the choice persists independently of the touch scheme. Assistance changes reset the title session.

Force, reduced-assistance and any run that used a controller cannot save into legacy best scores. Switching back to keyboard during a controller run does not remove that exclusion. Full competitive record identity remains T10 work.

## Verification

- `npm test`: 203 passing tests across 21 files, including all existing handling snapshots and drivability checks.
- `npm run build`: passed (includes TypeScript checking).
- `npx eslint src`: passed. `npm run lint` is blocked by the unrelated generated `.remember/tmp/last-ndc.ts`, outside the TypeScript project; left untouched.
- New regressions cover mirrored reversal timing, binary throttle release/handbrake, continuous analogue values/deadzones, device selection, neutral arming, action edges, keyboard takeover, blur/disconnect, reduced-profile force/legacy equivalence with aids absent, preference independence and actual session disconnect pause/resume plus best-score isolation.
- Local Brave title loaded and exposed both assistance buttons (including pressed state), descriptions and controller hints through accessibility inspection. Further interaction/visual inspection stopped when the active browser changed. Desktop/mobile screenshots, physical controller disconnect, touch comfort and moderated handling comparison remain pending.
- Impeccable detector found only the pre-existing bounce easing in `style.css`; preserved outside T5 scope.
