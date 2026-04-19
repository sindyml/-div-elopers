import {auth, db} from "./firebase";
import {onAuthStateChanged} from "firebase/auth";
import {collection, query, where, getDocs} from "firebase/firestore"

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
    try {
        const q = query(
    collection(db, "invites"),
    where("email","==",user.email),
    where("status","==","pending")
        );

    const snapshot = await getDocs(q);

    return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
    }));

    }catch (error){
        console.error("Error fetching invites:",error);
        return [];
    }
};