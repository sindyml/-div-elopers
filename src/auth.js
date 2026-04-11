import { auth, db } from "./firebase-config";

import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  GoogleAuthProvider,
  signInWithPopup
} from "firebase/auth";

import { doc, setDoc } from "firebase/firestore";


// 🔥 Create user profile in Firestore
export async function createUserProfile(user, extraData = {}) {
  if (!user) return;

  await setDoc(doc(db, "users", user.uid), {
    uid: user.uid,
    email: user.email,
    createdAt: new Date(),
    role: "user",
    ...extraData
  });
}


// 🔐 SIGNUP
export async function signup(email, password) {
  const userCredential = await createUserWithEmailAndPassword(auth, email, password);

  await createUserProfile(userCredential.user);

  return userCredential;
}


// 🔐 LOGIN
export const login = (email, password) =>
  signInWithEmailAndPassword(auth, email, password);


// 🔥 GOOGLE LOGIN
export async function loginWithGoogle() {
  const provider = new GoogleAuthProvider();

  const result = await signInWithPopup(auth, provider);

  await createUserProfile(result.user);

  return result;
}


// 🚪 LOGOUT
export const logout = () => signOut(auth);



