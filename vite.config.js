import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

function mocaStep3AdditionalPosts() {
  return {
    name: 'moca-step3-additional-posts',
    enforce: 'pre',
    transform(code, id) {
      if (!id.endsWith('/src/App.jsx')) return null;
      if (code.includes("id: 'P3-19'")) return null;

      const additions = [
        "  { id: 'P3-19', group: 'V1', image: '/step3/post-19.webp', fallback: '/step3/post-19.webp', alt: '카페 추천 게시물 19' },",
        "  { id: 'P3-20', group: 'V2', image: '/step3/post-20.webp', fallback: '/step3/post-20.webp', alt: '카페 추천 게시물 20' },",
        "  { id: 'P3-21', group: 'V3', image: '/step3/post-21.webp', fallback: '/step3/post-21.webp', alt: '카페 추천 게시물 21' },",
      ].join('\n');

      let next = code.replace(
        /(\{ id: 'P3-18',[^\n]+\},\n)(\];)/,
        `$1${additions}\n$2`,
      );

      next = next
        .replace(
          "{ id: 'V1', postIds: ['P3-01', 'P3-02', 'P3-03'] },",
          "{ id: 'V1', postIds: ['P3-01', 'P3-02', 'P3-03', 'P3-19'] },",
        )
        .replace(
          "{ id: 'V2', postIds: ['P3-04', 'P3-05', 'P3-06'] },",
          "{ id: 'V2', postIds: ['P3-04', 'P3-05', 'P3-06', 'P3-20'] },",
        )
        .replace(
          "{ id: 'V3', postIds: ['P3-07', 'P3-08', 'P3-09'] },",
          "{ id: 'V3', postIds: ['P3-07', 'P3-08', 'P3-09', 'P3-21'] },",
        );

      if (!next.includes("id: 'P3-19'") || !next.includes("'P3-19']") || !next.includes("'P3-20']") || !next.includes("'P3-21']")) {
        this.error('CAFE MOCA Step 3 image injection failed because App.jsx structure changed.');
      }

      return { code: next, map: null };
    },
  };
}

export default defineConfig({
  plugins: [mocaStep3AdditionalPosts(), react()],
});
