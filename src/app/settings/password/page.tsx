import type { Metadata } from "next";
import { FormSkeleton } from "@/components/FormSkeleton";
import { LoadingSuspense } from "@/components/LoadingSuspense";
import { PasswordForm } from "@/components/settings/PasswordForm";
import { getCurrentEmail, getCurrentMember } from "@/lib/auth/member";
import { SETTINGS_PATH } from "@/lib/auth/paths";

export const metadata: Metadata = { title: "비밀번호 변경 · Luv3" };

const PasswordFormSection = async () => {
  // 허용목록 밖 계정은 여기서 로그아웃 처리 경로로 보낸다
  await getCurrentMember();
  const email = await getCurrentEmail();
  // cacheComponents는 다녀온 화면의 상태를 보존하므로, 요청마다 새 key로 새 폼을 만든다
  return <PasswordForm key={crypto.randomUUID()} email={email} />;
};

const PasswordPage = () => (
  // 세션은 요청 때만 알 수 있어 Suspense 안에서 읽는다(cacheComponents)
  <LoadingSuspense fallback={<FormSkeleton back={{ href: SETTINGS_PATH }} title="비밀번호 변경" fieldCount={3} />}>
    <PasswordFormSection />
  </LoadingSuspense>
);

export default PasswordPage;
