import { describe, expect, it } from "vitest";
import { blendColors, getContrastRatio, parseHexColor } from "@/test-utils/contrast";
import { readSource } from "@/test-utils/source";
import {
  describeDayEvents,
  getDayHighlight,
  getDayNumberClassName,
  getEventKinds,
  getHighlightClassNames,
  type DayHighlight,
} from "./highlight";

const together = { isTogether: true, authorNickname: "정운" };
const personal = { isTogether: false, authorNickname: "정운" };
const partnerPersonal = { isTogether: false, authorNickname: "진아" };

describe("getDayHighlight", () => {
  it("일정이 없으면 형광펜을 칠하지 않는다", () => {
    expect(getDayHighlight([])).toBeUndefined();
  });

  it("한 사람 일정만 있으면 크림색 형광펜을 칠한다", () => {
    expect(getDayHighlight([personal, personal])).toBe("personal");
  });

  it("함께 일정이 하나라도 있으면 한 사람 일정과 겹쳐도 함께 형광펜(분홍)을 칠한다", () => {
    expect(getDayHighlight([together])).toBe("together");
    expect(getDayHighlight([personal, together])).toBe("together");
  });
});

describe("describeDayEvents", () => {
  it("화면 읽기 프로그램용으로 함께 일정과 작성자별 일정 수를 알려 준다", () => {
    expect(describeDayEvents([])).toEqual([]);
    expect(describeDayEvents([together, together])).toEqual(["함께 일정 2개"]);
    expect(describeDayEvents([personal, together, partnerPersonal, personal])).toEqual([
      "함께 일정 1개",
      "정운 일정 2개",
      "진아 일정 1개",
    ]);
  });

  it("작성자를 모르는 일정은 한 사람 일정으로 센다", () => {
    expect(describeDayEvents([{ isTogether: false, authorNickname: undefined }])).toEqual(["한 사람 일정 1개"]);
  });
});

describe("getEventKinds", () => {
  it("함께와 닉네임 두 종류가 각자의 형광펜과 짝을 이룬다", () => {
    const kinds = getEventKinds("정운");

    expect(kinds).toEqual([
      { isTogether: true, highlight: "together", label: "함께" },
      { isTogether: false, highlight: "personal", label: "정운" },
    ]);
    for (const { isTogether, highlight } of kinds) expect(getDayHighlight([{ isTogether }])).toBe(highlight);
  });
});

// 오늘 원·기념일 테두리도 분홍이라, 형광펜 위에서는 칸 바탕색 테두리로 떼어 놓아야 서로 구별된다(#61)
describe("getDayNumberClassName", () => {
  const band = getHighlightClassNames({ highlight: "together", isCurrentMonth: true });
  const base = { isToday: false, isAnniversary: false, isSelected: false, highlightClassNames: undefined };

  it("표시할 것이 없으면 클래스가 없다", () => {
    expect(getDayNumberClassName(base)).toBe("");
  });

  it("형광펜 위 숫자는 형광펜 글자색을 쓴다", () => {
    expect(getDayNumberClassName({ ...base, highlightClassNames: band })).toContain(band.text);
  });

  it("오늘 원이 형광펜 위에 있으면 칸 바탕색 테두리로 떼어 놓는다", () => {
    expect(getDayNumberClassName({ ...base, isToday: true })).not.toContain("ring-");
    expect(getDayNumberClassName({ ...base, isToday: true, highlightClassNames: band })).toContain("ring-2 ring-background");
  });

  it("기념일 테두리가 형광펜 위에 있으면 바탕색 간격을 두고 바깥에 그린다", () => {
    expect(getDayNumberClassName({ ...base, isAnniversary: true })).not.toContain("ring-offset-2");
    expect(getDayNumberClassName({ ...base, isAnniversary: true, highlightClassNames: band })).toContain(
      "ring-1 ring-highlight ring-offset-2 ring-offset-background",
    );
    expect(getDayNumberClassName({ ...base, isAnniversary: true, isToday: true })).toContain("ring-offset-background");
  });

  it("고른 날은 칸 바탕이 surface라서 떼어 놓는 색도 surface로 맞춘다", () => {
    const selected = { ...base, isSelected: true, highlightClassNames: band };
    expect(getDayNumberClassName({ ...selected, isToday: true })).toContain("ring-surface");
    expect(getDayNumberClassName({ ...selected, isAnniversary: true })).toContain("ring-offset-surface");
    expect(getDayNumberClassName({ ...selected, isToday: true, isAnniversary: true })).not.toContain("ring-offset-background");
  });
});

// 형광펜 위 날짜 숫자가 WCAG AA(4.5:1)를 넘는지, 실제로 쓰는 클래스와 globals.css 색 값으로 확인한다(#61).
// 고른 날은 칸 바탕이 surface라서 background·surface 두 바탕 위에서 모두 본다
describe("형광펜 위 글자 대비", () => {
  const css = readSource("app/globals.css");
  const readToken = (name: string) => {
    const value = new RegExp(`--color-${name}:\\s*(#[0-9a-f]{6});`, "i").exec(css)?.[1];
    if (!value) throw new Error(`globals.css에 --color-${name} 색이 없습니다`);
    return parseHexColor(value);
  };
  const cases = (["together", "personal"] as const satisfies readonly DayHighlight[]).flatMap((highlight) =>
    [true, false].map((isCurrentMonth) => ({ highlight, isCurrentMonth })),
  );

  it.each(cases)("$highlight 형광펜(이번 달 $isCurrentMonth)의 글자는 대비 4.5:1 이상이다", ({ highlight, isCurrentMonth }) => {
    const { band, text } = getHighlightClassNames({ highlight, isCurrentMonth });
    const [, bandToken, opacity] = /^bg-([a-z-]+)(?:\/(\d+))?$/.exec(band) ?? [];
    const [, textToken] = /^text-([a-z-]+)$/.exec(text) ?? [];
    if (!bandToken || !textToken) throw new Error(`형광펜 클래스를 읽지 못했습니다: ${band} ${text}`);

    for (const cellBackground of ["background", "surface"]) {
      const bandColor = blendColors({
        foreground: readToken(bandToken),
        background: readToken(cellBackground),
        alpha: opacity ? Number(opacity) / 100 : 1,
      });
      expect(getContrastRatio(readToken(textToken), bandColor)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("함께 일정과 한 사람 일정의 형광펜은 서로 다른 색이다", () => {
    const togetherBand = getHighlightClassNames({ highlight: "together", isCurrentMonth: true }).band;
    const personalBand = getHighlightClassNames({ highlight: "personal", isCurrentMonth: true }).band;
    expect(togetherBand).not.toBe(personalBand);
  });
});
