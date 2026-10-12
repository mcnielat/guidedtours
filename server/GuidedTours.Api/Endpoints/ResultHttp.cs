using GuidedTours.Api.Services;

namespace GuidedTours.Api.Endpoints;

/// <summary>The single place where service outcomes become HTTP responses.</summary>
public static class ResultHttp
{
    public static IResult ToHttp<T>(this Result<T> r, Func<T, string>? location = null) => r.Status switch
    {
        ResultStatus.Ok when r.Value is Unit => Results.NoContent(),
        ResultStatus.Ok => Results.Ok(r.Value),
        ResultStatus.Created => Results.Created(location?.Invoke(r.Value!), r.Value),
        ResultStatus.NotFound => Results.NotFound(),
        ResultStatus.Invalid => Results.ValidationProblem(r.Errors!),
        ResultStatus.Conflict => Results.Conflict(new { error = r.Message }),
        _ => throw new InvalidOperationException($"Unhandled result status {r.Status}"),
    };
}
