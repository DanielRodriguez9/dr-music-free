import React, { useState } from 'react';
import SongCard from '../components/SongCard';
import { Search as SearchIcon } from 'lucide-react';

function Search({ songs, currentSong, isPlaying, thumbnails, onPlaySong, onLoadThumbnail }) {
  const [searchTerm, setSearchTerm] = useState("");
  
  const filteredSongs = songs.filter(song => 
    song.title.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <>
      <div style={{ marginBottom: '32px' }}>
        <h1 style={{ marginBottom: '20px' }}>Buscar canciones</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', backgroundColor: '#1a1a1a', borderRadius: '40px', padding: '12px 20px', border: '1px solid #404040' }}>
          <SearchIcon size={20} color="#b3b3b3" />
          <input
            type="text"
            placeholder="Buscar por título..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{ flex: 1, background: 'none', border: 'none', color: 'white', outline: 'none', fontSize: '16px' }}
          />
        </div>
      </div>
      
      <div>
        <h2 style={{ marginBottom: '20px', fontSize: '20px' }}>Resultados ({filteredSongs.length})</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '24px' }}>
          {filteredSongs.length === 0 ? (
            <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '80px 20px', backgroundColor: '#181818', borderRadius: '12px' }}>
              <SearchIcon size={48} />
              <p style={{ marginTop: '20px', color: '#b3b3b3' }}>No se encontraron canciones</p>
            </div>
          ) : (
            filteredSongs.map((song) => (
              <SongCard
                key={song.id}
                song={song}
                isActive={currentSong?.id === song.id}
                isPlaying={isPlaying}
                thumbnail={thumbnails[song.id]}
                onClick={() => onPlaySong(song)}
                onMouseEnter={() => onLoadThumbnail(song.id)}
              />
            ))
          )}
        </div>
      </div>
    </>
  );
}

export default Search;