import { useState, useEffect } from 'react';

const getSecondsFromTime = (timeStr) => {
    if (!timeStr) return 0;
    const parts = timeStr.trim().split(':').map(Number);
    let sec = 0;
    if (parts.length >= 1) sec += (parts[0] || 0) * 3600;
    if (parts.length >= 2) sec += (parts[1] || 0) * 60;
    if (parts.length >= 3) sec += (parts[2] || 0);
    return sec;
};

const getSecondsInTimezone = (timezone) => {
    const now = new Date();
    try {
        const timeStr = now.toLocaleTimeString('en-GB', {
            timeZone: timezone || 'Europe/Warsaw',
            hour12: false,
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
        // Add milliseconds for sub-second precision
        return getSecondsFromTime(timeStr) + (now.getMilliseconds() / 1000);
    } catch (e) {
        console.warn(`[RadioSync] Timezone ${timezone} failed, falling back to local:`, e);
        return now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds() + (now.getMilliseconds() / 1000);
    }
};

export const useRadioSync = (tracklist) => {
    const [currentSong, setCurrentSong] = useState(null);
    const [offset, setOffset] = useState(0);

    useEffect(() => {
        if (!tracklist || !tracklist.songs) {
            console.log('[RadioSync] Waiting for tracklist...');
            return;
        }

        const timezone = tracklist.timezone || tracklist.metadata?.timezone || 'Europe/Warsaw';
        console.log(`[RadioSync] Initializing with timezone: ${timezone}`);

        const sync = () => {
            const currentSec = getSecondsInTimezone(timezone);

            const song = tracklist.songs.find((s) => {
                const start = getSecondsFromTime(s.startTime);
                const end = start + s.durationSec;
                return currentSec >= start && currentSec < end;
            });

            if (song) {
                if (!currentSong || currentSong.startTime !== song.startTime) {
                    console.log('[RadioSync] Song transition:', song.title, '| Start:', song.startTime, '| Time:', currentSec.toFixed(2));
                    setCurrentSong(song);
                }
                const newOffset = currentSec - getSecondsFromTime(song.startTime);
                setOffset(newOffset);
            } else {
                if (currentSong) {
                    console.log('[RadioSync] No song found for:', currentSec.toFixed(2));
                    setCurrentSong(null);
                }
            }
        };

        sync();
        const interval = setInterval(sync, 100); // 10Hz update for smooth transitions
        return () => clearInterval(interval);
    }, [tracklist, currentSong]);

    return { currentSong, offset };
};
