import React, { useState } from 'react';
import SongCard from '../components/SongCard';
import { Download, ChevronLeft, ChevronRight } from 'lucide-react';
import axios from 'axios';
import toast from 'react-hot-toast';

function Library({ songs, currentSong, isPlaying, thumbnails, onPlaySong, onLoadThumbnail, onSongDeleted }) {
  const [currentPage, setCurrentPage] = useState(1);
  const songsPerPage = 12; // 12 canciones por página
  
  // Calcular páginas
  const totalPages = Math.ceil(songs.length / songsPerPage);
  const indexOfLastSong = currentPage * songsPerPage;
  const indexOfFirstSong = indexOfLastSong - songsPerPage;
  const currentSongs = songs.slice(indexOfFirstSong, indexOfLastSong);
  
  const handleDeleteSong = async (songId) => {
    if (window.confirm('¿Eliminar esta canción de tu biblioteca?')) {
      try {
        await axios.delete(`http://127.0.0.1:8000/songs/${songId}`);
        toast.success('✅ Canción eliminada', {
          style: { background: '#0ea5e9', color: '#fff' }
        });
        onSongDeleted();
        // Si la página actual se queda vacía, ir a la página anterior
        if (currentSongs.length === 1 && currentPage > 1) {
          setCurrentPage(currentPage - 1);
        }
      } catch (error) {
        toast.error('❌ Error al eliminar');
        console.error(error);
      }
    }
  };

  const goToPage = (page) => {
    setCurrentPage(Math.max(1, Math.min(page, totalPages)));
  };

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <h1 style={{ fontSize: '28px', fontWeight: 'bold', margin: 0 }}>Tu Biblioteca</h1>
        <span style={{ color: '#b3b3b3', fontSize: '14px' }}>
          {songs.length} {songs.length === 1 ? 'canción' : 'canciones'} • Página {currentPage} de {totalPages || 1}
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '24px' }}>
        {songs.length === 0 ? (
          <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '80px 20px', backgroundColor: '#181818', borderRadius: '12px' }}>
            <Download size={64} />
            <p style={{ marginTop: '20px', color: '#b3b3b3' }}>🎵 No hay canciones aún. ¡Descarga tu primera canción!</p>
          </div>
        ) : (
          currentSongs.map((song) => (
            <SongCard
              key={song.id}
              song={song}
              isActive={currentSong?.id === song.id}
              isPlaying={isPlaying}
              thumbnail={thumbnails[song.id]}
              onClick={() => onPlaySong(song)}
              onMouseEnter={() => onLoadThumbnail(song.id)}
              onDelete={handleDeleteSong}
            />
          ))
        )}
      </div>

      {/* Controles de paginación */}
      {songs.length > songsPerPage && (
        <div style={{ 
          display: 'flex', 
          justifyContent: 'center', 
          alignItems: 'center', 
          gap: '16px', 
          marginTop: '40px',
          padding: '20px 0'
        }}>
          <button
            onClick={() => goToPage(currentPage - 1)}
            disabled={currentPage === 1}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '10px 20px',
              backgroundColor: currentPage === 1 ? '#404040' : '#0ea5e9',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              cursor: currentPage === 1 ? 'not-allowed' : 'pointer',
              opacity: currentPage === 1 ? 0.5 : 1,
              transition: '0.2s',
            }}
          >
            <ChevronLeft size={18} />
            Anterior
          </button>
          
          <div style={{ display: 'flex', gap: '8px' }}>
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              let pageNum;
              if (totalPages <= 5) {
                pageNum = i + 1;
              } else if (currentPage <= 3) {
                pageNum = i + 1;
              } else if (currentPage >= totalPages - 2) {
                pageNum = totalPages - 4 + i;
              } else {
                pageNum = currentPage - 2 + i;
              }
              
              return (
                <button
                  key={pageNum}
                  onClick={() => goToPage(pageNum)}
                  style={{
                    width: '36px',
                    height: '36px',
                    backgroundColor: currentPage === pageNum ? '#0ea5e9' : '#282828',
                    color: 'white',
                    border: 'none',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontWeight: currentPage === pageNum ? 'bold' : 'normal',
                    transition: '0.2s',
                  }}
                  onMouseEnter={(e) => {
                    if (currentPage !== pageNum) {
                      e.currentTarget.style.backgroundColor = '#404040';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (currentPage !== pageNum) {
                      e.currentTarget.style.backgroundColor = '#282828';
                    }
                  }}
                >
                  {pageNum}
                </button>
              );
            })}
          </div>
          
          <button
            onClick={() => goToPage(currentPage + 1)}
            disabled={currentPage === totalPages}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '10px 20px',
              backgroundColor: currentPage === totalPages ? '#404040' : '#0ea5e9',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              cursor: currentPage === totalPages ? 'not-allowed' : 'pointer',
              opacity: currentPage === totalPages ? 0.5 : 1,
              transition: '0.2s',
            }}
          >
            Siguiente
            <ChevronRight size={18} />
          </button>
        </div>
      )}
    </>
  );
}

export default Library;