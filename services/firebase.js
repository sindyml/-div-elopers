import {initializeApp} from "firebase/app";
import {getFirestore} from "firebase/firestore";
import {getAuth} from "firebase/auth";

// Firebase configuration loaded from environment variables.
// In Azure Static Web Apps the values come from Application Settings;
// locally, set them in a .env file (see .env.example).
const firebaseConfiguration = {
    apiKey:            process.env.FIREBASE_API_KEY            || '',
    authDomain:        process.env.FIREBASE_AUTH_DOMAIN        || '',
    databaseURL:       process.env.FIREBASE_DATABASE_URL       || '',
    projectId:         process.env.FIREBASE_PROJECT_ID         || '',
    storageBucket:     process.env.FIREBASE_STORAGE_BUCKET     || '',
    messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || '',
    appId:             process.env.FIREBASE_APP_ID             || '',
    measurementId:     process.env.FIREBASE_MEASUREMENT_ID     || '',
};

const app = initializeApp(firebaseConfiguration);

export const db = getFirestore(app);
export const auth = getAuth(app);