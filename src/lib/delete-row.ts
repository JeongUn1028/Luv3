/** id로 행을 지울 수 있는 표. Supabase의 `createClient().from("todos")`가 이 모양이다. 테스트는 같은 모양의 가짜를 넘긴다 */
export interface DeletableTable {
  delete: () => { eq: (column: "id", value: string) => PromiseLike<{ error: { message: string } | null }> };
}

interface DeleteRowByIdParams {
  table: DeletableTable;
  id: string;
  /** 오류 문구에 넣을 대상("댓글을", "하고 싶은 것을") */
  subject: string;
}

/**
 * id로 행 하나를 지운다. 이미 지워졌으면 0행이 지워지고 오류가 없어 지운 것으로 본다.
 *
 * @throws {Error} 지우지 못했을 때. 원인은 `cause`에 담는다
 * @example await deleteRowById({ table: supabase.from("comments"), id: commentId, subject: "댓글을" })
 */
export const deleteRowById = async ({ table, id, subject }: DeleteRowByIdParams): Promise<void> => {
  const { error } = await table.delete().eq("id", id);
  if (error) throw new Error(`${subject} 지우지 못했습니다: ${error.message}`, { cause: error });
};
