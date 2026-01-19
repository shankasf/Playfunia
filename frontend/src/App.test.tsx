import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

jest.mock('./context/AuthContext', () => ({
  useAuth: () => ({
    user: null,
    isTeamMember: false,
  }),
}));

jest.mock('./components/cart/CartIcon', () => ({
  CartIcon: () => null,
}));

jest.mock('./components/chat/Chatbot', () => ({
  Chatbot: () => null,
}));

jest.mock('./pages/HomePage', () => ({
  HomePage: () => <h1>Home</h1>,
}));

import App from './App';

test('renders the home route', () => {
  render(
    <MemoryRouter initialEntries={['/']}>
      <App />
    </MemoryRouter>
  );
  expect(screen.getByRole('heading', { name: /home/i })).toBeInTheDocument();
});
