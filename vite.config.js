import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

function mocaSurveyAdjustments() {
  return {
    name: 'moca-survey-adjustments',
    enforce: 'pre',
    transform(code, id) {
      if (id.endsWith('/src/App.jsx')) {
        let next = code;

        // Keep the original 18 Step 3 images local and stable.
        // The remote FigJam/MCP asset URLs can change or expire, so the app should
        // always render the checked-in public/step3/post-01~18.jpg files instead.
        for (let index = 1; index <= 18; index += 1) {
          const number = String(index).padStart(2, '0');
          const postId = `P3-${number}`;
          const localPath = `/step3/post-${number}.jpg`;
          const postPattern = new RegExp(
            `(\\{ id: '${postId}', group: 'V\\d', )image: '[^']+', fallback: '[^']+', alt: '[^']+'( \\},)`,
          );
          next = next.replace(
            postPattern,
            `$1image: '${localPath}', fallback: '${localPath}', alt: '개인 카페 추천 게시물 ${index}'$2`,
          );
        }

        // Add the three newly supplied images. They are used in both the first
        // Instagram feed and the corresponding Step 3-2 comparison stage.
        if (!next.includes("id: 'P3-19'")) {
          const additions = [
            "  { id: 'P3-19', group: 'V1', image: '/step3/post-19.webp', fallback: '/step3/post-19.webp', alt: '개인 카페 추천 게시물 19' },",
            "  { id: 'P3-20', group: 'V2', image: '/step3/post-20.webp', fallback: '/step3/post-20.webp', alt: '개인 카페 추천 게시물 20' },",
            "  { id: 'P3-21', group: 'V3', image: '/step3/post-21.webp', fallback: '/step3/post-21.webp', alt: '개인 카페 추천 게시물 21' },",
          ].join('\n');

          next = next.replace(
            /(\{ id: 'P3-18',[^\n]+\},\n)(\];)/,
            `$1${additions}\n$2`,
          );
        }

        // Step 3-2 groups: menu appeal / manufacturing & expertise / space appeal.
        // Each stage now has its original three images plus the newly supplied one.
        next = next
          .replace(
            "{ id: 'V1', postIds: ['P3-01', 'P3-02', 'P3-03'] },",
            "{ id: 'V1', postIds: ['P3-01', 'P3-02', 'P3-03', 'P3-19'] },",
          )
          .replace(
            "{ id: 'V2', postIds: ['P3-04', 'P3-05', 'P3-06'] },",
            "{ id: 'V2', postIds: ['P3-10', 'P3-11', 'P3-12', 'P3-20'] },",
          )
          .replace(
            "{ id: 'V3', postIds: ['P3-07', 'P3-08', 'P3-09'] },",
            "{ id: 'V3', postIds: ['P3-04', 'P3-05', 'P3-06', 'P3-21'] },",
          );

        // Randomize only the first Instagram feed. The comparison stages keep
        // their intentional stage-specific groupings.
        if (!next.includes('function shuffleStep3Posts(posts)')) {
          next = next.replace(
            'function Step3Rank({ rankings, onChange, onNext, onBack }) {',
            `function shuffleStep3Posts(posts) {\n  const shuffled = [...posts];\n  for (let index = shuffled.length - 1; index > 0; index -= 1) {\n    const randomIndex = Math.floor(Math.random() * (index + 1));\n    [shuffled[index], shuffled[randomIndex]] = [shuffled[randomIndex], shuffled[index]];\n  }\n  return shuffled;\n}\n\nfunction Step3Rank({ rankings, onChange, onNext, onBack }) {\n  const rankPosts = useMemo(() => shuffleStep3Posts(STEP3_POSTS), []);`,
          );
          next = next.replace('{STEP3_POSTS.map((post) => {', '{rankPosts.map((post) => {');
        }

        // The entire survey is about independently operated cafes, not franchises.
        next = next
          .replace('aria-label="카페 취향 MBTI"', 'aria-label="개인 카페 취향 MBTI"')
          .replace(
            '<div className="eyebrow">나는 어떤 카페를 좋아할까?</div>',
            '<div className="eyebrow" style={{ fontSize: \'18px\', width: \'310px\' }}>나는 어떤 개인 카페를 좋아할까?</div>',
          )
          .replace(
            '<button className="start-btn" onClick={onNext}>시작하기</button>',
            '<p style={{ position: \'absolute\', left: \'16px\', top: \'315px\', width: \'343px\', margin: 0, color: \'#6b7075\', fontSize: \'11px\', lineHeight: \'16px\', fontWeight: 700 }}>※ 프랜차이즈가 아닌 개인 카페를 기준으로 진행해요.</p><button className="start-btn" onClick={onNext}>시작하기</button>',
          )
          .replace("title={part === 1 ? '카페 이용 패턴' : '카페 콘텐츠 취향'}", "title={part === 1 ? '개인 카페 이용 패턴' : '개인 카페 콘텐츠 취향'}")
          .replace("isOwnResult ? '나의 카페 취향은' : '다른 카페 유형 둘러보기'", "isOwnResult ? '나의 개인 카페 취향은' : '다른 개인 카페 유형 둘러보기'")
          .replace("ctx.fillText('MOCA 카페 취향 테스트'", "ctx.fillText('MOCA 개인 카페 취향 테스트'")
          .replace(/alt: '카페 추천 게시물/g, "alt: '개인 카페 추천 게시물")
          .replace('aria-label="검색어 카페 추천"', 'aria-label="검색어 개인 카페 추천"')
          .replace('<span>카페 추천</span>', '<span>개인 카페 추천</span>')
          .replace(
            '이제 실제 게시물을 보며<br />취향을 한 번 더 확인해요.',
            '이제 게시물을 보며<br />개인 카페 취향을 확인해요.',
          )
          .replace(
            '잠시 후 인스타그램처럼 카페 추천 피드가 열려요.<br />먼저 마음에 드는 게시물 3개를 <b>끌리는 순서대로</b> 골라주세요.<br />그다음에는 비슷한 게시물 3장 중 <b>가장 마음에 드는 1장</b>을 선택해요.',
            '프랜차이즈가 아닌 개인 카페를 기준으로 진행해요.<br />피드에서 마음에 드는 게시물 3개를 <b>끌리는 순서대로</b> 골라주세요.<br />이후에는 주제별 게시물 중 가장 마음에 드는 1개를 선택해요.',
          )
          .replace('aria-label="카페 추천 게시물 선택"', 'aria-label="개인 카페 추천 게시물 선택"');

        if (!next.includes("id: 'P3-19'") || !next.includes("'P3-19']") || !next.includes("'P3-20']") || !next.includes("'P3-21']")) {
          this.error('CAFE MOCA Step 3 image injection failed because App.jsx structure changed.');
        }
        if (!next.includes('rankPosts.map((post) => {')) {
          this.error('CAFE MOCA Step 3 randomization injection failed because App.jsx structure changed.');
        }

        return { code: next, map: null };
      }

      if (id.endsWith('/src/surveyData.js')) {
        let next = code;

        next = next.replace(/question: '([^']*?)카페([^']*?)'/g, (match, before, after) => {
          return `question: '${before}개인 카페${after}'`;
        });
        next = next.replace("'새로운 카페 탐방'", "'새로운 개인 카페 탐방'");

        return { code: next, map: null };
      }

      return null;
    },
  };
}

export default defineConfig({
  plugins: [mocaSurveyAdjustments(), react()],
});
