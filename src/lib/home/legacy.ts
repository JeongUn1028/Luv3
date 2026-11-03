import { toCalendarHref } from "@/lib/calendar/month";

/** 주소 중 예전 홈 주소인지 가릴 때 쓰는 부분. `URL`·`NextURL`을 그대로 넘길 수 있다 */
export interface LegacyHomeUrl {
  pathname: string;
  searchParams: URLSearchParams;
}

/**
 * 예전 홈 주소(`/?view=calendar&month=&date=`)면 옮겨 갈 캘린더 탭 주소를 돌려준다.
 * 기록·캘린더를 한 화면에서 옆으로 넘기던 때(#58 전)의 북마크·열려 있던 화면에서 들어와도 이어지게 한다.
 *
 * @example getLegacyHomeRedirect(new URL("https://luv3.vercel.app/?view=calendar&month=2026-12")) // "/calendar?month=2026-12"
 */
export const getLegacyHomeRedirect = ({ pathname, searchParams }: LegacyHomeUrl): string | undefined => {
  if (pathname !== "/" || searchParams.get("view") !== "calendar") return undefined;
  return toCalendarHref({
    month: searchParams.get("month") ?? undefined,
    date: searchParams.get("date") ?? undefined,
  });
};
