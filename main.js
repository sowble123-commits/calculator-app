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

// 3. 디스플레이 화면 업데이트
let currentExpression = '';

function updateExpressionDisplay() {
  if (!currentExpression) {
    exprDisplay.textContent = '';
    return;
  }
  exprDisplay.textContent = currentExpression;
  // 식이 칸에 다 안 들어가면 최근에 친 뒷부분이 보이고 앞쪽이 …로 줄어든다
  if (exprDisplay.scrollWidth > exprDisplay.clientWidth) {
    let truncated = currentExpression;
    while (truncated.length > 2 && exprDisplay.scrollWidth > exprDisplay.clientWidth) {
      truncated = truncated.slice(1);
      exprDisplay.textContent = '…' + truncated.trimStart();
    }
  }
}

window.addEventListener('resize', updateExpressionDisplay);

function updateDisplay(state) {
  const text = state.display;
  resultDisplay.textContent = text;
  historyHeaderVal.textContent = text;

  currentExpression = state.expression;
  updateExpressionDisplay();

  // 글자 수에 따른 폰트 크기 자동 조절
  resultDisplay.classList.remove('long-text', 'very-long-text', 'error-text');
  if (state.error) {
    resultDisplay.classList.add('error-text');
  } else if (text.length > 13) {
    resultDisplay.classList.add('very-long-text');
  } else if (text.length > 9) {
    resultDisplay.classList.add('long-text');
  }

  // 메모리 인디케이터
  memoryIndicator.style.display = state.hasMemory ? 'block' : 'none';

  // 새 기록 생성 시 자동 저장
  if (state.record) {
    historyMgr.add(state.record);
    if (isHistoryOpen) {
      renderHistoryList();
    }
  }
}

// 4. 키패드 단추 클릭 이벤트
keypad.addEventListener('click', (e) => {
  const btn = e.target.closest('.calc-btn');
  if (!btn) return;

  const key = btn.dataset.key;
  if (!key) return;

  triggerVibrate(10);
  const state = calc.press(key);

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
    const state = calc.press(mappedKey);
    updateDisplay(state);
  }
});

// 6. 결과 숫자 길게 누르기 (0.5초 복사)
let longPressTimer = null;
let longPressTriggered = false;

function startLongPress() {
  longPressTriggered = false;
  longPressTimer = setTimeout(() => {
    longPressTriggered = true;
    triggerVibrate(20);
    const rawVal = resultDisplay.textContent.replace(/,/g, '');
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
  historyHeaderVal.textContent = resultDisplay.textContent;
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

// 검수 및 테스트 편의를 위한 내부 API 노출
window.__calc = {
  calc,
  historyMgr,
  openHistoryPanel,
  closeHistoryPanel,
  renderHistoryList,
  openNoteModal,
  updateDisplay
};

