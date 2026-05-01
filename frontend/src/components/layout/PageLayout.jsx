import React, { useState } from 'react';
import Sidebar from './Sidebar';
import Header from './Header';
import Breadcrumbs from './Breadcrumbs';

const PageLayout = ({ children, title }) => {
  const [collapsed, setCollapsed] = useState(false);
  const sidebarW = collapsed ? 64 : 240;

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#f9fafb' }}>
      <Sidebar collapsed={collapsed} onToggle={() => setCollapsed(c => !c)} />
      <div style={{ flex: 1, marginLeft: sidebarW, transition: 'margin-left 0.25s ease', display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
        <Header onToggleSidebar={() => setCollapsed(c => !c)} title={title} />
        <main style={{ flex: 1, padding: '1.5rem' }}>
          <Breadcrumbs />
          {children}
        </main>
      </div>
    </div>
  );
};

export default PageLayout;
