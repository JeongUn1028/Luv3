import { describe, expect, it } from "vitest";
import { PUSH_OPEN_MESSAGE, PUSH_RECEIVED_MESSAGE } from "./message";
import { readPushOpenPath } from "./open-message";

const ORIGIN = "https://luv3.vercel.app";

describe("readPushOpenPath", () => {
  it("서비스 워커가 넘긴 앱 주소에서 경로·검색어·조각을 꺼낸다", () => {
    // Act
    const path = readPushOpenPath({ type: PUSH_OPEN_MESSAGE, url: `${ORIGIN}/dates/1?photo=2#comments` }, ORIGIN);

    // Assert
    expect(path).toBe("/dates/1?photo=2#comments");
  });

  // 같은 사이트로 읽혀도 정리한 경로가 `//evil.example`이면 라우터가 다른 사이트로 옮긴다
  it.each([
    ["정리하면 다른 사이트가 되는 경로", `${ORIGIN}/.//evil.example/x`],
    ["인코딩을 풀면 다른 사이트가 되는 경로", `${ORIGIN}/%2f/evil.example/x`],
    ["로그인 화면 경로", `${ORIGIN}/login`],
  ])("%s면 홈으로 바꾼다", (_, url) => {
    // Act
    const path = readPushOpenPath({ type: PUSH_OPEN_MESSAGE, url }, ORIGIN);

    // Assert
    expect(path).toBe("/");
  });

  it.each([
    ["다른 종류의 메시지", { type: PUSH_RECEIVED_MESSAGE }],
    ["글자만 온 메시지", "luv3:open-url"],
    ["주소가 없는 메시지", { type: PUSH_OPEN_MESSAGE }],
    ["주소가 글자가 아닌 메시지", { type: PUSH_OPEN_MESSAGE, url: 42 }],
    ["해석할 수 없는 주소", { type: PUSH_OPEN_MESSAGE, url: "not a url" }],
    ["다른 사이트 주소", { type: PUSH_OPEN_MESSAGE, url: "https://evil.example/dates/1" }],
  ])("%s면 옮기지 않는다(undefined)", (_, data) => {
    // Act
    const path = readPushOpenPath(data, ORIGIN);

    // Assert
    expect(path).toBeUndefined();
  });
});
