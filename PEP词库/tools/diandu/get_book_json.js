// ============================================================================
// 人教点读（diandu.mypep.cn）book.json 批量获取脚本
//
// 用法：在人教点读小程序页面（浏览器 DevTools 控制台）执行本脚本。
//       前置条件：页面已加载 namibox_jssdk（window.namibox_jssdk 可用）。
//
// 产物：为每个 book_id 下载 {book_id}_{书名}.json（与 diandu_audio.py save 命名一致，
//       如 1212001302245_英语（PEP）_三年级_下册.json），供 diandu_audio.py 使用：
//       python diandu_audio.py 下载素材 {book_id}_{书名}.json --out <素材目录>
// ============================================================================

// ===== 完整批量下载：全部英语（PEP）教材 book.json =====
const bookIds = [
  '1212001101247', // 一年级上册
  '1212001102247', // 一年级下册
  '1212001201247', // 二年级上册
  '1212001202247', // 二年级下册
  '1212001301245', // 三年级上册
  '1212001302245', // 三年级下册
  '1212001401255', // 四年级上册
  '1212001402255', // 四年级下册
  '1212001501255', // 五年级上册（新课标）
  '1212001502255', // 五年级下册（新课标）
  '1212001601265', // 六年级上册（新课标）
  // 六年级下册（1212001602145）：无新课标——新版教材尚未出版，2027 寒假再检查（暂不获取）
];
(async () => {
  const fmt = d => {
    const p = n => String(n).padStart(2, '0');
    return String(d.getFullYear()) + p(d.getMonth() + 1) + p(d.getDate())
         + p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds());
  };
  const sha1 = async s => {
    const buf = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(s));
    return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
  };
  // 文件名安全化（对齐 diandu_common.clean_name：去 HTML/控制字符、Windows 非法字符替换、空白 → _）
  const cleanName = s => {
    if (!s) return '';
    let t = String(s).replace(/<[^>]*>/g, '').replace(/[\x00-\x1F\x7F]+/g, ' ');
    t = t.replace(/"/g, '')
         .replace(/[<>]/g, c => (c === '<' ? '《' : '》'))
         .replace(/:/g, '：').replace(/\?/g, '？').replace(/\*/g, '·')
         .replace(/[/\\|]/g, '-');
    t = t.replace(/\s+/g, '_').replace(/^_+|_+$/g, '');
    return t.slice(0, 80);
  };
  for (const bid of bookIds) {
    try {
      const ts = fmt(new Date());
      const sign = await sha1(`ak=pep_click&book_id=${bid}&fixed_key=bac1359d7feb996b396dff38ab77rf7a&timestamp=${ts}`);
      const r = await fetch('https://diandu.mypep.cn/book/getBookUrl.json', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ book_id: bid, sign, timestamp: ts, ak: 'pep_click' })
      });
      const j = await r.json();
      if (!j.result) { console.log('✗', bid, j); continue; }
      const d = await window.namibox_jssdk.loadBookJson(j.result);
      const bname = ((d.bookinfo || {}).bookname || '').trim();
      const fname = bname ? `${bid}_${cleanName(bname)}.json` : `${bid}_book.json`;
      const b = new Blob([JSON.stringify(d)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(b);
      a.download = fname;
      a.click();
      console.log('✓', bid, bname, '→', fname);
      await new Promise(x => setTimeout(x, 2500));
    } catch (e) { console.log('✗', bid, e.message); }
  }
})();
