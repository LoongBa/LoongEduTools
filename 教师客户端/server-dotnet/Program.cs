// EduTeacher.Api —— 教师客户端 D03 服务端 · .NET（v0.2 认证 + 离线激活码）
// 定位对齐 A01-教师客户端服务端API契约_v1.0.md：
//   配置文件静态下发 + 认证（手机号+验证码+绑定微信 mock）+ 离线激活码验证兑换。
// 配置：appsettings.json（Jwt:Secret / Sms:Mock）+ 环境变量 JWT_SECRET 覆盖；SMS mock 打印日志。
using EduTeacher.Api;
using Microsoft.Extensions.FileProviders;

var builder = WebApplication.CreateBuilder(args);
var app = builder.Build();

// ── 配置读取 ──
var jwtSecret = Environment.GetEnvironmentVariable("JWT_SECRET") ?? builder.Configuration["Jwt:Secret"] ?? "";
if (string.IsNullOrEmpty(jwtSecret))
{
    jwtSecret = "dev-only-secret-2026"; // 仅本地测试；生产必须配置 JWT_SECRET
    Console.WriteLine("[WARN] JWT_SECRET 未配置，使用 dev 默认值（仅限本地测试）");
}
var smsMock = bool.TryParse(builder.Configuration["Sms:Mock"] ?? Environment.GetEnvironmentVariable("SMS_MOCK"), out var m) ? m : true;

// ── 存储 + 激活码 seed（离线签发模拟）──
var dataDir = Path.Combine(app.Environment.ContentRootPath, "data");
var storage = new Storage(dataDir);
storage.SeedCodesIfEmpty(new[]
{
    ("TEACHER-2026-0001", 2, "demo-2026", new DateTimeOffset(2027, 6, 30, 0, 0, 0, TimeSpan.Zero)),
    ("TEACHER-2026-0002", 2, "demo-2026", new DateTimeOffset(2027, 6, 30, 0, 0, 0, TimeSpan.Zero)),
    ("PRO-2026-0001", 3, "pro-2026", new DateTimeOffset(2027, 6, 30, 0, 0, 0, TimeSpan.Zero)),
});
Console.WriteLine($"[codes] seed 就绪（可用激活码 {storage.AvailableCodeCount()} 条，data/codes.json）");

// ── 健康检查（A01 对齐：壳端 server_ping / 冒烟基线）──
app.MapGet("/api/edu/health", () => Results.Json(new
{
    ok = true,
    service = "edu-teacher-api-dotnet",
    version = "0.2",
    ts = DateTimeOffset.UtcNow.ToString("o"),
}));

// ── 配置文件静态下发（「仅需提供所需的配置文件等」）──
// wwwroot/config/ 目录 → GET /config/<name>（manifest / toolbox / shell 签名包等）
var configDir = Path.Combine(app.Environment.ContentRootPath, "wwwroot", "config");
if (Directory.Exists(configDir))
{
    app.UseStaticFiles(new StaticFileOptions
    {
        FileProvider = new PhysicalFileProvider(configDir),
        RequestPath = "/config",
        OnPrepareResponse = ctx =>
        {
            ctx.Context.Response.Headers.Append("Access-Control-Allow-Origin", "*");
            ctx.Context.Response.Headers.Append("Cache-Control", "no-cache");
        },
    });
}

// ── 认证（A01 §2：手机号+验证码；绑定微信 mock）──
app.MapPost("/api/edu/auth/sms/send", (SmsSendReq? body) => AuthHandlers.SendSms(body, storage, smsMock));
app.MapPost("/api/edu/auth/sms/verify", (SmsVerifyReq? body) => AuthHandlers.VerifySms(body, storage, jwtSecret));
app.MapPost("/api/edu/auth/bind/wechat", (HttpRequest req, WechatBindReq? body) => AuthHandlers.BindWechat(req, body, storage, jwtSecret));

// ── 离线激活码验证（授权码兑换 · 需 JWT）──
app.MapPost("/api/edu/codes/activate", (HttpRequest req, ActivateReq? body) => CodeHandlers.Activate(req, body, storage, jwtSecret));

app.Run();