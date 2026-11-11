import { describe, expect, it } from "vitest";
import { formatRecordDate, formatRecordMonthDay, formatRecordPeriod, findStartPhotoIndex, formatRecordShortDate, isRecordId, toDateRecordDetail, toEditableRecord, type DetailRow } from "./detail";

const row: DetailRow = {
  id: "r1",
  revision: "30000000-0000-4000-8000-000000000001",
  date: "2026-11-02",
  end_date: null,
  title: "산책",
  place: null,
  memo: "오래 걸었다",
  cover_photo_id: "p2",
  tags: ["카페", "여행"],
  place_lat: null,
  place_lng: null,
  author: { nickname: "진아" },
  event_date: null,
  event: null,
  photos: [
    { id: "p2", path: "r1/p2.jpg", thumb_path: "r1/p2_thumb.jpg", caption: null, sort_order: 1, place: null, place_lat: null, place_lng: null },
    { id: "p1", path: "r1/p1.jpg", thumb_path: "r1/p1_thumb.jpg", caption: "카페", sort_order: 0, place: "어니언 성수", place_lat: 37.5447, place_lng: 127.0582 },
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
  it("사진을 순서대로 정렬하고 원본 서명 URL과 작성자 닉네임을 붙이며, DB의 null은 undefined로 바꾼다", () => {
    const detail = toDateRecordDetail(row, [
      { path: "r1/p1.jpg", signedUrl: "https://example.test/p1" },
      { path: "r1/p2.jpg", signedUrl: "https://example.test/p2" },
    ]);
    expect(detail).toEqual({
      id: "r1",
      date: "2026-11-02",
      endDate: undefined,
      title: "산책",
      place: undefined,
      memo: "오래 걸었다",
      tags: ["카페", "여행"],
      authorNickname: "진아",
      photos: [
        { id: "p1", url: "https://example.test/p1", caption: "카페", place: "어니언 성수" },
        { id: "p2", url: "https://example.test/p2", caption: undefined, place: undefined },
      ],
      filePaths: ["r1/p1.jpg", "r1/p1_thumb.jpg", "r1/p2.jpg", "r1/p2_thumb.jpg"],
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

  it("서명 URL을 받지 못한 사진은 URL 없이 둔다", () => {
    const detail = toDateRecordDetail(row, [{ path: "r1/p1.jpg", signedUrl: null }]);
    expect(detail.photos.map(({ url }) => url)).toEqual([undefined, undefined]);
  });
});

describe("toEditableRecord", () => {
  it("저장된 좌표를 읽고, 하나라도 없으면 없는 것으로 본다", () => {
    expect(toEditableRecord({ ...row, place_lat: 37.5, place_lng: 127 }, []).location).toEqual({ lat: 37.5, lng: 127 });
    expect(toEditableRecord({ ...row, place_lat: 37.5, place_lng: null }, []).location).toBeUndefined();
  });

  it("수정 화면 초기값으로 바꾼다: 사진은 순서대로 썸네일 미리보기·위치, 빈 값은 빈 문자열", () => {
    const editable = toEditableRecord(row, [{ path: "r1/p1_thumb.jpg", signedUrl: "https://example.test/t1" }]);
    expect(editable).toEqual({
      revision: "30000000-0000-4000-8000-000000000001",
      id: "r1",
      date: "2026-11-02",
      endDate: undefined,
      title: "산책",
      place: "",
      memo: "오래 걸었다",
      coverPhotoId: "p2",
      tags: ["카페", "여행"],
      location: undefined,
      photos: [
        { id: "p1", caption: "카페", location: { place: "어니언 성수", lat: 37.5447, lng: 127.0582 }, previewUrl: "https://example.test/t1" },
        { id: "p2", caption: "", location: undefined, previewUrl: undefined },
      ],
    });
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
