import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { AuthorTag } from "@/components/AuthorTag";
import { DeleteRecordButton } from "@/components/dates/DeleteRecordButton";
import { PhotoCarousel } from "@/components/dates/PhotoCarousel";
import { LoadErrorMessage } from "@/components/LoadErrorMessage";
import { LoadingSuspense } from "@/components/LoadingSuspense";
import { PageShell } from "@/components/PageShell";
import { RecordDetailSkeleton } from "@/components/dates/RecordDetailSkeleton";
import { ScreenHeader } from "@/components/ScreenHeader";
import { getCurrentMember } from "@/lib/auth/member";
import { RECORDS_PATH } from "@/lib/dates/album";
import { formatRecordPeriod } from "@/lib/dates/detail";
import { DateRecordLoadError, getDateRecordDetail } from "@/lib/dates/queries";
import { catchLoadError } from "@/lib/load";
import { FORWARD_TRANSITION } from "@/lib/navigation/transition";

export const metadata: Metadata = { title: "기록 · Luv3" };

// 수정·삭제 버튼이 기록을 읽은 뒤에야 정해져 머리글도 Suspense 안에서 그린다. 그래서 틀의 고정 머리글 대신 내용과 함께 스크롤한다
// 제목은 사진 아래 본문의 h1이 맡는다
const DetailHeader = ({ actions }: { actions?: ReactNode }) => (
  <ScreenHeader back={{ href: RECORDS_PATH }} actions={actions} />
);

const RecordDetail = async ({ params }: { params: Promise<{ id: string }> }) => {
  // 허용목록 밖 계정은 여기서 로그아웃 처리 경로로 보낸다
  await getCurrentMember();
  const { id } = await params;
  const record = await catchLoadError(() => getDateRecordDetail(id), DateRecordLoadError);

  if (record instanceof DateRecordLoadError) {
    return (
      <>
        <DetailHeader />
        <LoadErrorMessage message={record.message} />
      </>
    );
  }
  if (!record) notFound();

  return (
    <>
      <DetailHeader
        actions={
          <>
            <Link
              href={`/dates/${record.id}/edit`}
              transitionTypes={FORWARD_TRANSITION}
              className="flex h-11 items-center px-3 text-[14px] text-ink-sub hover:text-ink"
            >
              수정
            </Link>
            <DeleteRecordButton recordId={record.id} filePaths={record.filePaths} photoCount={record.photos.length} />
          </>
        }
      />
      <article className="flex flex-col">
        <PhotoCarousel photos={record.photos} title={record.title} />
        <div className="flex flex-col px-4 pt-6">
          <div className="flex items-center justify-between gap-3">
            <p className="min-w-0 text-[13px] break-words text-ink-sub">
              <time dateTime={record.date}>{formatRecordPeriod(record)}</time>
              {record.place && <span> · {record.place}</span>}
            </p>
            {record.authorNickname && <AuthorTag nickname={record.authorNickname} />}
          </div>
          <h1 className="mt-1.5 text-[22px] leading-[1.4] font-bold break-words text-ink">{record.title}</h1>
          {record.memo && (
            <p className="mt-5 text-[15px] leading-[1.75] break-words whitespace-pre-wrap text-ink">{record.memo}</p>
          )}
        </div>
      </article>
    </>
  );
};

const DateRecordPage = ({ params }: PageProps<"/dates/[id]">) => (
  <PageShell bottomSpace="md">
    {/* 주소의 id와 세션은 요청 때만 알 수 있어 Suspense 안에서 읽는다(cacheComponents). 수정·삭제는 기록을 읽은 뒤 보인다 */}
    <LoadingSuspense
      fallback={
        <>
          <DetailHeader />
          <RecordDetailSkeleton />
        </>
      }
    >
      <RecordDetail params={params} />
    </LoadingSuspense>
  </PageShell>
);

export default DateRecordPage;
