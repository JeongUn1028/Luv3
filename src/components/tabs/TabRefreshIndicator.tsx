"use client";

import { useRouter } from "next/navigation";
import { useLayoutEffect, useRef, useTransition, type ReactElement } from "react";
import { refreshSignedInScreen } from "@/lib/navigation/refresh-signed-in";
import { registerTabRefresh } from "@/lib/navigation/tab-refresh";

interface TabRefreshIndicatorProps {
  /** 이 표시가 놓인 탭 */
  tab: string;
}

/**
 * 맨 위에서 지금 탭을 다시 누르면 화면을 새로 받고, 받는 동안 내용 위 가운데에 작은 동그라미를 보여 준다(#351, 시안 https://claude.ai/artifact/6u7jzQWC1HHqakHmixXJu5 1-B).
 * 로그인이 끊겼으면 서버가 로그인 화면으로 보내 다시 로그인 창이 소용없어지므로 받지 않는다(#102). 확인하는 동안에도 표시가 보인다.
 * 내용 영역을 밀지 않도록 머리글 아래에 높이 없이 놓고 그 위에 겹쳐 그린다.
 *
 * @example <TabRefreshIndicator tab="todos" />
 */
export const TabRefreshIndicator = ({ tab }: TabRefreshIndicatorProps): ReactElement => {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  // 받는 중에 또 누르면 같은 요청과 사진을 또 받으므로 무시한다. isPending은 누른 뒤 다시 그려져야 바뀌므로 그 사이는 ref로 막는다
  const isRefreshingRef = useRef(false);

  useLayoutEffect(
    () =>
      registerTabRefresh(tab, () => {
        if (isPending || isRefreshingRef.current) return;
        isRefreshingRef.current = true;
        startTransition(async () => {
          try {
            // await 뒤의 갱신은 다시 transition으로 감싸야 새 화면이 올 때까지 표시가 남는다
            await refreshSignedInScreen(() => startTransition(() => router.refresh()));
          } catch (error) {
            // 로그인 확인이 실패해도 화면은 그대로 둔다. 여기서 던지면 탭 화면 전체가 오류 화면으로 바뀐다
            reportError(error);
          } finally {
            isRefreshingRef.current = false;
          }
        });
      }),
    [tab, router, isPending],
  );

  return (
    <div className="relative z-10 h-0">
      <p role="status" className="sr-only">
        {isPending ? "새로 받는 중이에요" : ""}
      </p>
      {isPending && (
        <div
          aria-hidden="true"
          className="tab-refresh-in absolute inset-x-0 top-1.5 mx-auto grid size-8 place-items-center rounded-full border border-line bg-surface"
        >
          <div className="size-4 animate-spin rounded-full border-2 border-highlight/30 border-t-highlight motion-reduce:animate-none" />
        </div>
      )}
    </div>
  );
};
