import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import App from './App';

describe('App', () => {
  it('renders WoodieCampus home page', () => {
    render(<App />);
    expect(screen.getByText('WoodieCampus - Home')).toBeInTheDocument();
    expect(screen.getByText('Welcome to WoodieCampus platform')).toBeInTheDocument();
  });

  it('renders navigation links', () => {
    render(<App />);
    expect(screen.getByRole('link', { name: 'Home' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'About' })).toBeInTheDocument();
  });
});