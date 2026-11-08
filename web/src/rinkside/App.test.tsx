import { render, screen } from '@testing-library/react';
import { App } from './App';

test('renders the rinkside heading', () => {
  render(<App />);
  expect(screen.getByRole('heading', { name: 'Rinkside' })).toBeInTheDocument();
});
