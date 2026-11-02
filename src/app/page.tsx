import { Suspense } from "react";
import { getCurrentMember } from "@/lib/auth/member";

const MemberBar = async () => {
  const member = await getCurrentMember();

  return (
    <div className="flex items-center justify-between">
      <p className="text-[15px] text-ink">{member.nickname}</p>
      <form action="/auth/signout" method="post">
        <button type="submit" className="h-10 text-[13px] text-ink-sub underline underline-offset-4">
          로그아웃
        </button>
      </form>
    </div>
  );
};

const HomePage = () => (
  <main className="mx-auto flex min-h-dvh w-full max-w-[430px] flex-col gap-8 px-4 py-6">
    {/* 세션을 읽는 부분만 요청 시점에 렌더링한다(cacheComponents) */}
    <Suspense fallback={<div className="h-10" />}>
      <MemberBar />
    </Suspense>
    <p className="text-[13px] text-ink-sub">아직 기록이 없습니다. 앨범 목록은 2주차에 만듭니다.</p>
  </main>
);

export default HomePage;
