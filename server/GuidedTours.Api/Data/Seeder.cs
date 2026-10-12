using System.Text.Json;
using GuidedTours.Api.Models;
using GuidedTours.Api.Validation;
using Microsoft.EntityFrameworkCore;

namespace GuidedTours.Api.Data;

/// <summary>
/// Loads Seed/*.json into an empty database. Each file is one app and its tours,
/// in exactly the format the admin API accepts, so seed files double as examples.
/// </summary>
public static class Seeder
{
    public sealed record SeedFile(AppDto App, List<TourDto> Tours);

    public static async Task SeedAsync(ToursDb db, string seedDir, ILogger logger)
    {
        if (await db.Apps.AnyAsync() || !Directory.Exists(seedDir)) return;

        foreach (var file in Directory.GetFiles(seedDir, "*.json").Order())
        {
            var seed = JsonSerializer.Deserialize<SeedFile>(await File.ReadAllTextAsync(file), Json.Options)
                       ?? throw new InvalidOperationException($"Empty seed file {file}");

            var app = new AppEntity();
            app.Apply(seed.App);
            db.Apps.Add(app);

            foreach (var (tour, i) in seed.Tours.Select((t, i) => (t, i)))
            {
                var errors = TourValidator.Validate(tour);
                if (errors.Count > 0)
                    throw new InvalidOperationException($"Seed tour {tour.Id} in {Path.GetFileName(file)} is invalid: " +
                        string.Join("; ", errors.Select(e => $"{e.Key}: {string.Join(" ", e.Value)}")));
                var entity = new TourEntity { App = app };
                entity.Apply(tour with { SortOrder = tour.SortOrder == 0 ? i : tour.SortOrder });
                db.Tours.Add(entity);
            }
            logger.LogInformation("Seeded app {App} with {Count} tours", seed.App.Key, seed.Tours.Count);
        }
        await db.SaveChangesAsync();
    }
}
