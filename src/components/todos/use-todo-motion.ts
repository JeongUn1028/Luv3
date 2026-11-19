"use client";

import { useEffect, useRef, useState } from "react";
import { toCheckboxId } from "@/components/todos/TodoItem";
import { takeTodoFocus } from "@/lib/todos/focus";
import type { PendingTodo } from "@/lib/todos/pending";

/** 완료 줄긋기 단계: 그 자리에서 선을 긋고 머무는 중 → 사라지는 중 */
export type StrikePhase = "drawing" | "leaving";

/** 선 긋기(0.3초) + 머묾(0.4초). 시안 https://claude.ai/artifact/7MEgeUqV1jzPG23Mf2udqF 2-A */
const STRIKE_HOLD_MS = 700;
/** 사라지는 움직임(`todo-leave`)과 완료 칸에 나타나는 움직임(`todo-arrive`)의 길이 */
const STRIKE_LEAVE_MS = 250;
const ARRIVE_MS = 250;
/** 새 항목 표시(`todo-just-added`)의 길이 */
const JUST_ADDED_MS = 1800;

const isMotionReduced = (): boolean => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const without = <Value>(map: ReadonlyMap<string, Value>, key: string): ReadonlyMap<string, Value> => {
  if (!map.has(key)) return map;
  const next = new Map(map);
  next.delete(key);
  return next;
};

const withoutId = (ids: ReadonlySet<string>, id: string): ReadonlySet<string> => {
  if (!ids.has(id)) return ids;
  const next = new Set(ids);
  next.delete(id);
  return next;
};

/** 가장 가까운 세로 스크롤 영역(화면 틀의 ScrollArea) */
const findScrollParent = (element: HTMLElement): HTMLElement | undefined => {
  for (let parent = element.parentElement; parent; parent = parent.parentElement) {
    if (/(auto|scroll)/.test(getComputedStyle(parent).overflowY)) return parent;
  }
  return undefined;
};

/** 그 줄이 스크롤 영역 안에 다 보이게 그 영역만 옮긴다. `scrollIntoView`는 문서까지 옮겨 아이폰 홈 화면 앱의 고정된 틀이 밀릴 수 있다(#51) */
const revealInScrollParent = (row: HTMLElement): void => {
  const scroller = findScrollParent(row);
  if (!scroller) return;
  const rowRect = row.getBoundingClientRect();
  const scrollerRect = scroller.getBoundingClientRect();
  const offset = rowRect.top < scrollerRect.top ? rowRect.top - scrollerRect.top : Math.max(0, rowRect.bottom - scrollerRect.bottom);
  if (offset !== 0) scroller.scrollTo({ top: scroller.scrollTop + offset, behavior: isMotionReduced() ? "auto" : "smooth" });
};

// 이미 표시한 새 항목. 목록을 다시 만들어도 같은 항목을 또 표시하지 않게 컴포넌트 밖에 둔다
const revealedTodoIds = new Set<string>();

/** 줄긋기 상태 */
export interface StrikingTodos {
  /** 줄긋기 중인 항목과 단계. 이 항목은 완료로 저장했어도 하지 않은 목록의 제자리에 그린다 */
  strikePhases: ReadonlyMap<string, StrikePhase>;
  /** 방금 완료 칸으로 옮긴 항목. 나타나는 움직임을 준다 */
  arrivingIds: ReadonlySet<string>;
  /** 완료를 누르면 부른다. "동작 줄이기"면 아무것도 하지 않아 바로 옮긴다 */
  startStrike: (id: string) => void;
  /** 줄긋기 중에 완료를 풀었거나 저장하지 못했을 때 부른다 */
  cancelStrike: (id: string) => void;
  /** 화면을 떠날 때 부른다. 돌아왔을 때 줄긋기에 멈춰 있지 않게 한다 */
  resetStrikes: () => void;
}

/**
 * 완료를 누르면 바로 완료 칸으로 옮기지 않고, 그 자리에서 줄을 긋고 잠깐 머문 뒤 옮긴다(#347). 저장은 누를 때 바로 한다.
 *
 * @example const { strikePhases, startStrike } = useStrikingTodos();
 */
