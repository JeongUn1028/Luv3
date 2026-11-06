# Luv3

둘이서만 보는 비공개 데이트 앨범 모바일 웹.

- 데이트 하나 = 앨범 한 장. 날짜, 장소, 사진 여러 장과 사진마다 한마디, 그날의 정리 글을 남기고 시간순으로 넘겨본다.
- 로그인한 두 사람 외에는 페이지도 사진도 볼 수 없다.

기획은 [`docs/plan.md`](docs/plan.md)를 참고한다.

## 스택

Next.js 16 (App Router, Cache Components) · TypeScript · Tailwind CSS 4 · Supabase (Auth, Postgres, Storage) · Vitest · pgTAP

## 로컬 개발

필요한 것: Node 22, pnpm, Docker Desktop(로컬 Supabase용)

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
pnpm type-check
pnpm test       # Vitest 단위 테스트
pnpm test:db    # pgTAP RLS 테스트 (로컬 Supabase 실행 중이어야 함)
pnpm test:e2e   # 화면 높이 E2E 테스트 (로컬 Supabase 실행 중이어야 하고, 설치된 Chrome을 쓴다)
```

E2E는 대상 기기 두 크기(아이폰 15 Pro, 아이폰 17)에서 앱을 빌드해 3100번 포트로 띄우고 잰다. `.env.local`과 상관없이 로컬 Supabase만 쓰고, 전용 계정(`e2e-member@example.com`)과 데이터를 만들었다가 끝나면 지운다. 커플 사진이 비어 있으면 실행하는 동안만 넣었다가 비운다.

PR과 main push마다 GitHub Actions(`.github/workflows/ci.yml`)가 같은 검사와 `pnpm build`를 실행한다.

스키마를 바꾸면 `supabase/migrations/`에 새 파일을 추가하고 `pnpm db:reset && pnpm db:types`로 타입을 다시 만든다.

## 운영 Supabase 설정

마이그레이션 외에 대시보드에서 직접 맞춰야 하는 값이다.

1. 마이그레이션 적용: `pnpm exec supabase link --project-ref <ref>` 후 `pnpm exec supabase db push`
2. Authentication > Sign In / Providers: "Allow new users to sign up" 끄기, Email 공급자는 켜 두고 Minimum password length를 12로
3. Authentication > URL Configuration: Site URL을 배포 주소로
4. Authentication > Users > Add user > Create new user에서 두 계정을 이메일·비밀번호(12자 이상)로 만들고("Auto Confirm User" 체크), SQL Editor에서 `members`에 추가(위 SQL)
5. Vercel 환경 변수: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `CRON_SECRET`(무작위 32자 이상, `.env.example`의 명령으로 만든다)
   - `CRON_SECRET`은 `vercel.json`의 Cron이 하루 한 번(UTC 03:00) `/api/keepalive`를 부를 때 쓴다. 무료 플랜이 7일 동안 요청이 없어 일시정지되지 않게 한다. 값을 넣거나 바꾼 뒤에는 재배포해야 적용된다.
   - `KAKAO_REST_API_KEY`(선택)는 기록 폼의 장소 찾기에 쓴다. 없으면 오류 없이 돋보기만 나오지 않는다. 값을 넣거나 바꾼 뒤에는 재배포해야 적용된다.
   - `NEXT_PUBLIC_KAKAO_MAP_KEY`(선택)는 기록 지도에 쓰는 JavaScript 키다. 없으면 오류 없이 지도 버튼만 나오지 않는다. 브라우저에 보이는 값이므로 카카오 콘솔의 SDK 도메인에 운영 주소를 등록해 제한한다. 빌드할 때 값이 들어가므로 값을 넣거나 바꾼 뒤에는 재배포해야 적용된다.

로그인 메일을 쓰지 않으므로 SMTP 설정은 필요 없다.

### DB를 바꾸는 PR

main에 머지하면 Vercel이 바로 배포하므로, 새 칸이나 함수를 쓰는 코드가 먼저 나가면 운영 화면이 깨진다. 아래 순서를 지킨다.

1. 먼저 적용해도 지금 배포된 코드가 동작하게 만든다. 예를 들어 함수에 인자를 더할 때는 맨 뒤에 기본값을 둔다.
2. 머지 전에 운영 DB에 반영한다. 실행 전에 `--dry-run`으로 적용될 파일을 확인한다.

   ```bash
   pnpm exec supabase db push --linked --dry-run
   pnpm exec supabase db push --linked
   ```

3. `pnpm exec supabase migration list --linked`로 로컬과 운영이 같은지 확인한 뒤 머지한다.

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

```text
<백업 폴더>/
  album/                  사진 원본·썸네일·couple/. 시점과 상관없이 계속 쌓인다
  snapshots/<시점>/
    data.sql              public 스키마와 계정(auth.users, auth.identities)
    manifest.json         표 행 수와 그 시점의 파일 목록. 이 파일이 없으면 중간에 끊긴 백업이다
