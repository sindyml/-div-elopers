
import { db } from "./firebase-config";
import { doc, setDoc } from "firebase/firestore";

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


// Email/Password signup
export async function signup(email, password) {
  const userCredential = await createUserWithEmailAndPassword(auth, email, password);

  await createUserProfile(userCredential.user);

  return userCredential;
}

// Email/Password login
export const login = (email, password) =>
  signInWithEmailAndPassword(auth, email, password);

// 🔥 GOOGLE LOGIN (NEW)
export async function loginWithGoogle() {
  const provider = new GoogleAuthProvider();

  const result = await signInWithPopup(auth, provider);

  // Create Firestore profile if new user
  await createUserProfile(result.user);

  return result;
}

// Logout
export const logout = () =>
  signOut(auth);