import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

// This is a placeholder for your /auth/callback page
// In a real app, it would send the 'code' to Anupap's backend
export default function LineCallback() {
  const [status, setStatus] = useState("Processing login...");
  const navigate = useNavigate();
  const { login } = useAuth();

  useEffect(() => {
    // 1. Simulate a backend call
    setStatus("Simulating backend token exchange...");
    
    // 2. This is what Anupap's API will send back
    const mockUserData = {
      displayName: "Chaiyapat T.",
      userId: "U123456789",
      pictureUrl: "https://placehold.co/100x100"
    };
    const mockToken = "fake-jwt-token-12345";
    
    // 3. Simulate success
    setTimeout(() => {
      login(mockUserData, mockToken); // Save user to context
      setStatus("Login Successful! Redirecting...");
      navigate('/chart'); // Send user to the chart page
    }, 2000);

  }, [login, navigate]);

  return (
    <div style={{ textAlign: 'center', marginTop: '100px', fontFamily: 'Inter' }}>
      <h1>{status}</h1>
    </div>
  );
}