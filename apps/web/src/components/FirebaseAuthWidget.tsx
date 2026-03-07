'use client';

import { useEffect, useRef, useState } from 'react';
import { EmailAuthProvider, GoogleAuthProvider } from 'firebase/auth';
import firebase from 'firebase/compat/app';
import 'firebase/compat/auth';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || 'demo-api-key',
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || 'demo-project.firebaseapp.com',
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'demo-project',
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || 'demo-project.appspot.com',
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || '000000000000',
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || '1:000000000000:web:000000000000',
};

// Initialize compat app for FirebaseUI
if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}

// Connect compat auth to emulator if configured
if (process.env.NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST) {
  firebase.auth().useEmulator(`http://${process.env.NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST}`);
}

const uiConfig: firebaseui.auth.Config = {
  signInFlow: 'popup',
  signInSuccessUrl: '/',
  signInOptions: [
    EmailAuthProvider.PROVIDER_ID,
    GoogleAuthProvider.PROVIDER_ID,
  ],
};

export default function FirebaseAuthWidget() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Dynamically import firebaseui (browser-only)
    let uiInstance: firebaseui.auth.AuthUI | null = null;

    import('firebaseui').then((firebaseui) => {
      if (!containerRef.current) return;
      uiInstance =
        firebaseui.auth.AuthUI.getInstance() ||
        new firebaseui.auth.AuthUI(firebase.auth());
      uiInstance.start(containerRef.current, uiConfig);
      setLoading(false);
    });

    return () => {
      uiInstance?.reset();
    };
  }, []);

  return (
    <>
      {loading && (
        <p className="text-center text-gray-400 py-4">Loading...</p>
      )}
      <div ref={containerRef} />
    </>
  );
}
