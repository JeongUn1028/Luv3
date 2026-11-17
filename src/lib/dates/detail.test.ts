import { describe, expect, it } from "vitest";
import { RECORD_DETAIL_ROW } from "@/test-utils/record-detail-row";
import { findStartPhotoIndex, toDateRecordDetail } from "./detail";

const row = RECORD_DETAIL_ROW;

describe("toDateRecordDetail", () => {
  it("사진을 순서대로 정렬하고 원본·썸네일 서명 URL·모음 위치·장소 이름·모음 한마디와 작성자 닉네임을 붙이며, DB의 null은 undefined로 바꾼다", () => {
    const detail = toDateRecordDetail(row, [
      { path: "r1/p1.jpg", signedUrl: "https://example.test/p1" },
      { path: "r1/p2.jpg", signedUrl: "https://example.test/p2" },
      { path: "r1/p1_thumb.jpg", signedUrl: "https://example.test/t1" },
    ]);
    expect(detail).toEqual({
      id: "r1",
      date: "2026-11-02",
      endDate: undefined,
      title: "산책",
      memo: "오래 걸었다",
      tags: ["카페", "여행"],
      authorNickname: "진아",
      photos: [
        { id: "p1", groupId: "g1", url: "https://example.test/p1", thumbUrl: "https://example.test/t1", place: "어니언 성수", placeName: "골목 끝 카페" },
        { id: "p2", groupId: "g2", url: "https://example.test/p2", thumbUrl: undefined, place: "성수 서울숲", placeName: undefined },
      ],
      groups: [
        { id: "g1", caption: "카페" },
        { id: "g2", caption: undefined },
      ],
      route: expect.any(Object),
    });
  });

  it("일정에서 남긴 기록이면 그 일정의 고치기 주소를 넘기고, 반복 일정은 그날을 함께 담는다", () => {
    expect(toDateRecordDetail({ ...row, event_date: "2026-11-02", event: { id: "e1", title: "전시", repeat_rule: null } }, []).eventHref).toBe("/events/e1/edit");
    expect(toDateRecordDetail({ ...row, event_date: "2026-11-02", event: { id: "e1", title: "전시", repeat_rule: "weekly" } }, []).eventHref).toBe(
      "/events/e1/edit?date=2026-11-02",
    );
    expect(toDateRecordDetail(row, []).eventHref).toBeUndefined();
  });

  it("일정과 이어진 기록이면 연결을 끊을 수 있게 일정 id·제목·고치기 주소를 넘긴다", () => {
    expect(toDateRecordDetail({ ...row, event_date: "2026-11-02", event: { id: "e1", title: "전시", repeat_rule: null } }, []).linkedEvent).toEqual({
      id: "e1",
      title: "전시",
      href: "/events/e1/edit",
    });
    expect(toDateRecordDetail(row, []).linkedEvent).toBeUndefined();
  });

  it("끝 날짜가 있으면 그대로 넘긴다", () => {
    expect(toDateRecordDetail({ ...row, end_date: "2026-11-04" }, []).endDate).toBe("2026-11-04");
  });

  it("작성자를 읽지 못하면 작성자 없이 둔다", () => {
    expect(toDateRecordDetail({ ...row, author: null }, []).authorNickname).toBeUndefined();
  });

  it("모음 위치가 두 곳 이상이면 모음 순서대로 이은 동선을 붙이고, 모음이 하나뿐이면 붙이지 않는다", () => {
    // Arrange
    const oneGroup = row.photos.map((photo) => ({ ...photo, group_id: "g1", place: "어니언 성수", place_lat: 37.5447, place_lng: 127.0582, place_name: null }));

    // Act
    const withRoute = toDateRecordDetail(row, []);
    const withoutRoute = toDateRecordDetail({ ...row, photos: oneGroup }, []);

    // Assert
    expect(withRoute.route?.points.map(({ number, place }) => [number, place])).toEqual([
      [1, "골목 끝 카페"],
      [2, "성수 서울숲"],
    ]);
    expect(withoutRoute.route).toBeUndefined();
  });

  it("같은 모음의 사진은 모음 하나로 묶어 그 모음의 한마디를 붙인다", () => {
    // Arrange
    const shared = { path: "r1/x.jpg", thumb_path: "r1/x_thumb.jpg", taken_at: null };
    const photos = [
      { ...shared, id: "a", group_id: "g1", sort_order: 0, place: "성수1가1동", place_lat: 37.5444, place_lng: 127.0396, place_name: null },
      { ...shared, id: "b", group_id: "g1", sort_order: 1, place: "성수1가1동", place_lat: 37.5444, place_lng: 127.0396, place_name: null },
      { ...shared, id: "c", group_id: "g2", sort_order: 2, place: "성수2가3동", place_lat: 37.54, place_lng: 127.05, place_name: null },
    ];

    // Act
    const { groups } = toDateRecordDetail({ ...row, photos }, []);

    // Assert
    expect(groups).toEqual([
      { id: "g1", caption: "카페" },
      { id: "g2", caption: undefined },
    ]);
  });

  it("사진 순서가 같은 사진은 id로 순서를 정해 모음 순서와 동선 번호가 어긋나지 않는다", () => {
    // Arrange: 순서가 같은 두 모음이 id 반대로 들어온다
    const shared = { path: "r1/x.jpg", thumb_path: "r1/x_thumb.jpg", taken_at: null, sort_order: 0 };
    const photos = [
      { ...shared, id: "b", group_id: "g2", place: "성수2가3동", place_lat: 37.54, place_lng: 127.05, place_name: null },
      { ...shared, id: "a", group_id: "g1", place: "성수1가1동", place_lat: 37.5444, place_lng: 127.0396, place_name: null },
    ];

    // Act
    const { groups, route } = toDateRecordDetail({ ...row, photos }, []);

    // Assert
    expect(groups.map(({ id }) => id)).toEqual(["g1", "g2"]);
    expect(route?.points.map(({ photoIds }) => photoIds)).toEqual([["a"], ["b"]]);
  });

  it("썸네일 서명 URL은 주소로 고른 처음 펼칠 사진에만 붙이고, 고른 사진이 없으면 사진 순서의 첫 사진에 붙인다", () => {
    // Arrange
    const signed = [
      { path: "r1/p1_thumb.jpg", signedUrl: "https://example.test/t1" },
      { path: "r1/p2_thumb.jpg", signedUrl: "https://example.test/t2" },
    ];

    // Act
    const picked = toDateRecordDetail(row, signed, "p2");
    const missing = toDateRecordDetail(row, signed, "없는 사진");

    // Assert
    expect(picked.photos.map(({ thumbUrl }) => thumbUrl)).toEqual([undefined, "https://example.test/t2"]);
    expect(missing.photos.map(({ thumbUrl }) => thumbUrl)).toEqual(["https://example.test/t1", undefined]);
  });

  it("서명 URL을 받지 못한 사진은 URL 없이 둔다", () => {
    const detail = toDateRecordDetail(row, [{ path: "r1/p1.jpg", signedUrl: null }]);
    expect(detail.photos.map(({ url }) => url)).toEqual([undefined, undefined]);
  });
});

describe("findStartPhotoIndex", () => {
  const photos = [{ id: "p1" }, { id: "p2" }, { id: "p3" }];

  it("주소에 지정한 사진의 순서를 돌려준다", () => {
    expect(findStartPhotoIndex(photos, "p3")).toBe(2);
  });

  // 지워진 사진이나 잘못 적은 주소로 열어도 상세는 보여야 한다
  it("지정하지 않았거나 없는 사진이면 첫 사진(0)부터 보여 준다", () => {
    expect([findStartPhotoIndex(photos, undefined), findStartPhotoIndex(photos, "gone")]).toEqual([0, 0]);
  });
});
