/* 2016isback.com - Radio Station Logic */

let player;
let isPlaying = false;
let tracklistData = null;
let currentSongIndex = -1;
let syncInterval;

const state = {
    country: localStorage.getItem('country') || 'world'
};

async function init() {
    loadYouTubeAPI();
    setupEventListeners();
    updateDateTicker();
    await loadTracklist();
}

function loadYouTubeAPI() {
    const tag = document.createElement('script');
    tag.src = "https://www.youtube.com/iframe_api";
    const firstScriptTag = document.getElementsByTagName('script')[0];
    firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
}

function onYouTubeIframeAPIReady() {
    console.log('YouTube API Ready');
    player = new YT.Player('youtube-player', {
        height: '390',
        width: '640',
        videoId: '',
        playerVars: {
            'playsinline': 1,
            'controls': 1,
            'disablekb': 1
        },
        events: {
            'onReady': onPlayerReady,
            'onStateChange': onPlayerStateChange
        }
    });
}

async function loadTracklist() {
    const dataPath = `data/tracklist-${state.country === 'world' ? 'us' : 'pl'}.json`;
    
    try {
        const response = await fetch(dataPath);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        tracklistData = await response.json();
        console.log('Tracklist loaded:', tracklistData);
    } catch (error) {
        console.error('Error loading tracklist:', error);
        document.getElementById('now-playing').textContent = 'Error loading tracklist';
    }
}

function calculateCurrentSong() {
    if (!tracklistData || !tracklistData.songs) return null;

    const now = new Date();
    const currentSeconds = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
    
    let accumulatedSeconds = 0;
    
    for (let i = 0; i < tracklistData.songs.length; i++) {
        const song = tracklistData.songs[i];
        const songEndSeconds = accumulatedSeconds + song.duration_sec;
        
        if (currentSeconds >= accumulatedSeconds && currentSeconds < songEndSeconds) {
            const secondsIntoSong = currentSeconds - accumulatedSeconds;
            return {
                song: song,
                index: i,
                secondsIntoSong: secondsIntoSong,
                songEndTime: songEndSeconds
            };
        }
        
        accumulatedSeconds = songEndSeconds;
    }
    
    return null;
}

function startRadio() {
    if (!tracklistData) {
        setTimeout(startRadio, 500);
        return;
    }

    const currentInfo = calculateCurrentSong();
    
    if (currentInfo) {
        loadAndPlaySong(currentInfo.song, currentInfo.secondsIntoSong);
    } else {
        const firstSong = tracklistData.songs[0];
        loadAndPlaySong(firstSong, 0);
    }

    startSync();
}

function loadAndPlaySong(song, startTime) {
    if (player && player.loadVideoById) {
        player.loadVideoById(song.youtube_id, startTime);
        player.setVolume(100);
    } else {
        setTimeout(() => loadAndPlaySong(song, startTime), 100);
    }
    
    updateNowPlaying(song);
    currentSongIndex = tracklistData.songs.findIndex(s => s.youtube_id === song.youtube_id);
}

function onPlayerReady(event) {
    console.log('Player ready');
    startRadio();
}

function onPlayerStateChange(event) {
    if (event.data === YT.PlayerState.ENDED) {
        const nextSong = calculateCurrentSong();
        if (nextSong && nextSong.index !== currentSongIndex) {
            loadAndPlaySong(nextSong.song, nextSong.secondsIntoSong);
        }
    }
}

function startSync() {
    syncInterval = setInterval(() => {
        syncToTime();
    }, 5000);
}

function syncToTime() {
    const currentInfo = calculateCurrentSong();
    
    if (currentInfo) {
        const timeDifference = Math.abs(getCurrentPlayerTime() - currentInfo.secondsIntoSong);
        
        if (currentInfo.index !== currentSongIndex || timeDifference > 3) {
            console.log('Syncing to:', currentInfo.song.artist_title, 'at', currentInfo.secondsIntoSong);
            loadAndPlaySong(currentInfo.song, currentInfo.secondsIntoSong);
        }
    }
}

function getCurrentPlayerTime() {
    if (player && player.getCurrentTime) {
        return player.getCurrentTime();
    }
    return 0;
}

function updateNowPlaying(song) {
    const nowPlaying = document.getElementById('now-playing');
    nowPlaying.innerHTML = `
        <div class="song-artist">${song.artist}</div>
        <div class="song-title">${song.title}</div>
    `;
}

function updateDateTicker() {
    const today = new Date();
    const year2016 = new Date(today);
    year2016.setFullYear(2016);
    
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    document.getElementById('current-date').textContent = `Broadcasting Live: ${year2016.toLocaleDateString('en-US', options)}`;
    
    updateTimeDisplay();
    setInterval(updateTimeDisplay, 1000);
}

function updateTimeDisplay() {
    const now = new Date();
    const timeString = now.toLocaleTimeString('en-US', { hour12: false });
    document.getElementById('current-time').textContent = timeString;
    
    const currentInfo = calculateCurrentSong();
    if (currentInfo) {
        const timeRemaining = Math.ceil(currentInfo.song.duration_sec - currentInfo.secondsIntoSong);
        const minutes = Math.floor(timeRemaining / 60);
        const seconds = timeRemaining % 60;
        document.getElementById('song-progress').textContent = 
            `${minutes}:${seconds.toString().padStart(2, '0')} remaining`;
    }
}

function togglePlayPause() {
    if (!player) return;
    
    const playIcon = document.getElementById('icon-play');
    const pauseIcon = document.getElementById('icon-pause');
    
    if (isPlaying) {
        player.pauseVideo();
        isPlaying = false;
        playIcon.style.display = 'block';
        pauseIcon.style.display = 'none';
    } else {
        player.playVideo();
        isPlaying = true;
        playIcon.style.display = 'none';
        pauseIcon.style.display = 'block';
    }
}

function setupEventListeners() {
    const buttons = {
        pl: document.getElementById('btn-pl'),
        world: document.getElementById('btn-world')
    };

    buttons.pl.addEventListener('click', async () => {
        if (state.country === 'pl') return;
        
        state.country = 'pl';
        localStorage.setItem('country', 'pl');
        
        buttons.pl.classList.add('active');
        buttons.world.classList.remove('active');
        
        currentSongIndex = -1;
        await loadTracklist();
        startRadio();
    });

    buttons.world.addEventListener('click', async () => {
        if (state.country === 'world') return;
        
        state.country = 'world';
        localStorage.setItem('country', 'world');
        
        buttons.world.classList.add('active');
        buttons.pl.classList.remove('active');
        
        currentSongIndex = -1;
        await loadTracklist();
        startRadio();
    });

    document.getElementById('btn-play-pause').addEventListener('click', togglePlayPause);
}

document.addEventListener('DOMContentLoaded', () => {
    const buttons = {
        pl: document.getElementById('btn-pl'),
        world: document.getElementById('btn-world')
    };

    buttons[state.country === 'world' ? 'world' : 'pl'].classList.add('active');
    buttons[state.country === 'world' ? 'pl' : 'world'].classList.remove('active');

    init();
});
