import { saveRowAtRevision } from "@/lib/revision";
import { toSaveFailure, type SaveFailure } from "@/lib/save-outcome";
import { createClient } from "@/lib/supabase/client";

const MESSAGES = {
  failedMessage: "저장하지 못했어요. 잠시 후 다시 시도해 주세요.",
  goneMessage: "이 항목은 이미 지워졌어요. 목록에서 다시 확인해 주세요.",
  conflictMessage: "그사이 이 항목이 바뀌어 저장하지 않았어요. 최신 내용을 불러와 다시 고쳐 주세요. 지금 쓴 내용은 사라져요.",
};

interface SaveTodoParams {
  /** 저장할 내용. 앞뒤 공백은 이미 뺀 값이다 */
  content: string;
  /** 고칠 항목의 id. 없으면 새 항목을 목록 맨 아래에 추가한다 */
  todoId: string | undefined;
  /** 새 항목에 쓸 id. 다시 저장할 때 앞선 시도와 같은 값을 넘겨 항목이 둘이 되지 않게 한다 */
  newTodoId: string;
  /** 저장해도 되는 판 번호: 불러온 판과, 저장됐을 수 있는 내 앞선 시도의 판 */
  expectedRevisions: string[];
  /** 이번 저장으로 바뀔 판 번호. 시도마다 새로 만든다 */
  revision: string;
}

/**
 * 하고 싶은 것을 저장한다. 새 항목을 만들거나 내용을 고친다.
 * 응답만 끊기면 한 번 더 보낸다. 새 항목은 `newTodoId`로 만들어 다시 보내도 하나만 생긴다.
 * 화면을 연 뒤 상대가 내용을 고쳤으면(판 번호가 `expectedRevisions`에 없으면) 저장하지 않고 `hasConflict`로 알린다.
 *
 * @returns 실패하면 화면에 보여 줄 내용, 성공하면 undefined
 * @example const failure = await saveTodo({ content: "벚꽃 보기", todoId, newTodoId: crypto.randomUUID(), expectedRevisions: [revision], revision: crypto.randomUUID() })
 */
export const saveTodo = async ({ content, todoId, newTodoId, expectedRevisions, revision }: SaveTodoParams): Promise<SaveFailure | undefined> => {
  const outcome = await saveRowAtRevision({ table: createClient().from("todos"), rowId: todoId, newRowId: newTodoId, values: { content }, expectedRevisions, revision });
  return toSaveFailure(outcome, MESSAGES);
};
