// Jwt.cs —— HS256 JWT 自实现（零依赖：HMACSHA256 + base64url；payload { sub, lvl, exp, iat }）
// 语义对齐 A01 §1.3：sub=教师 id、lvl=口令级别、exp=过期、iat=签发时间。
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace EduTeacher.Api;

public sealed record JwtPayload(string Sub, int Lvl, long Exp, long Iat);

public static class Jwt
{
    /// <summary>签发 HS256 JWT（secret 来自配置/环境变量 JWT_SECRET）</summary>
    public static string Sign(string secret, string sub, int lvl, int ttlSec)
    {
        var now = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
        var header = B64Url(Encoding.UTF8.GetBytes("{\"alg\":\"HS256\",\"typ\":\"JWT\"}"));
        var payload = B64Url(Encoding.UTF8.GetBytes(
            $"{{\"sub\":\"{sub}\",\"lvl\":{lvl},\"exp\":{now + ttlSec},\"iat\":{now}}}"));
        var data = $"{header}.{payload}";
        using var hmac = new HMACSHA256(Encoding.UTF8.GetBytes(secret));
        var sig = B64Url(hmac.ComputeHash(Encoding.UTF8.GetBytes(data)));
        return $"{data}.{sig}";
    }

    /// <summary>校验 JWT（签名 + 过期）；无效返回 null</summary>
    public static JwtPayload? Verify(string secret, string token)
    {
        var parts = token.Split('.');
        if (parts.Length != 3) return null;
        var data = $"{parts[0]}.{parts[1]}";
        using var hmac = new HMACSHA256(Encoding.UTF8.GetBytes(secret));
        var expected = B64Url(hmac.ComputeHash(Encoding.UTF8.GetBytes(data)));
        if (!FixedTimeEquals(parts[2], expected)) return null;
        try
        {
            var json = Encoding.UTF8.GetString(B64UrlDecode(parts[1]));
            using var doc = JsonDocument.Parse(json);
            var sub = doc.RootElement.GetProperty("sub").GetString() ?? "";
            var lvl = doc.RootElement.GetProperty("lvl").GetInt32();
            var exp = doc.RootElement.GetProperty("exp").GetInt64();
            var iat = doc.RootElement.GetProperty("iat").GetInt64();
            if (DateTimeOffset.UtcNow.ToUnixTimeSeconds() >= exp) return null; // 过期
            return new JwtPayload(sub, lvl, exp, iat);
        }
        catch
        {
            return null;
        }
    }

    /// <summary>从 Authorization: Bearer 头解析 JWT payload；缺头/无效返回 null</summary>
    public static JwtPayload? FromRequest(HttpRequest req, string secret)
    {
        var h = req.Headers.Authorization.ToString();
        if (string.IsNullOrEmpty(h) || !h.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase)) return null;
        var token = h["Bearer ".Length..].Trim();
        return Verify(secret, token);
    }

    private static bool FixedTimeEquals(string a, string b)
    {
        if (a.Length != b.Length) return false;
        var diff = 0;
        for (var i = 0; i < a.Length; i++) diff |= a[i] ^ b[i];
        return diff == 0;
    }

    private static string B64Url(byte[] data)
        => Convert.ToBase64String(data).TrimEnd('=').Replace('+', '-').Replace('/', '_');

    private static byte[] B64UrlDecode(string s)
    {
        var padded = s.Replace('-', '+').Replace('_', '/');
        padded += new string('=', (4 - padded.Length % 4) % 4);
        return Convert.FromBase64String(padded);
    }
}