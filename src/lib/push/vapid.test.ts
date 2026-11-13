import { describe, expect, it } from "vitest";
import { parseVapidEnv } from "./vapid";

describe("parseVapidEnv", () => {
  it("두 열쇠가 모두 있으면 그대로 돌려준다", () => {
    // Act
    const config = parseVapidEnv({ publicKey: "public", privateKey: "private" });

    // Assert
    expect(config).toEqual({ publicKey: "public", privateKey: "private" });
  });

  // 키를 넣기 전에는 알림 기능을 꺼 둔다(설정 화면에 알림 칸이 나오지 않는다)
  it.each([
    ["둘 다 없으면", undefined, undefined],
    ["둘 다 빈 값이면", "", ""],
  ])("%s 알림을 끈 것으로 본다", (_, publicKey, privateKey) => {
    // Act & Assert
    expect(parseVapidEnv({ publicKey, privateKey })).toBeUndefined();
  });

  it.each([
    ["비밀 키만 빠지면", "public", undefined, "VAPID_PRIVATE_KEY"],
    ["공개 키만 빠지면", undefined, "private", "NEXT_PUBLIC_VAPID_PUBLIC_KEY"],
  ])("%s 빠진 변수 이름을 알리며 멈춘다", (_, publicKey, privateKey, missing) => {
    // Act & Assert
    expect(() => parseVapidEnv({ publicKey, privateKey })).toThrow(missing);
  });
});
