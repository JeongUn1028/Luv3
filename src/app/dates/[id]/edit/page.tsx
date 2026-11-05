import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DateRecordForm } from "@/components/dates/DateRecordForm";
import { FormSkeleton } from "@/components/FormSkeleton";
import { PageShell } from "@/components/PageShell";
import { LoadingSuspense } from "@/components/LoadingSuspense";
import { getCurrentMember } from "@/lib/auth/member";
import { RECORDS_PATH } from "@/lib/dates/album";
import { DateRecordLoadError, getEditableRecord } from "@/lib/dates/queries";
import { catchLoadError } from "@/lib/load";

export const metadata: Metadata = { title: "기록 고치기 · Luv3" };

const EditForm = async ({ params }: { params: Promise<{ id: string }> }) => {
  // 허용목록 밖 계정은 여기서 로그아웃 처리 경로로 보낸다
  await getCurrentMember();
  const { id } = await params;
  const record = await catchLoadError(() => getEditableRecord(id), DateRecordLoadError);

  if (!record) notFound();
  if (record instanceof DateRecordLoadError) {
    return (
      <PageShell className="items-center justify-center px-4">
        <p role="alert" className="text-[13px] text-ink-sub">
          {record.message}
        </p>
      </PageShell>
    );
  }

  // cacheComponents는 다녀온 화면의 상태를 보존해, 저장 뒤 다시 열면 예전 입력값이 남는다.
  // 요청마다 새 key를 줘 최신 기록 값으로 폼을 다시 만든다
  return <DateRecordForm key={crypto.randomUUID()} record={record} />;
};

const EditDateRecordPage = ({ params }: PageProps<"/dates/[id]/edit">) => (
  // 주소의 id와 세션은 요청 때만 알 수 있어 Suspense 안에서 읽는다(cacheComponents)
  <LoadingSuspense fallback={<FormSkeleton back={{ href: RECORDS_PATH }} title="기록 고치기" fieldCount={4} />}>
    <EditForm params={params} />
  </LoadingSuspense>
);

export default EditDateRecordPage;
