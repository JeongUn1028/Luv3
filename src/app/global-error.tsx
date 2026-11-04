"use client";

import type { ReactElement } from "react";
import "./globals.css";
import { HOME_PATH } from "@/lib/auth/paths";

interface GlobalErrorPageProps {
  /** 화면을 다시 불러와 그린다 */
  retry: () => void;
}

// 루트 레이아웃의 웹폰트 변수가 없으면 글꼴 지정 전체가 무효가 되어 시스템 글꼴을 직접 적는다
const SYSTEM_FONT_FAMILY = '-apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", sans-serif';

/**
 * 루트 레이아웃까지 실패했을 때 그 자리를 대신하는 최후의 화면. 레이아웃이 없으므로 문서와 화면 틀, 메타를 직접 둔다.
 * PageShell 같은 일반 화면 코드가 오류의 원인이면 함께 실패하므로 쓰지 않고 직접 그린다.
 */
const GlobalErrorPage = ({ retry }: GlobalErrorPageProps): ReactElement => (
  <html lang="ko" className="h-full antialiased">
    <head>
      <title>문제가 생겼어요 · Luv3</title>
      <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
      <meta name="theme-color" content="#0A0A0A" />
      <meta name="robots" content="noindex, nofollow" />
      <meta name="mobile-web-app-capable" content="yes" />
      <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
    </head>
    <body className="min-h-full bg-background text-ink" style={{ fontFamily: SYSTEM_FONT_FAMILY }}>
      <div className="mx-auto flex h-app w-full max-w-[430px] flex-col">
        <main className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 px-4 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] text-center">
          <div role="alert" className="flex flex-col gap-4">
            <h1 className="text-[15px] text-ink">문제가 생겼어요</h1>
            <p className="text-[13px] text-ink-sub">잠시 후 다시 시도해 주세요.</p>
          </div>
          <div className="mt-2 flex w-full flex-col gap-2.5">
            <button
              type="button"
              onClick={() => retry()}
              className="h-[51px] w-full rounded-[10px] bg-accent text-[15px] font-bold text-background"
            >
              다시 시도
            </button>
            <a
              href={HOME_PATH}
              className="flex h-[51px] w-full items-center justify-center rounded-[10px] border border-line text-[15px] text-ink hover:bg-surface"
            >
              홈으로
            </a>
          </div>
        </main>
      </div>
    </body>
  </html>
);

export default GlobalErrorPage;
