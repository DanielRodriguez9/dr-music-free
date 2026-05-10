import React from 'react';
import { Play, Pause, SkipBack, SkipForward, Volume2, Shuffle, Repeat } from 'lucide-react';

function Player({ 
  currentSong, isPlaying, currentTime, duration, volume, 
  shuffle, repeat,
  onPlayPause, onPrev, onNext, onProgressChange, onVolumeChange,
  onShuffleToggle, onRepeatToggle, formatTime 
}) {
  if (!currentSong) return null;

  return (
    <footer style={{
      gridColumn: '1 / span 2',
      backgroundColor: '#181818',
      borderTop: '1px solid #282828',
      padding: '16px 24px',
      position: 'sticky',
      bottom: 0,
      zIndex: 1000,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '24px', maxWidth: '1400px', margin: '0 auto' }}>
        {/* Info canción */}
        <div style={{ width: '240px' }}>
          <strong style={{ fontSize: '14px', display: 'block', marginBottom: '4px' }}>
            {currentSong.title.length > 35 ? currentSong.title.substring(0, 32) + "..." : currentSong.title}
          </strong>
          <p style={{ fontSize: '12px', color: '#b3b3b3', margin: 0 }}>DR Music Free</p>
        </div>

        {/* Controles */}
        <div style={{ flex: 1, textAlign: 'center' }}>
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '20px', marginBottom: '8px' }}>
            
            {/* Shuffle */}
            <div title={shuffle ? "Desactivar modo aleatorio" : "Activar modo aleatorio"}>
              <Shuffle 
                size={18} 
                style={{ 
                  cursor: 'pointer', 
                  color: shuffle ? '#0ea5e9' : '#b3b3b3',
                  transition: '0.2s'
                }} 
                onClick={onShuffleToggle} 
              />
            </div>
            
            {/* Anterior */}
            <div title="Canción anterior">
              <SkipBack 
                size={20} 
                style={{ cursor: 'pointer', color: '#b3b3b3' }} 
                onClick={onPrev} 
              />
            </div>
            
            {/* Play/Pause */}
            <div 
              title={isPlaying ? "Pausar" : "Reproducir"}
              onClick={onPlayPause} 
              style={{ cursor: 'pointer', backgroundColor: '#0ea5e9', borderRadius: '50%', padding: '8px', display: 'flex', width: '32px', height: '32px', alignItems: 'center', justifyContent: 'center' }}
            >
              {isPlaying ? <Pause size={16} fill="white" /> : <Play size={16} fill="white" style={{ marginLeft: '2px' }} />}
            </div>
            
            {/* Siguiente */}
            <div title="Siguiente canción">
              <SkipForward 
                size={20} 
                style={{ cursor: 'pointer', color: '#b3b3b3' }} 
                onClick={onNext} 
              />
            </div>
            
            {/* Repeat */}
            <div title={repeat ? "Desactivar repetición" : "Activar repetición"}>
              <Repeat 
                size={18} 
                style={{ 
                  cursor: 'pointer', 
                  color: repeat ? '#0ea5e9' : '#b3b3b3',
                  transition: '0.2s'
                }} 
                onClick={onRepeatToggle} 
              />
            </div>
          </div>
          
          {/* Barra de progreso */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontSize: '12px', color: '#b3b3b3', minWidth: '40px' }}>{formatTime(currentTime)}</span>
            <input
              type="range"
              min="0"
              max={duration || 0}
              value={currentTime}
              onChange={onProgressChange}
              style={{ flex: 1, height: '4px', borderRadius: '2px', cursor: 'pointer' }}
              title="Barra de progreso"
            />
            <span style={{ fontSize: '12px', color: '#b3b3b3', minWidth: '40px' }}>{formatTime(duration)}</span>
          </div>
        </div>

        {/* Volumen */}
        <div style={{ width: '150px', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div title="Volumen">
            <Volume2 size={18} color="#b3b3b3" />
          </div>
          <input
            type="range"
            min="0"
            max="100"
            value={volume}
            onChange={onVolumeChange}
            style={{ flex: 1, height: '4px', cursor: 'pointer' }}
            title="Control de volumen"
          />
        </div>
      </div>
    </footer>
  );
}

export default Player;