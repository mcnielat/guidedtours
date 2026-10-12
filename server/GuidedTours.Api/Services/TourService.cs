using GuidedTours.Api.Data;
using GuidedTours.Api.Models;
using GuidedTours.Api.Validation;
using Microsoft.EntityFrameworkCore;

namespace GuidedTours.Api.Services;

/// <summary>
/// Service layer for tours: validation, uniqueness, optimistic concurrency and
/// the published feed. Endpoints only translate HTTP to calls on this class.
/// </summary>
public sealed class TourService(ToursDb db)
{
    /// <summary>Published tours plus app settings: exactly what the engine receives.</summary>
    public async Task<Result<PublicToursPayload>> GetPublishedFeedAsync(string appKey)
    {
        var app = await db.Apps.AsNoTracking().FirstOrDefaultAsync(a => a.Key == appKey);
        if (app is null) return Result<PublicToursPayload>.NotFound();

        var tours = await db.Tours.AsNoTracking()
            .Where(t => t.AppId == app.Id && t.IsPublished)
            .OrderBy(t => t.SortOrder).ThenBy(t => t.Title)
            .ToListAsync();

        return Result<PublicToursPayload>.Ok(new PublicToursPayload(
            new PublicApp(app.Key, app.Name, new ChooserDto(app.ChooserTitle, app.ChooserSubtitle), new ThemeDto(app.AccentColor)),
            tours.Select(t => t.ToPublic()).ToList()));
    }

    public async Task<Result<List<TourDto>>> ListAsync(string appKey)
    {
        var app = await db.Apps.AsNoTracking().FirstOrDefaultAsync(a => a.Key == appKey);
        if (app is null) return Result<List<TourDto>>.NotFound();
        var tours = await db.Tours.AsNoTracking().Where(t => t.AppId == app.Id)
            .OrderBy(t => t.SortOrder).ThenBy(t => t.Title).ToListAsync();
        return Result<List<TourDto>>.Ok(tours.Select(t => t.ToDto()).ToList());
    }

    public async Task<Result<TourDto>> GetAsync(string appKey, string tourKey) =>
        await Find(appKey, tourKey) is { } t ? Result<TourDto>.Ok(t.ToDto()) : Result<TourDto>.NotFound();

    public async Task<Result<TourDto>> CreateAsync(string appKey, TourDto dto)
    {
        var app = await db.Apps.FirstOrDefaultAsync(a => a.Key == appKey);
        if (app is null) return Result<TourDto>.NotFound();
        var errors = TourValidator.Validate(dto);
        if (errors.Count > 0) return Result<TourDto>.Invalid(errors);
        if (await IdTaken(app.Id, dto.Id)) return Result<TourDto>.Conflict(DuplicateId(dto.Id));

        var entity = new TourEntity { AppId = app.Id };
        entity.Apply(dto);
        db.Tours.Add(entity);
        await db.SaveChangesAsync();
        return Result<TourDto>.Created(entity.ToDto());
    }

    public async Task<Result<TourDto>> UpdateAsync(string appKey, string tourKey, TourDto dto)
    {
        var entity = await Find(appKey, tourKey, tracked: true);
        if (entity is null) return Result<TourDto>.NotFound();
        var errors = TourValidator.Validate(dto);
        if (errors.Count > 0) return Result<TourDto>.Invalid(errors);

        // Optimistic concurrency: reject if someone else saved since this copy was loaded.
        if (dto.UpdatedAt is { } seen && seen.ToUnixTimeMilliseconds() != entity.UpdatedAt.ToUnixTimeMilliseconds())
            return Result<TourDto>.Conflict("This tour was changed by someone else. Reload to see the latest version.");

        if (dto.Id != tourKey && await IdTaken(entity.AppId, dto.Id)) return Result<TourDto>.Conflict(DuplicateId(dto.Id));

        entity.Apply(dto);
        await db.SaveChangesAsync();
        return Result<TourDto>.Ok(entity.ToDto());
    }

    public async Task<Result<Unit>> DeleteAsync(string appKey, string tourKey)
    {
        var entity = await Find(appKey, tourKey, tracked: true);
        if (entity is null) return Result<Unit>.NotFound();
        db.Tours.Remove(entity);
        await db.SaveChangesAsync();
        return Result<Unit>.Ok(default);
    }

    private Task<TourEntity?> Find(string appKey, string tourKey, bool tracked = false)
    {
        var q = db.Tours.Where(t => t.App.Key == appKey && t.Key == tourKey);
        return (tracked ? q : q.AsNoTracking()).FirstOrDefaultAsync();
    }

    private Task<bool> IdTaken(int appId, string tourKey) => db.Tours.AnyAsync(t => t.AppId == appId && t.Key == tourKey);

    private static string DuplicateId(string id) => $"A tour with id \"{id}\" already exists in this app.";
}
