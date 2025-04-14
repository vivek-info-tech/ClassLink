import { getAuth } from "firebase/auth";
import { initializeApp } from "firebase/app";
import { collection, getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyASec5H18QAwphCHxpR17rcRK2XpPcAbMg",
  authDomain: "my-zoom-clone-f8ab8.firebaseapp.com",
  projectId: "my-zoom-clone-f8ab8",
  storageBucket: "my-zoom-clone-f8ab8.appspot.com",
  messagingSenderId: "795515047409",
  appId: "1:795515047409:web:3f7ff4766e2b89ca5d32f4",
  measurementId: "G-VWPBR1NSLL"
};

const app = initializeApp(firebaseConfig);
export const firebaseAuth = getAuth(app);
export const firebaseDB = getFirestore(app);
export const usersRef = collection(firebaseDB, "users");
export const meetingsRef = collection(firebaseDB, "meetings");
export const chatsRef = collection(firebaseDB, "chats");
export const messagesRef = (chatId) => collection(firebaseDB, "chats", chatId, "messages");
