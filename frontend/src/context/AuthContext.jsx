import React, { createContext, useState, useContext } from 'react';

// Create the context
const AuthContext = createContext(null);

// Create the "Provider" component
export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null); // No user logged in by default
  const [token, setToken] = useState(null); // No token by default

  const login = (userData, userToken) => {
    // This will be called by your /auth/callback page
    setUser(userData);
    setToken(userToken);
    localStorage.setItem("userToken", userToken); // Save token to storage
  };

  const logout = () => {
    setUser(null);
    setToken(null);
    localStorage.removeItem("userToken");
  };

  // The value that all components can access
  const value = { user, token, isLoggedIn: !!user, login, logout };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

// This is the "hook" you'll use to access the user data
export const useAuth = () => useContext(AuthContext);