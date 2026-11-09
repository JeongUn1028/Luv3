import { describe, expect, it } from "vitest";
import { createErrorRetryTracker, ERROR_RETRY_RESET_DELAY_MS } from "./error-retry";

/** 예약한 일을 테스트가 시간을 옮겨 돌린다 */
const createManualClock = () => {
  let now = 0;
  const tasks: { runAt: number; task: () => void }[] = [];
  return {
    schedule: (task: () => void, delayMs: number) => {
      tasks.push({ runAt: now + delayMs, task });
    },
    advance: (ms: number) => {
      now += ms;
      const due = tasks.filter(({ runAt }) => runAt <= now);
      for (const item of due) tasks.splice(tasks.indexOf(item), 1);
      due.forEach(({ task }) => task());
    },
  };
};

type Tracker = ReturnType<typeof createErrorRetryTracker>;

/** 오류 화면 하나가 그려지고 붙는 과정. React는 다시 시도가 또 실패하면 오류 화면을 새로 그린다 */
const mountScreen = (tracker: Tracker): number => {
  const failedCount = tracker.readFailedCount();
  tracker.attach(failedCount);
  return failedCount;
};

describe("createErrorRetryTracker", () => {
  it("다시 시도하지 않고 처음 그린 오류 화면은 실패 횟수가 0이다", () => {
    // Arrange
    const tracker = createErrorRetryTracker(createManualClock().schedule);

    // Act
    const failedCount = mountScreen(tracker);

    // Assert
    expect(failedCount).toBe(0);
  });

  it("다시 시도 뒤 오류 화면이 새로 그려지면 또 실패한 것으로 세고, 계속 실패하면 횟수가 이어진다", () => {
    // Arrange
    const clock = createManualClock();
    const tracker = createErrorRetryTracker(clock.schedule);
    mountScreen(tracker);
    const counts: number[] = [];

    // Act
    for (let attempt = 0; attempt < 3; attempt += 1) {
      tracker.start();
      tracker.detach();
      counts.push(mountScreen(tracker));
      clock.advance(ERROR_RETRY_RESET_DELAY_MS);
    }

    // Assert
    expect(counts).toEqual([1, 2, 3]);
  });

  it("다시 불러오는 동안 오류 화면 대신 뼈대가 잠깐 보였다가 다시 그려져도 또 실패한 것으로 센다", () => {
    // Arrange
    const clock = createManualClock();
    const tracker = createErrorRetryTracker(clock.schedule);
    mountScreen(tracker);
    tracker.start();

    // Act: 오류 화면이 떨어지고 1초 동안 뼈대가 보인 뒤 다시 실패한다
    tracker.detach();
    clock.advance(1000);
    const failedCount = mountScreen(tracker);

    // Assert
    expect(failedCount).toBe(1);
  });

  it("다시 시도가 성공해 오류 화면이 사라지면 센 것을 지워, 나중에 난 다른 오류는 처음부터 센다", () => {
    // Arrange
    const clock = createManualClock();
    const tracker = createErrorRetryTracker(clock.schedule);
    mountScreen(tracker);
    tracker.start();
    tracker.detach();
    mountScreen(tracker);
    tracker.start();

    // Act: 성공해서 오류 화면만 떨어진다
    tracker.detach();
    clock.advance(ERROR_RETRY_RESET_DELAY_MS);
    const failedCount = mountScreen(tracker);

    // Assert
    expect(failedCount).toBe(0);
  });

  it("앞서 떨어질 때 예약한 지우기가 나중 다시 시도의 뼈대 사이에 돌아도 센 것을 지우지 않는다", () => {
    // Arrange
    const clock = createManualClock();
    const tracker = createErrorRetryTracker(clock.schedule);
    mountScreen(tracker);
    tracker.start();
    tracker.detach();
    mountScreen(tracker);
    clock.advance(ERROR_RETRY_RESET_DELAY_MS - 1000);
    tracker.start();
    tracker.detach();

    // Act: 첫 지우기 예약 시각이 지나는 동안 뼈대가 보인다
    clock.advance(1000);
    const failedCount = mountScreen(tracker);

    // Assert
    expect(failedCount).toBe(2);
  });

  it("같은 화면을 두 번 붙였다 떼어도(개발 모드의 이펙트 두 번 실행) 센 것을 지우지 않는다", () => {
    // Arrange
    const clock = createManualClock();
    const tracker = createErrorRetryTracker(clock.schedule);
    mountScreen(tracker);
    tracker.start();
    const failedCount = tracker.readFailedCount();
    tracker.detach();

    // Act
    tracker.attach(failedCount);
    tracker.detach();
    tracker.attach(failedCount);
    clock.advance(ERROR_RETRY_RESET_DELAY_MS);
    tracker.start();

    // Assert
    expect(tracker.readFailedCount()).toBe(2);
  });
});
