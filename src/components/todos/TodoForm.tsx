"use client";

import { useRouter } from "next/navigation";
import { startTransition, useState, type ReactElement, type SubmitEvent } from "react";
import { ConfirmDeleteButton } from "@/components/ConfirmDeleteButton";
import { TextField } from "@/components/FormField";
import { PageShell } from "@/components/PageShell";
import { ReloadLatestButton } from "@/components/ReloadLatestButton";
import { ScreenHeader } from "@/components/ScreenHeader";
import { markAllScreensStale } from "@/lib/navigation/screen-freshness";
import { BACK_TRANSITION } from "@/lib/navigation/transition";
import { useLeavableSave, type FailedSave } from "@/lib/navigation/use-leavable-save";
import { addMaybeSavedRevision } from "@/lib/revision";
import { createClient } from "@/lib/supabase/client";
import { TODO_CONTENT_MAX_LENGTH, validateTodoContent } from "@/lib/todos/form";
import { TODOS_PATH } from "@/lib/todos/list";
import { saveTodo } from "@/lib/todos/save";

/** 저장에 실패해 보관하는 폼 내용 */
interface TodoDraft {
  content: string;
  /** 새 항목을 저장하다 실패했을 때 쓴 id. 다시 저장할 때 같은 값을 써서 항목이 둘이 되지 않는다 */
  newTodoId: string | undefined;
  /** 저장해도 되는 판 번호: 불러온 판과, 저장됐을 수 있는 내 앞선 시도의 판(#161) */
  expectedRevisions: string[];
  /** 화면을 연 뒤 상대가 내용을 고쳐 저장하지 못했는지. 그러면 저장 대신 최신 내용을 불러오게 한다 */
  hasConflict: boolean;
}

const failedSaves = new Map<string, FailedSave<TodoDraft>>();

interface TodoFormProps {
  /** 처음 채울 내용. 새 항목이면 빈 문자열 */
  initialContent: string;
  /** 고칠 항목의 id. 없으면 새 항목을 목록 맨 아래에 추가한다 */
  todoId?: string;
  /** 고칠 항목의 판 번호. 화면을 연 뒤 상대가 내용을 고쳤는지 알아본다(#161) */
  initialRevision?: string;
}

/** 하고 싶은 것 추가·고치기 폼. 고칠 때는 머리글에서 지울 수도 있다 */
export const TodoForm = ({ initialContent, todoId, initialRevision }: TodoFormProps): ReactElement => {
  const router = useRouter();
  const formKey = `todo:${todoId ?? "new"}`;
  const { failedSave, beginSave, finishSaved, finishFailed } = useLeavableSave({ formKey, subject: "하고 싶은 것을", failedSaves });
  const [content, setContent] = useState(failedSave?.draft.content ?? initialContent);
  const [newTodoId, setNewTodoId] = useState(failedSave?.draft.newTodoId);
  const [expectedRevisions, setExpectedRevisions] = useState(failedSave?.draft.expectedRevisions ?? (initialRevision ? [initialRevision] : []));
  const [hasConflict, setHasConflict] = useState(failedSave?.draft.hasConflict ?? false);
  // 쓴 내용이 있는지 견줄 처음 내용. 상대가 고쳐 화면을 새로 받아도 폼은 처음 내용 그대로라 이 값과 견준다
  const [baseContent, setBaseContent] = useState(initialContent);
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState(failedSave?.message);
  const [isSaving, setIsSaving] = useState(false);
  // 저장하는 동안은 나가도 저장을 이어 가고 결과를 알리므로 묻지 않는다(#104)
  const shouldConfirmLeave = content !== baseContent && !isSaving;

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
    const saveId = newTodoId ?? crypto.randomUUID();
    // 시도마다 새 판 번호를 쓴다. 내용이 바뀌면 판 번호도 바뀌어야 열어 둔 상대의 화면이 알아챈다
    const revision = crypto.randomUUID();
    const failure = await saveTodo({ content: content.trim(), todoId, newTodoId: saveId, expectedRevisions, revision });
    if (failure) {
      const failedDraft: TodoDraft = {
        content,
        // 앞선 시도가 저장됐을 수 있으므로 다시 저장할 때 같은 id를 쓴다
        newTodoId: todoId ? undefined : saveId,
        expectedRevisions: addMaybeSavedRevision({ expectedRevisions, revision, mayHaveSaved: failure.mayHaveSaved }),
        hasConflict: failure.hasConflict,
      };
      setNewTodoId(failedDraft.newTodoId);
      setExpectedRevisions(failedDraft.expectedRevisions);
      setHasConflict(failedDraft.hasConflict);
      // 저장됐거나 상대가 고쳤다면 숨겨 둔 목록이 예전 내용을 보여 주므로, 돌아가면 새로 불러오게 한다
      if (failure.mayHaveSaved || failure.hasConflict) markAllScreensStale();
      setNotice(failure.message);
      setIsSaving(false);
      finishFailed({ draft: failedDraft, message: failure.message, isGone: failure.isGone });
      return;
    }
    finishSaved({
      href: TODOS_PATH,
      reset: () => {
        setContent(initialContent);
        setBaseContent(initialContent);
        setNewTodoId(undefined);
        setExpectedRevisions(initialRevision ? [initialRevision] : []);
        setIsSaving(false);
      },
    });
  };

  const handleDelete = async () => {
    if (!todoId) return;
    const { error: deleteError } = await createClient().from("todos").delete().eq("id", todoId);
    if (deleteError) throw new Error(`하고 싶은 것을 지우지 못했습니다: ${deleteError.message}`, { cause: deleteError });
  };

  return (
    <PageShell
      bottomSpace="sm"
      className="px-4"
      header={
        <ScreenHeader
          back={{ href: TODOS_PATH, shouldConfirmLeave }}
          title={todoId ? "하고 싶은 것 고치기" : "하고 싶은 것 추가"}
          actions={
            todoId && (
              <ConfirmDeleteButton
                title="이 항목을 지울까요?"
                description={`"${initialContent}" 항목이 두 사람 목록에서 모두 지워져요.`}
                subject="하고 싶은 것을"
                noticeKey={`delete:${formKey}`}
                onConfirm={handleDelete}
                onDeleted={goToList}
                failureMessage="지우지 못했어요. 잠시 후 다시 시도해 주세요."
              />
            )
          }
        />
      }
    >
      <form onSubmit={handleSubmit} noValidate className="mt-3 flex flex-col gap-4">
        <TextField
          id="todo-content"
          label="하고 싶은 것"
          value={content}
          placeholder="둘이 함께 하고 싶은 것"
          maxLength={TODO_CONTENT_MAX_LENGTH * 2}
          enterKeyHint="done"
          disabled={isSaving}
          error={error}
          onChange={(value) => {
            setContent(value);
            setError(undefined);
          }}
        />

        <div className="flex flex-col">
          {notice && (
            <p role="alert" className="mb-3 text-[13px] text-accent">
              {notice}
            </p>
          )}
          {hasConflict ? (
            <ReloadLatestButton />
          ) : (
            <button
              type="submit"
              disabled={isSaving}
              className="press-wide h-[52px] w-full rounded-[10px] bg-accent font-display text-[15px] text-background disabled:opacity-50"
            >
              {isSaving ? "저장 중…" : "저장"}
            </button>
          )}
        </div>
      </form>
    </PageShell>
  );
};