export const useStrikingTodos = (): StrikingTodos => {
  const [strikePhases, setStrikePhases] = useState<ReadonlyMap<string, StrikePhase>>(new Map());
  const [arrivingIds, setArrivingIds] = useState<ReadonlySet<string>>(new Set());
  const timersRef = useRef(new Map<string, ReturnType<typeof setTimeout>[]>());

  // 목록이 사라지면 남은 줄긋기 타이머를 멈춘다
  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      for (const ids of timers.values()) ids.forEach(clearTimeout);
      timers.clear();
    };
  }, []);

  const clearTimers = (id: string) => {
    timersRef.current.get(id)?.forEach(clearTimeout);
    timersRef.current.delete(id);
  };

  const startStrike = (id: string) => {
    if (isMotionReduced()) return;
    clearTimers(id);
    setStrikePhases((phases) => new Map(phases).set(id, "drawing"));
    timersRef.current.set(id, [
      setTimeout(() => setStrikePhases((phases) => new Map(phases).set(id, "leaving")), STRIKE_HOLD_MS),
      setTimeout(() => {
        setStrikePhases((phases) => without(phases, id));
        setArrivingIds((ids) => new Set(ids).add(id));
      }, STRIKE_HOLD_MS + STRIKE_LEAVE_MS),
      setTimeout(() => {
        timersRef.current.delete(id);
        setArrivingIds((ids) => withoutId(ids, id));
      }, STRIKE_HOLD_MS + STRIKE_LEAVE_MS + ARRIVE_MS),
    ]);
  };

  const cancelStrike = (id: string) => {
    clearTimers(id);
    setStrikePhases((phases) => without(phases, id));
    setArrivingIds((ids) => withoutId(ids, id));
  };

  const resetStrikes = () => {
    for (const id of timersRef.current.keys()) clearTimers(id);
    setStrikePhases(new Map());
    setArrivingIds(new Set());
  };

  return { strikePhases, arrivingIds, startStrike, cancelStrike, resetStrikes };
};

/**
 * 폼에서 막 저장한 새 항목의 id. 목록에 처음 보이면 그 줄이 보이게 스크롤하고 잠깐 표시한다(#347).
 * 새 항목은 저장을 기다리지 않고 목록으로 돌아올 때 저장 중인 항목(#345)으로 먼저 보이므로, 그때를 "막 더함"으로 본다.
 * 폼은 목록의 기억한 스크롤 자리를 지우고 돌아온다(`TodoForm`). 기억한 자리로 되돌리기가 이 스크롤을 덮지 않게 한다.
 * 캘린더 일정 읽기 창에서 이어진 하고 싶은 것을 눌러 왔을 때(#471, `requestTodoFocus`)도 그 줄을 같은 방법으로 보여 준다.
 *
 * @example const { justAddedId } = useJustAddedTodo(pendingTodos);
 */
export const useJustAddedTodo = (pendingTodos: readonly PendingTodo[]): { justAddedId: string | undefined; clearJustAdded: () => void } => {
  const [justAddedId, setJustAddedId] = useState<string>();
  // 새 항목이 처음 보인 그 그림에서 표시를 정한다. 효과에서 정하면 표시 없이 한 번 더 그린다
  const added = pendingTodos.find(({ id, isNew }) => isNew && !revealedTodoIds.has(id));
  if (added) {
    revealedTodoIds.add(added.id);
    setJustAddedId(added.id);
  }
  useEffect(() => {
    // 다른 화면이 남긴 줄은 바깥 값이라 그린 뒤에 꺼낸다. 다녀온 목록은 숨겨 둔 채 남아 있다가 다시 보일 때 효과가 다시 돈다.
    // 다음 그림에서 꺼내, 효과가 곧바로 정리되면(개발 모드의 두 번 실행) 꺼내지 않고 다음 실행이 꺼낸다
    const frame = requestAnimationFrame(() => {
      const todoId = takeTodoFocus();
      if (todoId) setJustAddedId(todoId);
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (!justAddedId) return;
    // 그려진 뒤에 옮긴다. 같은 그림의 효과 순서와 상관없이 스크롤 영역의 자리 맞추기가 먼저 끝난다
    const frame = requestAnimationFrame(() => {
      const row = document.getElementById(toCheckboxId(justAddedId))?.closest("li");
      if (row) revealInScrollParent(row);
    });
    const timer = setTimeout(() => setJustAddedId(undefined), JUST_ADDED_MS);
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(timer);
    };
  }, [justAddedId]);

  return { justAddedId, clearJustAdded: () => setJustAddedId(undefined) };
};
