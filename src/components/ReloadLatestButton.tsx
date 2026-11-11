"use client";

import { useRouter } from "next/navigation";
import { useTransition, type ReactElement } from "react";

/**
 * 저장이 충돌했을 때(화면을 연 뒤 상대가 저장함) 폼의 저장 버튼 자리에 놓는 버튼. 다시 저장해도 거부되므로 최신 내용을 불러오는 길을 준다.
 * 페이지가 다시 불러올 때마다 폼을 새로 만들므로, 불러오면 최신 내용으로 다시 고칠 수 있다(쓰던 내용은 사라진다).
 *
 * @example {draft.hasConflict ? <ReloadLatestButton /> : <button type="submit">저장</button>}
 */
export const ReloadLatestButton = (): ReactElement => {
  const router = useRouter();
  const [isReloading, startReloading] = useTransition();

  return (
    <button
      type="button"
      disabled={isReloading}
      onClick={() => startReloading(() => router.refresh())}
      className="press-wide h-[52px] w-full rounded-[10px] bg-accent font-display text-[15px] text-background disabled:opacity-50"
    >
      {isReloading ? "불러오는 중…" : "최신 내용 불러오기"}
    </button>
  );
};
