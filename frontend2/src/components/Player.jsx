import { useRef, useEffect, useState } from 'react';
import YouTube from 'react-youtube';
import { Youtube, Volume2, VolumeX } from 'lucide-react';

const getYouTubeId = (url) => {
    if (!url) return null;
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
};

const getSecondsFromTime = (timeStr) => {
    if (!timeStr) return 0;
    const parts = timeStr.trim().split(':').map(Number);
    let sec = 0;
    if (parts.length >= 1) sec += (parts[0] || 0) * 3600;
    if (parts.length >= 2) sec += (parts[1] || 0) * 60;
    if (parts.length >= 3) sec += (parts[2] || 0);
    return sec;
};

const SingleYouTubePlayer = ({ song, syncTime, globalVolume, isPrimary }) => {
    const playerRef = useRef(null);
    const [isPlayerReady, setIsPlayerReady] = useState(false);
    const videoId = getYouTubeId(song.youtubeUrl);

    const startTimeInSec = getSecondsFromTime(song.startTime);
    const endTimeInSec = startTimeInSec + song.durationSec;

    // The player should start 15 seconds before the song's official start time
    // so it can fade in and be perfectly at 0:00 when the official time hits.
    const INTRO_SKIP = 10;
    const playerStartTime = startTimeInSec - 15;
    const offset = (syncTime - playerStartTime) + INTRO_SKIP;

    const FADE_TIME = 15;

    useEffect(() => {
        if (isPlayerReady && playerRef.current) {
            const player = playerRef.current;
            try {
                if (typeof player.setVolume !== 'function') return;

                let scale = 1;

                // Fade In: from playerStartTime to startTimeInSec
                if (syncTime < startTimeInSec) {
                    scale = (syncTime - playerStartTime) / FADE_TIME;
                }
                // Fade Out: from (endTimeInSec - 15) to endTimeInSec
                else if (syncTime > (endTimeInSec - FADE_TIME)) {
                    scale = (endTimeInSec - syncTime) / FADE_TIME;
                }

                // Curved scale for more natural transition
                const curvedScale = Math.pow(Math.max(0, Math.min(1, scale)), 1.2);
                const targetVolume = Math.floor(curvedScale * globalVolume);
                player.setVolume(targetVolume);

                // Sync check
                if (typeof player.getCurrentTime === 'function') {
                    const currentTime = player.getCurrentTime();
                    if (Math.abs(currentTime - offset) > 2) {
                        player.seekTo(offset, true);
                    }
                }
            } catch (e) {
                console.warn('Player individual sync failed:', e);
            }
        }
    }, [syncTime, isPlayerReady, globalVolume, startTimeInSec, endTimeInSec, playerStartTime, offset]);

    const onReady = (event) => {
        playerRef.current = event.target;
        setIsPlayerReady(true);
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

    return (
        <div
            className={`youtube-player-wrapper ${isPrimary ? 'is-primary' : 'is-fading'}`}
            style={{
                position: isPrimary ? 'relative' : 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                opacity: isPrimary ? 1 : 0,
                pointerEvents: isPrimary ? 'auto' : 'none',
                zIndex: isPrimary ? 1 : 0
            }}
        >
            <YouTube
                videoId={videoId}
                opts={opts}
                onReady={onReady}
                className="youtube-embed"
                onEnd={(e) => e.target.pauseVideo()}
            />
        </div>
    );
};

const Player = ({ activeSongs, syncTime, volume, setVolume, lastVolume, setLastVolume }) => {
    const toggleMute = () => {
        if (volume > 0) {
            setLastVolume(volume);
            setVolume(0);
        } else {
            setVolume(lastVolume > 0 ? lastVolume : 100);
        }
    };

    if (!activeSongs || activeSongs.length === 0) return <div className="no-song">Silence...</div>;

    // The "primary" song is the one that has officially started but hasn't finished yet
    const primarySong = activeSongs.find(s => {
        const start = getSecondsFromTime(s.startTime);
        const end = start + s.durationSec;
        return syncTime >= start && syncTime < end;
    }) || activeSongs[0];

    const primaryStart = getSecondsFromTime(primarySong.startTime);
    const currentOffset = syncTime - primaryStart;
    const remainingSec = Math.max(0, primarySong.durationSec - currentOffset);

    const formatTime = (sec) => {
        const totalSec = Math.floor(sec);
        const mins = Math.floor(totalSec / 60);
        const secs = totalSec % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    const formatRemaining = (sec) => {
        return `${formatTime(sec)} remaining`;
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

            <div className="video-container" style={{ position: 'relative', overflow: 'hidden' }}>
                {activeSongs.map(song => (
                    <SingleYouTubePlayer
                        key={`${song.startTime}-${song.title}`}
                        song={song}
                        syncTime={syncTime}
                        globalVolume={volume}
                        isPrimary={song.startTime === primarySong.startTime}
                    />
                ))}
            </div>

            <div className="now-playing-info">
                <div className="song-details">
                    <div className="artist-name">{primarySong.artist}</div>
                    <div className="song-title">{primarySong.title}</div>
                </div>

                <div className="time-info">
                    <div className="current-time">{getCurrentTimeStr()}</div>
                    <div className="remaining-time">
                        {formatTime(currentOffset)} / {formatTime(primarySong.durationSec)} remaining
                    </div>
                </div>
            </div>

            <div className="progress-container" style={{ height: '4px', background: '#eee', width: '100%' }}>
                <div
                    className="progress-bar"
                    style={{
                        height: '100%',
                        background: '#3949ab',
                        width: `${Math.min(100, Math.max(0, (currentOffset / primarySong.durationSec) * 100))}%`,
                        transition: 'width 0.1s linear'
                    }}
                ></div>
            </div>
        </div>
    );
};

export default Player;
