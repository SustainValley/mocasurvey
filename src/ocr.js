import { createWorker } from 'tesseract.js';

let workerPromise = null;

function getWorker(onProgress) {
  if (!workerPromise) {
    workerPromise = createWorker(['kor', 'eng'], 1, {
      logger: (message) => {
        if (message.status === 'recognizing text' && typeof message.progress === 'number') {
          onProgress?.(Math.round(message.progress * 100));
        }
      },
    }).catch((error) => {
      workerPromise = null;
      throw error;
    });
  }
  return workerPromise;
}

async function preprocessImage(file) {
  const bitmap = await createImageBitmap(file);
  const maxSide = Math.max(bitmap.width, bitmap.height);
  const scale = maxSide < 1800 ? Math.min(2.5, 1800 / maxSide) : 1;
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close?.();

  const image = ctx.getImageData(0, 0, width, height);
  const data = image.data;
  for (let i = 0; i < data.length; i += 4) {
    const gray = Math.round(data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114);
    const contrasted = gray < 150 ? Math.max(0, gray - 28) : Math.min(255, gray + 18);
    data[i] = contrasted;
    data[i + 1] = contrasted;
    data[i + 2] = contrasted;
  }
  ctx.putImageData(image, 0, 0);
  return canvas;
}

const STOP_WORDS = [
  '모바일', '열람증', '도서관', '서울여자대학교', '서울여대', '학생증', '발급', '남았습니다',
  '이름', '학번', '소속', '학과', '대학', '대학교', 'QR', '바코드', '회원', '신분', '캠퍼스',
];

function cleanLine(line) {
  return line
    .replace(/[|［\]{}<>]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function compactDigits(value) {
  return value.replace(/[^0-9]/g, '');
}

function scoreName(line, index, studentIndex) {
  if (!/^[가-힣]{2,5}$/.test(line)) return -100;
  if (STOP_WORDS.some((word) => line.includes(word))) return -100;
  let score = 10;
  if (line.length === 3) score += 6;
  if (studentIndex >= 0) score += Math.max(0, 8 - Math.abs(index - studentIndex) * 2);
  return score;
}

function findStudentId(lines, fullText) {
  const labeled = fullText.match(/(?:학번|student\s*id|id)\s*[:：]?\s*([0-9][0-9\s-]{6,13}[0-9])/i);
  if (labeled) {
    const id = compactDigits(labeled[1]);
    if (id.length >= 8 && id.length <= 11) return id;
  }

  const candidates = [];
  lines.forEach((line, index) => {
    const matches = line.match(/[0-9][0-9\s-]{6,13}[0-9]/g) || [];
    for (const raw of matches) {
      const id = compactDigits(raw);
      if (id.length >= 8 && id.length <= 11) {
        let score = id.length === 10 ? 10 : 5;
        if (/^20\d{2}/.test(id)) score += 6;
        if (/학번|student|id/i.test(line)) score += 8;
        candidates.push({ id, score, index });
      }
    }
  });
  candidates.sort((a, b) => b.score - a.score);
  return candidates[0]?.id || '';
}

function parseOcrText(rawText) {
  const lines = rawText
    .split(/\r?\n/)
    .map(cleanLine)
    .filter(Boolean);

  const studentId = findStudentId(lines, rawText);
  const studentIndex = studentId
    ? lines.findIndex((line) => compactDigits(line).includes(studentId))
    : -1;

  const deptCandidates = lines
    .map((line, index) => ({ line, index }))
    .filter(({ line }) => /(학과|학부|전공|대학원)/.test(line) && !/서울여자대학교|서울여대/.test(line))
    .map(({ line, index }) => ({
      value: line
        .replace(/^(소속|학과|학부|전공)\s*[:：]?\s*/g, '')
        .replace(/\s+/g, ''),
      score: 10 + (studentIndex >= 0 ? Math.max(0, 6 - Math.abs(index - studentIndex)) : 0),
    }))
    .filter(({ value }) => value.length >= 3 && value.length <= 20);
  deptCandidates.sort((a, b) => b.score - a.score);
  const department = deptCandidates[0]?.value || '';

  const nameCandidates = lines
    .map((line, index) => {
      const stripped = line.replace(/^(이름|성명)\s*[:：]?\s*/g, '').replace(/\s/g, '');
      return { value: stripped, score: scoreName(stripped, index, studentIndex) + (/^(이름|성명)/.test(line) ? 10 : 0) };
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score);

  return {
    name: nameCandidates[0]?.value || '',
    studentId,
    department,
    rawText,
  };
}

export async function recognizeMobileId(file, onProgress) {
  onProgress?.(1);
  const processed = await preprocessImage(file);
  onProgress?.(5);
  const worker = await getWorker(onProgress);
  await worker.setParameters({
    preserve_interword_spaces: '1',
    user_defined_dpi: '300',
  });
  const result = await worker.recognize(processed);
  onProgress?.(100);
  return parseOcrText(result.data.text || '');
}
