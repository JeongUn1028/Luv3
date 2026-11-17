import { describe, expect, it } from "vitest";
import { formatReleaseDate, parseReleases, toReleaseNotes } from "./releases";

const V120_BODY = [
  "## 1.2.0에서 바뀐 것",
  "- **알림**: 상대가 기록을 남기면 알림이 와요(#366·#367·#377). 종류별로 끌 수 있어요(#370)",
  "- **지도**: 묶음 숫자가 사진 수의 합으로 보여요(#362)",
  "",
  "알려진 문제: 지도 숫자가 장소 수로 보여요(#343에서 고쳐요)",
  "",
  "## What's Changed",
  "* fix: 지도 묶음 숫자를 묶인 사진 수 합으로 보이기 by @someone in https://github.com/example/pull/362",
  "",
  "**Full Changelog**: https://github.com/example/compare/v1.1.0...v1.2.0",
].join("\r\n");

const release = (overrides: Record<string, unknown> = {}) => ({
  tag_name: "v1.2.0",
  published_at: "2026-11-16T02:06:00Z",
  body: V120_BODY,
  draft: false,
  prerelease: false,
  ...overrides,
});

describe("toReleaseNotes", () => {
  it("자동 목록 앞의 요약만 떼어 항목과 문단으로 나누고 제목 줄과 이슈 번호는 뺀다", () => {
    // Act
    const notes = toReleaseNotes(V120_BODY);

    // Assert
    expect(notes).toEqual([
      { kind: "item", label: "알림", text: "상대가 기록을 남기면 알림이 와요. 종류별로 끌 수 있어요" },
      { kind: "item", label: "지도", text: "묶음 숫자가 사진 수의 합으로 보여요" },
      { kind: "paragraph", text: "알려진 문제: 지도 숫자가 장소 수로 보여요" },
    ]);
  });

  it("문단의 굵게 표시는 지우고 글만 남긴다", () => {
    expect(toReleaseNotes("**알려진 문제**: 지도 숫자가 달라요")).toEqual([{ kind: "paragraph", text: "알려진 문제: 지도 숫자가 달라요" }]);
  });

  it("굵은 이름이 없는 항목은 이름 없이 글만 남긴다", () => {
    expect(toReleaseNotes("- 사진 저장이 빨라졌어요\n* 지도 핀이 장수를 보여 줘요")).toEqual([
      { kind: "item", label: undefined, text: "사진 저장이 빨라졌어요" },
      { kind: "item", label: undefined, text: "지도 핀이 장수를 보여 줘요" },
    ]);
  });

  it("자동 목록만 있는 노트는 요약이 없다", () => {
    expect(toReleaseNotes("## What's Changed\n* feat: 무언가 by @someone")).toEqual([]);
  });
});

describe("parseReleases", () => {
  it("버전(앞의 v를 뺌)·한국 날짜·요약으로 바꾸고 임시·미리 보기 릴리스는 뺀다", () => {
    // Arrange
    const value = [
      release({ tag_name: "v1.3.0", draft: true }),
      release({ tag_name: "v1.2.1-beta", prerelease: true }),
      release(),
      release({ tag_name: "v1.0.0", published_at: "2026-11-12T15:30:00Z", body: null }),
    ];

    // Act
    const releases = parseReleases(value);

    // Assert
    expect(releases).toEqual([
      { version: "1.2.0", publishedOn: "2026-11-16", notes: toReleaseNotes(V120_BODY) },
      // 한국 시간으로는 다음 날이다. 노트가 비어 있으면 요약도 없다
      { version: "1.0.0", publishedOn: "2026-11-13", notes: [] },
    ]);
  });

  it("답이 목록이 아니면(요청 한도 초과 안내 등) undefined를 돌려준다", () => {
    expect(parseReleases({ message: "API rate limit exceeded" })).toBeUndefined();
  });

  it("날짜가 없는 임시 릴리스와 모양이 다른 항목만 빼고 나머지는 보여 준다", () => {
    // Arrange
    const value = [release({ draft: true, published_at: null }), release({ tag_name: undefined }), release({ published_at: "어제" }), release()];

    // Act & Assert
    expect(parseReleases(value)?.map(({ version }) => version)).toEqual(["1.2.0"]);
  });
});

describe("formatReleaseDate", () => {
  it("연·월·일을 한국어로 적는다", () => {
    expect(formatReleaseDate("2026-11-06")).toBe("2026년 11월 6일");
  });
});
