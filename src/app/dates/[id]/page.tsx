import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense, type ReactNode } from "react";
import { AuthorHeart } from "@/components/AuthorHeart";
import { DeleteRecordButton } from "@/components/dates/DeleteRecordButton";
import { PhotoCarousel } from "@/components/dates/PhotoCarousel";
import { PageShell } from "@/components/PageShell";
import { ScreenHeader } from "@/components/ScreenHeader";
import { getCurrentMember } from "@/lib/auth/member";
import { RECORDS_PATH } from "@/lib/dates/album";
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

// 수정·삭제 버튼이 기록을 읽은 뒤에야 정해져 머리글도 Suspense 안에서 그린다. 그래서 틀의 고정 머리글 대신 내용과 함께 스크롤한다
// 제목은 사진 아래 본문의 h1이 맡는다
const DetailHeader = ({ actions }: { actions?: ReactNode }) => (
  <ScreenHeader back={{ href: RECORDS_PATH, label: "기록 목록으로" }} actions={actions} />
);

const RecordDetail = async ({ params }: { params: Promise<{ id: string }> }) => {
  // 허용목록 밖 계정은 여기서 로그아웃 처리 경로로 보낸다
  await getCurrentMember();
  const { id } = await params;
  const record = await loadRecord(id);

  if (!record) notFound();
  if (record instanceof DateRecordLoadError) {
    return (
      <>
        <DetailHeader />
        <p role="alert" className="px-4 py-12 text-center text-[13px] text-ink-sub">
          {record.message}
        </p>
      </>
    );
  }

  return (
    <>
      <DetailHeader
        actions={
          <>
            <Link
              href={`/dates/${record.id}/edit`}
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
              <time dateTime={record.date}>{formatRecordDate(record.date)}</time>
              {record.place && <span> · {record.place}</span>}
            </p>
            {record.authorNickname && <AuthorHeart nickname={record.authorNickname} />}
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
    <Suspense
      fallback={
        <>
          <DetailHeader />
          <div className="aspect-[4/5] w-full bg-surface" />
        </>
      }
    >
      <RecordDetail params={params} />
    </Suspense>
  </PageShell>
);

export default DateRecordPage;
