import { describe, expect, it } from "vitest";
import { compareNewestFirst, toMapPins, toMapPinsSignature, type MapRow } from "./map";

const createRow = (overrides: Partial<MapRow> = {}): MapRow => ({
  id: "1",
  title: "성수 데이트",
  date: "2026-11-01",
  end_date: null,
  place: "성수 카페",
  place_lat: 37.5445,
  place_lng: 127.0561,
  ...overrides,
});

describe("toMapPins", () => {
  it("기록 하나를 핀 하나로 만든다", () => {
    expect(toMapPins([createRow()])).toEqual([
      {
        key: "37.5445,127.0561",
        lat: 37.5445,
        lng: 127.0561,
        place: "성수 카페",
        records: [{ id: "1", title: "성수 데이트", date: "2026-11-01", endDate: undefined, place: "성수 카페" }],
      },
    ]);
  });

  it("좌표가 같은 기록은 받은 순서대로 한 핀에 묶고, 이름은 먼저 받은 기록을 쓴다", () => {
    // Act
    const pins = toMapPins([createRow({ id: "새 기록", place: "새 이름" }), createRow({ id: "예전 기록", place: "예전 이름" })]);

    // Assert
    expect(pins).toHaveLength(1);
    expect(pins[0]?.place).toBe("새 이름");
    expect(pins[0]?.records.map(({ id }) => id)).toEqual(["새 기록", "예전 기록"]);
  });

  it("좌표가 같아도 기록마다 자기 장소 이름을 지닌다", () => {
    const [pin] = toMapPins([createRow({ id: "1", place: "1층 가게" }), createRow({ id: "2", place: "2층 가게" })]);
    expect(pin?.records.map(({ place }) => place)).toEqual(["1층 가게", "2층 가게"]);
  });

  it("좌표가 다르면 핀을 나눈다", () => {
    expect(toMapPins([createRow({ id: "1" }), createRow({ id: "2", place_lng: 127.1 })])).toHaveLength(2);
  });

  it("좌표가 없는 기록은 뺀다", () => {
    expect(toMapPins([createRow({ place_lat: null, place_lng: null })])).toEqual([]);
  });

  it("좌표 0은 없는 값이 아니다", () => {
    expect(toMapPins([createRow({ place_lat: 0, place_lng: 0 })])).toHaveLength(1);
  });

  it("기간 기록은 끝 날짜를 함께 담는다", () => {
    const [pin] = toMapPins([createRow({ end_date: "2026-11-03" })]);
    expect(pin?.records[0]?.endDate).toBe("2026-11-03");
  });

  it("장소 이름이 없어도 핀을 그린다", () => {
    expect(toMapPins([createRow({ place: null })])[0]?.place).toBe("이 장소");
  });
});

describe("compareNewestFirst", () => {
  it("날짜가 늦은 기록부터, 같은 날이면 나중에 쓴 기록부터 줄 세운다", () => {
    // Arrange
    const rows = [
      { id: "a", date: "2026-11-01", created_at: "2026-11-01T10:00:00+00:00" },
      { id: "b", date: "2026-11-03", created_at: "2026-11-03T09:00:00+00:00" },
      { id: "c", date: "2026-11-01", created_at: "2026-11-02T08:00:00+00:00" },
    ];

    // Act
    const sorted = rows.toSorted(compareNewestFirst);

    // Assert
    expect(sorted.map(({ id }) => id)).toEqual(["b", "c", "a"]);
  });

  it("날짜와 작성 시각(밀리초까지)이 같으면 받은 순서와 상관없이 id로 같은 순서를 정한다", () => {
    const same = { date: "2026-11-01", created_at: "2026-11-01T10:00:00.123+00:00" };
    const toIds = (rows: { id: string }[]) => rows.map(({ id }) => id);

    expect(toIds([{ id: "a", ...same }, { id: "b", ...same }].toSorted(compareNewestFirst))).toEqual(["b", "a"]);
    expect(toIds([{ id: "b", ...same }, { id: "a", ...same }].toSorted(compareNewestFirst))).toEqual(["b", "a"]);
  });
});

describe("toMapPinsSignature", () => {
  it("새로 받았어도 내용이 같으면 같다", () => {
    expect(toMapPinsSignature(toMapPins([createRow()]))).toBe(toMapPinsSignature(toMapPins([createRow()])));
  });

  it("기록이 더해지면 달라진다", () => {
    expect(toMapPinsSignature(toMapPins([createRow()]))).not.toBe(toMapPinsSignature(toMapPins([createRow(), createRow({ id: "2" })])));
  });

  it("자리가 옮겨지면 달라진다", () => {
    expect(toMapPinsSignature(toMapPins([createRow()]))).not.toBe(toMapPinsSignature(toMapPins([createRow({ place_lat: 35 })])));
  });

  it("핀의 이름이 바뀌면 달라진다", () => {
    expect(toMapPinsSignature(toMapPins([createRow()]))).not.toBe(toMapPinsSignature(toMapPins([createRow({ place: "새 이름" })])));
  });

  it("지도에 그리지 않는 제목만 바뀌면 같다", () => {
    expect(toMapPinsSignature(toMapPins([createRow()]))).toBe(toMapPinsSignature(toMapPins([createRow({ title: "새 제목" })])));
  });
});
