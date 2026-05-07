import React from 'react';
import { Download, Loader } from 'lucide-react';

function DownloadBar({ url, setUrl, loading, downloadProgress, onDownload }) {
  return (
    <header className="download-header">
      <div className="input-container" style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
        <input
          type="text"
          placeholder="🔗 Pega el link de la cancion que quieras descargar  aquí..."
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && onDownload()}
          style={{
            flex: 1,
            padding: '14px 20px',
            borderRadius: '40px',
            border: loading ? '2px solid #0ea5e9' : '1px solid #404040',
            backgroundColor: '#1a1a1a',
            color: 'white',
            outline: 'none',
            fontSize: '14px',
          }}
        />
        <button
          onClick={onDownload}
          disabled={loading}
          style={{
            padding: '14px 32px',
            borderRadius: '40px',
            backgroundColor: loading ? '#3e3e3e' : '#0ea5e9',
            color: 'white',
            border: 'none',
            fontWeight: 'bold',
            cursor: loading ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          {loading ? <Loader size={18} className="spinning" /> : <Download size={18} />}
          {loading ? 'Descargando...' : 'Descargar'}
        </button>
      </div>
      
      {loading && downloadProgress > 0 && (
        <div style={{ width: '100%', height: '4px', backgroundColor: '#404040', borderRadius: '2px', overflow: 'hidden' }}>
          <div style={{ width: `${downloadProgress}%`, height: '100%', backgroundColor: '#0ea5e9', transition: 'width 0.3s ease' }} />
        </div>
      )}
    </header>
  );
}

export default DownloadBar;