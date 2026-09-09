import { TYPE_META, RESULT_META } from './surveyData';

const TYPE_ORDER = ['slow', 'visual', 'story', 'archive', 'expert', 'event'];
const TYPE_COLORS = {
  expert: '#E8B4D3',
  visual: '#AEE3DD',
  archive: '#85D5EF',
  story: '#F3F5AC',
  event: '#EBA06C',
  slow: '#BBA2D5',
};

const SHARE_TITLE = 'MOCA 카페 취향 테스트';
let preparedCard = null;
let preparingKey = '';
let preparingPromise = null;

function getShareUrl() {
  const url = new URL(window.location.href);
  url.search = '';
  url.hash = '';
  return url.toString();
}

function getResultContext() {
  const resultPage = document.querySelector('.result-page:not(.is-browsing-result)');
  const primaryName = resultPage?.querySelector('.result-hero-card h2')?.textContent?.trim();
  if (!resultPage || !primaryName) return null;

  const primaryType = TYPE_ORDER.find((type) => TYPE_META[type]?.name === primaryName);
  if (!primaryType || !RESULT_META[primaryType]) return null;

  const topThree = [...resultPage.querySelectorAll('.result-dna b')]
    .slice(0, 3)
    .map((node) => {
      const text = node.textContent?.trim() || '';
      const match = text.match(/^(.*?)[\s]+(\d+)$/);
      if (!match) return null;
      const short = match[1].trim();
      const percent = Number(match[2]);
      const type = TYPE_ORDER.find((candidate) => TYPE_META[candidate]?.short === short);
      if (!type || !Number.isFinite(percent)) return null;
      return { type, percent };
    })
    .filter(Boolean);

  return {
    primaryType,
    primary: TYPE_META[primaryType],
    meta: RESULT_META[primaryType],
    topThree,
    accent: TYPE_COLORS[primaryType],
  };
}

function contextKey(context) {
  return `${context.primaryType}:${context.topThree.map((item) => `${item.type}-${item.percent}`).join('|')}`;
}

function wrapCanvasText(ctx, text, x, y, maxWidth, lineHeight, maxLines = 4) {
  const words = String(text).split(' ');
  const lines = [];
  let line = '';
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  lines.slice(0, maxLines).forEach((item, i) => ctx.fillText(item, x, y + i * lineHeight));
}

async function buildShareCard(context) {
  await document.fonts?.ready;

  const { primary, meta, topThree, accent } = context;
  const scale = 3;
  const canvas = document.createElement('canvas');
  canvas.width = 375 * scale;
  canvas.height = 667 * scale;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('공유 이미지 캔버스를 만들 수 없어요.');

  ctx.scale(scale, scale);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, 375, 667);
  ctx.strokeStyle = '#e0ebf0';
  ctx.lineWidth = 1;
  for (let x = 0; x <= 375; x += 32) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, 667);
    ctx.stroke();
  }
  for (let y = 0; y <= 667; y += 32) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(375, y);
    ctx.stroke();
  }

  ctx.fillStyle = accent;
  ctx.fillRect(0, 0, 12, 667);
  ctx.fillRect(363, 0, 12, 667);

  ctx.fillStyle = '#1f2124';
  ctx.font = '700 15px "Kim Jung Chul Gothic"';
  ctx.fillText('CAFE MOCA', 24, 42);
  ctx.fillStyle = '#6e7378';
  ctx.font = '700 11px "Kim Jung Chul Gothic"';
  ctx.fillText('MY CAFE TYPE', 24, 102);
  ctx.fillStyle = '#1f2124';
  ctx.font = '700 32px "Kim Jung Chul Gothic"';
  ctx.fillText(primary.name, 24, 148);
  ctx.fillStyle = accent;
  ctx.fillRect(24, 165, 218, 14);
  ctx.fillStyle = '#1f2124';
  ctx.font = '700 15px "Kim Jung Chul Gothic"';
  ctx.fillText(meta.subtitle, 24, 201);
  ctx.font = '700 21px "Kim Jung Chul Gothic"';
  wrapCanvasText(ctx, meta.quote, 24, 246, 320, 27, 3);

  ctx.fillStyle = '#fff';
  ctx.strokeStyle = '#1f2124';
  ctx.lineWidth = 1;
  ctx.fillRect(24, 325, 327, 174);
  ctx.strokeRect(24, 325, 327, 174);
  ctx.fillStyle = '#6e7378';
  ctx.font = '700 10px "Kim Jung Chul Gothic"';
  ctx.fillText('CAFE DNA', 42, 362);
  topThree.forEach((item, i) => {
    const y = 397 + i * 37;
    ctx.fillStyle = '#1f2124';
    ctx.font = '700 12px "Kim Jung Chul Gothic"';
    ctx.fillText(TYPE_META[item.type].name, 42, y);
    ctx.fillStyle = '#eef1f2';
    ctx.fillRect(157, y - 8, 130, 5);
    ctx.fillStyle = accent;
    ctx.fillRect(157, y - 8, Math.max(10, item.percent * 1.3), 5);
    ctx.fillStyle = '#1f2124';
    ctx.font = '700 11px "Kim Jung Chul Gothic"';
    ctx.fillText(`${item.percent}%`, 300, y);
  });

  ctx.fillStyle = '#1f2124';
  ctx.font = '700 11px "Kim Jung Chul Gothic"';
  ctx.fillText(meta.tags.join('  '), 24, 539);
  ctx.font = '700 15px "Kim Jung Chul Gothic"';
  ctx.fillText('나 이거 나왔어!', 24, 578);
  ctx.fillStyle = '#6e7378';
  ctx.font = '700 11px "Kim Jung Chul Gothic"';
  ctx.fillText('MOCA 카페 취향 테스트', 24, 604);

  try {
    const logo = new Image();
    logo.src = '/logo.png';
    await logo.decode();
    ctx.drawImage(logo, 270, 565, 80, 68);
  } catch (error) {
    // 로고 디코딩이 막혀도 결과 공유 자체는 계속 진행합니다.
  }

  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('공유 이미지를 만들지 못했어요.');
  return blob;
}

