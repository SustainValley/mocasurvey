import { ensureAnonymousSession, isSupabaseConfigured, supabase } from './supabase';

const ANALYTICS_SESSION_KEY = 'moca-runtime-analytics-session-v1';
const SURVEY_VERSION = '2026-09-07-v2';
let authPromise = null;
let lastPage = null;
let started = false;

function getAnalyticsSessionId() {
  if (typeof window === 'undefined') return null;
  try {
    let id = window.sessionStorage.getItem(ANALYTICS_SESSION_KEY);
    if (!id) {
      id = window.crypto?.randomUUID?.() || 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
        const random = Math.floor(Math.random() * 16);
        const value = char === 'x' ? random : (random & 0x3) | 0x8;
        return value.toString(16);
      });
      window.sessionStorage.setItem(ANALYTICS_SESSION_KEY, id);
    }
    return id;
  } catch {
    return null;
  }
}

async function ensureAnalyticsAuth() {
  if (!authPromise) {
    authPromise = ensureAnonymousSession().catch((error) => {
      authPromise = null;
      throw error;
    });
  }
  return authPromise;
}

function currentStudentId() {
  const value = document.querySelector('.sr-only')?.textContent?.trim();
  return value || null;
}

function detectPage() {
  const selectors = [
    ['start', '.start-screen'],
    ['upload', '.upload-screen'],
    ['review', '.review-screen'],
    ['part1', '.part-1-screen'],
    ['part2', '.part-2-screen'],
    ['compare', '.compare-screen'],
    ['step3Loading', '.step3-loading-screen'],
    ['step3Rank', '.step3-rank-screen'],
    ['step3Modal', '.step3-modal-screen'],
    ['step3Compare', '.step3-compare-screen'],
    ['resultLoading', '.result-loading-screen'],
    ['result', '.result-screen'],
    ['offlineGuide', '.offline-guide-screen'],
    ['already', '.already-screen'],
  ];
  return selectors.find(([, selector]) => document.querySelector(selector))?.[0] || null;
}

async function logEvent(eventName, page = null, properties = {}) {
  if (!isSupabaseConfigured || !supabase || !eventName) return;
  const sessionId = getAnalyticsSessionId();
  if (!sessionId) return;

  const payload = {
    p_session_id: sessionId,
    p_event_name: eventName,
    p_page: page,
    p_student_id: currentStudentId(),
    p_properties: {
      survey_version: SURVEY_VERSION,
      path: window.location.pathname,
      viewport_width: window.innerWidth,
      viewport_height: window.innerHeight,
      ...properties,
    },
  };

  const send = async () => {
    await ensureAnalyticsAuth();
    const { error } = await supabase.rpc('log_moca_survey_event', payload);
    if (error) throw error;
  };

  try {
    await send();
  } catch (firstError) {
    authPromise = null;
    window.setTimeout(() => {
      send().catch((secondError) => console.warn('MOCA analytics log failed', { eventName, firstError, secondError }));
    }, 250);
  }
}

function selectedRankings() {
  return [...document.querySelectorAll('.step3-rank-screen .instagram-post-card.is-ranked')]
    .map((button) => {
      const label = button.getAttribute('aria-label') || '';
      const match = label.match(/게시물\s*(\d+)/);
      return match ? `P3-${String(match[1]).padStart(2, '0')}` : null;
    })
    .filter(Boolean);
}

async function confirmSubmitSuccess(studentId) {
  if (!studentId || !supabase) return;
  await ensureAnalyticsAuth().catch(() => null);
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const { data, error } = await supabase.rpc('get_own_moca_survey_status', { p_student_id: studentId });
    if (!error && data === 'completed') {
      await logEvent('survey_submit_success', 'result');
      return;
    }
    await new Promise((resolve) => window.setTimeout(resolve, 500));
  }
}

function onPageChanged(page, previousPage) {
  logEvent('page_view', page).catch(() => {});

  if (previousPage === 'review' && page === 'part1') {
    logEvent('survey_started', 'part1').catch(() => {});
  }
  if (previousPage === 'part1' && page === 'part2') {
    logEvent('part1_completed', 'part1').catch(() => {});
  }
  if (['part2', 'compare'].includes(previousPage) && page === 'step3Loading') {
    logEvent('part2_completed', 'part2').catch(() => {});
    logEvent('step3_started', 'step3Loading').catch(() => {});
  }
  if (previousPage === 'step3Rank' && page === 'step3Modal') {
    logEvent('step3_rank_completed', 'step3Rank', { rankings: selectedRankings() }).catch(() => {});
  }
  if (previousPage === 'step3Modal' && page === 'step3Compare') {
    logEvent('step3_compare_started', 'step3Modal').catch(() => {});
  }
  if (previousPage === 'step3Compare' && page === 'resultLoading') {
    logEvent('submit_cta_click', 'step3Compare').catch(() => {});
  }
  if (previousPage === 'resultLoading' && page === 'result') {
    logEvent('result_view', 'result').catch(() => {});
    confirmSubmitSuccess(currentStudentId()).catch(() => {});
  }
}

function scanPage() {
  const page = detectPage();
  if (!page || page === lastPage) return;
  const previousPage = lastPage;
  lastPage = page;
  onPageChanged(page, previousPage);
}

function installListeners() {
  if (started || typeof document === 'undefined') return;
  started = true;

  logEvent('survey_entry', 'start').catch(() => {});

  document.addEventListener('click', (event) => {
    const button = event.target.closest('button');
    if (!button) return;
    const page = detectPage();
    const text = (button.textContent || '').replace(/\s+/g, ' ').trim();

    if (page === 'start' && text.includes('시작하기')) {
      logEvent('start_cta_click', 'start').catch(() => {});
    }
    if (page === 'review' && button.classList.contains('review-cta')) {
      logEvent('identity_confirm_cta_click', 'review').catch(() => {});
    }
    if (page === 'result' && button.classList.contains('result-share')) {
      logEvent('result_share_click', 'result').catch(() => {});
    }
    if (page === 'result' && button.closest('.offline-block')) {
      logEvent('offline_guide_cta_click', 'result').catch(() => {});
    }
    if (page === 'already' && text.includes('오프라인')) {
      logEvent('offline_guide_cta_click', 'already').catch(() => {});
    }
  }, true);

  document.addEventListener('change', (event) => {
    const input = event.target;
    if (input?.matches?.('input[type="file"]') && input.files?.length) {
      logEvent('mobile_id_selected', 'upload').catch(() => {});
    }
  }, true);

  const root = document.getElementById('root');
  if (root) {
    const observer = new MutationObserver(() => window.requestAnimationFrame(scanPage));
    observer.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
  }

  window.requestAnimationFrame(scanPage);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', installListeners, { once: true });
} else {
  installListeners();
}
