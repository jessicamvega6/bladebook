/* Students — the roster and the pending sign-ups (FeatureDecriptions/Coach Dashboard; ADR-002, ADR-022 d6).
   Approving changes only the skater's record: only a coach's accepted skaters can share a lesson, so no seat waits on
   the coach's Accept (ADR-033).
   Registers SCREENS students / pending, ACTIONS stu*, MODALS stu*, and the Students PRESETS. */

const stuUi = () => (state.ui.stu ??= { search: '', draft: null });
const stuIn = (l, s) => skatersIn(l).some(p => p.sid === s.id);
const stuNext = s => state.lessons.find(l => stuIn(l, s) && !isStarted(l));
const stuUpcoming = s => state.lessons.filter(l => stuIn(l, s) && !isStarted(l));
/** Approving makes the skater ACTIVE. */
function stuApproveOne(s) { s.status = 'ACTIVE'; }
const stuTabs = on => SEG([`Students <span class="stu-count">${active().length}</span>`, `Waiting for approval <span class="stu-count${pending().length ? ' stu-count--attn' : ''}">${pending().length}</span>`], on, 'stuTab');
/** The skater's organization and number from sign-up (ADR-029 d3), copied onto the coach's STUDENT# record. Required at
    sign-up (ADR-029 d1), so every skater has one. Order matches the client's SKATE_ORGS. */
const STU_ORGS = ['U.S. Figure Skating', 'USA Hockey', 'Learn to Skate USA'];
const stuOrg = s => `<span class="mono">${esc(s.orgNum)}</span><span class="stu-sub">${STU_ORGS[s.org]}</span>`;
const stuContact = s => `<div class="stu-contact"><span>${ic('mail', 13)}${esc(s.email)}</span><span>${ic('phone', 13)}${esc(s.phone)}</span><span>${ic('msg', 13)}${s.sms ? 'Texts on' : 'Email only'}</span></div>`;

SCREENS.students = () => {
  const u = stuUi(), q = u.search.trim().toLowerCase();
  const list = active().filter(s => !q || [s.name, s.client, s.email, s.phone].some(v => v.toLowerCase().includes(q)));
  const rowsHtml = list.map(s => {
    const n = stuNext(s);
    return `<tr>
      <td><span class="cellname">${avatar(initials(s.name), 'sm')}<span><b>${esc(s.name)}</b><span class="stu-sub">${s.minor ? 'Minor' : 'Adult'}</span></span></span></td>
      <td>${stuOrg(s)}</td>
      <td><b>${esc(s.client)}</b><span class="stu-sub">${s.rel === 'Self' ? 'Books for themselves' : s.rel}</span>${stuContact(s)}</td>
      <td class="num">${n ? `${dDow(n.iso)}<span class="stu-sub">${fmtT(n.t)} · ${n.len} min</span>` : '<span class="muted">Nothing booked</span>'}</td>
      <td class="r"><span class="cellbtns">${B('Edit contact', 'ghost', 'stuEditOpen', { sm: true, icon: 'pencil', args: [s.id] })}</span></td></tr>`;
  }).join('');
  return shell(`
    ${pageHead('Students', 'Everyone you coach, and how to reach their family.', stuTabs(0))}
    <div class="stu-search">${INP('stu-search', 'Search', 'ui.stu.search', { live: true, placeholder: 'Name, family, email or phone' })}</div>
    ${card(list.length ? `<div class="stu-tablewrap"><table class="table stu-table"><thead><tr><th>Skater</th><th>Skater number</th><th>Family contact</th><th>Next lesson</th><th class="r"></th></tr></thead><tbody>${rowsHtml}</tbody></table></div>
      <div class="card__note">${ic('info', 14)} Contact details are the family’s. Changing them here changes them for every skater in that family. Skater numbers are entered by the family and checked for shape only, not with the organization.</div>`
      : `<div class="pempty"><span class="pempty__icon">${ic('users', 22)}</span><b>No students match “${esc(u.search)}”</b><span class="muted">Try a first name, a family name or a phone number.</span></div>`,
      { pad: false, title: plural(list.length, 'student'), sub: q ? `Matching “${esc(u.search)}”` : `${plural(families(active()).length, 'family', 'families')}` })}`, { width: 'wide' });
};

