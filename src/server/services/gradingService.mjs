export function gradeAttempt({ items, answers }) {
  const answerMap = new Map(answers.map((answer) => [answer.itemId, answer.selectedLabel]));
  let correctCount = 0;

  const details = items.map((item) => {
    const selectedLabel = answerMap.get(item.itemId) || null;
    const selectedOptionId = selectedLabel ? item.displayed[selectedLabel] : null;
    const isCorrect = selectedOptionId === item.correctOptionId;
    if (isCorrect) correctCount += 1;
    return {
      itemId: item.itemId,
      selectedLabel,
      selectedOptionId,
      correctOptionId: item.correctOptionId,
      isCorrect
    };
  });

  const totalQuestions = items.length;
  const score = totalQuestions === 0 ? 0 : Math.round((correctCount / totalQuestions) * 1000) / 100;
  return { correctCount, totalQuestions, score, details };
}
