import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { DateRecordForm } from "@/components/dates/DateRecordForm";
import { getCurrentMember } from "@/lib/auth/member";
import type { EditableRecord } from "@/lib/dates/detail";
import { DateRecordLoadError, getEditableRecord } from "@/lib/dates/queries";

export const metadata: Metadata = { title: "기록 고치기 · Luv3" };

/** 조회 실패만 화면 문구로 바꾸고, 그 밖의 에러는 그대로 던진다 */
const loadRecord = async (id: string): Promise<EditableRecord | DateRecordLoadError | undefined> => {
  try {
    return await getEditableRecord(id);
  } catch (error) {
    if (error instanceof DateRecordLoadError) return error;
    throw error;
  }
};

const EditForm = async ({ params }: { params: Promise<{ id: string }> }) => {
  // 허용목록 밖 계정은 여기서 로그아웃 처리 경로로 보낸다
  await getCurrentMember();
  const { id } = await params;
  const record = await loadRecord(id);

  if (!record) notFound();
  if (record instanceof DateRecordLoadError) {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-[430px] items-center justify-center px-4">
        <p role="alert" className="text-[13px] text-ink-sub">
          {record.message}
        </p>
      </main>
    );
  }

  // cacheComponents는 다녀온 화면의 상태를 보존해, 저장 뒤 다시 열면 예전 입력값이 남는다.
  // 요청마다 새 key를 줘 최신 기록 값으로 폼을 다시 만든다
  return <DateRecordForm key={crypto.randomUUID()} record={record} />;
};

const EditDateRecordPage = ({ params }: PageProps<"/dates/[id]/edit">) => (
  // 주소의 id와 세션은 요청 때만 알 수 있어 Suspense 안에서 읽는다(cacheComponents)
  <Suspense fallback={<div className="min-h-dvh" />}>
    <EditForm params={params} />
  </Suspense>
);

export default EditDateRecordPage;
