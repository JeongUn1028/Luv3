import type { Metadata } from "next";
import { Suspense } from "react";
import { TabScreen } from "@/components/tabs/TabScreen";
import { getCurrentMember } from "@/lib/auth/member";

export const metadata: Metadata = { title: "Todo · Luv3" };

const ComingSoon = async () => {
  // 허용목록 밖 계정은 여기서 로그아웃 처리 경로로 보낸다
  await getCurrentMember();

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 py-12 text-center">
      <p className="text-[15px] text-ink">함께 하고 싶은 것을 적는 곳이에요</p>
      <p className="text-[13px] text-ink-sub">곧 열려요</p>
    </div>
  );
};

// 목록과 오른쪽 위 + 버튼(하고 싶은 것 추가)은 #59에서 채운다
const TodosPage = () => (
  <TabScreen tab="todos" title="Todo" className="px-4">
    {/* 세션을 읽는 부분만 요청 때 그린다(cacheComponents) */}
    <Suspense fallback={<div className="flex-1" />}>
      <ComingSoon />
    </Suspense>
  </TabScreen>
);

export default TodosPage;
