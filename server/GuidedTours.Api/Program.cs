using GuidedTours.Api.Data;
using GuidedTours.Api.Endpoints;
using GuidedTours.Api.Models;
using GuidedTours.Api.Services;
using Microsoft.EntityFrameworkCore;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddDbContext<ToursDb>(o => o.UseSqlite(builder.Configuration.GetConnectionString("Tours")));
builder.Services.AddScoped<TourService>();
builder.Services.AddScoped<AppService>();
builder.Services.ConfigureHttpJsonOptions(o =>
{
    o.SerializerOptions.PropertyNamingPolicy = Json.Options.PropertyNamingPolicy;
    o.SerializerOptions.DefaultIgnoreCondition = Json.Options.DefaultIgnoreCondition;
});
builder.Services.AddProblemDetails();

builder.Services.AddCors(o =>
{
    // The engine runs inside every host app, on any origin, and only reads published config.
    o.AddPolicy(PublicEndpoints.CorsPolicy, p => p.AllowAnyOrigin().WithMethods("GET").WithHeaders("Accept", "If-None-Match").WithExposedHeaders("ETag"));
    // The admin portal is the only browser client allowed to write.
    var adminOrigins = builder.Configuration.GetSection("Admin:AllowedOrigins").Get<string[]>() ?? [];
    o.AddPolicy(AdminEndpoints.CorsPolicy, p => p.WithOrigins(adminOrigins).AllowAnyMethod().AllowAnyHeader());
});

var app = builder.Build();

using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<ToursDb>();
    // EnsureCreated keeps the case study to one command; a real deployment would use EF migrations.
    await db.Database.EnsureCreatedAsync();
    await Seeder.SeedAsync(db, Path.Combine(app.Environment.ContentRootPath, "Seed"), app.Logger);
}

app.UseExceptionHandler();
app.UseDefaultFiles();
app.UseStaticFiles(new StaticFileOptions
{
    OnPrepareResponse = ctx =>
    {
        // The SDK is fetched cross-origin by host apps. Revalidate so engine fixes roll out on the next load.
        if (ctx.Context.Request.Path.StartsWithSegments("/sdk"))
        {
            ctx.Context.Response.Headers.AccessControlAllowOrigin = "*";
            ctx.Context.Response.Headers.CacheControl = "no-cache";
        }
    },
});
app.UseCors();

app.MapPublicEndpoints();
app.MapSchemaEndpoint();
app.MapAdminEndpoints();
app.MapGet("/health", () => Results.Ok(new { status = "ok" }));

// The built Angular admin is served from wwwroot/admin (see admin/angular.json outputPath).
app.MapFallbackToFile("/admin/{**path:nonfile}", "admin/index.html");

app.Run();

public partial class Program;
