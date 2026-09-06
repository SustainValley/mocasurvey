const OFFLINE_STEPS = [
  ['온라인 설문 완료', '9/7(월)~9/10(목) 온라인에서 나만의 카페 취향 유형을 찾아주세요.'],
  ['부스 방문', '9/10(목) 10:00~18:00, 서울여대 누리관 지하 1층 CAFE MOCA로 와주세요.'],
  ['학번 확인', '결과 화면은 필요 없어요. 운영진에게 학번만 말해주세요.'],
  ['현장 체험 & 리워드', '팝업 콘텐츠를 즐기고 스페셜 기프트와 럭키드로우까지 참여해보세요.'],
];

function setText(node, value) {
  if (node && node.textContent !== value) node.textContent = value;
}

function setHtml(node, value) {
  if (node && node.innerHTML !== value) node.innerHTML = value;
}

function applyOfflineParticipationCopy() {
  const resultBlock = document.querySelector('.offline-block');
  if (resultBlock) {
    setHtml(resultBlock.querySelector('h3'), '취향 찾았다면,<br>이제 선물 받으러 와요.');
    setText(
      resultBlock.querySelector('span'),
      '9/10(목) CAFE MOCA 오프라인 팝업에서 학번만 말하면 바로 참여할 수 있어요.'
    );
    setText(resultBlock.querySelector('button'), '오프라인 부스 참여 방법 보기  →');
  }

  const guide = document.querySelector('.offline-guide-page');
  if (!guide) return;

  setHtml(
    guide.querySelector('.offline-guide-desc'),
    '온라인 설문을 완료했다면 9/10 현장에서<br>학번만 말해주세요. 결과 화면은 필요 없어요.'
  );

  const eventValues = guide.querySelectorAll('.event-info-card dd');
  setText(eventValues[0], '2026. 09. 10. (목)');
  setText(eventValues[1], '10:00 ~ 18:00');
  setText(eventValues[2], '서울여자대학교 누리관 지하 1층');
  setText(
    guide.querySelector('.event-info-card > p'),
    '※ 부스 참여자 전원 스페셜 기프트 증정 · 럭키드로우 참여 가능'
  );

  const stepNodes = guide.querySelectorAll('.join-step');
  OFFLINE_STEPS.forEach(([title, description], index) => {
    const node = stepNodes[index];
    if (!node) return;
    setText(node.querySelector('strong'), title);
    setText(node.querySelector('span'), description);
  });

  setText(
    guide.querySelector('.offline-note'),
    '온라인 설문 완료 여부는 학번으로 확인해요 · 결과 화면이나 캡처본은 보여주지 않아도 돼요.'
  );
}

const observer = new MutationObserver(applyOfflineParticipationCopy);
observer.observe(document.documentElement, { childList: true, subtree: true });
applyOfflineParticipationCopy();
