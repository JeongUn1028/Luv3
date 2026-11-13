import { describe, expect, it } from "vitest";
import type { PhotoLocation } from "./form";
import { findNearbyGroupLocation, isSameMapSpot, isSamePhotoLocation, toGroupLocationText, toOtherGroupLocations } from "./group-location";

const ONION: PhotoLocation = { place: "성동구 성수2가1동", lat: 37.5447, lng: 127.0582 };
const FOREST: PhotoLocation = { place: "성동구 성수1가1동", lat: 37.5444, lng: 127.0374 };
const PARK: PhotoLocation = { place: "광진구 자양4동", lat: 37.5313, lng: 127.0667 };

const group = (id: string, location?: PhotoLocation): { id: string; location: PhotoLocation | undefined } => ({ id, location });

describe("isSamePhotoLocation", () => {
  it("이름과 좌표가 모두 같거나 둘 다 없으면 같은 곳이다", () => {
    expect([isSamePhotoLocation(ONION, { ...ONION }), isSamePhotoLocation(undefined, undefined)]).toEqual([true, true]);
  });

  it("이름이나 좌표 하나라도 다르거나 한쪽만 있으면 다른 곳이다", () => {
    expect([
      isSamePhotoLocation(ONION, { ...ONION, place: "어니언" }),
      isSamePhotoLocation(ONION, { ...ONION, lng: 127 }),
      isSamePhotoLocation(ONION, { ...ONION, lat: ONION.lat + 1e-9 }),
      isSamePhotoLocation(ONION, undefined),
    ]).toEqual([false, false, false, false]);
  });
});

describe("isSameMapSpot", () => {
  it("지도가 좌표를 아주 조금 바꿔 돌려줘도 같은 자리로 본다", () => {
    expect(isSameMapSpot(ONION, { lat: ONION.lat + 5e-8, lng: ONION.lng - 5e-8 })).toBe(true);
  });

  it("허용 차이를 넘거나 앞 자리가 없으면 다른 자리다", () => {
    expect([
      isSameMapSpot(ONION, { lat: ONION.lat + 1e-6, lng: ONION.lng }),
      isSameMapSpot(ONION, { lat: ONION.lat, lng: ONION.lng + 1e-6 }),
      isSameMapSpot(undefined, ONION),
    ]).toEqual([false, false, false]);
  });
});

describe("toOtherGroupLocations", () => {
  it("연 모음과 위치 없는 모음을 빼고 모음 번호를 붙인다", () => {
    const groups = [group("g1", ONION), group("g2"), group("g3", FOREST), group("g4", PARK)];

    expect(toOtherGroupLocations(groups, "g3")).toEqual([
      { groupNumber: 1, location: ONION },
      { groupNumber: 4, location: PARK },
    ]);
  });

  it("같은 곳은 앞 모음 하나만 두고, 연 모음의 위치와 같은 곳은 뺀다", () => {
    const groups = [group("g1", FOREST), group("g2", ONION), group("g3", { ...ONION }), group("g4", FOREST)];

    expect(toOtherGroupLocations(groups, "g4")).toEqual([{ groupNumber: 2, location: ONION }]);
  });

  it("찾는 모음이 없으면 모든 모음의 위치를 보인다", () => {
    expect(toOtherGroupLocations([group("g1", ONION), group("g2", FOREST)], undefined)).toEqual([
      { groupNumber: 1, location: ONION },
      { groupNumber: 2, location: FOREST },
    ]);
  });
});

describe("findNearbyGroupLocation", () => {
  it("앞 모음들 중 가장 가까운 모음의 위치를 고른다", () => {
    const groups = [group("g1", ONION), group("g2", FOREST), group("g3"), group("g4"), group("g5", PARK)];

    expect(findNearbyGroupLocation(groups, 3)).toEqual(FOREST);
  });

  it("앞에 위치가 없으면 뒤 모음들 중 가장 가까운 모음의 위치를 고른다", () => {
    const groups = [group("g1"), group("g2"), group("g3"), group("g4", PARK), group("g5", ONION)];

    expect(findNearbyGroupLocation(groups, 1)).toEqual(PARK);
  });

  it("다른 모음에 위치가 없으면 없다", () => {
    expect(findNearbyGroupLocation([group("g1"), group("g2", ONION)], 1)).toBeUndefined();
  });
});

describe("toGroupLocationText", () => {
  it("첫 사진 정보를 읽는 중이면 읽는 중이라고만 보인다", () => {
    expect(toGroupLocationText({ location: undefined, locationSource: undefined, isReadingLocation: true })).toEqual({ label: "위치 읽는 중…", note: undefined });
  });

  it("위치가 있으면 다듬은 동네 이름과 어디서 정했는지 보인다", () => {
    expect([
      toGroupLocationText({ location: FOREST, locationSource: "photo", isReadingLocation: false }),
      toGroupLocationText({ location: FOREST, locationSource: "picked", isReadingLocation: false }),
    ]).toEqual([
      { label: "성동구 성수동", note: "첫 사진 정보에서 읽었어요" },
      { label: "성동구 성수동", note: "직접 골랐어요" },
    ]);
  });

  it("이미 저장된 모음이거나 정한 곳을 모르면 어디서 정했는지 보이지 않는다", () => {
    expect([
      toGroupLocationText({ location: FOREST, locationSource: "saved", isReadingLocation: false }),
      toGroupLocationText({ location: FOREST, locationSource: undefined, isReadingLocation: false }),
    ]).toEqual([
      { label: "성동구 성수동", note: undefined },
      { label: "성동구 성수동", note: undefined },
    ]);
  });

  it("위치가 없으면 첫 사진에 위치 정보가 없다고 알린다", () => {
    expect(toGroupLocationText({ location: undefined, locationSource: undefined, isReadingLocation: false })).toEqual({
      label: "위치 없음",
      note: "첫 사진에 위치 정보가 없어요",
    });
  });
});
