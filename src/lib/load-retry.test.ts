import { describe, expect, it } from "vitest";
import { getRetryMessage, RETRY_FAILED_MESSAGE, shouldFlashRetryMessage } from "./load-retry";

const MESSAGE = "기록을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.";

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
