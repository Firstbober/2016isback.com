import { useState, useEffect } from 'react';

const getSecondsFromTime = (timeStr) => {
    const [h, m, s] = timeStr.split(':').map(Number);
    return h * 3600 + m * 60 + s;
};

const getCurrentLocalSeconds = () => {
    const now = new Date();
    return now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
};

export const useRadioSync = (tracklist) => {
    const [currentSong, setCurrentSong] = useState(null);
    const [offset, setOffset] = useState(0);

    useEffect(() => {
        if (!tracklist || !tracklist.songs) return;

        const sync = () => {
            const currentSec = getCurrentLocalSeconds();
            const song = tracklist.songs.find((s) => {
                const start = getSecondsFromTime(s.startTime);
                const end = start + s.durationSec;
                return currentSec >= start && currentSec < end;
            });

            if (song) {
                if (!currentSong || currentSong.startTime !== song.startTime) {
                    setCurrentSong(song);
                }
                setOffset(currentSec - getSecondsFromTime(song.startTime));
            }
        };

        sync();
        const interval = setInterval(sync, 1000);
        return () => clearInterval(interval);
    }, [tracklist, currentSong]);

    return { currentSong, offset };
};
