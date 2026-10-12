using System.Text.RegularExpressions;
using GuidedTours.Api.Models;

namespace GuidedTours.Api.Validation;

/// <summary>
/// Server-side checks on tour config. The engine is defensive too, but catching a
/// bad tour at save time is far better than a broken tour in production.
/// Returns errors keyed by JSON path, ready for Results.ValidationProblem.
/// </summary>
public static partial class TourValidator
{
    public static readonly string[] Placements = ["auto", "top", "bottom", "left", "right", "center"];
    public static readonly string[] AutoStarts = ["never", "firstVisit", "always"];
    public static readonly string[] OnMissingValues = ["skip", "center"];
    public static readonly string[] ActionTypes = ["click", "navigate", "waitFor", "delay", "dispatch", "call", "setValue"];

    public const int MaxSteps = 100;
    public const int MaxActionsPerStep = 20;

    [GeneratedRegex("^[a-z0-9][a-z0-9-]{0,63}$")]
    public static partial Regex KeyPattern();

    [GeneratedRegex("^[A-Za-z][A-Za-z0-9_.:-]{0,63}$")]
    private static partial Regex NamePattern();

    public static Dictionary<string, string[]> Validate(TourDto t)
    {
        var errors = new Dictionary<string, List<string>>();
        void Add(string path, string msg)
        {
            if (!errors.TryGetValue(path, out var list)) errors[path] = list = new();
            list.Add(msg);
        }

        if (!KeyPattern().IsMatch(t.Id ?? "")) Add("id", "Use lowercase letters, digits and dashes (max 64), e.g. \"email-walkthrough\".");
        if (string.IsNullOrWhiteSpace(t.Title)) Add("title", "Title is required.");
        else if (t.Title.Length > 200) Add("title", "Title must be 200 characters or fewer.");
        if (!AutoStarts.Contains(t.AutoStart)) Add("autoStart", $"Must be one of: {string.Join(", ", AutoStarts)}.");
        if (t.Version < 1) Add("version", "Version must be 1 or higher.");

        if (t.Steps is null || t.Steps.Count == 0) Add("steps", "A tour needs at least one step.");
        else if (t.Steps.Count > MaxSteps) Add("steps", $"A tour can have at most {MaxSteps} steps.");

        for (var i = 0; i < (t.Steps?.Count ?? 0); i++)
        {
            var s = t.Steps![i];
            var p = $"steps[{i}]";
            if (s is null) { Add(p, "Step is empty."); continue; }
            if (string.IsNullOrWhiteSpace(s.Title)) Add($"{p}.title", "Title is required.");
            if (string.IsNullOrWhiteSpace(s.Body)) Add($"{p}.body", "Description is required.");
            if (s.Body?.Length > 2000) Add($"{p}.body", "Description must be 2000 characters or fewer.");
            if (s.Placement is not null && !Placements.Contains(s.Placement)) Add($"{p}.placement", $"Must be one of: {string.Join(", ", Placements)}.");
            if (s.OnMissing is not null && !OnMissingValues.Contains(s.OnMissing)) Add($"{p}.onMissing", "Must be \"skip\" or \"center\".");
            if (s.Target is not null && !LooksLikeSelector(s.Target)) Add($"{p}.target", "Not a valid CSS selector.");
            if (s.Page is not null && !IsRelativeUrl(s.Page)) Add($"{p}.page", "Use a path on the same site, e.g. \"/settings.html\".");
            if (s.Timeout is < 0 or > 30_000) Add($"{p}.timeout", "Timeout must be between 0 and 30000 ms.");
            if (s.Padding is < 0 or > 64) Add($"{p}.padding", "Padding must be between 0 and 64 px.");

            var actions = s.Before ?? new();
            if (actions.Count > MaxActionsPerStep) Add($"{p}.before", $"At most {MaxActionsPerStep} actions per step.");
            for (var j = 0; j < actions.Count; j++)
                ValidateAction(actions[j], $"{p}.before[{j}]", Add);
        }

        return errors.ToDictionary(kv => kv.Key, kv => kv.Value.ToArray());
    }

    private static void ValidateAction(TourAction a, string p, Action<string, string> add)
    {
        if (a is null) { add(p, "Action is empty."); return; }
        if (!ActionTypes.Contains(a.Type)) { add($"{p}.type", $"Must be one of: {string.Join(", ", ActionTypes)}."); return; }

        void NeedSelector()
        {
            if (string.IsNullOrWhiteSpace(a.Selector)) add($"{p}.selector", $"\"{a.Type}\" needs a selector.");
            else if (!LooksLikeSelector(a.Selector)) add($"{p}.selector", "Not a valid CSS selector.");
        }

        switch (a.Type)
        {
            case "click":
            case "waitFor":
                NeedSelector();
                break;
            case "setValue":
                NeedSelector();
                if (a.Value is null) add($"{p}.value", "\"setValue\" needs a value.");
                break;
            case "navigate":
                if (string.IsNullOrWhiteSpace(a.Url) || !IsRelativeUrl(a.Url)) add($"{p}.url", "Use a same-site path or hash, e.g. \"#inbox\" or \"/reports\".");
                break;
            case "delay":
                if (a.Ms is null or < 0 or > 10_000) add($"{p}.ms", "Delay must be between 0 and 10000 ms.");
                break;
            case "dispatch":
                if (string.IsNullOrWhiteSpace(a.Event) || !NamePattern().IsMatch(a.Event)) add($"{p}.event", "Event name is required (letters, digits, - _ . :).");
                break;
            case "call":
                if (string.IsNullOrWhiteSpace(a.Name) || !NamePattern().IsMatch(a.Name)) add($"{p}.name", "Name of an action the host registered with Tour.registerAction.");
                break;
        }

        if (a.When?.Exists is { } ex && !LooksLikeSelector(ex)) add($"{p}.when.exists", "Not a valid CSS selector.");
        if (a.When?.NotExists is { } nx && !LooksLikeSelector(nx)) add($"{p}.when.notExists", "Not a valid CSS selector.");
    }

    /// <summary>
    /// Same-origin only: a path, query or hash. Blocks absolute URLs and
    /// "javascript:" so config can never send users off-site or run script.
    /// </summary>
    public static bool IsRelativeUrl(string url)
    {
        url = url.Trim();
        if (url.Length == 0 || url.Length > 500) return false;
        if (url.StartsWith("//")) return false;
        if (url[0] is '/' or '#' or '?') return true;
        // "settings.html" or "pages/x" style relative paths, but not "scheme:..."
        return !url.Contains(':') && Uri.IsWellFormedUriString(url, UriKind.Relative);
    }

    /// <summary>Cheap sanity check; the browser is the real selector parser.</summary>
    public static bool LooksLikeSelector(string s)
    {
        s = s.Trim();
        if (s.Length == 0 || s.Length > 500) return false;
        var depth = 0;
        foreach (var c in s)
        {
            if (c is '[' or '(') depth++;
            else if (c is ']' or ')') depth--;
            if (depth < 0) return false;
        }
        return depth == 0 && !s.Contains('{') && !s.Contains('}');
    }
}
