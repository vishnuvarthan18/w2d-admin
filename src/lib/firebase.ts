import { initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth } from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore';

/**
 * Same Firebase project as the mobile app (`wedding2day-a99ea`).
 * Web appId is a local placeholder — emulators key off projectId only.
 * Replace with a real Web app config from Firebase Console before cloud deploy.
 */
const firebaseConfig = {
  apiKey: 'AIzaSyBorGtFLbTeK8xSUbLUhYsrd_WZUDsRLLs',
  authDomain: 'wedding2day-a99ea.firebaseapp.com',
  projectId: 'wedding2day-a99ea',
  storageBucket: 'wedding2day-a99ea.firebasestorage.app',
  messagingSenderId: '641763019831',
  appId: '1:641763019831:web:w2dadmin000000000000',
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

const useEmulators =
  import.meta.env.DEV || import.meta.env.VITE_USE_EMULATORS === 'true';

let emulatorsConnected = false;

if (useEmulators && !emulatorsConnected) {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', {
    disableWarnings: true,
  });
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
  emulatorsConnected = true;
}
