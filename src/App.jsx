import {
  EuiGlobalToastList,
  EuiProvider,
  EuiThemeProvider,
} from "@elastic/eui";
import React, { useEffect, useState } from "react";
import { useDispatch } from "react-redux";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { useAppSelector } from "./app/hooks";
import { setToasts } from "./app/slices/MeetingSlice";
import ThemeSelector from "./components/ThemeSelector";
import CreateMeeting from "./pages/CreateMeeting";
import Dashboard from "./pages/Dashboard";
import JoinMeeting from "./pages/JoinMeeting";
import Login from "./pages/Login";
import Meeting from "./pages/Meeting";
import MyMeetings from "./pages/MyMeetings";
import OneOnOneMeeting from "./pages/OneOnOneMeeting";
import VideoConference from "./pages/VideoConference";

function RequireAuth({ children }) {
  const user = useAppSelector((zoomApp) => zoomApp.auth.userInfo);
  const location = useLocation();

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return children;
}

export default function App() {
  const dispatch = useDispatch();
  const isDarkTheme = useAppSelector((zoomApp) => zoomApp.auth.isDarkTheme);
  const [isInitialEffect, setIsInitialEffect] = useState(true);
  const toasts = useAppSelector((zoom) => zoom.meetings.toasts);


  const removeToast = (removedToast) => {
    dispatch(
      setToasts(
        toasts.filter((toast) => toast.id !== removedToast.id)
      )
    );
  };
  const [theme, setTheme] = useState("light");
  useEffect(() => {
    const theme = localStorage.getItem("zoom-theme");
    if (theme) {
      setTheme(theme);
    } else {
      localStorage.setItem("zoom-theme", "light");
    }
  }, []);

  useEffect(() => {
    if (isInitialEffect) setIsInitialEffect(false);
    else {
      window.location.reload();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDarkTheme]);

  const overrides = {
    colors: {
      LIGHT: { primary: "#0b5cff" },
      DARK: { primary: "#0b5cff" },
    },
  };

  return (
    <ThemeSelector>
      <EuiProvider colorMode={theme}>
        <EuiThemeProvider modify={overrides}>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route
              path="/"
              element={
                <RequireAuth>
                  <Dashboard />
                </RequireAuth>
              }
            />
            <Route
              path="/create"
              element={
                <RequireAuth>
                  <CreateMeeting />
                </RequireAuth>
              }
            />
            <Route
              path="/create1on1"
              element={
                <RequireAuth>
                  <OneOnOneMeeting />
                </RequireAuth>
              }
            />
            <Route
              path="/videoconference"
              element={
                <RequireAuth>
                  <VideoConference />
                </RequireAuth>
              }
            />
            <Route
              path="/mymeetings"
              element={
                <RequireAuth>
                  <MyMeetings />
                </RequireAuth>
              }
            />
            <Route
              path="/join/:id"
              element={
                <RequireAuth>
                  <JoinMeeting />
                </RequireAuth>
              }
            />
            <Route
              path="/meetings"
              element={
                <RequireAuth>
                  <Meeting />
                </RequireAuth>
              }
            />
            <Route path="*" element={<Navigate to="/login" replace />} />
          </Routes>
          <EuiGlobalToastList
            toasts={toasts}
            dismissToast={removeToast}
            toastLifeTimeMs={4000}
          />
        </EuiThemeProvider>
      </EuiProvider>
    </ThemeSelector>
  );
}
