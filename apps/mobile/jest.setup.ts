// Baseline React Native module mocks for Jest

// Mock expo-modules-core to prevent native module resolution errors
jest.mock('expo-modules-core', () => ({
  NativeModulesProxy: new Proxy(
    {},
    { get: () => jest.fn() },
  ),
  requireNativeModule: jest.fn(() => ({})),
  requireOptionalNativeModule: jest.fn(() => null),
  EventEmitter: jest.fn().mockImplementation(() => ({
    addListener: jest.fn(),
    removeListeners: jest.fn(),
  })),
}));

// Mock expo-notifications to avoid native module errors
jest.mock('expo-notifications', () => ({
  getPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
  requestPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
  getExpoPushTokenAsync: jest.fn().mockResolvedValue({ data: 'mock-token' }),
  setNotificationHandler: jest.fn(),
  addNotificationReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  addNotificationResponseReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  scheduleNotificationAsync: jest.fn(),
}));

// Silence console.warn for act() warnings in tests
const originalWarn = console.warn;
console.warn = (...args: unknown[]) => {
  if (typeof args[0] === 'string' && args[0].includes('inside a test was not wrapped in act')) {
    return;
  }
  originalWarn(...args);
};
