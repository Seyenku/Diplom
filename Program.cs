using KosmosCore.Data.Repositories.Interfaces;
using KosmosCore.Data.Repositories.Implementations;
using KosmosCore.Business.Services.Interfaces;
using KosmosCore.Business.Services.Implementations;
using KosmosCore.Middleware;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.AspNetCore.ResponseCompression;
using Microsoft.Data.SqlClient;
using System.Data;
using System.IO.Compression;
using System.Threading.RateLimiting;

var builder = WebApplication.CreateBuilder(args);

// --- Connection String ---
string connectionString = builder.Configuration.GetConnectionString("DefaultConnection")
    ?? throw new InvalidOperationException("Connection string 'DefaultConnection' not found.");

// IDbConnection как фабрика: репозиторий открывает соединение по требованию
// в using-блоке. Это снимает scoped-связку «одно соединение на запрос», которая
// блокировала параллельные SQL (нельзя было сделать Task.WhenAll по нескольким
// репозиториям из-за «There is already an open DataReader»).
builder.Services.AddScoped<Func<IDbConnection>>(_ => () => new SqlConnection(connectionString));

// --- Memory Cache (для кэширования каталогов планет и апгрейдов) ---
builder.Services.AddMemoryCache();

// --- Repository DI (Scoped) ---
builder.Services.AddScoped<IUserRepository,        UserRepository>();
builder.Services.AddScoped<IPlanetRepository,      PlanetRepository>();
builder.Services.AddScoped<ISpecRepository,        SpecRepository>();
builder.Services.AddScoped<ITelemetryRepository,   TelemetryRepository>();
builder.Services.AddScoped<IGameSettingsRepository, GameSettingsRepository>();

// --- Services ---
builder.Services.AddSingleton<IPasswordHasher, HmacPasswordHasher>();
builder.Services.AddScoped<IMiniGameService, MiniGameService>();

// --- Telemetry pipeline ---
// Очередь — singleton (общая для эндпоинта и воркера).
// Воркер — hosted background service; внутри создаёт scope под каждый батч,
// чтобы получить scoped репозиторий и IDbConnection.
builder.Services.AddSingleton<ITelemetryQueue, TelemetryQueue>();
builder.Services.AddHostedService<TelemetryWorker>();

// --- Authentication (Cookie-based) ---
// SameSite=Strict — основная защита от CSRF на cookie-уровне.
// SecurePolicy=SameAsRequest позволяет работать в Dev (http), в Prod автоматически Secure (https).
builder.Services.AddAuthentication(CookieAuthenticationDefaults.AuthenticationScheme)
    .AddCookie(options =>
    {
        options.LoginPath        = "/Login";
        options.AccessDeniedPath = "/Error";
        options.ExpireTimeSpan   = TimeSpan.FromHours(8);
        options.SlidingExpiration = true;
        options.Cookie.SameSite  = SameSiteMode.Strict;
        options.Cookie.SecurePolicy = CookieSecurePolicy.SameAsRequest;
        options.Cookie.HttpOnly  = true;
    });

// --- Session (for non-auth transient data) ---
builder.Services.AddDistributedMemoryCache();
builder.Services.AddSession(options =>
{
    options.IdleTimeout        = TimeSpan.FromMinutes(30);
    options.Cookie.HttpOnly    = true;
    options.Cookie.IsEssential = true;
    options.Cookie.SameSite    = SameSiteMode.Strict;
});

// --- Rate Limiting ---
// Логин — защита от брутфорса (5 POST/мин с одного IP).
// /game POST (телеметрия, мини-игры) — щит от спама очереди и БД (120/мин с IP).
// Остальные запросы не лимитируются.
builder.Services.AddRateLimiter(options =>
{
    options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    options.GlobalLimiter = PartitionedRateLimiter.Create<HttpContext, string>(ctx =>
    {
        if (!HttpMethods.IsPost(ctx.Request.Method))
            return RateLimitPartition.GetNoLimiter("none");

        var ip = ctx.Connection.RemoteIpAddress?.ToString() ?? "unknown";

        if (ctx.Request.Path.StartsWithSegments("/login"))
            return RateLimitPartition.GetFixedWindowLimiter($"login:{ip}", _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = 5,
                Window      = TimeSpan.FromMinutes(1),
                QueueLimit  = 0,
            });

        if (ctx.Request.Path.StartsWithSegments("/game"))
            return RateLimitPartition.GetFixedWindowLimiter($"game:{ip}", _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = 120,
                Window      = TimeSpan.FromMinutes(1),
                QueueLimit  = 0,
            });

        return RateLimitPartition.GetNoLimiter("none");
    });
});

// --- Razor Pages ---
builder.Services.AddRazorPages();

// --- Response Compression (gzip/brotli) ---
// Дефолтные MimeTypes покрывают только text/html, text/css, application/json и пару других.
// Для SPA с десятками JS-файлов, шрифтов и SVG-иконок этого мало — расширяем явно.
builder.Services.AddResponseCompression(options =>
{
    options.EnableForHttps = true;
    options.Providers.Add<BrotliCompressionProvider>();
    options.Providers.Add<GzipCompressionProvider>();
    options.MimeTypes = ResponseCompressionDefaults.MimeTypes.Concat(new[]
    {
        "application/javascript",
        "text/javascript",
        "image/svg+xml",
        "application/wasm",
        "application/font-woff",
        "application/font-woff2",
        "font/woff",
        "font/woff2",
    });
});
builder.Services.Configure<BrotliCompressionProviderOptions>(o => o.Level = CompressionLevel.Optimal);
builder.Services.Configure<GzipCompressionProviderOptions>(o => o.Level = CompressionLevel.SmallestSize);

var app = builder.Build();

// За реверс-прокси (ngrok) Connection.RemoteIpAddress — это loopback-адрес агента.
// Берём реальный IP клиента из X-Forwarded-For, иначе rate limiter считает всех
// внешних пользователей одним клиентом. По умолчанию доверяем только loopback-прокси.
app.UseForwardedHeaders(new ForwardedHeadersOptions
{
    ForwardedHeaders = ForwardedHeaders.XForwardedFor,
});

if (!app.Environment.IsDevelopment())
{
    app.UseExceptionHandler("/Error");
    app.UseHsts();
}

app.UseHttpsRedirection();
app.UseResponseCompression();
// Security-заголовки (CSP, X-Frame-Options, и т.д.) ставим до роутинга и
// до auth, чтобы они применялись ко всем ответам, включая редиректы.
app.UseSecurityHeaders();
app.UseRouting();
app.UseRateLimiter();
app.UseAuthentication();
app.UseAuthorization();
// Origin-валидация CSRF — после auth, чтобы знать пользователя в логе.
app.UseOriginValidation();
app.UseSession();
app.MapStaticAssets();
app.MapRazorPages().WithStaticAssets();

app.Run();
