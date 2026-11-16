import { afterEach, describe, expect, it, vi } from "vitest";
import type { EditableRecord } from "@/lib/dates/detail";
import { createEmptyRecordDraft, toEditRecordDraft, withNewPreviews } from "./record-draft";

const location = { place: "서울특별시 성동구 성수동", lat: 37.54, lng: 127.05 };

describe("createEmptyRecordDraft", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("미리 채울 값이 없으면 한국 날짜로 오늘인 빈 기록이다", () => {
    // Arrange: 한국은 이미 11월 17일
    vi.useFakeTimers({ now: new Date("2026-11-16T16:00:00Z") });

    // Act
    const draft = createEmptyRecordDraft();

    // Assert
    expect(draft).toEqual({
      date: "2026-11-17",
      endDate: undefined,
      title: "",
      memo: "",
      eventLink: undefined,
      groups: [],
      coverPhotoId: undefined,
      tags: [],
    });
  });

  it("지난 일정에서 넘어오면 그 일정의 날짜·제목·메모와 이을 일정을 채운다", () => {
    // Arrange
    const eventLink = { eventId: "e1", eventDate: "2026-11-10" };

    // Act
    const draft = createEmptyRecordDraft({ date: "2026-11-10", endDate: "2026-11-11", title: "전시", memo: "표 챙기기", eventLink });

    // Assert
    expect(draft).toMatchObject({ date: "2026-11-10", endDate: "2026-11-11", title: "전시", memo: "표 챙기기", eventLink, groups: [], tags: [] });
  });
});

describe("toEditRecordDraft", () => {
  it("저장된 기록을 고치기 폼의 처음 내용으로 바꾸고, 저장된 사진은 새 파일 없이 둔다", () => {
    // Arrange
    const record: EditableRecord = {
      id: "r1",
      revision: "v1",
      date: "2026-11-02",
      endDate: undefined,
      title: "산책",
      memo: "",
      coverPhotoId: "p1",
      tags: ["카페"],
      groups: [{ id: "g1", location, caption: "한마디", placeName: "", photos: [{ id: "p1", takenAt: undefined, previewUrl: "https://thumb/p1" }] }],
    };

    // Act
    const draft = toEditRecordDraft(record);

    // Assert
    expect(draft).toEqual({
      expectedRevisions: ["v1"],
      date: "2026-11-02",
      endDate: undefined,
      title: "산책",
      memo: "",
      coverPhotoId: "p1",
      tags: ["카페"],
      groups: [
        {
          id: "g1",
          location,
          locationSource: "saved",
          pendingLocationPhotoId: undefined,
          placeName: "",
          caption: "한마디",
          photos: [{ id: "p1", takenAt: undefined, previewUrl: "https://thumb/p1", file: undefined, isReadingInfo: false }],
        },
      ],
    });
  });
});

describe("withNewPreviews", () => {
  it("새로 고른 사진만 파일로 미리보기를 다시 만들고 저장된 사진은 그대로 둔다", () => {
    // Arrange
    const file = new File(["a"], "a.jpg", { type: "image/jpeg" });
    const draft = toEditRecordDraft({
      id: "r1",
      revision: "v1",
      date: "2026-11-02",
      endDate: undefined,
      title: "산책",
      memo: "",
      coverPhotoId: "p1",
      tags: [],
      groups: [{ id: "g1", location, caption: "", placeName: "", photos: [{ id: "p1", takenAt: undefined, previewUrl: "https://thumb/p1" }] }],
    });
    const [group] = draft.groups;
    const withPicked = { ...draft, groups: [{ ...group, photos: [...group.photos, { id: "p2", file, previewUrl: "blob:old", isReadingInfo: false }] }] };

    // Act
    const restored = withNewPreviews(withPicked, () => "blob:new");

    // Assert
    expect(restored.groups[0].photos.map(({ previewUrl }) => previewUrl)).toEqual(["https://thumb/p1", "blob:new"]);
  });
});
