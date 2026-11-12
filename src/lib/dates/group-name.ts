/** 받침이 있는 쪽, 없는 쪽 조사 */
type Particle = "와" | "을";

const PARTICLE_AFTER_FINAL: Record<Particle, string> = { 와: "과", 을: "을" };
const PARTICLE_WITHOUT_FINAL: Record<Particle, string> = { 와: "와", 을: "를" };

// 숫자를 소리 내어 읽은 끝 글자(영·일·이·삼·사·오·육·칠·팔·구)에 받침이 없는 끝자리. 10은 "십"이라 0과 같다
const DIGITS_WITHOUT_FINAL = new Set([2, 4, 5, 9]);

/**
 * 화면에 쓰는 모음 이름("모음 2")에 조사를 붙인다. 조사가 없으면 이름만 돌려준다.
 *
 * @example toGroupName(2, "와") // "모음 2와"
 * @example toGroupName(3, "와") // "모음 3과"
 */
export const toGroupName = (groupNumber: number, particle?: Particle): string => {
  const name = `모음 ${groupNumber}`;
  if (!particle) return name;
  const particles = DIGITS_WITHOUT_FINAL.has(groupNumber % 10) ? PARTICLE_WITHOUT_FINAL : PARTICLE_AFTER_FINAL;
  return `${name}${particles[particle]}`;
};
