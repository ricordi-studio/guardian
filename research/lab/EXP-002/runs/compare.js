const cases = require('./cases.json');
const MAP = { goods:'product', food:'food', shipping:'shipping', coupon:'discount' };
const impls = {
  A: { m: require('./impl-A/index.js'), receipt: 'renderReceipt', upper: false },
  B: { m: require('./impl-B/index.js'), receipt: 'buildReceipt',  upper: true  },
  C: { m: require('./impl-C/index.js'), receipt: 'buildReceipt',  upper: false },
};
const conv = (lines, upper) => lines.map(l => ({
  kind: upper ? MAP[l.kind].toUpperCase() : MAP[l.kind],
  name: l.title, unitPrice: l.price, quantity: l.qty,
}));

let same = 0, diff = 0;
for (const c of cases) {
  const out = {};
  for (const [k, i] of Object.entries(impls)) {
    try {
      const conv2 = conv(c.lines, i.upper); const order = k === 'A' ? { items: conv2 } : { lines: conv2 };
      out[k] = { total: i.m.calculateTotal(order), receipt: i.m[i.receipt](order) };
    } catch (e) { out[k] = { error: String(e.message || e).slice(0, 60) }; }
  }
  const key = (o) => JSON.stringify(o);
  const agree = key(out.A) === key(out.B) && key(out.B) === key(out.C);
  if (agree) { same++; console.log('✓ 一致  ' + c.name + '  → 合計 ' + (out.A.total !== undefined ? out.A.total : out.A.error)); }
  else {
    diff++;
    console.log('✗ 相違  ' + c.name);
    for (const k of ['A','B','C']) {
      const o = out[k];
      console.log('     ' + k + ': ' + (o.error ? 'エラー: ' + o.error : '合計 ' + o.total));
    }
    if (!out.A.error && !out.B.error && !out.C.error) {
      const rs = ['A','B','C'].map(k => out[k].receipt);
      if (rs[0] !== rs[1] || rs[1] !== rs[2]) {
        console.log('     --- レシートも相違 ---');
        for (const k of ['A','B','C']) console.log('     [' + k + ']\n' + out[k].receipt.split('\n').map(s=>'       '+s).join('\n'));
      }
    }
  }
}
console.log('\n一致 ' + same + ' / 相違 ' + diff + ' (全 ' + cases.length + ' 例)');
