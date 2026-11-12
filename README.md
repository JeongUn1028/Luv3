# Luv3

둘이서만 보는 비공개 데이트 앨범 모바일 웹.

- 데이트 하나 = 앨범 한 장. 날짜, 장소, 사진 여러 장과 모음(장소)마다 한마디, 그날의 정리 글을 남기고 시간순으로 넘겨본다.
- 로그인한 두 사람 외에는 페이지도 사진도 볼 수 없다.

기획은 [`docs/plan.md`](docs/plan.md)를 참고한다.

## 스택

Next.js 16 (App Router, Cache Components) · TypeScript · Tailwind CSS 4 · Supabase (Auth, Postgres, Storage) · 카카오맵(선택) · Vitest · pgTAP · Playwright

## 로컬 개발

필요한 것: Node 22.18 이상의 22 버전(`package.json`의 `engines`와 `.nvmrc`에 고정, Vercel과 CI도 22를 쓴다), pnpm, Docker Desktop(로컬 Supabase용)

```bash
pnpm install
pnpm db:start          # 로컬 Supabase 실행, 마이그레이션 자동 적용
cp .env.example .env.local
# .env.local에 db:start 출력의 Publishable key를 넣는다
pnpm dev               # http://localhost:3000
```

- 로컬 대시보드(Studio): http://127.0.0.1:54323
- 회원가입이 막혀 있으므로 테스트 계정은 Studio의 Authentication > Users > Add user > Create new user에서 이메일과 비밀번호(12자 이상)로 만든 뒤, SQL Editor에서 허용목록에 넣는다.

  ```sql
  insert into public.members (id, email, nickname)
  select id, email, '닉네임' from auth.users where email = 'me@example.com';
  ```

- dev 서버 주소는 `localhost:3000`으로 연다. Next dev 서버가 리다이렉트 주소를 localhost로 바꾸므로, `127.0.0.1:3000`으로 열면 세션 쿠키가 다른 호스트에 남는다.

## 검사

```bash
pnpm lint
pnpm knip       # 안 쓰는 파일·export·의존성 (knip.json)
pnpm type-check
pnpm test       # Vitest 단위 테스트
pnpm test:coverage  # 단위 테스트 + 커버리지. src/lib가 줄 75%·분기 80% 아래면 실패 (CI는 이 명령)
pnpm db:types   # 마이그레이션을 바꾸면 DB 타입 파일을 다시 만들어 함께 커밋 (CI가 차이를 검사)
pnpm test:db    # pgTAP RLS 테스트 (로컬 Supabase 실행 중이어야 함)
pnpm test:e2e   # Playwright E2E 테스트 (로컬 Supabase 실행 중이어야 하고, 설치된 Chrome을 쓴다)
```

E2E는 대상 기기 두 크기(아이폰 15 Pro, 아이폰 17)에서 앱을 빌드해 3100번 포트로 띄우고 화면 높이와 주요 흐름(기록·일정·날짜 창·찾기·지도·저장 실패·세션 끊김·뒤로 가기 등)을 확인한다. `.env.local`과 상관없이 로컬 Supabase만 쓰고, 전용 계정(`e2e-member@example.com`)과 데이터를 만들었다가 끝나면 지운다. 커플 사진이 비어 있으면 실행하는 동안만 넣었다가 비운다.

두 기기는 폭 9px, 높이 22px, 위 safe-area 3px만 달라서 평소(로컬·PR)에는 크기와 배치를 재는 스펙(`e2e/support/devices.ts`의 `DEVICE_SIZE_SPECS`)만 두 기기에서 돌리고, 나머지는 더 좁은 아이폰 15 Pro에서만 돌린다. main에 머지되면 CI가 두 기기 전체를 돌려 놓친 차이를 잡는다. 로컬에서 전체를 돌리려면 `E2E_ALL_DEVICES=1 pnpm test:e2e`. 기기의 `safeArea`를 읽는 스펙을 새로 만들면 이 목록에 넣는다(빠지면 단위 테스트가 실패한다).

