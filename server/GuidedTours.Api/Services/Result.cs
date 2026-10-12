namespace GuidedTours.Api.Services;

public enum ResultStatus { Ok, Created, NotFound, Invalid, Conflict }

/// <summary>
/// Result pattern: services report the outcome of a business operation without
/// knowing about HTTP. The endpoint layer maps it to a response (see ResultHttp).
/// </summary>
public sealed record Result<T>
{
    public ResultStatus Status { get; private init; }
    public T? Value { get; private init; }
    /// <summary>Field errors keyed by JSON path, e.g. "steps[2].before[0].url".</summary>
    public Dictionary<string, string[]>? Errors { get; private init; }
    public string? Message { get; private init; }

    public static Result<T> Ok(T value) => new() { Status = ResultStatus.Ok, Value = value };
    public static Result<T> Created(T value) => new() { Status = ResultStatus.Created, Value = value };
    public static Result<T> NotFound() => new() { Status = ResultStatus.NotFound };
    public static Result<T> Invalid(Dictionary<string, string[]> errors) => new() { Status = ResultStatus.Invalid, Errors = errors };
    public static Result<T> Conflict(string message) => new() { Status = ResultStatus.Conflict, Message = message };
}

/// <summary>Marker for operations that succeed without a value (e.g. delete).</summary>
public readonly record struct Unit;
