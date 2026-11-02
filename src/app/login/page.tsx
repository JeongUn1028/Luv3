import type { Metadata } from "next";
import { Suspense } from "react";
import { HeartLogo } from "@/components/HeartLogo";
import { ANNIVERSARY_DATE, formatSinceLabel } from "@/lib/anniversary";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = { title: "로그인 · Luv3" };

const LoginPage = () => (
  <main className="mx-auto flex min-h-dvh w-full max-w-[430px] flex-col px-6 pb-[max(44px,env(safe-area-inset-bottom))]">
    <section className="flex flex-1 flex-col items-center justify-center py-12">
      <h1 className="sr-only">Luv3</h1>
      <HeartLogo className="w-[120px] text-cream" />
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
  </main>
);

export default LoginPage;
