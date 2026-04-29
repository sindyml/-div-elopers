// js/userService.js
import { db } from './firebase-config.js';
import { doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { COLLECTIONS } from './constants.js';

export async function getUserProfile(uid) {
  const userDoc = await getDoc(doc(db, COLLECTIONS.USERS, uid));
  if (userDoc.exists()) {
    return { uid, ...userDoc.data() };
  }
  return null;
}

export async function createUserProfile(uid, data) {
  await setDoc(doc(db, COLLECTIONS.USERS, uid), {
    ...data,
    createdAt: new Date().toISOString()
  });
}
