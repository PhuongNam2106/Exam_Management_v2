import crypto from 'node:crypto';

function hashNumber(seed) {
  const hash = crypto.createHash('sha256').update(seed).digest();
  return hash.readUInt32BE(0);
}

function seededShuffle(items, seed) {
  return [...items]
    .map((item, index) => ({ item, sort: hashNumber(`${seed}:${index}:${JSON.stringify(item)}`) }))
    .sort((a, b) => a.sort - b.sort)
    .map((entry) => entry.item);
}

export function generateExamCodeMappings({ code, questions, seed }) {
  const shuffledQuestions = seededShuffle(questions, `${seed}:${code}:questions`);
  return shuffledQuestions.map((question, index) => ({
    questionId: question.id,
    displayOrder: index + 1,
    displayedOptionIds: seededShuffle(question.optionIds, `${seed}:${code}:${question.id}:options`)
  }));
}

export function generateCodeNames(count) {
  return Array.from({ length: count }, (_, index) => `MD${String(index + 1).padStart(2, '0')}`);
}
