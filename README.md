# Luv3

둘이서만 보는 비공개 데이트 앨범 모바일 웹.

- 데이트 하나 = 앨범 한 장. 날짜, 장소, 사진, 짧은 메모를 남기고 시간순으로 넘겨본다.
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

- 로컬 메일함(Mailpit): http://127.0.0.1:54324 — 로그인 메일이 여기로 온다.
- 로컬 대시보드(Studio): http://127.0.0.1:54323
- 회원가입이 막혀 있으므로 테스트 계정은 Studio의 Authentication에서 만든 뒤, SQL Editor에서 허용목록에 넣는다.

  ```sql
  insert into public.members (id, email, nickname)
  select id, email, '닉네임' from auth.users where email = 'me@example.com';
  ```

- dev 서버 주소는 `localhost:3000`으로 연다. `127.0.0.1:3000`으로 열면 메일 링크(`site_url`)와 호스트가 달라 세션 쿠키가 전달되지 않는다.

## 검사

```bash
pnpm lint
pnpm type-check
pnpm test       # Vitest 단위 테스트
pnpm test:db    # pgTAP RLS 테스트 (로컬 Supabase 실행 중이어야 함)
```

스키마를 바꾸면 `supabase/migrations/`에 새 파일을 추가하고 `pnpm db:reset && pnpm db:types`로 타입을 다시 만든다.

## 운영 Supabase 설정

마이그레이션 외에 대시보드에서 직접 맞춰야 하는 값이다.

1. 마이그레이션 적용: `pnpm exec supabase link --project-ref <ref>` 후 `pnpm exec supabase db push`
2. Authentication > Sign In / Providers: "Allow new users to sign up" 끄기, Email 공급자는 켜 두기
3. Authentication > URL Configuration: Site URL을 배포 주소로
4. Authentication > Emails > Magic Link: `supabase/templates/magic_link.html` 내용을 붙여 넣기
5. Authentication > Users에서 두 계정을 만들고, SQL Editor에서 `members`에 추가(위 SQL)
6. Authentication > Emails > SMTP Settings: 기본 메일 서버는 조직 멤버에게만 보내므로 커스텀 SMTP를 연결하거나 상대 이메일을 조직 멤버로 초대
7. Vercel 환경 변수: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

허용목록 이메일과 키는 리포에 커밋하지 않는다.
