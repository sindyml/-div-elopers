import {db,auth} from "./firebase";
import {collection, query, where, getDocs, doc, getDoc} from "firebase/firestore";

export const getUserGroups = async () => {
    const user = auth.currentUser;

    const q = query(collection(db,"memberships"),where("uid","==",user.uid));

    const snapshot = await getDocs(q);

    const groups = [];

    for (const membership of snapshot.docs) {
        const {groupId} = membership.data();

        const groupDoc = await getDoc(doc(db,"groups",groupId));
        if (groupDoc.exists()) {
            groups.push({
                id: groupId,
                ...groupDoc.data()
            });
        }
    }

    return groups;

};