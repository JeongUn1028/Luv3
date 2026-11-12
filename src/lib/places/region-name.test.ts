import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { decodeAdmdongBoundaries } from "./admdong";
import { formatRegionName, toShortRegionName } from "./region-name";
import { UNKNOWN_PHOTO_PLACE } from "./region";

describe("toShortRegionName", () => {
  it.each([
    ["성동구 성수1가1동", "성수동"],
    ["종로구 종로1·2·3·4가동", "종로동"],
    ["성동구 금호2·3가동", "금호동"],
    ["용산구 용산2가동", "용산동"],
    ["용산구 이태원1동", "이태원동"],
    ["강동구 상일제2동", "상일동"],
    ["부산진구 가야제1동", "가야동"],
    ["청주시 흥덕구 봉명2·송정동", "봉명·송정동"],
    ["달서구 두류1,2동", "두류동"],
    ["종로구 사직동", "사직동"],
    ["기장군 기장읍", "기장읍"],
  ])("행정동 이름 %s는 숫자와 '가'를 떼어 %s로 보여 준다", (place, expected) => {
    expect(toShortRegionName(place)).toBe(expected);
  });

  // '제'가 이름의 일부인 동(홍제동·거제동)은 그대로 두고, 차례를 뜻하는 '제'(상일제1동)만 뗀다
  it("이름의 일부인 '제'는 떼지 않는다", () => {
    expect(toShortRegionName("서대문구 홍제1동")).toBe("홍제동");
    expect(toShortRegionName("연제구 거제3동")).toBe("거제동");
  });

  // 행정동 이름은 앞 낱말이 시·군·구다. 예전에 직접 적은 이름(아파트 동 번호 등)은 마지막 낱말이 '동'이어도 다듬지 않는다
  it("앞 낱말이 시·군·구가 아니면 그대로 둔다", () => {
    expect(toShortRegionName("래미안아파트 101동")).toBe("래미안아파트 101동");
    expect(toShortRegionName("서울숲 2동")).toBe("서울숲 2동");
    expect(toShortRegionName("101동")).toBe("101동");
    expect(formatRegionName("래미안아파트 101동")).toBe("래미안아파트 101동");
  });

  it("동네 이름을 붙이지 못한 위치(찍은 곳)는 그대로 둔다", () => {
    expect(toShortRegionName(UNKNOWN_PHOTO_PLACE)).toBe(UNKNOWN_PHOTO_PLACE);
    expect(formatRegionName(UNKNOWN_PHOTO_PLACE)).toBe(UNKNOWN_PHOTO_PLACE);
  });

  // 경계 파일이 바뀌어 새 모양의 이름이 생겨도 숫자가 남거나 '동'만 남지 않는지 본다
  it("경계 파일의 모든 행정동 이름에서 숫자가 남지 않는다", () => {
    const names = decodeAdmdongBoundaries(JSON.parse(readFileSync("data/admdong-boundaries.json", "utf8"))).regions.map(({ name }) => name);

    const leftovers = names.map(toShortRegionName).filter((name) => /\d/.test(name) || ["동", "읍", "면"].includes(name));

    expect(names.length).toBeGreaterThan(3000);
    expect(leftovers).toEqual([]);
  });
});

describe("formatRegionName", () => {
  it("구·시 이름은 두고 마지막 동 이름만 다듬는다", () => {
    expect(formatRegionName("성동구 성수1가1동")).toBe("성동구 성수동");
    expect(formatRegionName("수원시 장안구 정자1동")).toBe("수원시 장안구 정자동");
  });
});