SCREENS.pending = () => {
  const pend = pending();
  const fam = families(pend).map(f => {
    const kids = pend.filter(s => s.client === f), c = kids[0];
    return card(`
      <div class="stu-family">${stuContact(c)}<span class="muted-sm">Signed up ${dShort(c.since)}</span></div>
      ${kids.map(k => row(`${avatar(initials(k.name), 'sm')}<div>${rowTitle(esc(k.name), `${k.minor ? 'Minor' : 'Adult · booking for themselves'} · ${STU_ORGS[k.org]} <span class="mono">${esc(k.orgNum)}</span>`)}</div>`,
        `${B('Decline', 'ghost', 'stuDeclineOpen', { sm: true, args: [k.id] })}${B('Approve', 'primary', 'stuApprove', { sm: true, icon: 'check', args: [k.id] })}`)).join('')}`,
      { pad: false, title: esc(f), sub: c.rel === 'Self' ? 'Signing up for themselves' : `${c.rel} · ${plural(kids.length, 'skater')}`, action: kids.length > 1 ? B('Approve all', 'secondary', 'stuApproveFamily', { sm: true, icon: 'check', args: [f] }) : '' });
  }).join('');
  return shell(`
    ${pageHead('Students', 'New families who entered your coach code.', stuTabs(1))}
    ${banner('info', 'They can’t see your times until you approve them', 'A family waiting here sees only their own account: no schedule, no open times, no contact details. Your coach code can be passed around, so approving is how you check you know them.')}
    ${pend.length ? `<div class="stack">${fam}</div>` : card(`<div class="pempty"><span class="pempty__icon">${ic('check', 22)}</span><b>Nobody is waiting</b><span class="muted">When a family signs up with your code, they’ll appear here. Share your code: <b class="mono">${state.profile.code}</b></span></div>`)}`, { width: 'wide' });
};

/* ---------- modals ---------- */
MODALS.stuEdit = m => {
  const s = student(m.id), sibs = state.students.filter(x => x.client === s.client && x.status === 'ACTIVE');
  return `<div class="dialog__icon">${ic('pencil', 22)}</div>
    <h2 class="h2">Edit ${esc(s.client)}’s contact details</h2>
    <p class="fine">Used for reminders and cancellation emails for ${sibs.map(x => esc(x.name)).join(' and ')}.</p>
    ${INP('stu-ed-client', s.rel === 'Self' ? 'Name' : `${s.rel}’s name`, 'ui.stu.draft.client')}
    ${INP('stu-ed-email', 'Email', 'ui.stu.draft.email', { type: 'email' })}
    ${INP('stu-ed-phone', 'Phone', 'ui.stu.draft.phone', { type: 'tel' })}
    <div class="dialog__actions">${B('Cancel', 'secondary', 'closeModal')}${B('Save', 'primary', 'stuEditSave')}</div>`;
};
MODALS.stuRemove = m => {
  const s = student(m.id), up = stuUpcoming(s);
  return `<div class="dialog__icon dialog__icon--danger">${ic('trash', 22)}</div>
    <h2 class="h2">Remove ${esc(s.name)}? ${badge('Phase 2', 'neutral')}</h2>
    <div class="dialog__what"><b>${esc(s.name)}</b><span>${s.rel === 'Self' ? 'Books for themselves' : `${esc(s.client)} · ${s.rel}`}</span></div>
    <ul class="stu-list">
      <li>${up.length ? `${plural(up.length, 'upcoming lesson')} ${up.length === 1 ? 'is' : 'are'} cancelled and ${s.rel === 'Self' ? 'they are' : 'the family is'} emailed.` : 'Nothing is booked, so no lessons are cancelled.'}</li>
      <li>${esc(s.name)} can no longer book with you.</li>
      <li>Past lessons and payments stay in your records.</li>
    </ul>
    <div class="dialog__actions">${B('Keep student', 'secondary', 'closeModal')}${B('Remove student', 'danger', 'stuRemove')}</div>`;
};
MODALS.stuDecline = m => {
  const s = student(m.id);
  return `<div class="dialog__icon dialog__icon--danger">${ic('x', 22)}</div>
    <h2 class="h2">Decline ${esc(s.name)}?</h2>
    <p class="fine">${esc(s.client)} gets an email saying you don’t have availability to take on new students.</p>
    ${banner('warning', `${esc(s.name)} is deleted`, 'Nothing about them is kept. If they sign up again, they’ll be back on this list.')}
    <div class="dialog__actions">${B('Keep waiting', 'secondary', 'closeModal')}${B('Decline and email', 'danger', 'stuDecline')}</div>`;
};

