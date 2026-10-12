using System.Text.RegularExpressions;
using GuidedTours.Api.Models;

namespace GuidedTours.Api.Validation;

/// <summary>Checks on a host system's settings. Errors keyed by field, like TourValidator.</summary>
public static partial class AppValidator
{
    [GeneratedRegex("^#[0-9a-fA-F]{3,8}$")]
    private static partial Regex HexColour();

    public static Dictionary<string, string[]> Validate(AppDto dto)
    {
        var errors = new Dictionary<string, string[]>();
        if (!TourValidator.KeyPattern().IsMatch(dto.Key ?? "")) errors["key"] = ["Use lowercase letters, digits and dashes."];
        if (string.IsNullOrWhiteSpace(dto.Name)) errors["name"] = ["Name is required."];
        if (dto.AccentColor is { Length: > 0 } c && !HexColour().IsMatch(c)) errors["accentColor"] = ["Use a hex colour such as #4f46e5."];
        return errors;
    }
}
