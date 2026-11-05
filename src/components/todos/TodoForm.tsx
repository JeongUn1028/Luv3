"use client";

import { useRouter } from "next/navigation";
import { startTransition, useState, type ReactElement, type SubmitEvent } from "react";
import { AuthorHeart } from "@/components/AuthorHeart";
import { ConfirmDeleteButton } from "@/components/ConfirmDeleteButton";
import { PageShell } from "@/components/PageShell";
import { ScreenHeader } from "@/components/ScreenHeader";
import { BACK_TRANSITION } from "@/lib/navigation/transition";
import { useLeavableSave, type FailedSave } from "@/lib/navigation/use-leavable-save";
import { createClient } from "@/lib/supabase/client";
import { TODO_CONTENT_MAX_LENGTH, validateTodoContent } from "@/lib/todos/form";
import { TODOS_PATH } from "@/lib/todos/list";

const SAVE_FAILED_MESSAGE = "저장하지 못했어요. 잠시 후 다시 시도해 주세요.";
const GONE_MESSAGE = "이 항목은 이미 지워졌어요. 목록에서 다시 확인해 주세요.";

const failedSaves = new Map<string, FailedSave<string>>();

interface TodoFormProps {
  /** 처음 채울 내용. 새 항목이면 빈 문자열 */
  initialContent: string;
  /** 고칠 항목의 id. 없으면 새 항목을 목록 맨 아래에 추가한다 */
  todoId?: string;
  /** 고칠 항목의 작성자 닉네임. 있으면 제목 옆에 작성자 하트를 그린다 */
  authorNickname?: string;
}

/** 하고 싶은 것을 저장한다. 실패하면 화면에 보여 줄 문구를, 성공하면 undefined를 돌려준다 */
const saveTodo = async (content: string, todoId: string | undefined): Promise<string | undefined> => {
  const todos = createClient().from("todos");
  if (!todoId) {
    const { error } = await todos.insert({ content });
    return error ? SAVE_FAILED_MESSAGE : undefined;
  }
  // 고치는 사이 상대가 지운 항목은 오류 없이 0행이 바뀌므로, 바뀐 행을 받아 확인한다
  const { data, error } = await todos.update({ content }).eq("id", todoId).select("id");
  if (error) return SAVE_FAILED_MESSAGE;
  return data.length === 0 ? GONE_MESSAGE : undefined;
};

/** 하고 싶은 것 추가·고치기 폼. 고칠 때는 머리글에서 지울 수도 있다 */
export const TodoForm = ({ initialContent, todoId, authorNickname }: TodoFormProps): ReactElement => {
  const router = useRouter();
  const formKey = `todo:${todoId ?? "new"}`;
  const { failedSave, beginSave, finishSaved, finishFailed } = useLeavableSave({ formKey, subject: "하고 싶은 것을", failedSaves });
  const [content, setContent] = useState(failedSave?.draft ?? initialContent);
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState(failedSave?.message);
  const [isSaving, setIsSaving] = useState(false);

  const goToList = () => {
    startTransition(() => {
      router.replace(TODOS_PATH, { transitionTypes: BACK_TRANSITION });
      router.refresh();
    });
  };

  const handleSubmit = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSaving) return;

    const nextError = validateTodoContent(content);
    setError(nextError);
    if (nextError) return;

    beginSave();
    setNotice(undefined);
    setIsSaving(true);
    const failure = await saveTodo(content.trim(), todoId);
    if (failure) {
      setNotice(failure);
      setIsSaving(false);
      finishFailed({ draft: content, message: failure, isGone: failure === GONE_MESSAGE });
      return;
    }
    finishSaved({
      href: TODOS_PATH,
      reset: () => {
        setContent(initialContent);
        setIsSaving(false);
      },
    });
  };

  const handleDelete = async () => {
    if (!todoId) return;
    const { error: deleteError } = await createClient().from("todos").delete().eq("id", todoId);
    if (deleteError) throw new Error(`하고 싶은 것을 지우지 못했습니다: ${deleteError.message}`, { cause: deleteError });
    goToList();
  };

  return (
    <PageShell
      bottomSpace="sm"
      className="px-4"
      header={
        <ScreenHeader
          back={{ href: TODOS_PATH, label: "목록으로" }}
          title={todoId ? "하고 싶은 것 고치기" : "하고 싶은 것 추가"}
          titleAddon={authorNickname && <AuthorHeart nickname={authorNickname} className="ml-2" />}
          actions={
            todoId && (
              <ConfirmDeleteButton
                title="이 항목을 지울까요?"
                description={`"${initialContent}" 항목이 두 사람 목록에서 모두 지워져요.`}
                onConfirm={handleDelete}
                failureMessage="지우지 못했어요. 잠시 후 다시 시도해 주세요."
              />
            )
          }
        />
      }
    >
      <form onSubmit={handleSubmit} noValidate className="mt-6 flex flex-col gap-6">
        <div className="flex flex-col">
          <label htmlFor="todo-content" className="text-[13px] text-ink-sub">
            하고 싶은 것
          </label>
          <input
            id="todo-content"
            value={content}
            placeholder="둘이 함께 하고 싶은 것"
            maxLength={TODO_CONTENT_MAX_LENGTH * 2}
            enterKeyHint="done"
            disabled={isSaving}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? "todo-content-error" : undefined}
            onChange={(event) => {
              setContent(event.target.value);
              setError(undefined);
            }}
            className="mt-2 h-[51px] w-full rounded-[10px] border border-line bg-surface px-4 text-ink placeholder:text-ink-placeholder focus:border-accent focus:outline-none aria-[invalid=true]:border-accent"
          />
          {error && (
            <p id="todo-content-error" className="mt-2 text-[12px] text-accent">
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
