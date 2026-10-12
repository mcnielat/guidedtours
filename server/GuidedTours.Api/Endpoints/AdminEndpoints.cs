using System.Security.Cryptography;
using System.Text;
using GuidedTours.Api.Models;
using GuidedTours.Api.Services;
using GuidedTours.Api.Validation;

namespace GuidedTours.Api.Endpoints;

/// <summary>CRUD used by the Angular admin portal. Protected by an admin API key.</summary>
public static class AdminEndpoints
{
    public const string CorsPolicy = "admin";
    public const string KeyHeader = "X-Admin-Key";

    public static void MapAdminEndpoints(this IEndpointRouteBuilder app)
    {
        var admin = app.MapGroup("/api/admin")
            .RequireCors(CorsPolicy)
            .AddEndpointFilter<AdminKeyFilter>()
            .WithTags("Admin");

        admin.MapGet("/whoami", () => Results.Ok(new { ok = true }));

        admin.MapGet("/apps", (AppService apps) => apps.ListAsync());
        admin.MapGet("/apps/{appKey}", async (string appKey, AppService apps) => (await apps.GetAsync(appKey)).ToHttp());
        admin.MapPost("/apps", async (AppDto dto, AppService apps) =>
            (await apps.CreateAsync(dto)).ToHttp(a => $"/api/admin/apps/{a.Key}"));
        admin.MapPut("/apps/{appKey}", async (string appKey, AppDto dto, AppService apps) =>
            (await apps.UpdateAsync(appKey, dto)).ToHttp());
        admin.MapDelete("/apps/{appKey}", async (string appKey, AppService apps) => (await apps.DeleteAsync(appKey)).ToHttp());

        admin.MapGet("/apps/{appKey}/tours", async (string appKey, TourService tours) => (await tours.ListAsync(appKey)).ToHttp());
        admin.MapGet("/apps/{appKey}/tours/{tourKey}", async (string appKey, string tourKey, TourService tours) =>
            (await tours.GetAsync(appKey, tourKey)).ToHttp());
        admin.MapPost("/apps/{appKey}/tours", async (string appKey, TourDto dto, TourService tours) =>
            (await tours.CreateAsync(appKey, dto)).ToHttp(t => $"/api/admin/apps/{appKey}/tours/{t.Id}"));
        admin.MapPut("/apps/{appKey}/tours/{tourKey}", async (string appKey, string tourKey, TourDto dto, TourService tours) =>
            (await tours.UpdateAsync(appKey, tourKey, dto)).ToHttp());
        admin.MapDelete("/apps/{appKey}/tours/{tourKey}", async (string appKey, string tourKey, TourService tours) =>
            (await tours.DeleteAsync(appKey, tourKey)).ToHttp());

        // Validate without saving: lets the admin UI show errors as you edit raw JSON.
        admin.MapPost("/validate", (TourDto dto) =>
        {
            var errors = TourValidator.Validate(dto);
            return errors.Count > 0 ? Results.ValidationProblem(errors) : Results.Ok(new { valid = true });
        });
    }
}

/// <summary>
/// Shared-secret check for the admin API. Deliberately simple for the case study;
/// in production this is replaced by the company's SSO (OIDC/JWT + an admin role).
/// </summary>
public sealed class AdminKeyFilter(IConfiguration config) : IEndpointFilter
{
    public ValueTask<object?> InvokeAsync(EndpointFilterInvocationContext ctx, EndpointFilterDelegate next)
    {
        var expected = config["Admin:ApiKey"];
        var provided = ctx.HttpContext.Request.Headers[AdminEndpoints.KeyHeader].ToString();
        if (string.IsNullOrEmpty(expected) || !FixedTimeEquals(expected, provided))
            return ValueTask.FromResult<object?>(Results.Unauthorized());
        return next(ctx);
    }

    private static bool FixedTimeEquals(string a, string b) =>
        CryptographicOperations.FixedTimeEquals(Encoding.UTF8.GetBytes(a), Encoding.UTF8.GetBytes(b));
}