```

- `data.sql`에는 이메일과 비밀번호 해시가, `album/`에는 사진이 들어 있다. 드라이브 계정에 2단계 인증을 켜 두고, 폴더를 공유하지 않는다.
- **Git 리포 안에는 만들 수 없다**(공개 리포라 스크립트가 거부한다). 공개 리포의 GitHub Actions 결과물로도 올리지 않는다.
- 세션·토큰 같은 나머지 `auth` 표는 받지 않는다.
- 오래된 `snapshots/<시점>`은 지워도 되지만, `album/`은 다른 시점도 함께 쓰므로 지우지 않는다.

### 복구 연습

```bash
pnpm backup:restore "<백업 폴더>" --yes              # 가장 최근 시점
pnpm backup:restore "<백업 폴더>" <시점 이름> --yes  # 시점을 골라서
```

**로컬 Supabase의 내용을 지우고** 되살린 뒤, 표 행 수와 파일 수를 원본과 비교한다. 운영 프로젝트에는 쓸 수 없다. 스키마가 달라 DB 되살리기가 실패하면 백업 시각의 커밋으로 돌아가 다시 실행한다. 끝나면 `pnpm dev`로 띄워 원래 비밀번호로 로그인해 화면을 확인하고, 다 봤으면 `pnpm db:reset`으로 비운다. 운영 데이터가 로컬에 남지 않게 하기 위해서다. 로컬 확인 계정은 위 "로컬 개발"대로 다시 만든다.

### 운영 프로젝트를 잃었을 때

새 프로젝트로 옮기는 절차다. **이 절차 전체를 실제 프로젝트에 연습해 보지는 않았고**, 명령 형식만 로컬에서 확인했다.

```bash
pnpm exec supabase link --project-ref <새 ref>
pnpm exec supabase db push --linked

# DB: 접속 주소는 새 프로젝트 대시보드의 Connect에서 복사한다. 셸 기록에 비밀번호가 남으니 끝나면 DB 비밀번호를 바꾼다
docker exec -i supabase_db_Luv3 psql "<접속 주소>" --single-transaction -v ON_ERROR_STOP=1 \
  -c "truncate table public.couple_photo" -f - < "<백업 폴더>/snapshots/<시점>/data.sql"

# 사진: 절대 경로는 인식하지 못하므로 백업 폴더에서 실행한다. 받는 쪽은 버킷 이름 없이 ss:/// 이다
cd "<백업 폴더>"
find album -name "*.part" -delete   # 받다 끊겨 남은 조각
node "<리포>/node_modules/supabase/dist/supabase.js" storage cp -r album ss:/// --linked --experimental --workdir "<리포>"
```

이 명령은 `album/`을 통째로 올리므로 그동안 지운 사진도 함께 올라간다. 앱에는 보이지 않고 용량만 차지하며, #31(주인 없는 파일 정리)에서 치운다.

그다음 위 "운영 Supabase 설정"의 2·3·5번을 새 프로젝트 기준으로 다시 맞춘다. 계정은 함께 되살아나므로 4번은 건너뛴다.
