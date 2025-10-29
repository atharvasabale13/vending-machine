// NEW VERSION (Firebase v9+)
import { initializeApp } from 'firebase/app';
import { getDatabase } from 'firebase/database';

const firebaseConfig = {
  apiKey: "AIzaSyAP7R-tR9v_WQ-dm_lyC2yPMZjgC2nyHMw",
  authDomain: "vending-machine-5c2d8.firebaseapp.com",
  databaseURL: "https://vending-machine-5c2d8-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "vending-machine-5c2d8",
  storageBucket: "vending-machine-5c2d8.firebasestorage.app",
  messagingSenderId: "388829411695",
  appId: "1:388829411695:web:b7149a985a025f144c109a",
  measurementId: "G-ZQWJF90WLG"
  // YOUR CONFIG HERE
};

const app = initializeApp(firebaseConfig);
export const database = getDatabase(app);
