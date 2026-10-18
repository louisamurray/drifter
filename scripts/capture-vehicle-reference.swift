// Compile with ios/Drifter/Game/Vehicle.swift as a standalone main.swift harness.
// Uses the native solver directly; does not build or modify the iOS application.
import Foundation

let timestep = 1.0 / 120.0
var results: [[String: Any]] = []

for name in ["straight", "partThrottleTurn", "powerOver", "handbrakeRelease", "grass"] {
    var car = CarState(x: 0, y: 0, heading: 0)
    if name == "powerOver" { car.vx = 15 }
    if name == "handbrakeRelease" { car.vx = 20 }
    let seconds = name == "straight" ? 20 : name == "partThrottleTurn" ? 10 : name == "handbrakeRelease" ? 4 : 5
    var maxSlip = 0.0
    var driftSeconds = 0.0
    var timeTo100: Double? = nil
    for i in 0..<(seconds * 120) {
        var input = InputState(throttle: 1, steer: 0, handbrake: false)
        var assist = DriveAssist(steer: 0, counter: 0, lift: 0)
        if name == "partThrottleTurn" {
            input.throttle = 0.55
            input.steer = i < 480 ? 0 : 1
            assist.counter = 1
        } else if name == "powerOver" {
            let velocity = car.worldVelocity
            let target = atan2(velocity.y, velocity.x) + 0.35
            input.steer = i < 60 ? 1 : clamp(angleDelta(car.heading, target) / 0.6, -1, 1)
        } else if name == "handbrakeRelease" {
            input.handbrake = i < 50
            input.throttle = input.handbrake ? 0 : 1
            input.steer = i < 80 ? 1 : 0
            assist.counter = 1
        }
        stepCar(&car, input: input, dt: timestep, surface: name == "grass" ? .grass : .asphalt, assist: assist)
        maxSlip = max(maxSlip, abs(car.slipAngle))
        if car.drifting { driftSeconds += timestep }
        if timeTo100 == nil && car.speed >= 27.78 { timeTo100 = Double(i + 1) * timestep }
    }
    var result: [String: Any] = [
        "name": name, "seconds": seconds, "x": car.x, "y": car.y,
        "heading": car.heading, "forwardSpeed": car.vx, "lateralSpeed": car.vy,
        "yawRate": car.yawRate, "speed": car.speed, "slip": car.slipAngle,
        "maxSlip": maxSlip, "driftSeconds": driftSeconds,
    ]
    if let timeTo100 { result["timeTo100"] = timeTo100 }
    results.append(result)
}

let data = try JSONSerialization.data(withJSONObject: [
    "source": "ios/Drifter/Game/Vehicle.swift",
    "timestep": timestep,
    "scenarios": results,
], options: [.prettyPrinted, .sortedKeys])
print(String(decoding: data, as: UTF8.self))
