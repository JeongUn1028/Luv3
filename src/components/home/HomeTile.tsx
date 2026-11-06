import Link from "next/link";
import { useId, type ReactElement, type ReactNode } from "react";
import { FORWARD_TRANSITION, TAB_TRANSITION } from "@/lib/navigation/transition";

interface HomeTileProps {
  title: string;
  /** 칸 전체를 덮는 링크. 글자는 보이지 않고, 화면 읽기 프로그램에 "캘린더 모두 보기"처럼 읽힌다 */
  more?: { href: string; target: string };
  /** 내용이 없을 때의 점선 칸(빈 상태, 불러오기 실패) */
  isOutlined?: boolean;
  children: ReactNode;
}

/**
 * 홈 2열 그리드의 정사각형 칸: 제목 + 내용. overflow를 걸지 않아, 폭이 좁은 화면에서는 내용이 잘리는 대신 칸이 길어진다.
 *
 * @example
 * <HomeTile title="다음 일정" more={{ href: toCalendarHref({ date }), target: "캘린더" }}>
 *   <UpcomingEventList events={events} today={today} />
 * </HomeTile>
 */
export const HomeTile = ({ title, more, isOutlined = false, children }: HomeTileProps): ReactElement => {
  const titleId = useId();

  return (
    <section
      aria-labelledby={titleId}
      className={`relative flex aspect-square flex-col rounded-[16px] px-3.5 py-3 ${
        isOutlined ? "border border-dashed border-ink-sub/35" : "bg-surface"
      }`}
    >
      <h2 id={titleId} className="font-display text-[14px] leading-5 whitespace-nowrap text-ink">
        {title}
      </h2>
      {children}
      {more && (
        <Link href={more.href} transitionTypes={TAB_TRANSITION} className="absolute inset-0 rounded-[16px]">
          <span className="sr-only">{more.target} 모두 보기</span>
        </Link>
      )}
    </section>
  );
};

interface HomeTileMessageProps {
  /** 빈 상태 문구. 오류면 `role="alert"`로 알린다 */
  text: string;
  isError?: boolean;
  /** 문구 아래 바로 가기(첫 기록 남기기 등) */
  action?: { href: string; label: string };
}

/**
 * 칸이 비었거나 불러오지 못했을 때 칸 가운데에 쓰는 문구.
 *
 * @example <HomeTileMessage text="아직 남긴 기록이 없어요" action={{ href: "/dates/new", label: "첫 데이트 남기기" }} />
 */
export const HomeTileMessage = ({ text, isError = false, action }: HomeTileMessageProps): ReactElement => (
  <div className="my-auto flex flex-col items-center gap-0.5 text-center">
    {/* 칸이 좁아 글자 단위로 끊으면 "주세/요."처럼 한 글자만 다음 줄로 넘어간다 */}
    <p role={isError ? "alert" : undefined} className="text-[13px] leading-[18px] break-keep text-ink-sub">
      {text}
    </p>
    {action && (
      <Link href={action.href} transitionTypes={FORWARD_TRANSITION} className="flex h-11 items-center px-2 text-[14px] text-accent hover:underline">
        {action.label}
      </Link>
    )}
  </div>
);
