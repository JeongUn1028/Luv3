import { describe, expect, it } from "vitest";
import { blendColors, getContrastRatio, parseHexColor } from "@/test-utils/contrast";
import { readSource } from "@/test-utils/source";
import {
  describeDayEvents,
  getDayHighlight,
  getDayNumberClassName,
  getDayTextClassName,
  getDayTone,
  getDayToneClassName,
  getEventKinds,
  getHighlightClassNames,
  getWeekdayClassName,
  LEGEND_EVENT_KINDS,
  type DayHighlight,
  type DayTone,
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

describe("LEGEND_EVENT_KINDS", () => {
  it("한 사람 일정의 이름은 닉네임이 아니라 개인이다", () => {
    expect(LEGEND_EVENT_KINDS).toEqual([
      { isTogether: true, highlight: "together", label: "함께" },
      { isTogether: false, highlight: "personal", label: "개인" },
    ]);
  });
});

// 오늘 원·기념일 테두리도 분홍이라, 형광펜 위에서는 칸 바탕색 테두리로 떼어 놓아야 서로 구별된다(#61)
describe("getDayNumberClassName", () => {
  const band = getHighlightClassNames({ highlight: "together", isCurrentMonth: true });
  const base = { isToday: false, isAnniversary: false, isSelected: false, highlightClassNames: undefined, isCurrentMonth: true, tone: undefined };

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

describe("getDayTone", () => {
  it("일요일은 빨강, 토요일은 파랑, 평일은 색이 없다", () => {
    // 2026-11-08은 일요일이다
    expect(getDayTone("2026-11-08", undefined)).toBe("holiday");
    expect(getDayTone("2026-11-14", undefined)).toBe("saturday");
    expect(getDayTone("2026-11-09", undefined)).toBeUndefined();
  });

  it("공휴일은 평일이어도, 토요일이어도 빨강이다", () => {
    expect(getDayTone("2026-05-05", "어린이날")).toBe("holiday");
    expect(getDayTone("2026-06-06", "현충일")).toBe("holiday");
  });
});

describe("getWeekdayClassName", () => {
  it("요일 머리글은 일요일만 빨강, 토요일만 파랑이다", () => {
    expect([0, 1, 2, 3, 4, 5, 6].map(getWeekdayClassName)).toEqual([
      "text-holiday",
      "text-ink-sub",
      "text-ink-sub",
      "text-ink-sub",
      "text-ink-sub",
      "text-ink-sub",
      "text-saturday",
    ]);
  });
});

describe("getDayNumberClassName 주말·공휴일 색", () => {
  const base = { isToday: false, isAnniversary: false, isSelected: false, highlightClassNames: undefined, isCurrentMonth: true, tone: "holiday" as const };
  const togetherBand = getHighlightClassNames({ highlight: "together", isCurrentMonth: true });
  const fadedBand = getHighlightClassNames({ highlight: "together", isCurrentMonth: false });

  it("어두운 칸에서는 밝은 색, 지난달·다음달은 흐린 색을 쓴다", () => {
    expect(getDayNumberClassName(base)).toBe("text-holiday");
    expect(getDayNumberClassName({ ...base, isCurrentMonth: false })).toBe("text-holiday/70");
  });

  it("형광펜과 오늘 원 위에서는 진한 색을 쓴다", () => {
    expect(getDayNumberClassName({ ...base, highlightClassNames: togetherBand })).toBe("text-holiday-deep");
    expect(getDayNumberClassName({ ...base, tone: "saturday", isToday: true })).toBe("bg-accent text-saturday-deep");
  });

  // 옅은 띠 위에서는 어떤 빨강·파랑도 대비가 모자란다(사용자 결정, #200)
  it("지난달·다음달의 옅은 띠 위에서는 띠의 밝은 글자를 그대로 쓴다", () => {
    expect(getDayNumberClassName({ ...base, isCurrentMonth: false, highlightClassNames: fadedBand })).toBe(fadedBand.text);
  });
});

describe("getDayTextClassName", () => {
  it("평일은 바탕에 맞는 기본 글자색, 주말·공휴일은 그 색을 쓴다", () => {
    expect([getDayTextClassName(undefined, "plain"), getDayTextClassName(undefined, "dim"), getDayTextClassName(undefined, "fill")]).toEqual([
      "text-ink",
      "text-ink-placeholder",
      "text-background",
    ]);
    expect(getDayTextClassName("saturday", "fill")).toBe("text-saturday-deep");
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

  // 주말·공휴일 색이 바탕마다 읽히는지 확인한다(#200). 고른 날 칸(surface)과 날짜 창(surface 바탕)도 함께 본다
  const readTone = (className: string) => {
    const [, token, opacity] = /^text-([a-z-]+)(?:\/(\d+))?$/.exec(className) ?? [];
    if (!token) throw new Error(`글자 클래스를 읽지 못했습니다: ${className}`);
    return { color: readToken(token), alpha: opacity ? Number(opacity) / 100 : 1 };
  };
  const tones = ["holiday", "saturday"] as const satisfies readonly DayTone[];

  it.each(tones)("%s 색은 어두운 바탕과 형광펜·오늘 원 위에서 대비 4.5:1 이상이다", (tone) => {
    for (const background of ["background", "surface"]) {
      expect(getContrastRatio(readTone(getDayToneClassName(tone, "plain")).color, readToken(background))).toBeGreaterThanOrEqual(4.5);
    }
    for (const fill of ["highlight", "cream", "accent"]) {
      expect(getContrastRatio(readTone(getDayToneClassName(tone, "fill")).color, readToken(fill))).toBeGreaterThanOrEqual(4.5);
    }
  });

  it.each(tones)("지난달·다음달의 흐린 %s 색은 흐린 회색 글자보다 덜 읽히지 않는다", (tone) => {
    const { color, alpha } = readTone(getDayToneClassName(tone, "dim"));
    for (const background of ["background", "surface"]) {
      const shown = blendColors({ foreground: color, background: readToken(background), alpha });
      expect(getContrastRatio(shown, readToken(background))).toBeGreaterThanOrEqual(getContrastRatio(readToken("ink-placeholder"), readToken(background)));
    }
  });

  it("함께 일정과 한 사람 일정의 형광펜은 서로 다른 색이다", () => {
    const togetherBand = getHighlightClassNames({ highlight: "together", isCurrentMonth: true }).band;
    const personalBand = getHighlightClassNames({ highlight: "personal", isCurrentMonth: true }).band;
    expect(togetherBand).not.toBe(personalBand);
  });
});
