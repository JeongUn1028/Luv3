import { describe, expect, it } from "vitest";
import { RECORD_DETAIL_ROW } from "@/test-utils/record-detail-row";
import { toEditableRecord } from "./editable-record";

const row = RECORD_DETAIL_ROW;

describe("toEditableRecord", () => {
  it("수정 화면 초기값으로 바꾼다: 사진은 순서대로 모음으로 묶어 썸네일 미리보기·모음 위치·장소 이름·모음 한마디, 빈 값은 빈 문자열", () => {
    const editable = toEditableRecord(row, [{ path: "r1/p1_thumb.jpg", signedUrl: "https://example.test/t1" }]);
    expect(editable).toEqual({
      revision: "30000000-0000-4000-8000-000000000001",
      id: "r1",
      date: "2026-11-02",
      endDate: undefined,
      title: "산책",
      memo: "오래 걸었다",
      coverPhotoId: "p2",
      tags: ["카페", "여행"],
      groups: [
        {
          id: "g1",
          location: { place: "어니언 성수", lat: 37.5447, lng: 127.0582 },
          caption: "카페",
          placeName: "골목 끝 카페",
          photos: [{ id: "p1", takenAt: undefined, previewUrl: "https://example.test/t1" }],
        },
        {
          id: "g2",
          location: { place: "성수 서울숲", lat: 37.5443, lng: 127.0374 },
          caption: "",
          placeName: "",
          photos: [{ id: "p2", takenAt: undefined, previewUrl: undefined }],
        },
      ],
    });
  });

  it("같은 모음의 사진은 사진 순서대로 한 모음에 묶고 찍은 시각을 함께 넘긴다", () => {
    // Arrange
    const location = { place: "성동구 성수1가1동", place_lat: 37.5444, place_lng: 127.0396, place_name: null };
    const shared = { path: "r1/x.jpg", thumb_path: "r1/x_thumb.jpg", ...location };
    const photos = [
      { ...shared, id: "c", group_id: "g2", sort_order: 2, taken_at: null },
      { ...shared, id: "a", group_id: "g1", sort_order: 0, taken_at: "2026-11-08T03:00:00+00:00" },
      { ...shared, id: "b", group_id: "g1", sort_order: 1, taken_at: null },
    ];

    // Act
    const { groups } = toEditableRecord({ ...row, photos }, []);

    // Assert
    expect(groups.map(({ id, photos: groupPhotos }) => [id, groupPhotos.map(({ id: photoId, takenAt }) => [photoId, takenAt])])).toEqual([
      ["g1", [["a", "2026-11-08T03:00:00+00:00"], ["b", undefined]]],
      ["g2", [["c", undefined]]],
    ]);
  });

  it("같은 모음의 사진이 사진 순서에서 떨어져 있어도 모음 하나로 묶어, 같은 모음 id를 두 번 저장하지 않는다", () => {
    // Arrange
    const shared = { path: "r1/x.jpg", thumb_path: "r1/x_thumb.jpg", place: "성동구 성수1가1동", place_lat: 37.5444, place_lng: 127.0396, place_name: null, taken_at: null };
    const photos = [
      { ...shared, id: "a", group_id: "g1", sort_order: 0 },
      { ...shared, id: "b", group_id: "g2", sort_order: 1 },
      { ...shared, id: "c", group_id: "g1", sort_order: 2 },
    ];

    // Act
    const { groups } = toEditableRecord({ ...row, photos }, []);

    // Assert
    expect(groups.map(({ id, photos: groupPhotos }) => [id, groupPhotos.map(({ id: photoId }) => photoId)])).toEqual([
      ["g1", ["a", "c"]],
      ["g2", ["b"]],
    ]);
  });

  it("대표 사진이 비어 있으면 첫 사진을 대표로 둔다", () => {
    expect(toEditableRecord({ ...row, cover_photo_id: null }, []).coverPhotoId).toBe("p1");
  });

  it("끝 날짜가 있으면 그대로 넘긴다", () => {
    expect(toEditableRecord({ ...row, end_date: "2026-11-04" }, []).endDate).toBe("2026-11-04");
  });
});
