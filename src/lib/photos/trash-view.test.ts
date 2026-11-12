import { describe, expect, it } from "vitest";
import { formatTrashDaysLeft, toTrashPhotoDetail, toTrashPhotoHref, toTrashSections, type TrashRow } from "./trash-view";

// 한국 시간 2026-11-12 오후 3시
const NOW = new Date("2026-11-12T06:00:00Z");

const row = (overrides: Partial<TrashRow>): TrashRow => ({
  id: "p1",
  date_id: "r1",
  path: "r1/p1.jpg",
  thumb_path: "r1/p1_thumb.jpg",
  record_date: "2026-11-10",
  record_title: "성수 산책",
  taken_at: null,
  deleted_with_record: true,
  deleted_at: "2026-11-11T05:00:00Z",
  ...overrides,
});

describe("formatTrashDaysLeft", () => {
  it.each([
    ["badge", "29일"],
    ["label", "29일 남음"],
    ["sentence", "29일 남았어요"],
  ] as const)("남은 날이 있으면 %s 자리에 그 날 수를 쓴다", (form, expected) => {
    expect(formatTrashDaysLeft(29, form)).toBe(expected);
  });

  it.each([
    ["badge", "곧"],
    ["label", "곧 지워짐"],
    ["sentence", "곧 지워져요"],
  ] as const)("남은 날이 없으면 %s 자리에 곧 지워진다고 쓴다", (form, expected) => {
    expect(formatTrashDaysLeft(0, form)).toBe(expected);
  });
});

describe("toTrashSections", () => {
  it("같은 기록에서 같은 날 같은 방법으로 지운 사진을 한 묶음으로 모아 받은 순서(최근에 지운 순)를 지킨다", () => {
    // Arrange
    const rows = [
      row({ id: "a" }),
      row({ id: "b" }),
      row({ id: "c", date_id: "r2", record_date: "2026-11-02", record_title: "첫 캠핑", deleted_with_record: false, deleted_at: "2026-11-05T01:00:00Z" }),
    ];

    // Act
    const sections = toTrashSections(rows, [], NOW);

    // Assert
    expect(sections.map(({ title, deletedLabel, photos }) => [title, deletedLabel, photos.map(({ id }) => id)])).toEqual([
      ["11월 10일 · 성수 산책", "어제 지움 · 기록째 삭제", ["a", "b"]],
      ["11월 2일 · 첫 캠핑", "11월 5일 지움 · 사진 빼기", ["c"]],
    ]);
  });

  it("같은 기록이라도 지운 날이나 방법이 다르면 묶음을 나눈다", () => {
    const sections = toTrashSections(
      [row({ id: "a", deleted_with_record: false }), row({ id: "b", deleted_with_record: false, deleted_at: "2026-11-01T01:00:00Z" }), row({ id: "c" })],
      [],
      NOW,
    );

    expect(sections.map(({ photos }) => photos.map(({ id }) => id))).toEqual([["a"], ["b"], ["c"]]);
  });

  it("지운 날은 한국 날짜로 오늘·어제를 나눈다", () => {
    // 한국 시간 11월 12일 0시 30분(UTC로는 11일)
    const sections = toTrashSections([row({ deleted_at: "2026-11-11T15:30:00Z" })], [], NOW);

    expect(sections[0]?.deletedLabel).toBe("오늘 지움 · 기록째 삭제");
  });

  it("올해가 아닌 날짜는 연도를 붙인다", () => {
    const sections = toTrashSections([row({ record_date: "2025-12-30", deleted_at: "2025-12-31T01:00:00Z" })], [], NOW);

    expect(sections[0]).toMatchObject({ title: "2025년 12월 30일 · 성수 산책", deletedLabel: "2025년 12월 31일 지움 · 기록째 삭제" });
  });

  it("기록 날짜·제목을 남기지 못한 사진은 제목 없는 기록으로 보여 준다", () => {
    const sections = toTrashSections([row({ record_date: null, record_title: null })], [], NOW);

    expect(sections[0]?.title).toBe("제목 없는 기록");
  });

  it("썸네일 서명 주소와 남은 날을 사진마다 붙이고, 서명하지 못한 사진은 주소를 비운다", () => {
    const sections = toTrashSections(
      [row({ id: "a" }), row({ id: "b", thumb_path: "r1/b_thumb.jpg" })],
      [
        { path: "r1/p1_thumb.jpg", signedUrl: "https://signed/a" },
        { path: "r1/b_thumb.jpg", signedUrl: null },
      ],
      NOW,
    );

    expect(sections[0]?.photos).toEqual([
      { id: "a", thumbUrl: "https://signed/a", daysLeft: 29 },
      { id: "b", thumbUrl: undefined, daysLeft: 29 },
    ]);
  });

  it("휴지통이 비어 있으면 빈 배열이다", () => {
    expect(toTrashSections([], [], NOW)).toEqual([]);
  });
});

describe("toTrashPhotoDetail", () => {
  it("원본 서명 주소, 기록 이름, 찍은 시각, 남은 날, 저장할 파일 이름을 만든다", () => {
    // Arrange
    const trashRow = row({ id: "0a1b2c3d-0000-4000-8000-000000000000", path: "r1/0a1b2c3d.jpg", taken_at: "2026-11-10T06:12:00Z" });

    // Act
    const detail = toTrashPhotoDetail(trashRow, [{ path: "r1/0a1b2c3d.jpg", signedUrl: "https://signed/original" }], NOW);

    // Assert
    expect(detail).toEqual({
      id: "0a1b2c3d-0000-4000-8000-000000000000",
      url: "https://signed/original",
      title: "11월 10일 · 성수 산책",
      takenLabel: "11월 10일 오후 3:12",
      daysLeft: 29,
      fileName: "luv3-2026-11-10-0a1b2c3d.jpg",
    });
  });

  it("찍은 시각이 없으면 비우고, 기록 날짜가 없으면 지운 날로 파일 이름을 짓는다", () => {
    const detail = toTrashPhotoDetail(row({ id: "p1", record_date: null, path: "r1/p1.png" }), [], NOW);

    expect(detail).toMatchObject({ url: undefined, takenLabel: undefined, fileName: "luv3-2026-11-11-p1.png" });
  });

  it("경로에 확장자가 없으면 jpg로 저장한다", () => {
    expect(toTrashPhotoDetail(row({ path: "r1/p1" }), [], NOW).fileName).toBe("luv3-2026-11-10-p1.jpg");
  });
});

describe("toTrashPhotoHref", () => {
  it("휴지통 화면 아래에 사진 id를 붙인 주소를 만든다", () => {
    expect(toTrashPhotoHref("t1")).toBe("/settings/trash/t1");
  });
});
