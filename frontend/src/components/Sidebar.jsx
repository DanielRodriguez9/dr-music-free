import React from 'react';
import { Home, Search, Library, Music } from 'lucide-react';

function Sidebar({ activeTab, setActiveTab }) {
  const navItems = [
    { id: 'home', label: 'Inicio', icon: Home },
    { id: 'search', label: 'Buscar', icon: Search },
    { id: 'library', label: 'Tu Biblioteca', icon: Library },
  ];

  return (
    <aside className="sidebar">
      <div className="logo-container">
        <Music size={28} color="#0ea5e9" />
        <h2 className="logo">
          DR Music <span className="logo-free">Free</span>
        </h2>
      </div>
      <p className="logo-slogan">Música gratis · Sin anuncios</p>
      
      <nav>
        <ul style={{ listStyle: 'none', padding: 0, marginTop: '32px' }}>
          {navItems.map((item) => (
            <li
              key={item.id}
              className={`nav-item ${activeTab === item.id ? 'active' : ''}`}
              onClick={() => setActiveTab(item.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '16px',
                marginBottom: '8px',
                padding: '12px 16px',
                borderRadius: '8px',
                cursor: 'pointer',
                color: activeTab === item.id ? 'var(--text-main)' : 'var(--text-dim)',
                backgroundColor: activeTab === item.id ? '#282828' : 'transparent',
                transition: 'all 0.2s ease',
              }}
              onMouseEnter={(e) => {
                if (activeTab !== item.id) {
                  e.currentTarget.style.backgroundColor = '#1f1f1f';
                }
              }}
              onMouseLeave={(e) => {
                if (activeTab !== item.id) {
                  e.currentTarget.style.backgroundColor = 'transparent';
                }
              }}
            >
              <item.icon size={22} />
              <span style={{ fontWeight: activeTab === item.id ? '600' : '400' }}>
                {item.label}
              </span>
            </li>
          ))}
        </ul>
      </nav>
      
      {/* Footer del sidebar */}
      <div style={{ 
        position: 'absolute', 
        bottom: '24px', 
        left: '24px', 
        right: '24px',
        fontSize: '11px',
        color: '#404040',
        textAlign: 'center',
        borderTop: '1px solid #282828',
        paddingTop: '16px'
      }}>
        <p>DR Music Free v1.0</p>
        <p>Creado por Daniel Rodríguez</p>
      </div>
    </aside>
  );
}

export default Sidebar;