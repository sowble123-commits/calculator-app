// app/calc.js
// 순수 계산기 모듈 (화면과 분리, 브라우저와 Node.js 양쪽에서 동작)

/**
 * 임의 정밀도 십진수 연산 클래스
 * m: BigInt (계수)
 * s: number (소수점 자릿수 / scale, 10^-s)
 */
export class Decimal {
  constructor(m, s = 0) {
    let bm = BigInt(m);
    let bs = Number(s);
    if (bm === 0n) {
      this.m = 0n;
      this.s = 0;
      return;
    }
    // 끝 0 압축 (단, scale이 0보다 클 때만)
    while (bs > 0 && bm % 10n === 0n) {
      bm /= 10n;
      bs--;
    }
    this.m = bm;
    this.s = bs;
  }

  static get ZERO() {
    return new Decimal(0n, 0);
  }

  static get ONE() {
    return new Decimal(1n, 0);
  }

  static fromString(str) {
    if (!str || typeof str !== 'string') return Decimal.ZERO;
    let s = str.trim().replace(/,/g, '');
    if (s === '' || s === '-' || s === '.') return Decimal.ZERO;

    let negative = false;
    if (s.startsWith('-') || s.startsWith('−')) {
      negative = true;
      s = s.slice(1);
    }

    let parts = s.split('.');
    let intPart = parts[0] || '0';
    let fracPart = parts[1] || '';

    // fracPart 끝의 0은 유지하며 scale 계산
    let scale = fracPart.length;
    let combined = intPart + fracPart;
    if (combined === '' || combined === '0') return Decimal.ZERO;

    let m = BigInt(combined);
    if (negative) m = -m;
    return new Decimal(m, scale);
  }

  isZero() {
    return this.m === 0n;
  }

  isNegative() {
    return this.m < 0n;
  }

  negate() {
    return new Decimal(-this.m, this.s);
  }

  add(other) {
    const o = other instanceof Decimal ? other : Decimal.fromString(String(other));
    const maxS = Math.max(this.s, o.s);
    const m1 = this.m * (10n ** BigInt(maxS - this.s));
    const m2 = o.m * (10n ** BigInt(maxS - o.s));
    return new Decimal(m1 + m2, maxS);
  }

  sub(other) {
    const o = other instanceof Decimal ? other : Decimal.fromString(String(other));
    const maxS = Math.max(this.s, o.s);
    const m1 = this.m * (10n ** BigInt(maxS - this.s));
    const m2 = o.m * (10n ** BigInt(maxS - o.s));
    return new Decimal(m1 - m2, maxS);
  }

  mul(other) {
    const o = other instanceof Decimal ? other : Decimal.fromString(String(other));
    return new Decimal(this.m * o.m, this.s + o.s);
  }

  div(other, precision = 35) {
    const o = other instanceof Decimal ? other : Decimal.fromString(String(other));
    if (o.m === 0n) {
      throw new Error('0으로 나눌 수 없습니다');
    }
    // targetScale: 넉넉한 정밀도로 나눈 뒤 반올림
    const targetScale = precision;
    const shift = BigInt(targetScale + o.s - this.s);
    let num = this.m;
    let den = o.m;
    let isNeg = (num < 0n) !== (den < 0n);
    if (num < 0n) num = -num;
    if (den < 0n) den = -den;

    let scaledNum = num * (10n ** shift);
    let quotient = scaledNum / den;
    let remainder = scaledNum % den;

    // half-up 반올림
    if (remainder * 2n >= den) {
      quotient += 1n;
    }
    if (isNeg) quotient = -quotient;

    return new Decimal(quotient, targetScale);
  }

  toString() {
    if (this.m === 0n) return '0';
    let sign = this.m < 0n ? '-' : '';
    let absM = this.m < 0n ? -this.m : this.m;
    let s = absM.toString();

    if (this.s === 0) {
      return sign + s;
    }

    if (s.length <= this.s) {
      s = s.padStart(this.s + 1, '0');
    }

    let intPart = s.slice(0, s.length - this.s);
    let fracPart = s.slice(s.length - this.s);
    // 끝 0 제거
    fracPart = fracPart.replace(/0+$/, '');
    if (fracPart.length === 0) return sign + intPart;
    return sign + intPart + '.' + fracPart;
  }
}

