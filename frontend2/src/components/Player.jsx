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
    const songProgress = syncTime - startTimeInSec;
    const offset = Math.max(0, songProgress + INTRO_SKIP);

    const FADE_TIME = 15;
    const lastSeekTime = useRef(0);
    const lastAppliedVolume = useRef(-1);
    const [hasInitialSeeked, setHasInitialSeeked] = useState(false);
    const [startTime] = useState(Date.now());

    // Calculate volume and opacity scale
    let scale = 1;
    // Fade In Phase
    if (syncTime < startTimeInSec) {
        scale = (syncTime - playerStartTime) / FADE_TIME;
    }
    // Fade Out Phase (starts 15s before the end)
    else if (syncTime > (endTimeInSec - FADE_TIME)) {
        scale = (endTimeInSec - syncTime) / FADE_TIME;
    }

    // Safety check: if the song has "officially" ended (in trail time)
    let isTrail = false;
    if (syncTime >= endTimeInSec) {
        scale = 0;
        isTrail = true;
    }

    const curvedScale = Math.pow(Math.max(0, Math.min(1, scale)), 1.2);

    // 1. Volume management - runs on syncTime update (10Hz)
    useEffect(() => {
        let isMounted = true;
        if (!isPlayerReady || !playerRef.current) return;

        const player = playerRef.current;

        // 1. Volume Sync
        try {
            // SAFETY: Force ungate if more than 6 seconds passed since ready, OR if in trail (to keep it 0)
            const isTimeoutReached = (Date.now() - startTime) > 6000;
            const targetVolume = (isTrail || (!hasInitialSeeked && !isTimeoutReached))
                ? 0
                : Math.floor(curvedScale * globalVolume);

            if (Math.abs(lastAppliedVolume.current - targetVolume) >= 1) {
                if (typeof player.setVolume === 'function') {
                    player.setVolume(targetVolume);
                    lastAppliedVolume.current = targetVolume;
                }
            }
        } catch (e) { /* ignore */ }

        // 2. Periodic Check
        const checkState = () => {
            if (!isMounted || !playerRef.current) return;
            try {
                if (typeof player.getPlayerState !== 'function') return;
                const state = player.getPlayerState();

                if (isTrail) {
                    if (state === 1 || state === 3) player.pauseVideo();
                    return;
                }

                if (state === 1) { // Playing
                    const currentTime = player.getCurrentTime();
                    const diff = Math.abs(currentTime - offset);

                    if (diff > 4 && Date.now() - lastSeekTime.current > 5000) {
                        player.seekTo(offset, true);
                        lastSeekTime.current = Date.now();
                        setHasInitialSeeked(true);
                    } else if (diff <= 4) {
                        setHasInitialSeeked(true);
                    }
                } else if (syncTime >= playerStartTime && syncTime < endTimeInSec) {
                    if (state === -1 || state === 2 || state === 5) {
                        player.playVideo();
                        if (typeof player.unMute === 'function') player.unMute();
                        if (!hasInitialSeeked) {
                            player.seekTo(offset, true);
                        }
                    }
                }
            } catch (e) { /* silent */ }
        };

        const timeout = setTimeout(checkState, 100);

        return () => {
            isMounted = false;
            clearTimeout(timeout);
        };
    }, [syncTime, isPlayerReady, curvedScale, globalVolume, isTrail, offset, playerStartTime, endTimeInSec, hasInitialSeeked, startTime]);

    const onReady = (event) => {
        playerRef.current = event.target;
        setIsPlayerReady(true);
        try {
            if (typeof playerRef.current.unMute === 'function') {
                playerRef.current.unMute();
            }
        } catch (e) { }

        if (syncTime >= playerStartTime && syncTime < endTimeInSec && !isTrail) {
            playerRef.current.seekTo(offset, true);
            playerRef.current.playVideo();
            lastSeekTime.current = Date.now();
        }
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
            id={`player-wrapper-${song.startTime}-${song.title}`}
            className="youtube-player-wrapper"
            style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                opacity: curvedScale,
                pointerEvents: isPrimary ? 'auto' : 'none',
                zIndex: isPrimary ? 10 : 0,
                transition: 'opacity 0.2s linear'
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
