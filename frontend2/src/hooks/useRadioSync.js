import { useState, useEffect } from 'react';

const getSecondsFromTime = (timeStr) => {
    const [h, m, s] = timeStr.split(':').map(Number);
    return h * 3600 + m * 60 + s;
};

export const useRadioSync = (tracklist) => {
    const [currentSong, setCurrentSong] = useState(null);
    const [offset, setOffset] = useState(0);

    useEffect(() => {
        if (!tracklist || !tracklist.songs || !tracklist.date) return;

        // Calculate offset between server and client local time
        const serverDate = new Date(tracklist.date);
        const clientDate = new Date();
        const serverTimeOffsetMs = serverDate.getTime() - clientDate.getTime();

        const sync = () => {
            // Get current "server time" by applying the offset
            const nowServer = new Date(Date.now() + serverTimeOffsetMs);

            // Calculate seconds since midnight in the server's time perspective
            const currentSec = nowServer.getHours() * 3600 + nowServer.getMinutes() * 60 + nowServer.getSeconds();

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
