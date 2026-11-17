import { describe, expect, it } from "vitest";
import { addTag, normalizeTag, pickTagSuggestions } from "./tags";

describe("normalizeTag", () => {
  it("앞뒤 공백과 앞의 #을 지우고 안쪽 공백을 하나로 줄인다", () => {
    expect(normalizeTag("  #카페  ")).toBe("카페");
    expect(normalizeTag("## 한강   산책")).toBe("한강 산책");
  });

  it("글자가 없으면 빈 문자열이다", () => {
    expect(normalizeTag(" # ")).toBe("");
  });
});

describe("addTag", () => {
  it("다듬은 태그를 뒤에 붙인다", () => {
    expect(addTag(["카페"], " #여행 ")).toEqual({ tags: ["카페", "여행"] });
  });

  it("비어 있으면 그대로 둔다", () => {
    expect(addTag(["카페"], "  ")).toEqual({ tags: ["카페"] });
  });

  it("이미 있는 태그는 대소문자가 달라도 더하지 않고 알리지도 않는다", () => {
    expect(addTag(["Cafe"], "cafe")).toEqual({ tags: ["Cafe"] });
  });

  it("10자를 넘으면 더하지 않고 알려 준다", () => {
    expect(addTag([], "가".repeat(10))).toEqual({ tags: ["가".repeat(10)] });
    expect(addTag([], "가".repeat(11))).toEqual({ tags: [], error: "태그는 10자까지 적을 수 있어요." });
  });

  it("5개를 넘으면 더하지 않고 알려 준다", () => {
    const tags = ["가", "나", "다", "라", "마"];
    expect(addTag(tags, "바")).toEqual({ tags, error: "태그는 5개까지 붙일 수 있어요." });
  });

  it("이미 5개여도 있는 태그를 다시 적으면 그대로 둔다", () => {
    const tags = ["가", "나", "다", "라", "마"];
    expect(addTag(tags, "가")).toEqual({ tags });
  });

  it("#으로 나눠 적으면 각각의 태그로 더한다", () => {
    expect(addTag([], "#카페 #한강 산책")).toEqual({ tags: ["카페", "한강 산책"] });
    expect(addTag(["카페"], "카페#여행")).toEqual({ tags: ["카페", "여행"] });
  });

  it("나눠 적은 태그 중 하나라도 못 붙이면 하나도 더하지 않는다", () => {
    const tags = ["가", "나", "다", "라"];
    expect(addTag(tags, "#마 #바")).toEqual({ tags, error: "태그는 5개까지 붙일 수 있어요." });
    expect(addTag([], `#카페 #${"가".repeat(11)}`)).toEqual({ tags: [], error: "태그는 10자까지 적을 수 있어요." });
  });
});

describe("pickTagSuggestions", () => {
  it("이미 붙인 태그는 대소문자와 상관없이 뺀다", () => {
    expect(pickTagSuggestions(["cafe", "여행"], ["Cafe"])).toEqual(["여행"]);
  });

  it("붙인 태그를 뺀 뒤에 12개까지 고른다", () => {
    const suggestions = Array.from({ length: 20 }, (_, index) => `태그${index}`);
    const picked = pickTagSuggestions(suggestions, suggestions.slice(0, 5));
    expect(picked).toEqual(suggestions.slice(5, 17));
  });
});
