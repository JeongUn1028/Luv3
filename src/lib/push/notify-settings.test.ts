import { describe, expect, it } from "vitest";
import { PUSH_NOTIFY_SWITCHES, toPushNotifySettings } from "./notify-settings";

describe("toPushNotifySettings", () => {
  it("설정 행이 없으면 모든 종류를 켠 것으로 본다", () => {
    // Act
    const settings = toPushNotifySettings(undefined);

    // Assert
    expect(settings).toEqual({ record: true, comment: true, event: true });
  });

  it("설정 행이 있으면 종류마다 그 값을 따른다", () => {
    // Arrange
    const row = { notify_record: true, notify_comment: false, notify_event: false };

    // Act
    const settings = toPushNotifySettings(row);

    // Assert
    expect(settings).toEqual({ record: true, comment: false, event: false });
  });
});

describe("PUSH_NOTIFY_SWITCHES", () => {
  it("시안 4번 A 순서로 새 기록·댓글·새 일정 스위치를 둔다", () => {
    // Act
    const switches = PUSH_NOTIFY_SWITCHES.map(({ kind, label }) => `${kind}:${label}`);

    // Assert
    expect(switches).toEqual(["record:새 기록", "comment:댓글", "event:새 일정"]);
  });
});
