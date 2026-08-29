'use strict';

/**
 * 種別カタログ ── 種別に関する事実は「ここだけ」に書く。
 *
 * 仕様 §8.4「送料無料の判定・税率・丸め・閾値は 1 箇所の規則だけ」に従い、
 * 表示名・税率・課税対象かどうかを 1 つの表に集約する。
 * 経路(レシート / 合計のみ)によって別の表を持つことはしない。
 */

// 税率は浮動小数を避けるため分子/分母(パーセント)で保持する。
const KINDS = {
  PRODUCT: {
    code: 'PRODUCT',
    label: '商品',        // §6.1 表示名(内部コードは画面に出さない)
    taxPercent: 10,       // §3.1
    countsInSubtotal: true,   // §5「小計」に入る
    countsInFreeShipping: true, // §4 送料無料の判定対象
    isShipping: false,
    isDiscount: false,
  },
  FOOD: {
    code: 'FOOD',
    label: '食料品',
    taxPercent: 8,
    countsInSubtotal: true,
    countsInFreeShipping: true,
    isShipping: false,
    isDiscount: false,
  },
  SHIPPING: {
    code: 'SHIPPING',
    label: '送料',
    taxPercent: 10,
    countsInSubtotal: true,
    countsInFreeShipping: false, // §4 判定に送料自身は含めない
    isShipping: true,
    isDiscount: false,
  },
  DISCOUNT: {
    code: 'DISCOUNT',
    label: '割引',
    taxPercent: 10,       // §3.1 割引は 10%(税を戻す)
    countsInSubtotal: false, // §5 小計は値引き前。割引は別枠。
    countsInFreeShipping: false, // §4 判定に割引は影響しない
    isShipping: false,
    isDiscount: true,
  },
};

// 入力の書き方に幅を持たせる(内部コード / 日本語表示名 のどちらでも受ける)。
// 受け付ける綴りの一覧もここ 1 箇所に置く。
const ALIASES = new Map();
for (const kind of Object.values(KINDS)) {
  ALIASES.set(kind.code, kind);
  ALIASES.set(kind.code.toLowerCase(), kind);
  ALIASES.set(kind.label, kind);
}

/**
 * 種別を引く。未定義の種別は null を返す(黙って通さない ── 判断 6)。
 */
function lookupKind(rawKind) {
  if (typeof rawKind !== 'string') return null;
  const found = ALIASES.get(rawKind.trim());
  return found || null;
}

/** 受け付ける種別の綴りを一覧で返す(エラーメッセージ用)。 */
function knownKindNames() {
  return Array.from(ALIASES.keys());
}

module.exports = { KINDS, lookupKind, knownKindNames };
