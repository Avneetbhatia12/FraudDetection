import React, { useEffect, useState } from 'react';
import Sidebar from './Sidebar';
import Header from './Header';
import Breadcrumbs from './Breadcrumbs';

const narrow = () => typeof window !== 'undefined' && window.innerWidth < 900;

const PageLayout = ({ children, title }) => {
  const [collapsed, setCollapsed] = useState(narrow);
  // Responsive: collapse the fixed sidebar to icons on narrow screens (tablets, phones).
  useEffect(() => {
    const onResize = () => { if (narrow()) setCollapsed(true); };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  const sidebarW = collapsed ? 64 : 240;

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#f9fafb' }}>
      <Sidebar collapsed={collapsed} onToggle={() => setCollapsed(c => !c)} />
      <div style={{ flex: 1, marginLeft: sidebarW, transition: 'margin-left 0.25s ease', display: 'flex', flexDirection: 'column', minHeight: '100vh', minWidth: 0 }}>
        <Header onToggleSidebar={() => setCollapsed(c => !c)} title={title} />
        <main style={{ flex: 1, padding: '1.5rem', minWidth: 0 }}>
          <Breadcrumbs />
          {children}
        </main>
      </div>
    </div>
  );
};

export default PageLayout;
