/**
 * Students (design: coach/screens-students.js — students, pending, pending-decline, pending-empty).
 *
 * Students: every approved skater with their organization and number, and the family's contact details,
 * searchable. Read-only (A4): families change their details on their own profile. Personal prices and Remove
 * are Phase 2 (owner, 2026-10-13).
 * Waiting for approval: sign-ups grouped by family; approve one skater or a whole family, or decline, which
 * deletes the record (ADR-MASTER section 5). The decline email isn't sent yet (shortcut SC-9).
 */
import { useId, useState } from 'react';
import { Avatar, Banner, Button, Card, Dialog, Field, Icon, Row } from '../../shared/components/harbor';
import { joinNames } from '../../shared/logic/names';
import { orgName } from '../../shared/logic/registrationNumber';
import type { Profile, StudentApi, StudentDto, StudentsDto } from '../api';

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const shortDate = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

function Contact({ s }: { s: StudentDto }) {
  return (
    <div className="stu-contact">
      <span><Icon name="mail" size={13} />{s.clientEmail}</span>
      <span><Icon name="phone" size={13} />{s.clientPhone}</span>
    </div>
  );
}

function Tabs({ data, on }: { data: StudentsDto; on: 'students' | 'pending' }) {
  const tab = (label: string, n: number, href: string, active: boolean, attn = false) => (
    <a className={`seg__opt${active ? ' is-on' : ''}`} href={href} aria-current={active ? 'page' : undefined}>
      {label} <span className={`stu-count${attn && n ? ' stu-count--attn' : ''}`}>{n}</span>
    </a>
  );
  return (
    <div className="seg" role="group" aria-label="Students">
      {tab('Students', data.active.length, '#/students', on === 'students')}
      {tab('Waiting for approval', data.pending.length, '#/students/pending', on === 'pending', true)}
    </div>
  );
}

/** A family's waiting skaters, in sign-up order. */
function families(pending: StudentDto[]): StudentDto[][] {
  const by = new Map<string, StudentDto[]>();
  for (const s of pending) by.set(s.familyId, [...(by.get(s.familyId) ?? []), s]);
  return [...by.values()];
}

