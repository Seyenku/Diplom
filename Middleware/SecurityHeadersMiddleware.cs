using System.Security.Cryptography;
using KosmosCore.Helpers;

namespace KosmosCore.Middleware;

/// <summary>
/// Ставит Content-Security-Policy и базовые security-заголовки.
///
/// CSP env-зависимый:
///   - В Development разрешаем http://localhost:* и ws://localhost:* (HMR/devtools).
///   - В Production только 'self' + конкретные доверенные origin-ы (CDN, шрифты).
///
/// script-src без 'unsafe-inline': для каждого запроса генерируется случайный nonce,
/// который кладётся в HttpContext.Items[CspNonce.ContextKey] и подставляется в
/// inline <script> теги через CspNonce.Value(Context) в Razor. Inline onclick-/oninput-
/// обработчики выпилены и заменены на data-action в main.ts.
/// </summary>
public sealed class SecurityHeadersMiddleware(RequestDelegate next, IWebHostEnvironment env)
{
    private readonly bool _isDev = env.IsDevelopment();

    public async Task InvokeAsync(HttpContext ctx)
    {
        // 128 бит энтропии — base64-encoded, кладём в Items для доступа из Razor.
        var nonce = Convert.ToBase64String(RandomNumberGenerator.GetBytes(16));
        ctx.Items[CspNonce.ContextKey] = nonce;

        var headers = ctx.Response.Headers;
        headers["Content-Security-Policy"] = BuildCsp(_isDev, nonce);
        headers["X-Content-Type-Options"] = "nosniff";
        headers["X-Frame-Options"] = "DENY";
        headers["Referrer-Policy"] = "strict-origin-when-cross-origin";
        headers["Permissions-Policy"] = "geolocation=(), camera=(), microphone=(), payment=()";

        await next(ctx);
    }

    private static string BuildCsp(bool isDev, string nonce)
    {
        var localhost = isDev ? " http://localhost:* https://localhost:* ws://localhost:* wss://localhost:*" : "";

        return string.Join("; ", new[]
        {
            "default-src 'self'",
            // 'nonce-...' вместо 'unsafe-inline': inline <script> теги работают только
            // если у них есть совпадающий nonce-атрибут. Это закрывает inline-XSS.
            // jsdelivr остаётся для tsparticles и chart.js (используются на лендинге/спеках).
            $"script-src 'self' 'nonce-{nonce}' https://cdn.jsdelivr.net{localhost}",
            // 'unsafe-inline' для style оставляем — inline style="..." используется широко
            // в Razor-разметке (visual layout), отдельный refactor.
            "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.jsdelivr.net",
            "font-src 'self' https://fonts.gstatic.com https://cdn.jsdelivr.net",
            "img-src 'self' data: blob:",
            $"connect-src 'self'{localhost}",
            "worker-src 'self' blob:",
            "object-src 'none'",
            "base-uri 'self'",
            "form-action 'self'",
            "frame-ancestors 'none'",
        });
    }
}

public static class SecurityHeadersExtensions
{
    public static IApplicationBuilder UseSecurityHeaders(this IApplicationBuilder app)
        => app.UseMiddleware<SecurityHeadersMiddleware>();
}
