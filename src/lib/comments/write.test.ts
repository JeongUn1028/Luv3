import { describe, expect, it, vi } from "vitest";
import { addComment, type CommentInsertTable } from "./write";

const COMMENT = { id: "10000000-0000-4000-8000-000000000001", recordId: "20000000-0000-4000-8000-000000000002", content: "좋았다" };

const createFakeComments = (error: { code?: string } | null = null) => {
  const insert = vi.fn<CommentInsertTable["insert"]>(async () => ({ error }));
  const comments: CommentInsertTable = { insert };
  return { comments, insert };
};

describe("addComment", () => {
  it("화면에 먼저 붙인 댓글과 같은 id로 그 기록에 저장한다", async () => {
    // Arrange
    const { comments, insert } = createFakeComments();

    // Act
    const outcome = await addComment({ comment: COMMENT, comments });

    // Assert
    expect(insert).toHaveBeenCalledWith({ id: COMMENT.id, date_id: COMMENT.recordId, content: COMMENT.content });
    expect(outcome).toBe("saved");
  });

  it("같은 id가 이미 있으면(응답만 끊겨 다시 남김) 저장된 것으로 본다", async () => {
    const { comments } = createFakeComments({ code: "23505" });

    expect(await addComment({ comment: COMMENT, comments })).toBe("saved");
  });

  it("기록이 지워져 외래 키에 걸리면 기록이 없다고 알린다", async () => {
    const { comments } = createFakeComments({ code: "23503" });

    expect(await addComment({ comment: COMMENT, comments })).toBe("gone");
  });

  it("그 밖의 오류면 실패로 본다", async () => {
    const { comments } = createFakeComments({ code: "42501" });

    expect(await addComment({ comment: COMMENT, comments })).toBe("failed");
  });
});
