import React from 'react';
import { Trans } from '@lingui/react/macro';
import { useLocation, useNavigate } from 'react-router-dom';
import '../css/ProfileSidebar.css';

const ProfileSidebar = () => {
  const location = useLocation();
  const navigate = useNavigate();

  const sections = [
    { id: 'general', label: <Trans>General</Trans>, icon: '⚙️', path: '/profile' },
    { id: 'security', label: <Trans>Security</Trans>, icon: '🔒', path: '/profile?section=security' },
    { id: 'notifications', label: <Trans>Notifications</Trans>, icon: '🔔', path: '/profile?section=notifications' },
    { id: 'connected', label: <Trans>Connection</Trans>, icon: '🔗', path: '/profile?section=connected' },
  ];

  const currentSection = new URLSearchParams(location.search).get('section') || 'general';

  const handleNavClick = (path) => {
    navigate(path);
  };

  return (
    <aside className="profile-sidebar">
      <div className="sidebar-header">
        <h3><Trans>Settings</Trans></h3>
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
