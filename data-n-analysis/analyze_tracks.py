import sqlite3
import pandas as pd
import matplotlib.pyplot as plt
import seaborn as sns
import os
from scipy.stats import linregress
import numpy as np

# Configuration
DB_PATH = os.path.join(os.path.dirname(__file__), "odsluchane.db")
PLOTS_DIR = os.path.join(os.path.dirname(__file__), "plots")

def load_data():
    if not os.path.exists(DB_PATH):
        print(f"Error: Database {DB_PATH} not found.")
        return None
    
    conn = sqlite3.connect(DB_PATH)
    query = """
    SELECT t.date, t.time, t.artist_title, t.station_id, s.name as station_name, s.market_share 
    FROM tracks t
    JOIN stations s ON t.station_id = s.id
    """
    df = pd.read_sql_query(query, conn)
    conn.close()
    
    df['date'] = pd.to_datetime(df['date'])
    df['artist_title'] = df['artist_title'].str.strip().str.lower()
    return df

def analyze():
    df = load_data()
    if df is None or df.empty:
        return

    if not os.path.exists(PLOTS_DIR):
        os.makedirs(PLOTS_DIR)

    # 1. Baseline & New Songs
    library_2015 = set(df[df['date'].dt.year == 2015]['artist_title'].unique())
    df_2016 = df[df['date'].dt.year == 2016].copy()
    
    if df_2016.empty:
        print("No 2016 data found for analysis.")
        return

    df_2016['is_new'] = ~df_2016['artist_title'].isin(library_2015)
    new_songs_list = df_2016[df_2016['is_new']]['artist_title'].unique()

    # Calculate first play for each song in 2016 (Discovery)
    df_2016 = df_2016.sort_values(['date', 'time'])
    discovery_info = df_2016.groupby('artist_title').first().reset_index()
    discovery_info = discovery_info[['artist_title', 'date', 'station_name', 'station_id']]
    discovery_info.columns = ['artist_title', 'debut_date', 'discovery_station', 'discovery_station_id']

    # Merge discovery info back
    df_2016 = df_2016.merge(discovery_info, on='artist_title')
    df_2016['days_since_debut'] = (df_2016['date'] - df_2016['debut_date']).dt.days

    # 2. Market-Weighted Popularity
    song_popularity = df_2016.groupby('artist_title').agg(
        total_plays=('artist_title', 'count'),
        weighted_score=('market_share', 'sum')
    ).sort_values('weighted_score', ascending=False)

    print("\n--- 10 Most Popular Songs in 2016 (Market-Weighted) ---")
    print(song_popularity.head(10))

    # 3. Discovery Leader Metric
    new_songs_discovery = discovery_info[discovery_info['artist_title'].isin(new_songs_list)]
    discovery_leader = new_songs_discovery['discovery_station'].value_counts()
    
    plt.figure(figsize=(10, 6))
    sns.barplot(x=discovery_leader.index, y=discovery_leader.values, hue=discovery_leader.index, palette="viridis", legend=False)
    plt.title("Discovery Leader: Which station plays 'New' songs first?")
    plt.ylabel("Number of Songs Discovered")
    plt.savefig(os.path.join(PLOTS_DIR, "discovery_leader.png"))
    plt.close()

    # Optimized Propagation Data Extraction
    df_new = df_2016[df_2016['is_new']].copy()
    
    # Pre-calculate daily weighted impact for all new songs
    daily_weighted_all = df_new.groupby(['artist_title', 'days_since_debut'])['market_share'].sum().unstack(fill_value=0)
    
    # 4. Market-Weighted Propagation Plot (Top 10 New Songs)
    new_songs_weighted = song_popularity.loc[song_popularity.index.isin(new_songs_list), 'weighted_score']
    if not new_songs_weighted.empty:
        top_10_new = new_songs_weighted.head(10).index
        plt.figure(figsize=(12, 7))
        for song in top_10_new:
            if song in daily_weighted_all.index:
                trajectory = daily_weighted_all.loc[song]
                plt.plot(trajectory.rolling(7, min_periods=1).mean(), label=song[:30])
        plt.title("Market-Weighted Propagation of Top 10 New Songs (7-day MA)")
        plt.xlabel("Days Since Debut")
        plt.ylabel("Daily Market Impact (Weighted Plays)")
        plt.legend(bbox_to_anchor=(1.05, 1), loc='upper left', fontsize='small')
        plt.tight_layout()
        plt.savefig(os.path.join(PLOTS_DIR, "propagation_top_10_weighted.png"))
        plt.close()

    # 5. Average Market-Weighted Propagation
    if not daily_weighted_all.empty:
        # Reindex to ensure we have up to 180 days for all
        avg_weighted_prop = daily_weighted_all.reindex(columns=range(180), fill_value=0).mean()
        plt.figure(figsize=(10, 6))
        plt.plot(avg_weighted_prop, color='crimson', linewidth=2)
        plt.fill_between(range(180), 0, avg_weighted_prop, color='crimson', alpha=0.2)
        plt.title("Average Market-Weighted Propagation Curve (2016)")
        plt.xlabel("Days Since Debut")
        plt.ylabel("Average Market Impact")
        plt.grid(axis='y', linestyle='--', alpha=0.7)
        plt.savefig(os.path.join(PLOTS_DIR, "average_propagation_weighted.png"))
        plt.close()

    # 6. Growth and Death Analysis (Weighted)
    # This remains mostly the same as it's hard to vectorize linregress easily
    growth_stats = []
    # Only analyze songs with enough data
    for song, daily in df_2016.groupby('artist_title'):
        daily_impact = daily.groupby('date')['market_share'].sum()
        if len(daily_impact) < 14: continue
        
        peak_date = daily_impact.idxmax()
        before_peak = daily_impact[:peak_date]
        if len(before_peak) >= 7:
            slope, _, _, _, _ = linregress(np.arange(len(before_peak)), before_peak.values)
            growth_stats.append({'song': song, 'type': 'growth', 'slope': slope, 'is_new': (song in new_songs_list)})
            
        after_peak = daily_impact[peak_date:]
        if len(after_peak) >= 14:
            slope, _, _, _, _ = linregress(np.arange(len(after_peak)), after_peak.values)
            growth_stats.append({'song': song, 'type': 'death', 'slope': slope})

    growth_df = pd.DataFrame(growth_stats)
    if not growth_df.empty:
        print("\n--- 10 Fastest Growing Songs (Weighted) ---")
        fastest_growing = growth_df[growth_df['type'] == 'growth'].sort_values('slope', ascending=False).head(10)
        print(fastest_growing[['song', 'slope']])
        print("\n--- 10 Fastest Dying Songs (Weighted) ---")
        fastest_dying = growth_df[growth_df['type'] == 'death'].sort_values('slope', ascending=True).head(10)
        print(fastest_dying[['song', 'slope']])

    # 7. Station Variety comparison
    station_variety = df_2016.groupby('station_name').agg(
        unique_songs=('artist_title', 'nunique'),
        total_plays=('artist_title', 'count'),
        market_share=('market_share', 'first')
    ).reset_index()
    station_variety['variety_index'] = station_variety['unique_songs'] / station_variety['total_plays']
    
    plt.figure(figsize=(10, 6))
    sns.barplot(x='station_name', y='variety_index', hue='station_name', data=station_variety, palette="coolwarm", legend=False)
    plt.title("Station Variety Index (Unique Songs / Total Plays)")
    plt.ylabel("Variety Index")
    plt.savefig(os.path.join(PLOTS_DIR, "station_variety.png"))
    plt.close()

    # 8. Quarterly Weighted Analysis
    df_2016['quarter'] = df_2016['date'].dt.quarter
    plt.figure(figsize=(16, 10))
    for q in range(1, 5):
        q_data = df_2016[df_2016['quarter'] == q]
        if q_data.empty: continue
        top_q_songs = q_data.groupby('artist_title')['market_share'].sum().sort_values(ascending=False).head(10)
        plt.subplot(2, 2, q)
        sns.barplot(x=top_q_songs.values, y=[s[:35] for s in top_q_songs.index], hue=top_q_songs.index, palette="plasma", legend=False)
        plt.title(f"Top Weighted Songs - Quarter {q}")
        plt.xlabel("Weighted Impact")
    plt.tight_layout()
    plt.savefig(os.path.join(PLOTS_DIR, "top_songs_quarterly_weighted.png"))
    plt.close()

    # 9. Average Propagation per Station (Raw Plays)
    plt.figure(figsize=(12, 7))
    station_colors = {'RMF FM': '#f2d41f', 'Radio ZET': '#e20613', 'Trójka': '#00529b', 'Eska': '#ff6600'}
    
    # Pre-calculate play trajectories for all stations at once
    all_station_plays = df_new.groupby(['station_name', 'artist_title', 'days_since_debut']).size().unstack(fill_value=0)
    
    for s_name in df_2016['station_name'].unique():
        if s_name in all_station_plays.index.get_level_values(0):
            station_trajectories = all_station_plays.loc[s_name].reindex(index=new_songs_list, columns=range(180), fill_value=0)
            avg_traj = station_trajectories.mean()
            plt.plot(avg_traj.rolling(7, min_periods=1).mean(), label=s_name, color=station_colors.get(s_name, '#666666'), linewidth=2.5)

    plt.title("Average Song Propagation per Station (2016 Hits)")
    plt.xlabel("Days Since Debut")
    plt.ylabel("Average Daily Plays")
    plt.legend()
    plt.grid(True, which='both', linestyle='--', alpha=0.5)
    plt.tight_layout()
    plt.savefig(os.path.join(PLOTS_DIR, "average_propagation_per_station.png"))
    plt.close()

    # 10. General Average Propagation (Total Plays)
    daily_plays_all = df_new.groupby(['artist_title', 'days_since_debut']).size().unstack(fill_value=0)
    if not daily_plays_all.empty:
        avg_total_traj = daily_plays_all.reindex(columns=range(180), fill_value=0).mean()
        plt.figure(figsize=(10, 6))
        smoothed_total = avg_total_traj.rolling(7, min_periods=1).mean()
        plt.plot(smoothed_total, color='#333333', linewidth=3)
        plt.fill_between(range(180), smoothed_total, color='#333333', alpha=0.1)
        plt.title("General Average Song Propagation (All Stations Combined)")
        plt.xlabel("Days Since Debut")
        plt.ylabel("Average Total Daily Plays")
        plt.grid(True, alpha=0.3)
        plt.tight_layout()
        plt.savefig(os.path.join(PLOTS_DIR, "average_propagation_general.png"))
        plt.close()

    print(f"\nAnalysis complete! Plots saved to {PLOTS_DIR}")

if __name__ == "__main__":
    analyze()
