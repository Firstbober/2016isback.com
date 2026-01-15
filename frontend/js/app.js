/* 2016isback.com - App Logic */

document.addEventListener('DOMContentLoaded', () => {
    // Configuration - Static Playlist IDs (To be updated by Backend)
    const PLAYLIST_DATA = {
        pl: {
            title: "Polska 2016",
            spotify: "3CdfoioAm3TCoieKyYPPys", // Placeholder: Top of 2016 Poland
            youtube: "PLSQ_KMxSZtsxJtO5FqYyqJcOzdxUhp0PR" // Placeholder
        },
        world: {
            title: "World 2016",
            spotify: "3CdfoioAm3TCoieKyYPPys", // Placeholder: Top of 2016 Poland
            youtube: "PLSQ_KMxSZtsxJtO5FqYyqJcOzdxUhp0PR" // Placeholder
        }
    };

    const state = {
        country: localStorage.getItem('country') || 'world'
    };

    // Elements
    const buttons = {
        pl: document.getElementById('btn-pl'),
        world: document.getElementById('btn-world')
    };
    const dateElement = document.getElementById('current-date');
    const spotifyIframe = document.getElementById('spotify-player');
    const youtubeIframe = document.getElementById('youtube-player');

    // 1. Initialize Date
    function updateDateTicker() {
        const today = new Date();
        const year2016 = new Date(today);
        year2016.setFullYear(2016);
        
        const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
        dateElement.textContent = `Broadcasting Live: ${year2016.toLocaleDateString('en-US', options)}`;
    }

    // 2. Update Players
    function updatePlayers() {
        const data = PLAYLIST_DATA[state.country];
        
        // Spotify Embed URL
        spotifyIframe.src = `https://open.spotify.com/embed/playlist/${data.spotify}?utm_source=generator&theme=0`;
        
        // YouTube Embed URL (Playlist mode)
        youtubeIframe.src = `https://www.youtube.com/embed/videoseries?list=${data.youtube}`;

        // Toggle Buttons
        Object.keys(buttons).forEach(key => {
            buttons[key].classList.toggle('active', key === state.country);
        });
    }

    // 3. Event Listeners
    buttons.pl.addEventListener('click', () => {
        state.country = 'pl';
        localStorage.setItem('country', 'pl');
        updatePlayers();
    });

    buttons.world.addEventListener('click', () => {
        state.country = 'world';
        localStorage.setItem('country', 'world');
        updatePlayers();
    });

    // Start
    updateDateTicker();
    updatePlayers();
});
