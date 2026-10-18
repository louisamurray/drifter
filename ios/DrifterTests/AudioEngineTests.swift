import XCTest
@testable import Drifter

final class AudioEngineTests: XCTestCase {
    private enum SessionError: Error { case unavailable }

    @MainActor
    func testSlowActivationDoesNotBlockMainThreadOrLifecycleRequests() async {
        let activationStarted = expectation(description: "Activation started off main")
        let activationFinished = expectation(description: "Activation released")
        let releaseActivation = DispatchSemaphore(value: 0)
        let audio = AudioEngine(activateSession: {
            XCTAssertFalse(Thread.isMainThread)
            activationStarted.fulfill()
            // A timeout also makes a regression fail without hanging the test runner.
            let result = releaseActivation.wait(timeout: .now() + 5)
            XCTAssertEqual(result, .success)
            activationFinished.fulfill()
            throw SessionError.unavailable
        })
        defer { releaseActivation.signal() }

        audio.start()
        await fulfillment(of: [activationStarted], timeout: 2)
        // These must return even while activation is still blocked.
        audio.suspend()
        audio.resume()
        releaseActivation.signal()
        await fulfillment(of: [activationFinished], timeout: 2)
    }

    @MainActor
    func testRepeatedStartsAreSerializedAndCanRetryAfterActivationFailure() async {
        let firstStarted = expectation(description: "First activation started")
        let retried = expectation(description: "Activation retried after failure")
        let releaseActivation = DispatchSemaphore(value: 0)
        var attempts = 0 // Accessed only inside the serialized activation closure.
        var firstFinished = false
        let audio = AudioEngine(activateSession: {
            XCTAssertFalse(Thread.isMainThread)
            attempts += 1
            if attempts == 1 {
                firstStarted.fulfill()
                XCTAssertEqual(releaseActivation.wait(timeout: .now() + 5), .success)
                firstFinished = true
            } else {
                XCTAssertTrue(firstFinished)
                XCTAssertEqual(attempts, 2)
                retried.fulfill()
            }
            throw SessionError.unavailable
        })
        defer { releaseActivation.signal() }

        audio.start()
        await fulfillment(of: [firstStarted], timeout: 2)
        audio.start()
        releaseActivation.signal()
        await fulfillment(of: [retried], timeout: 2)
    }
}
