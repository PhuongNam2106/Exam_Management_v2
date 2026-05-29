import test from 'node:test';
import assert from 'node:assert/strict';
import { gradeAttempt } from '../../src/server/services/gradingService.mjs';

test('grades equal-weight A/B/C/D answers on a 10-point scale', () => {
  const result = gradeAttempt({
    items: [
      { itemId: 'i1', displayed: { A: 'o1', B: 'o2', C: 'o3', D: 'o4' }, correctOptionId: 'o2' },
      { itemId: 'i2', displayed: { A: 'o5', B: 'o6', C: 'o7', D: 'o8' }, correctOptionId: 'o7' },
      { itemId: 'i3', displayed: { A: 'o9', B: 'o10', C: 'o11', D: 'o12' }, correctOptionId: 'o12' }
    ],
    answers: [
      { itemId: 'i1', selectedLabel: 'B' },
      { itemId: 'i2', selectedLabel: 'A' }
    ]
  });

  assert.equal(result.correctCount, 1);
  assert.equal(result.totalQuestions, 3);
  assert.equal(result.score, 3.33);
  assert.deepEqual(result.details.map((row) => row.isCorrect), [true, false, false]);
});
