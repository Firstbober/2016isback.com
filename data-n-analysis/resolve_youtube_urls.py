import sqlite3
import subprocess
import time
import random
import os

DB_PATH = "music_data.db"

def get_youtube_id(query):
    """Use yt-dlp to get the first video ID for a search query."""
    try:
        # ytsearch1: returns the first result. --get-id only returns the ID.
        result = subprocess.run(
            ["yt-dlp", "--get-id", f"ytsearch1:{query}", "--cookies", "/home/bober/.config/yt-dlp/cookies.firefox-private.txt"],
            capture_output=True,
            text=True,
            check=True,
            timeout=30
        )
        video_id = result.stdout.strip()
        if video_id:
            return f"https://www.youtube.com/watch?v={video_id}"
    except Exception as e:
        print(f"Error searching for '{query}': {e}")
    return None

def resolve_links():
    if not os.path.exists(DB_PATH):
        print(f"Error: {DB_PATH} not found. Run unify_databases.py first.")
        return

    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    # Find songs that don't have a valid watch URL
    cursor.execute("SELECT id, full_name FROM songs WHERE youtube_url IS NULL OR youtube_url NOT LIKE '%watch?v=%'")
    songs_to_resolve = cursor.fetchall()

    print(f"Found {len(songs_to_resolve)} songs to resolve.")

    count = 0
    for song_id, full_name in songs_to_resolve:
        print(f"[{count+1}/{len(songs_to_resolve)}] Resolving: {full_name}")
        
        yt_url = get_youtube_id(full_name)
        
        if yt_url:
            cursor.execute("UPDATE songs SET youtube_url = ? WHERE id = ?", (yt_url, song_id))
            conn.commit()
            print(f"  -> Found: {yt_url}")
        else:
            print(f"  -> Failed to find link.")

        count += 1
        
        # Throttling to avoid being blocked by YouTube
        time.sleep(random.uniform(0.1, 0.5))
        
        # Longer break every 50 requests
        if count % 50 == 0:
            print("Taking a short break...")
            time.sleep(random.uniform(5.0, 10.0))

    conn.close()
    print("Link resolution complete.")

if __name__ == "__main__":
    resolve_links()
