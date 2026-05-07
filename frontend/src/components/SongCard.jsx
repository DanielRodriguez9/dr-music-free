import React from 'react';
import { CheckCircle } from 'lucide-react';

function SongCard({ song, isActive, isPlaying, thumbnail, onClick, onMouseEnter }) {
  return (
    <div
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      className={`song-card ${isActive && isPlaying ? 'active' : ''}`}
      style={{
        backgroundColor: isActive && isPlaying ? '#0ea5e920' : '#181818',
        padding: '16px',
        borderRadius: '8px',
        transition: 'all 0.2s ease',
        cursor: 'pointer',
        border: isActive && isPlaying ? '1px solid #0ea5e9' : '1px solid #282828',
        position: 'relative',
      }}
    >
      <div style={{ position: 'relative', marginBottom: '16px' }}>
        {thumbnail ? (
          <img 
            src={thumbnail} 
            alt={song.title}
            style={{ width: '100%', height: '180px', objectFit: 'cover', borderRadius: '6px' }}
          />
        ) : (
          <div style={{ 
            width: '100%', 
            height: '180px', 
            background: 'linear-gradient(135deg, #0ea5e920, #0a0a0a)', 
            borderRadius: '6px', 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center', 
            fontSize: '56px' 
          }}>
            🎵
          </div>
        )}
        
        {isActive && isPlaying && (
          <div style={{ 
            position: 'absolute', 
            bottom: '8px', 
            right: '8px', 
            backgroundColor: '#0ea5e9', 
            borderRadius: '50%', 
            padding: '6px',
          }}>
            <div style={{ width: '8px', height: '8px', backgroundColor: 'white', borderRadius: '50%' }} />
          </div>
        )}
      </div>
      
      <strong style={{ display: 'block', marginBottom: '6px', fontSize: '14px', lineHeight: '1.4' }}>
        {song.title.length > 35 ? song.title.substring(0, 32) + "..." : song.title}
      </strong>
      
      <p style={{ color: '#b3b3b3', fontSize: '12px', margin: 0 }}>YouTube Music</p>
      
      {isActive && <CheckCircle size={14} style={{ position: 'absolute', bottom: '12px', right: '12px', color: '#0ea5e9' }} />}
    </div>
  );
}

export default SongCard;