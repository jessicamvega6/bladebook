import { render, screen } from '@testing-library/react';
import { App } from './App';

test('renders the coach heading', () => {
  render(<App />);
  expect(screen.getByRole('heading', { name: 'Coach website' })).toBeInTheDocument();
});
