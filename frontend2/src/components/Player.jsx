import { useRef, useEffect, useState, useMemo } from 'react';
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
    const videoId = getYouTubeId(song?.youtubeUrl);

    // Reset sync state is NOT needed here because this component is NEVER reused for a different song.
    // It is spawned once for a specific song and eventually fades out forever.

    const [hasInitialSeeked, setHasInitialSeeked] = useState(false);
    const lastAppliedVolume = useRef(-1);
    const lastSeekTime = useRef(0);

    const startTimeInSec = getSecondsFromTime(song.startTime);
    const endTimeInSec = startTimeInSec + song.durationSec;

    // The player should start 15 seconds before the song's official start time
    const INTRO_SKIP = 10;
    const playerStartTime = startTimeInSec - 15;
    const songProgress = syncTime - startTimeInSec;
    const offset = Math.max(0, songProgress + INTRO_SKIP);

    const FADE_TIME = 15;

    // Calculate volume and opacity scale
    let scale = 1;

    // Fade In (Lead in)
    if (syncTime < startTimeInSec) {
        scale = (syncTime - playerStartTime) / FADE_TIME;
    }
    // Fade Out (Lead out)
    else if (syncTime > (endTimeInSec - FADE_TIME)) {
        scale = (endTimeInSec - syncTime) / FADE_TIME;
    }

    // Trail check
    let isTrail = false;
    if (syncTime >= endTimeInSec) {
        scale = 0;
        isTrail = true;
    }

    const curvedScale = Math.pow(Math.max(0, Math.min(1, scale)), 1.2);

    // Volume & Sync Loop
    useEffect(() => {
        let isMounted = true;
        if (!playerRef.current) return;
        const player = playerRef.current;

        const checkState = () => {
            if (!isMounted) return;

            // 1. VOLUME logic
            try {
                // If trail, force mute/zero
                if (isTrail) {
                    if (typeof player.mute === 'function') player.mute();
                    // Ensure paused if deep in trail to save CPU, but mute is safest for audio
                    // We can pause if we are sure it won't trigger reload.
                    // Let's stick to mute + hidden for "Parked" state.
                } else {
                    // Calc target volume
                    const targetVolume = Math.floor(curvedScale * globalVolume);

                    if (targetVolume > 0) {
                        if (typeof player.unMute === 'function') player.unMute();
                    }

                    if (Math.abs(lastAppliedVolume.current - targetVolume) >= 1) {
                        if (typeof player.setVolume === 'function') {
                            player.setVolume(targetVolume);
                            lastAppliedVolume.current = targetVolume;
                        }
                    }
                }
            } catch (e) { }

            // 2. TIMING/SYNC logic (only if active)
            if (!isTrail && isPlayerReady) {
                try {
                    const state = player.getPlayerState(); // 1=playing
                    if (state === 1) {
                        const current = player.getCurrentTime();
                        const diff = Math.abs(current - offset);
                        if (diff > 8) {
                            // Only seek if significantly off
                            // And throttle it
                            if (Date.now() - lastSeekTime.current > 5000) {
                                player.seekTo(offset, true);
                                lastSeekTime.current = Date.now();
                                setHasInitialSeeked(true);
                            }
                        } else {
                            // Close enough
                            if (!hasInitialSeeked) setHasInitialSeeked(true);
                        }
                    } else if (syncTime >= playerStartTime && syncTime < endTimeInSec) {
                        // Should be playing but isn't
                        if (state !== 3) { // 3=buffering
                            player.playVideo();
                        }
                    }
                } catch (e) { }
            }
        };

        const interval = setInterval(checkState, 1000); // 1Hz check is enough for stability 
        return () => clearInterval(interval);

    }, [syncTime, isTrail, curvedScale, globalVolume, offset, isPlayerReady, playerStartTime, endTimeInSec]);


    const onReady = (event) => {
        playerRef.current = event.target;
        setIsPlayerReady(true);
        event.target.mute(); // Start muted just in case

        // Initial Seek
        if (syncTime >= playerStartTime && syncTime < endTimeInSec && !isTrail) {
            console.log(`[Player] Spawning ${videoId} at ${offset}`);
            event.target.seekTo(offset, true);
            event.target.playVideo();
            lastSeekTime.current = Date.now();
        }
    };

    const opts = useMemo(() => ({
        height: '100%',
        width: '100%',
        playerVars: {
            autoplay: 0,
            controls: 0,
            modestbranding: 1,
            rel: 0,
        },
    }), []);

    return (
        <div
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
                // If trail, hide completely to prevent any interaction, but keep mounted
                display: 'block',
                transition: 'opacity 0.2s linear'
            }}
        >
            <YouTube
                videoId={videoId}
                opts={opts}
                onReady={onReady}
                className="youtube-embed"
            />
        </div>
    );
};

const Player = ({ activeSongs, syncTime, volume, setVolume, lastVolume, setLastVolume }) => {
    const [history, setHistory] = useState([]);

    // HISTORY APPEND LOGIC
    useEffect(() => {
        if (!activeSongs || activeSongs.length === 0) return;

        setHistory(prev => {
            const next = [...prev];
            let changed = false;
            activeSongs.forEach(song => {
                // Unique key for this specific airing of the song
                const key = `${song.youtubeUrl}_${song.startTime}`;
                const exists = next.find(h => `${h.youtubeUrl}_${h.startTime}` === key);

                if (!exists) {
                    console.log(`[Appender] Adding new song to history: ${song.title}`);
                    next.push(song);
                    changed = true;
                }
            });
            return changed ? next : prev;
        });
    }, [activeSongs]);

    // NUCLEAR OPTION: Auto-reload after 50 songs to clear memory
    useEffect(() => {
        if (history.length > 50) {
            console.warn('[Appender] History limit reached (50). Reloading page for freshness...');
            window.location.reload();
        }
    }, [history]);

    const toggleMute = () => {
        if (volume > 0) {
            setLastVolume(volume);
            setVolume(0);
        } else {
            setVolume(lastVolume > 0 ? lastVolume : 100);
        }
    };

    // Primary song logic for UI (metadata)
    // We can use the activeSongs prop for this, or derive from history
    // Using activeSongs is safer for "Now Playing" accuracy
    const activeList = activeSongs || [];
    const sortedActive = [...activeList].sort((a, b) => getSecondsFromTime(b.startTime) - getSecondsFromTime(a.startTime));

    const primarySong = sortedActive.find(s => {
        const start = getSecondsFromTime(s.startTime);
        const end = start + s.durationSec;
        return syncTime >= (start - 15) && syncTime < end;
    }) || sortedActive[0];

    if (!primarySong) return <div className="no-song">Loading...</div>;

    const primaryStart = getSecondsFromTime(primarySong.startTime);
    const currentOffset = syncTime - primaryStart;

    const formatTime = (sec) => {
        const totalSec = Math.floor(sec);
        const mins = Math.floor(totalSec / 60);
        const secs = totalSec % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
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
                    <span>Live Radio ({history.length}/50)</span>
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
                {history.map((song) => (
                    <SingleYouTubePlayer
                        key={`${song.youtubeUrl}_${song.startTime}`}
                        song={song}
                        syncTime={syncTime}
                        globalVolume={volume}
                        isPrimary={song.youtubeUrl === primarySong.youtubeUrl && song.startTime === primarySong.startTime}
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
