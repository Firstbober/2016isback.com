import sqlite3
import subprocess
import time
import random
import os

DB_PATH = "music_data.db"

def get_youtube_duration(url):
    """Use yt-dlp to get the duration of a YouTube video in seconds."""
    try:
        result = subprocess.run(
            ["yt-dlp", "--get-duration", url, "--cookies", "/home/bober/.config/yt-dlp/cookies.firefox-private.txt"],
            capture_output=True,
            text=True,
            check=True,
            timeout=30
        )
        duration_str = result.stdout.strip()
        if duration_str:
            # Parse duration in format MM:SS or HH:MM:SS
            parts = duration_str.split(":")
            if len(parts) == 2:
                minutes, seconds = map(int, parts)
                return minutes * 60 + seconds
            elif len(parts) == 3:
                hours, minutes, seconds = map(int, parts)
                return hours * 3600 + minutes * 60 + seconds
    except Exception as e:
        print(f"  -> Error getting duration: {e}")
    return None

def get_durations():
    if not os.path.exists(DB_PATH):
        print(f"Error: {DB_PATH} not found.")
        return

    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    # Create indexes for better query performance
    print("Creating indexes for better performance...")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_odsluchane_plays_station_song ON odsluchane_plays(station_id, song_id)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_odsluchane_plays_song ON odsluchane_plays(song_id)")
    conn.commit()
    print("Indexes created.")

    # Find songs that have a valid watch URL but no duration yet, excluding songs that have appeared at station 48
    cursor.execute("""SELECT s.id, s.full_name, s.youtube_url 
                      FROM songs s
                      LEFT JOIN odsluchane_plays op ON s.id = op.song_id AND op.station_id = 48
                      WHERE s.youtube_url LIKE '%watch?v=%' 
                        AND s.duration_seconds IS NULL
                        AND op.id IS NULL
                      ORDER BY RANDOM()""")
    songs_to_process = cursor.fetchall()

    print(f"Found {len(songs_to_process)} songs to process.")

    count = 0
    for song_id, full_name, youtube_url in songs_to_process:
        print(f"[{count+1}/{len(songs_to_process)}] Getting duration for: {full_name}")
        
        duration = get_youtube_duration(youtube_url)
        
        if duration:
            cursor.execute("UPDATE songs SET duration_seconds = ? WHERE id = ?", (duration, song_id))
            conn.commit()
            minutes, seconds = divmod(duration, 60)
            print(f"  -> Duration: {minutes}:{seconds:02d}")
        else:
            print(f"  -> Failed to get duration.")

        count += 1
        
        # Throttling to avoid being blocked by YouTube
        time.sleep(random.uniform(0.0, 0.1))
        
        # Longer break every 50 requests
        if count % 50 == 0:
            print("Taking a short break...")
            time.sleep(random.uniform(5.0, 10.0))

    conn.close()
    print("Duration retrieval complete.")

if __name__ == "__main__":
    get_durations()
