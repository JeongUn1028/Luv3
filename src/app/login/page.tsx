import type { Metadata } from "next";
import { Suspense } from "react";
import { HeartLogo } from "@/components/HeartLogo";
import { InstallHint } from "@/components/InstallHint";
import { PageShell } from "@/components/PageShell";
import { ANNIVERSARY_DATE, formatSinceLabel } from "@/lib/anniversary";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = { title: "로그인 · Luv3" };

const LoginPage = () => (
  <PageShell bottomSpace="lg" className="px-6">
    {/* 처음 주소를 받아 Safari로 연 사람은 여기서 홈 화면 추가를 알게 된다. 로그인은 세션이 있는 동안 다시 안 보므로 사실상 첫 방문에만 보인다 */}
    <InstallHint />
    <section className="flex flex-1 flex-col items-center justify-center py-12">
      <h1 className="sr-only">Luv3</h1>
      <HeartLogo className="w-[120px] text-highlight" />
      <div className="mt-10 h-px w-8 bg-ink-sub" />
      {/* letter-spacing이 마지막 글자 뒤에도 붙어 가운데가 왼쪽으로 쏠리므로 같은 만큼 왼쪽을 띄운다 */}
      <p className="mt-5 pl-[6px] font-display text-[14px] font-semibold tracking-[6px] text-label">
        {formatSinceLabel(ANNIVERSARY_DATE)}
      </p>
    </section>
    {/* useSearchParams는 요청마다 달라지므로 Suspense 안에서 렌더링한다 */}
    <Suspense>
      <LoginForm />
    </Suspense>
  </PageShell>
);

export default LoginPage;
