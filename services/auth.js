import {auth,db} from "./firebase";
import {onAuthStateChanged} from "firebase/auth";
import {collection,query,where,getDocs,doc,setDoc,updateDoc,serverTimestamp} from "firebase/firestore";

export const listenForAuth = () => {
    onAuthStateChanged(auth,async (user) => {
        if (user) {
            console.log("User Logged in:",user.email);
            await checkInvites(user);
        }
    });
};

const checkInvites = async (user) => {
    const q = query(collection(db,"invites"), where("email","==","pending"));


const snapshot = await getDocs(q);

for (const docSnapshot of snapshot.docs) {
    const invite = docSnapshot.data();

    //Adding user to group members 
    await setDoc(doc(db,"groups",invite.groupId,"members",user.uid), {
        uid: user.uid,
        role: "member",
        joinedAt: serverTimestamp()
    });

    //Adding membership record for the dashboard
   await setDoc(doc(db, "memberships", `${user.uid}_${invite.groupId}`), {
      uid: user.uid,
      groupId: invite.groupId
    });

    //marking the invite as accepted
    await updateDoc(docSnapshot.ref, {
        status: "invite accepted"
    });
}
};