using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using GuidedTours.Api.Models;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;

namespace GuidedTours.Api.Tests;

/// <summary>Boots the real app against a throwaway SQLite file, seeded from Seed/*.json.</summary>
public sealed class ApiFactory : WebApplicationFactory<Program>
{
    private readonly string _db = Path.Combine(Path.GetTempPath(), $"tours-test-{Guid.NewGuid():N}.db");

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Development");
        builder.UseSetting("ConnectionStrings:Tours", $"Data Source={_db};Pooling=false");
        builder.UseSetting("Admin:ApiKey", "test-key");
    }

    protected override void Dispose(bool disposing)
    {
        base.Dispose(disposing);
        if (File.Exists(_db)) File.Delete(_db);
    }
}

public class ApiTests(ApiFactory factory) : IClassFixture<ApiFactory>
{
    private HttpClient Admin()
    {
        var c = factory.CreateClient();
        c.DefaultRequestHeaders.Add("X-Admin-Key", "test-key");
        return c;
    }

    private static TourDto ValidTour(string id = "test-tour") => new()
    {
        Id = id,
        Title = "Test tour",
        IsPublished = true,
        Steps = [new TourStep { Target = "#a", Title = "A", Body = "Body" }],
    };

    [Fact]
    public async Task Public_feed_returns_published_tours_with_app_settings()
    {
        var res = await factory.CreateClient().GetAsync("/api/public/apps/tasky-demo/tours");
        res.EnsureSuccessStatusCode();
        var payload = await res.Content.ReadFromJsonAsync<PublicToursPayload>(Json.Options);

        Assert.Equal("What's new in Tasky", payload!.App.Chooser.Title);
        Assert.Contains(payload.Tours, t => t.Id == "email-walkthrough" && t.Steps.Count == 16);
        Assert.Equal("no-cache", res.Headers.CacheControl?.ToString());
    }

    [Fact]
    public async Task Public_feed_supports_conditional_requests()
    {
        var client = factory.CreateClient();
        var first = await client.GetAsync("/api/public/apps/acme-billing/tours");
        var etag = first.Headers.ETag!.Tag;

        var req = new HttpRequestMessage(HttpMethod.Get, "/api/public/apps/acme-billing/tours");
        req.Headers.TryAddWithoutValidation("If-None-Match", etag);
        var second = await client.SendAsync(req);
        Assert.Equal(HttpStatusCode.NotModified, second.StatusCode);
    }

    [Fact]
    public async Task Public_feed_allows_any_origin()
    {
        var req = new HttpRequestMessage(HttpMethod.Get, "/api/public/apps/tasky-demo/tours");
        req.Headers.Add("Origin", "https://some-other-system.example");
        var res = await factory.CreateClient().SendAsync(req);
        Assert.Equal("*", res.Headers.GetValues("Access-Control-Allow-Origin").Single());
    }

    [Fact]
    public async Task Unknown_app_is_404()
    {
        var res = await factory.CreateClient().GetAsync("/api/public/apps/nope/tours");
        Assert.Equal(HttpStatusCode.NotFound, res.StatusCode);
    }

    [Fact]
    public async Task Admin_requires_the_key()
    {
        var res = await factory.CreateClient().GetAsync("/api/admin/apps");
        Assert.Equal(HttpStatusCode.Unauthorized, res.StatusCode);
    }

    [Fact]
    public async Task Created_tour_appears_in_feed_only_once_published()
    {
        var admin = Admin();
        var draft = ValidTour("draft-tour") with { IsPublished = false };
        (await admin.PostAsJsonAsync("/api/admin/apps/acme-billing/tours", draft, Json.Options)).EnsureSuccessStatusCode();

        async Task<bool> InFeed()
        {
            var p = await factory.CreateClient().GetFromJsonAsync<PublicToursPayload>("/api/public/apps/acme-billing/tours", Json.Options);
            return p!.Tours.Any(t => t.Id == "draft-tour");
        }
        Assert.False(await InFeed());

        var saved = await admin.GetFromJsonAsync<TourDto>("/api/admin/apps/acme-billing/tours/draft-tour", Json.Options);
        (await admin.PutAsJsonAsync("/api/admin/apps/acme-billing/tours/draft-tour", saved! with { IsPublished = true }, Json.Options)).EnsureSuccessStatusCode();
        Assert.True(await InFeed());
    }

    [Fact]
    public async Task Invalid_tours_are_rejected_with_field_errors()
    {
        var bad = ValidTour("Bad Id!") with
        {
            Steps =
            [
                new TourStep
                {
                    Title = "", Body = "x", Placement = "sideways", Page = "https://evil.example/",
                    Before = [new TourAction { Type = "navigate", Url = "javascript:alert(1)" }, new TourAction { Type = "eval" }],
                },
            ],
        };
        var res = await Admin().PostAsJsonAsync("/api/admin/apps/acme-billing/tours", bad, Json.Options);
        Assert.Equal(HttpStatusCode.BadRequest, res.StatusCode);

        var errors = (await res.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("errors");
        foreach (var key in new[] { "id", "steps[0].title", "steps[0].placement", "steps[0].page", "steps[0].before[0].url", "steps[0].before[1].type" })
            Assert.True(errors.TryGetProperty(key, out _), $"expected an error for {key}");
    }

    [Fact]
    public async Task Stale_update_is_rejected()
    {
        var admin = Admin();
        (await admin.PostAsJsonAsync("/api/admin/apps/acme-billing/tours", ValidTour("concurrent"), Json.Options)).EnsureSuccessStatusCode();
        var copy = await admin.GetFromJsonAsync<TourDto>("/api/admin/apps/acme-billing/tours/concurrent", Json.Options);

        (await admin.PutAsJsonAsync("/api/admin/apps/acme-billing/tours/concurrent", copy! with { Title = "First" }, Json.Options)).EnsureSuccessStatusCode();
        var second = await admin.PutAsJsonAsync("/api/admin/apps/acme-billing/tours/concurrent", copy with { Title = "Second" }, Json.Options);
        Assert.Equal(HttpStatusCode.Conflict, second.StatusCode);
    }

    [Fact]
    public async Task Duplicate_tour_id_is_a_conflict()
    {
        var res = await Admin().PostAsJsonAsync("/api/admin/apps/tasky-demo/tours", ValidTour("overview"), Json.Options);
        Assert.Equal(HttpStatusCode.Conflict, res.StatusCode);
    }

    [Fact]
    public async Task Schema_is_served()
    {
        var res = await factory.CreateClient().GetAsync("/api/schema");
        res.EnsureSuccessStatusCode();
        Assert.Contains("\"Guided tour\"", await res.Content.ReadAsStringAsync());
    }
}
