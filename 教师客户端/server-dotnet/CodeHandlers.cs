// CodeHandlers.cs —— 离线激活码验证（授权码兑换）：POST /api/edu/codes/activate（需 JWT）
// 激活码单向散列存储（防库泄露批量盗用）；兑换后绑定用户 + 提升 level。

namespace EduTeacher.Api;

public record ActivateReq(string? Code);

public static class CodeHandlers
{
    /// <summary>POST /api/edu/codes/activate —— 兑换激活码（需 JWT；可用 → 绑定用户 + 提 level）</summary>
    public static IResult Activate(HttpRequest req, ActivateReq? body, Storage storage, string jwtSecret)
    {
        var jwt = Jwt.FromRequest(req, jwtSecret);
        if (jwt == null) return Error("UNAUTHORIZED", "请先登录（缺少或无效的 JWT）", 401);

        var code = body?.Code?.Trim() ?? "";
        if (string.IsNullOrEmpty(code)) return Error("INVALID_CODE", "缺少激活码", 400);

        var user = storage.FindUserById(jwt.Sub);
        if (user == null) return Error("USER_NOT_FOUND", "用户不存在", 404);

        var hash = Storage.Sha256Hex(code);
        var rec = storage.FindCode(hash);
        if (rec == null) return Error("CODE_INVALID", "激活码无效", 404);

        var now = DateTimeOffset.UtcNow;
        switch (rec.Status)
        {
            case "revoked":
                return Error("CODE_REVOKED", "激活码已被撤销", 403);
            case "used":
                return Error("CODE_USED", "激活码已被使用", 400);
        }
        if (rec.ExpAt < now) return Error("CODE_EXPIRED", "激活码已过期", 400);

        // 兑换：标记 used + 绑定用户 + 提升 level（取高者）+ 继承到期时间（有则取）
        storage.UpdateCode(hash, rec with { Status = "used", UsedBy = user.Id, UsedAt = now });
        var newLevel = Math.Max(user.Level, rec.Level);
        var newExp = user.ExpiresAt == null
            ? rec.ExpAt
            : (rec.ExpAt < user.ExpiresAt.Value ? user.ExpiresAt.Value : rec.ExpAt);
        storage.UpsertUser(user with { Level = newLevel, ExpiresAt = newExp });

        return Results.Json(new { ok = true, level = newLevel, expires_at = newExp.ToString("o") });
    }

    public static IResult Error(string code, string message, int status)
        => Results.Json(new { error = new { code, message } }, statusCode: status);
}