import { render, screen } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { scheduleApi, type ChangeStatusDto } from '../api';
import { SaveStatus, acceptLabel } from './ScheduleReview';

afterEach(() => vi.unstubAllGlobals());

const status = (s: Partial<ChangeStatusDto>) => {
  vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response(JSON.stringify({
    exists: true, createdAt: new Date().toISOString(), executionStatus: 'EXECUTED', lessonCount: 3, clientCount: 2, stuck: false, passed: [], ...s,
  }), { status: 200 }))));
};

test('a finished save says how many families were emailed and goes back to the schedule', async () => {
  status({});
  render(<SaveStatus api={scheduleApi('t')} lessons={3} families={2} since={Date.now() - 500} onError={vi.fn()} />);
  expect(await screen.findByRole('heading', { name: 'Saved' })).toBeInTheDocument();
  expect(screen.getByText('2 families emailed.')).toBeInTheDocument();
  expect(screen.getByText('Updating 3 lessons')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Back to your schedule' })).toHaveAttribute('href', '#/schedule');
});

test('a save that touched no booking wrote no batch, and says nobody needed telling', async () => {
  status({ exists: false, createdAt: null, executionStatus: null });
  render(<SaveStatus api={scheduleApi('t')} lessons={0} families={0} since={Date.now()} onError={vi.fn()} />);
  expect(await screen.findByText('No families needed telling.')).toBeInTheDocument();
});

test('a change still applying says so, and one stuck for over an hour says families haven’t been told', async () => {
  status({ executionStatus: 'PLANNED' });
  const view = render(<SaveStatus api={scheduleApi('t')} lessons={3} families={2} since={Date.now() - 500} onError={vi.fn()} />);
  expect(await screen.findByRole('heading', { name: 'Saving your changes' })).toBeInTheDocument();
  expect(screen.getByText('You can leave this page — saving carries on in the background.')).toBeInTheDocument();
  view.unmount();

  status({ executionStatus: 'PLANNED', stuck: true });
  render(<SaveStatus api={scheduleApi('t')} lessons={3} families={2} since={Date.now() - 500} onError={vi.fn()} />);
  expect(await screen.findByText('We’re having trouble applying this change. We’ve been alerted, and your families haven’t been notified yet.')).toBeInTheDocument();
});

test('the accept button names the families, or waits for the big-change tick', () => {
  const p = { cancel: [], reprice: [], kept: [], families: 0, big: [] };
  expect(acceptLabel(p, false)).toBe('Accept & save');
  expect(acceptLabel({ ...p, families: 1 }, false)).toBe('Accept & email 1 family');
  const big = { ...p, big: [{ seq: 1, label: 'x', fromMinor: 100, toMinor: 10, percent: 90, cut: true }] };
  expect(acceptLabel(big, false)).toBe('Tick the box above to continue');
  expect(acceptLabel(big, true)).toBe('Accept & save');
});
