"use client";

import { useState, type SubmitEvent } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { getSafeNextPath } from "@/lib/auth/paths";
import { getLoginErrorMessage, getSignInErrorMessage } from "./messages";

const labelClassName = "text-[13px] text-ink-sub";
const inputClassName =
  "mt-2 h-[51px] w-full rounded-[10px] border border-line bg-surface px-4 text-[15px] text-ink placeholder:text-ink-placeholder focus:border-accent focus:outline-none";

/**
 * 로그인 화면의 쿼리(next, error)가 바뀌면 폼을 새로 마운트해 입력값과 안내 문구를 초기화한다.
 * 허용목록 밖 계정이 /login?error=not_member로 돌아올 때 이전 입력이 남지 않게 하기 위해서다.
 */
export const LoginForm = () => {
  const searchParams = useSearchParams();
  return (
    <PasswordLoginForm
      key={searchParams.toString()}
      nextPath={getSafeNextPath(searchParams.get("next"))}
      initialMessage={getLoginErrorMessage(searchParams.get("error"))}
    />
  );
};

interface PasswordLoginFormProps {
  nextPath: string;
  initialMessage: string | undefined;
}

const PasswordLoginForm = ({ nextPath, initialMessage }: PasswordLoginFormProps) => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isPending, setIsPending] = useState(false);
  const [message, setMessage] = useState(initialMessage);

  const handleSubmit = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsPending(true);
    setMessage(undefined);

    // 비밀번호는 앞뒤 공백도 그대로 보낸다(공백이 들어간 비밀번호를 바꾸지 않기 위해)
    const { error } = await createClient().auth.signInWithPassword({ email: email.trim(), password });

    if (error) {
      setIsPending(false);
      setPassword("");
      setMessage(getSignInErrorMessage(error));
      return;
    }
    // 전체 페이지 이동으로 브라우저 클라이언트의 메모리 세션을 버린다. SPA 이동으로 두면 허용목록 밖 계정을
    // 서버가 로그아웃시킨 뒤에도 브라우저 클라이언트가 쿠키를 다시 써 넣어 로그인 화면과 홈 사이를 오간다.
    window.location.assign(nextPath);
  };

  return (
    <div className="flex flex-col">
      <form onSubmit={handleSubmit} className="flex flex-col">
        <label htmlFor="email" className={labelClassName}>
          이메일
        </label>
        <input
          id="email"
          type="email"
          autoComplete="username"
          placeholder="name@example.com"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className={inputClassName}
        />
        <label htmlFor="password" className={`${labelClassName} mt-4`}>
          비밀번호
        </label>
        <input
          id="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className={inputClassName}
        />
        <button
          type="submit"
          disabled={isPending}
          className="mt-4 h-[52px] w-full rounded-[10px] bg-accent text-[15px] font-bold text-background disabled:opacity-50"
        >
          {isPending ? "확인 중…" : "로그인"}
        </button>
      </form>
      {message && (
        <p role="alert" className="mt-3 text-[13px] text-accent">
          {message}
        </p>
      )}
      <p className="mt-[18px] text-center text-[12px] text-ink-sub">허용된 두 계정만 들어올 수 있어요</p>
    </div>
  );
};
