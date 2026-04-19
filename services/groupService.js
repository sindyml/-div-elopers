import {db,auth} from "./firebase";
import {collection,addDoc,setDoc,doc,serverTimestamp} from "firebase/firestore";

export const createGroup = async ({
    name,
    contributionAmount,
    payoutOrder,
    meetingFrequency
}) => {
    const user = auth.currentUser;

    const groupReference = await addDoc(collection(db,"groups"), {
        name,
        contributionAmount: Number(contributionAmount),
        payoutOrder,
        meetingFrequency,
        createUid: user.uid,
        createdAt: serverTimestamp()
    });

    //adding user as an admin in the members collection
    await setDoc(doc(db,"groups",groupReference.id,"members",user.uid),{
        uid: user.uid,
        role: "admin",
        joinedAt: serverTimestamp()
    });

   

    //adding the membership record
    await setDoc(doc(db, "memberships", `${user.uid}_${groupReference.id}`), {
    uid: user.uid,
    groupId: groupRef.id
  });

  return groupReference.id;
};

//function to assign treasurer and remove any existing treasurer (if any)
export const assignTreasurer = async (groupId, newUserId) => {
  //Find current treasurer
  const q = query(
    collection(db, "groups", groupId, "members"),
    where("role", "==", "treasurer")
  );

  const snapshot = await getDocs(q);

  //Remove existing treasurer (if any)
  for (const docSnap of snapshot.docs) {
    await updateDoc(docSnap.ref, {
      role: "member"
    });
  }

  //Assign new treasurer
  await updateDoc(
    doc(db, "groups", groupId, "members", newUserId),
    { role: "treasurer" }
  );
};

export const assignAdmin = async (groupId, newUserId) => {
  //Find current admin
  const q = query(
    collection(db, "groups", groupId, "members"),
    where("role", "==", "admin")
  );

  const snapshot = await getDocs(q);

  //Remove existing admin
  for (const docSnap of snapshot.docs) {
    await updateDoc(docSnap.ref, {
      role: "member"
    });
  }

  //Assign new admin
  await updateDoc(
    doc(db, "groups", groupId, "members", newUserId),
    { role: "admin" }
  );
};

export const sendInvite = async (email, groupId) => {
  const user = auth.currentUser;

  await addDoc(collection(db, "invites"), {
    email,
    groupId,
    invitedBy: user.uid,
    status: "pending",
    createdAt: serverTimestamp()
  });


};

//only admins can invite
export const canInvite = (role) => {
  return role === "admin";
};

//only admins can assign the treasurer
export const canAssignTreasurer = (role) => {
  return role === "admin";
};

//everyone can view the dashboard
export const canViewDashboard = (role) => {
  return role === "admin" || role === "treasurer" || role === "member";
};

//logic to check if a user is an admin
function isAdmin(groupId) {
  return get(
    /databases/$(database)/documents/groups/$(groupId)/members/$(request.auth.uid)
  ).data.role == "admin";
  
}
