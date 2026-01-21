import { useRef, useEffect, useState } from 'react';
import YouTube from 'react-youtube';
import { Youtube } from 'lucide-react';

const Player = ({ song, offset }) => {
    const playerRef = useRef(null);
    const [isPlayerReady, setIsPlayerReady] = useState(false);

    useEffect(() => {
        if (isPlayerReady && playerRef.current && song) {
            const player = playerRef.current;
            try {
                const currentTime = player.getCurrentTime();
                if (Math.abs(currentTime - offset) > 2) {
                    player.seekTo(offset, true);
                }
            } catch (e) {
                console.warn('Player sync failed:', e);
            }
        }
    }, [offset, song, isPlayerReady]);

    const onReady = (event) => {
        playerRef.current = event.target;
        setIsPlayerReady(true);
        // The event.target is the player instance
        playerRef.current.playVideo();
        playerRef.current.seekTo(offset, true);
    };

    const opts = {
        height: '100%',
        width: '100%',
        playerVars: {
            autoplay: 1,
            controls: 0,
            modestbranding: 1,
            rel: 0,
        },
    };

    if (!song) return <div className="no-song">Silence...</div>;

    const videoId = song.youtubeUrl.includes('v=')
        ? song.youtubeUrl.split('v=')[1].split('&')[0]
        : song.youtubeUrl.split('/').pop();

    const formatRemaining = (sec) => {
        const mins = Math.floor(sec / 60);
        const secs = sec % 60;
        return `${mins}:${secs.toString().padStart(2, '0')} remaining`;
    };

    const getCurrentTimeStr = () => {
        const now = new Date();
        return now.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    };

    const remainingSec = Math.max(0, song.durationSec - offset);

    return (
        <div className="player-card">
            <div className="player-header">
                <Youtube className="youtube-icon" size={20} />
                <span>Live Radio</span>
            </div>

            <div className="video-container">
                <YouTube
                    key={videoId}
                    videoId={videoId}
                    opts={opts}
                    onReady={onReady}
                    className="youtube-embed"
                    onEnd={(e) => e.target.pauseVideo()} // Stay at the end until next song syncs
                />
            </div>

            <div className="now-playing-info">
                <div className="song-details">
                    <div className="artist-name">{song.artist}</div>
                    <div className="song-title">{song.title}</div>
                </div>

                <div className="time-info">
                    <div className="current-time">{getCurrentTimeStr()}</div>
                    <div className="remaining-time">{formatRemaining(remainingSec)}</div>
                </div>
            </div>

            <div className="progress-container" style={{ height: '4px', background: '#eee', width: '100%' }}>
                <div
                    className="progress-bar"
                    style={{
                        height: '100%',
                        background: '#3949ab',
                        width: `${(offset / song.durationSec) * 100}%`,
                        transition: 'width 1s linear'
                    }}
                ></div>
            </div>
        </div>
    );
};

export default Player;
