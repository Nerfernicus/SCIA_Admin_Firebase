import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getAuth } from "firebase/auth";
import { getAnalytics } from "firebase/analytics";
import { getFunctions, connectFunctionsEmulator } from "firebase/functions";

const firebaseConfig = {
  apiKey: "AIzaSyCUgV0Y6W5UedzmjIltFIoa8AY-mKYAfTU",
  authDomain: "scia-b5440.firebaseapp.com",
  projectId: "scia-b5440",
  storageBucket: "scia-b5440.firebasestorage.app",
  messagingSenderId: "244279971713",
  appId: "1:244279971713:web:8a4cba18f0ba528e93a280",
  measurementId: "G-GXDFVSFJME",
};

const app = initializeApp(firebaseConfig);

export const db = getFirestore(app);
export const storage = getStorage(app);
export const auth = getAuth(app);
// Use the same region as the deployed ncscVerify function
export const functions = getFunctions(app, 'asia-southeast1');

let analytics = null;
if (typeof window !== "undefined") {
  analytics = getAnalytics(app);
}
export { analytics };

// ── Shared collection names (MUST match mobile app) ─────────────────────────
export const COLLECTIONS = {
  ADMINS: "admins",
  USERS: "users",
  EVENTS: "editorial_health",
  EMERGENCIES: "emergencies",    // ✅ matches mobile app sendSOSAlert()
  APPOINTMENTS: "appointments",
  MEDICATIONS: "medications",
  ID_VERIFICATIONS: "id_verifications",
  ID_REQUESTS: "id_requests",
  HEALTH_CENTERS: "health_centers",
};

export default app;