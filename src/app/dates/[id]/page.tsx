import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { AuthorTag } from "@/components/AuthorTag";
import { DeleteRecordButton } from "@/components/dates/DeleteRecordButton";
import { FirstPhotoGate } from "@/components/dates/FirstPhotoGate";
import { PhotoCarousel } from "@/components/dates/PhotoCarousel";
import { LoadErrorMessage } from "@/components/LoadErrorMessage";
import { LoadingSuspense } from "@/components/LoadingSuspense";
import { PageShell } from "@/components/PageShell";
import { RecordComments } from "@/components/dates/RecordComments";
import { RecordDetailSkeleton } from "@/components/dates/RecordDetailSkeleton";
import { RecordEventLink } from "@/components/dates/RecordEventLink";
import { RecordRoute } from "@/components/dates/route/RecordRoute";
import { RecordTagLink } from "@/components/dates/RecordTagLink";
import { ScreenHeader } from "@/components/ScreenHeader";
import { toKstDate } from "@/lib/anniversary";
import { withCurrentMember } from "@/lib/auth/with-member";
import { toRecordComment } from "@/lib/comments/comment";
import { getRecordComments } from "@/lib/comments/queries";
import { CommentLoadError } from "@/lib/comments/read";
import { RECORDS_PATH } from "@/lib/dates/album";
import { findStartPhotoIndex } from "@/lib/dates/detail";
import { RECORD_PHOTO_PARAM } from "@/lib/dates/record-href";
import { formatRecordPeriod } from "@/lib/dates/record-date-format";
import { DateRecordLoadError, getDateRecordDetail } from "@/lib/dates/queries";
import { EventLoadError, getLinkableEvents } from "@/lib/events/queries";
import { catchLoadError } from "@/lib/load";
import { FORWARD_TRANSITION } from "@/lib/navigation/transition";

export const metadata: Metadata = { title: "기록 · Luv3" };

// 고치기·지우기 버튼이 기록을 읽은 뒤에야 정해져 머리글도 Suspense 안에서 그린다. 틀의 고정 머리글 자리 대신 스크롤 영역 맨 위에 붙여,
// 긴 글과 댓글을 읽어 내려가도 뒤로·고치기·지우기가 남게 한다(#349). 아래로 지나가는 사진·글이 비치지 않게 바탕을 칠하고,
// 위쪽 알림(SaveNotices, z-10)은 가리지 않도록 본문 위로만 올린다
// 제목은 사진 아래 본문의 h1이 맡는다
const DetailHeader = ({ actions }: { actions?: ReactNode }) => (
  <div className="sticky top-0 z-1 shrink-0 bg-background">
    <ScreenHeader back={{ href: RECORDS_PATH }} actions={actions} />
  </div>
);

// 이을 일정을 읽어 잇기 칸을 그린다. 못 읽으면 잇기 버튼만 빼고, 기록은 그대로 볼 수 있다
const LinkableEventsSection = async ({ recordId, date, endDate }: { recordId: string; date: string; endDate: string | undefined }) => {
  const events = await catchLoadError(() => getLinkableEvents({ start: date, end: endDate ?? date }, toKstDate(new Date())), EventLoadError);
  return <RecordEventLink recordId={recordId} linkedEvent={undefined} events={events instanceof EventLoadError ? [] : events} />;
};

const RecordDetail = async ({ params, searchParams }: Pick<PageProps<"/dates/[id]">, "params" | "searchParams">) => {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const photoParam = query[RECORD_PHOTO_PARAM];
  // 같은 이름이 여러 번 오면 첫 값을 쓴다
  const startPhotoId = Array.isArray(photoParam) ? photoParam[0] : photoParam;
  // 허용목록 밖 계정은 여기서 로그아웃 처리 경로로 보낸다. 확인과 조회는 함께 시작한다(#344)
  // 댓글은 기록을 기다리지 않고 함께 읽는다. 댓글을 못 읽어도 기록은 보여 준다
  const [member, [record, commentRows]] = await withCurrentMember(() =>
    Promise.all([
      catchLoadError(() => getDateRecordDetail(id, startPhotoId), DateRecordLoadError),
      catchLoadError(() => getRecordComments(id), CommentLoadError),
    ]),
  );
  const comments = commentRows instanceof CommentLoadError ? commentRows : commentRows.map((row) => toRecordComment(row, member.id));

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
              고치기
            </Link>
            <DeleteRecordButton recordId={record.id} photoCount={record.photos.length} />
          </>
        }
      />
      {/* 동선 지도는 처음 펼친 사진을 받은 뒤에 불러온다(#313) */}
      <FirstPhotoGate>
        <article className="flex flex-col">
          {/* 지도의 사진 미리보기에서 고른 사진부터 펼친다(#249) */}
          <PhotoCarousel photos={record.photos} groups={record.groups} title={record.title} startIndex={findStartPhotoIndex(record.photos, startPhotoId)} />
          <div className="flex flex-col px-4 pt-6">
            <div className="flex items-center justify-between gap-3">
              <p className="min-w-0 text-[13px] break-words text-ink-sub">
                <time dateTime={record.date}>{formatRecordPeriod(record)}</time>
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
            {/* 이어져 있든 아니든 같은 자리에 같은 RecordEventLink를 그려야, 잇거나 끊은 뒤 새 화면이 와도 그 칸이 새로 만들어지지 않는다(#391).
                이어진 일정이 있으면 이을 일정을 읽지 않고 바로 그린다 */}
            <LoadingSuspense fallback={null}>
              {record.linkedEvent ? (
                <RecordEventLink recordId={record.id} linkedEvent={record.linkedEvent} events={[]} />
              ) : (
                <LinkableEventsSection recordId={record.id} date={record.date} endDate={record.endDate} />
              )}
            </LoadingSuspense>
          </div>
        </article>
      </FirstPhotoGate>
      <RecordComments recordId={record.id} comments={comments} memberNickname={member.nickname} memberId={member.id} />
    </>
  );
};

const DateRecordPage = ({ params, searchParams }: PageProps<"/dates/[id]">) => (
  // 위에 붙인 머리글(44px)만큼 비워, 초점을 옮겨 스크롤될 때 그 칸이 머리글 밑에 들어가지 않게 한다
  <PageShell bottomSpace="md" className="scroll-pt-11">
    {/* 주소의 id와 세션은 요청 때만 알 수 있어 Suspense 안에서 읽는다(cacheComponents). 고치기·지우기는 기록을 읽은 뒤 보인다 */}
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
