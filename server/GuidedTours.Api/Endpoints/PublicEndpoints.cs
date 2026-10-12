using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using GuidedTours.Api.Models;
using GuidedTours.Api.Services;

namespace GuidedTours.Api.Endpoints;

/// <summary>Read-only endpoints the engine calls from any host app.</summary>
public static class PublicEndpoints
{
    public const string CorsPolicy = "public";

    public static void MapPublicEndpoints(this IEndpointRouteBuilder app)
    {
        var api = app.MapGroup("/api/public").RequireCors(CorsPolicy).WithTags("Public");
        api.MapGet("/apps/{appKey}/tours", GetPublishedTours);
    }

    /// <summary>
    /// Every published tour for one app. Served with an ETag and "no-cache", so
    /// browsers revalidate on each page load (a cheap 304) and an edit in the
    /// admin shows up on the very next load: no frontend deploy, no cache purge.
    /// </summary>
    internal static async Task<IResult> GetPublishedTours(string appKey, TourService tours, HttpContext http)
    {
        var feed = await tours.GetPublishedFeedAsync(appKey);
        if (feed.Status == ResultStatus.NotFound) return Results.NotFound();
        var payload = feed.Value!;

        var body = JsonSerializer.SerializeToUtf8Bytes(payload, Json.Options);
        var etag = $"\"{Convert.ToHexString(SHA256.HashData(body))[..32]}\"";

        http.Response.Headers.CacheControl = "no-cache";
        http.Response.Headers.ETag = etag;
        if (http.Request.Headers.IfNoneMatch.ToString().Contains(etag, StringComparison.Ordinal))
            return Results.StatusCode(StatusCodes.Status304NotModified);

        return Results.Bytes(body, "application/json; charset=utf-8");
    }

    /// <summary>The JSON Schema for tour config, for editors and CI validation.</summary>
    public static void MapSchemaEndpoint(this IEndpointRouteBuilder app) =>
        app.MapGet("/api/schema", () =>
        {
            using var stream = typeof(PublicEndpoints).Assembly.GetManifestResourceStream("tour.schema.json")!;
            using var reader = new StreamReader(stream, Encoding.UTF8);
            return Results.Text(reader.ReadToEnd(), "application/schema+json");
        }).RequireCors(CorsPolicy).WithTags("Public");
}
