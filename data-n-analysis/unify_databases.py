import sqlite3
import os

DB_ODSLUCHANE = "odsluchane.db"
DB_BILLBOARD = "us-billboard-charts.sqlite"
DB_UNIFIED = "music_data.db"

def init_unified_db(conn):
    cursor = conn.cursor()
    cursor.executescript("""
    CREATE TABLE IF NOT EXISTS songs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        artist TEXT,
        title TEXT,
        full_name TEXT UNIQUE,
        youtube_url TEXT
    );

    CREATE TABLE IF NOT EXISTS stations (
        id INTEGER PRIMARY KEY,
        name TEXT,
        market_share REAL
    );

    CREATE TABLE IF NOT EXISTS odsluchane_plays (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        song_id INTEGER,
        station_id INTEGER,
        date TEXT,
        time TEXT,
        FOREIGN KEY (song_id) REFERENCES songs (id),
        FOREIGN KEY (station_id) REFERENCES stations (id)
    );

    CREATE TABLE IF NOT EXISTS billboard_entries (
        song_id INTEGER,
        date TEXT,
        rank INTEGER,
        last_week INTEGER,
        peak_rank INTEGER,
        weeks_on_board INTEGER,
        FOREIGN KEY (song_id) REFERENCES songs (id)
    );
    """)
    conn.commit()

def split_artist_title(artist_title):
    if " - " in artist_title:
        parts = artist_title.split(" - ", 1)
        return parts[0].strip(), parts[1].strip()
    return "Unknown", artist_title.strip()

def migrate():
    if os.path.exists(DB_UNIFIED):
        os.remove(DB_UNIFIED)
    
    conn_unified = sqlite3.connect(DB_UNIFIED)
    init_unified_db(conn_unified)
    
    # 1. Migrate Stations
    if os.path.exists(DB_ODSLUCHANE):
        conn_od = sqlite3.connect(DB_ODSLUCHANE)
        stations = conn_od.execute("SELECT id, name, market_share FROM stations").fetchall()
        conn_unified.executemany("INSERT INTO stations (id, name, market_share) VALUES (?, ?, ?)", stations)
        
        # 2. Migrate Odsluchane Songs and Plays
        print("Migrating Odsluchane data...")
        tracks = conn_od.execute("SELECT artist_title, station_id, date, time, youtube_url FROM tracks").fetchall()
        
        song_map = {} # full_name -> id
        
        for artist_title, station_id, date, time_val, yt_url in tracks:
            full_name = artist_title.strip()
            if full_name not in song_map:
                artist, title = split_artist_title(full_name)
                # Clean YT URL if it's a search link, we'll resolve it later
                final_yt = yt_url if yt_url and "youtube.com/watch" in yt_url else None
                
                cursor = conn_unified.cursor()
                cursor.execute("INSERT OR IGNORE INTO songs (artist, title, full_name, youtube_url) VALUES (?, ?, ?, ?)", 
                             (artist, title, full_name, final_yt))
                if cursor.lastrowid:
                    song_id = cursor.lastrowid
                else:
                    song_id = conn_unified.execute("SELECT id FROM songs WHERE full_name = ?", (full_name,)).fetchone()[0]
                song_map[full_name] = song_id
            
            song_id = song_map[full_name]
            conn_unified.execute("INSERT INTO odsluchane_plays (song_id, station_id, date, time) VALUES (?, ?, ?, ?)",
                               (song_id, station_id, date, time_val))
        
        conn_od.close()
        conn_unified.commit()

    # 3. Migrate Billboard Data
    if os.path.exists(DB_BILLBOARD):
        print("Migrating Billboard data...")
        conn_bb = sqlite3.connect(DB_BILLBOARD)
        # Table name in sqlite is "usa-billboard-charts"
        bb_data = conn_bb.execute('SELECT "song", "artist", "date", "rank", "last-week", "peak-rank", "weeks-on-board" FROM "usa-billboard-charts"').fetchall()
        
        for song_name, artist_name, date_val, rank, last_week, peak_rank, weeks_on_board in bb_data:
            full_name = f"{artist_name} - {song_name}"
            
            cursor = conn_unified.cursor()
            cursor.execute("SELECT id FROM songs WHERE full_name = ?", (full_name,))
            row = cursor.fetchone()
            
            if not row:
                cursor.execute("INSERT INTO songs (artist, title, full_name, youtube_url) VALUES (?, ?, ?, ?)",
                             (artist_name, song_name, full_name, None))
                song_id = cursor.lastrowid
            else:
                song_id = row[0]
            
            conn_unified.execute("""
                INSERT INTO billboard_entries (song_id, date, rank, last_week, peak_rank, weeks_on_board)
                VALUES (?, ?, ?, ?, ?, ?)
            """, (song_id, date_val, rank, last_week, peak_rank, weeks_on_board))
            
        conn_bb.close()
        conn_unified.commit()

    print(f"Migration complete. Unified database created at {DB_UNIFIED}")
    conn_unified.close()

if __name__ == "__main__":
    migrate()
