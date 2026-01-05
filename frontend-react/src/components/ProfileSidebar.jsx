import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import '../css/ProfileSidebar.css';

const ProfileSidebar = () => {
  const location = useLocation();
  const navigate = useNavigate();

  const sections = [
    { id: 'general', label: 'General', icon: '⚙️', path: '/profile' },
    { id: 'security', label: 'Security', icon: '🔒', path: '/profile?section=security' },
    { id: 'notifications', label: 'Notifications', icon: '🔔', path: '/profile?section=notifications' },
    { id: 'connected', label: 'Connection', icon: '🔗', path: '/profile?section=connected' },
  ];

  const currentSection = new URLSearchParams(location.search).get('section') || 'general';

  const handleNavClick = (path) => {
    navigate(path);
  };

  return (
    <aside className="profile-sidebar">
      <div className="sidebar-header">
        <h3>Settings</h3>
      </div>
      <nav className="sidebar-nav">
        {sections.map((section) => (
          <button
            key={section.id}
            className={`sidebar-nav-item ${currentSection === section.id ? 'active' : ''}`}
            onClick={() => handleNavClick(section.path)}
            title={section.label}
          >
            <span className="nav-icon">{section.icon}</span>
            <span className="nav-label">{section.label}</span>
          </button>
        ))}
      </nav>
    </aside>
  );
};

export default ProfileSidebar;
