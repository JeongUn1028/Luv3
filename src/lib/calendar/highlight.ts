import { toOwnerLabel, type CalendarEvent } from "@/lib/events/calendar";

/** 일정 있는 날에 칠하는 형광펜 종류. 함께 일정은 분홍, 한 사람 일정만 있으면 크림색 */
export type DayHighlight = "together" | "personal";

type EventKind = Pick<CalendarEvent, "isTogether">;

/** 일정 종류 하나의 이름과 형광펜 */
export interface EventKindOption extends EventKind {
  highlight: DayHighlight;
  label: string;
}

/**
 * 일정 종류(함께 / 한 사람)와 형광펜의 짝. 일정 폼의 선택지와 캘린더 범례가 같은 색을 쓰도록 여기서만 정한다.
 *
 * @example getEventKinds("정운").map(({ label }) => label) // ["함께", "정운"]
 */
export const getEventKinds = (personalLabel: string): EventKindOption[] => [
  { isTogether: true, highlight: "together", label: "함께" },
  { isTogether: false, highlight: "personal", label: personalLabel },
];

/**
 * 캘린더 범례의 일정 종류. 크림색은 두 사람 일정에 모두 칠해지므로 닉네임 대신 종류 이름을 쓴다.
 * 누구 일정인지는 고른 날 목록의 작성자 이름으로 알 수 있다.
 *
 * @example LEGEND_EVENT_KINDS.map(({ label }) => `${label} 일정`) // ["함께 일정", "개인 일정"]
 */
export const LEGEND_EVENT_KINDS: readonly EventKindOption[] = getEventKinds("개인");

/**
 * 그날 일정으로 형광펜 종류를 정한다. 함께 일정이 하나라도 있으면 함께 형광펜이다.
 *
 * @returns 일정이 없으면 undefined
 * @example getDayHighlight(eventsByDate.get(date) ?? []) // "together"
 */
export const getDayHighlight = (events: EventKind[]): DayHighlight | undefined => {
  if (events.length === 0) return undefined;
  return events.some((event) => event.isTogether) ? "together" : "personal";
};

/**
 * 날짜 버튼 이름에 넣을 일정 수 설명. 형광펜 색은 화면 읽기 프로그램이 알 수 없어 글로 알려 준다.
 * 한 사람 일정은 작성자별로 센다.
 *
 * @example describeDayEvents(events) // ["함께 일정 1개", "정운 일정 2개"]
 */
export const describeDayEvents = (events: Pick<CalendarEvent, "isTogether" | "authorNickname">[]): string[] => {
  const togetherCount = events.filter((event) => event.isTogether).length;
  const countByOwner = new Map<string, number>();
  for (const { isTogether, authorNickname } of events) {
    if (isTogether) continue;
    const owner = toOwnerLabel(authorNickname);
    countByOwner.set(owner, (countByOwner.get(owner) ?? 0) + 1);
  }
  return [
    ...(togetherCount > 0 ? [`함께 일정 ${togetherCount}개`] : []),
    ...Array.from(countByOwner, ([owner, count]) => `${owner} 일정 ${count}개`),
  ];
};

/** 형광펜 띠와 그 위 날짜 숫자의 클래스 */
export interface HighlightClassNames {
  band: string;
  text: string;
}

// 글자 대비(WCAG AA 4.5:1)는 highlight.test.ts가 globals.css 색 값으로 확인한다.
// 지난달·다음달 날짜는 띠를 옅게(35%) 칠해 이번 달과 구별하고, 옅은 띠 위에서는 밝은 글자를 쓴다
const HIGHLIGHT_CLASS_NAMES = {
  together: {
    currentMonth: { band: "bg-highlight", text: "text-background" },
    otherMonth: { band: "bg-highlight/35", text: "text-ink" },
  },
  personal: {
    currentMonth: { band: "bg-cream", text: "text-background" },
    otherMonth: { band: "bg-cream/35", text: "text-ink" },
  },
} as const satisfies Record<DayHighlight, Record<"currentMonth" | "otherMonth", HighlightClassNames>>;

/**
 * 형광펜 종류와 보는 달에 속한 날인지로 띠·글자 클래스를 고른다.
 *
 * @example getHighlightClassNames({ highlight: "personal", isCurrentMonth: true }) // { band: "bg-cream", text: "text-background" }
 */
export const getHighlightClassNames = ({
  highlight,
  isCurrentMonth,
}: {
  highlight: DayHighlight;
  isCurrentMonth: boolean;
}): HighlightClassNames => HIGHLIGHT_CLASS_NAMES[highlight][isCurrentMonth ? "currentMonth" : "otherMonth"];

interface DayNumberClassNameParams {
  isToday: boolean;
  isAnniversary: boolean;
  /** 고른 날은 칸 바탕이 surface다 */
  isSelected: boolean;
  /** 그날 형광펜. 없으면 undefined */
  highlightClassNames: HighlightClassNames | undefined;
}

/**
 * 날짜 숫자 원의 클래스. 오늘(채운 원)·기념일(테두리)·형광펜이 겹쳐도 서로 구별되게 한다.
 * 오늘 원과 기념일 테두리도 분홍이라, 형광펜 위에서는 칸 바탕색 테두리로 떼어 놓아야 보인다.
 *
 * @example getDayNumberClassName({ isToday: true, isAnniversary: false, isSelected: false, highlightClassNames })
 */
export const getDayNumberClassName = ({
  isToday,
  isAnniversary,
  isSelected,
  highlightClassNames,
}: DayNumberClassNameParams): string => {
  const isOnBand = highlightClassNames !== undefined;
  const fill = isToday ? "bg-accent text-background" : isOnBand && highlightClassNames.text;
  const separator = isSelected
    ? { offset: "ring-offset-surface", ring: "ring-surface" }
    : { offset: "ring-offset-background", ring: "ring-background" };
  const ring = isAnniversary
    ? ["ring-1 ring-highlight", (isToday || isOnBand) && `ring-offset-2 ${separator.offset}`]
    : [isToday && isOnBand && `ring-2 ${separator.ring}`];
  return [fill, ...ring].filter(Boolean).join(" ");
};
