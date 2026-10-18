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
    /**
     * Two-stage steering. A hold first ramps to `stage1` (a grip turn) over
     * `stage1Seconds`, then on to full lock over `stage2Seconds` (the drift).
     * Tap to correct, hold to commit. Release returns to centre in `releaseSeconds`.
     */
    steer: {
      stage1: 0.5,
      stage1Seconds: 0.3,
      stage2Seconds: 0.5,
      releaseSeconds: 0.1,
    },
    /** Seconds for a pressed gas pedal to reach full throttle in the two-thumb scheme. */
    throttleSeconds: 0.15,
  },
  physics: {
    /** World units are pixels at zoom 1. */
    maxSpeed: 360,
    accel: 420,
    /** Linear drag coefficient (1/s) applied to forward speed. */
    drag: 0.55,
    /** Constant rolling deceleration (px/s^2) when coasting. */
    rolling: 40,
    /** Lateral damping (1/s) with grip. Higher snaps the car straight faster. */
    gripNormal: 8,
    /** Lateral damping (1/s) while drifting. Low keeps the slide going. */
    gripDrift: 3,
    /** Fraction of grip lost at full steer and full speed. Lets the car break loose. */
    steerGripLoss: 0.6,
    /** Peak yaw rate (rad/s) at full steer. */
    steerRate: 3.6,
    /** Forward speed at which steering has full authority. */
    steerFullSpeed: 140,
    /** Yaw rate reduction at max speed (0 none, 1 no steering at top speed). */
    highSpeedSteerLoss: 0.4,
    /** Yaw multiplier while drifting so holding the slide feels intentional. */
    driftYawBoost: 1.15,
    /**
     * Throttle cut in the second steering stage: a long hold slows the car as
     * it tightens the slide, so corners are makeable without the handbrake.
     * Full lock multiplies throttle by (1 - turnThrottleCut).
     */
    turnThrottleCut: 0.5,
    turnThrottleFrom: 0.5,
    /** Throttle multiplier while drifting. Offsets the speed a slide scrubs off. */
    driftAccelBoost: 1.5,
    /** Lateral speed (px/s) above which the car counts as drifting. */
    driftEnterLateral: 70,
    /** Lateral speed (px/s) below which a drift ends. Hysteresis against flicker. */
    driftExitLateral: 35,
    /** Minimum forward speed for a drift to count. */
    driftMinForward: 110,
    /** Lateral damping (1/s) while the handbrake is held. Low: the rear steps out. */
    handbrakeGrip: 1.1,
    /** Extra linear drag (1/s) while the handbrake is held. */
    handbrakeDrag: 1.3,
    /**
     * Road assist: with no steering held and on asphalt, the heading eases
     * towards the road direction. Yaw = clamp(error * gain, max), scaled down
     * while drifting so a slide can still be exited on the player's terms.
     */
    assistGain: 2.2,
    assistMaxYaw: 1.2,
    assistDriftScale: 0.5,
    /**
     * Corner lift: the automatic throttle eases off when the car is faster
     * than the road ahead can take. Corner speed for a radius R is
     * sqrt(cornerAccel * R), capped at maxSpeed. The car looks liftLookSeconds
     * of travel ahead (at least liftMinLook px), lifts fully once it is
     * liftBand px/s over the limit, and sheds speed with liftDrag while lifted.
     */
    cornerAccel: 300,
    liftLookSeconds: 1.2,
    liftMinLook: 120,
    liftBand: 40,
    liftDrag: 1.5,
  },
  track: {
    /** Road width in world px. */
    width: 130,
    /** Scale applied to the track's control points. */
    scale: 1,
  },
  lot: {
    /** Asphalt size of the free drift lot in world px, centred on the origin. About five screens tall. */
    width: 1800,
    height: 2600,
    /** Corner radius of the asphalt. */
    corner: 300,
    /** Radius of the painted skidpad ring in the middle. */
    ring: 260,
    /** Painted parking bays along the long edges: depth into the lot and spacing, in world px. */
    bayDepth: 90,
    bayPitch: 50,
  },
  offTrack: {
    /** Multipliers applied to physics while off the road. */
    accel: 0.5,
    drag: 3,
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
    /** Points rate multiplier while the handbrake is held. Starts chains, not free points. */
    handbrakeScoreScale: 0.35,
    /** Fraction of an open chain kept when the car leaves the road. The rest is lost. */
    offTrackKeep: 0.5,
    /** Countdown length in seconds. */
    countdownSeconds: 3,
  },
  juice: {
    /** Skid canvas resolution in pixels per world unit. */
    skidScale: 1.25,
    /** Cap on the skid canvas area, so a large course lowers its resolution instead of its frame rate. */
    skidMaxPixels: 5e6,
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
    /** Fraction of the free band the whole track fills on the game-over overview. */
    overviewFill: 0.86,
  },
  palette: {
    asphalt: '#1c2230',
    edgeLine: '#e8dcc4',
    offTrack: '#4a5238',
    /** Mown-stripe and speck tones for the grass texture. Barely-there on purpose. */
    offTrackStripe: '#4d5539',
    offTrackSpeckLight: '#565f42',
    offTrackSpeckDark: '#3f4630',
    /** Soft shadow outside the edge line that lifts the road off the grass. */
    trackShadow: 'rgba(0, 0, 0, 0.18)',
    carShadow: 'rgba(0, 0, 0, 0.3)',
    /** Halo behind the chain text and popups so they read over any surface. */
    textHalo: 'rgba(18, 23, 31, 0.75)',
    skid: 'rgba(12, 10, 8, 0.7)',
    accent: '#ff5a2d',
    hudText: '#f2eee6',
    carBody: '#e8dcc4',
    carRoof: '#fffaf0',
    carGlass: '#262e3d',
    carWheel: '#0d1016',
    carOutline: 'rgba(13, 16, 22, 0.55)',
    smoke: '210, 205, 195',
  },
};

export type Config = typeof config;
export type PhysicsConfig = Config['physics'];
