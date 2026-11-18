/** 일정을 불러오지 못했을 때의 문구. 캘린더가 넘긴 달을 받지 못했을 때도 쓴다(#348) */
export const EVENT_LOAD_ERROR_MESSAGE = "일정을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.";

/** 일정을 불러오지 못했을 때 */
export class EventLoadError extends Error {
  constructor(options?: ErrorOptions) {
    super(EVENT_LOAD_ERROR_MESSAGE, options);
    this.name = "EventLoadError";
  }
}
