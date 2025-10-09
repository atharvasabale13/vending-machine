// src/firebase.js - Complete File

import { initializeApp } from 'firebase/app';
import { getDatabase } from 'firebase/database';

const firebaseConfig = {
  databaseURL: "https://vending-machine-5c2d8-default-rtdb.asia-southeast1.firebasedatabase.app/"  // Replace with your actual Firebase URL
};

const app = initializeApp(firebaseConfig);
const database = getDatabase(app);

export { database };
