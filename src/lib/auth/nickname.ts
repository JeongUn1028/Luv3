import { countChars, countGraphemes } from "@/lib/form";

/** 닉네임 변경 때 허용하는 최대 글자 수(화면에 보이는 글자 단위). 넓은 글자 6자까지 이름표가 줄지 않는다 */
export const NICKNAME_MAX_LENGTH = 6;

/** DB check 제약의 상한(`char_length`). 예전 닉네임을 위해 그대로 두며, 합친 이모지가 많으면 6자 안에서도 넘을 수 있다 */
export const NICKNAME_DB_MAX_CHARS = 20;

/** 일정 폼의 선택지와 일정 줄이 함께 일정을 부르는 이름. 닉네임이 같으면 한 사람 일정과 구별되지 않는다 */
const TOGETHER_LABEL = "함께";

/** 글자처럼 세지만 화면에 아무것도 그리지 않는 문자(한글 채움 문자, 폭 없는 공백, 점자 빈칸 등)만 있는지 본다 */
const INVISIBLE_ONLY_PATTERN = /^[\s\p{Default_Ignorable_Code_Point}\p{Cf}⠀]*$/u;

/**
 * 저장 전에 닉네임을 확인한다. 앞뒤 공백은 빼고 센다. 문제가 없으면 undefined다.
 *
 * @example validateNickname("가나다라마바사") // "닉네임은 6자까지 적을 수 있어요."
 */
export const validateNickname = (nickname: string): string | undefined => {
  const trimmed = nickname.trim();
  if (INVISIBLE_ONLY_PATTERN.test(trimmed)) return "닉네임을 적어 주세요.";
  if (trimmed === TOGETHER_LABEL) return `'${TOGETHER_LABEL}'는 일정 구분에 쓰는 말이라 닉네임으로 쓸 수 없어요.`;
  if (countGraphemes(trimmed) > NICKNAME_MAX_LENGTH) return `닉네임은 ${NICKNAME_MAX_LENGTH}자까지 적을 수 있어요.`;
  if (countChars(trimmed) > NICKNAME_DB_MAX_CHARS) return "이모지가 많아 저장할 수 없어요. 조금 줄여 주세요.";
  return undefined;
};

/** 닉네임을 고칠 수 있는 표. Supabase의 `createClient().from("members")`가 이 모양이다 */
export interface NicknameTable {
  update: (values: { nickname: string }) => { eq: (column: "id", value: string) => { select: (columns: "id") => PromiseLike<{ data: unknown[] | null; error: unknown }> } };
}

interface SaveNicknameParams {
  memberId: string;
  nickname: string;
  members: NicknameTable;
}

/**
 * 자기 닉네임을 저장한다. 권한이 없거나 행이 없으면 오류 없이 0행이 바뀌므로, 바뀐 행을 받아 확인한다.
 *
 * @returns 저장했으면 true
 * @example const isSaved = await saveNickname({ memberId, nickname, members: supabase.from("members") })
 */
export const saveNickname = async ({ memberId, nickname, members }: SaveNicknameParams): Promise<boolean> => {
  const { data, error } = await members.update({ nickname }).eq("id", memberId).select("id");
  return !error && data !== null && data.length > 0;
};
