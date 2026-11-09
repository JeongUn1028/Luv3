import type { Metadata } from "next";
import { Suspense } from "react";
import { DrawnLogo } from "@/components/DrawnLogo";
import { InstallHint } from "@/components/InstallHint";
import { PageShell } from "@/components/PageShell";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = { title: "로그인 · Luv3" };

const LoginPage = () => (
  <PageShell bottomSpace="lg" className="px-6">
    {/* 처음 주소를 받아 Safari로 연 사람은 여기서 홈 화면 추가를 알게 된다. 로그인은 세션이 있는 동안 다시 안 보므로 사실상 첫 방문에만 보인다 */}
    <InstallHint />
    <section className="flex flex-1 flex-col items-center justify-center py-12">
      <h1 className="sr-only">Luv3</h1>
      {/* 들어올 때 한 번 그린다(#198). 입력할 때 다시 그려지지 않도록 폼 상태와 상관없는 자리에 둔다 */}
      <DrawnLogo />
    </section>
    {/* useSearchParams는 요청마다 달라지므로 Suspense 안에서 렌더링한다 */}
    <Suspense>
      <LoginForm />
    </Suspense>
  </PageShell>
);

export default LoginPage;
