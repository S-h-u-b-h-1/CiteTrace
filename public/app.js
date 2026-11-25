const ui = Object.fromEntries([...document.querySelectorAll('[id]')].map((node) => [node.id, node]));
const verdicts = {
  supported: 'Supported',
  contradicted: 'Contradicted',
  insufficient: 'Insufficient evidence',
};

let session;
let answers = {};
let clock;
let deadline;
let timeExpired = false;
let lastCitation;
let submitting = false;

function node(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

async function request(route, payload) {
  const options = payload === undefined ? {} : {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  };
  let response;
  let body;
  let receivedAt;
  try {
    response = await fetch(`/api/${route}`, { cache: 'no-store', signal: globalThis.AbortSignal?.timeout?.(12_000), ...options });
    receivedAt = performance.now();
    body = await response.json();
  } catch (error) {
    throw new Error(error?.name === 'TimeoutError'
      ? 'The connection timed out. Please try again.'
      : 'The review server did not respond. Please try again.');
  }
  if (!response.ok) {
    throw new Error(typeof body?.error === 'string' ? body.error : 'The review server did not respond. Please try again.');
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new Error('The review server returned an incomplete response. Please try again.');
  }
  return { ...body, receivedAt };
}

function setMode({ mode, traffic }) {
  if (!mode) return;
  const live = mode === 'flagsmith' && traffic !== 'synthetic';
  ui.mode.hidden = false;
  ui.mode.classList.toggle('is-live', live);
  ui.mode.textContent = live ? 'Live experiment' : mode === 'flagsmith' ? 'Synthetic test' : 'Local preview';
  if (mode === 'preview') ui.privacy.textContent = 'Preview reviews are excluded from live experiment results.';
  if (traffic === 'synthetic') ui.privacy.textContent = 'This test environment is excluded from the live experiment.';
}

function updateProgress() {
  const total = session.task.claims.length;
  const complete = session.task.claims.filter(({ id }) => Object.hasOwn(verdicts, answers[id])).length;
  ui.progress.textContent = `${complete} of ${total} reviewed`;
  ui.submit.disabled = submitting || !session.startedAt || (!timeExpired && complete < total);
  ui.submit.firstChild.textContent = submitting ? 'Submitting… ' : 'Submit review ';
  for (const input of ui.claims.querySelectorAll('input[type="radio"]')) input.disabled = submitting || timeExpired;
}

function answerKey() {
  return `citetrace:answers:${session.startedAt}`;
}

function saveAnswers() {
  if (!session.startedAt) return;
  try { sessionStorage.setItem(answerKey(), JSON.stringify(answers)); } catch { /* Storage can be blocked by browser settings. */ }
}

function restoreAnswers() {
  if (!session.startedAt) return;
  try {
    const stored = JSON.parse(sessionStorage.getItem(answerKey())) ?? {};
    for (const claim of session.task.claims) {
      if (Object.hasOwn(verdicts, stored[claim.id])) answers[claim.id] = stored[claim.id];
    }
  } catch { /* A failed restore leaves a fresh set of choices. */ }
}

function drawTimer() {
  const seconds = Math.max(0, Math.ceil((deadline - performance.now()) / 1000));
  ui.time.textContent = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  ui.timer.classList.toggle('ending', seconds <= 15);
  if (seconds === 0) {
    timeExpired = true;
    ui['time-notice'].hidden = false;
    clearInterval(clock);
    updateProgress();
  }
}

function startClock() {
  clearInterval(clock);
  deadline = session.receivedAt + Date.parse(session.expiresAt) - Date.parse(session.serverNow);
  drawTimer();
  if (deadline > performance.now()) clock = setInterval(drawTimer, 200);
}

function openCitation(claim, button) {
  const source = session.task.sources.find(({ id }) => id === claim.sourceId);
  if (!source) return;

  const focused = session.variant === 'focused_source';
  const title = node('h3', 'source-title', source.title);
  title.tabIndex = -1;
  const content = [node('p', 'source-label', 'Source document'), title];
  let target = title;

  for (const paragraph of source.paragraphs) {
    const isCited = focused && paragraph.id === claim.paragraphId;
    const section = node('section', `source-paragraph${isCited ? ' is-cited' : ''}`);
    section.append(node('h4', '', paragraph.label), node('p', '', paragraph.body));
    if (isCited) {
      section.tabIndex = -1;
      section.setAttribute('aria-label', `Cited paragraph, ${paragraph.label}`);
      target = section;
    }
    content.push(section);
  }
  ui['source-article'].replaceChildren(...content);
  ui['source-article'].hidden = false;
  ui['source-empty'].hidden = true;
  ui['back-to-claim'].hidden = false;
  lastCitation = button;

  if (matchMedia('(max-width: 690px)').matches) ui.reader.scrollIntoView({ block: 'start' });
  const scroll = ui['source-scroll'];
  scroll.scrollTop = focused && target !== title
    ? target.getBoundingClientRect().top - scroll.getBoundingClientRect().top + scroll.scrollTop - 12
    : 0;
  target.focus({ preventScroll: true });
}

function reviewCard(claim, index) {
  const card = node('div', 'claim');
  card.dataset.answered = Object.hasOwn(verdicts, answers[claim.id]);
  const citation = node('button', 'citation', 'Open citation ↗');
  citation.type = 'button';
  citation.setAttribute('aria-label', `Open citation for claim ${index + 1}`);
  citation.setAttribute('aria-controls', 'source-article');
  citation.addEventListener('click', () => openCitation(claim, citation));
  const options = node('fieldset', 'decisions');
  options.append(node('legend', 'visually-hidden', `Decision for claim ${index + 1}`));
  for (const [value, text] of Object.entries(verdicts)) {
    const label = node('label');
    const input = node('input');
    input.type = 'radio';
    input.name = `decision-${claim.id}`;
    input.value = value;
    input.checked = answers[claim.id] === value;
    input.addEventListener('change', () => {
      answers[claim.id] = value;
      card.dataset.answered = 'true';
      saveAnswers();
      updateProgress();
    });
    label.append(input, node('span', '', text));
    options.append(label);
  }
  card.append(node('p', 'claim-heading', `Claim ${index + 1}`), node('p', 'claim-text', claim.text), citation, options);
  return card;
}

function showError(element, message) {
  element.textContent = message;
  element.hidden = !message;
}

async function enterReview(state, focus) {
  if (!state.startedAt && !state.result) {
    Object.assign(state, await request('exposure', {}));
  }
  if (!state.task || !state.startedAt || ![state.expiresAt, state.serverNow].every((value) => Number.isFinite(Date.parse(value)))) {
    throw new Error('The review could not start its timer. Please try again.');
  }
  session = state;
  setMode(state);
  if (state.result) {
    renderResults(state.result, focus);
    return;
  }
  ui.welcome.hidden = true;
  restoreAnswers();
  ui['task-title'].textContent = session.task.title;
  ui['task-intro'].textContent = session.task.intro;
  ui.claims.replaceChildren(...session.task.claims.map(reviewCard));
  ui.workspace.hidden = false;
  startClock();
  updateProgress();
  if (focus) ui['task-title'].focus();
}

function buildMetric(value, label) {
  const metric = node('div', 'metric');
  metric.append(node('b', '', value), node('span', '', label));
  return metric;
}

function renderResults(result, focus = true) {
  if (!Array.isArray(result.feedback) || result.feedback.length !== session.task.claims.length) {
    throw new Error('The review results were incomplete. Please try again.');
  }
  clearInterval(clock);
  try { sessionStorage.removeItem(answerKey()); } catch { /* Storage can be blocked by browser settings. */ }
  ui.welcome.hidden = true;
  ui.workspace.hidden = true;
  ui.results.hidden = false;
  ui['result-summary'].textContent = result.passed
    ? 'You classified all three claims correctly within the review window.'
    : result.expired && result.correct === result.total
      ? 'All three verdicts were correct. The submission reached the server after the 90-second limit.'
      : 'A passing review requires all three claims to be correct within 90 seconds. Here is what the sources support.';
  ui['result-metrics'].replaceChildren(
    buildMetric(`${result.correct}/${result.total}`, 'Correct decisions'),
    buildMetric(`${result.elapsedSeconds}s`, 'Review time'),
    buildMetric(result.falseApprovals, 'Unsupported claims approved'),
  );

  const feedback = result.feedback.map((item, index) => {
    const claim = session.task.claims.find(({ id }) => id === item.claimId);
    const source = session.task.sources.find(({ id }) => id === item.sourceId);
    const paragraph = source?.paragraphs.find(({ id }) => id === item.paragraphId);
    const card = node('article', 'claim');
    card.append(
      node('p', 'claim-heading', `Claim ${index + 1}`),
      node('p', 'claim-text', claim?.text),
      node('p', `feedback-verdict${item.correct ? '' : ' missed'}`, item.correct
        ? `Correct · ${verdicts[item.answer]}`
        : `Your decision: ${verdicts[item.selected] ?? 'Unanswered'} · Correct decision: ${verdicts[item.answer]}`),
      node('p', 'feedback-explanation', item.explanation),
    );
    if (paragraph) {
      card.append(
        node('p', 'feedback-source', `${source.title} · ${paragraph.label}`),
        node('blockquote', 'feedback-quote', paragraph.body),
      );
    }
    return card;
  });
  ui.feedback.replaceChildren(...feedback);
  if (focus) {
    ui['result-title'].focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }
}

ui['back-to-claim'].addEventListener('click', () => lastCitation?.focus());

ui.start.addEventListener('click', async () => {
  if (ui.start.disabled) return;
  ui.start.disabled = true;
  ui.start.firstChild.textContent = 'Starting… ';
  showError(ui['global-error'], '');
  try {
    await enterReview(await request('start', {}), true);
  } catch (error) {
    showError(ui['global-error'], error.message);
  } finally {
    ui.start.disabled = false;
    ui.start.firstChild.textContent = 'Start review ';
  }
});

ui.review.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (ui.submit.disabled) return;
  submitting = true;
  updateProgress();
  showError(ui['submit-error'], '');
  try {
    renderResults(await request('submit', { answers }));
  } catch (error) {
    showError(ui['submit-error'], error.message);
  } finally {
    submitting = false;
    updateProgress();
  }
});

ui.start.disabled = true;
request('session').then(async (state) => {
  setMode(state);
  if (state.task || state.requiresExposure) await enterReview(state, false);
}).catch((error) => {
  showError(ui['global-error'], error.message);
}).finally(() => {
  ui.start.disabled = false;
});
