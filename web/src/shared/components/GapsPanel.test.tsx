import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test } from 'vitest';
import { GapsPanel } from './GapsPanel';

test('lists shortcuts and gaps when opened', async () => {
  render(<GapsPanel items={[
    { id: 'SC-1', kind: 'shortcut', what: 'Local token stub.', closedBy: 'Cognito' },
    { id: 'A1', kind: 'gap', what: 'No photo upload.', closedBy: 'Phase 2' },
  ]} />);
  const toggle = screen.getByRole('button', { name: /Gaps & shortcuts/ });
  expect(toggle).toHaveAttribute('aria-expanded', 'false');
  expect(screen.queryByText('Local token stub.', { exact: false })).not.toBeInTheDocument();

  await userEvent.click(toggle);
  expect(toggle).toHaveAttribute('aria-expanded', 'true');
  expect(screen.getByText('Shortcuts (faked for now)')).toBeInTheDocument();
  expect(screen.getByText('Local token stub.', { exact: false })).toBeInTheDocument();
  expect(screen.getByText('Closed by: Phase 2')).toBeInTheDocument();
});
