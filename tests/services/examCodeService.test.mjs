import test from 'node:test';
import assert from 'node:assert/strict';
import { generateExamCodeMappings } from '../../src/server/services/examCodeService.mjs';

const questions = [
  { id: 'q1', optionIds: ['q1a', 'q1b', 'q1c', 'q1d'] },
  { id: 'q2', optionIds: ['q2a', 'q2b', 'q2c', 'q2d'] },
  { id: 'q3', optionIds: ['q3a', 'q3b', 'q3c', 'q3d'] }
];

test('generates stable shuffled mappings for the same seed', () => {
  const first = generateExamCodeMappings({ code: 'MD01', questions, seed: 'session-1' });
  const second = generateExamCodeMappings({ code: 'MD01', questions, seed: 'session-1' });
  assert.deepEqual(first, second);
  assert.equal(first.length, 3);
  assert.deepEqual(first.map((item) => item.displayOrder), [1, 2, 3]);
});

test('keeps each question with exactly four displayed option ids', () => {
  const mapping = generateExamCodeMappings({ code: 'MD02', questions, seed: 'session-1' });
  for (const item of mapping) {
    assert.equal(item.displayedOptionIds.length, 4);
    assert.deepEqual([...new Set(item.displayedOptionIds)].length, 4);
  }
});
