import type { Metadata } from "next";
import { FormSkeleton } from "@/components/FormSkeleton";
import { LoadingSuspense } from "@/components/LoadingSuspense";
import { NicknameForm } from "@/components/settings/NicknameForm";
import { getCurrentMember } from "@/lib/auth/member";
import { SETTINGS_PATH } from "@/lib/auth/paths";

export const metadata: Metadata = { title: "닉네임 변경 · Luv3" };

const NicknameFormSection = async () => {
  const { id, nickname } = await getCurrentMember();
  // cacheComponents는 다녀온 화면의 상태를 보존하므로, 요청마다 새 key로 새 폼을 만든다
  return <NicknameForm key={crypto.randomUUID()} memberId={id} initialNickname={nickname} />;
};

const NicknamePage = () => (
  // 세션은 요청 때만 알 수 있어 Suspense 안에서 읽는다(cacheComponents)
  <LoadingSuspense fallback={<FormSkeleton back={{ href: SETTINGS_PATH }} title="닉네임 변경" fieldCount={1} />}>
    <NicknameFormSection />
  </LoadingSuspense>
);

export default NicknamePage;
