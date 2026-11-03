import Link from "next/link";
import type { ReactElement } from "react";
import { PageShell } from "@/components/PageShell";
import { RECORDS_PATH } from "@/lib/dates/album";

/** 없는 기록(지워졌거나 잘못된 주소)을 열었을 때 */
const DateRecordNotFound = (): ReactElement => (
  // 페이지 전체를 대신 그리므로 다른 화면과 같은 틀을 둔다
  <PageShell className="items-center justify-center gap-4 px-4 text-center">
    <p className="text-[15px] text-ink">기록을 찾을 수 없어요</p>
    <p className="text-[13px] text-ink-sub">지워졌거나 주소가 잘못됐어요.</p>
    <Link
      href={RECORDS_PATH}
      className="mt-2 flex h-[51px] w-full items-center justify-center rounded-[10px] border border-line text-[15px] text-ink hover:bg-surface"
    >
      기록 목록으로
    </Link>
  </PageShell>
);

export default DateRecordNotFound;
