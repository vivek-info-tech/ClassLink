import {
  EuiButton,
  EuiFlexGroup,
  EuiFlexItem,
  EuiImage,
  EuiPanel,
  EuiProvider,
  EuiSpacer,
  EuiText,
  EuiTextColor,
} from "@elastic/eui";
import logo from "../assets/logo.png";
import animation from "../assets/animation.gif";
import React from "react";
import {
  GoogleAuthProvider,
  signInWithPopup,
  sendEmailVerification,
} from "firebase/auth";
import { firebaseAuth, firebaseDB, usersRef } from "../utils/firebaseConfig";
import { useNavigate } from "react-router-dom";
import { useAppDispatch } from "../app/hooks";
import { setUser } from "../app/slices/AuthSlice";
import { collection, query, where, addDoc, getDocs } from "firebase/firestore";

function Login() {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();

  const login = async () => {
    try {
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(firebaseAuth, provider);
      const { displayName, email, uid } = result.user;

      if (email) {
        const firestoreQuery = query(usersRef, where("uid", "==", uid));
        const fetchedUser = await getDocs(firestoreQuery);
        if (fetchedUser.docs.length === 0) {
          await addDoc(collection(firebaseDB, "users"), {
            uid,
            name: displayName,
            email,
          });
        }
        dispatch(setUser({ 
          uid, 
          email, 
          name: displayName,
          emailVerified: result.user.emailVerified 
        }));

        if (result.user.emailVerified) {
          navigate("/");
        } else {
          await sendEmailVerification(result.user);
          alert("A verification email has been sent. Please verify your email before logging in.");
          await firebaseAuth.signOut();
        }
      }
    } catch (error) {
      console.error("Login failed:", error);
    }
  };

  return (
    <EuiProvider colorMode="dark">
      <EuiFlexGroup
        justifyContent="center"
        alignItems="center"
        style={{ width: "100vw", height: "100vh" }}
      >
        <EuiFlexItem grow={false}>
          <EuiPanel paddingSize="xl">
            <EuiFlexGroup justifyContent="center" alignItems="center">
              <EuiFlexItem>
                <EuiImage src={animation} alt="logo" />
              </EuiFlexItem>
              <EuiFlexItem>
                <EuiImage src={logo} alt="logo" size="230px" />
                <EuiSpacer size="xs" />
                <EuiText textAlign="center" grow={false}>
                  <h3>
                    <EuiTextColor>One Platform to</EuiTextColor>
                    <EuiTextColor color="#0b5cff"> connect</EuiTextColor>
                  </h3>
                </EuiText>
                <EuiSpacer size="l" />
                <EuiButton fill onClick={login}>
                  Login with Google
                </EuiButton>
              </EuiFlexItem>
            </EuiFlexGroup>
          </EuiPanel>
        </EuiFlexItem>
      </EuiFlexGroup>
    </EuiProvider>
  );
}

export default Login;
