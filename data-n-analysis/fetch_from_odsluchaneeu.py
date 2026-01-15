import sqlite3
import requests
from bs4 import BeautifulSoup
from datetime import date, timedelta
import time
import sys
import os

# Configuration
DB_PATH = os.path.join(os.path.dirname(__file__), "odsluchane.db")
BASE_URL = "https://www.odsluchane.eu/szukaj.php"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
}
DELAY = 0.5  # Seconds between requests

STATIONS = [
    (2, "RMF FM", 24.5),
    (1, "Radio ZET", 13.6),
    (48, "Trójka", 7.9),
    (3, "Eska", 6.7)
]

def init_db():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    # Stations table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS stations (
        id INTEGER PRIMARY KEY,
        name TEXT,
        market_share REAL
    )
    """)
    
    for s_id, s_name, s_share in STATIONS:
        cursor.execute("INSERT OR REPLACE INTO stations (id, name, market_share) VALUES (?, ?, ?)", (s_id, s_name, s_share))

    # Tracks table migration check
    cursor.execute("PRAGMA table_info(tracks)")
    columns = [col[1] for col in cursor.fetchall()]
    if columns and 'station_id' not in columns:
        print("Migrating tracks table to support multi-station...")
        cursor.execute("ALTER TABLE tracks ADD COLUMN station_id INTEGER")
        cursor.execute("UPDATE tracks SET station_id = 2 WHERE station_id IS NULL")
    
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS tracks_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        station_id INTEGER,
        date TEXT,
        time TEXT,
        artist_title TEXT,
        spotify_url TEXT,
        youtube_url TEXT,
        UNIQUE(station_id, date, time, artist_title)
    )
    """)
    
    # Check if old tracks table exists
    cursor.execute("SELECT count(*) FROM sqlite_master WHERE type='table' AND name='tracks'")
    if cursor.fetchone()[0] > 0:
        cursor.execute("INSERT OR IGNORE INTO tracks_new (station_id, date, time, artist_title, spotify_url, youtube_url) SELECT station_id, date, time, artist_title, spotify_url, youtube_url FROM tracks")
        cursor.execute("DROP TABLE tracks")
    cursor.execute("ALTER TABLE tracks_new RENAME TO tracks")
    
    # Progress table - reset for new station-based tracking
    # We check if it already has station_id to avoid unnecessary resets
    cursor.execute("PRAGMA table_info(scraping_progress)")
    progress_cols = [col[1] for col in cursor.fetchall()]
    if 'station_id' not in progress_cols:
        cursor.execute("DROP TABLE IF EXISTS scraping_progress")
        
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS scraping_progress (
        station_id INTEGER,
        date TEXT,
        completed INTEGER DEFAULT 0,
        PRIMARY KEY (station_id, date)
    )
    """)
    
    conn.commit()
    return conn

def get_tracks_for_chunk(session, station_id, target_date, time_from, time_to, retries=3):
    params = {
        "r": station_id,
        "date": target_date.strftime("%d-%m-%Y"),
        "time_from": time_from,
        "time_to": time_to
    }
    
    for attempt in range(retries):
        try:
            response = session.get(BASE_URL, params=params, headers=HEADERS, timeout=20)
            response.raise_for_status()
            
            soup = BeautifulSoup(response.text, "html.parser")
            table = soup.select_one("table.table.is-striped")
            if not table:
                return []

            tracks = []
            rows = table.select("tbody tr")
            for row in rows:
                cols = row.find_all("td", recursive=False)
                if len(cols) < 3 or cols[0].get("colspan"):
                    continue
                    
                track_time = cols[0].get_text(strip=True)
                
                name_link = cols[1].select_one("a.title-link")
                if not name_link:
                    continue
                artist_title = name_link.get_text(strip=True)
                
                spotify_link = cols[2].select_one(".media-spotify-button a")
                spotify_url = spotify_link["href"] if spotify_link else None
                
                youtube_link = cols[2].select_one(".media-youtube-button a")
                youtube_url = youtube_link["href"] if youtube_link else None
                
                tracks.append((
                    station_id,
                    target_date.strftime("%Y-%m-%d"),
                    track_time,
                    artist_title,
                    spotify_url,
                    youtube_url
                ))
            return tracks
        except Exception as e:
            print(f"  Attempt {attempt+1} failed for {target_date} ({time_from}-{time_to}): {e}")
            time.sleep(DELAY * 2)
            
    return []

def scrape_range(start_year, end_year):
    conn = init_db()
    session = requests.Session()
    
    for station_id, station_name, _ in STATIONS:
        print(f"\n--- Starting Station: {station_name} ---")
        start_date = date(start_year, 1, 1)
        end_date = date(end_year, 12, 31)
        current_date = start_date

        while current_date <= end_date:
            date_str = current_date.strftime("%Y-%m-%d")
            
            # Check progress
            cursor = conn.cursor()
            cursor.execute("SELECT completed FROM scraping_progress WHERE station_id = ? AND date = ?", (station_id, date_str))
            row = cursor.fetchone()
            if row and row[0] == 1:
                current_date += timedelta(days=1)
                continue

            print(f"Scraping {station_name} - {date_str}...")
            
            daily_tracks = []
            chunks = [(0, 10), (10, 20), (20, 0)]
            
            for t_from, t_to in chunks:
                tracks = get_tracks_for_chunk(session, station_id, current_date, t_from, t_to)
                daily_tracks.extend(tracks)
                time.sleep(DELAY)
                
            if daily_tracks:
                cursor.executemany("""
                INSERT OR IGNORE INTO tracks (station_id, date, time, artist_title, spotify_url, youtube_url)
                VALUES (?, ?, ?, ?, ?, ?)
                """, daily_tracks)
                
            cursor.execute("INSERT OR REPLACE INTO scraping_progress (station_id, date, completed) VALUES (?, ?, 1)", (station_id, date_str))
            conn.commit()
            
            print(f"  Added {len(daily_tracks)} tracks.")
            current_date += timedelta(days=1)

    print("\nAll stations scraping completed!")
    conn.close()

if __name__ == "__main__":
    start_y = 2015
    end_y = 2016
    
    if len(sys.argv) > 1:
        start_y = int(sys.argv[1])
    if len(sys.argv) > 2:
        end_y = int(sys.argv[2])
        
    scrape_range(start_y, end_y)
