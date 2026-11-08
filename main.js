// app/main.js
import { createCalculator } from './calc.js';
import { createHistoryManager, formatHistoryTime } from './history.js';

// DOM 요소 참조
const resultDisplay = document.getElementById('resultDisplay');
const exprDisplay = document.getElementById('exprDisplay');
const memoryIndicator = document.getElementById('memoryIndicator');
const displayArea = document.getElementById('displayArea');
const keypad = document.getElementById('keypad');
const storageWarning = document.getElementById('storageWarning');

// 히스토리 패널 관련
const historyPanel = document.getElementById('historyPanel');
const historyBtn = document.getElementById('historyBtn');
const closeHistoryBtn = document.getElementById('closeHistoryBtn');
const clearHistoryBtn = document.getElementById('clearHistoryBtn');
const historyList = document.getElementById('historyList');
const historyEmpty = document.getElementById('historyEmpty');
const historyHeaderVal = document.getElementById('historyHeaderVal');

// 더보기 메뉴 및 모달
const moreMenuBackdrop = document.getElementById('moreMenuBackdrop');
const moreMenuPopup = document.getElementById('moreMenuPopup');
const menuItemNote = document.getElementById('menuItemNote');
const menuItemCopy = document.getElementById('menuItemCopy');
const menuItemDelete = document.getElementById('menuItemDelete');

const noteModal = document.getElementById('noteModal');
const noteInput = document.getElementById('noteInput');
const noteCharCount = document.getElementById('noteCharCount');
const noteCancelBtn = document.getElementById('noteCancelBtn');
const noteSaveBtn = document.getElementById('noteSaveBtn');

const confirmModal = document.getElementById('confirmModal');
const confirmCancelBtn = document.getElementById('confirmCancelBtn');
const confirmDeleteBtn = document.getElementById('confirmDeleteBtn');

// 토스트
const toastContainer = document.getElementById('toastContainer');
const toastMessage = document.getElementById('toastMessage');
const toastAction = document.getElementById('toastAction');

// 초기화
const calc = createCalculator();
const historyMgr = createHistoryManager();

let currentMenuTargetId = null;
let currentMenuTargetResult = null;
let toastTimeout = null;
let isHistoryOpen = false;

// 1. 저장소 사용 가능 여부 확인
if (!historyMgr.isStorageAvailable()) {
  storageWarning.style.display = 'block';
}

// 2. 햅틱 진동 피드백
function triggerVibrate(ms = 10) {
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(ms);
    }
  } catch (_) {}
}

// 3. 디스플레이 화면 업데이트 및 글자 크기 자동 조절
let lastState = null;
let isResultState = false;
let currentSmallText = '';
let currentIsPreview = false;

