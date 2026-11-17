import type { ReactElement } from "react";
import { ChevronDownIcon } from "@/components/icons";
import { formatReleaseDate, type AppRelease, type ReleaseNote } from "@/lib/app-info/releases";

interface ReleaseHistoryProps {
  /** 받지 못했으면 `undefined` */
  releases: AppRelease[] | undefined;
  currentVersion: string;
}

const FIRST_RELEASE_VERSION = "1.0.0";

const toReleaseCaption = (version: string, isCurrent: boolean): string | undefined => {
  if (isCurrent) return "지금 버전";
  return version === FIRST_RELEASE_VERSION ? "첫 정식 버전" : undefined;
};

type ItemNote = Extract<ReleaseNote, { kind: "item" }>;
type NoteGroup = { kind: "paragraph"; text: string } | { kind: "list"; items: ItemNote[] };

/** 이어진 목록 항목을 한 목록으로 묶는다. 노트에 적은 순서(앞 문단, 목록, 뒤의 "알려진 문제" 문단)를 그대로 둔다 */
const toNoteGroups = (notes: ReleaseNote[]): NoteGroup[] =>
  notes.reduce<NoteGroup[]>((groups, note) => {
    const last = groups.at(-1);
    if (note.kind === "paragraph") return [...groups, note];
    if (last?.kind === "list") return [...groups.slice(0, -1), { kind: "list", items: [...last.items, note] }];
    return [...groups, { kind: "list", items: [note] }];
  }, []);

const ReleaseItem = ({ release, isCurrent }: { release: AppRelease; isCurrent: boolean }): ReactElement => {
  const caption = toReleaseCaption(release.version, isCurrent);
  return (
    // 버전마다 눌러 펼친다. 지금 버전만 펼쳐 둔다(#404 시안 A)
    <details open={isCurrent} className="group rounded-[10px] bg-surface">
      <summary className="press-wide flex h-[51px] cursor-pointer list-none items-center gap-2.5 rounded-[10px] pr-3 pl-4 [&::-webkit-details-marker]:hidden">
        <span
          className={`shrink-0 rounded-full border border-accent px-2.5 font-display text-[14px] leading-[22px] tabular-nums ${isCurrent ? "bg-accent text-background" : "text-accent"}`}
        >
          v{release.version}
        </span>
        <span className="min-w-0 flex-1 truncate text-[13px] text-ink-sub">
          {formatReleaseDate(release.publishedOn)}
          {caption && ` · ${caption}`}
        </span>
        <ChevronDownIcon className="size-[18px] shrink-0 text-ink-sub transition-transform group-open:rotate-180 motion-reduce:transition-none" />
      </summary>
      <div className="flex flex-col gap-2 px-4 pb-4 text-[14px] leading-[1.55] text-ink">
        {release.notes.length === 0 && <p className="text-ink-sub">적어 둔 요약이 없어요.</p>}
        {/* 노트는 바뀌지 않는 정적 목록이고 같은 글이 두 번 나올 수 있어 순서를 key로 쓴다 */}
        {toNoteGroups(release.notes).map((group, groupIndex) =>
          group.kind === "paragraph" ? (
            <p key={groupIndex} className="text-ink-sub">
              {group.text}
            </p>
          ) : (
            <ul key={groupIndex} className="flex flex-col gap-2">
              {group.items.map((item, itemIndex) => (
                <li key={itemIndex} className="ml-4 list-disc">
                  {item.label && <span className="mr-1.5 font-display text-ink">{item.label}</span>}
                  {item.text}
                </li>
              ))}
            </ul>
          ),
        )}
      </div>
    </details>
  );
};

/**
 * 앱 정보의 업데이트 기록(#434). GitHub 릴리스 노트의 요약을 최신 버전부터 보여 준다.
 * 받지 못하면 기록 자리에 안내만 두고 버전 숫자(화면 위쪽)는 그대로 보인다.
 *
 * @example <ReleaseHistory releases={await getReleases()} currentVersion={APP_VERSION} />
 */
export const ReleaseHistory = ({ releases, currentVersion }: ReleaseHistoryProps): ReactElement => {
  if (!releases) return <p className="rounded-[10px] bg-surface px-4 py-3.5 text-[13px] text-ink-sub">지금은 업데이트 기록을 불러오지 못했어요.</p>;
  if (releases.length === 0) return <p className="rounded-[10px] bg-surface px-4 py-3.5 text-[13px] text-ink-sub">아직 업데이트 기록이 없어요.</p>;
  return (
    <div className="flex flex-col gap-2">
      {releases.map((release) => (
        <ReleaseItem key={release.version} release={release} isCurrent={release.version === currentVersion} />
      ))}
    </div>
  );
};