function Roster({ data }: { data: StudentsDto }) {
  const [search, setSearch] = useState('');
  const q = search.trim().toLowerCase();
  const list = data.active.filter((s) => !q || [s.studentName, s.clientName, s.clientEmail, s.clientPhone].some((v) => v.toLowerCase().includes(q)));
  const familyCount = new Set(data.active.map((s) => s.familyId)).size;
  return (
    <>
      <div className="stu-search"><Field label="Search" value={search} onChange={setSearch} placeholder="Name, family, email or phone" /></div>
      <Card flush title={plural(list.length, 'student')} sub={q ? `Matching “${search.trim()}”` : plural(familyCount, 'family', 'families')}>
        {list.length ? (
          <>
            <div className="stu-tablewrap">
              <table className="table stu-table">
                <thead><tr><th>Skater</th><th>Skater number</th><th>Family contact</th></tr></thead>
                <tbody>{list.map((s) => (
                  <tr key={s.studentId}>
                    <td><span className="cellname"><Avatar name={s.studentName} size="sm" /><span><b>{s.studentName}</b><span className="stu-sub">{s.isMinor ? 'Minor' : 'Adult'}</span></span></span></td>
                    <td><span className="mono">{s.registrationNumber}</span><span className="stu-sub">{orgName(s.skatingOrg)}</span></td>
                    <td><b>{s.clientName}</b><span className="stu-sub">{s.relationship === 'SELF' ? 'Books for themselves' : 'Guardian'}</span><Contact s={s} /></td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
            <div className="card__note"><Icon name="info" size={14} /> Contact details are the family’s. Families change them on their own profile.</div>
          </>
        ) : q ? (
          <div className="pempty"><span className="pempty__icon"><Icon name="users" size={22} /></span><b>No students match “{search.trim()}”</b><span className="muted">Try a first name, a family name or a phone number.</span></div>
        ) : (
          <div className="pempty"><span className="pempty__icon"><Icon name="users" size={22} /></span><b>No students yet</b><span className="muted">Skaters appear here once you approve them under <a className="link" href="#/students/pending">Waiting for approval</a>.</span></div>
        )}
      </Card>
    </>
  );
}

function Pending({ data, profile, busy, onApprove, onDecline }: {
  data: StudentsDto; profile: Profile; busy: boolean; onApprove: (kids: StudentDto[]) => void; onDecline: (s: StudentDto) => void;
}) {
  return (
    <>
      <Banner tone="info" title="They can’t see your times until you approve them">
        A family waiting here sees only their own account: no schedule, no open times, no contact details. Your coach code can be passed around, so approving is how you check you know them.
      </Banner>
      {data.pending.length ? (
        <div className="stack">{families(data.pending).map((kids) => {
          const c = kids[0]!;
          return (
            <Card key={c.familyId} flush title={c.clientName}
              sub={c.relationship === 'SELF' ? 'Signing up for themselves' : `Guardian · ${plural(kids.length, 'skater')}`}
              action={kids.length > 1 ? <Button variant="secondary" sm icon="check" disabled={busy} onClick={() => onApprove(kids)}>Approve all</Button> : undefined}>
              <div className="stu-family"><Contact s={c} /><span className="muted-sm">Signed up {shortDate(c.signedUpAt)}</span></div>
              {kids.map((k) => (
                <Row key={k.studentId} lead={<Avatar name={k.studentName} size="sm" />} title={k.studentName}
                  sub={<>{k.isMinor ? 'Minor' : 'Adult · booking for themselves'} · {orgName(k.skatingOrg)} <span className="mono">{k.registrationNumber}</span></>}
                  side={<>
                    <Button variant="ghost" sm disabled={busy} onClick={() => onDecline(k)}>Decline</Button>
                    <Button sm icon="check" disabled={busy} onClick={() => onApprove([k])}>Approve</Button>
                  </>} />
              ))}
            </Card>
          );
        })}</div>
      ) : (
        <Card>
          <div className="pempty"><span className="pempty__icon"><Icon name="check" size={22} /></span><b>Nobody is waiting</b>
            <span className="muted">When a family signs up with your code, they’ll appear here. Share your code: <b className="mono">{profile.coachCode}</b></span></div>
        </Card>
      )}
    </>
  );
}

export function Students({ api, profile, data, tab, onChange, onError }: {
  api: StudentApi; profile: Profile; data: StudentsDto; tab: 'students' | 'pending';
  onChange: (d: StudentsDto) => void; onError: (e: unknown) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState('');
  const [declining, setDeclining] = useState<StudentDto | null>(null);
  const titleId = useId();

  const run = async (call: () => Promise<StudentsDto>, done: string) => {
    setBusy(true);
    setFlash('');
    try {
      onChange(await call());
      setFlash(done);
    } catch (e) {
      onError(e);
    } finally {
      setBusy(false);
    }
  };
  const approve = (kids: StudentDto[]) => run(() => api.approve(kids.map((k) => k.studentId)),
    `${joinNames(kids.map((k) => k.studentName))} approved. ${kids[0]!.clientName} can now book.`);
  const decline = (s: StudentDto) => {
    setDeclining(null);
    void run(() => api.decline(s.studentId), `${s.studentName} declined. ${s.relationship === 'SELF' ? 'They’ve' : `${s.clientName} has`} been emailed.`);
  };
  const head = tab === 'students' ? 'Everyone you coach, and how to reach their family.' : 'New families who entered your coach code.';

  return (
    <>
      <div className="phead">
        <div className="phead__text"><h1 className="h1">Students</h1><p className="lede">{head}</p></div>
        <div className="phead__actions"><Tabs data={data} on={tab} /></div>
      </div>
      {flash && <Banner tone="success">{flash}</Banner>}
      {tab === 'students' ? <Roster data={data} /> : <Pending data={data} profile={profile} busy={busy} onApprove={approve} onDecline={setDeclining} />}
      {declining && (
        <Dialog labelledBy={titleId} onClose={() => setDeclining(null)}>
          <div className="dialog__icon dialog__icon--danger"><Icon name="x" size={22} /></div>
          <h2 className="h2" id={titleId}>Decline {declining.studentName}?</h2>
          <p className="fine">{declining.clientName} gets an email saying you don’t have availability to take on new students.</p>
          <Banner tone="warning" title={`${declining.studentName} is deleted`}>Nothing about them is kept. If they sign up again, they’ll be back on this list.</Banner>
          <div className="dialog__actions">
            <Button variant="secondary" onClick={() => setDeclining(null)}>Keep waiting</Button>
            <Button variant="danger" onClick={() => decline(declining)}>Decline and email</Button>
          </div>
        </Dialog>
      )}
    </>
  );
}
