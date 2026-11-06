import type { Metadata } from "next";
import { DateRecordForm } from "@/components/dates/DateRecordForm";
import { FormSkeleton } from "@/components/FormSkeleton";
import { LoadingSuspense } from "@/components/LoadingSuspense";
import { toKstDate } from "@/lib/anniversary";
import { getCurrentMember } from "@/lib/auth/member";
import { RECORDS_PATH } from "@/lib/dates/album";
import { parseRecordPrefill } from "@/lib/dates/form";
import { getTagSuggestions } from "@/lib/dates/queries";

export const metadata: Metadata = { title: "기록 남기기 · Luv3" };

const MemberOnlyForm = async ({ searchParams }: Pick<PageProps<"/dates/new">, "searchParams">) => {
  // 허용목록 밖 계정은 여기서 로그아웃 처리 경로로 보낸다
  await getCurrentMember();
  // 캘린더의 지난 일정에서 넘어오면 날짜·제목·장소를 채운다
  const prefill = parseRecordPrefill(await searchParams, toKstDate(new Date()));
  const tagSuggestions = await getTagSuggestions();
  // cacheComponents는 다녀온 화면의 상태를 보존한다. 일정에서 넘어오면 요청마다 새 key로 그 일정 값을 다시 채우고
  // (일정 수정 화면과 같은 방식), 그냥 열면 같은 key로 쓰던 내용을 남긴다. 둘을 오가면 key가 바뀌어 쓰던 내용은 사라진다
  return (
    <DateRecordForm
      key={prefill ? crypto.randomUUID() : "empty"}
      prefill={prefill}
      tagSuggestions={tagSuggestions}
      canSearchPlace={Boolean(process.env.KAKAO_REST_API_KEY)}
    />
  );
};

const NewDateRecordPage = ({ searchParams }: PageProps<"/dates/new">) => (
  // 세션·주소 쿼리를 읽고 오늘 날짜를 기본값으로 쓰므로 요청 시점에 렌더링한다(cacheComponents)
  <LoadingSuspense fallback={<FormSkeleton back={{ href: RECORDS_PATH }} title="기록 남기기" fieldCount={4} />}>
    <MemberOnlyForm searchParams={searchParams} />
  </LoadingSuspense>
);

export default NewDateRecordPage;