function fitResultDisplay(text, isError = false) {
  resultDisplay.textContent = text;

  if (isError) {
    resultDisplay.classList.add('error-text');
  } else {
    resultDisplay.classList.remove('error-text');
  }

  const wrap = resultDisplay.parentElement;
  const availableWidth = wrap.clientWidth;
  const containerHeight = displayArea.clientHeight;

  // 기본 크기는 결과 칸 높이의 절반쯤 (360×780 기준 containerHeight 약 156px, 절반 약 75px. 기존 40px의 1.8배 이상)
  const maxFontSize = isError
    ? Math.min(36, Math.floor(containerHeight * 0.28))
    : Math.min(76, Math.max(56, Math.floor(containerHeight * 0.48)));

  const minFontSize = isError ? 18 : 22;

  // 이진 탐색으로 렌더링된 너비가 가용 너비 안에 들어오는 최대 폰트 크기 계산
  let low = minFontSize;
  let high = maxFontSize;
  let bestFit = minFontSize;

  while (low <= high) {
    let mid = Math.floor((low + high) / 2);
    resultDisplay.style.fontSize = mid + 'px';
    if (resultDisplay.scrollWidth <= availableWidth) {
      bestFit = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  resultDisplay.style.fontSize = bestFit + 'px';

  // 가장 작은 크기에서도 넘치면 앞을 '…'로 줄이고 뒷부분이 보인다
  if (resultDisplay.scrollWidth > availableWidth) {
    resultDisplay.style.fontSize = minFontSize + 'px';
    let truncated = text;
    while (truncated.length > 2 && resultDisplay.scrollWidth > availableWidth) {
      truncated = truncated.slice(1);
      resultDisplay.textContent = '…' + truncated.trimStart();
    }
  }
}

function updateSmallLine(text, isPreview = false) {
  currentSmallText = text || '';
  currentIsPreview = isPreview;

  if (!currentSmallText) {
    exprDisplay.textContent = '';
    return;
  }

  if (isPreview) {
    exprDisplay.classList.add('preview-text');
  } else {
    exprDisplay.classList.remove('preview-text');
  }

  exprDisplay.textContent = currentSmallText;
  const wrap = exprDisplay.parentElement;
  const availableWidth = wrap.clientWidth;

  if (exprDisplay.scrollWidth > availableWidth) {
    let truncated = currentSmallText;
    while (truncated.length > 2 && exprDisplay.scrollWidth > availableWidth) {
      truncated = truncated.slice(1);
      exprDisplay.textContent = '…' + truncated.trimStart();
    }
  }
}

function getCurrentEvaluatedValue(withoutCommas = false) {
  if (!lastState) return withoutCommas ? '0' : '0';
  if (lastState.error) return lastState.error;

  let val;
  if (isResultState) {
    val = lastState.display;
  } else if (lastState.preview) {
    val = lastState.preview;
  } else {
    val = lastState.display;
  }

  return withoutCommas ? val.replace(/,/g, '') : val;
}

function updateDisplay(state) {
  lastState = state;
  const isErr = !!state.error;

  if (isErr) {
    isResultState = false;
    // 오류: 큰 줄에 오류 글, 작은 줄에 그 식
    fitResultDisplay(state.error, true);
    updateSmallLine(state.expression, false);
  } else if (isResultState) {
    // = (또는 % 확정) 뒤: 큰 줄 = 결과, 작은 줄 = 식과 = (50 × 50 =)
    fitResultDisplay(state.display, false);
    let exprText = state.expression;
    if (exprText && !exprText.endsWith('=')) {
      exprText += ' =';
    }
    updateSmallLine(exprText, false);
  } else {
    // 치는 중: 큰 줄 = liveExpression. 작은 줄 = preview가 있으면 = 2,500(흐린 글씨), 없으면 빈칸
    fitResultDisplay(state.liveExpression || state.display, false);
    if (state.preview) {
      updateSmallLine(`= ${state.preview}`, true);
    } else {
      updateSmallLine('', false);
    }
  }

  // 메모리 인디케이터
  memoryIndicator.style.display = state.hasMemory ? 'block' : 'none';

  // 기록 펼침 맨 위 숫자: 큰 줄 글이 아니라 같은 규칙의 값
  historyHeaderVal.textContent = getCurrentEvaluatedValue(false);

  // 새 기록 생성 시 자동 저장
  if (state.record) {
    historyMgr.add(state.record);
    if (isHistoryOpen) {
      renderHistoryList();
    }
  }
}

function handleResize() {
  if (lastState) {
    updateDisplay(lastState);
  }
}
window.addEventListener('resize', handleResize);

function handleInputKey(key) {
  if (key === '=' || key === 'Enter' || key === '%') {
    isResultState = true;
  } else if (key === 'C' || key === 'c') {
    isResultState = false;
  } else if (isResultState) {
    if (key === '+/-' || key === '±') {
      // 결과 상태 유지
    } else {
      isResultState = false;
    }
  }

  const state = calc.press(key);
  if (state.error) {
    isResultState = false;
  }
  return state;
}

// 4. 키패드 단추 클릭 이벤트
keypad.addEventListener('click', (e) => {
  const btn = e.target.closest('.calc-btn');
  if (!btn) return;

  const key = btn.dataset.key;
  if (!key) return;

  triggerVibrate(10);
  const state = handleInputKey(key);

  if (state.ignored) {
    // 15자리 초과 등으로 무시된 경우 짧게 진동
    triggerVibrate(15);
  }

  updateDisplay(state);
});

// 5. 키보드 지원 (접근성 및 편의)
window.addEventListener('keydown', (e) => {
  // 모달이 열려있을 때는 키보드 입력 무시
  if (noteModal.style.display === 'flex' || confirmModal.style.display === 'flex') {
    return;
  }

  let mappedKey = null;
  if (/^[0-9]$/.test(e.key)) mappedKey = e.key;
  else if (e.key === '.') mappedKey = '.';
  else if (e.key === '+') mappedKey = '+';
  else if (e.key === '-') mappedKey = '−';
  else if (e.key === '*' || e.key === 'x') mappedKey = '×';
  else if (e.key === '/') mappedKey = '÷';
  else if (e.key === '=' || e.key === 'Enter') mappedKey = '=';
  else if (e.key === '%') mappedKey = '%';
  else if (e.key === 'Backspace') mappedKey = '⌫';
  else if (e.key === 'Escape' || e.key === 'c' || e.key === 'C') mappedKey = 'C';

  if (mappedKey) {
    e.preventDefault();
    triggerVibrate(10);
    const state = handleInputKey(mappedKey);
    updateDisplay(state);
  }
});

// 6. 결과 숫자 길게 누르기 (0.5초 복사: = 뒤면 결과, 치는 중이면 미리 결과가 있을 때 그 값, 없으면 지금 치던 숫자 쉼표 없이)
let longPressTimer = null;
let longPressTriggered = false;

function startLongPress() {
  longPressTriggered = false;
  longPressTimer = setTimeout(() => {
    longPressTriggered = true;
    triggerVibrate(20);
    const rawVal = getCurrentEvaluatedValue(true);
    copyToClipboard(rawVal);
  }, 500);
}

function cancelLongPress() {
  if (longPressTimer) {
    clearTimeout(longPressTimer);
    longPressTimer = null;
  }
}

resultDisplay.addEventListener('pointerdown', startLongPress);
resultDisplay.addEventListener('pointerup', cancelLongPress);
resultDisplay.addEventListener('pointercancel', cancelLongPress);
resultDisplay.addEventListener('pointerleave', cancelLongPress);

// 7. 클립보드 복사 헬퍼
function copyToClipboard(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(() => {
      showToast('복사했습니다');
    }).catch(() => {
      fallbackCopy(text);
    });
  } else {
    fallbackCopy(text);
  }
}

function fallbackCopy(text) {
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const success = document.execCommand('copy');
    document.body.removeChild(ta);
    if (success) {
      showToast('복사했습니다');
    } else {
      showToast('복사하지 못했습니다');
    }
  } catch (_) {
    showToast('복사하지 못했습니다');
  }
}

