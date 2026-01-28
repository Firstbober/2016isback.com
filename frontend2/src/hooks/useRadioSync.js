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
    const [activeSongs, setActiveSongs] = useState([]);
    const [syncTime, setSyncTime] = useState(0);

    const FADE_OUT_SEC = 15;
    const TRAIL_TIME = 3600; // 1 hour trail (effectively infinite)

    useEffect(() => {
        if (!tracklist || !tracklist.songs) {
            console.log('[RadioSync] Waiting for tracklist...');
            return;
        }

        const timezone = tracklist.timezone || tracklist.metadata?.timezone || 'Europe/Warsaw';
        console.log(`[RadioSync] Initializing with timezone: ${timezone}`);

        const sync = () => {
            const currentSec = getSecondsInTimezone(timezone);
            setSyncTime(currentSec);

            // Find all songs that should be "active" (either playing or about to start)
            const active = tracklist.songs.filter((s) => {
                const start = getSecondsFromTime(s.startTime);
                const end = start + s.durationSec;

                // Active if: current time is within duration + small trail time
                // OR current time is within 15 seconds BEFORE starting (fade in lead time)
                return currentSec >= (start - FADE_OUT_SEC) && currentSec < (end + TRAIL_TIME);
            });

            // Sort active songs by startTime
            active.sort((a, b) => getSecondsFromTime(a.startTime) - getSecondsFromTime(b.startTime));

            // STABLE POOL: Keep only the last 3 songs.
            // This ensures that an iframe is ONLY deleted when a brand new song joins the list.
            setActiveSongs(active.slice(-3));
        };

        sync();
        const interval = setInterval(sync, 100); // 10Hz update for smooth transitions
        return () => clearInterval(interval);
    }, [tracklist]);

    return { activeSongs, syncTime };
};
