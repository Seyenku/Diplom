namespace KosmosCore.Business.DTOs.Responses;

public class GameSettingsDto
{
    public float SoundVolume   { get; init; } = 0.7f;
    public float MusicVolume   { get; init; } = 0.5f;
    public string GraphicsQuality { get; init; } = "medium"; // low | medium | high
    public string ControlScheme { get; init; } = "keyboard"; // keyboard | mouse | gamepad
    public bool Subtitles       { get; init; } = false;
    public bool ColorblindMode  { get; init; } = false;
    public float UiScale        { get; init; } = 1.0f;
    public bool GuideEnabled    { get; init; } = true;

    public static readonly GameSettingsDto Default = new();
}