// 8. 토스트 메시지
function showToast(message, actionLabel = null, onAction = null, duration = 2000) {
  if (toastTimeout) {
    clearTimeout(toastTimeout);
    toastTimeout = null;
  }

  toastMessage.textContent = message;

  if (actionLabel && onAction) {
    toastAction.textContent = actionLabel;
    toastAction.style.display = 'inline-block';
    toastAction.onclick = () => {
      onAction();
      hideToast();
    };
  } else {
    toastAction.style.display = 'none';
    toastAction.onclick = null;
  }

  toastContainer.style.display = 'flex';

  toastTimeout = setTimeout(() => {
    hideToast();
  }, duration);
}

function hideToast() {
  toastContainer.style.display = 'none';
  if (toastTimeout) {
    clearTimeout(toastTimeout);
    toastTimeout = null;
  }
}

// 9. 기록 패널 열기 / 닫기
function openHistoryPanel() {
  if (isHistoryOpen) return;
  isHistoryOpen = true;
  historyPanel.classList.add('open');
  historyHeaderVal.textContent = getCurrentEvaluatedValue(false);
  renderHistoryList();

  // 브라우저 뒤로 가기 연동
  window.history.pushState({ panel: 'history' }, '');
}

function closeHistoryPanel() {
  if (!isHistoryOpen) return;
  isHistoryOpen = false;
  historyPanel.classList.remove('open');
  closeMoreMenu();

  if (window.history.state && window.history.state.panel === 'history') {
    window.history.back();
  }
}

// 디스플레이 영역 클릭 또는 아래로 스와이프 시 기록 열기
historyBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  openHistoryPanel();
});

closeHistoryBtn.addEventListener('click', () => {
  closeHistoryPanel();
});

// 아래로 드래그 제스처
let touchStartY = 0;
displayArea.addEventListener('touchstart', (e) => {
  touchStartY = e.touches[0].clientY;
}, { passive: true });

displayArea.addEventListener('touchend', (e) => {
  const touchEndY = e.changedTouches[0].clientY;
  if (touchEndY - touchStartY > 40) {
    openHistoryPanel();
  }
}, { passive: true });

// 뒤로가기 이벤트
window.addEventListener('popstate', (e) => {
  if (isHistoryOpen) {
    isHistoryOpen = false;
    historyPanel.classList.remove('open');
    closeMoreMenu();
  }
});

// 10. 기록 목록 렌더링
function renderHistoryList() {
  const items = historyMgr.getAll();
  historyList.innerHTML = '';

  if (items.length === 0) {
    historyEmpty.style.display = 'flex';
    clearHistoryBtn.disabled = true;
    return;
  }

  historyEmpty.style.display = 'none';
  clearHistoryBtn.disabled = false;

  const now = new Date();
  items.forEach((item) => {
    const card = document.createElement('div');
    card.className = 'history-card';
    card.dataset.id = item.id;
    card.dataset.raw = item.rawValue;

    const timeStr = formatHistoryTime(item.time, now);

    card.innerHTML = `
      <div class="card-top-row">
        <span class="card-date">${timeStr}</span>
        <div class="card-actions">
          ${item.note ? `<span class="card-note-icon" title="메모 있음">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
            </svg>
          </span>` : ''}
          <button type="button" class="card-more-btn" aria-label="더보기" title="더보기">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <circle cx="12" cy="5" r="2"></circle>
              <circle cx="12" cy="12" r="2"></circle>
              <circle cx="12" cy="19" r="2"></circle>
            </svg>
          </button>
        </div>
      </div>
      ${item.note ? `<div class="card-note-text">${escapeHtml(item.note)}</div>` : ''}
      <div class="card-expr">${item.expr}</div>
      <hr class="card-divider">
      <div class="card-result">= ${item.result}</div>
    `;

    // 카드 클릭 시: 해당 결과 불러와 이어서 계산하고 기록 닫기
    card.addEventListener('click', (e) => {
      if (e.target.closest('.card-more-btn')) return;
      const raw = card.dataset.raw;
      isResultState = true;
      const state = calc.load(raw);
      updateDisplay(state);
      closeHistoryPanel();
    });

    // 더보기 버튼 클릭
    const moreBtn = card.querySelector('.card-more-btn');
    moreBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      openMoreMenu(moreBtn, item.id, item.result, item.note);
    });

    historyList.appendChild(card);
  });
}

