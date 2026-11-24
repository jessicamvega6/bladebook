import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test, vi } from 'vitest';
import { Field } from './harbor';

test('a password Field with reveal shows and hides what was typed', async () => {
  render(<Field label="Password" type="password" value="skate1234" onChange={vi.fn()} reveal />);
  const box = screen.getByLabelText('Password');
  expect(box).toHaveAttribute('type', 'password');

  await userEvent.click(screen.getByRole('button', { name: 'Show password' }));
  expect(box).toHaveAttribute('type', 'text');

  await userEvent.click(screen.getByRole('button', { name: 'Hide password' }));
  expect(box).toHaveAttribute('type', 'password');
});

test('a password Field without reveal has no Show button', () => {
  render(<Field label="Password" type="password" value="" onChange={vi.fn()} />);
  expect(screen.queryByRole('button', { name: 'Show password' })).toBeNull();
});
