import { useRef, useEffect, useState } from 'react';
import YouTube from 'react-youtube';
import { Youtube, Volume2, VolumeX } from 'lucide-react';

const Player = ({ song, offset, volume, setVolume, lastVolume, setLastVolume }) => {
    const playerRef = useRef(null);
    const [isPlayerReady, setIsPlayerReady] = useState(false);

    useEffect(() => {
        setIsPlayerReady(false);
    }, [song?.startTime]);

    const remainingSec = song ? Math.max(0, song.durationSec - offset) : 0;

    useEffect(() => {
        console.log('Player state:', { isPlayerReady, hasPlayer: !!playerRef.current, songTitle: song?.title, offset });
    }, [isPlayerReady, song, offset]);

    const toggleMute = () => {
        if (volume > 0) {
            setLastVolume(volume);
            setVolume(0);
        } else {
            setVolume(lastVolume > 0 ? lastVolume : 100);
        }
    };

    useEffect(() => {
        if (isPlayerReady && playerRef.current && song) {
            const player = playerRef.current;
            try {
                if (typeof player.getCurrentTime !== 'function') return;

                const currentTime = player.getCurrentTime();
                if (Math.abs(currentTime - offset) > 2) {
                    console.log('Seeking to:', offset);
                    player.seekTo(offset, true);
                }
            } catch (e) {
                console.warn('Player sync failed:', e);
            }
        }
    }, [offset, song, isPlayerReady]);

    useEffect(() => {
        if (isPlayerReady && playerRef.current) {
            const player = playerRef.current;
            try {
                if (typeof player.setVolume !== 'function') return;

                if (remainingSec <= 5 && remainingSec > 0) {
                    const fadingVolume = Math.floor((remainingSec / 5) * volume);
                    player.setVolume(fadingVolume);
                } else if (remainingSec > 5) {
                    player.setVolume(volume);
                } else if (remainingSec <= 0) {
                    player.setVolume(0);
                }
            } catch (e) {
                console.warn('Volume sync failed:', e);
            }
        }
    }, [remainingSec, isPlayerReady, volume]);

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

    const getYouTubeId = (url) => {
        if (!url) return null;
        const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
        const match = url.match(regExp);
        return (match && match[2].length === 11) ? match[2] : null;
    };

    const videoId = getYouTubeId(song.youtubeUrl);

    const formatRemaining = (sec) => {
        const mins = Math.floor(sec / 60);
        const secs = sec % 60;
        return `${mins}:${secs.toString().padStart(2, '0')} remaining`;
    };

    const getCurrentTimeStr = () => {
        const now = new Date();
        return now.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    };



    return (
        <div className="player-card">
            <div className="player-header">
                <div className="header-left">
                    <Youtube className="youtube-icon" size={20} />
                    <span>Live Radio</span>
                </div>
                <div className="volume-control">
                    {volume === 0 ? (
                        <VolumeX className="volume-icon" size={18} onClick={toggleMute} />
                    ) : (
                        <Volume2 className="volume-icon" size={18} onClick={toggleMute} />
                    )}
                    <input
                        type="range"
                        min="0"
                        max="100"
                        value={volume}
                        onChange={(e) => setVolume(parseInt(e.target.value))}
                        className="volume-slider"
                    />
                </div>
            </div>

            <div className="video-container">
                <YouTube
                    key={`${song.startTime}-${videoId}`}
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
