/** Isolated two-axle solver. Metres, seconds, y-up, counter-clockwise radians. */
export interface VehicleConfig {
  readonly mass: number;
  readonly yawInertia: number;
  readonly frontAxleDistance: number;
  readonly rearAxleDistance: number;
  readonly cgHeight: number;
  readonly maxSteer: number;
  readonly minSteer: number;
  readonly limitLateralG: number;
  readonly peakSlip: number;
  readonly driveForce: number;
  readonly topSpeed: number;
  readonly engineBrake: number;
  readonly brakeForce: number;
  readonly dragArea: number;
  readonly airDensity: number;
  readonly rollingCoefficient: number;
  readonly tyreBFront: number;
  readonly tyreBRear: number;
  readonly tyreCFront: number;
  readonly tyreCRear: number;
  readonly tyreE: number;
  readonly rearGrip: number;
  readonly frontGrip: number;
  readonly yawDamping: number;
  readonly handbrakeFriction: number;
  readonly counterSteerGain: number;
  readonly heldCounterSteerGain: number;
  readonly driftEnterSlip: number;
  readonly driftExitSlip: number;
  readonly driftMinSpeed: number;
  readonly lowSpeed: number;
}

const defaults: VehicleConfig = {
  mass: 1250,
  yawInertia: 2100,
  frontAxleDistance: 1.15,
  rearAxleDistance: 1.35,
  cgHeight: 0.45,
  maxSteer: 0.6,
  minSteer: 0.14,
  limitLateralG: 1,
  peakSlip: 0.15,
  driveForce: 7200,
  topSpeed: 38,
  engineBrake: 500,
  brakeForce: 6500,
  dragArea: 0.75,
  airDensity: 1.2,
  rollingCoefficient: 0.015,
  tyreBFront: 9.5,
  tyreBRear: 7.5,
  tyreCFront: 1.3,
  tyreCRear: 1.25,
  tyreE: 0.95,
  rearGrip: 1.12,
  frontGrip: 0.95,
  yawDamping: 1200,
  handbrakeFriction: 0.75,
  counterSteerGain: 0.85,
  heldCounterSteerGain: 0.35,
  driftEnterSlip: 0.2,
  driftExitSlip: 0.1,
  driftMinSpeed: 7,
  lowSpeed: 0.8,
};

/** Validate tuning once when creating a model, outside the physics loop. */
export function createVehicleConfig(overrides: Partial<VehicleConfig> = {}): VehicleConfig {
  const model = { ...defaults, ...overrides };
  for (const [key, value] of Object.entries(model)) {
    if (!Number.isFinite(value) || value < 0) throw new RangeError(`Invalid vehicle ${key}`);
  }
  for (const key of [
    'mass',
    'yawInertia',
    'frontAxleDistance',
    'rearAxleDistance',
    'topSpeed',
    'tyreBFront',
    'tyreBRear',
    'tyreCFront',
    'tyreCRear',
    'lowSpeed',
  ] as const) {
    if (model[key] === 0) throw new RangeError(`Vehicle ${key} must be positive`);
  }
  if (
    model.maxSteer >= Math.PI / 2 ||
    model.minSteer > model.maxSteer ||
    model.driftExitSlip > model.driftEnterSlip ||
    model.tyreE > 1 ||
    model.tyreCFront > 2 ||
    model.tyreCRear > 2
  ) {
    throw new RangeError('Invalid vehicle steering, drift or tyre range');
  }
  return Object.freeze(model);
}

export const STANDARD_VEHICLE = createVehicleConfig();
export const GRAVITY = 9.81;

export interface VehicleSurface {
  readonly friction: number;
  readonly rollingResistance: number;
  readonly drive: number;
}

export const ASPHALT: VehicleSurface = Object.freeze({
  friction: 1,
  rollingResistance: 1,
  drive: 1,
});
export const GRASS: VehicleSurface = Object.freeze({
  friction: 0.6,
  rollingResistance: 6,
  drive: 0.5,
});

