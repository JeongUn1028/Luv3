import { TODO_ACTION_FAILED_MESSAGE } from "./actions";

/**
 * 마지막 저장이 끝난 뒤 서버 목록을 다시 받기 전에 기다리는 시간. 그 사이에 또 누르면 함께 묶는다.
 * 저장은 빨리 끝나 0.3초 간격으로 눌러도 겹치지 않으므로, 누르는 간격보다 조금 길게 둔다. 화면은 이미 바뀌어 있어 늦어도 보이지 않는다
 */
const REFRESH_SETTLE_MS = 700;

/** 목록의 체크·순서 바꾸기 저장을 차례로 하는 묶음 */
export interface TodoSaveBatch {
  /**
   * 저장을 차례에 넣는다. 저장이 끝나면 `onSaved`에 결과(실패 문구 또는 undefined)를 바로 넘기고,
   * 돌려준 약속은 묶음이 끝났을 때 서버 목록을 다시 받아야 하는지를 알려 준다(마지막 저장만 true일 수 있다)
   */
  run: (save: () => Promise<string | undefined>, onSaved: (failure: string | undefined) => void) => Promise<boolean>;
}

interface TodoSaveBatchOptions {
  /** 기다리기(테스트용) */
  wait?: (ms: number) => Promise<void>;
}

const waitFor = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

/**
 * 목록의 체크·순서 바꾸기 저장을 누른 순서대로 하나씩 하고, 연달아 누르면 서버 목록은 마지막 저장 뒤 한 번만 다시 받게 한다(#347).
 * 한 칸 바꾸기는 그때 서버의 이웃과 자리를 바꾸므로 앞 저장보다 먼저 닿으면 화면과 다른 순서가 된다. 그래서 앞 저장이 끝난 뒤 보낸다.
 * 묶음의 저장이 모두 실패(`TODO_ACTION_FAILED_MESSAGE`)했으면 다시 받지 않는다. 세션이 끊겼을 때 다시 받으면 로그인 화면으로 넘어가 다시 로그인 창이 소용없어진다(#102).
 *
 * @example
 * const shouldRefresh = await batch.run(() => saveAction(action), (failure) => setNotice(failure));
 * if (shouldRefresh) router.refresh();
 */
export const createTodoSaveBatch = ({ wait = waitFor }: TodoSaveBatchOptions = {}): TodoSaveBatch => {
  let queue: Promise<unknown> = Promise.resolve();
  let waitingCount = 0;
  let hasSaved = false;

  const finishOne = (): boolean => {
    waitingCount -= 1;
    const isLast = waitingCount === 0;
    const shouldRefresh = isLast && hasSaved;
    if (isLast) hasSaved = false;
    return shouldRefresh;
  };

  return {
    run: async (save, onSaved) => {
      waitingCount += 1;
      const result = queue.then(save);
      // 앞 저장이 예외로 끝나도 다음 저장은 이어서 한다
      queue = result.catch(() => undefined);
      try {
        const failure = await result;
        if (failure !== TODO_ACTION_FAILED_MESSAGE) hasSaved = true;
        onSaved(failure);
        await wait(REFRESH_SETTLE_MS);
      } catch (error) {
        finishOne();
        throw error;
      }
      return finishOne();
    },
  };
};
