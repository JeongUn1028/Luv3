import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { claimBackMotion, getBackSteps, goBackInHistory, isBackMotionPending } from "./history-back";

const toUrls = (...paths: string[]): string[] => paths.map((path) => `https://luv3.test${path}`);

describe("getBackSteps", () => {
  it("앞 화면이 있으면 한 칸 돌아간다", () => {
    expect(getBackSteps(toUrls("/records", "/dates/1"), 1)).toBe(1);
  });

  it("주소로 바로 들어와 앞 화면이 없으면 돌아갈 곳이 없다", () => {
    expect(getBackSteps(toUrls("/dates/1"), 0)).toBeUndefined();
  });

  it("저장하면서 같은 주소로 바뀐 기록은 건너뛴다", () => {
    expect(getBackSteps(toUrls("/records", "/dates/1", "/dates/1"), 2)).toBe(2);
  });

  it("같은 주소만 남아 있으면 돌아갈 곳이 없다", () => {
    expect(getBackSteps(toUrls("/dates/1", "/dates/1"), 1)).toBeUndefined();
  });

  it("쿼리가 다르면 다른 화면으로 본다", () => {
    expect(getBackSteps(toUrls("/calendar?month=2026-10", "/calendar"), 1)).toBe(1);
  });

  it("로그인 화면으로는 돌아가지 않는다", () => {
    expect(getBackSteps(toUrls("/login?next=/dates/1", "/dates/1"), 1)).toBeUndefined();
  });

  it("주소를 알 수 없는 기록이 앞에 있으면 돌아갈 곳이 없다", () => {
    expect(getBackSteps(["https://luv3.test/records", null, "https://luv3.test/dates/1"], 2)).toBeUndefined();
  });

  it("되돌아간 뒤에는 지금 위치보다 앞의 기록만 본다", () => {
    expect(getBackSteps(toUrls("/records", "/dates/1", "/dates/1/edit"), 1)).toBe(1);
  });
});

describe("goBackInHistory", () => {
  const go = vi.fn();
  // 파일이 기억하는 마지막 누름에 걸리지 않게 테스트마다 시간을 충분히 뒤로 민다
  let startTime = Date.now();

  const stubBrowser = (navigation?: unknown) => {
    vi.stubGlobal("window", { navigation });
    vi.stubGlobal("history", { go });
  };

  const createNavigation = (urls: string[], index: number) => ({
    currentEntry: { index },
    entries: () => urls.map((url) => ({ url })),
  });

  beforeEach(() => {
    startTime += 10_000;
    vi.useFakeTimers({ now: startTime });
    go.mockClear();
  });

  afterEach(() => {
    claimBackMotion();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("Navigation API가 없는 브라우저면 정해진 주소로 가도록 false를 돌려준다", () => {
    stubBrowser(undefined);

    expect(goBackInHistory()).toBe(false);
    expect(go).not.toHaveBeenCalled();
  });

  it("돌아갈 곳이 없으면 false를 돌려준다", () => {
    stubBrowser(createNavigation(toUrls("/dates/1"), 0));

    expect(goBackInHistory()).toBe(false);
    expect(go).not.toHaveBeenCalled();
  });

  it("돌아갈 곳이 있으면 그만큼 되돌아가고 뒤로 버튼으로 시작했다고 표시한다", () => {
    stubBrowser(createNavigation(toUrls("/records", "/dates/1", "/dates/1"), 2));

    expect(goBackInHistory()).toBe(true);
    expect(go).toHaveBeenCalledWith(-2);
    expect(isBackMotionPending()).toBe(true);
  });

  it("이동이 시작되기 전에 또 눌러도 한 번만 되돌아간다", () => {
    stubBrowser(createNavigation(toUrls("/records", "/dates/1"), 1));

    goBackInHistory();

    expect(goBackInHistory()).toBe(true);
    expect(go).toHaveBeenCalledTimes(1);
  });

  it("이동이 시작된 뒤 손가락으로 두 번째 누른 것도 한 번만 되돌아간다", () => {
    stubBrowser(createNavigation(toUrls("/records", "/dates/1", "/dates/1/edit"), 2));
    goBackInHistory();
    claimBackMotion();
    vi.advanceTimersByTime(250);
    stubBrowser(createNavigation(toUrls("/records", "/dates/1", "/dates/1/edit"), 1));

    expect(goBackInHistory()).toBe(true);
    expect(go).toHaveBeenCalledTimes(1);
  });

  it("두 번 누르는 간격이 지나면 다음 화면에서 또 되돌아갈 수 있다", () => {
    stubBrowser(createNavigation(toUrls("/records", "/dates/1", "/dates/1/edit"), 2));
    goBackInHistory();
    claimBackMotion();
    vi.advanceTimersByTime(400);
    stubBrowser(createNavigation(toUrls("/records", "/dates/1", "/dates/1/edit"), 1));

    goBackInHistory();

    expect(go).toHaveBeenCalledTimes(2);
  });

  it("이동이 시작되면 표시를 지워 다음 가장자리 밀기에는 움직임을 넣지 않는다", () => {
    stubBrowser(createNavigation(toUrls("/records", "/dates/1"), 1));
    goBackInHistory();

    expect(claimBackMotion()).toBe(true);
    expect(claimBackMotion()).toBe(false);
  });

  it("이동이 일어나지 않고 시간이 지나면 표시는 사라지고 다시 누를 수 있다", () => {
    stubBrowser(createNavigation(toUrls("/records", "/dates/1"), 1));
    goBackInHistory();

    vi.advanceTimersByTime(1000);

    expect(claimBackMotion()).toBe(false);
    expect(goBackInHistory()).toBe(true);
    expect(go).toHaveBeenCalledTimes(2);
  });
});
