import { normalizeHostNotes } from './host-notes.js';
const text = (value, max = 500) => typeof value === 'string' && value.length <= max && !/[\u0000-\u0008\u000e-\u001f\u007f]/u.test(value);
const list = (value, max) => Array.isArray(value) && value.length <= max;
const uuid = value => typeof value === 'string' && /^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/iu.test(value);
const number = value => Number.isFinite(value) && value >= 0 && value <= 100;
const require = condition => { if (!condition) throw new Error('The saved room is incomplete or incompatible. Start a new brief or keep an exported copy.'); };

export function parseSavedRoom(raw, mode) {
  require(text(raw, 1_500_000));
  const saved = JSON.parse(raw);
  require(saved?.version === 1 && saved.mode === mode && ['fixture', 'live'].includes(mode));
  const form = saved.form;
  require(form && text(form.venue, 80) && [60, 90, 120].includes(Number(form.minutes)) && number(Number(form.coverage)) && [2, 3].includes(Number(form.circleCount)));
  require(list(form.circles, 3) && form.circles.length === 3 && form.circles.every(circle => text(circle.name, 60) && text(circle.anchors, 480)) && text(form.vetoes, 4800));
  require(list(saved.identities, 40) && saved.identities.every(row => Array.isArray(row) && row.length === 2 && text(row[0], 300) && uuid(row[1])));
  require(saved.resultFormSnapshot == null || text(saved.resultFormSnapshot, 16_384));
  const result = saved.result;
  if (result) {
    require(result.version === '1.0' && uuid(result.id) && result.mode === mode && ['ready', 'blocked'].includes(result.status) && text(result.generatedAt, 60) && Number.isFinite(Date.parse(result.generatedAt)));
    require(result.input && text(result.input.venue, 80) && [60, 90, 120].includes(result.input.minutes) && number(result.input.minimumCoverage));
    const circles = result.input.circles;
    require(list(circles, 3) && circles.length >= 2 && circles.every((circle,index) => circle.id === `circle-${index+1}` && text(circle.name,60) && list(circle.anchors,3) && circle.anchors.length && circle.anchors.every(anchor=>text(anchor,160))));
    require(list(result.input.vetoes,30) && result.input.vetoes.every(veto=>text(veto,160)));
    require(result.budget && Number.isInteger(result.budget.workflowCount) && result.budget.workflowCount >= 0 && result.budget.workflowCount <= result.budget.workflowLimit && result.budget.workflowLimit <= 22);
    require(list(result.evidence,22) && result.evidence.every(row=>text(row.workflowId,40) && ['recommend','rank'].includes(row.operation) && row.provenance?.mode===mode && text(row.provenance.source,100) && (mode!=='live'||row.provenance.source==='Qloo API'&&row.provenance.endpoint==='/v2/insights') && list(row.results,20)));
    const validBundle = bundle => {
      require(bundle && list(bundle.items,3) && bundle.items.length===3 && new Set(bundle.items.map(item=>item.domain)).size===3);
      for (const item of bundle.items) {
        require(['book','artist','movie'].includes(item.domain) && text(item.name,240) && (mode==='live'?uuid(item.id):typeof item.id==='string'&&/^[a-z\d-]{1,80}$/iu.test(item.id)));
        require(circles.every(circle=>item.scores?.[circle.id] && number(item.scores[circle.id].relativeScore) && Number.isInteger(item.scores[circle.id].totalOptions) && item.scores[circle.id].totalOptions<=10 && result.evidence.some(row=>row.workflowId===item.scores[circle.id].workflowId)));
      }
      require(bundle.metrics && number(bundle.metrics.minimum) && number(bundle.metrics.average) && list(bundle.metrics.coverage,3) && bundle.metrics.coverage.length===circles.length && bundle.metrics.coverage.every(row=>circles.some(circle=>circle.id===row.circleId)&&text(row.name,60)&&number(row.score)));
    };
    require(result.decision && list(result.decision.reasons,8) && result.decision.reasons.every(reason=>text(reason,1000)));
    if (result.decision.selected) validBundle(result.decision.selected);
    if (result.decision.bestUnqualified) validBundle(result.decision.bestUnqualified);
    if (result.decision.baseline) validBundle(result.decision.baseline);
    require(result.scoring && text(result.scoring.explanation,4000) && list(result.limitations,12) && result.limitations.every(limit=>text(limit,1000)));
    if (result.status === 'ready') require(result.decision.selected && result.program && text(result.program.title,120) && text(result.program.description,1500) && text(result.program.note,1500) && list(result.program.schedule,5) && result.program.schedule.length===5 && result.program.schedule.every(row=>text(row.label,300)&&text(row.activity,3000)&&Number.isInteger(row.minutes)&&row.minutes>0));
    else require(!result.decision.selected && !result.program);
  }
  return { ...saved, notes: normalizeHostNotes(saved.notes) };
}
