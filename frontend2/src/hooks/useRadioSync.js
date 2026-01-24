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

const getWarsawSeconds = () => {
    const now = new Date();
    try {
        const warsawTime = now.toLocaleTimeString('en-GB', {
            timeZone: 'Europe/Warsaw',
            hour12: false,
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
        return getSecondsFromTime(warsawTime);
    } catch (e) {
        // Fallback to local time if timezone is not supported
        return now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
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

        console.log('[RadioSync] Initializing with tracklist generated at:', tracklist.date || tracklist.generated_at);

        const sync = () => {
            const currentSec = getWarsawSeconds();

            const song = tracklist.songs.find((s) => {
                const start = getSecondsFromTime(s.startTime);
                const end = start + s.durationSec;
                return currentSec >= start && currentSec < end;
            });

            if (song) {
                if (!currentSong || currentSong.startTime !== song.startTime) {
                    console.log('[RadioSync] Switching to song:', song.title, 'Starts:', song.startTime, 'CurrentSec:', currentSec);
                    setCurrentSong(song);
                }
                const newOffset = currentSec - getSecondsFromTime(song.startTime);
                setOffset(newOffset);
            } else {
                if (currentSong) {
                    console.log('[RadioSync] No song found for current time:', currentSec);
                    setCurrentSong(null);
                }
            }
        };

        sync();
        const interval = setInterval(sync, 1000);
        return () => clearInterval(interval);
    }, [tracklist, currentSong]);

    return { currentSong, offset };
};