function setButtonState(button, state) {
  if (!button) return;
  if (state === 'preparing') {
    button.disabled = true;
    if (button.textContent !== '공유 카드 준비 중...') button.textContent = '공유 카드 준비 중...';
    return;
  }
  button.disabled = false;
  if (button.textContent !== '친구에게 공유하기  ↗') button.textContent = '친구에게 공유하기  ↗';
}

async function prepareShareCard(button) {
  const context = getResultContext();
  if (!context) return;

  const key = contextKey(context);
  if (preparedCard?.key === key) {
    setButtonState(button, 'ready');
    return;
  }

  if (preparingPromise && preparingKey === key) {
    setButtonState(button, 'preparing');
    return preparingPromise;
  }

  preparingKey = key;
  setButtonState(button, 'preparing');
  preparingPromise = buildShareCard(context)
    .then((blob) => {
      preparedCard = { key, blob, context };
      const latestButton = document.querySelector('.result-share');
      setButtonState(latestButton, 'ready');
      return preparedCard;
    })
    .catch((error) => {
      console.error('MOCA share card preparation failed', error);
      const latestButton = document.querySelector('.result-share');
      if (latestButton) {
        latestButton.disabled = false;
        latestButton.textContent = '친구에게 공유하기  ↗';
      }
      return null;
    })
    .finally(() => {
      preparingPromise = null;
      preparingKey = '';
    });

  return preparingPromise;
}

async function copyFallback(blob, shareText) {
  try {
    if (navigator.clipboard?.write && window.ClipboardItem) {
      const item = new ClipboardItem({
        'image/png': blob,
        'text/plain': new Blob([shareText], { type: 'text/plain' }),
      });
      await navigator.clipboard.write([item]);
      window.alert('이 브라우저에서는 공유창을 열 수 없어 결과 이미지와 링크를 클립보드에 복사했어요. 친구 채팅방에 붙여넣어 주세요!');
      return;
    }
  } catch (error) {
    console.warn('Image clipboard fallback failed', error);
  }

  try {
    await navigator.clipboard?.writeText?.(shareText);
    window.alert('이 브라우저에서는 이미지 공유를 지원하지 않아 테스트 링크를 복사했어요. 모바일에서 열면 결과 이미지와 링크를 함께 공유할 수 있어요.');
  } catch (error) {
    console.error('Share fallback failed', error);
    window.alert('이 브라우저에서는 공유 기능을 사용할 수 없어요. 모바일 Safari 또는 Chrome에서 다시 시도해주세요.');
  }
}

function sharePreparedCard(button) {
  const context = getResultContext();
  const key = context ? contextKey(context) : '';
  if (!context || !preparedCard || preparedCard.key !== key) {
    prepareShareCard(button);
    window.alert('공유 카드를 준비하고 있어요. 버튼이 다시 활성화되면 한 번 더 눌러주세요!');
    return;
  }

  const { blob } = preparedCard;
  const shareUrl = getShareUrl();
  const fileName = `MOCA_${context.primary.name.replace(/\s+/g, '_')}.png`;
  const file = new File([blob], fileName, { type: 'image/png' });
  const shareText = `내 카페 취향은 ${context.primary.name}! ☕\n친구도 MOCA 카페 취향 테스트 해봐 👇\n${shareUrl}`;
  const payload = {
    title: SHARE_TITLE,
    text: shareText,
    files: [file],
  };

  const canShareFiles = typeof navigator.canShare !== 'function' || navigator.canShare({ files: [file] });
  if (typeof navigator.share === 'function' && canShareFiles) {
    // 사용자 클릭 직후 동기적으로 share()를 호출해야 모바일 브라우저의 사용자 활성화가 유지됩니다.
    navigator.share(payload).catch((error) => {
      if (error?.name === 'AbortError') return;
      console.error('Native share failed', error);
      copyFallback(blob, shareText);
    });
    return;
  }

  copyFallback(blob, shareText);
}

function syncShareUi() {
  const button = document.querySelector('.result-share');
  if (!button) return;

  const privacy = document.querySelector('.result-privacy');
  if (privacy && privacy.textContent !== '결과 이미지와 테스트 링크가 함께 공유돼요.') {
    privacy.textContent = '결과 이미지와 테스트 링크가 함께 공유돼요.';
  }

  prepareShareCard(button);
}

document.addEventListener('click', (event) => {
  const button = event.target.closest?.('.result-share');
  if (!button) return;

  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();
  sharePreparedCard(button);
}, true);

const observer = new MutationObserver(syncShareUi);
observer.observe(document.documentElement, { childList: true, subtree: true });

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', syncShareUi, { once: true });
} else {
  syncShareUi();
}
