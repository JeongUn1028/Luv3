import type { Metadata } from "next";
import { Suspense } from "react";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = { title: "로그인 · Luv3" };

const LoginPage = () => (
  <main className="mx-auto flex min-h-dvh w-full max-w-[430px] flex-col justify-center gap-10 px-4">
    <h1 className="text-[18px] font-light tracking-[0.2em] text-ink">LUV3</h1>
    {/* useSearchParams는 요청마다 달라지므로 Suspense 안에서 렌더링한다 */}
    <Suspense>
      <LoginForm />
    </Suspense>
  </main>
);

export default LoginPage;