MODALS.stuPrice = m => {
  const s = student(m.id), d = stuUi().price, up = stuUpcoming(s).length;
  const amt = Number(d.amount), bad = d.mode === 1 && !(amt > 0);
  const blocks = BLOCKS.map(b => `${esc(b.name)} · ${b.len} min · ${money(b.price)}`).join('<br>');
  return `<div class="dialog__icon">${ic('card', 22)}</div>
    <h2 class="h2">Price for ${esc(s.name)} ${badge('Phase 2', 'neutral')}</h2>
    <p class="fine">Families see the price when they book, and it’s on every payment reminder.</p>
    ${SEG(['Your schedule’s price', 'A personal price'], d.mode, 'stuPriceMode', [], { block: true })}
    ${d.mode === 0 ? `<div class="stu-blocks"><div class="label">${esc(s.name)} pays what each block costs</div><div class="fine">${blocks}</div></div>` : `
      <div class="field${bad ? ' field--error' : ''}"><label class="label" for="stu-price">Price per lesson</label>
        <div class="ctl ctl--money${bad ? ' is-error' : ''}"><span>$</span><input id="stu-price" type="number" min="1" step="1" inputmode="numeric" value="${esc(d.amount)}" data-bind="ui.stu.price.amount" data-live="1"><span class="ctl__unit">${state.profile.currency}</span></div>
        ${bad ? `<div class="hint hint--error">${ic('alert', 14)}Enter an amount above $0.</div>` : ''}</div>
      ${banner('warning', 'One price for every lesson length', `${esc(s.name)} pays ${amt > 0 ? money(amt) : 'this'} for every lesson, whatever its length or block. A 60-minute lesson costs the same as a 30-minute one.`)}`}
    <p class="fine">${up ? `Applies to lessons booked from now on. ${esc(s.name)}’s ${plural(up, 'upcoming lesson')} keep${up === 1 ? 's' : ''} ${up === 1 ? 'its' : 'their'} current price.` : 'Applies to lessons booked from now on.'}</p>
    <div class="dialog__actions">${B('Cancel', 'secondary', 'closeModal')}${B('Save price', 'primary', 'stuPriceSave', { disabled: bad })}</div>`;
};

/* ---------- actions ---------- */
Object.assign(ACTIONS, {
  stuTab(i) { go(i === 0 ? 'students' : 'pending'); },
  stuEditOpen(id) { const s = student(id); stuUi().draft = { client: s.client, email: s.email, phone: s.phone }; state.modal = { kind: 'stuEdit', id }; },
  stuEditSave() {
    const s = student(state.modal.id), d = stuUi().draft, old = s.client;
    for (const x of state.students.filter(x => x.client === old)) Object.assign(x, { client: d.client, email: d.email, phone: d.phone });
    if (s.rel === 'Self') s.name = d.client;
    state.modal = null; stuUi().draft = null; state.flash = `${d.client}’s contact details saved.`;
  },
  stuPriceOpen(id) { const s = student(id); stuUi().price = { mode: s.override ? 1 : 0, amount: s.override ? String(s.override) : '' }; state.modal = { kind: 'stuPrice', id }; },
  stuPriceMode(i) { stuUi().price.mode = i; },
  stuPriceSave() {
    const s = student(state.modal.id), d = stuUi().price, amt = Math.round(Number(d.amount));
    if (d.mode === 1 && !(amt > 0)) return;
    if (d.mode === 1) s.override = amt; else delete s.override;
    state.modal = null; state.flash = d.mode === 1 ? `${s.name} now pays ${money(amt)} per lesson for new bookings.` : `${s.name} now pays your schedule’s prices for new bookings.`;
  },
  stuRemoveOpen(id) { state.modal = { kind: 'stuRemove', id }; },
  stuRemove() {
    const s = student(state.modal.id), n = stuUpcoming(s).length;
    // A shared lesson goes on for the other skater: drop this skater from it, or hand the booking to the other skater.
    for (const l of state.lessons.filter(l => isShared(l) && stuIn(l, s) && !isStarted(l))) {
      if (l.sid === s.id) { const w = l.with.shift(); Object.assign(l, { sid: w.sid, status: w.status, pay: w.pay, paidBy: w.paidBy, price: w.price }); }
      else l.with = l.with.filter(w => w.sid !== s.id);
      if (!l.with.length) delete l.with;
    }
    state.lessons = state.lessons.filter(l => !(l.sid === s.id && !isStarted(l)));
    s.status = 'REMOVED';   // kept, not deleted: past lessons and payments still name them
    state.modal = null; state.flash = `${s.name} removed.${n ? ` ${plural(n, 'lesson')} cancelled and the family emailed.` : ''}`;
  },
  stuApprove(id) { const s = student(id); stuApproveOne(s); state.flash = `${s.name} approved. ${s.client} can now book.`; },
  stuApproveFamily(f) { const kids = pending().filter(s => s.client === f); kids.forEach(stuApproveOne); state.flash = `${kids.map(k => k.name).join(' and ')} approved. ${f} can now book.`; },
  stuDeclineOpen(id) { state.modal = { kind: 'stuDecline', id }; },
  stuDecline() {
    const s = student(state.modal.id);
    state.students = state.students.filter(x => x.id !== s.id); state.modal = null; state.flash = `${s.name} declined. ${s.rel === 'Self' ? 'They’ve' : s.client + ' has'} been emailed.`; },
});

