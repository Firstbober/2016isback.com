import { useState, useEffect } from 'react';
import { Youtube, ExternalLink } from 'lucide-react';
import { fetchTracklist } from './services/api.js';
import { useRadioSync } from './hooks/useRadioSync.js';
import Player from './components/Player.jsx';
import './index.css';

function App() {
  const [region, setRegion] = useState('pl');
  const [tracklist, setTracklist] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const { currentSong, offset } = useRadioSync(tracklist);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const data = await fetchTracklist(region);
        setTracklist(data);
        setError(null);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [region]);

  const toggleRegion = (newRegion) => {
    if (newRegion !== region) {
      setRegion(newRegion);
    }
  };

  // 2016 theme date string
  const getSimulatedDate = () => {
    const now = new Date();
    const day = now.toLocaleString('en-US', { weekday: 'long' });
    const month = now.toLocaleString('en-US', { month: 'long' });
    const date = now.getDate();
    const year = now.getFullYear() - 10;
    return `${day}, ${month} ${date}, ${year}`;
  };

  return (
    <div className="app">
      <div
        className="background-container"
        style={{ backgroundImage: currentSong ? `url(https://img.youtube.com/vi/${currentSong.youtubeUrl.split('v=')[1]}/maxresdefault.jpg)` : 'none' }}
      ></div>
      <div className="overlay"></div>

      <header>
        <div className="logo">
          2016 IS BACK <span className="badge-live">LIVE</span>
        </div>
        <div className="broadcasting-info">
          Broadcasting Live: {getSimulatedDate()}
        </div>
      </header>

      <main>
        <div className="region-selector">
          <button
            className={`region-btn ${region === 'pl' ? 'active' : ''}`}
            onClick={() => toggleRegion('pl')}
          >
            Poland
          </button>
          <button
            className={`region-btn ${region === 'us' ? 'active' : ''}`}
            onClick={() => toggleRegion('us')}
          >
            USA / World
          </button>
        </div>

        {loading ? (
          <div className="loading">Tuning in...</div>
        ) : error ? (
          <div className="error">Signal lost: {error}</div>
        ) : (
          <Player song={currentSong} offset={offset} />
        )}
      </main>

      <footer>
        <div className="created-by">
          Created by <a href="x.com/firstbober" className="footer-link">@firstbober</a>
        </div>
        <div className="footer-note">
          © We're back to 2016!!!
        </div>
      </footer>
    </div>
  );
}

export default App;
