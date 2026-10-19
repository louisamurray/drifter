export function pad(index = 0, axis = 0, gas = 0, buttons: number[] = []): Gamepad {
  return {
    id: 'test standard controller',
    timestamp: 0,
    vibrationActuator: {} as GamepadHapticActuator,
    index,
    mapping: 'standard',
    connected: true,
    axes: [axis],
    buttons: Array.from({ length: 17 }, (_, i) => ({
      pressed: buttons.includes(i),
      touched: false,
      value: i === 7 ? gas : buttons.includes(i) ? 1 : 0,
    })),
  };
}
