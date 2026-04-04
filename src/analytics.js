import app from "./firebase-config.js";
import { getAnalytics } from "firebase/analytics";

const analytics = getAnalytics(app);