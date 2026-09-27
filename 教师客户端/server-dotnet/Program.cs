// EduTeacher.Api —— 教师客户端 D03 服务端 · .NET 测试骨架（v0.1 测试版）
// 定位对齐 A01-教师客户端服务端API契约_v1.0.md：
//   当前阶段仅提供「所需的配置文件等」静态下发 + 健康检查；
//   认证（手机号+验证码+绑定微信）与离线激活码验证为扩展位（501 占位，后续迭代）。
using Microsoft.Extensions.FileProviders;

var builder = WebApplication.CreateBuilder(args);
var app = builder.Build();

// ── 健康检查（A01 对齐：壳端 server_ping / 冒烟基线）──
app.MapGet("/api/edu/health", () => Results.Json(new
{
    ok = true,
    service = "edu-teacher-api-dotnet",
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

// ── 扩展位占位（当前测试版不实现，统一 501）──
// 后续迭代：手机号+验证码认证 / 绑定微信 / 离线激活码验证兑换
app.MapPost("/api/edu/auth/sms/send", NotImpl);
app.MapPost("/api/edu/auth/sms/verify", NotImpl);
app.MapPost("/api/edu/auth/bind/wechat", NotImpl);
app.MapPost("/api/edu/codes/activate", NotImpl);

app.Run();

static IResult NotImpl() =>
    Results.Json(
        new { error = new { code = "NOT_IMPLEMENTED", message = "功能未实现：当前为测试骨架，认证/激活码在后续迭代" } },
        statusCode: StatusCodes.Status501NotImplemented);