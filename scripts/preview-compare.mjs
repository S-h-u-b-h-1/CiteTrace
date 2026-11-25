export const compareMarkup = `<section class="citation-compare" aria-labelledby="compare-title">
  <div class="compare-heading">
    <div>
      <h2 id="compare-title">One citation, two ways to open it</h2>
      <p>Both readers contain the same document. Compare where each opens.</p>
    </div>
    <div class="compare-controls">
      <label for="compare-claim">Claim to compare</label>
      <select id="compare-claim" aria-describedby="compare-claim-text"></select>
      <button id="compare-open" type="button" class="compare-open" aria-controls="compare-control compare-focused">Open both views</button>
    </div>
  </div>
  <p class="compare-claim-text" id="compare-claim-text"></p>
  <div class="compare-grid">
    <section class="compare-arm" aria-labelledby="compare-control-title">
      <header><span>Control</span><h3 id="compare-control-title">Full source</h3></header>
      <div class="source-scroll compare-reader" id="compare-control" tabindex="0" role="region" aria-label="Full source document"></div>
    </section>
    <section class="compare-arm compare-arm-focused" aria-labelledby="compare-focused-title">
      <header><span>Treatment</span><h3 id="compare-focused-title">Focused citation</h3></header>
      <div class="source-scroll compare-reader" id="compare-focused" tabindex="0" role="region" aria-label="Source document at the highlighted passage"></div>
    </section>
  </div>
  <p id="compare-status" class="visually-hidden" role="status"></p>
</section>`;

export const compareStyles = `
.welcome { display: block; min-height: 0; padding-block: clamp(26px, 4vw, 56px) 8px; }
.welcome-copy { margin-block-end: clamp(26px, 4vw, 42px); }
.welcome h1 { font-size: clamp(2.65rem, 6.8vw, 5.05rem); margin-block-end: 12px; }
.welcome .desktop-break { display: none; }
.welcome .lede { max-width: 39rem; margin-block-end: 15px; }
.welcome .fine-print { margin-block-start: 8px; }
.citation-compare { padding: clamp(12px, 3vw, 25px); border: 1px solid var(--line); border-radius: 10px; background: #eee9dd; }
.compare-heading { display: flex; justify-content: space-between; align-items: end; gap: .8rem 1.6rem; flex-wrap: wrap; }
.compare-heading h2 { margin: 0 0 3px; font-size: clamp(1.6rem, 4vw, 2.45rem); letter-spacing: -.045em; line-height: 1.12; }
.compare-heading p { margin: 0; color: var(--muted); font-size: .9rem; }
.compare-controls { min-width: 0; display: flex; align-items: center; flex-wrap: wrap; gap: .35rem .5rem; font-size: .81rem; font-weight: 650; }
.compare-controls select, .compare-open { min-height: 40px; max-width: 100%; padding: .38rem .6rem; border: 1px solid #918b7d; border-radius: 5px; color: var(--ink); background: var(--paper-white); font: inherit; }
.compare-open { color: white; background: var(--accent-dark); border-color: var(--accent-dark); cursor: pointer; }
.compare-open:hover { background: var(--accent); }
.compare-claim-text { margin: 14px 0; padding: 9px 11px; border-inline-start: 3px solid #aca48e; color: var(--ink); background: var(--paper-white); font: 1.05rem/1.45 var(--serif); }
.compare-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: clamp(8px, 2vw, 17px); }
.compare-arm { min-width: 0; border: 1px solid var(--line); border-radius: 7px; background: var(--paper-white); }
.compare-arm header { display: flex; align-items: baseline; flex-wrap: wrap; gap: .25rem .6rem; padding: 9px 12px; background: #e6e1d5; border-radius: 7px 7px 0 0; }
.compare-arm-focused header { background: var(--accent-light); color: var(--accent-dark); }
.compare-arm header span { font-size: .75rem; font-weight: 700; }
.compare-arm h3 { margin: 0; font-size: 1rem; }
.compare-reader { height: 236px; min-height: 0; padding: 10px 12px; border: 0; border-radius: 0 0 7px 7px; }
.compare-reader:focus-visible { outline-offset: -4px; }
.compare-reader .source-paragraph h5 { margin: 0 0 3px; color: var(--ink); font-size: .83rem; }
.compare-reader .source-paragraph.is-cited p { color: var(--ink); }
@media (max-width: 560px) {
  .compare-grid { grid-template-columns: minmax(0, 1fr); }
  .compare-heading { align-items: start; }
}
`;

export function mountCitationComparison(task) {
  const claimSelect = document.getElementById('compare-claim');
  const claimText = document.getElementById('compare-claim-text');
  const control = document.getElementById('compare-control');
  const treatment = document.getElementById('compare-focused');
  const button = document.getElementById('compare-open');
  const status = document.getElementById('compare-status');

  function element(tag, text, className) {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (className) node.className = className;
    return node;
  }

  function renderReader(reader, source, citedId) {
    const content = [element('h4', source.title, 'source-title')];
    let citedSection;
    for (const paragraph of source.paragraphs) {
      const section = element('section', undefined, 'source-paragraph');
      section.append(element('h5', paragraph.label), element('p', paragraph.body));
      if (paragraph.id === citedId) {
        section.className = 'source-paragraph is-cited';
        section.setAttribute('aria-label', `Cited paragraph, ${paragraph.label}`);
        citedSection = section;
      }
      content.push(section);
    }
    reader.replaceChildren(...content);
    reader.scrollTop = 0;
    if (citedSection) {
      reader.scrollTop = citedSection.getBoundingClientRect().top - reader.getBoundingClientRect().top - 10;
    }
    return citedSection;
  }

  function openBoth(announce = false) {
    const claim = task.claims.find(({ id }) => id === claimSelect.value);
    const source = task.sources.find(({ id }) => id === claim.sourceId);
    claimText.textContent = claim.text;
    renderReader(control, source);
    const citedSection = renderReader(treatment, source, claim.paragraphId);
    if (announce) {
      status.textContent = `Full source opened at the document title. Focused citation opened at ${citedSection.firstElementChild.textContent}.`;
    }
  }

  for (const claim of task.claims) {
    const label = claim.id[0].toUpperCase() + claim.id.slice(1).replaceAll('-', ' ');
    const option = element('option', label);
    option.value = claim.id;
    claimSelect.append(option);
  }
  claimSelect.value = task.claims.at(-1).id;
  claimSelect.addEventListener('change', () => openBoth(true));
  button.addEventListener('click', () => openBoth(true));
  openBoth();
}
