export function taskForParticipant(task) {
  return {
    title: task.title,
    intro: task.intro,
    durationSeconds: task.durationSeconds,
    sources: task.sources,
    claims: task.claims.map(({ id, text, sourceId, paragraphId }) => ({ id, text, sourceId, paragraphId })),
  };
}

export function scoreAnswers(task, answers, elapsedMs, mode) {
  const expired = elapsedMs > task.durationSeconds * 1000;
  const feedback = task.claims.map((claim) => ({
    claimId: claim.id,
    correct: answers[claim.id] === claim.answer,
    answer: claim.answer,
    selected: answers[claim.id] ?? null,
    explanation: claim.explanation,
    sourceId: claim.sourceId,
    paragraphId: claim.paragraphId,
  }));
  const correct = feedback.filter((claim) => claim.correct).length;
  const falseApprovals = feedback.filter((claim) => claim.selected === 'supported' && !claim.correct).length;
  return {
    correct,
    total: feedback.length,
    passed: correct === feedback.length && !expired,
    expired,
    elapsedSeconds: Math.round(elapsedMs / 10) / 100,
    falseApprovals,
    feedback,
    mode,
  };
}
