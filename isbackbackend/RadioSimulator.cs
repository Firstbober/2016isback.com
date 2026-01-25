using Microsoft.Data.Sqlite;

namespace isbackbackend;

public class SongData
{
    public string Artist = "";
    public int Duration;
    public string Link = "";
    public string Name = "";
    public string NormArtist = "";
    public double Weight;
}

public class LogEntry
{
    public string Artist = "";
    public int DurationSec;
    public string Link = "";
    public string Time = "";
    public string Title = "";
}

public class RadioSimulator(
    DateTime targetDate,
    string dbPath,
    int? stationId = null,
    int? seed = null)
{
    private const int SongBufferSize = 50;
    private const int ArtistBufferSize = 15;
    private readonly string _dbPath = dbPath;

    private readonly Random _random = seed.HasValue ? new Random(seed.Value) : new Random();
    private readonly List<string> _recentlyPlayedArtists = new();

    private readonly List<string> _recentlyPlayedSongs = new();

    private static Dictionary<string, string> GetDebutDates(SqliteConnection conn)
    {
        Console.WriteLine("Indexing song debut dates for safety...");
        var debuts = new Dictionary<string, string>();

        using var command = conn.CreateCommand();
        command.CommandText = """
                                  SELECT s.full_name, MIN(op.date) 
                                  FROM odsluchane_plays op
                                  JOIN songs s ON op.song_id = s.id
                                  GROUP BY s.full_name
                              """;

        using var reader = command.ExecuteReader();
        while (reader.Read())
        {
            var fullName = reader.GetString(0).ToLower().Trim();
            var date = reader.GetString(1);
            debuts[fullName] = date;
        }

        return debuts;
    }

    private static int? GetDatabaseDuration(SqliteConnection conn, int songId)
    {
        using var command = conn.CreateCommand();
        command.CommandText = "SELECT duration_seconds FROM songs WHERE id = @song_id";
        command.Parameters.AddWithValue("@song_id", songId);

        using var reader = command.ExecuteReader();
        if (reader.Read() && !reader.IsDBNull(0)) return reader.GetInt32(0);
        return null;
    }

    private Dictionary<int, int> CalculateMedianDurations(SqliteConnection conn, List<int> songIds)
    {
        var medianDurations = new Dictionary<int, int>();
        if (songIds.Count == 0) return medianDurations;

        var songIdsParam = string.Join(",", songIds);
        var sixMonthsAgo = targetDate.AddMonths(-6).ToString("yyyy-MM-dd");

        using var command = conn.CreateCommand();
        command.CommandText = $"""
                                   SELECT song_id, date, time
                                   FROM odsluchane_plays
                                   WHERE song_id IN ({songIdsParam})
                                     AND date >= @six_months_ago
                                   ORDER BY song_id, date, time
                               """;
        command.Parameters.AddWithValue("@six_months_ago", sixMonthsAgo);

        var playsBySong = new Dictionary<int, List<DateTime>>();

        using var reader = command.ExecuteReader();
        while (reader.Read())
        {
            var songId = reader.GetInt32(0);
            var date = reader.GetString(1);
            var time = reader.GetString(2);

            if (!playsBySong.ContainsKey(songId))
                playsBySong[songId] = new List<DateTime>();

            if (DateTime.TryParse($"{date} {time}", out var playTime)) playsBySong[songId].Add(playTime);
        }

        foreach (var (songId, playTimes) in playsBySong)
        {
            if (playTimes.Count < 2) continue;

            var intervals = new List<int>();
            for (var i = 1; i < playTimes.Count; i++)
            {
                var diff = (int)(playTimes[i] - playTimes[i - 1]).TotalSeconds;
                if (diff >= 120 && diff <= 600) intervals.Add(diff);
            }

            if (intervals.Count < 3) continue;

            intervals.Sort();
            var median = intervals[intervals.Count / 2];
            medianDurations[songId] = median;
        }

        return medianDurations;
    }

    private List<SongData> LoadPolandData()
    {
        if (!File.Exists(_dbPath)) throw new FileNotFoundException($"Database not found at {_dbPath}");

        using var conn = new SqliteConnection($"Data Source={_dbPath}");
        conn.Open();

        var debuts = GetDebutDates(conn);

        var windowStart = targetDate.AddDays(-60).ToString("yyyy-MM-dd");
        var targetStr = targetDate.ToString("yyyy-MM-dd");

        var pool = new List<SongData>();

        using var command = conn.CreateCommand();
        var stationFilter = "";
        if (stationId.HasValue)
        {
            stationFilter = "AND op.station_id = @station_id";
            command.Parameters.AddWithValue("@station_id", stationId.Value);
        }

        command.CommandText = $"""
                                   SELECT s.id, s.full_name, COUNT(*) as frequency, s.artist, s.youtube_url, s.duration_seconds
                                   FROM odsluchane_plays op
                                   JOIN songs s ON op.song_id = s.id
                                   WHERE op.date >= @window_start AND op.date <= @target_str {stationFilter} AND s.youtube_url IS NOT NULL AND op.station_id != 48
                                   GROUP BY s.id
                               """;
        command.Parameters.AddWithValue("@window_start", windowStart);
        command.Parameters.AddWithValue("@target_str", targetStr);

        var songIds = new List<int>();
        var songDataMap = new Dictionary<int, (string fullName, string artist, string link)>();
        var rowCount = 0;

        using var reader = command.ExecuteReader();
        while (reader.Read())
        {
            rowCount++;
            var songId = reader.GetInt32(0);
            var fullName = reader.GetString(1);
            var freq = reader.GetInt32(2);
            var artist = reader.GetString(3);
            var link = reader.GetString(4);
            var dbDuration = reader.IsDBNull(5) ? (int?)null : reader.GetInt32(5);
            var cleanName = fullName.ToLower().Trim();

            debuts.TryGetValue(cleanName, out var debut);
            debut ??= "9999-99-99";

            var normArtist = artist.ToLower().Replace("dabrowska", "").Trim();

            if (string.Compare(debut, targetStr, StringComparison.Ordinal) <= 0)
            {
                songIds.Add(songId);
                songDataMap[songId] = (fullName, artist, link);
                var weight = (double)freq;
                var debutDate = DateTime.Parse(debut);
                var daysSinceDebut = (targetDate - debutDate).Days;

                if (daysSinceDebut <= 14)
                    weight *= 1.5;
                else if (daysSinceDebut <= 46)
                    weight *= 0.4;
                else if (daysSinceDebut <= 60)
                    weight *= 0.15;

                pool.Add(new SongData
                {
                    Name = fullName,
                    Artist = artist,
                    NormArtist = normArtist,
                    Weight = weight,
                    Duration = 0,
                    Link = link
                });
            }
        }

        Console.WriteLine($"Found {rowCount} potential songs in the window.");

        var medianDurations = CalculateMedianDurations(conn, songIds);

        foreach (var song in pool)
        {
            var songId = songIds.First(id => songDataMap[id].fullName == song.Name);
            var info = songDataMap[songId];
            var dbDuration = GetDatabaseDuration(conn, songId);

            if (dbDuration.HasValue)
                song.Duration = dbDuration.Value;
            else if (medianDurations.TryGetValue(songId, out var medianDur))
                song.Duration = Math.Min(medianDur, 240);
            else
                song.Duration = _random.Next(180, 241);
        }

        conn.Close();

        pool.Sort((a, b) => b.Weight.CompareTo(a.Weight));
        return pool;
    }

    private List<SongData> LoadUsaData()
    {
        if (!File.Exists(_dbPath))
        {
            Console.WriteLine("Warning: US Billboard DB not found. Using empty pool.");
            return new List<SongData>();
        }

        using var conn = new SqliteConnection($"Data Source={_dbPath}");
        conn.Open();

        var targetStr = targetDate.ToString("yyyy-MM-dd");
        var windowStart = targetDate.AddDays(-60).ToString("yyyy-MM-dd");

        using var command = conn.CreateCommand();
        command.CommandText = """
                                  SELECT s.id, s.title, s.artist, MIN(be.date) as debut_date, s.youtube_url, s.duration_seconds
                                  FROM billboard_entries be
                                  JOIN songs s ON be.song_id = s.id
                                  WHERE be.date >= @window_start AND be.date <= @target_str AND s.youtube_url IS NOT NULL
                                  GROUP BY s.id
                              """;
        command.Parameters.AddWithValue("@window_start", windowStart);
        command.Parameters.AddWithValue("@target_str", targetStr);

        var debutDates = new Dictionary<int, DateTime>();
        var songInfo = new Dictionary<int, (string title, string artist, int rank, string link, int? dbDuration)>();

        {
            using var debutReader = command.ExecuteReader();
            while (debutReader.Read())
            {
                var songId = debutReader.GetInt32(0);
                var title = debutReader.GetString(1);
                var artist = debutReader.GetString(2);
                var debutDateStr = debutReader.GetString(3);
                var link = debutReader.GetString(4);
                var dbDuration = debutReader.IsDBNull(5) ? (int?)null : debutReader.GetInt32(5);

                debutDates[songId] = DateTime.Parse(debutDateStr);
                songInfo[songId] = (title, artist, 0, link, dbDuration);
            }
        }

        if (debutDates.Count == 0)
        {
            Console.WriteLine($"No Billboard data found for {targetStr}");
            conn.Close();
            return new List<SongData>();
        }

        var chartDate = debutDates.Values.Max().ToString("yyyy-MM-dd");
        Console.WriteLine($"Using Billboard chart from {chartDate}");

        command.CommandText = """
                                  SELECT be.song_id, be.rank
                                  FROM billboard_entries be
                                  WHERE be.date = @chart_date
                              """;
        command.Parameters.AddWithValue("@chart_date", chartDate);

        using var chartReader = command.ExecuteReader();
        while (chartReader.Read())
        {
            var songId = chartReader.GetInt32(0);
            var rank = chartReader.IsDBNull(1) ? 0 : chartReader.GetInt32(1);
            if (songInfo.ContainsKey(songId))
            {
                var info = songInfo[songId];
                songInfo[songId] = (info.title, info.artist, rank, info.link, info.dbDuration);
            }
        }

        var songIds = songInfo.Keys.Where(id => songInfo[id].rank > 0).ToList();
        var medianDurations = CalculateMedianDurations(conn, songIds);

        var pool = new List<SongData>();
        foreach (var (songId, info) in songInfo)
        {
            if (!debutDates.ContainsKey(songId)) continue;

            var rank = info.rank;
            if (rank == 0) continue;

            var weight = Math.Pow(101 - (double)rank, 2);
            var daysSinceDebut = (targetDate - debutDates[songId]).Days;

            if (daysSinceDebut <= 14)
                weight *= 1.5;
            else if (daysSinceDebut <= 46)
                weight *= 0.4;
            else if (daysSinceDebut <= 60)
                weight *= 0.15;

            var duration = info.dbDuration.HasValue
                ? info.dbDuration.Value
                : medianDurations.TryGetValue(songId, out var medianDur)
                    ? Math.Min(medianDur, 240)
                    : _random.Next(190, 241);

            pool.Add(new SongData
            {
                Name = info.title,
                Artist = info.artist,
                NormArtist = info.artist.ToLower(),
                Weight = weight,
                Duration = duration,
                Link = info.link
            });
        }

        conn.Close();
        pool.Sort((a, b) => b.Weight.CompareTo(a.Weight));
        return pool;
    }

    private static T WeightedRandomChoice<T>(IEnumerable<T> items, Func<T, double> weightSelector, Random random)
    {
        var itemList = items.ToList();
        var totalWeight = itemList.Sum(weightSelector);
        var randomValue = random.NextDouble() * totalWeight;

        var cumulativeWeight = 0.0;
        foreach (var item in itemList)
        {
            cumulativeWeight += weightSelector(item);
            if (randomValue <= cumulativeWeight) return item;
        }

        return itemList.Last();
    }

    public List<LogEntry> GenerateLog(string region)
    {
        var pool = region == "pl" ? LoadPolandData() : LoadUsaData();

        if (pool.Count == 0) return new List<LogEntry>();

        var power = pool.Take(20).ToList();
        var secondary = pool.Skip(20).Take(40).ToList();
        var recurrent = pool.Skip(60).Take(90).ToList();
        var gold = pool.Skip(150).ToList();

        var currentTime = new DateTime(targetDate.Year, targetDate.Month, targetDate.Day, 0, 0, 0);
        var endTime = currentTime.AddDays(1);

        var log = new List<LogEntry>();

        while (currentTime < endTime)
        {
            List<SongData> cat;
            var rand = _random.NextDouble();

            if (rand < 0.4)
                cat = power;
            else if (rand < 0.6)
                cat = secondary;
            else if (rand < 0.8)
                cat = recurrent;
            else
                cat = gold;

            if (cat.Count == 0) cat = pool;

            var available = cat.Where(s => !_recentlyPlayedSongs.Contains(s.Name) &&
                                           !_recentlyPlayedArtists.Contains(s.NormArtist)).ToList();

            if (available.Count == 0) available = cat.Where(s => !_recentlyPlayedSongs.Contains(s.Name)).ToList();

            if (available.Count == 0)
            {
                var allCategories = new List<List<SongData>> { power, secondary, recurrent, gold };
                foreach (var otherCat in allCategories.Where(c => c != cat))
                {
                    available = otherCat.Where(s => !_recentlyPlayedSongs.Contains(s.Name) &&
                                                    !_recentlyPlayedArtists.Contains(s.NormArtist)).ToList();
                    if (available.Count > 0) break;

                    available = otherCat.Where(s => !_recentlyPlayedSongs.Contains(s.Name)).ToList();
                    if (available.Count > 0) break;
                }
            }

            if (available.Count == 0)
            {
                currentTime = currentTime.AddMinutes(3);
                continue;
            }

            var songData = WeightedRandomChoice(available, s => s.Weight, _random);

            log.Add(new LogEntry
            {
                Time = currentTime.ToString("HH:mm:ss"),
                Artist = songData.Artist,
                Title = songData.Name,
                DurationSec = songData.Duration - 30,
                Link = songData.Link
            });

            currentTime = currentTime.AddSeconds(songData.Duration - 30);

            _recentlyPlayedSongs.Add(songData.Name);
            _recentlyPlayedArtists.Add(songData.NormArtist);

            if (_recentlyPlayedSongs.Count > SongBufferSize) _recentlyPlayedSongs.RemoveAt(0);

            if (_recentlyPlayedArtists.Count > ArtistBufferSize) _recentlyPlayedArtists.RemoveAt(0);
        }

        return log;
    }

    public void PrintLog()
    {
        var log = GenerateLog("pl");
        foreach (var entry in log) Console.WriteLine($"[{entry.Time}] {entry.Artist} - {entry.Title} {entry.Link}");
    }
}