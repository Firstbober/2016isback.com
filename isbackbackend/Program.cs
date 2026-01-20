using isbackbackend;

var builder = WebApplication.CreateBuilder(args);

// Add services to the container.
// Learn more about configuring OpenAPI at https://aka.ms/aspnet/openapi
builder.Services.AddOpenApi();

var app = builder.Build();

// Configure the HTTP request pipeline.
if (app.Environment.IsDevelopment()) app.MapOpenApi();

var simulator = new RadioSimulator(DateTime.Now.AddYears(-10),
    builder.Configuration.GetValue<string>("Database:path") ?? string.Empty);

Cache? us = null;
Cache? pl = null;

app.MapGet("/tracklist/us", () =>
    {
        if (us is null)
        {
            var list = simulator.GenerateLog("us").Select(entry => new SongEntry(
                    entry.Artist,
                    entry.Title,
                    entry.DurationSec,
                    entry.Time,
                    entry.Link
                ))
                .ToArray();

            var metadata = new Metadata(DateTime.Now, (uint)list.Length, (uint)list.Sum(entry => entry.DurationSec),
                TimeZoneInfo.Local.Id);

            us = new Cache(DateTime.Now, new Tracklist(DateTime.Now, "us", list, metadata));
        }

        return us.Tracklist;
    })
    .WithName("GetTrackListUs");

app.MapGet("/tracklist/pl", () =>
    {
        if (pl is null)
        {
            var list = simulator.GenerateLog("pl").Select(entry => new SongEntry(
                    entry.Artist,
                    entry.Title,
                    entry.DurationSec,
                    entry.Time,
                    entry.Link
                ))
                .ToArray();

            var metadata = new Metadata(DateTime.Now, (uint)list.Length, (uint)list.Sum(entry => entry.DurationSec),
                TimeZoneInfo.Local.Id);

            pl = new Cache(DateTime.Now, new Tracklist(DateTime.Now, "pl", list, metadata));
        }

        return pl.Tracklist;
    })
    .WithName("GetTrackListPl");

app.Run();

internal record Cache(DateTime GeneratedAt, Tracklist Tracklist);