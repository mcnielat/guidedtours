using System.Text.Json;
using GuidedTours.Api.Models;

namespace GuidedTours.Api.Data;

public static class Mapping
{
    public static List<TourStep> ReadSteps(this TourEntity t) =>
        JsonSerializer.Deserialize<List<TourStep>>(t.StepsJson, Json.Options) ?? new();

    public static TourDto ToDto(this TourEntity t) => new()
    {
        Id = t.Key,
        Title = t.Title,
        Description = t.Description,
        Version = t.Version,
        AutoStart = t.AutoStart,
        ShowInChooser = t.ShowInChooser,
        FinishLabel = t.FinishLabel,
        IsPublished = t.IsPublished,
        SortOrder = t.SortOrder,
        UpdatedAt = t.UpdatedAt,
        Steps = t.ReadSteps(),
    };

    public static PublicTour ToPublic(this TourEntity t) =>
        new(t.Key, t.Title, t.Description, t.Version, t.AutoStart, t.ShowInChooser, t.FinishLabel, t.ReadSteps());

    public static void Apply(this TourEntity t, TourDto dto)
    {
        t.Key = dto.Id;
        t.Title = dto.Title.Trim();
        t.Description = string.IsNullOrWhiteSpace(dto.Description) ? null : dto.Description.Trim();
        t.Version = dto.Version < 1 ? 1 : dto.Version;
        t.AutoStart = dto.AutoStart;
        t.ShowInChooser = dto.ShowInChooser;
        t.FinishLabel = string.IsNullOrWhiteSpace(dto.FinishLabel) ? null : dto.FinishLabel.Trim();
        t.IsPublished = dto.IsPublished;
        t.SortOrder = dto.SortOrder;
        t.StepsJson = JsonSerializer.Serialize(dto.Steps, Json.Options);
        t.UpdatedAt = DateTimeOffset.UtcNow;
    }

    public static AppDto ToDto(this AppEntity a, int tourCount = 0) => new()
    {
        Key = a.Key,
        Name = a.Name,
        ChooserTitle = a.ChooserTitle,
        ChooserSubtitle = a.ChooserSubtitle,
        AccentColor = a.AccentColor,
        HostUrl = a.HostUrl,
        TourCount = tourCount,
    };

    public static void Apply(this AppEntity a, AppDto dto)
    {
        a.Key = dto.Key;
        a.Name = dto.Name.Trim();
        a.ChooserTitle = dto.ChooserTitle;
        a.ChooserSubtitle = dto.ChooserSubtitle;
        a.AccentColor = dto.AccentColor;
        a.HostUrl = dto.HostUrl;
    }
}
