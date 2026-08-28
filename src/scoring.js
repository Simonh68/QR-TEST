export function recordFirstAnswer(firstAnswers, questionId, selectedIndex, correctIndex) {
  if (Object.hasOwn(firstAnswers, questionId)) {
    return firstAnswers;
  }

  return {
    ...firstAnswers,
    [questionId]: {
      selectedIndex,
      correct: selectedIndex === correctIndex
    }
  };
}

export function calculateScore(firstAnswers, totalQuestions) {
  const correct = Object.values(firstAnswers).filter((answer) => answer.correct).length;
  const percent = totalQuestions === 0 ? 0 : Math.round((correct / totalQuestions) * 100);
  return { correct, total: totalQuestions, percent };
}
