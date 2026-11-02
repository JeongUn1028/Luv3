import type { Metadata } from "next";
import { Suspense } from "react";
import { DateRecordForm } from "@/components/dates/DateRecordForm";
import { getCurrentMember } from "@/lib/auth/member";

export const metadata: Metadata = { title: "기록 남기기 · Luv3" };

const MemberOnlyForm = async () => {
  // 허용목록 밖 계정은 여기서 로그아웃 처리 경로로 보낸다
  await getCurrentMember();
  return <DateRecordForm />;
};

const NewDateRecordPage = () => (
  // 세션을 읽고 오늘 날짜를 기본값으로 쓰므로 요청 시점에 렌더링한다(cacheComponents)
  <Suspense fallback={<div className="min-h-dvh" />}>
    <MemberOnlyForm />
  </Suspense>
);

export default NewDateRecordPage;
