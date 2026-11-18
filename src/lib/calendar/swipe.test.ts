import { describe, expect, it } from "vitest";
import { addSwipeSample, BACK_GESTURE_EDGE_PX, decideMonthSwipe, getSwipeAxis, getSwipeVelocity, isBackGestureEdge } from "./swipe";

describe("isBackGestureEdge", () => {
  it("화면 왼쪽 끝 24px 안에서 시작하면 뒤로 가기에 양보한다", () => {
    expect(isBackGestureEdge(0)).toBe(true);
    expect(isBackGestureEdge(BACK_GESTURE_EDGE_PX - 1)).toBe(true);
  });

  it("24px부터는 달 넘기기로 친다", () => {
    expect(isBackGestureEdge(BACK_GESTURE_EDGE_PX)).toBe(false);
    expect(isBackGestureEdge(200)).toBe(false);
  });
});

describe("getSwipeAxis", () => {
  it("10px 넘게 움직이기 전에는 정하지 않는다", () => {
    expect(getSwipeAxis({ dx: 9, dy: -9 })).toBe("undecided");
  });

  it("가로로 더 많이 움직이면 가로 밀기로 본다", () => {
    expect(getSwipeAxis({ dx: -12, dy: 5 })).toBe("horizontal");
  });

  it("세로로 더 많이 움직이거나 같으면 스크롤로 본다", () => {
    expect(getSwipeAxis({ dx: 5, dy: 12 })).toBe("vertical");
    expect(getSwipeAxis({ dx: 12, dy: -12 })).toBe("vertical");
  });
});

describe("addSwipeSample", () => {
  it("최근 100ms 안의 자리만 남긴다", () => {
    // Arrange
    const samples = [
      { x: 0, time: 0 },
      { x: 5, time: 50 },
      { x: 10, time: 120 },
    ];

    // Act
    const result = addSwipeSample(samples, { x: 40, time: 200 });

    // Assert
    expect(result).toEqual([
      { x: 10, time: 120 },
      { x: 40, time: 200 },
    ]);
  });

  it("처음 자리는 그대로 남긴다", () => {
    expect(addSwipeSample([], { x: 3, time: 10 })).toEqual([{ x: 3, time: 10 }]);
  });
});

describe("getSwipeVelocity", () => {
  it("처음과 마지막 자리로 가로 빠르기를 잰다", () => {
    expect(getSwipeVelocity([{ x: 100, time: 0 }, { x: 70, time: 10 }, { x: 40, time: 60 }])).toBe(-1);
  });

  it("자리가 하나뿐이거나 시간이 흐르지 않았으면 0이다", () => {
    expect(getSwipeVelocity([])).toBe(0);
    expect(getSwipeVelocity([{ x: 1, time: 5 }])).toBe(0);
    expect(getSwipeVelocity([{ x: 1, time: 5 }, { x: 9, time: 5 }])).toBe(0);
  });

  it("누른 채 오래 멈췄다 튕겨도 튕긴 빠르기를 잰다", () => {
    // Arrange: 400ms 멈췄다가 50ms 동안 60px 튕긴다
    let samples = addSwipeSample([], { x: 200, time: 0 });
    samples = addSwipeSample(samples, { x: 200, time: 400 });
    samples = addSwipeSample(samples, { x: 170, time: 425 });

    // Act
    samples = addSwipeSample(samples, { x: 140, time: 450 });

    // Assert
    expect(getSwipeVelocity(samples)).toBeLessThan(-0.5);
  });
});

describe("decideMonthSwipe", () => {
  it("왼쪽으로 폭의 4분의 1보다 많이 밀면 다음 달로 넘긴다", () => {
    expect(decideMonthSwipe({ dx: -91, width: 360, velocity: 0 })).toBe(1);
  });

  it("오른쪽으로 폭의 4분의 1보다 많이 밀면 이전 달로 넘긴다", () => {
    expect(decideMonthSwipe({ dx: 91, width: 360, velocity: 0 })).toBe(-1);
  });

  it("천천히 4분의 1까지만 밀면 제자리로 돌아온다", () => {
    expect(decideMonthSwipe({ dx: -90, width: 360, velocity: -0.1 })).toBe(0);
  });

  it("민 방향으로 빠르게 튕기면 덜 밀어도 넘긴다", () => {
    expect(decideMonthSwipe({ dx: -40, width: 360, velocity: -0.6 })).toBe(1);
  });

  it("밀었다가 반대로 빠르게 되돌리면 넘기지 않는다", () => {
    expect(decideMonthSwipe({ dx: -40, width: 360, velocity: 0.6 })).toBe(0);
  });

  it("빠르더라도 20px 이하로 흔들린 것은 넘기지 않는다", () => {
    expect(decideMonthSwipe({ dx: 20, width: 360, velocity: 2 })).toBe(0);
  });
});
