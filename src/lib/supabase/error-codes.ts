/**
 * DB 함수(`raise ... using errcode = '...'`)나 제약이 내고 PostgREST가 `error.code`로 전하는 오류 코드.
 * P04xx는 이 앱이 정한 코드라, 마이그레이션에서 바꾸면 여기도 함께 바꾼다(`error-codes.test.ts`는 오타만 막는다).
 *
 * @example if (error.code === DB_ERROR_CODE.conflict) throw new DateRecordConflictError({ cause: error })
 */
export const DB_ERROR_CODE = {
  /** 없는 행(허용목록 밖이라 보이지 않는 행 포함). Postgres의 no_data_found */
  notFound: "P0002",
  /** 화면을 연 뒤 그 행이 바뀌어 저장을 거부했다(판 번호가 다름) */
  conflict: "P0409",
  /** 그 일정의 그날에 이미 이어진 기록이 있다. `details`에 그 기록 id가 온다 */
  eventLinkTaken: "P0410",
  /** 기록이 이미 다른 일정과 이어져 있다 */
  recordLinkedElsewhere: "P0411",
  /** 하고 싶은 것에 이미 다른 일정이 이어져 있다(`schedule_todo`, #471). `details`에 그 일정 id가 온다 */
  todoScheduled: "P0412",
  /** 넘긴 값으로는 할 수 없다(예: 한 사람 일정과 잇기). Postgres의 invalid_parameter_value */
  invalidParameter: "22023",
  /** 같은 키가 이미 있다. Postgres의 unique_violation */
  duplicateKey: "23505",
  /** 가리키는 행이 없다(예: 지워진 기록에 댓글). Postgres의 foreign_key_violation */
  foreignKeyViolation: "23503",
} as const;
