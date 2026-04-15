using KosmosCore.Data.Repositories.Interfaces;
using KosmosCore.Data.Repositories.Implementations;
using KosmosCore.Business.Services.Interfaces;
using KosmosCore.Business.Services.Implementations;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.Data.SqlClient;
using System.Data;

var builder = WebApplication.CreateBuilder(args);

// --- Connection String ---
string connectionString = builder.Configuration.GetConnectionString("DefaultConnection")
    ?? throw new InvalidOperationException("Connection string 'DefaultConnection' not found.");

builder.Services.AddScoped<IDbConnection>(_ => new SqlConnection(connectionString));

// --- Memory Cache (для кэширования каталогов планет и апгрейдов) ---
builder.Services.AddMemoryCache();

// --- Repository DI (Scoped) ---
builder.Services.AddScoped<IUserRepository,        UserRepository>();
builder.Services.AddScoped<IPlanetRepository,      PlanetRepository>();

// --- Services ---
builder.Services.AddSingleton<IPasswordHasher, HmacPasswordHasher>();
builder.Services.AddScoped<IMiniGameService, MiniGameService>();
builder.Services.AddScoped<IPlanetCatalogService, PlanetCatalogService>();

// --- Authentication (Cookie-based) ---
builder.Services.AddAuthentication(CookieAuthenticationDefaults.AuthenticationScheme)
    .AddCookie(options =>
    {
        options.LoginPath        = "/Login";
        options.AccessDeniedPath = "/Error";
        options.ExpireTimeSpan   = TimeSpan.FromHours(8);
        options.SlidingExpiration = true;
    });

// --- Session (for non-auth transient data) ---
builder.Services.AddDistributedMemoryCache();
builder.Services.AddSession(options =>
{
    options.IdleTimeout        = TimeSpan.FromMinutes(30);
    options.Cookie.HttpOnly    = true;
    options.Cookie.IsEssential = true;
});

// --- Razor Pages ---
builder.Services.AddRazorPages();

// --- Response Compression (gzip/brotli) ---
builder.Services.AddResponseCompression(options =>
{
    options.EnableForHttps = true;
});

var app = builder.Build();

if (!app.Environment.IsDevelopment())
{
    app.UseExceptionHandler("/Error");
    app.UseHsts();
}

app.UseHttpsRedirection();
app.UseResponseCompression();
app.UseRouting();
app.UseAuthentication();
app.UseAuthorization();
app.UseSession();
app.MapStaticAssets();
app.MapRazorPages().WithStaticAssets();

app.Run();
