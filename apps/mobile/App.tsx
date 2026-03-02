import { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider, useAuth } from './src/lib/auth-context';
import LoginScreen from './src/screens/LoginScreen';
import SignupScreen from './src/screens/SignupScreen';
import HomeScreen from './src/screens/HomeScreen';
import FriendsScreen from './src/screens/FriendsScreen';

type AuthScreen = 'login' | 'signup';
type AppTab = 'home' | 'friends';

function TabBar({ activeTab, onTabPress }: { activeTab: AppTab; onTabPress: (tab: AppTab) => void }) {
  return (
    <View style={tabStyles.bar}>
      <TouchableOpacity
        style={tabStyles.tab}
        onPress={() => onTabPress('home')}
        accessibilityRole="tab"
        accessibilityState={{ selected: activeTab === 'home' }}
      >
        <Text style={[tabStyles.tabText, activeTab === 'home' && tabStyles.activeTabText]}>
          🏠 Home
        </Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={tabStyles.tab}
        onPress={() => onTabPress('friends')}
        accessibilityRole="tab"
        accessibilityState={{ selected: activeTab === 'friends' }}
      >
        <Text style={[tabStyles.tabText, activeTab === 'friends' && tabStyles.activeTabText]}>
          👥 Friends
        </Text>
      </TouchableOpacity>
    </View>
  );
}

function AppNavigator() {
  const { user, loading } = useAuth();
  const [authScreen, setAuthScreen] = useState<AuthScreen>('login');
  const [activeTab, setActiveTab] = useState<AppTab>('home');

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

  return (
    <View style={styles.appContainer}>
      <View style={styles.screenContainer}>
        {activeTab === 'home' ? <HomeScreen /> : <FriendsScreen />}
      </View>
      <TabBar activeTab={activeTab} onTabPress={setActiveTab} />
    </View>
  );
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
  appContainer: {
    flex: 1,
    backgroundColor: '#fff',
  },
  screenContainer: {
    flex: 1,
  },
});

const tabStyles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: '#eee',
    backgroundColor: '#fff',
    paddingBottom: 24,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
  },
  tabText: {
    fontSize: 13,
    color: '#9ca3af',
    fontWeight: '500',
  },
  activeTabText: {
    color: '#E05A00',
    fontWeight: '700',
  },
});
