
import { db } from "./firebase.js";
import { collection, query, orderBy, onSnapshot, where, getDocs } from "firebase/firestore";
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


//TASK 3 & 4.Meeting List & Notification Banner
const meetingList = document.getElementById("meeting-list");
const banner = document.getElementById("notification-banner");
const bannerBody = document.getElementById("notification-body");
const closeBtn = document.querySelector(".notification-banner__close");

function showBanner(message) {
  bannerBody.textContent = message;
  banner.hidden = false;

  // Auto-hide after 10 seconds
  setTimeout(() => {
    banner.hidden = true;
  }, 10000);
}

closeBtn.addEventListener("click", () => {
  banner.hidden = true;
});

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    meetingList.innerHTML = "<p>Please log in to view meetings.</p>";
    return;
  }

  // Assume user document in Firestore has a `groupIds` array
  const userDoc = await db.collection("users").doc(user.uid).get();
  const userData = userDoc.data();
  const userGroups = userData?.group || [];

  // Listen to meetings in real time
  const q = query(collection(db, "meetings"), orderBy("date", "asc"));

  onSnapshot(q, (snapshot) => {
    meetingList.innerHTML = "";

    snapshot.forEach((doc) => {
      const data = doc.data();

      // Only render meetings for groups the user belongs to
      if (userGroups.includes(data.groupId)) {
        const article = document.createElement("article");
        article.className = "meeting-card";
        article.innerHTML = `
          <header><h3>Group: ${data.group}</h3></header>
          <p><time datetime="${data.date}">${data.date} at ${data.time}</time></p>
          <p><strong>Location:</strong> ${data.location}</p>
          <p><strong>Agenda:</strong> ${data.agenda}</p>
        `;
        meetingList.appendChild(article);

        // Show banner for new meetings
        if (doc.metadata.hasPendingWrites === false) {
          showBanner(`A new meeting for group ${data.groupId} has been scheduled on ${data.date} at ${data.time}.`);
        }
      }
    });
  });
});
