"use client";

import { useState, type ReactElement, type SubmitEvent } from "react";
import { ConfirmDeleteButton } from "@/components/ConfirmDeleteButton";
import { FormFooter } from "@/components/FormFooter";
import { TextField } from "@/components/FormField";
import { DELETING_KEYS } from "@/lib/deleting";
import { PageShell } from "@/components/PageShell";
import { ReloadLatestButton } from "@/components/ReloadLatestButton";
import { ScreenHeader } from "@/components/ScreenHeader";
import { showInvalidFields } from "@/lib/focus-invalid-field";
import { clearError, isResolvedFieldNotice } from "@/lib/form";
import { forgetScrollPosition } from "@/lib/navigation/scroll-memory";
import { useLeavableSave, type FailedSave } from "@/lib/navigation/use-leavable-save";
import { requestPartnerPush } from "@/lib/push/request-partner-push";
import { toFailedSaveFields } from "@/lib/revision";
import { deleteRowById } from "@/lib/delete-row";
import { createClient } from "@/lib/supabase/client";
import { TODO_CONTENT_MAX_LENGTH, validateTodoContent } from "@/lib/todos/form";
import { TODOS_PATH } from "@/lib/todos/list";
import { pendingTodoStore } from "@/lib/todos/pending";
import { saveTodo } from "@/lib/todos/save";
import { SaveButton } from "@/components/SaveButton";

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

/** 칸 이름 → 화면에 보여 줄 에러 문구 */
type TodoFormErrors = Partial<Record<"content", string>>;

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
  const formKey = `todo:${todoId ?? "new"}`;
  const { failedSave, beginSave, finishSaved, finishFailed } = useLeavableSave({ formKey, subject: "하고 싶은 것을", failedSaves });
  const [content, setContent] = useState(failedSave?.draft.content ?? initialContent);
  const [newTodoId, setNewTodoId] = useState(failedSave?.draft.newTodoId);
  const [expectedRevisions, setExpectedRevisions] = useState(failedSave?.draft.expectedRevisions ?? (initialRevision ? [initialRevision] : []));
  const [hasConflict, setHasConflict] = useState(failedSave?.draft.hasConflict ?? false);
  // 쓴 내용이 있는지 견줄 처음 내용. 상대가 고쳐 화면을 새로 받아도 폼은 처음 내용 그대로라 이 값과 견준다
  const [baseContent, setBaseContent] = useState(initialContent);
  const [errors, setErrors] = useState<TodoFormErrors>({});
  const [notice, setNotice] = useState(failedSave?.message);
  // 칸 오류를 고치면 저장을 다시 누르기 전이라도 안내를 지운다. 효과로 지우면 한 번 더 그려지므로 그리는 중에 맞춘다
  if (isResolvedFieldNotice(notice, errors)) setNotice(undefined);
  const [isSaving, setIsSaving] = useState(false);
  // 저장하는 동안은 나가도 저장을 이어 가고 결과를 알리므로 묻지 않는다(#104)
  const shouldConfirmLeave = content !== baseContent && !isSaving;

  const handleSubmit = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSaving) return;

    const contentError = validateTodoContent(content);
    if (showInvalidFields({ form: event.currentTarget, errors: contentError ? { content: contentError } : {}, setErrors, setNotice })) return;

    setNotice(undefined);
    setIsSaving(true);
    const saveId = newTodoId ?? crypto.randomUUID();
    const pendingId = todoId ?? saveId;
    const savedContent = content.trim();
    // 시도마다 새 판 번호를 쓴다. 내용이 바뀌면 판 번호도 바뀌어야 열어 둔 상대의 화면이 알아챈다
    const revision = crypto.randomUUID();
    // 저장을 기다리지 않고 목록으로 돌아가, 서버 목록이 따라잡을 때까지 목록이 이 내용을 먼저 보여 준다(#345)
    pendingTodoStore.add({ id: pendingId, content: savedContent, revision, previousRevisions: todoId ? expectedRevisions : [], isNew: !todoId });
    // 인터넷이 끊겨 폼에 남으면 목록에 먼저 보여 줄 일이 없다(저장은 실패한다)
    if (!beginSave({ returnTo: TODOS_PATH })) pendingTodoStore.discard(pendingId, revision);
    // 새 항목은 목록이 그 줄로 스크롤해 보여 준다(#347). 기억한 자리로 되돌리기가 그 스크롤을 덮지 않게 지운다
    else if (!todoId) forgetScrollPosition("todos");
    const failure = await saveTodo({ todos: createClient().from("todos"), content: savedContent, todoId, newTodoId: saveId, expectedRevisions, revision });
    if (failure) {
      pendingTodoStore.discard(pendingId, revision);
      const failedDraft: TodoDraft = {
        content,
        // 앞선 시도가 저장됐을 수 있으므로 다시 저장할 때 같은 id를 쓴다
        newTodoId: todoId ? undefined : saveId,
        ...toFailedSaveFields({ failure, expectedRevisions, revision }),
      };
      setNewTodoId(failedDraft.newTodoId);
      setExpectedRevisions(failedDraft.expectedRevisions);
      setHasConflict(failedDraft.hasConflict);
      setNotice(failure.message);
      setIsSaving(false);
      finishFailed({ draft: failedDraft, ...failure });
      return;
    }
    // 새로 추가한 할 일만 알린다. 고치기는 알리지 않는다(#376). 응답만 끊겨 다시 저장한 경우도 저장된 것이라 알리고,
    // 이미 알렸으면 서버가 다시 보내지 않는다
    if (!todoId) requestPartnerPush({ kind: "todo", id: saveId });
    pendingTodoStore.markSaved(pendingId, revision);
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
    await deleteRowById({ table: createClient().from("todos"), id: todoId, subject: "하고 싶은 것을" });
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
                returnTo={TODOS_PATH}
                canGoBackTo={(url) => url.pathname === TODOS_PATH}
                deletingKey={DELETING_KEYS.todo(todoId)}
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
          error={errors.content}
          onChange={(value) => {
            setContent(value);
            setErrors((current) => clearError(current, "content"));
          }}
        />

        <FormFooter notice={notice}>
          {hasConflict ? <ReloadLatestButton /> : <SaveButton isDisabled={isSaving}>{isSaving ? "저장 중…" : "저장"}</SaveButton>}
        </FormFooter>
      </form>
    </PageShell>
  );
};
