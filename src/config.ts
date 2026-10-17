/**
 * All tunables in one place. `physics`, `input` and `camera` are mutable so the
 * debug panel can adjust them on-device without a rebuild.
 */
export const config = {
  loop: {
    /** Physics step in seconds. 60 Hz regardless of display refresh rate. */
    fixedDt: 1 / 60,
    /** Clamp for a single frame's elapsed time so a tab switch cannot spiral. */
    maxFrameDt: 0.25,
  },
  render: {
    /** Cap devicePixelRatio to protect frame rate on 3x phones. */
    maxDpr: 2,
    /** Vertical anchor of the car on screen (0 top, 1 bottom). Keeps it above the thumb. */
    carScreenY: 0.6,
  },
  input: {
    /** Horizontal drag in CSS px before steering starts. */
    deadZonePx: 8,
    /** Horizontal drag in CSS px for full steering lock. */
    fullLockPx: 60,
  },
  physics: {
    /** World units are pixels at zoom 1. */
    maxSpeed: 460,
    accel: 420,
    /** Linear drag coefficient (1/s) applied to forward speed. */
    drag: 0.55,
    /** Constant rolling deceleration (px/s^2) when coasting. */
    rolling: 40,
    /** Lateral damping (1/s) with grip. Higher snaps the car straight faster. */
    gripNormal: 8,
    /** Lateral damping (1/s) while drifting. Low keeps the slide going. */
    gripDrift: 2.4,
    /** Fraction of grip lost at full steer and full speed. Lets the car break loose. */
    steerGripLoss: 0.6,
    /** Peak yaw rate (rad/s) at full steer. */
    steerRate: 2.8,
    /** Forward speed at which steering has full authority. */
    steerFullSpeed: 140,
    /** Yaw rate reduction at max speed (0 none, 1 no steering at top speed). */
    highSpeedSteerLoss: 0.4,
    /** Yaw multiplier while drifting so holding the slide feels intentional. */
    driftYawBoost: 1.15,
    /** Throttle multiplier while drifting. Offsets the speed a slide scrubs off. */
    driftAccelBoost: 1.8,
    /** Lateral speed (px/s) above which the car counts as drifting. */
    driftEnterLateral: 70,
    /** Lateral speed (px/s) below which a drift ends. Hysteresis against flicker. */
    driftExitLateral: 35,
    /** Minimum forward speed for a drift to count. */
    driftMinForward: 110,
  },
  track: {
    /** Road width in world px. */
    width: 130,
    /** Scale applied to the track's control points. */
    scale: 1,
  },
  offTrack: {
    /** Multipliers applied to physics while off the road. */
    accel: 0.5,
    drag: 2.5,
    grip: 0.6,
  },
  scoring: {
    /** Run length in seconds. */
    runSeconds: 60,
    /** Points per second at x1 = pointsScale * |slip angle in rad| * speed. */
    pointsScale: 1,
    /** Multiplier gained per step, and seconds of continuous drift per step. */
    multiplierStep: 0.5,
    multiplierEvery: 2,
    multiplierMax: 5,
    /** Seconds without drifting before a chain banks. */
    graceSeconds: 1,
    /** Flat bonus for completing a lap. */
    lapBonus: 500,
    /** Countdown length in seconds. */
    countdownSeconds: 3,
  },
  juice: {
    /** Skid canvas resolution in pixels per world unit. */
    skidScale: 1.25,
    /** Alpha laid down per pass at full drift intensity. Builds up on repeated passes. */
    skidAlpha: 0.28,
    skidWidth: 6,
    /** Lateral speed at which skid and smoke intensity saturate. */
    fullIntensityLateral: 220,
    /** Smoke particles per second per wheel at full intensity. */
    smokeRate: 26,
    smokeMax: 240,
    /** Screen shake on chain bank: base px plus px per decade of chain size. */
    shakeBase: 3,
    shakePerDecade: 2.5,
    shakeMax: 14,
    shakeDuration: 0.32,
  },
  camera: {
    /** Seconds of velocity to lead the car by. */
    leadTime: 0.35,
    /** Position smoothing rate (1/s). */
    followRate: 6,
    /** Zoom at rest. */
    zoomRest: 1.1,
    /** Zoom at max speed. */
    zoomFast: 0.85,
    /** Zoom smoothing rate (1/s). */
    zoomRate: 2.5,
    /** Fraction of the screen the whole track fills on the game-over overview. */
    overviewFill: 0.8,
  },
  palette: {
    asphalt: '#1c2230',
    edgeLine: '#e8dcc4',
    offTrack: '#4a5238',
    skid: 'rgba(12, 10, 8, 0.7)',
    accent: '#ff5a2d',
    hudText: '#f2eee6',
    carBody: '#e8dcc4',
    carRoof: '#fffaf0',
    carWheel: '#0d1016',
    carOutline: 'rgba(13, 16, 22, 0.55)',
    smoke: '210, 205, 195',
  },
};

export type Config = typeof config;
export type PhysicsConfig = Config['physics'];
