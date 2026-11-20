import type { Metadata } from "next";
import type { ReactElement } from "react";
import { EventForm } from "@/components/events/EventForm";
import { FormSkeleton } from "@/components/FormSkeleton";
import { LoadErrorScreen } from "@/components/LoadErrorScreen";
import { LoadingSuspense } from "@/components/LoadingSuspense";
import { StatusLink, StatusScreen } from "@/components/StatusScreen";
import { toKstDate } from "@/lib/anniversary";
import { withCurrentMember } from "@/lib/auth/with-member";
import { CALENDAR_PATH } from "@/lib/calendar/month";
import { createEmptyEventDraft } from "@/lib/events/form";
import { isIsoDate } from "@/lib/form";
import { catchLoadError } from "@/lib/load";
import { TODOS_PATH } from "@/lib/todos/list";
import { getLinkableTodosByIds, getTodo, loadLinkableTodos, TodoLoadError } from "@/lib/todos/queries";
import { parsePickedTodoIds, pickLinkableTodos, PICKED_TODOS_PARAM, toMissingPicksNotice, toTodoEditHref } from "@/lib/todos/schedule";

export const metadata: Metadata = { title: "일정 추가 · Luv3" };

/** 하고 싶은 것의 "일정 잡기"로 연 새 일정 폼(#471). 제목은 하고 싶은 것 내용, 구분은 "함께"로 채운다 */
const ScheduleTodoForm = async ({ todoId }: { todoId: string }): Promise<ReactElement> => {
  // 허용목록 확인과 함께 시작하고, 허용목록 밖 계정은 로그아웃 처리 경로로 보낸다
  const [{ nickname }, todo] = await withCurrentMember(() => catchLoadError(() => getTodo(todoId), TodoLoadError));

  if (todo instanceof TodoLoadError) {
    return <LoadErrorScreen title="하고 싶은 것을 불러오지 못했어요" backHref={TODOS_PATH} backLabel="목록으로" />;
  }

  if (!todo) {
    return (
      <StatusScreen title="하고 싶은 것을 찾을 수 없어요" description="지워졌거나 주소가 잘못됐어요.">
        <StatusLink href={TODOS_PATH}>목록으로</StatusLink>
      </StatusScreen>
    );
  }

  // 하나에 일정 하나만 잇는다. 낡은 고치기 화면에서 눌렀거나 그사이 상대가 잡은 경우다
  if (todo.event) {
    return (
      <StatusScreen title="이미 일정이 잡혀 있어요" description="하고 싶은 것 하나에는 일정 하나만 이어요.">
        <StatusLink href={toTodoEditHref(todo.id)}>하고 싶은 것으로</StatusLink>
      </StatusScreen>
    );
  }

  // cacheComponents는 다녀온 화면의 상태를 보존해, 다시 열면 예전 입력값이 남는다. 요청마다 새 key로 새 폼을 만든다
  return (
    <EventForm
      key={crypto.randomUUID()}
      initialDraft={{ ...createEmptyEventDraft(toKstDate(new Date())), title: todo.content, isTogether: true }}
      ownerNickname={nickname}
      todo={{ id: todo.id, content: todo.content }}
    />
  );
};

/**
 * 하고 싶은 것 목록에서 여러 개를 골라 연 새 일정 폼(#495). 고른 것을 미리 잇고, 제목은 첫 번째 내용, 구분은 "함께"로 채운다.
 * 이은 것은 폼에서 끊거나 하나 더 이을 수 있어 고르는 창의 하고 싶은 것도 함께 읽는다. 그사이 이을 수 없게 된 것은 빼고 알린다.
 */
const PickedTodosForm = async ({ todoIds }: { todoIds: string[] }): Promise<ReactElement> => {
  // 고른 것은 꼭 있어야 해 못 읽으면 오류 화면을 보이고, 고르는 창의 목록은 못 읽어도 빈 목록으로 칸만 줄인다
  const [{ nickname }, [linkedTodos, linkableTodos]] = await withCurrentMember(() =>
    Promise.all([catchLoadError(() => getLinkableTodosByIds(todoIds), TodoLoadError), loadLinkableTodos()]),
  );

  if (linkedTodos instanceof TodoLoadError) {
    return <LoadErrorScreen title="하고 싶은 것을 불러오지 못했어요" backHref={TODOS_PATH} backLabel="목록으로" />;
  }

  const { picked, missingCount } = pickLinkableTodos(linkedTodos, todoIds);
  const [first] = picked;
  if (!first) {
    return (
      <StatusScreen title="고른 것을 이을 수 없어요" description="그사이 일정이 잡혔거나 완료·삭제됐어요. 목록에서 다시 골라 주세요.">
        <StatusLink href={TODOS_PATH}>목록으로</StatusLink>
      </StatusScreen>
    );
  }

  // cacheComponents는 다녀온 화면의 상태를 보존해, 다시 열면 예전 입력값이 남는다. 요청마다 새 key로 새 폼을 만든다
  return (
    <EventForm
      key={crypto.randomUUID()}
      initialDraft={{ ...createEmptyEventDraft(toKstDate(new Date())), title: first.content, isTogether: true, linkedTodos: picked }}
      ownerNickname={nickname}
      linkableTodos={linkableTodos}
      returnsToTodos
      initialNotice={missingCount > 0 ? toMissingPicksNotice(missingCount) : undefined}
    />
  );
};

const NewEventForm = async ({ searchParams }: Pick<PageProps<"/events/new">, "searchParams">) => {
  const { date, todo, [PICKED_TODOS_PARAM]: pick } = await searchParams;
  // 오늘 날짜는 세션을 읽은 뒤에 계산한다. 그 전에 시각을 읽으면 미리 그리기에서 오류가 난다(cacheComponents)
  if (typeof todo === "string") return <ScheduleTodoForm todoId={todo} />;
  // 고른 것이 모두 형식이 틀리면 고른 것 없이 연 폼과 같게 보여 준다
  const pickedTodoIds = parsePickedTodoIds(pick);
  if (pickedTodoIds.length > 0) return <PickedTodosForm todoIds={pickedTodoIds} />;

  // 허용목록 밖 계정은 여기서 로그아웃 처리 경로로 보낸다. 고르는 창의 하고 싶은 것(#472)도 함께 읽는다
  const [{ nickname }, linkableTodos] = await withCurrentMember(loadLinkableTodos);
  // 캘린더에서 고른 날을 기본값으로, 없거나 틀리면 오늘(한국 날짜)
  const initialDate = typeof date === "string" && isIsoDate(date) ? date : toKstDate(new Date());

  // cacheComponents는 다녀온 화면의 상태를 보존해, 다시 열면 예전 입력값이 남는다. 요청마다 새 key로 새 폼을 만든다
  return <EventForm key={crypto.randomUUID()} initialDraft={createEmptyEventDraft(initialDate)} ownerNickname={nickname} linkableTodos={linkableTodos} />;
};

const NewEventPage = ({ searchParams }: PageProps<"/events/new">) => (
  // 세션·주소 쿼리는 요청 때만 알 수 있어 Suspense 안에서 읽는다(cacheComponents)
  <LoadingSuspense fallback={<FormSkeleton back={{ href: CALENDAR_PATH }} title="일정 추가" fieldCount={5} />}>
    <NewEventForm searchParams={searchParams} />
  </LoadingSuspense>
);

export default NewEventPage;