function escapeHtml(str) {
  return str.replace(/[&<>'"]/g, 
    tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
  );
}

// 11. 더보기 컨텍스트 팝업 메뉴
function openMoreMenu(anchorBtn, itemId, itemResult, itemNote) {
  currentMenuTargetId = itemId;
  currentMenuTargetResult = itemResult;

  const rect = anchorBtn.getBoundingClientRect();
  moreMenuPopup.style.top = `${rect.bottom + 4}px`;
  moreMenuPopup.style.right = `${window.innerWidth - rect.right}px`;

  moreMenuPopup.style.display = 'block';
  moreMenuBackdrop.style.display = 'block';
}

function closeMoreMenu() {
  moreMenuPopup.style.display = 'none';
  moreMenuBackdrop.style.display = 'none';
  currentMenuTargetId = null;
  currentMenuTargetResult = null;
}

moreMenuBackdrop.addEventListener('click', closeMoreMenu);

// 더보기 - 복사
menuItemCopy.addEventListener('click', () => {
  if (currentMenuTargetResult) {
    const raw = currentMenuTargetResult.replace(/,/g, '');
    copyToClipboard(raw);
  }
  closeMoreMenu();
});

// 더보기 - 삭제
menuItemDelete.addEventListener('click', () => {
  const targetId = currentMenuTargetId;
  closeMoreMenu();
  if (!targetId) return;

  historyMgr.deleteItem(targetId);
  renderHistoryList();

  // 토스트 및 5초 되돌리기
  showToast('삭제했습니다', '되돌리기', () => {
    historyMgr.undoDelete();
    renderHistoryList();
  }, 5000);
});

// 더보기 - 메모
menuItemNote.addEventListener('click', () => {
  const targetId = currentMenuTargetId;
  closeMoreMenu();
  if (!targetId) return;

  const item = historyMgr.getAll().find(i => i.id === targetId);
  openNoteModal(targetId, item ? item.note : '');
});

// 12. 메모 모달 창
let editingNoteItemId = null;

function openNoteModal(itemId, initialNote = '') {
  editingNoteItemId = itemId;
  noteInput.value = initialNote;
  noteCharCount.textContent = initialNote.length;
  noteModal.style.display = 'flex';
  noteInput.focus();
}

function closeNoteModal() {
  noteModal.style.display = 'none';
  editingNoteItemId = null;
}

noteInput.addEventListener('input', () => {
  noteCharCount.textContent = noteInput.value.length;
});

noteCancelBtn.addEventListener('click', closeNoteModal);

noteSaveBtn.addEventListener('click', () => {
  if (editingNoteItemId) {
    const noteText = noteInput.value;
    historyMgr.updateNote(editingNoteItemId, noteText);
    renderHistoryList();
  }
  closeNoteModal();
});

// 13. 전체 지우기 모달
clearHistoryBtn.addEventListener('click', () => {
  if (historyMgr.getAll().length === 0) return;
  confirmModal.style.display = 'flex';
});

confirmCancelBtn.addEventListener('click', () => {
  confirmModal.style.display = 'none';
});

confirmDeleteBtn.addEventListener('click', () => {
  historyMgr.clearAll();
  confirmModal.style.display = 'none';
  renderHistoryList();
});

// 14. 서비스 워커 등록 (PWA 오프라인 지원)
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch((err) => {
      // 오프라인이거나 지원하지 않는 환경에서도 계산기는 정상 동작
    });
  });
}

// 초기 디스플레이 설정
const initialState = calc.press('');
updateDisplay(initialState);

// 검수 및 테스트 편의를 위한 내부 API 노출
window.__calc = {
  calc,
  historyMgr,
  openHistoryPanel,
  closeHistoryPanel,
  renderHistoryList,
  openNoteModal,
  updateDisplay,
  fitResultDisplay,
  handleInputKey,
  getState: () => lastState,
  getIsResult: () => isResultState
};

