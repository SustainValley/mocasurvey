import React, { useEffect, useMemo, useRef, useState } from 'react';
import { recognizeMobileId } from './ocr';
import { PART1_QUESTIONS, PART2_QUESTIONS, COMPARE_PROMPTS, FINAL_TIE_PROMPT, TYPE_META, RESULT_META } from './surveyData';
import { claimStudentSurvey, completeStudentSurvey, saveSurveyProgress } from './surveyStore';
import { isSupabaseConfigured } from './supabase';

const TYPE_ORDER = ['slow', 'visual', 'story', 'archive', 'expert', 'event'];
const TYPE_COLORS = {
  expert: '#E8B4D3',
  visual: '#AEE3DD',
  archive: '#85D5EF',
  story: '#F3F5AC',
  event: '#EBA06C',
  slow: '#BBA2D5',
};

const SESSION_KEY = 'moca-survey-session-v3';
const AUTH_KEY = 'moca-survey-auth-v1';
const COMPLETED_KEY = 'moca-survey-completed-v1';

function readJson(key, fallback) {
  try {
    const value = window.localStorage.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch (error) {
    console.warn(`Could not read ${key}`, error);
    return fallback;
  }
}

function writeJson(key, value) {
  try { window.localStorage.setItem(key, JSON.stringify(value)); }
  catch (error) { console.warn(`Could not save ${key}`, error); }
}

function loadSession() {
  if (typeof window === 'undefined') return null;
  return readJson(SESSION_KEY, null);
}

function loadAuth() {
  if (typeof window === 'undefined') return null;
  return readJson(AUTH_KEY, null);
}

function saveAuth(user) {
  if (!user || typeof window === 'undefined') return;
  writeJson(AUTH_KEY, user);
}

function getCompletedRecord(studentId) {
  if (!studentId || typeof window === 'undefined') return null;
  const records = readJson(COMPLETED_KEY, {});
  return records[String(studentId)] || null;
}

function saveCompletedRecord(studentId, record) {
  if (!studentId || typeof window === 'undefined') return;
  const records = readJson(COMPLETED_KEY, {});
  records[String(studentId)] = record;
  writeJson(COMPLETED_KEY, records);
}

const Logo = () => <img className="moca-logo" src="/logo.png" alt="Cafe Moca" />;

function Screen({ className = '', children }) {
  return (
    <main className={`screen ${className}`}>
      <div className="grid-bg" aria-hidden="true" />
      <div className="pink-rail pink-rail-left" aria-hidden="true" />
      <div className="pink-rail pink-rail-right" aria-hidden="true" />
      <div className="design-canvas">{children}</div>
    </main>
  );
}

function Start({ onNext }) {
  return (
    <Screen className="start-screen">
      <section className="start-copy">
        <div className="eyebrow">나는 어떤 카페를 좋아할까?</div>
        <h1><span>카페 취향</span><span>MBTI</span></h1>
      </section>
      <button className="start-btn" onClick={onNext}>시작하기</button>
      <Logo />
    </Screen>
  );
}

function MobileId({ onSelected, isReading, progress, error }) {
  const input = useRef(null);
  const handleFile = (event) => {
    const file = event.target.files?.[0];
    if (file) onSelected(file);
    event.target.value = '';
  };

  return (
    <Screen className="upload-screen">
      <section className="upload-head">
        <h2>모바일 열람증을<br />올려주세요</h2>
        <p>아래 예시처럼 화면 전체가 보이게 캡처해주세요.</p>
      </section>
      <div className="note"><span /><p>서울여대 도서관 앱 &gt; 모바일 열람증에서<br />바로 캡처할 수 있어요.</p></div>
      <div className="id-card" aria-label="모바일 열람증 예시">
        <div className="id-card-title"><span className="home-icon"><i /><b /></span>모바일 열람증</div>
        <div className="red-rule" /><div className="timer">24초 남았습니다.</div>
        <div className="photo"><div className="head" /><div className="body" /></div>
        <div className="qr">QR</div><div className="redacts"><i /><i /><i /></div><div className="yellow">열람증 발급</div>
      </div>
      <button className="upload-btn" disabled={isReading} onClick={() => input.current?.click()}>
        {isReading ? `이미지 읽는 중... ${progress}%` : '모바일 열람증 이미지 선택하기  ↑'}
      </button>
      <input ref={input} type="file" accept="image/png,image/jpeg,image/webp,image/heic,image/heif" hidden onChange={handleFile} />
      {error ? <p className="ocr-error">{error}</p> : <p className="privacy">확인 후 이미지는 저장하지 않아요.</p>}
      <Logo />
      {isReading && (
        <div className="ocr-overlay" role="status" aria-live="polite">
          <div className="ocr-loader"><strong>열람증 정보를 읽고 있어요</strong><span>이름 · 학번 · 소속을 확인하는 중이에요.</span><div className="ocr-progress"><i style={{ width: `${progress}%` }} /></div><b>{progress}%</b></div>
        </div>
      )}
    </Screen>
  );
}

function ReviewField({ label, value, onChange }) {
  const [editing, setEditing] = useState(false);
  return (
    <div className="review-field-wrap">
      <label>{label}</label>
      <div className={`review-field ${editing ? 'is-editing' : ''}`}>
        <input value={value} placeholder="인식하지 못했어요" readOnly={!editing} onChange={(e) => onChange(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') setEditing(false); }} />
        <button type="button" onClick={() => setEditing((v) => !v)}>{editing ? '완료' : '수정'}</button>
      </div>
    </div>
  );
}

function OcrReview({ initialData, onBack, onNext, busy = false, serverError = '' }) {
  const [data, setData] = useState(initialData);
  const update = (key) => (value) => setData((prev) => ({ ...prev, [key]: value }));
  const missing = !data.name || !data.studentId || !data.department;
  return (
    <Screen className="review-screen">
      <section className="review-head"><h2>정보를 확인해주세요</h2><p>열람증에서 읽은 정보예요. 틀린 부분만 수정해주세요.</p></section>
      <div className="review-form">
        <ReviewField label="이름" value={data.name} onChange={update('name')} />
        <ReviewField label="학번" value={data.studentId} onChange={update('studentId')} />
        <ReviewField label="소속" value={data.department} onChange={update('department')} />
        <p className="unique-note">※ 학번 기준으로 온라인 설문은 한 번만 참여할 수 있어요.</p>
        {missing && <button className="retry-ocr" type="button" onClick={onBack}>이미지 다시 선택하기</button>}
        {serverError && <p className="ocr-error">{serverError}</p>}
      </div>
      <button className="review-cta" type="button" disabled={missing || busy} onClick={() => onNext(data)}>{busy ? '참여 기록 확인 중...' : <>확인하고 설문 시작하기&nbsp;&nbsp;→</>}</button>
      <Logo />
    </Screen>
  );
}

function SurveyHeader({ step, title, current, total, progress }) {
  return (
    <header className="survey-header">
      <p className="survey-kicker">MOCA SURVEY</p>
      <div className="survey-step-row"><strong>{step}</strong><span>{title}</span><em>{String(current).padStart(2, '0')} / {String(total).padStart(2, '0')}</em></div>
      <div className="survey-progress" aria-hidden="true"><i style={{ width: `${progress}%` }} /><b /></div>
    </header>
  );
}

function SurveyOption({ children, selected, onClick }) {
  return <button type="button" className={`survey-option ${selected ? 'is-selected' : ''}`} onClick={onClick}>{children}</button>;
}

function SurveyQuestionScreen({ part, index, answer, onSelect, onBack }) {
  const questions = part === 1 ? PART1_QUESTIONS : PART2_QUESTIONS;
  const question = questions[index];
  const current = index + 1;
  const total = questions.length;
  const progress = (current / total) * 100;
  const options = part === 1 ? question.options.map((text, i) => ({ key: String(i), text })) : question.options;
  const selectedKey = part === 1 ? answer?.optionKey : answer?.optionKey;

  return (
    <Screen className={`survey-screen part-${part}-screen`}>
      <SurveyHeader step={part === 1 ? '01' : '02'} title={part === 1 ? '카페 이용 패턴' : '카페 콘텐츠 취향'} current={current} total={total} progress={progress} />
      <section className="survey-question-block">
        {part === 2 && index === 0 && <p className="survey-guide">약 2~3분 소요 · 오래 고민하지 말고 처음 끌리는 답을 골라주세요.</p>}
        <h2>{question.question}</h2>
        <div className="survey-options">
          {options.map((option, optionIndex) => (
            <SurveyOption key={option.key ?? optionIndex} selected={selectedKey === (option.key ?? String(optionIndex))} onClick={() => onSelect(option, optionIndex)}>{option.text}</SurveyOption>
          ))}
        </div>
        {onBack && <button type="button" className="survey-prev" onClick={onBack}>← 이전</button>}
      </section>
      <Logo />
    </Screen>
  );
}

function CompareScreen({ mode, types, index, value, onSelect, onBack, isFinalTie = false }) {
  const prompt = isFinalTie ? FINAL_TIE_PROMPT : COMPARE_PROMPTS[index];
  const total = isFinalTie ? 1 : 3;
  return (
    <Screen className="survey-screen compare-screen">
      <SurveyHeader step="03" title="취향 마무리" current={isFinalTie ? 1 : index + 1} total={total} progress={((isFinalTie ? 1 : index + 1) / total) * 100} />
      <section className="survey-question-block compare-question-block">
        <h2>{prompt.title}</h2>
        <div className="survey-options compare-options">
          {types.map((type) => (
            <SurveyOption key={type} selected={value === type} onClick={() => onSelect(type)}>{prompt.texts[type]}</SurveyOption>
          ))}
        </div>
        {onBack && <button type="button" className="survey-prev" onClick={onBack}>← 이전</button>}
      </section>
      <Logo />
    </Screen>
  );
}

function FallingBeans() {
  const beans = [
    { x: 5, size: 20, delay: -1.5, duration: 7.4, drift: 24, spin: 520 },
    { x: 17, size: 16, delay: -5.7, duration: 8.9, drift: -18, spin: -620 },
    { x: 30, size: 22, delay: -3.2, duration: 7.9, drift: 15, spin: 700 },
    { x: 44, size: 15, delay: -7.1, duration: 9.6, drift: -12, spin: -480 },
    { x: 58, size: 19, delay: -2.4, duration: 8.5, drift: 18, spin: 560 },
    { x: 72, size: 17, delay: -6.4, duration: 7.7, drift: -20, spin: -680 },
    { x: 86, size: 21, delay: -4.6, duration: 9.1, drift: 12, spin: 640 },
    { x: 95, size: 14, delay: -8.0, duration: 8.1, drift: -10, spin: -520 },
    { x: 11, size: 14, delay: -9.1, duration: 10.4, drift: 18, spin: 740 },
    { x: 38, size: 18, delay: -10.8, duration: 11.1, drift: -16, spin: -760 },
    { x: 65, size: 15, delay: -11.9, duration: 10.2, drift: 14, spin: 620 },
    { x: 90, size: 19, delay: -12.7, duration: 11.8, drift: -22, spin: -800 },
  ];
  return (
    <div className="result-live-layer" aria-hidden="true">
      {beans.map((bean, i) => (
        <i
          key={i}
          className="falling-bean"
          style={{
            '--bean-x': `${bean.x}%`,
            '--bean-size': `${bean.size}px`,
            '--bean-delay': `${bean.delay}s`,
            '--bean-duration': `${bean.duration}s`,
            '--bean-drift': `${bean.drift}px`,
            '--bean-spin': `${bean.spin}deg`,
          }}
        />
      ))}
    </div>
  );
}

function wrapCanvasText(ctx, text, x, y, maxWidth, lineHeight, maxLines = 4) {
  const words = String(text).split(' ');
  const lines = [];
  let line = '';
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) { lines.push(line); line = word; }
    else line = test;
  }
  if (line) lines.push(line);
  lines.slice(0, maxLines).forEach((item, i) => ctx.fillText(item, x, y + i * lineHeight));
  return y + Math.min(lines.length, maxLines) * lineHeight;
}

async function saveShareCard(primary, meta, topThree, accent) {
  await document.fonts?.ready;
  const scale = 3;
  const canvas = document.createElement('canvas');
  canvas.width = 375 * scale;
  canvas.height = 667 * scale;
  const ctx = canvas.getContext('2d');
  ctx.scale(scale, scale);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, 375, 667);
  ctx.strokeStyle = '#e0ebf0';
  ctx.lineWidth = 1;
  for (let x = 0; x <= 375; x += 32) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 667); ctx.stroke(); }
  for (let y = 0; y <= 667; y += 32) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(375, y); ctx.stroke(); }
  ctx.fillStyle = accent;
  ctx.fillRect(0, 0, 12, 667); ctx.fillRect(363, 0, 12, 667);

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
  ctx.fillRect(24, 325, 327, 174); ctx.strokeRect(24, 325, 327, 174);
  ctx.fillStyle = '#6e7378'; ctx.font = '700 10px "Kim Jung Chul Gothic"'; ctx.fillText('CAFE DNA', 42, 362);
  topThree.forEach((item, i) => {
    const y = 397 + i * 37;
    ctx.fillStyle = '#1f2124'; ctx.font = '700 12px "Kim Jung Chul Gothic"'; ctx.fillText(`${TYPE_META[item.type].name}`, 42, y);
    ctx.fillStyle = '#eef1f2'; ctx.fillRect(157, y - 8, 130, 5);
    ctx.fillStyle = accent; ctx.fillRect(157, y - 8, Math.max(10, item.percent * 1.3), 5);
    ctx.fillStyle = '#1f2124'; ctx.font = '700 11px "Kim Jung Chul Gothic"'; ctx.fillText(`${item.percent}%`, 300, y);
  });
  ctx.font = '700 11px "Kim Jung Chul Gothic"'; ctx.fillText(meta.tags.join('  '), 24, 539);
  ctx.font = '700 15px "Kim Jung Chul Gothic"'; ctx.fillText('나 이거 나왔어!', 24, 578);
  ctx.fillStyle = '#6e7378'; ctx.font = '700 11px "Kim Jung Chul Gothic"'; ctx.fillText('MOCA 카페 취향 테스트', 24, 604);

  try {
    const logo = new Image();
    logo.src = '/logo.png';
    await logo.decode();
    ctx.drawImage(logo, 270, 565, 80, 68);
  } catch (e) { /* logo is optional if browser blocks decode */ }

  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('PNG 생성 실패');
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `MOCA_${primary.name.replace(/\s+/g, '_')}.png`;
  document.body.appendChild(a); a.click(); a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function ResultScreen({ result, scores, onRestart, onOfflineGuide }) {
  const actualPrimary = TYPE_META[result.primaryType];
  const actualSecondary = TYPE_META[result.secondaryType];
  const [browseType, setBrowseType] = useState('');
  const [saving, setSaving] = useState(false);
  const displayType = browseType || result.primaryType;
  const isOwnResult = displayType === result.primaryType;
  const displayPrimary = TYPE_META[displayType];
  const displayMeta = RESULT_META[displayType];
  const accent = TYPE_COLORS[displayType];
  const ranked = TYPE_ORDER.map((type) => ({ type, score: scores[type] || 0 }))
    .sort((a, b) => b.score - a.score || TYPE_ORDER.indexOf(a.type) - TYPE_ORDER.indexOf(b.type));
  const topThreeBase = ranked.slice(0, 3);
  const maxScore = Math.max(1, topThreeBase[0]?.score || 1);
  const topThree = topThreeBase.map((item) => ({ ...item, percent: Math.round((item.score / maxScore) * 100) }));
  const otherTypes = TYPE_ORDER.filter((type) => type !== result.primaryType);

  const handleSave = async () => {
    if (saving || !isOwnResult) return;
    setSaving(true);
    try { await saveShareCard(actualPrimary, RESULT_META[result.primaryType], topThree, TYPE_COLORS[result.primaryType]); }
    catch (error) { console.error(error); window.alert('이미지 저장 중 오류가 발생했어요. 다시 시도해주세요.'); }
    finally { setSaving(false); }
  };

  const selectBrowseType = (type) => {
    setBrowseType(type);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <Screen className={`result-screen result-type-${displayType}`}>
      <FallingBeans />
      <section className={`result-page ${!isOwnResult ? 'is-browsing-result' : ''}`} style={{ '--accent': accent }}>
        <p className="result-kicker">MOCA CAFE TYPE</p>
        <p className="result-lead">{isOwnResult ? '나의 카페 취향은' : '다른 카페 유형 둘러보기'}</p>

        <div className="result-hero-card">
          <h2>{displayPrimary.name}</h2>
          <p className="result-subtitle">{displayMeta.subtitle}</p>
          <div className="result-hero-bar" />
          <blockquote>{displayMeta.quote}</blockquote>
          <p className="result-tags">{displayMeta.tags.join('   ')}</p>
          <div className="result-dna-line" />
          <div className="result-dna">
            <span>{isOwnResult ? 'CAFE DNA' : 'TYPE KEYWORDS'}</span>
            <div>
              {isOwnResult
                ? topThree.map(({ type, percent }) => <b key={type}>{TYPE_META[type].short} {percent}</b>)
                : displayMeta.tags.slice(0, 3).map((tag) => <b key={tag}>{tag.replace('#', '')}</b>)}
            </div>
          </div>
        </div>

        {isOwnResult && (
          <>
            <button className="result-share" type="button" onClick={handleSave} disabled={saving}>
              {saving ? '이미지 만드는 중...' : '공유용 카드로 저장하기  ↗'}
            </button>
            <p className="result-privacy">개인정보 없이 이 결과 카드만 저장돼요.</p>
          </>
        )}
        {!isOwnResult && <button className="back-to-my-result" type="button" onClick={() => { setBrowseType(''); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>← 내 결과로 돌아가기</button>}

        <h3 className="result-section-title result-about-title">이런 타입이에요</h3>
        <p className="result-description">{displayMeta.description}</p>

        <h3 className="result-section-title result-behavior-title">카페에서의 나</h3>
        <div className="result-behaviors">
          {displayMeta.behaviors.map(([label, text]) => <div className="result-behavior" key={label}><span>{label}</span><b>{text}</b></div>)}
        </div>

        <div className={`result-secondary-card ${!isOwnResult ? 'is-preview-card' : ''}`}>
          {isOwnResult ? (
            <><span>보조 유형&nbsp;&nbsp;·&nbsp;&nbsp;{actualSecondary.name}</span><b>{RESULT_META[result.primaryType].secondaryCopy}</b></>
          ) : (
            <><span>다른 유형 둘러보는 중</span><b>내 실제 결과는 {actualPrimary.name}이에요. 이 화면은 유형 특징만 확인하는 미리보기예요.</b></>
          )}
        </div>

        <div className="offline-block">
          <p>OFFLINE POP-UP</p>
          <h3>결과 보고 끝?<br />부스에서 직접 놀아봐요.</h3>
          <span>온라인 설문을 완료한 학우는 오프라인 CAFE MOCA 부스에 참여할 수 있어요.</span>
          <button type="button" onClick={onOfflineGuide}>오프라인 부스 참여하기&nbsp;&nbsp;→</button>
        </div>

        <div className="other-types">
          <h3>다른 유형도 궁금하다면?</h3>
          <p>결과는 바뀌지 않아요. 다른 유형의 특징만 구경할 수 있어요.</p>
          {otherTypes.map((type) => (
            <button
              type="button"
              className={`other-type-row ${browseType === type ? 'is-browsing' : ''}`}
              style={{ '--row-color': TYPE_COLORS[type] }}
              key={type}
              onClick={() => selectBrowseType(type)}
            >
              <b>{TYPE_META[type].name}</b><span>{RESULT_META[type].browse}</span><em>›</em>
            </button>
          ))}
        </div>

        <Logo />
        <button className="result-restart" type="button" onClick={onRestart}>처음부터 다시 보기</button>
      </section>
    </Screen>
  );
}

function OfflineGuide({ onBack }) {
  const steps = [
    ['01', '온라인 설문 완료', '설문 결과 페이지까지 완료해주세요.'],
    ['02', '부스 방문', '행사 시간 안에 CAFE MOCA 부스로 와주세요.'],
    ['03', '결과 화면 보여주기', '운영진에게 현재 열린 결과 페이지를 보여주세요.'],
    ['04', '현장 참여', '학번 확인 후 부스 프로그램에 참여하면 끝!'],
  ];
  return (
    <Screen className="offline-guide-screen">
      <section className="offline-guide-page">
        <p className="offline-guide-kicker">CAFE MOCA · OFFLINE POP-UP</p>
        <h2>오프라인 부스<br />참여 방법</h2>
        <p className="offline-guide-desc">온라인 설문을 완료했다면 현장에서<br />결과 화면을 보여주고 참여할 수 있어요.</p>
        <div className="event-info-card">
          <span>EVENT INFO</span>
          <dl><dt>일자</dt><dd>행사 일자 입력</dd><dt>시간</dt><dd>운영 시간 입력</dd><dt>장소</dt><dd>서울여자대학교 · 부스 위치 입력</dd></dl>
          <p>※ 행사 정보 확정 후 이 영역의 값만 교체하면 돼요.</p>
        </div>
        <p className="how-to-join">HOW TO JOIN</p>
        <div className="join-steps">
          {steps.map(([no, title, desc], index) => <div className={`join-step ${index === 2 ? 'is-highlight' : ''}`} key={no}><b>{no}</b><div><strong>{title}</strong><span>{desc}</span></div></div>)}
        </div>
        <button type="button" className="offline-back" onClick={onBack}>내 결과로 돌아가기&nbsp;&nbsp;←</button>
        <p className="offline-note">학번 기준 1인 1회 참여 · 캡처본이 아닌 현재 열린 결과 화면을 보여주세요.</p>
      </section>
    </Screen>
  );
}

function AlreadyParticipated({ record, onViewResult, onOfflineGuide }) {
  const primary = TYPE_META[record?.result?.primaryType] || TYPE_META.archive;
  const secondary = TYPE_META[record?.result?.secondaryType] || TYPE_META.expert;
  const completedAt = record?.completedAt ? new Date(record.completedAt) : new Date();
  const dateText = `${completedAt.getFullYear()}. ${String(completedAt.getMonth() + 1).padStart(2, '0')}. ${String(completedAt.getDate()).padStart(2, '0')} 참여 완료`;
  const accent = TYPE_COLORS[record?.result?.primaryType] || TYPE_COLORS.archive;
  return (
    <Screen className="already-screen">
      <section className="already-page" style={{ '--accent': accent }}>
        <p className="already-kicker">MOCA · PARTICIPATION CHECK</p>
        <h2>이미 참여했어요!</h2>
        <p className="already-desc">이 학번으로 완료된 설문 결과가 있어요.<br />다시 참여할 수는 없지만 결과는 언제든 다시 볼 수 있어요.</p>
        <div className="already-result-card">
          <span>MY CAFE TYPE</span><strong>{primary.name}</strong><b>보조 유형 · {secondary.name}</b><p>{dateText}</p>
        </div>
        <button type="button" className="already-primary" onClick={onViewResult}>내 결과 다시 보기&nbsp;&nbsp;→</button>
        <button type="button" className="already-secondary" onClick={onOfflineGuide}>오프라인 부스 참여 방법 보기</button>
        <p className="already-once">학번 기준 온라인 설문은 1회만 참여할 수 있어요.</p>
        <Logo />
      </section>
    </Screen>
  );
}

function emptyScores() {
  return TYPE_ORDER.reduce((acc, type) => ({ ...acc, [type]: 0 }), {});
}

function calculateScores(part2Answers) {
  const scores = emptyScores();
  PART2_QUESTIONS.forEach((question, index) => {
    const answer = part2Answers[index];
    if (!answer) return;
    const option = question.options.find((item) => item.key === answer.optionKey);
    if (option?.type) scores[option.type] += 1;
  });
  return scores;
}

function rankTypes(scores) {
  return [...TYPE_ORDER].sort((a, b) => scores[b] - scores[a] || TYPE_ORDER.indexOf(a) - TYPE_ORDER.indexOf(b));
}

function decideAfterBase(scores) {
  const ranked = rankTypes(scores);
  const [first, second, third] = ranked;
  const firstScore = scores[first];
  const secondScore = scores[second];
  const thirdScore = scores[third];
  if (firstScore - thirdScore <= 1) return { mode: 'triple', candidates: [first, second, third] };
  if (firstScore - secondScore <= 1) return { mode: 'pair', candidates: [first, second] };
  return { mode: 'done', primaryType: first, secondaryType: second };
}

function decideFromComparison(mode, candidates, compareAnswers, baseScores) {
  const votes = candidates.reduce((acc, type) => ({ ...acc, [type]: 0 }), {});
  compareAnswers.forEach((type) => { if (type && votes[type] !== undefined) votes[type] += 1; });
  const ranked = [...candidates].sort((a, b) => votes[b] - votes[a] || baseScores[b] - baseScores[a] || TYPE_ORDER.indexOf(a) - TYPE_ORDER.indexOf(b));
  if (mode === 'pair') return { done: true, primaryType: ranked[0], secondaryType: ranked[1], votes };

  const topVote = votes[ranked[0]];
  const tiedByVotes = ranked.filter((type) => votes[type] === topVote);
  if (tiedByVotes.length === 1) return { done: true, primaryType: ranked[0], secondaryType: ranked[1], votes };

  const topBase = Math.max(...tiedByVotes.map((type) => baseScores[type]));
  const tiedAfterBase = tiedByVotes.filter((type) => baseScores[type] === topBase);
  if (tiedAfterBase.length === 1) {
    const primaryType = tiedAfterBase[0];
    const secondaryType = ranked.find((type) => type !== primaryType);
    return { done: true, primaryType, secondaryType, votes };
  }
  return { done: false, tieCandidates: tiedAfterBase, votes };
}

export default function App() {
  const initialState = useMemo(() => {
    const session = loadSession();
    const auth = loadAuth();
    const verified = session?.verifiedUser || auth || null;
    const completed = verified?.studentId ? getCompletedRecord(verified.studentId) : null;

    let restoredPage = session?.page || 'start';
    if (completed?.result && (!session || restoredPage === 'start' || restoredPage === 'upload' || restoredPage === 'review')) {
      restoredPage = 'already';
    } else if (verified && (!session || restoredPage === 'start' || restoredPage === 'upload' || restoredPage === 'review')) {
      restoredPage = 'part1';
    }

    return { session, auth: verified, completed, restoredPage };
  }, []);
  const initialSession = initialState.session;
  const [page, setPage] = useState(initialState.restoredPage);
  const [ocrData, setOcrData] = useState(initialSession?.ocrData || initialState.auth || { name: '', studentId: '', department: '', rawText: '' });
  const [verifiedUser, setVerifiedUser] = useState(initialState.auth || null);
  const [isReading, setIsReading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [ocrError, setOcrError] = useState('');
  const [part1Index, setPart1Index] = useState(initialSession?.part1Index || 0);
  const [part2Index, setPart2Index] = useState(initialSession?.part2Index || 0);
  const [part1Answers, setPart1Answers] = useState(initialSession?.part1Answers || Array(PART1_QUESTIONS.length).fill(null));
  const [part2Answers, setPart2Answers] = useState(initialSession?.part2Answers || Array(PART2_QUESTIONS.length).fill(null));
  const [questionStartedAt, setQuestionStartedAt] = useState(Date.now());
  const [comparison, setComparison] = useState(initialSession?.comparison || null);
  const [compareIndex, setCompareIndex] = useState(initialSession?.compareIndex || 0);
  const [compareAnswers, setCompareAnswers] = useState(initialSession?.compareAnswers || []);
  const [finalTieAnswer, setFinalTieAnswer] = useState(initialSession?.finalTieAnswer || '');
  const [result, setResult] = useState(initialSession?.result || initialState.completed?.result || null);
  const [existingRecord, setExistingRecord] = useState(initialSession?.existingRecord || initialState.completed || null);
  const [serverError, setServerError] = useState('');
  const [isClaiming, setIsClaiming] = useState(false);
  const completedSyncRef = useRef('');

  const scores = useMemo(() => calculateScores(part2Answers), [part2Answers]);

  useEffect(() => {
    const safePage = page === 'upload' && isReading ? 'upload' : page;
    writeJson(SESSION_KEY, {
      page: safePage, ocrData, verifiedUser, part1Index, part2Index, part1Answers, part2Answers,
      comparison, compareIndex, compareAnswers, finalTieAnswer, result, existingRecord,
    });
  }, [page, ocrData, verifiedUser, part1Index, part2Index, part1Answers, part2Answers, comparison, compareIndex, compareAnswers, finalTieAnswer, result, existingRecord, isReading]);

  useEffect(() => {
    if (verifiedUser?.studentId) saveAuth(verifiedUser);
  }, [verifiedUser]);

  useEffect(() => {
    if (!result || !verifiedUser?.studentId) return;
    const prior = getCompletedRecord(verifiedUser.studentId);
    const record = {
      verifiedUser,
      result,
      part1Answers,
      part2Answers,
      scores,
      completedAt: prior?.completedAt || new Date().toISOString(),
    };
    saveCompletedRecord(verifiedUser.studentId, record);
    if (existingRecord?.result?.primaryType !== result.primaryType) setExistingRecord(record);

    const syncKey = `${verifiedUser.studentId}:${result.primaryType}:${result.secondaryType || ''}`;
    if (completedSyncRef.current === syncKey) return;
    completedSyncRef.current = syncKey;
    let cancelled = false;
    completeStudentSurvey({ verifiedUser, result, part1Answers, part2Answers, scores })
      .then((serverRecord) => {
        if (cancelled || !serverRecord || serverRecord.mode === 'local') return;
        if (serverRecord.status === 'already_completed' && serverRecord.result) {
          const restored = { ...record, result: serverRecord.result, completedAt: serverRecord.completedAt || record.completedAt, serverCompleted: true };
          saveCompletedRecord(verifiedUser.studentId, restored);
          setExistingRecord(restored);
          setResult(serverRecord.result);
        } else {
          const synced = { ...record, completedAt: serverRecord.completedAt || record.completedAt, serverCompleted: true };
          saveCompletedRecord(verifiedUser.studentId, synced);
          setExistingRecord(synced);
        }
      })
      .catch((error) => {
        completedSyncRef.current = '';
        console.error('Supabase completion sync failed', error);
        if (!cancelled) setServerError('설문 결과 서버 저장에 실패했어요. 인터넷 연결 후 새로고침하면 다시 시도합니다.');
      });
    return () => { cancelled = true; };
  }, [result, verifiedUser, part1Answers, part2Answers, scores]);

  useEffect(() => {
    if (!verifiedUser?.studentId || !['part1','part2','compare','finalTie'].includes(page)) return;
    const timer = window.setTimeout(() => {
      saveSurveyProgress({ verifiedUser, page, part1Answers, part2Answers, comparison, compareAnswers })
        .catch((error) => console.warn('Supabase draft sync failed', error));
    }, 500);
    return () => window.clearTimeout(timer);
  }, [verifiedUser, page, part1Answers, part2Answers, comparison, compareAnswers]);

  const handleSelected = async (file) => {
    setIsReading(true); setProgress(0); setOcrError('');
    try {
      const recognized = await recognizeMobileId(file, setProgress);
      setOcrData(recognized); setPage('review');
    } catch (error) {
      console.error(error); setOcrError('이미지를 읽지 못했어요. 선명한 열람증 캡처로 다시 시도해주세요.');
    } finally { setIsReading(false); }
  };

  const moveAfterDelay = (fn) => window.setTimeout(fn, 150);

  const beginSurveyOrRestore = async (data) => {
    setIsClaiming(true);
    setServerError('');
    saveAuth(data);
    setVerifiedUser(data);

    try {
      const serverRecord = await claimStudentSurvey(data);
      if (serverRecord?.status === 'completed' && serverRecord.result) {
        const restored = {
          verifiedUser: serverRecord.verifiedUser || data,
          result: serverRecord.result,
          scores: serverRecord.scores || {},
          part1Answers: serverRecord.part1Answers || [],
          part2Answers: serverRecord.part2Answers || [],
          completedAt: serverRecord.completedAt || new Date().toISOString(),
          offlineParticipatedAt: serverRecord.offlineParticipatedAt || null,
          serverCompleted: true,
        };
        saveCompletedRecord(data.studentId, restored);
        setExistingRecord(restored);
        setResult(restored.result);
        if (Array.isArray(restored.part1Answers) && restored.part1Answers.length) setPart1Answers(restored.part1Answers);
        if (Array.isArray(restored.part2Answers) && restored.part2Answers.length) setPart2Answers(restored.part2Answers);
        setPage('already');
        return;
      }
      if (serverRecord?.status === 'in_progress_elsewhere') {
        setServerError('이 학번으로 다른 기기에서 설문이 진행 중이에요. 잠시 후 다시 시도해주세요.');
        return;
      }
    } catch (error) {
      console.error('Supabase claim failed', error);
      if (isSupabaseConfigured) {
        setServerError('서버 연결에 실패했어요. 인터넷 연결과 Supabase 설정을 확인해주세요.');
        return;
      }
    } finally {
      setIsClaiming(false);
    }

    const prior = getCompletedRecord(data.studentId);
    if (prior?.result) {
      setExistingRecord(prior);
      setResult(prior.result);
      if (Array.isArray(prior.part1Answers)) setPart1Answers(prior.part1Answers);
      if (Array.isArray(prior.part2Answers)) setPart2Answers(prior.part2Answers);
      setPage('already');
      return;
    }
    setExistingRecord(null); setPart1Index(0); setPage('part1'); setQuestionStartedAt(Date.now());
  };

  const selectPart1 = (option, optionIndex) => {
    const now = Date.now();
    setPart1Answers((prev) => {
      const next = [...prev];
      const previous = prev[part1Index];
      next[part1Index] = {
        questionId: PART1_QUESTIONS[part1Index].id,
        optionKey: String(optionIndex),
        optionText: option.text,
        responseTimeMs: Math.max(0, now - questionStartedAt),
        modified: Boolean(previous),
      };
      return next;
    });
    moveAfterDelay(() => {
      if (part1Index < PART1_QUESTIONS.length - 1) { setPart1Index((i) => i + 1); setQuestionStartedAt(Date.now()); }
      else { setPart2Index(0); setPage('part2'); setQuestionStartedAt(Date.now()); }
    });
  };

  const selectPart2 = (option, optionIndex) => {
    const now = Date.now();
    setPart2Answers((prev) => {
      const next = [...prev];
      const previous = prev[part2Index];
      next[part2Index] = {
        questionId: PART2_QUESTIONS[part2Index].id,
        behaviorStage: PART2_QUESTIONS[part2Index].stage,
        optionKey: option.key,
        optionText: option.text,
        linkedType: option.type,
        optionPosition: optionIndex + 1,
        responseTimeMs: Math.max(0, now - questionStartedAt),
        modified: Boolean(previous),
      };
      return next;
    });

    moveAfterDelay(() => {
      if (part2Index < PART2_QUESTIONS.length - 1) {
        setPart2Index((i) => i + 1); setQuestionStartedAt(Date.now());
        return;
      }
      const answersWithCurrent = [...part2Answers];
      answersWithCurrent[part2Index] = { optionKey: option.key };
      const finalScores = calculateScores(answersWithCurrent);
      const decision = decideAfterBase(finalScores);
      if (decision.mode === 'done') {
        setResult({ primaryType: decision.primaryType, secondaryType: decision.secondaryType, usedComparison: false });
        setPage('result');
      } else {
        setComparison(decision); setCompareAnswers(Array(3).fill('')); setCompareIndex(0); setFinalTieAnswer(''); setPage('compare'); setQuestionStartedAt(Date.now());
      }
    });
  };

  const selectCompare = (type) => {
    const nextAnswers = [...compareAnswers]; nextAnswers[compareIndex] = type; setCompareAnswers(nextAnswers);
    moveAfterDelay(() => {
      if (compareIndex < 2) { setCompareIndex((i) => i + 1); setQuestionStartedAt(Date.now()); return; }
      const decision = decideFromComparison(comparison.mode, comparison.candidates, nextAnswers, scores);
      if (decision.done) {
        setResult({ primaryType: decision.primaryType, secondaryType: decision.secondaryType, usedComparison: true, comparisonMode: comparison.mode }); setPage('result');
      } else {
        setComparison((prev) => ({ ...prev, tieCandidates: decision.tieCandidates, votes: decision.votes })); setPage('finalTie');
      }
    });
  };

  const selectFinalTie = (type) => {
    setFinalTieAnswer(type);
    moveAfterDelay(() => {
      const secondaryType = [...comparison.candidates]
        .filter((candidate) => candidate !== type)
        .sort((a, b) => (comparison.votes?.[b] || 0) - (comparison.votes?.[a] || 0) || scores[b] - scores[a] || TYPE_ORDER.indexOf(a) - TYPE_ORDER.indexOf(b))[0];
      setResult({ primaryType: type, secondaryType, usedComparison: true, comparisonMode: 'triple+final' }); setPage('result');
    });
  };

  const reset = () => {
    try { window.localStorage.removeItem(SESSION_KEY); } catch (error) { /* ignore */ }
    const prior = verifiedUser?.studentId ? getCompletedRecord(verifiedUser.studentId) : null;
    setPart1Index(0); setPart2Index(0);
    setPart1Answers(prior?.part1Answers || Array(PART1_QUESTIONS.length).fill(null));
    setPart2Answers(prior?.part2Answers || Array(PART2_QUESTIONS.length).fill(null));
    setComparison(null); setCompareIndex(0); setCompareAnswers([]); setFinalTieAnswer('');
    if (prior?.result) {
      setExistingRecord(prior); setResult(prior.result); setPage('already');
    } else if (verifiedUser) {
      setExistingRecord(null); setResult(null); setPage('part1');
    } else {
      setPage('start'); setOcrData({ name: '', studentId: '', department: '', rawText: '' }); setResult(null); setExistingRecord(null);
    }
  };

  const openStoredResult = () => {
    if (existingRecord?.result) {
      setResult(existingRecord.result);
      if (existingRecord.verifiedUser) setVerifiedUser(existingRecord.verifiedUser);
      if (Array.isArray(existingRecord.part1Answers)) setPart1Answers(existingRecord.part1Answers);
      if (Array.isArray(existingRecord.part2Answers)) setPart2Answers(existingRecord.part2Answers);
    }
    setPage('result'); window.scrollTo({ top: 0 });
  };

  return (
    <div className="app-shell">
      {page === 'start' && <Start onNext={() => setPage('upload')} />}
      {page === 'upload' && <MobileId onSelected={handleSelected} isReading={isReading} progress={progress} error={ocrError} />}
      {page === 'review' && <OcrReview initialData={ocrData} onBack={() => setPage('upload')} onNext={beginSurveyOrRestore} busy={isClaiming} serverError={serverError} />}
      {page === 'part1' && <SurveyQuestionScreen part={1} index={part1Index} answer={part1Answers[part1Index]} onSelect={selectPart1} onBack={part1Index > 0 ? () => { setPart1Index((i) => i - 1); setQuestionStartedAt(Date.now()); } : null} />}
      {page === 'part2' && <SurveyQuestionScreen part={2} index={part2Index} answer={part2Answers[part2Index]} onSelect={selectPart2} onBack={() => { if (part2Index > 0) setPart2Index((i) => i - 1); else { setPage('part1'); setPart1Index(PART1_QUESTIONS.length - 1); } setQuestionStartedAt(Date.now()); }} />}
      {page === 'compare' && comparison && <CompareScreen mode={comparison.mode} types={comparison.candidates} index={compareIndex} value={compareAnswers[compareIndex]} onSelect={selectCompare} onBack={() => { if (compareIndex > 0) setCompareIndex((i) => i - 1); else { setPage('part2'); setPart2Index(PART2_QUESTIONS.length - 1); } setQuestionStartedAt(Date.now()); }} />}
      {page === 'finalTie' && comparison?.tieCandidates && <CompareScreen mode="triple" types={comparison.tieCandidates} index={0} value={finalTieAnswer} onSelect={selectFinalTie} onBack={() => { setPage('compare'); setCompareIndex(2); }} isFinalTie />}
      {page === 'result' && result && <ResultScreen result={result} scores={scores} onRestart={reset} onOfflineGuide={() => { setPage('offlineGuide'); window.scrollTo({ top: 0 }); }} />}
      {page === 'offlineGuide' && <OfflineGuide onBack={() => { setPage(result ? 'result' : existingRecord ? 'already' : 'start'); window.scrollTo({ top: 0 }); }} />}
      {page === 'already' && existingRecord && <AlreadyParticipated record={existingRecord} onViewResult={openStoredResult} onOfflineGuide={() => { setPage('offlineGuide'); window.scrollTo({ top: 0 }); }} />}
      {serverError && page !== 'review' && <div className="server-sync-warning" role="status">{serverError}</div>}
      <div className="sr-only" aria-hidden="true">{verifiedUser?.studentId || ''}</div>
    </div>
  );
}

