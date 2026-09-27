// Storage.cs —— 极简 JSON 文件存储（零依赖：System.Text.Json 内置）
// data/ 目录（.gitignore 已忽略）；内存字典 + 互斥锁 + 变更即落盘（单进程足够）。
using System.Security.Cryptography;
using System.Text.Json;

namespace EduTeacher.Api;

/// <summary>教师用户（手机号唯一；wechat_openid 可空 = 未绑定）</summary>
public sealed record User(
    string Id,
    string Phone,
    string? WechatOpenid,
    int Level,
    DateTimeOffset CreatedAt,
    DateTimeOffset? ExpiresAt);

/// <summary>短信验证码记录（存散列；exp 15min；last_sent 60s 重发间隔）</summary>
public sealed record SmsRecord(string CodeHash, DateTimeOffset ExpAt, DateTimeOffset LastSentAt);

/// <summary>离线激活码记录（存散列；status: available / used / revoked）</summary>
public sealed record CodeRecord(
    string CodeHash,
    int Level,
    string Batch,
    DateTimeOffset ExpAt,
    string Status,
    string? UsedBy,
    DateTimeOffset? UsedAt);

/// <summary>JSON 文件存储：内存态 + 互斥锁 + 落盘（单进程足够）</summary>
public sealed class Storage
{
    private readonly string _dir;
    private readonly object _lock = new();
    private Dictionary<string, User> _users = new();
    private Dictionary<string, SmsRecord> _sms = new();
    private Dictionary<string, CodeRecord> _codes = new();

    public Storage(string dataDir)
    {
        _dir = dataDir;
        Directory.CreateDirectory(_dir);
        _users = Load<Dictionary<string, User>>("users.json");
        _sms = Load<Dictionary<string, SmsRecord>>("sms.json");
        _codes = Load<Dictionary<string, CodeRecord>>("codes.json");
    }

    private T Load<T>(string file) where T : new()
    {
        try
        {
            var path = Path.Combine(_dir, file);
            if (!File.Exists(path)) return new T();
            var json = File.ReadAllText(path);
            return JsonSerializer.Deserialize<T>(json) ?? new T();
        }
        catch
        {
            return new T(); // 损坏回退空（不 panic，记录可重建）
        }
    }

    private void Save<T>(string file, T value)
    {
        var path = Path.Combine(_dir, file);
        File.WriteAllText(path, JsonSerializer.Serialize(value, new JsonSerializerOptions { WriteIndented = true }));
    }

    // ── 用户 ──
    public User? FindUserByPhone(string phone)
    {
        lock (_lock) { return _users.Values.FirstOrDefault(u => u.Phone == phone); }
    }

    public User? FindUserById(string id)
    {
        lock (_lock) { return _users.TryGetValue(id, out var u) ? u : null; }
    }

    public void UpsertUser(User user)
    {
        lock (_lock)
        {
            _users[user.Id] = user;
            Save("users.json", _users);
        }
    }

    // ── 短信验证码 ──
    public SmsRecord? GetSms(string phone)
    {
        lock (_lock) { return _sms.TryGetValue(phone, out var v) ? v : null; }
    }

    public void SetSms(string phone, SmsRecord record)
    {
        lock (_lock)
        {
            _sms[phone] = record;
            Save("sms.json", _sms);
        }
    }

    /// <summary>验证成功后删除验证码（一次性消费）</summary>
    public void RemoveSms(string phone)
    {
        lock (_lock)
        {
            _sms.Remove(phone);
            Save("sms.json", _sms);
        }
    }

    // ── 激活码 ──
    public CodeRecord? FindCode(string codeHash)
    {
        lock (_lock) { return _codes.Values.FirstOrDefault(c => c.CodeHash == codeHash); }
    }

    public void UpdateCode(string codeHash, CodeRecord record)
    {
        lock (_lock)
        {
            _codes[codeHash] = record;
            Save("codes.json", _codes);
        }
    }

    /// <summary>当前可用（available）激活码数量（seed 就绪提示用）</summary>
    public int AvailableCodeCount()
    {
        lock (_lock) { return _codes.Values.Count(c => c.Status == "available"); }
    }

    /// <summary>激活码 seed 初始化：codes.json 为空时从种子散列入库（离线签发模拟）</summary>
    public void SeedCodesIfEmpty(IEnumerable<(string code, int level, string batch, DateTimeOffset exp)> seeds)
    {
        lock (_lock)
        {
            if (_codes.Count > 0) return;
            foreach (var (code, level, batch, exp) in seeds)
            {
                var hash = Sha256Hex(code);
                _codes[hash] = new CodeRecord(hash, level, batch, exp, "available", null, null);
            }
            Save("codes.json", _codes);
        }
    }

    public static string Sha256Hex(string input)
        => Convert.ToHexString(SHA256.HashData(System.Text.Encoding.UTF8.GetBytes(input))).ToLowerInvariant();
}