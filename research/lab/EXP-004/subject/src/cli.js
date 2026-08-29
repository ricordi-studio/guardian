'use strict';

const { syncAll } = require('./sync');

/**
 * 使い方:
 *   node cli.js <配布元> <配布先>
 */
function main(argv) {
  const srcRoot = argv[2];
  const destRoot = argv[3];

  if (!srcRoot || !destRoot) {
    console.error('使い方: node cli.js <配布元> <配布先>');
    return 1;
  }

  const r = syncAll(srcRoot, destRoot);

  for (const d of r.done) {
    console.log('  ✓ ' + d.from + ' → ' + d.to + '  (' + d.bytes + ' bytes)');
  }
  for (const f of r.failed) {
    console.error('  ✗ ' + f.entry.from + ': ' + f.error);
  }
  console.log(r.done.length + ' / ' + r.total + ' 件を写しました');

  return r.failed.length ? 1 : 0;
}

if (require.main === module) {
  process.exit(main(process.argv));
}

module.exports = { main };
