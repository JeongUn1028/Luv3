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
import { RecordComments } from "@/components/dates/RecordComments";
import { RecordDetailSkeleton } from "@/components/dates/RecordDetailSkeleton";
import { LinkEventButton, LinkedEventRow } from "@/components/dates/RecordEventLink";
import { RecordRoute } from "@/components/dates/route/RecordRoute";
import { RecordTagLink } from "@/components/dates/RecordTagLink";
import { ScreenHeader } from "@/components/ScreenHeader";
import { toKstDate } from "@/lib/anniversary";
import { getCurrentMember } from "@/lib/auth/member";
import { CommentLoadError, getRecordComments } from "@/lib/comments/queries";
import { RECORDS_PATH } from "@/lib/dates/album";
import { findStartPhotoIndex, formatRecordPeriod, RECORD_PHOTO_PARAM } from "@/lib/dates/detail";
import { DateRecordLoadError, getDateRecordDetail } from "@/lib/dates/queries";
import { EventLoadError, getLinkableEvents } from "@/lib/events/queries";
import { catchLoadError } from "@/lib/load";
import { FORWARD_TRANSITION } from "@/lib/navigation/transition";

export const metadata: Metadata = { title: "기록 · Luv3" };

// 수정·삭제 버튼이 기록을 읽은 뒤에야 정해져 머리글도 Suspense 안에서 그린다. 그래서 틀의 고정 머리글 대신 내용과 함께 스크롤한다
// 제목은 사진 아래 본문의 h1이 맡는다
const DetailHeader = ({ actions }: { actions?: ReactNode }) => (
  <ScreenHeader back={{ href: RECORDS_PATH }} actions={actions} />
);

// 이을 일정이 없으면 아무것도 그리지 않는다. 못 읽어도 기록은 그대로 볼 수 있다
const LinkEventSuggestion = async ({ recordId, date, endDate }: { recordId: string; date: string; endDate: string | undefined }) => {
  const events = await catchLoadError(() => getLinkableEvents({ start: date, end: endDate ?? date }, toKstDate(new Date())), EventLoadError);
  if (events instanceof EventLoadError || events.length === 0) return null;
  return <LinkEventButton recordId={recordId} events={events} />;
};

const RecordDetail = async ({ params, searchParams }: Pick<PageProps<"/dates/[id]">, "params" | "searchParams">) => {
  // 허용목록 밖 계정은 여기서 로그아웃 처리 경로로 보낸다
  const member = await getCurrentMember();
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const photoParam = query[RECORD_PHOTO_PARAM];
  // 같은 이름이 여러 번 오면 첫 값을 쓴다
  const startPhotoId = Array.isArray(photoParam) ? photoParam[0] : photoParam;
  // 댓글은 기록을 기다리지 않고 함께 읽는다. 댓글을 못 읽어도 기록은 보여 준다
  const [record, comments] = await Promise.all([
    catchLoadError(() => getDateRecordDetail(id), DateRecordLoadError),
    catchLoadError(() => getRecordComments({ recordId: id, memberId: member.id }), CommentLoadError),
  ]);

  if (record instanceof DateRecordLoadError) {
    return (
      <>
        <DetailHeader />
        <LoadErrorMessage message={record.message} />
      </>
    );
  }
  if (!record) notFound();
  // 지도 키가 없으면 동선 지도를 그리지 않는다(기록 탭의 지도 버튼과 같다)
  const mapKey = process.env.NEXT_PUBLIC_KAKAO_MAP_KEY;

  return (
    <>
      <DetailHeader
        actions={
          <>
            {record.eventHref && (
              // 일정에서 남긴 기록은 그 일정으로 돌아갈 수 있다(#227)
              <Link
                href={record.eventHref}
                transitionTypes={FORWARD_TRANSITION}
                aria-label="일정 보기"
                className="press-icon flex h-11 items-center px-3 text-[14px] text-ink-sub hover:text-ink"
              >
                일정
              </Link>
            )}
            <Link
              href={`/dates/${record.id}/edit`}
              transitionTypes={FORWARD_TRANSITION}
              className="press-icon flex h-11 items-center px-3 text-[14px] text-ink-sub hover:text-ink"
            >
              수정
            </Link>
            <DeleteRecordButton recordId={record.id} filePaths={record.filePaths} photoCount={record.photos.length} />
          </>
        }
      />
      <article className="flex flex-col">
        {/* 지도의 사진 미리보기에서 고른 사진부터 펼친다(#249) */}
        <PhotoCarousel photos={record.photos} title={record.title} startIndex={findStartPhotoIndex(record.photos, startPhotoId)} />
        <div className="flex flex-col px-4 pt-6">
          <div className="flex items-center justify-between gap-3">
            <p className="min-w-0 text-[13px] break-words text-ink-sub">
              <time dateTime={record.date}>{formatRecordPeriod(record)}</time>
              {record.place && <span> · {record.place}</span>}
            </p>
            {record.authorNickname && <AuthorTag nickname={record.authorNickname} />}
          </div>
          <h1 className="mt-1.5 font-display text-[22px] leading-[1.4] break-words text-ink">{record.title}</h1>
          {record.tags.length > 0 && (
            <ul aria-label="태그" className="mt-3 flex flex-wrap gap-x-1.5 gap-y-[18px]">
              {record.tags.map((tag) => (
                <li key={tag}>
                  <RecordTagLink tag={tag} />
                </li>
              ))}
            </ul>
          )}
          {record.memo && (
            <p className="mt-5 text-[15px] leading-[1.75] break-words whitespace-pre-wrap text-ink">{record.memo}</p>
          )}
          {/* 사진 위치를 찍은 순서대로 이은 동선(#251). 이을 곳이 둘 미만이면 그리지 않는다 */}
          {record.route && mapKey && <RecordRoute route={record.route} appKey={mapKey} />}
          {/* 이미 쓴 기록도 일정과 잇고, 잘못 이었으면 연결만 끊는다(#237). 이을 일정은 기록을 그린 뒤에 읽어 화면을 늦추지 않고, 늦게 나타나도 글을 밀지 않게 본문 끝에 둔다 */}
          {record.linkedEvent ? (
            <LinkedEventRow recordId={record.id} event={record.linkedEvent} />
          ) : (
            <LoadingSuspense fallback={null}>
              <LinkEventSuggestion recordId={record.id} date={record.date} endDate={record.endDate} />
            </LoadingSuspense>
          )}
        </div>
      </article>
      <RecordComments recordId={record.id} comments={comments} />
    </>
  );
};

const DateRecordPage = ({ params, searchParams }: PageProps<"/dates/[id]">) => (
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
      <RecordDetail params={params} searchParams={searchParams} />
    </LoadingSuspense>
  </PageShell>
);

export default DateRecordPage;
