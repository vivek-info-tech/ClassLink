import { createSlice } from "@reduxjs/toolkit";

const initialState = {
  userInfo: null, // Changed from object to null
  isDarkTheme: false,
};

export const authSlice = createSlice({
  name: "auth",
  initialState,
  reducers: {
    changeTheme: (state, action) => {
      state.isDarkTheme = action.payload.isDarkTheme;
    },
    setUser: (state, action) => {
      state.userInfo = {
        ...action.payload,
        emailVerified: action.payload.emailVerified || false
      };
    },
    clearUser: (state) => { // New reducer to clear user
      state.userInfo = null;
    },
  },
});

export const { setUser, changeTheme, clearUser } = authSlice.actions;
