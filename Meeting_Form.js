//import {db} from './firebase';
import { db } from "./firebase.js";
import { collection, query, where, getDocs } from "firebase/firestore";
import { getAuth, onAuthStateChanged } from "firebase/auth";

// Initialize Firebase Auth
const auth = getAuth();

onAuthStateChanged(auth, async (user) => {
  if (user) {
    // Assume you store user roles in a "users" collection
    const userRef = collection(db, "users");
    const q = query(userRef, where("uid", "==", user.uid));
    const snapshot = await getDocs(q);

    if (!snapshot.empty) {
      const userData = snapshot.docs[0].data();
      const role = userData.role; // e.g. "treasurer" or "admin"

      if (role === "treasurer" || role === "admin") {
        // Now fetch groups where this user is treasurer or admin
        const groupsRef = collection(db, "groups");
        const groupQuery = query(
          groupsRef,
          where(role, "==", user.uid) // match field treasurer/admin to user ID
        );

        const groupSnapshot = await getDocs(groupQuery);
        const datalist = document.getElementById("groupOptions");

        groupSnapshot.forEach((doc) => {
          const groupData = doc.data();
          const option = document.createElement("option");
          option.value = groupData.group; // assuming "group" field holds group name
          datalist.appendChild(option);
        });
      }
    }
  } else {
    console.log("No user logged in");
  }
});


//saves new meeting info to firebase meetings collection
const Meeting_Form = document.getElementById("Meeting_Form");

Meeting_Form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const user = auth.currentUser;
  if (!user) {
    alert("You must be logged in");
    return;
  }

  const meetingData = {
    date: String(document.getElementById("date").value), //convert to string
    time: String(document.getElementById("time").value), //convert to string
    location: document.getElementById("location").value,
    agenda: document.getElementById("agenda").value,
    group: document.getElementById("group").value,
    calledBy: user.uid,
    createdAt: new Date()
  };

  try {
    await addDoc(collection(db, "meetings"), meetingData);
    alert("Meeting scheduled successfully!");
    Meeting_Form.reset();
  } catch (error) {
    console.error("Error saving meeting:", error);
    alert("Failed to schedule meeting.");
  }
});
