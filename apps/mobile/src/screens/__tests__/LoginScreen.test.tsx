import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';

import {
  mockSignInWithEmailAndPassword,
  resetFirebaseMocks,
} from '../../__mocks__/firebase';

// Mock firebase/auth and ../lib/firebase using shared mocks
jest.mock('firebase/auth', () => require('../../__mocks__/firebase').firebaseAuthModule);
jest.mock('../../lib/firebase', () => require('../../__mocks__/firebase').firebaseModule);

// Mock expo-web-browser (maybeCompleteAuthSession is called at module scope)
jest.mock('expo-web-browser', () => ({
  maybeCompleteAuthSession: jest.fn(),
}));

// Mock expo-auth-session/providers/google — useAuthRequest returns [request, response, promptAsync]
const mockPromptAsync = jest.fn();
jest.mock('expo-auth-session/providers/google', () => ({
  useAuthRequest: jest.fn(() => [
    { type: 'request' }, // request object (truthy so Google button is enabled)
    null, // response
    mockPromptAsync,
  ]),
}));

// Spy on Alert.alert to verify error messages
jest.spyOn(Alert, 'alert');

import LoginScreen from '../LoginScreen';

describe('LoginScreen', () => {
  const mockOnNavigateToSignup = jest.fn();

  beforeEach(() => {
    resetFirebaseMocks();
    mockOnNavigateToSignup.mockClear();
    mockPromptAsync.mockClear();
    (Alert.alert as jest.Mock).mockClear();
  });

  it('renders email and password text inputs', () => {
    const { getByPlaceholderText } = render(
      <LoginScreen onNavigateToSignup={mockOnNavigateToSignup} />,
    );

    expect(getByPlaceholderText('Email')).toBeTruthy();
    expect(getByPlaceholderText('Password')).toBeTruthy();
  });

  it('renders a Sign In button', () => {
    const { getByText } = render(
      <LoginScreen onNavigateToSignup={mockOnNavigateToSignup} />,
    );

    expect(getByText('Sign In')).toBeTruthy();
  });

  it('tapping Sign In with valid inputs calls signInWithEmailAndPassword', async () => {
    const { getByPlaceholderText, getByText } = render(
      <LoginScreen onNavigateToSignup={mockOnNavigateToSignup} />,
    );

    fireEvent.changeText(getByPlaceholderText('Email'), 'user@test.com');
    fireEvent.changeText(getByPlaceholderText('Password'), 'password123');
    fireEvent.press(getByText('Sign In'));

    await waitFor(() => {
      expect(mockSignInWithEmailAndPassword).toHaveBeenCalledWith(
        expect.anything(), // auth object
        'user@test.com',
        'password123',
      );
    });
  });

  it('displays error message when auth fails', async () => {
    mockSignInWithEmailAndPassword.mockRejectedValueOnce(
      new Error('Wrong password'),
    );

    const { getByPlaceholderText, getByText } = render(
      <LoginScreen onNavigateToSignup={mockOnNavigateToSignup} />,
    );

    fireEvent.changeText(getByPlaceholderText('Email'), 'user@test.com');
    fireEvent.changeText(getByPlaceholderText('Password'), 'badpass');
    fireEvent.press(getByText('Sign In'));

    await waitFor(() => {
      expect(Alert.alert).toHaveBeenCalledWith('Login Error', 'Wrong password');
    });
  });

  it('shows validation error when fields are empty', () => {
    const { getByText } = render(
      <LoginScreen onNavigateToSignup={mockOnNavigateToSignup} />,
    );

    fireEvent.press(getByText('Sign In'));

    expect(Alert.alert).toHaveBeenCalledWith(
      'Error',
      'Please enter email and password',
    );
    expect(mockSignInWithEmailAndPassword).not.toHaveBeenCalled();
  });

  it('tapping Sign Up link triggers navigation to signup screen', () => {
    const { getByText } = render(
      <LoginScreen onNavigateToSignup={mockOnNavigateToSignup} />,
    );

    fireEvent.press(getByText("Don't have an account? Sign up"));

    expect(mockOnNavigateToSignup).toHaveBeenCalledTimes(1);
  });
});
