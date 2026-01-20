namespace isbackbackend;

public record Tracklist(DateTime date, string region, SongEntry[] songs, Metadata metadata);