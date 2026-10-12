using GuidedTours.Api.Data;
using GuidedTours.Api.Models;
using GuidedTours.Api.Services;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;

namespace GuidedTours.Api.Tests;

/// <summary>Business rules tested directly against the service layer, no HTTP involved.</summary>
public sealed class ServiceTests : IDisposable
{
    private readonly SqliteConnection _conn = new("Data Source=:memory:");
    private readonly ToursDb _db;
    private readonly AppService _apps;
    private readonly TourService _tours;

    public ServiceTests()
    {
        _conn.Open();
        _db = new ToursDb(new DbContextOptionsBuilder<ToursDb>().UseSqlite(_conn).Options);
        _db.Database.EnsureCreated();
        _apps = new AppService(_db);
        _tours = new TourService(_db);
    }

    public void Dispose()
    {
        _db.Dispose();
        _conn.Dispose();
    }

    private static TourDto Tour(string id, bool published = true) => new()
    {
        Id = id,
        Title = "T",
        IsPublished = published,
        Steps = [new TourStep { Target = "#a", Title = "A", Body = "B" }],
    };

    private async Task SeedApp() => Assert.Equal(ResultStatus.Created, (await _apps.CreateAsync(new AppDto { Key = "crm", Name = "CRM" })).Status);

    [Fact]
    public async Task Feed_contains_only_published_tours()
    {
        await SeedApp();
        await _tours.CreateAsync("crm", Tour("live"));
        await _tours.CreateAsync("crm", Tour("draft", published: false));

        var feed = await _tours.GetPublishedFeedAsync("crm");
        Assert.Equal(["live"], feed.Value!.Tours.Select(t => t.Id));
    }

    [Fact]
    public async Task Stale_update_is_a_conflict()
    {
        await SeedApp();
        var created = (await _tours.CreateAsync("crm", Tour("t1"))).Value!;
        await Task.Delay(5); // ensure a different UpdatedAt

        Assert.Equal(ResultStatus.Ok, (await _tours.UpdateAsync("crm", "t1", created with { Title = "First" })).Status);
        var stale = await _tours.UpdateAsync("crm", "t1", created with { Title = "Second" });
        Assert.Equal(ResultStatus.Conflict, stale.Status);
    }

    [Fact]
    public async Task Renaming_a_tour_onto_an_existing_id_is_a_conflict()
    {
        await SeedApp();
        await _tours.CreateAsync("crm", Tour("a"));
        var b = (await _tours.CreateAsync("crm", Tour("b"))).Value!;

        var result = await _tours.UpdateAsync("crm", "b", b with { Id = "a" });
        Assert.Equal(ResultStatus.Conflict, result.Status);
    }

    [Fact]
    public async Task App_key_is_never_renamed()
    {
        await SeedApp();
        var result = await _apps.UpdateAsync("crm", new AppDto { Key = "renamed", Name = "CRM 2" });
        Assert.Equal("crm", result.Value!.Key);
        Assert.Equal("CRM 2", result.Value.Name);
    }

    [Fact]
    public async Task Invalid_input_returns_field_errors_and_saves_nothing()
    {
        await SeedApp();
        var result = await _tours.CreateAsync("crm", Tour("ok") with { Steps = [] });
        Assert.Equal(ResultStatus.Invalid, result.Status);
        Assert.Contains("steps", result.Errors!.Keys);
        Assert.Equal(0, await _db.Tours.CountAsync());
    }

    [Fact]
    public async Task Unknown_app_is_not_found()
    {
        Assert.Equal(ResultStatus.NotFound, (await _tours.CreateAsync("nope", Tour("x"))).Status);
        Assert.Equal(ResultStatus.NotFound, (await _tours.GetPublishedFeedAsync("nope")).Status);
    }
}
