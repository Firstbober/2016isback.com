import sqlite3
import random
import argparse
from datetime import datetime, timedelta
import os
import json

# Paths
DB_PATH_PL = os.path.join(os.path.dirname(__file__), "odsluchane.db")
DB_PATH_US = os.path.join(os.path.dirname(__file__), "us-billboard-charts.sqlite")

class RadioSimulator:
    def __init__(self, date_str, region='pl', station_id=None, seed=None):
        self.target_date = datetime.strptime(date_str, "%Y-%m-%d")
        self.region = region
        self.station_id = station_id
        if seed is not None:
            random.seed(seed)
        
        self.recently_played_songs = [] # Buffer for specific songs
        self.recently_played_artists = [] # Buffer for normalized artists
        self.song_buffer_size = 50 
        self.artist_buffer_size = 15 # Avoid same artist for ~1 hour

    def _get_debut_dates(self, conn):
        """Find the absolute first time any song was seen in the DB for safety."""
        cursor = conn.cursor()
        print("Indexing song debut dates for safety...")
        cursor.execute("SELECT artist_title, MIN(date) FROM tracks GROUP BY artist_title")
        return {row[0].lower().strip(): row[1] for row in cursor.fetchall()}

    def load_poland_data(self):
        if not os.path.exists(DB_PATH_PL):
            raise FileNotFoundError(f"Database not found at {DB_PATH_PL}")
        
        conn = sqlite3.connect(DB_PATH_PL)
        debuts = self._get_debut_dates(conn)
        
        # Look back window for 'hot' songs
        window_start = (self.target_date - timedelta(days=60)).strftime("%Y-%m-%d")
        target_str = self.target_date.strftime("%Y-%m-%d")
        
        cursor = conn.cursor()
        
        # If a specific station is requested, filter by it
        station_filter = ""
        params = [window_start, target_str]
        if self.station_id:
            station_filter = "AND station_id = ?"
            params.append(self.station_id)

        # Query frequency of plays in the last 60 days
        query = f"""
        SELECT artist_title, COUNT(*) as frequency 
        FROM tracks 
        WHERE date >= ? AND date <= ? {station_filter}
        GROUP BY artist_title
        """
        cursor.execute(query, params)
        
        pool = []
        rows = cursor.fetchall()
        print(f"Found {len(rows)} potential songs in the window.")
        
        for artist_title, freq in rows:
            clean_name = artist_title.lower().strip()
            debut = debuts.get(clean_name, "9999-99-99")
            
            # Split artist and title
            parts = artist_title.split(" - ", 1)
            artist = parts[0].strip() if len(parts) > 1 else "Unknown"
            
            # Simple normalization for better artist separation
            norm_artist = artist.lower().replace("dabrowska", "").strip()
            
            # STRICT SAFETY: Song must have debuted on or before target date
            if debut <= target_str:
                weight = freq
                
                # Boost brand new songs (A-Rotation candidates)
                if debut >= (self.target_date - timedelta(days=30)).strftime("%Y-%m-%d"):
                    weight *= 3.0
                
                pool.append({
                    "name": artist_title,
                    "artist": artist,
                    "norm_artist": norm_artist,
                    "weight": weight,
                    "duration": random.randint(180, 280)
                })
        
        conn.close()
        # Sort by weight to categorize
        pool.sort(key=lambda x: x['weight'], reverse=True)
        return pool

    def load_usa_data(self):
        if not os.path.exists(DB_PATH_US):
            print("Warning: US Billboard DB not found. Using empty pool.")
            return []
        
        conn = sqlite3.connect(DB_PATH_US)
        cursor = conn.cursor()
        
        target_str = self.target_date.strftime("%Y-%m-%d")
        cursor.execute("SELECT MAX(date) FROM \"usa-billboard-charts\" WHERE date <= ?", (target_str,))
        row = cursor.fetchone()
        chart_date = row[0] if row else None
        
        if not chart_date:
            print(f"No Billboard data found for {target_str}")
            return []

        print(f"Using Billboard chart from {chart_date}")
        query = """
        SELECT song, artist, rank FROM \"usa-billboard-charts\" 
        WHERE date = ?
        """
        cursor.execute(query, (chart_date,))
        
        pool = []
        for song, artist, rank in cursor.fetchall():
            weight = (101 - rank) ** 2
            pool.append({
                "name": f"{artist} - {song}",
                "artist": artist,
                "weight": weight,
                "duration": random.randint(190, 250)
            })
            
        conn.close()
        pool.sort(key=lambda x: x['weight'], reverse=True)
        return pool

    def generate_log(self):
        if self.region == 'pl':
            pool = self.load_poland_data()
        else:
            pool = self.load_usa_data()

        if not pool:
            return []

        # Categorize pool for structured rotation
        power = pool[:20]      # A-Rotation
        secondary = pool[20:60] # B-Rotation
        recurrent = pool[60:150] # C-Rotation
        gold = pool[150:]       # Library

        current_time = self.target_date.replace(hour=0, minute=0, second=0)
        end_time = current_time + timedelta(days=1)
        
        log = []

        while current_time < end_time:
            # Standard Radio Clock Logic (Probabilistic)
            # 1. Pick a category based on 'clock' position or probability
            # Typical mix: 40% Power, 20% Secondary, 20% Recurrent, 20% Gold
            rand = random.random()
            if rand < 0.4:
                cat = power
            elif rand < 0.6:
                cat = secondary
            elif rand < 0.8:
                cat = recurrent
            else:
                cat = gold

            # If category is empty (rare), fallback to full pool
            if not cat: cat = pool

            # 2. Filter by recently played (Song and Artist)
            available = [s for s in cat if s['name'] not in self.recently_played_songs 
                         and s['norm_artist'] not in self.recently_played_artists]
            
            if not available:
                # Fallback to category ignoring artist separation, then song separation
                available = [s for s in cat if s['name'] not in self.recently_played_songs]
                if not available:
                    # Last resort: absolute fallback to anything in category
                    available = cat

            # 3. Weighted choice within category
            names = [s['name'] for s in available]
            weights = [s['weight'] for s in available]
            choice_name = random.choices(names, weights=weights, k=1)[0]
            song_data = next(s for s in available if s['name'] == choice_name)
            
            log.append({
                "time": current_time.strftime("%H:%M:%S"),
                "artist_title": choice_name,
                "duration_sec": song_data['duration']
            })
            
            current_time += timedelta(seconds=song_data['duration'])
            
            # Update buffers
            self.recently_played_songs.append(choice_name)
            self.recently_played_artists.append(song_data['norm_artist'])
            
            if len(self.recently_played_songs) > self.song_buffer_size:
                self.recently_played_songs.pop(0)
            if len(self.recently_played_artists) > self.artist_buffer_size:
                self.recently_played_artists.pop(0)

        return log

def main():
    parser = argparse.ArgumentParser(description="Generate 2016 Radio Log")
    parser.add_argument("--date", type=str, required=True, help="Date in YYYY-MM-DD")
    parser.add_argument("--region", type=str, choices=['pl', 'us'], default='pl')
    parser.add_argument("--station", type=int, default=None, help="Station ID to mimic (PL only)")
    parser.add_argument("--seed", type=int, default=None)
    parser.add_argument("--output", type=str, default=None)
    
    args = parser.parse_args()
    
    sim = RadioSimulator(args.date, args.region, args.station, args.seed)
    log = sim.generate_log()
    
    if args.output:
        with open(args.output, 'w', encoding='utf-8') as f:
            json.dump(log, f, indent=4, ensure_ascii=False)
        print(f"Log saved to {args.output}")
    else:
        for entry in log:
            print(f"[{entry['time']}] {entry['artist_title']}")

if __name__ == "__main__":
    main()