export interface VehicleInput {
  readonly throttle: number;
  /** Normalised lock: -1 right, +1 left. Web input requires a sign conversion. */
  readonly steer: number;
  readonly handbrake: boolean;
}

export interface VehicleAssist {
  /** Additional road-wheel angle, in radians. */
  readonly steer: number;
  readonly counterSteer: number;
  readonly lift: number;
}

/** Unlike the native default, omitting assistance really disables it. */
export const NO_ASSIST: VehicleAssist = Object.freeze({ steer: 0, counterSteer: 0, lift: 0 });
export const COUNTERSTEER_ASSIST: VehicleAssist = Object.freeze({
  steer: 0,
  counterSteer: 1,
  lift: 0,
});

export interface VehicleState {
  x: number;
  y: number;
  heading: number;
  /** Body-frame velocities: forward and left, never world-space vx/vy. */
  forwardSpeed: number;
  lateralSpeed: number;
  yawRate: number;
  /** Last force-derived forward acceleration, used for longitudinal load transfer. */
  acceleration: number;
  /** Applied road-wheel angle and post-step body slip, in radians. */
  steer: number;
  slip: number;
  drifting: boolean;
  loadFront: number;
  loadRear: number;
  slipFront: number;
  slipRear: number;
  /** Approximate excess drive demand, not a wheel-speed simulation. */
  wheelspin: number;
  /** Last-step forces in each axle's wheel frame, for traction diagnostics. */
  forceFrontX: number;
  forceFrontY: number;
  forceRearX: number;
  forceRearY: number;
}

