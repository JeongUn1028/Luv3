"use client";

import { useState, type SubmitEvent } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { getSafeNextPath } from "@/lib/auth/paths";
import { getLoginErrorMessage, isValidOtp } from "./messages";

type Step = "email" | "code";

const inputClassName =
  "h-12 w-full rounded border border-line bg-surface px-4 text-[15px] text-ink placeholder:text-ink-sub focus:border-accent focus:outline-none";
const buttonClassName =
  "h-12 w-full rounded bg-accent text-[15px] font-medium text-background disabled:opacity-50";

/**
 * 로그인 화면의 쿼리(next, error)가 바뀌면 폼을 새로 마운트해 입력 단계와 안내 문구를 초기화한다.
 * 허용목록 밖 계정이 /login?error=not_member로 돌아올 때 이전 단계 상태가 남지 않게 하기 위해서다.
 */
export const LoginForm = () => {
  const searchParams = useSearchParams();
  return (
    <LoginSteps
      key={searchParams.toString()}
      nextPath={getSafeNextPath(searchParams.get("next"))}
      initialMessage={getLoginErrorMessage(searchParams.get("error"))}
    />
  );
};

interface LoginStepsProps {
  nextPath: string;
  initialMessage: string | undefined;
}

const LoginSteps = ({ nextPath, initialMessage }: LoginStepsProps) => {
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [isPending, setIsPending] = useState(false);
  const [message, setMessage] = useState(initialMessage);

  const handleSendEmail = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsPending(true);
    setMessage(undefined);

    const { error } = await createClient().auth.signInWithOtp({
      email: email.trim(),
      options: { shouldCreateUser: false },
    });
    setIsPending(false);

    if (error?.status === 429) {
      setMessage("요청이 너무 잦습니다. 잠시 후 다시 시도해 주세요.");
      return;
    }
    // 허용되지 않은 주소인지 알려 주지 않기 위해 다른 실패도 같은 안내로 넘어간다
    setStep("code");
  };

  const handleVerifyCode = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!isValidOtp(code)) {
      setMessage("메일로 받은 6자리 숫자를 입력해 주세요.");
      return;
    }

    setIsPending(true);
    setMessage(undefined);
    const { error } = await createClient().auth.verifyOtp({
      email: email.trim(),
      token: code.trim(),
      type: "email",
    });

    if (error) {
      setIsPending(false);
      setMessage("코드가 맞지 않거나 만료됐습니다.");
      return;
    }
    // 전체 페이지 이동으로 브라우저 클라이언트의 메모리 세션을 버린다. SPA 이동으로 두면 허용목록 밖 계정을
    // 서버가 로그아웃시킨 뒤에도 브라우저 클라이언트가 쿠키를 다시 써 넣어 로그인 화면과 홈 사이를 오간다.
    window.location.assign(nextPath);
  };

  return (
    <div className="flex flex-col gap-4">
      {step === "email" ? (
        <form onSubmit={handleSendEmail} className="flex flex-col gap-3">
          <label htmlFor="email" className="text-[13px] text-ink-sub">
            이메일
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className={inputClassName}
          />
          <button type="submit" disabled={isPending} className={buttonClassName}>
            {isPending ? "보내는 중…" : "로그인 메일 받기"}
          </button>
        </form>
      ) : (
        <form onSubmit={handleVerifyCode} className="flex flex-col gap-3">
          <p className="text-[15px] leading-relaxed text-ink">
            <span className="break-all">{email}</span>로 로그인 메일을 보냈습니다.
            <br />
            <span className="text-ink-sub">메일의 버튼을 누르거나 6자리 코드를 입력하세요.</span>
          </p>
          <label htmlFor="code" className="text-[13px] text-ink-sub">
            6자리 코드
          </label>
          <input
            id="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            required
            value={code}
            onChange={(event) => setCode(event.target.value)}
            className={`${inputClassName} tracking-[0.3em]`}
          />
          <button type="submit" disabled={isPending} className={buttonClassName}>
            {isPending ? "확인 중…" : "로그인"}
          </button>
          <button
            type="button"
            onClick={() => {
              setStep("email");
              setCode("");
              setMessage(undefined);
            }}
            className="h-10 text-[13px] text-ink-sub underline underline-offset-4"
          >
            이메일 다시 입력
          </button>
        </form>
      )}
      {message && (
        <p role="alert" className="text-[13px] text-accent">
          {message}
        </p>
      )}
    </div>
  );
};
