import type { Metadata } from "next";
import type { ReactElement } from "react";
import { ChevronDownIcon } from "@/components/icons";
import { PageShell } from "@/components/PageShell";
import { ScreenHeader } from "@/components/ScreenHeader";
import { toLicenseParagraphs } from "@/lib/app-info/license-text";
import { OPEN_SOURCE_LICENSES, type OpenSourceLicense } from "@/lib/app-info/licenses";
import { SETTINGS_ABOUT_PATH } from "@/lib/auth/paths";

export const metadata: Metadata = { title: "오픈소스 라이선스 · Luv3" };

/** 줄에 보이는 저작권 문구. 저작권 줄이 없으면 만든 사람 이름을 대신 쓴다 */
const toCaption = ({ version, copyright, author }: OpenSourceLicense): string => {
  const holder = copyright[0] ?? author;
  return holder ? `${version} · ${holder}` : version;
};

const LicenseItem = ({ item }: { item: OpenSourceLicense }): ReactElement => (
  // 꾸러미마다 눌러 저작권 문구와 라이선스 전문을 펼친다(#436 시안 ④)
  <details className="group rounded-[10px] bg-surface">
    <summary className="press-wide flex cursor-pointer list-none items-center gap-2 rounded-[10px] py-3 pr-3 pl-4 [&::-webkit-details-marker]:hidden">
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex items-baseline justify-between gap-2">
          <span className="min-w-0 text-[15px] break-all text-ink">{item.name}</span>
          <span className="shrink-0 text-[12px] text-label">{item.license}</span>
        </span>
        <span className="text-[12px] leading-[1.5] break-words text-ink-sub tabular-nums">{toCaption(item)}</span>
      </span>
      <ChevronDownIcon className="size-[18px] shrink-0 text-ink-sub transition-transform group-open:rotate-180 motion-reduce:transition-none" />
    </summary>
    <div className="px-4 pb-4">
      {item.text ? (
        <div className="flex flex-col gap-2 text-[12px] leading-[1.6] break-words text-ink-sub">
          {/* 바뀌지 않는 정적 글이고 같은 문단이 두 번 나올 수 있어 순서를 key로 쓴다 */}
          {toLicenseParagraphs(item.text).map((paragraph, index) => (
            <p key={index}>{paragraph}</p>
          ))}
        </div>
      ) : (
        <p className="text-[12px] leading-[1.6] text-ink-sub">꾸러미에 라이선스 파일이 없어요. package.json에 적힌 {item.license} 라이선스를 따라요.</p>
      )}
    </div>
  </details>
);

const LicensesPage = (): ReactElement => (
  <PageShell bottomSpace="sm" className="px-4" header={<ScreenHeader back={{ href: SETTINGS_ABOUT_PATH }} title="오픈소스 라이선스" />}>
    <p className="mt-6 text-[12px] leading-[1.6] text-ink-sub">앱에 들어가는 오픈소스예요. 누르면 저작권 문구와 라이선스 전문을 볼 수 있어요.</p>
    <ul className="mt-4 flex flex-col gap-2">
      {OPEN_SOURCE_LICENSES.map((item) => (
        <li key={item.name}>
          <LicenseItem item={item} />
        </li>
      ))}
    </ul>
  </PageShell>
);

export default LicensesPage;