/* ---------- presets ---------- */
PRESETS.push(
  { id: 'CoachStudents', file: 'students', group: 'Students', title: 'Student list', note: 'New. Every active skater with their skating organization and number from sign-up (ADR-029 d3), their family’s contact details and next lesson, searchable by name or contact. Everyone pays the schedule’s prices; personal prices are Phase 2 (owner, 2026-10-13).', setup: st => { st.screen = 'students'; } },
  { id: 'CoachStudentsEdit', file: 'students-edit', group: 'Students', title: 'Student list — edit contact', note: 'New. Contact details belong to the family, so an edit applies to every skater in it.', setup: st => { st.screen = 'students'; const e = st.students.find(x => x.id === 's3'); st.ui.stu = { search: '', draft: { client: e.client, email: e.email, phone: e.phone } }; st.modal = { kind: 'stuEdit', id: 's3' }; } },
  { id: 'CoachStudentsPrice', file: 'students-price', group: 'Phase 2', title: 'Student list — personal price', note: 'Phase 2 (moved by the owner, 2026-10-13: every skater pays the schedule’s prices in MVP). New. Sets priceMinorOverride (ADR-003 d2). Two rules are one reading of open questions: the price applies to every lesson length (Kim’s list §5), and lessons already booked keep their price (ADR-020 Open).', setup: st => { st.screen = 'students'; st.ui.stu = { search: '', draft: null, price: { mode: 1, amount: '45' } }; st.modal = { kind: 'stuPrice', id: 's4' }; } },
  { id: 'CoachStudentsRemove', file: 'students-remove', group: 'Phase 2', title: 'Student list — remove', note: 'Phase 2 (moved by the owner, 2026-10-13: MVP has no Remove button). New. One reading of an open decision (Open-Pending.md): upcoming lessons cancelled, no more booking, history kept.', setup: st => { st.screen = 'students'; st.modal = { kind: 'stuRemove', id: 's7' }; } },
  { id: 'CoachPending', file: 'pending', group: 'Students', title: 'Waiting for approval', note: 'New. Sign-ups grouped by family, each skater with their organization and number from sign-up (ADR-029), approve per skater or all at once; pending families see only their own account (ADR-022 d6). Approving changes only the skater’s record: no shared lesson waits on it (ADR-033).', setup: st => { st.screen = 'pending'; } },
  { id: 'CoachPendingDecline', file: 'pending-decline', group: 'Students', title: 'Waiting for approval — decline', note: 'New. Declining emails the family and deletes the student outright (ADR-002 2b).', setup: st => { st.screen = 'pending'; st.modal = { kind: 'stuDecline', id: 'p3' }; } },
  { id: 'CoachPendingEmpty', file: 'pending-empty', group: 'Students', title: 'Waiting for approval — nobody waiting', note: 'New. Empty state that reminds the coach of their code.', setup: st => { st.screen = 'pending'; st.students = st.students.filter(s => s.status !== 'PENDING'); } },
);
