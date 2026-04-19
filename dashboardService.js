import { db, auth } from "./firebase";
import {
  collection,
  query,
  where,
  getDocs,
  doc,
  getDoc
} from "firebase/firestore";

export const getUserGroups = async () => {
  try {
    const user = auth.currentUser;

    if (!user) return [];

    const q = query(
      collection(db, "memberships"),
      where("uid", "==", user.uid)
    );

    const snapshot = await getDocs(q);

    const groupPromises = snapshot.docs.map(async (membership) => {
      const { groupId } = membership.data();

      const groupDoc = await getDoc(doc(db, "groups", groupId));

      if (groupDoc.exists()) {
        return {
          id: groupId,
          ...groupDoc.data()
        };
      }

      return null;
    });

    const groups = await Promise.all(groupPromises);

    return groups.filter(g => g !== null);

  } catch (err) {
    console.error("Error loading groups:", err);
    return [];
  }
};