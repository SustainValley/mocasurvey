# MOCA Supabase 연결

1. Supabase Dashboard > Authentication > Providers/Sign In에서 **Anonymous Sign-Ins**를 켭니다.
2. Dashboard > SQL Editor에서 `supabase/schema.sql` 전체를 실행합니다.
3. Project Settings / Connect에서 Project URL과 **Publishable key**를 확인합니다.
4. `.env.example`을 `.env`로 복사하고 값을 채웁니다.
5. `npm install && npm run dev`로 실행합니다.

## 저장 구조
- `moca_survey_participants`: 학번 1회 참여, 인증 정보, 최종 유형, 점수, 오프라인 참여 여부
- `moca_survey_responses`: 문항별 원자료
- `moca_survey_drafts`: 같은 브라우저의 진행 중 설문 백업

## 보안
- 참가자/응답 테이블은 클라이언트 직접 SELECT 정책이 없습니다.
- 학번 claim / 설문 완료 / 오프라인 체크는 SECURITY DEFINER RPC를 통해서만 수행합니다.
- Publishable key는 프론트에 사용해도 되지만 service_role key는 절대 프론트에 넣으면 안 됩니다.