/**
 * 천 단위 쉼표 추가 헬퍼
 */
export function addCommas(numStr) {
  return numStr.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/**
 * 지시서 보이기 규칙에 따른 숫자 포맷터
 * - 정수부는 세 자리 쉼표
 * - 정수부와 소수부를 합쳐 12자리가 넘으면 소수부를 반올림해 12자리에 맞추고, 소수 끝 0은 지운다.
 *   (13 ÷ 6 → 2.16666666667, 1 ÷ 3 → 0.333333333333)
 * - 정수부가 12자리를 넘으면 소수부 없이 정수부만(15자리까지).
 * - 정수부가 15자리를 넘으면 오류 '숫자가 너무 큽니다'.
 * - 반올림된 아주 작은 값은 0.
 */
export function formatNumber(val) {
  if (val === null || val === undefined) return '0';
  let dec = val instanceof Decimal ? val : Decimal.fromString(String(val));
  if (dec.isZero()) return '0';

  let isNegative = dec.isNegative();
  let absDec = isNegative ? dec.negate() : dec;

  // 정밀도 넉넉히 문자열로 추출 (소수점 30자리까지)
  let rawStr = absDec.toString();
  let [intStr, fracStr = ''] = rawStr.split('.');

  // 정수부 자릿수
  let intLen = intStr === '0' ? 0 : intStr.length;

  if (intLen > 15) {
    return '숫자가 너무 큽니다';
  }

  let finalInt = intStr;
  let finalFrac = '';

  if (intLen > 12) {
    // 12자리 초과 15자리 이하: 소수부 없이 정수부만 (소수 첫째자리에서 반올림)
    if (fracStr.length > 0 && Number(fracStr[0]) >= 5) {
      let rounded = (BigInt(intStr) + 1n).toString();
      if (rounded.length > 15) return '숫자가 너무 큽니다';
      finalInt = rounded;
    }
    finalFrac = '';
  } else if (intLen === 0) {
    // 0.xxxx 형태: 소수부는 최대 12자리까지
    if (fracStr.length > 12) {
      let targetFrac = fracStr.slice(0, 12);
      let nextDigit = Number(fracStr[12]);
      if (nextDigit >= 5) {
        let rounded = (BigInt(targetFrac) + 1n).toString();
        if (rounded.length > 12) {
          // 예: 0.9999999999999 -> 1
          finalInt = '1';
          finalFrac = '';
        } else {
          finalFrac = rounded.padStart(12, '0');
        }
      } else {
        finalFrac = targetFrac;
      }
    } else {
      finalFrac = fracStr;
    }
  } else {
    // 1 <= intLen <= 12
    let maxFracDigits = 12 - intLen;
    if (maxFracDigits === 0) {
      // 정확히 12자리 정수부
      if (fracStr.length > 0 && Number(fracStr[0]) >= 5) {
        let rounded = (BigInt(intStr) + 1n).toString();
        finalInt = rounded;
      }
      finalFrac = '';
    } else if (fracStr.length > maxFracDigits) {
      let targetFrac = fracStr.slice(0, maxFracDigits);
      let nextDigit = Number(fracStr[maxFracDigits]);
      if (nextDigit >= 5) {
        let rounded = (BigInt(targetFrac) + 1n).toString();
        if (rounded.length > maxFracDigits) {
          // 소수부에서 올림되어 정수부 증가
          finalInt = (BigInt(intStr) + 1n).toString();
          finalFrac = '';
        } else {
          finalFrac = rounded.padStart(maxFracDigits, '0');
        }
      } else {
        finalFrac = targetFrac;
      }
    } else {
      finalFrac = fracStr;
    }
  }

  // 소수 끝 0 제거
  finalFrac = finalFrac.replace(/0+$/, '');

  // 0 판정 (반올림된 아주 작은 값은 0)
  if ((finalInt === '0' || finalInt === '') && finalFrac === '') {
    return '0';
  }

  let formattedInt = addCommas(finalInt || '0');
  let result = finalFrac ? `${formattedInt}.${finalFrac}` : formattedInt;
  return isNegative ? `−${result}` : result;
}

/**
 * 입력 중인 문자열을 디스플레이용으로 포맷팅 (쉼표 추가, 끝 소수점 및 끝 0 유지)
 */
export function formatInputString(str) {
  if (!str) return '0';
  let isNeg = str.startsWith('-') || str.startsWith('−');
  let clean = isNeg ? str.slice(1) : str;

  let [intPart, fracPart] = clean.split('.');
  let formattedInt = addCommas(intPart || '0');

  let result = formattedInt;
  if (clean.includes('.')) {
    result += '.' + (fracPart !== undefined ? fracPart : '');
  }
  return isNeg ? `−${result}` : result;
}

/**
 * 표준 연산 기호 매핑
 */
function normalizeOp(op) {
  if (op === '*' || op === 'x' || op === 'X') return '×';
  if (op === '/' || op === '÷') return '÷';
  if (op === '-' || op === '−') return '−';
  if (op === '+') return '+';
  return op;
}

/**
 * 계산기 인스턴스 생성
 */
export function createCalculator(initialMemory = 0) {
  let memory = Decimal.fromString(String(initialMemory || 0));
  let currentInput = '0'; // 입력 중인 문자열
  let tokens = []; // [ { type: 'num', value: Decimal, raw: '...' }, { type: 'op', value: '...' } ]
  let isResultState = false; // 방금 = 나 %로 계산 결과가 나온 상태
  let lastResult = Decimal.ZERO;
  let lastOp = null; // 마지막 연산자 (= 반복용)
  let lastOperand = null; // 마지막 피연산자 (= 반복용)
  let error = null;
  let expressionDisplay = '';

  function countDigits(str) {
    return str.replace(/[^0-9]/g, '').length;
  }

  function getExpressionString() {
    if (tokens.length === 0) return '';
    return tokens.map(t => {
      if (t.type === 'op') return t.value;
      return t.raw;
    }).join(' ');
  }

  function evaluateTokens(tokenList) {
    if (tokenList.length === 0) return Decimal.ZERO;

    // 1단계: 복사본 생성
    let list = [...tokenList];

    // 2단계: 곱셈과 나눗셈 먼저 처리 (우측 결합 아닌 좌측 결합)
    let i = 0;
    while (i < list.length) {
      if (list[i].type === 'op' && (list[i].value === '×' || list[i].value === '÷')) {
        let op = list[i].value;
        let left = list[i - 1].value;
        let right = list[i + 1].value;
        let res;
        if (op === '×') {
          res = left.mul(right);
        } else {
          res = left.div(right);
        }
        list.splice(i - 1, 3, { type: 'num', value: res, raw: formatNumber(res) });
        i = i - 1;
      } else {
        i++;
      }
    }

    // 3단계: 덧셈과 뺄셈 처리
    i = 0;
    while (i < list.length) {
      if (list[i].type === 'op' && (list[i].value === '+' || list[i].value === '−')) {
        let op = list[i].value;
        let left = list[i - 1].value;
        let right = list[i + 1].value;
        let res = op === '+' ? left.add(right) : left.sub(right);
        list.splice(i - 1, 3, { type: 'num', value: res, raw: formatNumber(res) });
        i = i - 1;
      } else {
        i++;
      }
    }

    return list[0].value;
  }

  function getState(extra = {}) {
    let display;
    if (error) {
      display = error;
    } else if (isResultState) {
      display = formatNumber(lastResult);
    } else if (currentInput !== '') {
      display = formatInputString(currentInput);
    } else if (tokens.length > 0) {
      // 연산자 누른 직후에는 직전 입력한 숫자를 화면에 유지
      let lastNumToken = [...tokens].reverse().find(t => t.type === 'num');
      display = lastNumToken ? lastNumToken.raw : '0';
    } else {
      display = '0';
    }

    return {
      display,
      expression: expressionDisplay || getExpressionString(),
      memory: memory.toString(),
      hasMemory: !memory.isZero(),
      error,
      ignored: !!extra.ignored,
      record: extra.record || null
    };
  }

  function press(btn) {
    try {
      let key = String(btn).trim();
      let norm = normalizeOp(key);

      // 1. 메모리 단추 처리
      if (key === 'mc') {
        memory = Decimal.ZERO;
        return getState();
      }
      if (key === 'm+' || key === 'm-') {
        let valToApply;
        if (error) return getState();
        if (isResultState) {
          valToApply = lastResult;
        } else if (currentInput !== '') {
          valToApply = Decimal.fromString(currentInput);
        } else if (tokens.length > 0) {
          let lastNumToken = [...tokens].reverse().find(t => t.type === 'num');
          valToApply = lastNumToken ? lastNumToken.value : Decimal.ZERO;
        } else {
          valToApply = Decimal.ZERO;
        }
        if (key === 'm+') {
          memory = memory.add(valToApply);
        } else {
          memory = memory.sub(valToApply);
        }
        return getState();
      }
      if (key === 'mr') {
        if (error) error = null;
        currentInput = memory.toString();
        isResultState = false;
        return getState();
      }

      // 2. 초기화 단추 C
      if (key === 'C' || key === 'c') {
        currentInput = '0';
        tokens = [];
        isResultState = false;
        lastResult = Decimal.ZERO;
        lastOp = null;
        lastOperand = null;
        error = null;
        expressionDisplay = '';
        return getState();
      }

      // 3. 백스페이스 ⌫
      if (key === '⌫' || key === 'Backspace') {
        if (error) return getState();
        if (isResultState) {
          // 결과 나온 뒤에는 아무것도 하지 않음
          return getState();
        }
        if (currentInput.length > 0) {
          let isNeg = currentInput.startsWith('-') || currentInput.startsWith('−');
          let next = currentInput.slice(0, -1);
          if (next === '' || next === '-' || next === '−') {
            currentInput = '0';
          } else {
            currentInput = next;
          }
        }
        return getState();
      }

      // 4. 부호 반전 +/-
      if (key === '+/-' || key === '±') {
        if (error) return getState();
        if (isResultState) {
          lastResult = lastResult.negate();
          currentInput = lastResult.toString();
          isResultState = true;
          return getState();
        }
        if (currentInput === '0' || currentInput === '') {
          return getState();
        }
        if (currentInput.startsWith('-') || currentInput.startsWith('−')) {
          currentInput = currentInput.slice(1);
        } else {
          currentInput = '-' + currentInput;
        }
        return getState();
      }

      // 5. 숫자 0 ~ 9
      if (/^[0-9]$/.test(key)) {
        if (error) {
          // 오류 뒤 숫자를 누르면 새로 시작
          error = null;
          tokens = [];
          expressionDisplay = '';
          currentInput = key;
          isResultState = false;
          return getState();
        }

        if (isResultState) {
          // 결과 나온 뒤 숫자 누르면 새로 시작
          tokens = [];
          expressionDisplay = '';
          currentInput = key;
          isResultState = false;
          return getState();
        }

        // 15자리 제한 (소수점 제외)
        if (countDigits(currentInput) >= 15) {
          return getState({ ignored: true });
        }

        if (currentInput === '0') {
          currentInput = key;
        } else {
          currentInput += key;
        }
        return getState();
      }

      // 6. 소수점 .
      if (key === '.') {
        if (error) {
          error = null;
          tokens = [];
          expressionDisplay = '';
          currentInput = '0.';
          isResultState = false;
          return getState();
        }

        if (isResultState) {
          tokens = [];
          expressionDisplay = '';
          currentInput = '0.';
          isResultState = false;
          return getState();
        }

        if (currentInput.includes('.')) {
          return getState({ ignored: true });
        }

        if (currentInput === '' || currentInput === '0') {
          currentInput = '0.';
        } else {
          currentInput += '.';
        }
        return getState();
      }

      // 7. 퍼센트 %
      if (key === '%') {
        if (error) return getState();

        let currentVal = Decimal.fromString(currentInput || '0');
        let result;
        let exprText = '';

        try {
          if (tokens.length === 0) {
            // 숫자 하나만 있을 때: 50 % → 0.5
            result = currentVal.div(new Decimal(100n, 0));
            exprText = `${formatNumber(currentVal)} %`;
            lastOp = null;
            lastOperand = null;
          } else {
            let lastToken = tokens[tokens.length - 1];
            let op = lastToken.value;
            let baseTokens = tokens.slice(0, -1);
            let baseVal = evaluateTokens(baseTokens);

            if (op === '+' || op === '−') {
              // 200 + 10 % → 220, 200 − 10 % → 180
              // 앞 식 전체의 값(baseVal)의 currentVal%를 더하거나 뺌
              let pctVal = baseVal.mul(currentVal).div(new Decimal(100n, 0));
              result = op === '+' ? baseVal.add(pctVal) : baseVal.sub(pctVal);
              exprText = `${baseTokens.map(t => t.type === 'op' ? t.value : t.raw).join(' ')} ${op} ${formatNumber(currentVal)}%`;
            } else if (op === '×') {
              // 200 × 10 % → 20
              let pctVal = currentVal.div(new Decimal(100n, 0));
              result = baseVal.mul(pctVal);
              exprText = `${baseTokens.map(t => t.type === 'op' ? t.value : t.raw).join(' ')} × ${formatNumber(currentVal)}%`;
            } else if (op === '÷') {
              // 200 ÷ 10 % → 2000
              let pctVal = currentVal.div(new Decimal(100n, 0));
              result = baseVal.div(pctVal);
              exprText = `${baseTokens.map(t => t.type === 'op' ? t.value : t.raw).join(' ')} ÷ ${formatNumber(currentVal)}%`;
            }
          }
        } catch (e) {
          error = e.message;
          let baseTokens = tokens.slice(0, -1);
          let lastToken = tokens[tokens.length - 1];
          let op = lastToken ? lastToken.value : '';
          expressionDisplay = `${baseTokens.map(t => t.type === 'op' ? t.value : t.raw).join(' ')} ${op} ${formatNumber(currentVal)}%`.trim();
          tokens = [];
          currentInput = '';
          return getState();
        }

        lastResult = result;
        let formattedResult = formatNumber(result);
        if (formattedResult === '숫자가 너무 큽니다') {
          error = formattedResult;
          return getState();
        }

        isResultState = true;
        currentInput = '';
        tokens = [];
        expressionDisplay = exprText;

        let record = {
          id: 'rec_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
          time: new Date().toISOString(),
          expr: exprText,
          result: formattedResult,
          rawValue: result.toString(),
          note: ''
        };

        return getState({ record });
      }

      // 8. 연산자 (+, −, ×, ÷)
      if (norm === '+' || norm === '−' || norm === '×' || norm === '÷') {
        if (error) return getState();

        if (isResultState) {
          // 결과가 나온 뒤 연산 단추면 그 결과에 이어서
          tokens = [
            { type: 'num', value: lastResult, raw: formatNumber(lastResult) },
            { type: 'op', value: norm }
          ];
          currentInput = '';
          isResultState = false;
          expressionDisplay = getExpressionString();
          return getState();
        }

        if (currentInput !== '') {
          let dec = Decimal.fromString(currentInput);
          tokens.push({ type: 'num', value: dec, raw: formatNumber(dec) });
          tokens.push({ type: 'op', value: norm });
          currentInput = '';
          expressionDisplay = getExpressionString();
          return getState();
        }

        // currentInput이 빈 상태에서 연산자 누름
        if (tokens.length > 0) {
          // 연산 단추를 연달아 누르면 마지막 것으로 바꾼다
          tokens[tokens.length - 1] = { type: 'op', value: norm };
          expressionDisplay = getExpressionString();
          return getState();
        }

        // 아무것도 안 친 채 연산 단추면 0에서 시작
        tokens.push({ type: 'num', value: Decimal.ZERO, raw: '0' });
        tokens.push({ type: 'op', value: norm });
        currentInput = '';
        expressionDisplay = getExpressionString();
        return getState();
      }

      // 9. 등호 =
      if (key === '=' || key === 'Enter') {
        if (error) return getState();

        if (isResultState) {
          // =를 다시 누르면 마지막 연산과 수를 되풀이: 5 + 3 = = → 11, 2 + 3 × 4 = = → 56
          if (!lastOp || !lastOperand) {
            return getState();
          }
          let exprText = `${formatNumber(lastResult)} ${lastOp} ${formatNumber(lastOperand)}`;
          let newRes;
          try {
            if (lastOp === '+') newRes = lastResult.add(lastOperand);
            else if (lastOp === '−') newRes = lastResult.sub(lastOperand);
            else if (lastOp === '×') newRes = lastResult.mul(lastOperand);
            else if (lastOp === '÷') newRes = lastResult.div(lastOperand);
          } catch (e) {
            error = e.message;
            return getState();
          }

          lastResult = newRes;
          let formattedRes = formatNumber(newRes);
          if (formattedRes === '숫자가 너무 큽니다') {
            error = formattedRes;
            return getState();
          }

          expressionDisplay = exprText;
          let record = {
            id: 'rec_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
            time: new Date().toISOString(),
            expr: exprText,
            result: formattedRes,
            rawValue: newRes.toString(),
            note: ''
          };
          return getState({ record });
        }

        // 진행 중인 식이 있는 경우
        if (tokens.length === 0) {
          // 숫자 하나만 입력하고 = 누른 경우
          let dec = Decimal.fromString(currentInput || '0');
          lastResult = dec;
          let formattedRes = formatNumber(dec);
          isResultState = true;
          expressionDisplay = formattedRes;
          let record = {
            id: 'rec_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
            time: new Date().toISOString(),
            expr: formattedRes,
            result: formattedRes,
            rawValue: dec.toString(),
            note: ''
          };
          return getState({ record });
        }

        // 토큰이 있는 상태
        if (currentInput !== '') {
          let dec = Decimal.fromString(currentInput);
          tokens.push({ type: 'num', value: dec, raw: formatNumber(dec) });
          currentInput = '';
        } else if (tokens[tokens.length - 1].type === 'op') {
          // 5 + 상태에서 = 누르면: 앞의 숫자를 피연산자로 채움
          let prevNum = tokens[tokens.length - 2]?.value || Decimal.ZERO;
          tokens.push({ type: 'num', value: prevNum, raw: formatNumber(prevNum) });
        }

        // 마지막 연산자와 피연산자 저장 (되풀이용)
        // 예: 2 + 3 × 4 에서 마지막 연산자는 ×, 마지막 피연산자는 4
        if (tokens.length >= 3) {
          lastOp = tokens[tokens.length - 2].value;
          lastOperand = tokens[tokens.length - 1].value;
        }

        let exprText = getExpressionString();
        let res;
        try {
          res = evaluateTokens(tokens);
        } catch (e) {
          error = e.message;
          expressionDisplay = exprText;
          tokens = [];
          return getState();
        }

        lastResult = res;
        let formattedRes = formatNumber(res);
        if (formattedRes === '숫자가 너무 큽니다') {
          error = formattedRes;
          expressionDisplay = exprText;
          tokens = [];
          return getState();
        }

        isResultState = true;
        tokens = [];
        expressionDisplay = exprText;

        let record = {
          id: 'rec_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
          time: new Date().toISOString(),
          expr: exprText,
          result: formattedRes,
          rawValue: res.toString(),
          note: ''
        };

        return getState({ record });
      }

      return getState();
    } catch (e) {
      error = e.message;
      return getState();
    }
  }

  function load(rawValue) {
    let dec = Decimal.fromString(String(rawValue || 0));
    lastResult = dec;
    currentInput = '';
    tokens = [];
    isResultState = true;
    error = null;
    expressionDisplay = '';
    lastOp = null;
    lastOperand = null;
    return getState();
  }

  return {
    press,
    load,
    getMemory: () => memory.toString(),
    formatNumber
  };
}
