import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DateRecordForm } from "@/components/dates/DateRecordForm";
import { FormSkeleton } from "@/components/FormSkeleton";
import { LoadErrorScreen } from "@/components/LoadErrorScreen";
import { LoadingSuspense } from "@/components/LoadingSuspense";
import { getCurrentMember } from "@/lib/auth/member";
import { RECORDS_PATH } from "@/lib/dates/album";
import { DateRecordLoadError, getEditableRecord, getTagSuggestions } from "@/lib/dates/queries";
import { catchLoadError } from "@/lib/load";

export const metadata: Metadata = { title: "기록 고치기 · Luv3" };

const EditForm = async ({ params }: { params: Promise<{ id: string }> }) => {
  // 허용목록 밖 계정은 여기서 로그아웃 처리 경로로 보낸다
  await getCurrentMember();
  const { id } = await params;
  const [record, tagSuggestions] = await Promise.all([
    catchLoadError(() => getEditableRecord(id), DateRecordLoadError),
    getTagSuggestions(),
  ]);

  if (record instanceof DateRecordLoadError) {
    return <LoadErrorScreen title="기록을 불러오지 못했어요" backHref={RECORDS_PATH} backLabel="기록 목록으로" />;
  }
  if (!record) notFound();

  // cacheComponents는 다녀온 화면의 상태를 보존해, 저장 뒤 다시 열면 예전 입력값이 남는다.
  // 요청마다 새 key를 줘 최신 기록 값으로 폼을 다시 만든다
  return (
    <DateRecordForm
      key={crypto.randomUUID()}
      record={record}
      tagSuggestions={tagSuggestions}
      // 지도 키가 없으면 모음 위치 고르기 창이 지도 대신 안내를 보인다
      mapKey={process.env.NEXT_PUBLIC_KAKAO_MAP_KEY}
    />
  );
};

const EditDateRecordPage = ({ params }: PageProps<"/dates/[id]/edit">) => (
  // 주소의 id와 세션은 요청 때만 알 수 있어 Suspense 안에서 읽는다(cacheComponents)
  <LoadingSuspense fallback={<FormSkeleton back={{ href: RECORDS_PATH }} title="기록 고치기" fieldCount={4} />}>
    <EditForm params={params} />
  </LoadingSuspense>
);

export default EditDateRecordPage;
