namespace isbackbackend;

public record SongEntry(string Artist, string Title, int DurationSec, string StartTime, string YoutubeUrl)
{
    public string ArtistTitle = $@"{Artist} -  {Title}";
}