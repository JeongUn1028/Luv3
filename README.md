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
```

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

비밀번호 찾기 메일은 없다. 대시보드의 "Send password recovery"도 메일을 보내는 기능이라 쓰지 않고, SQL Editor에서 직접 바꾼다.
이 방법은 최소 길이 검사를 거치지 않으므로 12자 이상인지 직접 확인하고, 실행한 뒤 SQL Editor의 쿼리 기록에서 지운다.

```sql
update auth.users
set encrypted_password = extensions.crypt('새 비밀번호', extensions.gen_salt('bf'))
where email = 'me@example.com';
```

허용목록 이메일과 키는 리포에 커밋하지 않는다.
