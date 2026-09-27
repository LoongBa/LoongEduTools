// AuthHandlers.cs —— 认证端点（A01 §2 对齐）：手机号+验证码登录 / 绑定微信（mock）
// body 用 Minimal API 原生 DTO 自动绑定（JsonSerializer）。

namespace EduTeacher.Api;

public record SmsSendReq(string? Phone);
public record SmsVerifyReq(string? Phone, string? Code);
public record WechatBindReq(string? Code);

public static class AuthHandlers
{
    private static readonly TimeSpan SmsTtl = TimeSpan.FromMinutes(15);
    private static readonly TimeSpan ResendGap = TimeSpan.FromSeconds(60);
    private static readonly TimeSpan JwtTtl = TimeSpan.FromDays(7);
    private static readonly System.Text.RegularExpressions.Regex PhoneRe = new("^1[3-9]\\d{9}$");

    /// <summary>POST /api/edu/auth/sms/send —— 发送验证码（mock 打印日志；SMS_MOCK=true 时响应带 dev_code 供本地冒烟）</summary>
    public static IResult SendSms(SmsSendReq? body, Storage storage, bool smsMock)
    {
        var phone = body?.Phone?.Trim() ?? "";
        if (!PhoneRe.IsMatch(phone)) return Error("INVALID_PHONE", "手机号格式不正确", 400);

        var now = DateTimeOffset.UtcNow;
        var existing = storage.GetSms(phone);
        if (existing != null && now - existing.LastSentAt < ResendGap)
        {
            var wait = (int)Math.Ceiling((ResendGap - (now - existing.LastSentAt)).TotalSeconds);
            return Error("TOO_FREQUENT", $"发送过于频繁，请 {wait} 秒后再试", 429);
        }

        var code = Random.Shared.Next(100000, 999999).ToString();
        storage.SetSms(phone, new SmsRecord(Storage.Sha256Hex(code), now + SmsTtl, now));

        // mock：验证码打印到控制台（生产接入短信服务商后替换此段）
        Console.WriteLine($"[SMS_MOCK] {phone} => {code}");
        var resp = new Dictionary<string, object> { ["retry_in"] = 60 };
        if (smsMock) resp["dev_code"] = code; // 仅本地冒烟（生产 SMS_MOCK 必须关）
        return Results.Json(resp);
    }

    /// <summary>POST /api/edu/auth/sms/verify —— 验证码登录（首次自动注册，level 1）→ 签发 JWT 7 天</summary>
    public static IResult VerifySms(SmsVerifyReq? body, Storage storage, string jwtSecret)
    {
        var phone = body?.Phone?.Trim() ?? "";
        var code = body?.Code?.Trim() ?? "";
        if (!PhoneRe.IsMatch(phone)) return Error("INVALID_PHONE", "手机号格式不正确", 400);

        var now = DateTimeOffset.UtcNow;
        var rec = storage.GetSms(phone);
        if (rec == null || rec.ExpAt < now) return Error("CODE_EXPIRED", "验证码不存在或已过期，请重新获取", 400);
        if (!FixedEquals(rec.CodeHash, Storage.Sha256Hex(code))) return Error("CODE_MISMATCH", "验证码错误", 400);

        storage.RemoveSms(phone); // 一次性消费

        var user = storage.FindUserByPhone(phone);
        if (user == null)
        {
            user = new User(
                Id: $"u-{now.ToUnixTimeMilliseconds()}-{Random.Shared.Next(1000, 9999)}",
                Phone: phone, WechatOpenid: null, Level: 1,
                CreatedAt: now, ExpiresAt: null);
            storage.UpsertUser(user);
        }

        var jwt = Jwt.Sign(jwtSecret, user.Id, user.Level, (int)JwtTtl.TotalSeconds);
        return Results.Json(new
        {
            jwt,
            expires_in = (int)JwtTtl.TotalSeconds,
            teacher = new
            {
                id = user.Id,
                phone = user.Phone,
                level = user.Level,
                wechat_bound = !string.IsNullOrEmpty(user.WechatOpenid),
            },
        });
    }

    /// <summary>POST /api/edu/auth/bind/wechat —— 绑定微信（需 JWT；mock：code → openid = wechat_mock_&lt;code&gt;）</summary>
    public static IResult BindWechat(HttpRequest req, WechatBindReq? body, Storage storage, string jwtSecret)
    {
        var jwt = Jwt.FromRequest(req, jwtSecret);
        if (jwt == null) return Error("UNAUTHORIZED", "请先登录（缺少或无效的 JWT）", 401);

        var code = body?.Code?.Trim() ?? "";
        if (string.IsNullOrEmpty(code)) return Error("INVALID_CODE", "缺少微信授权 code", 400);

        var user = storage.FindUserById(jwt.Sub);
        if (user == null) return Error("USER_NOT_FOUND", "用户不存在", 404);

        // mock：真实接入微信 OAuth 时用 code 换 openid；当前演示直接派生
        var openid = $"wechat_mock_{code}";
        if (user.WechatOpenid != openid)
        {
            storage.UpsertUser(user with { WechatOpenid = openid });
        }
        return Results.Json(new { ok = true, wechat_bound = true });
    }

    private static bool FixedEquals(string a, string b)
    {
        if (a.Length != b.Length) return false;
        var diff = 0;
        for (var i = 0; i < a.Length; i++) diff |= a[i] ^ b[i];
        return diff == 0;
    }

    public static IResult Error(string code, string message, int status)
        => Results.Json(new { error = new { code, message } }, statusCode: status);
}