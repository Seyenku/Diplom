using Microsoft.AspNetCore.Html;

namespace KosmosCore.Helpers;

/// <summary>
/// Доступ к per-request CSP nonce из Razor.
/// Nonce генерируется в SecurityHeadersMiddleware и кладётся в HttpContext.Items["csp-nonce"].
/// В Razor: <script nonce="@CspNonce.Value(Context)">...</script>
/// </summary>
public static class CspNonce
{
    public const string ContextKey = "csp-nonce";

    public static string Value(HttpContext ctx)
        => ctx.Items[ContextKey] as string ?? string.Empty;

    public static IHtmlContent Attribute(HttpContext ctx)
    {
        var n = Value(ctx);
        return new HtmlString(string.IsNullOrEmpty(n) ? string.Empty : $" nonce=\"{n}\"");
    }
}
