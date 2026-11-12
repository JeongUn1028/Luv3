import { describe, expect, it } from "vitest";
import { formatRecordDate, formatRecordMonthDay, formatRecordPeriod, findStartPhotoIndex, formatRecordShortDate, isRecordId, toRecordHref, toRecordPhotoHref, toDateRecordDetail, toEditableRecord, type DetailRow } from "./detail";

const row: DetailRow = {
  id: "r1",
  revision: "30000000-0000-4000-8000-000000000001",
  date: "2026-11-02",
  end_date: null,
  title: "산책",
  memo: "오래 걸었다",
  cover_photo_id: "p2",
  tags: ["카페", "여행"],
  author: { nickname: "진아" },
  event_date: null,
  event: null,
  groups: [
    { id: "g2", caption: null },
    { id: "g1", caption: "카페" },
  ],
  photos: [
    { id: "p2", group_id: "g2", path: "r1/p2.jpg", thumb_path: "r1/p2_thumb.jpg", sort_order: 1, place: "성수 서울숲", place_lat: 37.5443, place_lng: 127.0374, place_name: null, taken_at: null },
    { id: "p1", group_id: "g1", path: "r1/p1.jpg", thumb_path: "r1/p1_thumb.jpg", sort_order: 0, place: "어니언 성수", place_lat: 37.5447, place_lng: 127.0582, place_name: "골목 끝 카페", taken_at: null },
  ],
};

describe("isRecordId", () => {
  it("UUID 형식만 기록 id로 받는다", () => {
    expect(isRecordId("5a87e560-6a6e-49be-8af3-db196468143c")).toBe(true);
    expect(isRecordId("5A87E560-6A6E-49BE-8AF3-DB196468143C")).toBe(true);
    expect(isRecordId("not-a-uuid")).toBe(false);
    expect(isRecordId("5a87e560-6a6e-49be-8af3-db196468143c/../x")).toBe(false);
  });
});

describe("toDateRecordDetail", () => {
  it("사진을 순서대로 정렬하고 원본 서명 URL·모음 위치·장소 이름·모음 한마디와 작성자 닉네임을 붙이며, DB의 null은 undefined로 바꾼다", () => {
    const detail = toDateRecordDetail(row, [
      { path: "r1/p1.jpg", signedUrl: "https://example.test/p1" },
      { path: "r1/p2.jpg", signedUrl: "https://example.test/p2" },
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
        { id: "p1", groupId: "g1", url: "https://example.test/p1", place: "어니언 성수", placeName: "골목 끝 카페" },
        { id: "p2", groupId: "g2", url: "https://example.test/p2", place: "성수 서울숲", placeName: undefined },
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
    expect(toEditableRecord({ ...row, end_date: "2026-11-04" }, []).endDate).toBe("2026-11-04");
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

  it("서명 URL을 받지 못한 사진은 URL 없이 둔다", () => {
    const detail = toDateRecordDetail(row, [{ path: "r1/p1.jpg", signedUrl: null }]);
    expect(detail.photos.map(({ url }) => url)).toEqual([undefined, undefined]);
  });
});

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
});

describe("formatRecordDate", () => {
  it("YYYY.MM.DD와 요일로 쓴다", () => {
    expect(formatRecordDate("2026-11-02")).toBe("2026.11.02 월요일");
    expect(formatRecordDate("2025-12-24")).toBe("2025.12.24 수요일");
  });
});

describe("formatRecordPeriod", () => {
  it("하루짜리는 날짜 표기 그대로다", () => {
    expect(formatRecordPeriod({ date: "2026-11-02", endDate: undefined })).toBe("2026.11.02 월요일");
  });

  it("같은 달 기간은 끝 날짜에서 연도를 뺀다", () => {
    expect(formatRecordPeriod({ date: "2026-11-01", endDate: "2026-11-03" })).toBe("2026.11.01 일요일 – 11.03 화요일");
  });

  it("달이 바뀌는 기간도 끝 날짜에서 연도를 뺀다", () => {
    expect(formatRecordPeriod({ date: "2026-10-31", endDate: "2026-11-02" })).toBe("2026.10.31 토요일 – 11.02 월요일");
  });

  it("해가 바뀌는 기간은 끝 날짜에도 연도를 쓴다", () => {
    expect(formatRecordPeriod({ date: "2026-12-31", endDate: "2027-01-02" })).toBe("2026.12.31 목요일 – 2027.01.02 토요일");
  });
});

describe("formatRecordShortDate", () => {
  it("하루짜리는 월.일과 요일을 쓴다", () => {
    expect(formatRecordShortDate({ date: "2026-11-02", endDate: undefined })).toBe("11.02 월요일");
  });

  it("기간은 그리드와 같은 표기로 요일 없이 쓴다", () => {
    expect(formatRecordShortDate({ date: "2026-11-01", endDate: "2026-11-03" })).toBe("11.01–11.03");
  });

  it("달이나 해가 바뀌어도 그리드와 같은 표기다", () => {
    expect(formatRecordShortDate({ date: "2026-10-31", endDate: "2026-11-02" })).toBe("10.31–11.02");
    expect(formatRecordShortDate({ date: "2026-12-31", endDate: "2027-01-02" })).toBe("12.31–01.02");
  });
});

describe("formatRecordMonthDay", () => {
  it("연도 없이 MM.DD와 요일로 쓴다", () => {
    expect(formatRecordMonthDay("2026-11-02")).toBe("11.02 월요일");
    expect(formatRecordMonthDay("2025-12-24")).toBe("12.24 수요일");
  });
});

describe("toRecordHref", () => {
  it("기록 id로 상세 주소를 만든다", () => {
    expect(toRecordHref("r1")).toBe("/dates/r1");
  });
});

describe("toRecordPhotoHref", () => {
  it("기록 상세 주소에 처음 펼칠 사진을 붙인다", () => {
    expect(toRecordPhotoHref({ recordId: "r1", photoId: "p2" })).toBe("/dates/r1?photo=p2");
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
