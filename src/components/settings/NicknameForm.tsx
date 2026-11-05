"use client";

import { useState, type ReactElement, type SubmitEvent } from "react";
import { PageShell } from "@/components/PageShell";
import { ScreenHeader } from "@/components/ScreenHeader";
import { NICKNAME_DB_MAX_CHARS, NICKNAME_MAX_LENGTH, validateNickname } from "@/lib/auth/nickname";
import { SETTINGS_PATH } from "@/lib/auth/paths";
import { countGraphemes } from "@/lib/form";
import { useLeavableSave, type FailedSave } from "@/lib/navigation/use-leavable-save";
import { createClient } from "@/lib/supabase/client";

const FORM_KEY = "nickname";
const SAVE_FAILED_MESSAGE = "저장하지 못했어요. 잠시 후 다시 시도해 주세요.";

const failedSaves = new Map<string, FailedSave<string>>();

/** 자기 닉네임을 저장한다. 저장에 실패하면 false를 돌려준다 */
const saveNickname = async (memberId: string, nickname: string): Promise<boolean> => {
  // 권한이 없거나 행이 없으면 오류 없이 0행이 바뀌므로, 바뀐 행을 받아 확인한다
  const { data, error } = await createClient().from("members").update({ nickname }).eq("id", memberId).select("id");
  return !error && data.length > 0;
};

interface NicknameFormProps {
  memberId: string;
  /** 처음 채울 지금 닉네임. 6자를 넘는 예전 닉네임도 잘라 내지 않고 그대로 보여 준다 */
  initialNickname: string;
}

/**
 * 자기 닉네임을 바꾸는 폼. 저장하면 설정으로 돌아가고, 다른 화면도 새 닉네임으로 다시 불러온다.
 *
 * @example <NicknameForm memberId={member.id} initialNickname={member.nickname} />
 */
export const NicknameForm = ({ memberId, initialNickname }: NicknameFormProps): ReactElement => {
  const { failedSave, beginSave, finishSaved, finishFailed } = useLeavableSave({ formKey: FORM_KEY, subject: "닉네임을", failedSaves });
  const [nickname, setNickname] = useState(failedSave?.draft ?? initialNickname);
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState(failedSave?.message);
  const [isSaving, setIsSaving] = useState(false);

  const handleSubmit = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSaving) return;

    const nextError = validateNickname(nickname);
    setError(nextError);
    if (nextError) return;

    beginSave();
    setNotice(undefined);
    setIsSaving(true);
    const savedNickname = nickname.trim();
    const isSaved = await saveNickname(memberId, savedNickname);
    if (!isSaved) {
      setNotice(SAVE_FAILED_MESSAGE);
      setIsSaving(false);
      finishFailed({ draft: nickname, message: SAVE_FAILED_MESSAGE });
      return;
    }
    finishSaved({
      href: SETTINGS_PATH,
      reset: () => {
        // 숨겨진 이 폼을 다시 열었을 때 예전 닉네임이 보이면 그대로 저장해 되돌릴 수 있으므로 저장한 값으로 맞춘다
        setNickname(savedNickname);
        setIsSaving(false);
      },
    });
  };

  return (
    <PageShell bottomSpace="sm" className="px-4" header={<ScreenHeader back={{ href: SETTINGS_PATH }} title="닉네임 변경" />}>
      <form onSubmit={handleSubmit} noValidate className="mt-3 flex flex-col gap-4">
        <div className="flex flex-col">
          <div className="flex items-baseline justify-between">
            <label htmlFor="nickname" className="text-[13px] text-ink-sub">
              닉네임
            </label>
            <span id="nickname-count" className="font-display text-[12px] tracking-[1px] text-ink-sub">
              {countGraphemes(nickname.trim())}/{NICKNAME_MAX_LENGTH}
            </span>
          </div>
          <input
            id="nickname"
            value={nickname}
            // 6자로 막으면 한글 조합 중에 글자가 잘리고 예전 긴 닉네임도 잘리므로, 길이 안내는 저장할 때 한다. 붙여넣기만 막는다
            maxLength={NICKNAME_DB_MAX_CHARS * 2}
            autoComplete="nickname"
            enterKeyHint="done"
            disabled={isSaving}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? "nickname-count nickname-error" : "nickname-count"}
            onChange={(event) => {
              setNickname(event.target.value);
              setError(undefined);
              setNotice(undefined);
            }}
            className="mt-2 h-[51px] w-full rounded-[10px] border border-line bg-surface px-4 text-ink placeholder:text-ink-placeholder focus:border-accent focus:outline-none aria-[invalid=true]:border-accent"
          />
          {error && (
            <p id="nickname-error" className="mt-2 text-[12px] text-accent">
              {error}
            </p>
          )}
        </div>

        <div className="flex flex-col">
          {notice && (
            <p role="alert" className="mb-3 text-[13px] text-accent">
              {notice}
            </p>
          )}
          <button
            type="submit"
            disabled={isSaving}
            className="h-[52px] w-full rounded-[10px] bg-accent text-[15px] font-bold text-background disabled:opacity-50"
          >
            {isSaving ? "저장 중…" : "저장"}
          </button>
        </div>
      </form>
    </PageShell>
  );
};