export function createVehicleState(x = 0, y = 0, heading = Math.PI / 2): VehicleState {
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(heading)) {
    throw new RangeError('Vehicle pose must be finite');
  }
  return {
    x,
    y,
    heading,
    forwardSpeed: 0,
    lateralSpeed: 0,
    yawRate: 0,
    acceleration: 0,
    steer: 0,
    slip: 0,
    drifting: false,
    loadFront: 0,
    loadRear: 0,
    slipFront: 0,
    slipRear: 0,
    wheelspin: 0,
    forceFrontX: 0,
    forceFrontY: 0,
    forceRearX: 0,
    forceRearY: 0,
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function magic(slip: number, b: number, c: number, e: number): number {
  const bs = b * slip;
  return Math.sin(c * Math.atan(bs - e * (bs - Math.atan(bs))));
}

export function vehicleSteerLock(speed: number, model: VehicleConfig = STANDARD_VEHICLE): number {
  const wheelbase = model.frontAxleDistance + model.rearAxleDistance;
  const velocity = Math.max(Math.abs(speed), 1);
  return clamp(
    Math.atan((wheelbase * model.limitLateralG * GRAVITY) / (velocity * velocity)) + model.peakSlip,
    model.minSteer,
    model.maxSteer,
  );
}

/** Bound passive tyre impulses at a crawl so explicit integration cannot overshoot contact rest. */
function passiveForce(force: number, velocity: number, inverseMass: number, dt: number): number {
  return -Math.sign(velocity) * Math.min(Math.abs(force), Math.abs(velocity) / (inverseMass * dt));
}

/**
 * Advance one fixed solver step (at most 1/60 s); mutates only the caller-owned state.
 * Model tuning must come from createVehicleConfig. No course, rendering or scoring dependencies.
 */
export function stepVehicle(
  car: VehicleState,
  input: VehicleInput,
  dt: number,
  model: VehicleConfig = STANDARD_VEHICLE,
  surface: VehicleSurface = ASPHALT,
  assist: VehicleAssist = NO_ASSIST,
): void {
  if (!Number.isFinite(dt) || dt < 0 || dt > 1 / 60)
    throw new RangeError('Invalid vehicle timestep');
  if (dt === 0) return;
  if (
    !Number.isFinite(input.throttle) ||
    !Number.isFinite(input.steer) ||
    !Number.isFinite(assist.steer) ||
    !Number.isFinite(assist.counterSteer) ||
    !Number.isFinite(assist.lift) ||
    !Number.isFinite(surface.friction) ||
    surface.friction < 0 ||
    !Number.isFinite(surface.rollingResistance) ||
    surface.rollingResistance < 0 ||
    !Number.isFinite(surface.drive) ||
    surface.drive < 0 ||
    !Number.isFinite(car.x) ||
    !Number.isFinite(car.y) ||
    !Number.isFinite(car.heading) ||
    !Number.isFinite(car.forwardSpeed) ||
    !Number.isFinite(car.lateralSpeed) ||
    !Number.isFinite(car.yawRate) ||
    !Number.isFinite(car.acceleration)
  ) {
    throw new RangeError('Non-finite vehicle state, input or invalid surface');
  }
  const throttle = clamp(input.throttle, 0, 1);
  const steer = clamp(input.steer, -1, 1);
  const lift = clamp(assist.lift, 0, 1);
  const m = model.mass;
  const inertia = model.yawInertia;
  const a = model.frontAxleDistance;
  const b = model.rearAxleDistance;
  const speed = Math.hypot(car.forwardSpeed, car.lateralSpeed);
  const slip = speed > 1 ? Math.atan2(car.lateralSpeed, car.forwardSpeed) : 0;
  const counter =
    (steer === 0 ? model.counterSteerGain : model.heldCounterSteerGain) *
    clamp(assist.counterSteer, 0, 1);
  const delta = clamp(
    steer * vehicleSteerLock(speed, model) +
      assist.steer +
      (car.forwardSpeed > 2 ? counter * slip : 0),
    -model.maxSteer,
    model.maxSteer,
  );
  const cosD = Math.cos(delta);
  const sinD = Math.sin(delta);

  const weight = m * GRAVITY;
  const staticFront = (weight * b) / (a + b);
  const staticRear = (weight * a) / (a + b);
  const transfer = clamp(
    (m * car.acceleration * model.cgHeight) / (a + b),
    -Math.min(0.4 * weight, 0.9 * staticRear),
    Math.min(0.4 * weight, 0.9 * staticFront),
  );
  const loadFront = staticFront - transfer;
  const loadRear = staticRear + transfer;
  const peakFront = surface.friction * model.frontGrip * loadFront;
  const peakRear = surface.friction * model.rearGrip * loadRear;

  // Project contact velocity into the steered wheel frame. This remains dissipative in reverse.
  const frontBodyLateral = car.lateralSpeed + a * car.yawRate;
  const frontForward = car.forwardSpeed * cosD + frontBodyLateral * sinD;
  const frontLateral = -car.forwardSpeed * sinD + frontBodyLateral * cosD;
  const rearLateral = car.lateralSpeed - b * car.yawRate;
  const slipFront = Math.atan2(frontLateral, Math.max(Math.abs(frontForward), model.lowSpeed));
  const slipRear = Math.atan2(rearLateral, Math.max(Math.abs(car.forwardSpeed), model.lowSpeed));
  let forceFrontX = passiveForce(
    lift * model.brakeForce * 0.6,
    frontForward,
    1 / m + (a * a * sinD * sinD) / inertia,
    dt,
  );
  forceFrontX = clamp(forceFrontX, -0.95 * peakFront, 0.95 * peakFront);
  const capFrontY = Math.sqrt(Math.max(0, peakFront * peakFront - forceFrontX * forceFrontX));
  const forceFrontY = passiveForce(
    capFrontY * magic(slipFront, model.tyreBFront, model.tyreCFront, model.tyreE),
    frontLateral,
    1 / m + (a * a * cosD * cosD) / inertia,
    dt,
  );
  const frontBodyX = forceFrontX * cosD - forceFrontY * sinD;
  const frontBodyY = forceFrontY * cosD + forceFrontX * sinD;
  // The rear brake spends only momentum left after the front axle's impulse.
  const afterFrontForward = car.forwardSpeed + (frontBodyX / m) * dt;
  let forceRearX: number;
  let forceRearY: number;
  let wheelspin = 0;
  if (input.handbrake) {
    const patchSpeed = Math.hypot(car.forwardSpeed, rearLateral);
    const lockedForce =
      Math.min(peakRear, model.handbrakeFriction * surface.friction * loadRear) *
      Math.min(1, patchSpeed / 1.5);
    forceRearX =
      patchSpeed > 0
        ? passiveForce((lockedForce * car.forwardSpeed) / patchSpeed, afterFrontForward, 1 / m, dt)
        : 0;
    forceRearY =
      patchSpeed > 0
        ? passiveForce(
            (lockedForce * rearLateral) / patchSpeed,
            rearLateral,
            1 / m + (b * b) / inertia,
            dt,
          )
        : 0;
  } else {
    const drive =
      throttle *
      (1 - lift) *
      model.driveForce *
      surface.drive *
      Math.max(0, 1 - (speed / model.topSpeed) ** 3);
    const braking = (throttle < 0.05 ? model.engineBrake : 0) + lift * model.brakeForce * 0.4;
    const demand = drive + passiveForce(braking, afterFrontForward, 1 / m, dt);
    const cap = 0.95 * peakRear;
    wheelspin = peakRear > 0 ? clamp((drive - cap) / (0.6 * peakRear), 0, 1) : drive > 0 ? 1 : 0;
    forceRearX = clamp(demand, -cap, cap);
    const capRearY = Math.sqrt(Math.max(0, peakRear * peakRear - forceRearX * forceRearX));
    forceRearY = passiveForce(
      capRearY * magic(slipRear, model.tyreBRear, model.tyreCRear, model.tyreE),
      rearLateral,
      1 / m + (b * b) / inertia,
      dt,
    );
  }

  const acceleration = (forceRearX + frontBodyX) / m;
  const forward = car.forwardSpeed + acceleration * dt;
  const lateral = car.lateralSpeed + ((forceRearY + frontBodyY) / m) * dt;
  let yawRate =
    (car.yawRate + ((a * frontBodyY - b * forceRearY) / inertia) * dt) /
    (1 + (model.yawDamping / inertia) * dt);
  if (speed < 2) yawRate *= Math.exp(-3 * dt);

  // Apply resistance without reversing momentum, then rotate the body frame exactly.
  const movingSpeed = Math.hypot(forward, lateral);
  const dragFactor = 1 / (1 + ((0.5 * model.airDensity * model.dragArea) / m) * movingSpeed * dt);
  const afterDrag = movingSpeed * dragFactor;
  const afterRolling = Math.max(
    0,
    afterDrag - model.rollingCoefficient * surface.rollingResistance * GRAVITY * dt,
  );
  const resistanceScale = movingSpeed > 0 ? afterRolling / movingSpeed : 0;
  const turn = yawRate * dt;
  const cosT = Math.cos(turn);
  const sinT = Math.sin(turn);
  const vx = (forward * cosT + lateral * sinT) * resistanceScale;
  const vy = (-forward * sinT + lateral * cosT) * resistanceScale;
  const heading = car.heading + turn;
  car.x += (vx * Math.cos(heading) - vy * Math.sin(heading)) * dt;
  car.y += (vx * Math.sin(heading) + vy * Math.cos(heading)) * dt;
  car.heading = heading;
  car.acceleration = (forward * resistanceScale - car.forwardSpeed) / dt;
  car.forwardSpeed = vx;
  car.lateralSpeed = vy;
  car.yawRate = yawRate;
  car.steer = delta;
  const finalSpeed = Math.hypot(vx, vy);
  car.slip = finalSpeed > 1 ? Math.atan2(vy, vx) : 0;
  car.drifting =
    Math.abs(car.slip) > (car.drifting ? model.driftExitSlip : model.driftEnterSlip) &&
    finalSpeed > model.driftMinSpeed * (car.drifting ? 0.6 : 1);
  car.loadFront = loadFront;
  car.loadRear = loadRear;
  car.slipFront = slipFront;
  car.slipRear = slipRear;
  car.wheelspin = wheelspin;
  car.forceFrontX = forceFrontX;
  car.forceFrontY = forceFrontY;
  car.forceRearX = forceRearX;
  car.forceRearY = forceRearY;
}
