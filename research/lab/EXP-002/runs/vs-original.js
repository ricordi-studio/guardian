const cases = require('./cases.json');
const orig = require('../pristine/src/main.js');
const B = require('./impl-B/index.js');
const MAP = { goods:'PRODUCT', food:'FOOD', shipping:'SHIPPING', coupon:'DISCOUNT' };
for (const c of cases) {
  let o, n;
  try { o = orig.totalOf({ lines: c.lines }); } catch (e) { o = 'エラー'; }
  try { n = B.calculateTotal({ lines: c.lines.map(l => ({ kind: MAP[l.kind], name: l.title, unitPrice: l.price, quantity: l.qty })) }); } catch (e) { n = 'エラー:' + String(e.message).slice(0,30); }
  console.log((o === n ? '  同じ ' : '★違う ') + String(o).padStart(7) + ' → ' + String(n).padStart(7) + '   ' + c.name);
}
