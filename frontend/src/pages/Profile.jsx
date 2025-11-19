import React from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import './Profile.css'; // We will add this CSS file

const Profile = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  // Redirect if not logged in
  if (!user) {
    // You might want a more robust <ProtectedRoute> component later,
    // but this is fine for now.
    React.useEffect(() => {
      navigate('/login');
    }, [navigate]);
    return null; // Don't render anything while redirecting
  }

  return (
    <div className="profile-container">
      <div className="profile-box">
        <h1>User Profile</h1>
        
        {/* Display User Avatar if available */}
        {user.pictureUrl && (
          <img 
            src={user.pictureUrl} 
            alt="Profile" 
            className="profile-avatar"
          />
        )}
        
        <div className="profile-details">
          <p><strong>Name:</strong> {user.displayName}</p>
          <p><strong>User ID:</strong> {user.userId}</p>
          <p><strong>Status:</strong> {user.statusMessage || "No status"}</p>
        </div>

        <button 
          onClick={() => { logout(); navigate('/login'); }}
          className="btn btn-logout"
        >
          Logout
        </button>
      </div>
    </div>
  );
};

export default Profile;