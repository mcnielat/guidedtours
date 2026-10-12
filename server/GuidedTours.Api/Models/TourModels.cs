using System.Text.Json;
using System.Text.Json.Serialization;

namespace GuidedTours.Api.Models;

// The tour config as it travels over the wire. Mirrors engine/src/types.ts and
// schema/tour.schema.json. Steps are stored as JSON, so adding an optional field
// here never needs a database migration.

public sealed record TourCondition
{
    public string? Exists { get; init; }
    public string? NotExists { get; init; }
}

/// <summary>
/// One action from a step's <c>before</c> list. A flat shape with a <c>type</c>
/// discriminator keeps it trivial to edit in a form or as raw JSON; the validator
/// enforces which fields each type needs.
/// </summary>
public sealed record TourAction
{
    public string Type { get; init; } = "";
    public string? Selector { get; init; }
    public string? Text { get; init; }
    public string? Url { get; init; }
    public int? Timeout { get; init; }
    public int? Ms { get; init; }
    public string? Event { get; init; }
    public JsonElement? Detail { get; init; }
    public string? Name { get; init; }
    public JsonElement? Args { get; init; }
    public string? Value { get; init; }
    public TourCondition? When { get; init; }
}

public sealed record TourStep
{
    public string? Id { get; init; }
    public string? Page { get; init; }
    public string? Target { get; init; }
    public string? TargetText { get; init; }
    public string Title { get; init; } = "";
    public string Body { get; init; } = "";
    public string? Badge { get; init; }
    public string? Placement { get; init; }
    public int? Padding { get; init; }
    public List<TourAction>? Before { get; init; }
    public int? Timeout { get; init; }
    public string? OnMissing { get; init; }
}

/// <summary>Admin view of a tour: the engine config plus publishing metadata.</summary>
public sealed record TourDto
{
    public string Id { get; init; } = "";
    public string Title { get; init; } = "";
    public string? Description { get; init; }
    public int Version { get; init; } = 1;
    public string AutoStart { get; init; } = "never";
    public bool ShowInChooser { get; init; } = true;
    public string? FinishLabel { get; init; }
    public bool IsPublished { get; init; }
    public int SortOrder { get; init; }
    public DateTimeOffset? UpdatedAt { get; init; }
    public List<TourStep> Steps { get; init; } = new();
}

/// <summary>What the engine receives: only the fields it runs on.</summary>
public sealed record PublicTour(
    string Id,
    string Title,
    string? Description,
    int Version,
    string AutoStart,
    bool ShowInChooser,
    string? FinishLabel,
    List<TourStep> Steps);

public sealed record ChooserDto(string? Title, string? Subtitle);

public sealed record ThemeDto(string? Accent);

public sealed record PublicApp(string Key, string Name, ChooserDto Chooser, ThemeDto Theme);

public sealed record PublicToursPayload(PublicApp App, List<PublicTour> Tours);

public sealed record AppDto
{
    public string Key { get; init; } = "";
    public string Name { get; init; } = "";
    public string? ChooserTitle { get; init; }
    public string? ChooserSubtitle { get; init; }
    public string? AccentColor { get; init; }
    /// <summary>URL of the host app, used by the admin UI for "open in app" links.</summary>
    public string? HostUrl { get; init; }
    public int TourCount { get; init; }
}

public static class Json
{
    /// <summary>camelCase, nulls omitted: the exact shape the engine expects.</summary>
    public static readonly JsonSerializerOptions Options = new(JsonSerializerDefaults.Web)
    {
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
    };
}
