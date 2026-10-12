using GuidedTours.Api.Data;
using GuidedTours.Api.Models;
using GuidedTours.Api.Validation;
using Microsoft.EntityFrameworkCore;

namespace GuidedTours.Api.Services;

/// <summary>Service layer for host systems ("apps") that embed the engine.</summary>
public sealed class AppService(ToursDb db)
{
    public Task<List<AppDto>> ListAsync() =>
        db.Apps.AsNoTracking().OrderBy(a => a.Name)
            .Select(a => new AppDto
            {
                Key = a.Key, Name = a.Name, ChooserTitle = a.ChooserTitle, ChooserSubtitle = a.ChooserSubtitle,
                AccentColor = a.AccentColor, HostUrl = a.HostUrl, TourCount = a.Tours.Count,
            })
            .ToListAsync();

    public async Task<Result<AppDto>> GetAsync(string appKey)
    {
        var app = await db.Apps.AsNoTracking().FirstOrDefaultAsync(a => a.Key == appKey);
        if (app is null) return Result<AppDto>.NotFound();
        return Result<AppDto>.Ok(app.ToDto(await db.Tours.CountAsync(t => t.AppId == app.Id)));
    }

    public async Task<Result<AppDto>> CreateAsync(AppDto dto)
    {
        var errors = AppValidator.Validate(dto);
        if (errors.Count > 0) return Result<AppDto>.Invalid(errors);
        if (await db.Apps.AnyAsync(a => a.Key == dto.Key))
            return Result<AppDto>.Conflict($"An app with key \"{dto.Key}\" already exists.");

        var entity = new AppEntity();
        entity.Apply(dto);
        db.Apps.Add(entity);
        await db.SaveChangesAsync();
        return Result<AppDto>.Created(entity.ToDto());
    }

    public async Task<Result<AppDto>> UpdateAsync(string appKey, AppDto dto)
    {
        var entity = await db.Apps.FirstOrDefaultAsync(a => a.Key == appKey);
        if (entity is null) return Result<AppDto>.NotFound();

        dto = dto with { Key = appKey }; // the key is the public identifier hosts embed; never renamed
        var errors = AppValidator.Validate(dto);
        if (errors.Count > 0) return Result<AppDto>.Invalid(errors);

        entity.Apply(dto);
        await db.SaveChangesAsync();
        return Result<AppDto>.Ok(entity.ToDto());
    }

    public async Task<Result<Unit>> DeleteAsync(string appKey) =>
        await db.Apps.Where(a => a.Key == appKey).ExecuteDeleteAsync() == 0
            ? Result<Unit>.NotFound()
            : Result<Unit>.Ok(default);
}