커플 사진처럼 두 사람이 하나를 함께 쓰는 데이터를 실제로 바꾸는 스펙은 `SHARED_DATA_SPECS`(`e2e/support/devices.ts`)에 넣는다. 이 스펙은 기기 프로젝트에서 빠지고, 다른 테스트가 모두 끝난 뒤 `shared-data` 프로젝트(Playwright teardown)에서 두 기기 크기를 차례로 돈다. 나란히 돌면 커플 사진 주소를 읽는 다른 스펙이 가끔 깨지기 때문이다(#258). 스펙 하나만 돌려도 맨 끝에 함께 돌고(약 5초), CI는 대마다 한 번씩 돈다. 빼고 돌리려면 `--no-deps`, 이것만 돌리려면 `pnpm test:e2e --project=shared-data`. 테스트가 시작할 때 커플 사진을 E2E 사진으로 바꿨다가, 끝나면 테스트가 올린 파일을 지우고 로컬에 원래 있던 사진 경로로 되돌린다(원래 사진 파일은 건드리지 않는다). `switchToE2eCouplePhoto`를 쓰는 스펙이 목록에 없으면 단위 테스트가 실패한다.

오류 화면(`error.tsx`)은 화면을 옮길 때 받는 화면 내용(RSC)을 반쯤에서 끊어 띄운다(`e2e/status-screens.spec.ts`). 서버가 Supabase를 부르다 나는 오류는 서버 안의 요청이라 page.route로 만들 수 없고, 빈 응답·상태 500은 Next가 문서를 새로 받아 오류 화면이 나오지 않는다.

테스트가 만드는 기록·일정·하고 싶은 것의 이름은 `createTestName`(`e2e/support/names.ts`)으로 만들어 끝에 무작위 조각을 붙인다. 다시 돌리거나 실행이 겹쳐도 남은 데이터와 이름이 부딪치지 않고, 이름으로 찾아 지우는 정리가 그 테스트가 만든 것만 지운다. 스펙에서 기기 이름(`testInfo.project.name`)을 직접 붙여 이름을 만들면 단위 테스트가 실패한다.

로컬 Supabase는 워크트리가 달라도 하나이고 E2E는 시작할 때 전용 계정을 지우므로, 포트를 바꿔도 두 실행을 동시에 돌리면 서로 깨진다. 그래서 앱 서버 명령(`e2e/web-server.mts`)이 빌드하기 전에 3101번 포트를 실행 잠금으로 잡고, 앱 서버가 끝날 때까지 쥐고 있는다. 다른 워크트리에서 실행이 돌고 있으면 그 실행의 폴더를 알려 주며 바로 멈춘다(앞 실행의 앱이 이미 3100번에 떠 있으면 Playwright가 "already used"로 먼저 멈춘다). 포트가 잠금이라 실행을 강제로 꺼도 운영체제가 풀어 남는 것이 없다.

로컬 작업자는 Playwright 기본값(코어의 절반)에 4개 상한을 둔다. 24코어 PC에서 기본값대로 12개로 돌리면 Chrome 창이 죽거나(`Target crashed`, `ERR_INSUFFICIENT_RESOURCES`) 시간 초과로 실행마다 다른 테스트가 실패했고, 4개는 네 번 모두 실패 없이 12개와 거의 같은 시간(약 4분)에 끝났다. 2개는 1~2분 더 걸렸다(#243). 한 번에 더 적게 돌리려면 `pnpm test:e2e --workers=2`.

PR과 main push마다 GitHub Actions(`.github/workflows/ci.yml`)가 같은 검사와 `pnpm build`를 실행한다. PR에는 운영 DB 반영 체크를 보는 검사(`.github/workflows/db-apply.yml`)도 함께 돈다.

CI의 E2E는 스펙 파일 단위로 3대에 나눠 동시에 돈다(`test:e2e (1/3)`~`(3/3)`, Playwright `--shard`). 대마다 로컬 Supabase를 따로 띄우므로 서로의 데이터를 건드리지 않는다. 대마다 작업자는 2개로 고정했다(러너 기본값과 같다. 4개는 테스트 시간이 대마다 0.2~0.9분, 전체로 약 30초 줄었을 뿐이라 부하 위험을 지지 않음, #241). CI에서는 실패한 테스트를 한 번 더 돌리고(`retries: 1`, 로컬은 다시 돌리지 않음), 다시 돌아 통과하면 로그에 `flaky`로 남는다. 실행 기록(trace)은 실패한 첫 시도의 것을 남긴다. 잡마다 `timeout-minutes`가 있고(E2E를 나눈 잡은 15분), CI의 Playwright는 그보다 먼저 10분(`globalTimeout`)에 스스로 끝나 멈춘 대도 실패 보고서를 남긴다. 나눈 잡이 끝나면 `test:e2e` 잡이 결과를 모아, 셋 모두 통과해야 통과로 끝난다. 나눈 잡이 실패하거나 취소돼도 이 잡은 건너뛰지 않고 실패로 끝난다(건너뛴 잡은 필수 검사에서 통과로 쳐지기 때문이다). 실패한 대의 보고서는 실행 화면의 Artifacts에 `playwright-report-<대 번호>-of-3`으로 올라간다. 로컬에서 한 대 몫만 돌려 보려면 `pnpm test:e2e --shard=1/3`. 대 수를 바꾸면 `ci.yml`의 `shardIndex`·`shardTotal`을 함께 고친다(`e2e/support/ci-workflow.test.ts`가 둘이 어긋나면 실패한다).

main은 이 검사들을 통과해야 머지할 수 있다(GitHub 브랜치 보호의 필수 상태 검사: `lint · type-check · test · build`, `test:db (pgTAP RLS)`, `test:e2e`, `운영 DB 반영 확인`). `test:e2e`는 나눈 잡의 결과를 모으는 잡의 이름이다. 필수 검사는 잡 이름으로 등록하므로, 잡 이름을 바꾸면 보호 설정도 같이 고쳐야 PR이 "기다리는 중"에 멈추지 않는다. 그때 이미 열려 있던 PR은 main을 받아 push해야 새 이름으로 다시 검사된다. 긴급 수정은 관리자만 `gh pr merge --admin`으로 검사를 건너뛸 수 있다.

스키마를 바꾸면 `supabase/migrations/`에 새 파일을 추가하고 `pnpm db:reset && pnpm db:types`로 타입을 다시 만든다.

## 운영 Supabase 설정

마이그레이션 외에 대시보드에서 직접 맞춰야 하는 값이다.

1. 마이그레이션 적용: `pnpm exec supabase link --project-ref <ref>` 후 `pnpm exec supabase db push`
2. Authentication > Sign In / Providers: "Allow new users to sign up" 끄기, Email 공급자는 켜 두고 Minimum password length를 12로
3. Authentication > URL Configuration: Site URL을 배포 주소로
4. 비밀번호 변경 때 서버가 현재 비밀번호를 확인하게 한다(#170): Authentication의 Email 설정에서 현재 비밀번호 요구(Management API 이름 `security_update_password_require_current_password`)를 켜고, Secure password change(`secure_password_change`)는 끈 채로 둔다.
   - 현재 비밀번호 요구를 켜면 접속 토큰을 빼앗긴 경우에도 현재 비밀번호 없이는 비밀번호를 바꿀 수 없다. 앱은 바꿀 때 현재 비밀번호를 함께 보내므로 켜도 그대로 동작한다. 켠 뒤 설정 > 비밀번호 변경을 한 번 해 본다.
   - Secure password change는 로그인한 지 24시간이 넘은 세션에 메일 확인 코드를 요구하는 설정이다. 이 앱은 메일을 보내지 않고, 바꾸기 직전에 다시 로그인해 새 세션을 쓰므로 켜도 보호가 늘지 않는다.
   - 로컬 CLI(2.122)의 `config.toml`에는 현재 비밀번호 요구 칸이 없어 로컬에서는 꺼져 있다. 그래서 앱은 설정과 상관없이 바꾸기 전에 현재 비밀번호로 로그인해 확인한다(`src/components/settings/PasswordForm.tsx`).
5. Authentication > Users > Add user > Create new user에서 두 계정을 이메일·비밀번호(12자 이상)로 만들고("Auto Confirm User" 체크), SQL Editor에서 `members`에 추가(위 SQL)
6. Vercel 환경 변수: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `CRON_SECRET`(무작위 32자 이상, `.env.example`의 명령으로 만든다)
   - `NEXT_PUBLIC_SUPABASE_URL`과 `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`는 빌드할 때 값이 들어가므로 값을 넣거나 바꾼 뒤에는 재배포해야 적용된다.
   - `CRON_SECRET`은 `vercel.json`의 Cron이 하루 한 번(`0 3 * * *`, Hobby 플랜이라 UTC 3시대의 어느 때, 한국 시간 낮 12시대) `/api/keepalive`를 부를 때 쓴다. 무료 플랜이 7일 동안 요청이 없어 일시정지되지 않게 한다. 값을 넣거나 바꾼 뒤에는 재배포해야 적용된다.
   - `SUPABASE_SECRET_KEY`는 월 1회 주인 없는 사진 정리(`/api/photo-cleanup`)에만 쓰는 비밀 키다. 없으면 정리만 실패하고 앱은 그대로 동작한다. 아래 "주인 없는 사진 정리"를 따른다.
   - `PHOTO_CLEANUP_DELETE`(선택)를 `true`로 두면 정리가 실제로 파일을 지운다. 없으면 지울 목록만 돌려준다.
   - `NEXT_PUBLIC_KAKAO_MAP_KEY`(선택)는 기록 지도에 쓰는 JavaScript 키다. 없으면 오류 없이 지도 버튼만 나오지 않는다. 브라우저에 보이는 값이므로 카카오 콘솔의 SDK 도메인에 운영 주소를 등록해 제한한다. 빌드할 때 값이 들어가므로 값을 넣거나 바꾼 뒤에는 재배포해야 적용된다.
   - `HOLIDAY_API_KEY`(선택)는 캘린더·날짜 창의 공휴일 색과 이름에 쓴다. 공공데이터포털 "한국천문연구원_특일 정보"의 일반 인증키이고 Encoding·Decoding 어느 쪽을 넣어도 된다. 서버에서만 쓰며 브라우저로 보내지 않는다. 없거나 공공데이터포털이 실패하면 오류 없이 주말 색만 나오고 원인은 서버 로그에 남는다. 받은 공휴일은 하루 동안 저장해 두므로 임시공휴일은 하루 안에 반영된다. 값을 넣거나 바꾼 뒤에는 재배포해야 적용된다.

로그인 메일을 쓰지 않으므로 SMTP 설정은 필요 없다.

### 보안 헤더

모든 응답에 콘텐츠 보안 정책(CSP)과 기본 보안 헤더를 붙인다(`src/lib/security/headers.ts`, `next.config.ts`, #170). 스크립트·사진·요청은 앱 자신, Supabase(`NEXT_PUBLIC_SUPABASE_URL`), 카카오 지도(`dapi.kakao.com`, `*.kakaocdn.net`)에서만 받고, 다른 사이트 안에 넣는 것을 막는다. 미리 그려 둔 화면을 지키려고 요청마다 바뀌는 값(nonce)은 쓰지 않고 인라인 스크립트는 허용한다. 아이폰 사진(HEIC)을 바꾸는 heic2any가 `blob:` Worker 안에서 `new Function`을 쓰므로 `blob:` Worker와 eval도 허용한다.

- 외부 서비스(스크립트, 이미지, API)를 새로 쓰면 그 주소를 `headers.ts`에 더한다. 빠뜨리면 브라우저 콘솔에 "Content Security Policy" 오류가 나고 그 자원이 막힌다.
- E2E는 카카오 지도 SDK를 가짜로 대신하므로 실제 지도 파일·그림 주소(2026-11 확인: `t1.kakaocdn.net`, `mts.kakaocdn.net`)는 검사하지 못한다. 카카오가 이 주소를 바꾸면 지도가 안 나올 수 있다. 기록 지도가 "지도를 불러오지 못했어요"에 머물면 콘솔의 CSP 오류에 나온 주소를 더한다.
- Supabase 주소가 CSP에 들어가므로 빌드할 때 `NEXT_PUBLIC_SUPABASE_URL`이 있어야 한다(없으면 빌드가 실패한다). Vercel 미리 보기(Preview)만 예외다: PR 코드가 운영 데이터에 닿지 않게 Preview에는 Supabase 값을 두지 않아, 빌드만 통과하고 로그인은 되지 않는다.

### 로그인 공개 키

서버는 로그인을 확인할 때(`proxy`, `getCurrentMember` 등) 접속 토큰의 서명을 Supabase 공개 키(JWKS, ES256)로 검사한다. 공개 키를 받으러 가는 시간을 없애려고 운영 공개 키를 `src/lib/supabase/jwks.ts`의 `SUPABASE_JWKS`에 코드 상수로 넣어 두었다(#202). 원래는 서버가 새로 뜰 때마다, 그리고 받은 키를 10분 넘게 쓰면 다시 받으러 갔다.

- 공개 키는 비밀 값이 아니다. 환경 변수로 두어도 값을 바꾸면 재배포해야 하는 것은 같아서, 설정할 곳이 하나 줄어드는 코드 상수를 골랐다.
- 토큰의 `kid`에 맞는 키가 상수에 없으면 원래대로 Supabase에서 받아 확인한다. 그래서 로컬 Supabase(키가 다르다)와 서명 키를 바꾼 직후에도 로그인은 풀리지 않고 조금 느려질 뿐이다.
- 지금 운영 키와 같은지 확인: `curl https://<프로젝트 ref>.supabase.co/auth/v1/.well-known/jwks.json`의 `kid`·`x`·`y`가 상수와 같은지 본다.

서명 키를 바꿀 때(Supabase 대시보드 Project Settings > JWT Keys)는 아래 순서를 지킨다.

1. 새 대기 키(standby key)를 만들면 위 주소에서 받은 새 공개 키를 상수의 `keys`에 더해 배포한다. 예전 키는 아직 지우지 않는다.
2. 키를 바꾼다(rotate). 새 토큰은 새 키로, 아직 남은 토큰은 예전 키로 확인된다.
3. 예전 키로 서명한 토큰이 모두 만료된 뒤(바꾼 때부터 대시보드의 접속 토큰 유지 시간이 지난 뒤, 2026-11 기준 1시간) 예전 키를 **상수에서 먼저 지우고 배포한 다음** Supabase에서 폐기(revoke)한다. 상수에 남은 키는 Supabase에서 폐기해도 이 앱의 로그인 확인이 계속 믿기 때문이다. DB 조회는 Supabase가 따로 확인해 막지만, 화면 이동은 로그인한 것처럼 지나간다.
4. 키가 새어 급히 폐기해야 하면 3번처럼 상수에서 먼저 지우고 배포한 뒤 바로 폐기한다.

### keepalive 실패 알림

Vercel Hobby의 Cron 실행 기록과 로그는 1시간 뒤 사라지고 실패해도 알림이 없다. 그래서 GitHub Actions(`.github/workflows/keepalive.yml`)가 매일 한국 시간 밤 9시 17분에 같은 `/api/keepalive`를 따로 부른다. Vercel Cron과 시간을 떨어뜨려 두어 한쪽이 멈춰도 다른 쪽이 7일 일시정지를 막는다.

실패하면 작업이 실패하고 GitHub이 메일을 보낸다(GitHub 알림 설정의 Actions 메일이 켜져 있어야 한다). 예약 실행의 메일은 이 파일의 예약 시간을 마지막으로 고친 계정에 간다. 실행 기록에서 예약 실행을 열어 실행한 계정이 메일을 받을 계정인지 확인하고, 다르면 받을 계정으로 예약 줄을 고쳐 다시 머지한다.

- 저장소 비밀 값 `CRON_SECRET`(Settings > Secrets and variables > Actions)에 Vercel과 같은 값을 넣는다. Vercel에서 값을 바꾸면 여기도 바꾼다.
- 손으로 돌리기: Actions > keepalive 확인 > Run workflow, 또는 `gh workflow run keepalive.yml`
- 실패 문구: 401이면 두 비밀 값이 다르고, 502면 Supabase를 깨우지 못한 것이다(아래 절). 비밀 값이 없으면 그렇다고 알린다.
- 운영 주소를 바꾸면 워크플로의 `KEEPALIVE_URL`도 고친다.

### 서버 깨워 두기

오래 쉬었다 앱을 켜면 서버 인스턴스가 새로 떠 검은 화면이 3초까지 길어졌다(#202). 그래서 GitHub Actions(`.github/workflows/keep-warm.yml`)가 5분마다 `/api/keepalive`를 비밀 값 없이 부른다. `proxy`와 서버 함수만 깨우고 401을 받으므로 DB는 조회하지 않는다.

- 이 작업은 서버가 응답하지 않아도 실패로 끝내지 않는다. 5분마다 실패 메일이 오지 않게 하려는 것이고, 실패 알림은 위 "keepalive 확인"이 맡는다. 결과(상태 코드, 첫 응답 시간)는 실행 기록에서 보고, 연결이 안 되거나 401이 아니면 실행 기록에 경고가 남는다.
- 요청 이름(User-Agent)이 `luv3-keep-warm`이라 Vercel 로그에서 Vercel Cron(`vercel-cron`)의 401과 가릴 수 있다.
- GitHub 예약 실행은 몇 분씩 늦거나 빠질 수 있어 매번 깨어 있다고 보장하지는 않는다.
- 공개 리포라 Actions 사용 시간은 들지 않는다. Vercel 함수 호출은 한 번 부를 때 `proxy`와 서버 함수가 함께 돌아 한 달 약 1만 7천 번, Edge 요청은 약 9천 번 늘어난다. Hobby 한도(각각 월 100만 번)에 비해 작지만 월 1회 점검의 사용량에서 함께 본다.
- 운영 주소를 바꾸면 워크플로의 `KEEP_WARM_URL`도 고친다.

### 주인 없는 사진 정리

사진은 Storage에 먼저 올리고 기록을 나중에 저장한다. 업로드 중에 앱을 닫거나, 저장 결과를 몰라 일부러 남기면 기록이 가리키지 않는 파일이 `album` 버킷에 남는다(#31). 기록을 지우거나 고치기에서 뺀 사진은 앱이 바로 지우지 않고 휴지통(`photo_trash`, #311)에 남는다. Vercel Cron이 매달 1일(`0 4 1 * *`, UTC 4시대, 한국 시간 오후 1시대) `/api/photo-cleanup`을 불러 두 가지를 치운다.

- **휴지통**: 사진 행이 지워질 때(기록째 지움, 사진·모음 빼기) DB 트리거가 경로, 기록 날짜·제목, 지운 회원과 시각을 남긴다. 보관 기간 30일(`src/lib/photos/trash.ts`의 `TRASH_RETENTION_DAYS`)이 지난 파일과 그 행만 지우므로 실제로는 30~61일 남는다. 기간 안의 휴지통 파일은 아래 주인 없는 파일로 보지 않는다. 회원은 휴지통 표를 읽거나 고칠 수 없다(되살리기 화면은 다음 PR). 그때까지 되살리려면 `photo_trash`에서 경로를 찾아 대시보드 Storage에서 내려받는다.
- 주인 없는 파일: 기록 사진(`photos.path`·`thumb_path`)과 지금 커플 사진(`couple_photo.path`와 같은 id의 `_medium.jpg`)이 가리키지 않고, 올린 지 하루가 넘은 파일. 하루가 안 됐거나 올린 시각을 모르는 파일은 업로드 중일 수 있어 남긴다.
- 앱이 만드는 이름(`{기록 id}/{사진 id}.jpg`·`_thumb.jpg`, `couple/{id}.jpg`·`_medium.jpg`)이 아닌 파일은 건드리지 않고 응답의 `unknownPaths`로 알린다.
- 지울 파일이 100개를 넘거나 쓰는 파일보다 많으면 DB를 잘못 읽었을 수 있어 지우지 않고 409와 `status: "blocked"`, 이유(`reason`)를 돌려준다. Vercel 실행 기록에는 실패로 보인다. 미리 보기에서도 이 경우면 `reason`이 함께 온다. 이때는 휴지통 파일도 지우지 않는다.
- 지우기 직전에 DB를 한 번 더 읽어, 그사이 기록에 이어진 파일은 빼고 지운다.
- 사진 경로를 담는 칸을 새로 만들면 `FILE_PATH_COLUMNS`(`src/lib/photos/album-files.ts`, 백업도 같은 목록을 쓴다)와 `src/app/api/photo-cleanup/route.ts`의 `readPhotoFileReferences`에 더한다. 빠뜨리면 그 칸의 파일이 지워진다. `database.types.ts`에 이름에 `path`가 든 칸이 생기면 단위 테스트가 실패해 알려 준다.

처음 켤 때:

1. Supabase 대시보드 Project Settings > API Keys에서 이 용도의 비밀 키(`sb_secret_…`)를 새로 만들어 Vercel 환경 변수 `SUPABASE_SECRET_KEY`에 넣고 재배포한다. RLS를 넘어 모든 데이터를 읽고 지울 수 있는 키라 다른 곳에 쓰지 않고, 새면 대시보드에서 이 키만 폐기한다.
2. `PHOTO_CLEANUP_DELETE`를 넣지 않은 채로 지울 목록을 확인한다. 응답의 `orphanPaths`가 지울 파일이다.
   ```bash
   curl -s -H "Authorization: Bearer <CRON_SECRET>" "https://<운영 주소>/api/photo-cleanup?preview=1"
   ```
3. 목록이 맞으면 Vercel 환경 변수 `PHOTO_CLEANUP_DELETE=true`를 넣고 재배포한다. 그다음 달부터 Cron이 지운다.

- 주소에 `preview`가 있으면(값과 상관없이) `PHOTO_CLEANUP_DELETE`와 상관없이 지우지 않는다. 켠 뒤에도 Cron 전에 언제든 목록을 볼 수 있다. `preview` 없이 부르면 켜져 있을 때 바로 지운다.
- `PHOTO_CLEANUP_DELETE`는 `true`만 켠 것으로 본다(대소문자·앞뒤 공백 무시). `1`·`yes`는 꺼진 것이다.
- Hobby 플랜의 Cron 로그는 1시간 뒤 사라진다. 무엇을 지웠는지는 그 안에 Vercel 로그의 "사진 정리" 줄에서 본다.
- 정리는 백업 폴더의 파일을 지우지 않는다. 지운 사진이 백업을 받은 뒤에 남은 것이면 개인 드라이브의 `album/`에는 남아 있다.
- 응답에는 목록을 읽을 때(지우기 전) 버킷 전체의 파일 수(`fileCount`)와 크기 합계(`totalBytes`, 바이트), 지울 파일 가운데 지난 정리 예약 시각(매달 1일 UTC 4시)에 이미 하루가 넘었던 수(`staleOrphanCount`), 휴지통 파일 수·크기(`trashFileCount`·`trashBytes`, 합계에 들어 있다), 보관 기간이 지난 휴지통 행 수와 경로(`expiredTrashCount`·`expiredTrashPaths`), 그 가운데 지난 정리 예약 시각에 이미 기간이 지났던 수(`overdueTrashCount`)도 들어 있다. Storage가 크기를 주지 않은 파일은 합계에서 빼고 `unsizedCount`로 센다(#310).

### 저장 공간·사진 정리 점검

무료 플랜 저장 용량은 1GB이고 기록 사진은 한 장에 파일 2개(원본·썸네일)라 생각보다 빨리 찰 수 있다. 위 정리 Cron이 실패하거나 멈춰도 알림이 없다. 그래서 GitHub Actions(`.github/workflows/storage-check.yml`)가 매달 1일 정리 Cron 뒤(UTC 5시 23분, 한국 시간 오후 2시 23분)에 `?preview=1`을 불러, 아래 중 하나라도 있으면 실패로 끝낸다(#310). 메일은 위 "keepalive 실패 알림"과 같은 방식으로 온다.

- **사용량**: 크기 합계가 1GB의 80% 이상. 기준 값은 백업 출력과 같은 `NEAR_LIMIT_RATIO`(`scripts/backup/lib.mts`)다.
- **정리가 멈추는 상태**: 응답에 `reason`이 있다(지울 파일이 100개를 넘거나 쓰는 파일보다 많다).
- **지난 정리가 지웠어야 할 파일이 남아 있음**: `staleOrphanCount`가 0보다 크다. 1일 정리가 실패했거나(Vercel Cron Jobs 실행 기록 확인) `PHOTO_CLEANUP_DELETE`가 꺼진 것이다. 판단 기준이 점검 시각이 아니라 지난 정리 예약 시각이라, GitHub 예약이 늦거나 손으로 아무 날 돌려도 그 뒤에 생긴 파일은 실패로 보지 않고 다음 정리에 맡긴다.
- **지난 정리가 지웠어야 할 휴지통 사진이 남아 있음**: `overdueTrashCount`가 0보다 크다. 원인과 기준은 위와 같다.
- **응답 실패**: 401이면 `CRON_SECRET`이 Vercel 값과 다르고, 500이면 `SUPABASE_SECRET_KEY`가 없거나(`CLEANUP_NOT_CONFIGURED`) 함수가 실패한 것이고, 502면 파일 목록이나 DB를 읽지 못한 것이고, 504면 시간 안에 끝나지 않은 것이다. 실패 응답이 정리 결과(파일 경로가 담김)면 본문은 실행 기록에 옮기지 않는다.

이름 규칙에 없는 파일(`unknownPaths`)과 크기를 모르는 파일은 실패로 끝내지 않고 실행 기록에 경고만 남긴다. 공개 리포라 실행 기록은 누구나 볼 수 있어 파일 경로는 남기지 않고 개수만 남긴다. 목록은 위 미리 보기 명령으로 본다.

- 손으로 돌리기: Actions > 저장 공간·사진 정리 점검 > Run workflow, 또는 `gh workflow run storage-check.yml`
- 판단은 `scripts/storage-check/lib.mts`가 한다. 받아 둔 응답으로 직접 확인하려면 `node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/storage-check/check.mts <응답 파일> <HTTP 상태 코드>`
- 운영 주소를 바꾸면 워크플로의 `CLEANUP_PREVIEW_URL`도 고친다. 주소의 `?preview=1`을 빼면 정리가 실제로 지우므로 빼지 않는다.

### 프로젝트가 일시정지됐을 때

Cron이 멈춰 프로젝트가 일시정지되면 앱이 Supabase에 연결하지 못한다. Supabase 대시보드에서 프로젝트를 골라 Resume을 누르면 되살아난다([공식 문서](https://supabase.com/docs/guides/platform/free-project-pausing) 기준 일시정지 후 1년까지, 2026-11 확인). 되살린 뒤 Vercel 대시보드의 Cron Jobs 실행 기록과 `CRON_SECRET`을 확인해 멈춘 원인을 고친다. 기한이 지났으면 아래 "운영 프로젝트를 잃었을 때"를 따른다.

### DB를 바꾸는 PR

main에 머지하면 Vercel이 바로 배포하므로, 새 칸이나 함수를 쓰는 코드가 먼저 나가면 운영 화면이 깨진다. 아래 순서를 지킨다.

1. 먼저 적용해도 지금 배포된 코드가 동작하게 만든다. 예를 들어 함수에 인자를 더할 때는 맨 뒤에 기본값을 둔다.
2. 머지 전에 운영 DB에 반영한다. 실행 전에 `--dry-run`으로 적용될 파일을 확인한다.

   ```bash
   pnpm exec supabase db push --linked --dry-run
   pnpm exec supabase db push --linked
   ```

3. `pnpm exec supabase migration list --linked`로 로컬과 운영이 같은지 확인한다.
4. PR 본문에 아래 칸을 넣어 반영했다고 표시한 뒤 머지한다. 바뀐 마이그레이션 파일마다 체크된 줄이 있어야 `운영 DB 반영 확인` 검사가 통과하고, 본문을 고치면 다시 확인한다. 이 검사는 체크만 볼 뿐 운영 DB를 직접 들여다보지는 않으므로, 체크는 실제로 반영한 뒤에 한다. 이미 반영한 파일은 고쳐도 `db push`가 다시 실행하지 않고 이 검사도 잡지 못하므로, 고칠 내용은 새 파일로 추가한다.

   ```markdown
   ## 운영 반영
   - [x] 머지 전에 `pnpm exec supabase db push --linked`로 `20261106050000_date_record_revision.sql` 반영
   ```

워크트리에서 실행하면 연결 정보가 없으므로, 원본 클론의 `supabase/.temp` 내용을 워크트리의 같은 폴더로 복사한다. 이 폴더는 커밋되지 않는다.

### 비밀번호를 잊었을 때

기억하는 비밀번호를 바꿀 때는 앱의 설정 > 비밀번호 변경을 쓴다. 같은 계정의 다른 기기는 바로 끊기지 않고, 이미 받은 접속 토큰이 끝나면(최대 1시간) 다시 로그인해야 한다. 기기를 잃어버렸을 때는 이 시간 동안 그 기기에서 계속 볼 수 있다는 점을 감안한다.

비밀번호 찾기 메일은 없다. 대시보드의 "Send password recovery"도 메일을 보내는 기능이라 쓰지 않고, SQL Editor에서 직접 바꾼다.
이 방법은 최소 길이 검사를 거치지 않으므로 12자 이상인지 직접 확인하고, 실행한 뒤 SQL Editor의 쿼리 기록에서 지운다.

```sql
update auth.users
set encrypted_password = extensions.crypt('새 비밀번호', extensions.gen_salt('bf'))
where email = 'me@example.com';
```

허용목록 이메일과 키는 리포에 커밋하지 않는다.

## 백업과 복구

무료 플랜은 자동 백업을 하지 않으므로 **월 1회** 직접 받아 **개인 클라우드 드라이브**에 둔다. 마지막 백업 이후의 내용은 되살릴 수 없다.

### 백업 받기

필요한 것: Node 22.18 이상(스크립트가 TypeScript를 바로 실행한다), Docker Desktop 실행, `pnpm exec supabase login`, `supabase link`가 끝난 원본 클론. 입력하거나 저장할 키는 없다(로그인 상태로 그때그때 받아 메모리에만 둔다).

```bash
pnpm backup "<백업 폴더>"   # 예: "G:\내 드라이브\Luv3-백업"
```

이미 받은 사진은 건너뛴다. 끝나면 표마다 행 수와 저장 용량 사용량(파일 수, MB, 1GB 중 몇 %)을 출력하고, 80%를 넘으면 경고한다. 기록이 가리키는데 받지 못한 파일이 있으면 경로를 함께 경고하니, 앨범을 쓰지 않을 때 다시 받는다.

백업을 받은 날 같은 김에 아래 "월 1회 점검"도 한다.

스크립트를 시험할 때는 `pnpm backup "<시험 폴더>" --local`로 운영 대신 로컬 Supabase에서 받는다(`pnpm db:start` 필요). 운영 백업과 섞이지 않게, 다른 곳에서 받은 백업이 있는 폴더는 거부한다.

```text
<백업 폴더>/
  album/                  사진 원본·썸네일·couple/. 시점과 상관없이 계속 쌓인다
  snapshots/<시점>/
    data.sql              public 스키마와 계정(auth.users, auth.identities)
    manifest.json         표 행 수, 그 시점의 파일 목록, 백업 때의 커밋(commit)과 DB의 마지막 마이그레이션(lastMigration). 이 파일이 없으면 중간에 끊긴 백업이다
```

- `data.sql`에는 이메일과 비밀번호 해시가, `album/`에는 사진이 들어 있다. 백업은 암호화하지 않고 드라이브 계정의 보호에 기댄다(2026-11-10 결정, #170: 암호를 잃으면 백업을 못 쓰고 되살리기가 길어진다). 드라이브 계정에 2단계 인증을 켜 두고, 폴더를 공유하지 않는다.
- 앱에서 지운 사진도 `album/`에는 계속 남는다. 백업에서도 완전히 지우려면 `album/<기록 id>/`의 그 파일을 손으로 지우고, 그 파일이 들어 있던 예전 `snapshots/<시점>`도 함께 지운다(되살리기는 시점의 파일이 하나라도 없으면 멈춘다).
- **Git 리포 안에는 만들 수 없다**(공개 리포라 스크립트가 거부한다). 공개 리포의 GitHub Actions 결과물로도 올리지 않는다.
- 세션·토큰 같은 나머지 `auth` 표는 받지 않는다.
- 오래된 `snapshots/<시점>`은 지워도 되지만, `album/`은 다른 시점도 함께 쓰므로 지우지 않는다.

### 복구 연습

```bash
pnpm db:start                                         # 로컬 Supabase가 켜져 있어야 한다
pnpm backup:restore "<백업 폴더>" --yes              # 가장 최근 시점
pnpm backup:restore "<백업 폴더>" <시점 이름> --yes  # 시점을 골라서
```

**로컬 Supabase의 내용을 지우고** 되살린 뒤, 표 행 수와 파일 수를 원본과 비교한다. 운영 프로젝트에는 쓸 수 없다. 스키마가 달라 DB 되살리기가 실패하면 `manifest.json`의 `commit`(되살리기를 시작할 때도 출력한다)으로 돌아가 다시 실행한다. 이 칸을 넣기 전에 받은 시점에는 기록이 없으니 백업 시각의 커밋을 찾는다. 끝나면 `pnpm dev`로 띄워 원래 비밀번호로 로그인해 화면을 확인하고, 다 봤으면 `pnpm db:reset`으로 비운다. 운영 데이터가 로컬에 남지 않게 하기 위해서다. 로컬 확인 계정은 위 "로컬 개발"대로 다시 만든다.

### 월 1회 점검

백업을 받는 날 함께 한다. 평소에는 사용량을 볼 곳이 대시보드뿐이고, 한도를 넘으면 앱이 멈추거나 업로드가 막힌다.

1. **사용량**: 각 대시보드의 Usage 화면에서 무료 플랜 한도와 비교한다. 80%를 넘는 항목이 있으면 이슈로 남긴다.
   - Supabase(Organization > Usage): Database Size, Storage Size, Egress(내려받은 양). 사진 저장 용량은 위 "저장 공간·사진 정리 점검"이 매달 1일 따로 보고 넘으면 메일로 알린다
   - Vercel(Usage): Fast Data Transfer, Function Invocations, Image Optimization
2. **의존성**: 원본 클론의 최신 main에서 실행한다.
   ```bash
   pnpm outdated      # 새 버전 확인
   pnpm audit --prod  # 앱에 들어가는 패키지의 알려진 보안 문제
   ```
   - 패치 버전(예: 16.4.3 → 16.4.5)은 바로 PR로 올리고 E2E로 확인한다.
   - 마이너·메이저 버전은 변경 기록을 읽고 이슈로 따로 올린다. Next.js는 `node_modules/next/dist/docs/`의 안내도 본다.
3. **보안 알림**: Dependabot 알림(Security > Dependabot)은 켜 두었고 새 알림은 GitHub 메일로 온다. 심각도 High 이상은 월 점검을 기다리지 않고 바로 올린다.
4. **keepalive**: Actions의 "keepalive 확인" 기록이 매일 성공했는지, "서버 깨워 두기" 기록이 5분 간격으로 이어지는지, "저장 공간·사진 정리 점검"이 이번 달 1일에 돌았는지 본다. 공개 리포는 60일 동안 활동이 없으면 GitHub이 예약을 끈다(끄기 전에 메일이 온다). 꺼져 있으면 Actions에서 해당 작업을 골라 Enable workflow로 다시 켠다.
5. **주인 없는 사진**: 1일 점검이 실패했거나 경고(`unknownPaths`)를 남겼으면 위 "주인 없는 사진 정리"의 `?preview=1`로 지울 목록과 `unknownPaths`를 본다. `reason`이 있으면(Cron이 지우지 않고 멈춘다) 또는 `unknownPaths`에 모르는 파일이 있으면 원인을 확인한다.

### 운영 프로젝트를 잃었을 때

새 프로젝트로 옮기는 절차다. **이 절차 전체를 실제 프로젝트에 연습해 보지는 않았고**, 명령 형식만 로컬에서 확인했다.

```bash
pnpm exec supabase link --project-ref <새 ref>
pnpm exec supabase db push --linked
pnpm db:start   # 아래 psql은 로컬 Supabase 컨테이너 안의 것을 쓴다

# DB: 접속 주소는 새 프로젝트 대시보드의 Connect에서 복사한다. 셸 기록에 비밀번호가 남으니 끝나면 DB 비밀번호를 바꾼다
docker exec -i supabase_db_Luv3 psql "<접속 주소>" --single-transaction -v ON_ERROR_STOP=1 \
  -c "truncate table public.couple_photo" -f - < "<백업 폴더>/snapshots/<시점>/data.sql"

# 사진: 절대 경로는 인식하지 못하므로 백업 폴더에서 실행한다. 받는 쪽은 버킷 이름 없이 ss:/// 이다
cd "<백업 폴더>"
find album -name "*.part" -delete   # 받다 끊겨 남은 조각
node "<리포>/node_modules/supabase/dist/supabase.js" storage cp -r album ss:/// --linked --experimental --workdir "<리포>"
```

이 명령은 `album/`을 통째로 올리므로 그동안 지운 사진도 함께 올라간다. 앱에는 보이지 않고 용량만 차지하며, #31(주인 없는 파일 정리)에서 치운다.

그다음 위 "운영 Supabase 설정"의 2·3·5번을 새 프로젝트 기준으로 다시 맞추고 Vercel에서 재배포한다. 계정은 함께 되살아나므로 4번은 건너뛴다.

## 데이터 출처

사진 좌표(EXIF GPS)에 붙이는 동네 이름(행정동 "구 + 동")은 서버 경로 `/api/places/region`이 리포에 둔 행정동 경계(`data/admdong-boundaries.json`)로 계산한다(#249). 카카오 로컬 API 결과는 저장할 수 없어(약관) 쓰지 않는다. 경계 밖(해외·바다)이면 이름 없이(`{ "name": null }`) 답하고, 기록 폼은 그 사진 위치를 "찍은 곳"으로 둔다.

- 원본: [vuski/admdongkor](https://github.com/vuski/admdongkor) `ver20261001/HangJeongDong_ver20261001.geojson`(약 35MB)
- 만드는 법: `pnpm admdong:build <내려받은 GeoJSON> <판 이름>`. 고리마다 약 10m보다 작은 굴곡을 버리고 좌표를 약 1m 정수로 적어 약 3MB로 줄인다(`scripts/admdong/build.mts`). 새 판이 나오면 다시 만들고 아래 출처와 설정 화면의 판 이름을 고친다
- 줄인 경계로 찾은 동은 경계 ±200m 안 표본 2만 개에서 원본과 99.5% 안팎 같았다(나머지는 옆 동, 여러 번 재서 99.4~99.6%). 경계 바로 밖 약 50m까지는 가장 가까운 동으로 본다

출처 표기(앱 설정 화면에도 둔다):

> 본 데이터는 통계청 통계지리정보서비스(SGIS, https://sgis.kostat.go.kr)에서 공공누리 제1유형으로 개방한 행정동 경계를 가공한 것이며(가공: vuski/admdongkor, https://github.com/vuski/admdongkor), CC BY 4.0으로 배포됩니다.
