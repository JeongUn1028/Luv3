import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PhotoCarousel } from "@/components/dates/PhotoCarousel";
import { BackIcon } from "@/components/icons";
import { getCurrentMember } from "@/lib/auth/member";
import { formatRecordDate, type DateRecordDetail } from "@/lib/dates/detail";
import { DateRecordLoadError, getDateRecordDetail } from "@/lib/dates/queries";

export const metadata: Metadata = { title: "기록 · Luv3" };

/** 조회 실패만 화면 문구로 바꾸고, 그 밖의 에러는 그대로 던진다 */
const loadRecord = async (id: string): Promise<DateRecordDetail | DateRecordLoadError | undefined> => {
  try {
    return await getDateRecordDetail(id);
  } catch (error) {
    if (error instanceof DateRecordLoadError) return error;
    throw error;
  }
};

const RecordDetail = async ({ params }: { params: Promise<{ id: string }> }) => {
  // 허용목록 밖 계정은 여기서 로그아웃 처리 경로로 보낸다
  await getCurrentMember();
  const { id } = await params;
  const record = await loadRecord(id);

  if (!record) notFound();
  if (record instanceof DateRecordLoadError) {
    return (
      <p role="alert" className="px-4 py-12 text-center text-[13px] text-ink-sub">
        {record.message}
      </p>
    );
  }

  return (
    <article className="flex flex-col">
      <PhotoCarousel photos={record.photos} title={record.title} />
      <div className="flex flex-col px-4 pt-6">
        <p className="text-[13px] text-ink-sub">
          <time dateTime={record.date}>{formatRecordDate(record.date)}</time>
          {record.place && <span> · {record.place}</span>}
        </p>
        <h1 className="mt-1.5 text-[22px] leading-[1.4] font-bold break-words text-ink">{record.title}</h1>
        {record.memo && (
          <p className="mt-5 text-[15px] leading-[1.75] break-words whitespace-pre-wrap text-ink">{record.memo}</p>
        )}
      </div>
    </article>
  );
};

const DateRecordPage = ({ params }: PageProps<"/dates/[id]">) => (
  <main className="mx-auto flex min-h-dvh w-full max-w-[430px] flex-col pb-[max(32px,env(safe-area-inset-bottom))]">
    <header className="flex shrink-0 items-center px-2 pt-[env(safe-area-inset-top)]">
      <Link href="/" aria-label="홈으로" className="flex size-11 items-center justify-center text-ink-sub hover:text-ink">
        <BackIcon className="size-[22px]" />
      </Link>
    </header>
    {/* 주소의 id와 세션은 요청 때만 알 수 있어 Suspense 안에서 읽는다(cacheComponents) */}
    <Suspense fallback={<div className="aspect-[4/5] w-full bg-surface" />}>
      <RecordDetail params={params} />
    </Suspense>
  </main>
);

export default DateRecordPage;
