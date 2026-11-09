import { describe, expect, it } from "vitest";
import { getRetryMessage, INITIAL_RETRY_PROGRESS, RETRY_FAILED_MESSAGE, shouldFlashRetryMessage, updateRetryProgress } from "./load-retry";

const MESSAGE = "기록을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.";

describe("updateRetryProgress", () => {
  it("다시 불러오기를 시작하면 실패로 세지 않는다", () => {
    // Arrange
    const progress = INITIAL_RETRY_PROGRESS;

    // Act
    const next = updateRetryProgress(progress, true);

    // Assert
    expect(next).toEqual({ wasPending: true, failedCount: 0 });
  });

  it("다시 불러오기가 끝났는데 조회 실패 화면이 남아 있으면 실패 횟수를 늘린다", () => {
    // Arrange
    const progress = { wasPending: true, failedCount: 0 };

    // Act
    const next = updateRetryProgress(progress, false);

    // Assert
    expect(next).toEqual({ wasPending: false, failedCount: 1 });
  });

  it("다시 시도할 때마다 또 실패하면 횟수가 계속 늘어난다", () => {
    // Arrange
    let progress = INITIAL_RETRY_PROGRESS;

    // Act
    for (let attempt = 0; attempt < 3; attempt += 1) {
      progress = updateRetryProgress(progress, true);
      progress = updateRetryProgress(progress, false);
    }

    // Assert
    expect(progress.failedCount).toBe(3);
  });

  it("다시 불러오는 상태가 그대로면 같은 값을 돌려줘 화면을 또 그리지 않는다", () => {
    // Arrange
    const idle = INITIAL_RETRY_PROGRESS;
    const pending = { wasPending: true, failedCount: 2 };

    // Act
    const nextIdle = updateRetryProgress(idle, false);
    const nextPending = updateRetryProgress(pending, true);

    // Assert
    expect(nextIdle).toBe(idle);
    expect(nextPending).toBe(pending);
  });
});

describe("getRetryMessage", () => {
  it("아직 다시 시도하지 않았으면 처음 문구를 그대로 보여 준다", () => {
    // Act
    const message = getRetryMessage(MESSAGE, 0);

    // Assert
    expect(message).toBe(MESSAGE);
  });

  it("다시 시도가 실패하면 다시 시도했다는 것이 보이는 문구로 바꾼다", () => {
    // Act
    const messages = [1, 2].map((failedCount) => getRetryMessage(MESSAGE, failedCount));

    // Assert
    expect(messages).toEqual([RETRY_FAILED_MESSAGE, RETRY_FAILED_MESSAGE]);
    expect(RETRY_FAILED_MESSAGE).toBe("다시 시도했지만 불러오지 못했어요. 잠시 후 다시 시도해 주세요.");
  });
});

describe("shouldFlashRetryMessage", () => {
  it("문구가 바뀌는 첫 실패에는 움직이지 않고, 같은 문구가 이어지는 두 번째 실패부터 다시 나타나게 한다", () => {
    // Act
    const flashes = [0, 1, 2, 3].map(shouldFlashRetryMessage);

    // Assert
    expect(flashes).toEqual([false, false, true, true]);
  });
});
