'use strict';
// Stable report entry point; reusable model lives with the balance simulator.
const api = require('../src/balance/simulation/combat');
if (require.main === module) {
  console.log('## Encounters (on-level, default rates, average of the three classes, half of the telegraphed attacks dodged)\n\n' + api.table(api.report()));
  console.log('\n## Successive worlds (Rare +3 hero at the region level)\n\n' + api.table(api.worlds().flat()));
}
module.exports = api;
