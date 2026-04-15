import {initializeApp} from "firebase/app";
import {getFirestore} from "firebase/firestore";
import {getAuth} from "firebase/auth";

const firebaseConfiguration = {
    apiKey: "AIzaSyBPhe_IXilwwYXnWwOEm80dho7laI6LGTw",
  authDomain: "stokvel-database.firebaseapp.com",
  databaseURL: "https://stokvel-database-default-rtdb.firebaseio.com",
  projectId: "stokvel-database",
  storageBucket: "stokvel-database.firebasestorage.app",
  messagingSenderId: "997328421094",
  appId: "1:997328421094:web:9f88bf8ac720b118d97b27",
  measurementId: "G-2D5G4K33SP"
};

const app = initializeApp(firebaseConfiguration);

export const db = getFirestore(app);
export const auth = getAuth(app);