import { render, screen } from '@testing-library/react';
import { App } from './App';

test('renders the family heading', () => {
  render(<App />);
  expect(screen.getByRole('heading', { name: 'Family website' })).toBeInTheDocument();
});
