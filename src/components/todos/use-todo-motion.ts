"use client";

import { useEffect, useRef, useState } from "react";
import { toCheckboxId } from "@/components/todos/TodoItem";
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

const without = <Key, Value>(map: ReadonlyMap<Key, Value>, key: Key): ReadonlyMap<Key, Value> => {
  if (!map.has(key)) return map;
  const next = new Map(map);
  next.delete(key);
  return next;
};

/** 줄긋기 상태 */
export interface StrikingTodos {
  /** 줄긋기 중인 항목과 단계. 이 항목은 완료로 저장했어도 하지 않은 목록의 제자리에 그린다 */
  strikePhases: ReadonlyMap<string, StrikePhase>;
  /** 방금 완료 칸으로 옮긴 항목. 나타나는 움직임을 준다 */
  arrivingIds: ReadonlySet<string>;
  /** 완료를 누르면 부른다. "동작 줄이기"면 아무것도 하지 않아 바로 옮긴다. 줄긋기를 시작했으면 true */
  startStrike: (id: string) => boolean;
  /** 줄긋기 중에 완료를 풀었을 때 부른다 */
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

  const clearTimers = (id: string) => {
    timersRef.current.get(id)?.forEach(clearTimeout);
    timersRef.current.delete(id);
  };

  const finishArriving = (id: string) =>
    setArrivingIds((ids) => {
      const next = new Set(ids);
      next.delete(id);
      return next;
    });

  const startStrike = (id: string): boolean => {
    if (isMotionReduced()) return false;
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
        finishArriving(id);
      }, STRIKE_HOLD_MS + STRIKE_LEAVE_MS + ARRIVE_MS),
    ]);
    return true;
  };

  const cancelStrike = (id: string) => {
    clearTimers(id);
    setStrikePhases((phases) => without(phases, id));
    finishArriving(id);
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
 *
 * @example const justAddedId = useJustAddedTodo(pendingTodos);
 */
export const useJustAddedTodo = (pendingTodos: readonly PendingTodo[]): { justAddedId: string | undefined; clearJustAdded: () => void } => {
  const [revealedIds, setRevealedIds] = useState<ReadonlySet<string>>(new Set());
  const [justAddedId, setJustAddedId] = useState<string>();
  // 새 항목이 처음 보인 그 그림에서 표시를 정한다. 효과에서 정하면 표시 없이 한 번 더 그린다
  const added = pendingTodos.find(({ id, isNew }) => isNew && !revealedIds.has(id));
  if (added) {
    setRevealedIds(new Set(revealedIds).add(added.id));
    setJustAddedId(added.id);
  }

  useEffect(() => {
    if (!justAddedId) return;
    // 그려진 뒤에 옮긴다. 같은 그림의 효과 순서와 상관없이 스크롤 영역의 자리 맞추기가 먼저 끝난다
    const frame = requestAnimationFrame(() => {
      document
        .getElementById(toCheckboxId(justAddedId))
        ?.closest("li")
        ?.scrollIntoView({ block: "nearest", behavior: isMotionReduced() ? "auto" : "smooth" });
    });
    const timer = setTimeout(() => setJustAddedId(undefined), JUST_ADDED_MS);
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(timer);
    };
  }, [justAddedId]);

  return { justAddedId, clearJustAdded: () => setJustAddedId(undefined) };
};
