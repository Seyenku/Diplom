using System.Text.Json;
using KosmosCore.Business.DTOs.Responses;
using KosmosCore.Data.Models;
using KosmosCore.Data.Repositories.Interfaces;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.Logging;

namespace KosmosCore.Data.Repositories.Implementations;

/// <summary>
/// Файловое хранилище сохранений игроков (без БД), чтобы собирать данные для анализа.
/// </summary>
public sealed class FilePlayerSaveStore : IPlayerSaveStore
{
    private readonly string _filePath;
    private readonly ILogger<FilePlayerSaveStore> _logger;
    private readonly SemaphoreSlim _sync = new(1, 1);
    private readonly Dictionary<string, PlayerSaveRecord> _records = new(StringComparer.OrdinalIgnoreCase);

    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        WriteIndented = true,
    };

    public FilePlayerSaveStore(IWebHostEnvironment env, ILogger<FilePlayerSaveStore> logger)
    {
        _logger = logger;
        _filePath = Path.Combine(env.ContentRootPath, "App_Data", "player-saves.json");
        LoadFromDisk();
    }

    public async Task<PlayerSaveRecord> UpsertAsync(string deviceId, string saveJson, CancellationToken ct = default)
    {
        await _sync.WaitAsync(ct);
        try
        {
            var normalized = NormalizeDeviceId(deviceId);
            var now = DateTime.UtcNow;
            _records.TryGetValue(normalized, out var current);

            var parsed = TryParsePlayerMeta(saveJson);

            var next = current is null
                ? new PlayerSaveRecord
                {
                    DeviceId = normalized,
                    SaveJson = saveJson,
                    PlayerName = parsed.PlayerName,
                    ShipColor = parsed.ShipColor,
                    CreatedAtUtc = now,
                    UpdatedAtUtc = now,
                }
                : new PlayerSaveRecord
                {
                    DeviceId = normalized,
                    SaveJson = saveJson,
                    PlayerName = parsed.PlayerName ?? current.PlayerName,
                    ShipColor = parsed.ShipColor ?? current.ShipColor,
                    CreatedAtUtc = current.CreatedAtUtc,
                    UpdatedAtUtc = now,
                };

            _records[normalized] = next;
            await PersistUnsafeAsync(ct);
            return Clone(next);
        }
        finally
        {
            _sync.Release();
        }
    }

    public async Task<PlayerSaveRecord?> GetByDeviceIdAsync(string deviceId, CancellationToken ct = default)
    {
        await _sync.WaitAsync(ct);
        try
        {
            var normalized = NormalizeDeviceId(deviceId);
            return _records.TryGetValue(normalized, out var record) ? Clone(record) : null;
        }
        finally
        {
            _sync.Release();
        }
    }

    public async Task<IReadOnlyList<PlayerSaveRecord>> GetRecentAsync(int take = 100, bool includePayload = false, CancellationToken ct = default)
    {
        await _sync.WaitAsync(ct);
        try
        {
            var limit = Math.Clamp(take, 1, 5000);
            var list = _records.Values
                .OrderByDescending(x => x.UpdatedAtUtc)
                .Take(limit)
                .Select(Clone)
                .ToList();

            if (!includePayload)
            {
                list.ForEach(x => x.SaveJson = string.Empty);
            }

            return list.AsReadOnly();
        }
        finally
        {
            _sync.Release();
        }
    }

    public async Task<PlayerSaveStatsDto> GetStatsAsync(CancellationToken ct = default)
    {
        await _sync.WaitAsync(ct);
        try
        {
            var byShipColor = _records.Values
                .Where(x => !string.IsNullOrWhiteSpace(x.ShipColor))
                .GroupBy(x => x.ShipColor!, StringComparer.OrdinalIgnoreCase)
                .ToDictionary(g => g.Key, g => g.Count(), StringComparer.OrdinalIgnoreCase);

            return new PlayerSaveStatsDto
            {
                TotalSaves = _records.Count,
                UniqueDevices = _records.Count,
                NamedPlayers = _records.Values.Count(x => !string.IsNullOrWhiteSpace(x.PlayerName)),
                ByShipColor = byShipColor,
            };
        }
        finally
        {
            _sync.Release();
        }
    }

    private void LoadFromDisk()
    {
        try
        {
            if (!File.Exists(_filePath)) return;

            var json = File.ReadAllText(_filePath);
            if (string.IsNullOrWhiteSpace(json)) return;

            var list = JsonSerializer.Deserialize<List<PlayerSaveRecord>>(json, JsonOptions) ?? [];
            _records.Clear();
            foreach (var item in list)
            {
                if (string.IsNullOrWhiteSpace(item.DeviceId)) continue;
                _records[NormalizeDeviceId(item.DeviceId)] = item;
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to load player save file from {Path}", _filePath);
        }
    }

    private async Task PersistUnsafeAsync(CancellationToken ct)
    {
        var dir = Path.GetDirectoryName(_filePath);
        if (!string.IsNullOrWhiteSpace(dir))
            Directory.CreateDirectory(dir);

        var payload = _records.Values
            .OrderByDescending(x => x.UpdatedAtUtc)
            .ToList();

        var json = JsonSerializer.Serialize(payload, JsonOptions);
        await File.WriteAllTextAsync(_filePath, json, ct);
    }

    private static string NormalizeDeviceId(string deviceId)
    {
        var normalized = (deviceId ?? string.Empty).Trim();
        if (normalized.Length > 128)
            normalized = normalized[..128];
        return normalized;
    }

    private static (string? PlayerName, string? ShipColor) TryParsePlayerMeta(string saveJson)
    {
        try
        {
            using var doc = JsonDocument.Parse(saveJson);
            var root = doc.RootElement;

            string? playerName = null;
            string? shipColor = null;

            if (root.TryGetProperty("name", out var nameEl) && nameEl.ValueKind == JsonValueKind.String)
                playerName = nameEl.GetString();

            if (root.TryGetProperty("shipColor", out var colorEl) && colorEl.ValueKind == JsonValueKind.String)
                shipColor = colorEl.GetString();

            return (playerName, shipColor);
        }
        catch
        {
            return (null, null);
        }
    }

    private static PlayerSaveRecord Clone(PlayerSaveRecord item) => new()
    {
        DeviceId = item.DeviceId,
        SaveJson = item.SaveJson,
        PlayerName = item.PlayerName,
        ShipColor = item.ShipColor,
        CreatedAtUtc = item.CreatedAtUtc,
        UpdatedAtUtc = item.UpdatedAtUtc,
    };
}

