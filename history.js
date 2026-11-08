// app/history.js
// 계산 기록 관리 모듈

export const STORAGE_KEY_HISTORY = 'calc.history.v1';
export const STORAGE_KEY_MEMORY = 'calc.memory.v1';
export const MAX_HISTORY_COUNT = 500;

/**
 * 날짜 포맷 함수:
 * - 올해: '11월 7일 오후 6:25'
 * - 올해 아님: '2025년 11월 7일 오후 6:25'
 */
export function formatHistoryTime(isoString, now = new Date()) {
  const d = new Date(isoString);
  if (isNaN(d.getTime())) return '';

  const isSameYear = d.getFullYear() === now.getFullYear();
  const month = d.getMonth() + 1;
  const day = d.getDate();

  let hours = d.getHours();
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const period = hours < 12 ? '오전' : '오후';

  if (hours === 0) hours = 12;
  else if (hours > 12) hours -= 12;

  const timePart = `${period} ${hours}:${minutes}`;
  const datePart = `${month}월 ${day}일`;

  if (isSameYear) {
    return `${datePart} ${timePart}`;
  }
  return `${d.getFullYear()}년 ${datePart} ${timePart}`;
}

/**
 * 히스토리 매니저 생성
 */
export function createHistoryManager(storage = globalThis.localStorage) {
  let isAvailable = true;
  let inMemoryHistory = [];
  let deletedItemBackup = null; // 최근 삭제 항목 (되돌리기용)

  // 저장소 사용 가능 여부 확인
  function testStorage() {
    if (!storage) return false;
    try {
      const testKey = '__calc_test__';
      storage.setItem(testKey, '1');
      storage.removeItem(testKey);
      return true;
    } catch (e) {
      return false;
    }
  }

  isAvailable = testStorage();

  // 초기 로드
  function loadHistory() {
    if (!isAvailable) {
      return inMemoryHistory;
    }
    try {
      const raw = storage.getItem(STORAGE_KEY_HISTORY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.slice(0, MAX_HISTORY_COUNT);
      }
      return [];
    } catch (e) {
      // 깨진 저장 글: 비우고 저장소 복구
      try {
        storage.setItem(STORAGE_KEY_HISTORY, JSON.stringify([]));
      } catch (_) {}
      return [];
    }
  }

  function saveHistory(list) {
    const trimmed = list.slice(0, MAX_HISTORY_COUNT);
    if (!isAvailable) {
      inMemoryHistory = trimmed;
      return;
    }
    try {
      storage.setItem(STORAGE_KEY_HISTORY, JSON.stringify(trimmed));
    } catch (e) {
      isAvailable = false;
      inMemoryHistory = trimmed;
    }
  }

  return {
    isStorageAvailable: () => isAvailable,

    getAll: () => loadHistory(),

    add: (record) => {
      const list = loadHistory();
      // 최신 것이 맨 앞에 오도록
      const newItem = {
        id: record.id || 'rec_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
        time: record.time || new Date().toISOString(),
        expr: record.expr,
        result: record.result,
        rawValue: record.rawValue,
        note: record.note || ''
      };
      const updated = [newItem, ...list].slice(0, MAX_HISTORY_COUNT);
      saveHistory(updated);
      return newItem;
    },

    updateNote: (id, noteText) => {
      const list = loadHistory();
      const updated = list.map(item => {
        if (item.id === id) {
          return { ...item, note: (noteText || '').trim().slice(0, 50) };
        }
        return item;
      });
      saveHistory(updated);
      return updated;
    },

    deleteItem: (id) => {
      const list = loadHistory();
      const targetIndex = list.findIndex(item => item.id === id);
      if (targetIndex !== -1) {
        deletedItemBackup = { item: list[targetIndex], index: targetIndex };
        const updated = list.filter(item => item.id !== id);
        saveHistory(updated);
        return true;
      }
      return false;
    },

    undoDelete: () => {
      if (!deletedItemBackup) return false;
      const list = loadHistory();
      const { item, index } = deletedItemBackup;
      const updated = [...list];
      updated.splice(index, 0, item);
      saveHistory(updated.slice(0, MAX_HISTORY_COUNT));
      deletedItemBackup = null;
      return true;
    },

    clearDeletedBackup: () => {
      deletedItemBackup = null;
    },

    clearAll: () => {
      deletedItemBackup = null;
      saveHistory([]);
    }
  };
}
