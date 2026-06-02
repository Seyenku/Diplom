namespace KosmosCore.Middleware;

/// <summary>
/// CSRF-защита для POST /game?handler=... через проверку Origin/Referer.
///
/// Razor Pages по умолчанию валидирует antiforgery-token на POST'ах, но это
/// несовместимо с navigator.sendBeacon() — которым telemetryCollector шлёт
/// батчи событий из beforeunload (sendBeacon не отправляет кастомные заголовки).
/// Поэтому на GameModel стоит [IgnoreAntiforgeryToken], а эта middleware
/// закрывает образовавшуюся дыру: для всех POST'ов на /game требуем, чтобы
/// Origin (или Referer как fallback) совпадал с Host.
///
/// Внешний сайт, делающий cross-origin POST от имени залогиненного пользователя,
/// отдаст свой Origin → 403. Внутренние fetch/sendBeacon — same-origin → проходят.
/// </summary>
public sealed class OriginValidationMiddleware(RequestDelegate next, ILogger<OriginValidationMiddleware> logger)
{
    public async Task InvokeAsync(HttpContext ctx)
    {
        if (RequiresOriginCheck(ctx))
        {
            if (!IsSameOrigin(ctx))
            {
                logger.LogWarning("CSRF: rejected POST {Path} from Origin={Origin} Referer={Referer} (Host={Host})",
                    ctx.Request.Path, ctx.Request.Headers.Origin.ToString(),
                    ctx.Request.Headers.Referer.ToString(), ctx.Request.Host.Value);

                ctx.Response.StatusCode = 403;
                await ctx.Response.WriteAsJsonAsync(new { ok = false, reason = "csrf-origin-mismatch" });
                return;
            }
        }

        await next(ctx);
    }

    private static bool RequiresOriginCheck(HttpContext ctx)
    {
        if (!HttpMethods.IsPost(ctx.Request.Method)) return false;
        // Проверяем только эндпоинты игры — login/admin защищены классическим antiforgery.
        return ctx.Request.Path.StartsWithSegments("/game");
    }

    private static bool IsSameOrigin(HttpContext ctx)
    {
        var host = ctx.Request.Host.Value;
        if (string.IsNullOrEmpty(host)) return false;

        // Предпочтительно — Origin. Fallback на Referer (например, у sendBeacon
        // некоторые браузеры не шлют Origin, но шлют Referer).
        var origin = ctx.Request.Headers.Origin.ToString();
        if (!string.IsNullOrEmpty(origin))
            return TryGetHost(origin, out var oHost) && string.Equals(oHost, host, StringComparison.OrdinalIgnoreCase);

        var referer = ctx.Request.Headers.Referer.ToString();
        if (!string.IsNullOrEmpty(referer))
            return TryGetHost(referer, out var rHost) && string.Equals(rHost, host, StringComparison.OrdinalIgnoreCase);

        // Нет ни Origin ни Referer — отклоняем (это аномалия для browser-инициированного POST).
        return false;
    }

    private static bool TryGetHost(string url, out string host)
    {
        host = string.Empty;
        if (!Uri.TryCreate(url, UriKind.Absolute, out var uri)) return false;
        host = uri.Authority; // host:port
        return true;
    }
}

public static class OriginValidationExtensions
{
    public static IApplicationBuilder UseOriginValidation(this IApplicationBuilder app)
        => app.UseMiddleware<OriginValidationMiddleware>();
}
