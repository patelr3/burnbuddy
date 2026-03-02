import { useState } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider, useAuth } from './src/lib/auth-context';
import LoginScreen from './src/screens/LoginScreen';
import SignupScreen from './src/screens/SignupScreen';
import HomeScreen from './src/screens/HomeScreen';

type AuthScreen = 'login' | 'signup';

function AppNavigator() {
  const { user, loading } = useAuth();
  const [authScreen, setAuthScreen] = useState<AuthScreen>('login');

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color="#E05A00" />
      </View>
    );
  }

  if (!user) {
    if (authScreen === 'signup') {
      return (
        <SignupScreen onNavigateToLogin={() => setAuthScreen('login')} />
      );
    }
    return (
      <LoginScreen onNavigateToSignup={() => setAuthScreen('signup')} />
    );
  }

  return <HomeScreen />;
}

export default function App() {
  return (
    <AuthProvider>
      <StatusBar style="auto" />
      <AppNavigator />
    </AuthProvider>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
});
