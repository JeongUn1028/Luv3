import Link from "next/link";
import { useId, type ReactElement, type ReactNode } from "react";

// 칸마다 빈 상태·오류 문구 높이가 들쭉날쭉하지 않게 같은 상자를 쓴다
const MESSAGE_CLASS_NAME =
  "flex min-h-[72px] flex-col items-center justify-center gap-1 rounded-[12px] border border-dashed border-line px-4 py-3 text-center";

interface HomeSectionProps {
  title: string;
  /** 제목 아래 작은 설명(일정 날짜 등) */
  detail?: string;
  /** 오른쪽 위 "모두 보기" 링크. `target`은 화면 읽기 프로그램에 "기록 모두 보기"처럼 앞에 붙여 읽힌다 */
  more?: { href: string; target: string };
  children: ReactNode;
}

/**
 * 홈 대시보드의 한 칸: 제목(+설명) + 모두 보기 링크 + 내용.
 *
 * @example
 * <HomeSection title="최근 데이트" more={{ href: RECORDS_PATH, target: "기록" }}>
 *   <LatestRecordCard record={record} />
 * </HomeSection>
 */
export const HomeSection = ({ title, detail, more, children }: HomeSectionProps): ReactElement => {
  const titleId = useId();

  return (
    <section aria-labelledby={titleId} className="mt-6">
      <div className="flex min-h-11 items-center justify-between">
        <div className="flex min-w-0 flex-col">
          <h2 id={titleId} className="text-[15px] font-bold text-ink">
            {title}
          </h2>
          {detail && <p className="truncate text-[12px] text-ink-sub">{detail}</p>}
        </div>
        {more && (
          <Link
            href={more.href}
            className="-mr-2 flex h-11 shrink-0 items-center px-2 text-[13px] text-ink-sub hover:text-ink"
          >
            <span className="sr-only">{more.target} </span>모두 보기
          </Link>
        )}
      </div>
      <div className="mt-1">{children}</div>
    </section>
  );
};

interface HomeMessageProps {
  /** 빈 상태 문구. 오류면 `role="alert"`로 알린다 */
  text: string;
  isError?: boolean;
  /** 문구 아래 바로 가기(첫 기록 남기기 등) */
  action?: { href: string; label: string };
}

/**
 * 칸이 비었거나 불러오지 못했을 때의 문구.
 *
 * @example <HomeMessage text="아직 남긴 기록이 없어요" action={{ href: "/dates/new", label: "첫 데이트 남기기" }} />
 */
export const HomeMessage = ({ text, isError = false, action }: HomeMessageProps): ReactElement => (
  <div className={MESSAGE_CLASS_NAME}>
    <p role={isError ? "alert" : undefined} className="text-[13px] text-ink-sub">
      {text}
    </p>
    {action && (
      <Link href={action.href} className="flex h-9 items-center px-2 text-[14px] text-accent hover:underline">
        {action.label}
      </Link>
    )}
  </div>
);
