using isbackbackend;
using Microsoft.Extensions.FileProviders;

var builder = WebApplication.CreateBuilder(args);

// Add services to the container.
// Learn more about configuring OpenAPI at https://aka.ms/aspnet/openapi
builder.Services.AddOpenApi();

var app = builder.Build();


// Configure the HTTP request pipeline.
if (app.Environment.IsDevelopment()) app.MapOpenApi();

var fileOptions = new StaticFileOptions
{
    FileProvider = new PhysicalFileProvider(
        Path.Combine(Directory.GetParent(Directory.GetCurrentDirectory())?.ToString() ?? string.Empty,
            "frontend2", "dist")),
    RequestPath = new PathString("") // Or "/"
};

// 1. Enable default file mapping (e.g., / -> index.html)
app.UseDefaultFiles(new DefaultFilesOptions
{
    FileProvider = fileOptions.FileProvider,
    RequestPath = fileOptions.RequestPath
});

// 2. Actually serve the physical files
app.UseStaticFiles(fileOptions);

var simulator = new RadioSimulator(DateTime.Now.AddYears(-10),
    builder.Configuration.GetValue<string>("Database:path") ?? string.Empty);

Cache? us = null;
Cache? pl = null;

app.MapGet("/tracklist/us", () =>
    {
        if (us is null || us.GeneratedAt.Date < DateTime.Today)
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
        if (pl is null || pl.GeneratedAt.Date < DateTime.Today)
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