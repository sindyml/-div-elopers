import {auth, db} from "./firebase";
import {onAuthStateChanged} from "firebase/auth";
import {collection, query, where, getDocs} from "firebase/firestore"
import {
  collection,
  query,
  where,
  getDocs,
  updateDoc,
  Timestamp
} from "firebase/firestore";

//Listen for authentication state changes
export const listenForAuth = (callback) => {
    onAuthStateChanged(auth, async (user) => {
        if (user){
            console.log("User logged in: ",user.email);

            //fetch the invites that are pending
            const invites = await getPendingInvites(user);

            //pass user and invite to the UI
            if (callback){
                callback(user,invites);
            }
        } else{
            console.log("User logged out")
        }
    });
};

//getting all pending invites for logged-in user
export const getPendingInvites = async (user) => {

  const now = Timestamp.now();

  const q = query(
    collection(db, "invites"),
    where("email", "==", user.email)
  );

  const snapshot = await getDocs(q);

  const validInvites = [];

  for (const docSnap of snapshot.docs) {

    const invite = docSnap.data();

    // expire old invites
    if (
      invite.expiresAt &&
      invite.expiresAt.toMillis() < now.toMillis()
    ) {

      await updateDoc(docSnap.ref, {
        status: "expired"
      });

      invite.status = "expired";
    }

    validInvites.push({
      id: docSnap.id,
      ...invite
    });
  }

  return validInvites;
};