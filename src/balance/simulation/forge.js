'use strict';
const { DEFAULT_FORGE_POLICY, upCostFor, upgradeOutcome } = require('../../../public/forge-math');
function solve(matrix, values) {
  const rows = matrix.map((row, index) => [...row, values[index]]), size = rows.length;
  for (let column = 0; column < size; column++) {
    let pivot = column;
    for (let row = column + 1; row < size; row++) if (Math.abs(rows[row][column]) > Math.abs(rows[pivot][column])) pivot = row;
    [rows[column], rows[pivot]] = [rows[pivot], rows[column]];
    const divisor = rows[column][column];
    if (Math.abs(divisor) < 1e-12) throw new RangeError('Forge target has no finite expected hitting time');
    for (let cell = column; cell <= size; cell++) rows[column][cell] /= divisor;
    for (let row = 0; row < size; row++) if (row !== column) {
      const multiplier = rows[row][column];
      for (let cell = column; cell <= size; cell++) rows[row][cell] -= multiplier * rows[column][cell];
    }
  }
  return rows.map(row => row[size]);
}
// Absorbing target state. Below +5, failure stays; at +5+, it moves back one.
function forgeExpectation({ ilvl, slot = 'weapon', start = 0, target = 9, policy = DEFAULT_FORGE_POLICY }) {
  if (!Number.isInteger(ilvl) || ilvl < 1 || ilvl > 10000 || !Number.isInteger(start) || !Number.isInteger(target) || start < 0 || target > 9 || start > target) throw new RangeError('Invalid forge scenario');
  if (start === target) return { attempts: 0, gold: 0, attemptsByState: [], goldByState: [] };
  const matrix = Array.from({ length: target }, (_, state) => {
    const row = Array.from({ length: target }, (_, column) => state === column ? 1 : 0);
    const probability = policy.successRates[state];
    for (const [roll, weight] of [[0, probability], [1, 1 - probability]]) {
      const destination = upgradeOutcome(state, roll, policy).plus;
      if (destination < target) row[destination] -= weight;
    }
    return row;
  });
  const attemptsByState = solve(matrix, Array(target).fill(1));
  const goldByState = solve(matrix, Array.from({ length: target }, (_, plus) => upCostFor({ ilvl, slot, plus }, policy)));
  return { attempts: attemptsByState[start], gold: goldByState[start], attemptsByState, goldByState };
}
module.exports = { forgeExpectation };
