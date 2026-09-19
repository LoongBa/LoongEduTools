/* 华容道角色库：7 个 Q 版三国头像（程序化 SVG 零素材）
 * 每个角色 draw() 返回以 (0,0) 为中心的 <svg viewBox="-50 -50 100 100">
 * 滑块渲染时撑满容器，SVG 自适应缩放（preserveAspectRatio=meet）。
 * Chrome 61 兼容：经典脚本、无模板字符串依赖外部、无 fetch/eval。
 */
window.CHARACTERS = (function () {
  'use strict';

  function svgWrap(inner, tall) {
    // 高头饰角色（冕冠/雉翎/红缨）用 tall viewBox，防止顶部被 SVG 画布裁切
    var vb = tall ? '-50 -70 100 120' : '-50 -50 100 100';
    return '<svg viewBox="' + vb + '" xmlns="http://www.w3.org/2000/svg">' + inner + '</svg>';
  }
  function c(cx, cy, r, fill) { return '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="' + fill + '"/>'; }
  function e(cx, cy, rx, ry, fill) { return '<ellipse cx="' + cx + '" cy="' + cy + '" rx="' + rx + '" ry="' + ry + '" fill="' + fill + '"/>'; }
  function rc(x, y, w, h, r, fill) { return '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="' + r + '" fill="' + fill + '"/>'; }
  function p(d, fill) { return '<path d="' + d + '" fill="' + fill + '"/>'; }

  /* ---------- 通用部件 ---------- */
  function head(skin) {
    return c(0, -16, 30, skin) + c(-29, -13, 7, skin) + c(29, -13, 7, skin);
  }
  // 圆亮眼（Q 版大眼 + 高光）
  function roundEye(ox, oy) {
    return c(ox, oy, 4.2, '#333') + c(ox - 1.4, oy - 1.4, 1.5, '#fff');
  }
  // 细长眼（威严/丹凤）：一条上挑弧
  function slantEye(ox, oy, up) {
    var dy = up ? -1.5 : 1.5;
    return p('M' + (ox - 6) + ',' + (oy + 2) + ' Q' + ox + ',' + (oy - 3 + dy) + ' ' + (ox + 6) + ',' + (oy + 1) + ' L' + (ox + 6) + ',' + (oy + 3) + ' Q' + ox + ',' + (oy + 1 + dy) + ' ' + (ox - 6) + ',' + (oy + 4) + ' Z', '#333');
  }
  // 粗眉（上挑或平）
  function brow(ox, oy, ang, col, w) {
    var ww = w || 3.2;
    if (ang > 0) { // 上挑（左低右高）
      return p('M' + (ox - 7) + ',' + (oy + 2) + ' Q' + ox + ',' + (oy - 1) + ' ' + (ox + 7) + ',' + (oy - 3) + ' L' + (ox + 7) + ',' + (oy - 3 + ww) + ' Q' + ox + ',' + (oy - 1 + ww) + ' ' + (ox - 7) + ',' + (oy + 2 + ww) + ' Z', col);
    }
    return p('M' + (ox - 7) + ',' + (oy - 1) + ' Q' + ox + ',' + (oy - 2.5) + ' ' + (ox + 7) + ',' + (oy - 1) + ' L' + (ox + 7) + ',' + (oy - 1 + ww) + ' Q' + ox + ',' + (oy - 2.5 + ww) + ' ' + (ox - 7) + ',' + (oy - 1 + ww) + ' Z', col);
  }
  // 腮红
  function blush() {
    return e(-18, -8, 4.6, 2.8, 'rgba(240,90,90,0.35)') + e(18, -8, 4.6, 2.8, 'rgba(240,90,90,0.35)');
  }
  // 微笑嘴
  function smile(ox, oy, w, col) {
    var ww = w || 6;
    var st = col || '#7a4a2a';
    return p('M' + (ox - ww) + ',' + oy + ' Q' + ox + ',' + (oy + 3.2) + ' ' + (ox + ww) + ',' + oy + ' L' + (ox + ww) + ',' + (oy + 1.6) + ' Q' + ox + ',' + (oy + 4.8) + ' ' + (ox - ww) + ',' + (oy + 1.6) + ' Z', st);
  }
  // 抿嘴（威严直线）
  function mouthLine(ox, oy, w, col) {
    var ww = w || 5.5;
    return rc(ox - ww, oy - 1.2, ww * 2, 2.4, 1.2, col || '#7a4a2a');
  }
  // 身体袍子（肩部圆 + 梯形袍）
  function body(robe, collar) {
    var col = collar || '#f6efe0';
    return p('M-27,10 Q0,2 27,10 L34,48 L-34,48 Z', robe) +
      p('M-9,11 L0,20 L9,11 Z', col) +
      p('M-24,14 Q-20,10 -14,11', 'rgba(0,0,0,0.08)');
  }
  // 小兵身体（无领 V 简化）
  function bodySoldier(robe) {
    return p('M-25,10 Q0,3 25,10 L31,48 L-31,48 Z', robe) +
      p('M-8,11 L0,18 L8,11 Z', '#efe6d4');
  }

  /* ---------- 头饰 ---------- */
  // 曹操：黑色冕冠 + 金色镶边 + 前后垂旒
  function caoCrown() {
    return p('M-17,-50 L17,-50 L19,-42 L-19,-42 Z', '#2b2b33') +
      rc(-19, -42, 38, 4, 2, '#e8b84b') +
      p('M-19,-42 L-23,-34 L-19,-34 Z', '#2b2b33') +
      p('M19,-42 L23,-34 L19,-34 Z', '#2b2b33') +
      p('M-19,-44 L-23,-50 L-20,-51 Z', '#2b2b33') +
      p('M19,-44 L23,-50 L20,-51 Z', '#2b2b33') +
      // 前旒（可见长流苏）
      p('M-15,-49 L-16,-60 L-13.5,-60 L-13,-49 Z', '#e8b84b') +
      p('M15,-49 L16,-60 L13.5,-60 L13,-49 Z', '#e8b84b') +
      // 后旒（半透明垂条，前倾可见）
      p('M-9,-48 L-9,-58 L-7,-58 L-7,-48 Z', 'rgba(232,184,75,0.75)') +
      p('M9,-48 L9,-58 L7,-58 L7,-48 Z', 'rgba(232,184,75,0.75)') +
      c(0, -45.5, 3, '#e8b84b');
  }
  // 关羽：绿头巾（包髻 + 长巾垂肩）
  function guanTurban() {
    return p('M-29,-14 Q-30,-46 0,-46 Q30,-46 29,-14 Q30,-30 15,-33 Q0,-36 -15,-33 Q-30,-30 -29,-14 Z', '#3a9d5d') +
      p('M0,-46 Q5,-50 6,-46 L2,-46 Z', '#2f7d4a') +
      p('M-20,-18 Q-8,-28 8,-28 Q20,-22 22,-14', 'none', '') +
      e(-21, -20, 4, 6, '#2f7d4a') + e(21, -20, 4, 6, '#2f7d4a');
  }
  // 张飞：黑头巾 + 结
  function zhangTurban() {
    return p('M-29,-12 Q-30,-46 0,-46 Q30,-46 29,-12 Q14,-28 0,-28 Q-14,-28 -29,-12 Z', '#33333a') +
      p('M-4,-46 Q0,-49 4,-46 Q0,-42 -4,-46 Z', '#44444c') +
      p('M14,-30 Q20,-27 23,-21 Q17,-21 13,-25 Z', '#44444c');
  }
  // 赵云：亮银盔 + 红缨 + 护耳
  function zhaoHelmet() {
    return p('M-31,-18 Q-33,-48 0,-48 Q33,-48 31,-18 Q20,-27 0,-27 Q-20,-27 -31,-18 Z', '#d7e0ea') +
      rc(-31, -21, 62, 5, 2.5, '#9fb3c6') +
      p('M-3,-48 L-6,-62 L0,-56 L6,-62 L3,-48 Z', '#d84343') +   // 放大红缨（三叉）
      c(0, -63, 3.4, '#d84343') +
      p('M-30,-20 Q-36,-22 -36,-10 L-30,-12 Z', '#9fb3c6') +
      p('M30,-20 Q36,-22 36,-10 L30,-12 Z', '#9fb3c6');
  }
  // 马超：紫金冠（高冠 + 金边 + 顶珠 + 雉翎）
  function maCrown() {
    return p('M-13,-46 L13,-46 L11,-58 L-11,-58 Z', '#5b3fa8') +
      rc(-13, -50, 26, 4, 2, '#e8b84b') +
      c(0, -62, 4.2, '#e8b84b') +                                // 放大金珠
      c(0, -62, 2, '#ffe9a8') +                                  // 金珠高光
      p('M-11,-58 Q-21,-64 -25,-56 Q-19,-55 -15,-54 Z', '#e8b84b') +  // 左雉翎
      p('M11,-58 Q21,-64 25,-56 Q19,-55 15,-54 Z', '#e8b84b') +      // 右雉翎
      p('M-12,-46 L-16,-52 L-9,-50 Z', '#e8b84b') +
      p('M12,-46 L16,-52 L9,-50 Z', '#e8b84b');
  }
  // 黄忠：黄头巾（顶结 + 巾沿）
  function huangTurban() {
    return p('M-29,-13 Q-30,-46 0,-46 Q30,-46 29,-13 Q16,-28 0,-28 Q-16,-28 -29,-13 Z', '#e8b84b') +
      p('M-2,-46 Q0,-49 4,-45 Q0,-41 -2,-46 Z', '#d19e33') +
      rc(-30, -22, 60, 5, 2.5, '#d19e33');
  }
  // 小兵：蓝头巾（简化兵巾；蓝区别于曹操红袍）
  function soldierTurban() {
    return p('M-29,-12 Q-30,-46 0,-46 Q30,-46 29,-12 Q14,-30 0,-30 Q-14,-30 -29,-12 Z', '#3a6ea8') +
      p('M-3,-46 Q0,-49 3,-46 Q0,-42 -3,-46 Z', '#2c5684');
  }

  /* ---------- 胡须 ---------- */
  // 曹操长须（分叉垂胸）
  function caoBeard() {
    return p('M-5,2 Q-9,14 -8,26 Q-4,24 -2,20 Q0,26 2,20 Q4,24 8,26 Q9,14 5,2 Q0,6 -5,2 Z', '#3a3a42');
  }
  // 关羽美髯（宽长垂胸）
  function guanBeard() {
    return p('M-9,2 Q-13,18 -12,36 Q-6,34 -3,28 Q0,34 3,28 Q6,34 12,36 Q13,18 9,2 Q0,8 -9,2 Z', '#2f2f36');
  }
  // 张飞络腮胡（下巴包围）
  function zhangBeard() {
    return p('M-27,-6 Q-30,2 -26,12 Q-20,20 -12,23 Q0,26 12,23 Q20,20 26,12 Q30,2 27,-6 Q22,6 16,10 Q8,15 0,15 Q-8,15 -16,10 Q-22,6 -27,-6 Z', '#3a3a42') +
      p('M0,15 Q-3,20 0,24 Q3,20 0,15 Z', '#3a3a42');
  }
  // 黄忠白须（山羊胡 + 八字）
  function huangBeard() {
    return p('M-7,1 Q-10,12 -9,22 Q-5,20 -3,16 Q0,20 3,16 Q5,20 9,22 Q10,12 7,1 Q0,5 -7,1 Z', '#f2f2f2') +
      p('M-11,0 L-5,2', 'none', '') ;
  }

  /* =============== 角色 =============== */
  function caoCao() {
    var s = '';
    s += body('#a03a32', '#e8c98a');            // 暗红袍 + 金领
    s += head('#f2d0a9');                        // 白净脸
    s += blush();
    s += caoCrown();                             // 黑冕金冠
    s += brow(-7, -25, 0, '#3a3a42');            // 细眉
    s += brow(7, -25, 0, '#3a3a42');
    s += slantEye(-7, -19);                      // 细长威严眼
    s += slantEye(7, -19);
    s += p('M-2.5,-11 L2.5,-11 L0,-8.5 Z', '#e0b184'); // 鼻
    s += mouthLine(0, -4, 5, '#8a5a30');         // 抿嘴
    s += p('M-8,0 L8,0 L4,2 L-4,2 Z', '#3a3a42'); // 八字小胡
    s += caoBeard();                             // 长须
    return svgWrap(s, true);                     // 冕冠高，用 tall viewBox
  }

  function guanYu() {
    var s = '';
    s += body('#2f7d4a', '#e8c98a');             // 绿袍 + 金领
    s += head('#d98d6e');                        // 枣红脸
    s += blush();
    s += guanTurban();                           // 绿头巾
    s += brow(-7, -26, 1, '#1f5c36', 3.6);       // 卧蚕眉（绿浓）
    s += brow(7, -26, 0, '#1f5c36', 3.6);
    s += slantEye(-7, -19, -1);                  // 丹凤眼
    s += slantEye(7, -19, -1);
    s += p('M-2.5,-11 L2.5,-11 L0,-8.5 Z', '#b56a4a'); // 鼻
    s += mouthLine(0, -4, 5.5, '#6a3a22');
    s += guanBeard();                            // 美髯
    return svgWrap(s);
  }

  function zhangFei() {
    var s = '';
    s += body('#5a4636', '#c9b99a');             // 深棕袍 + 米领（亮于纯黑，提辨识）
    s += head('#9c6a48');                        // 黑脸（提亮：深褐，保留"豹头环眼"特征）
    s += zhangTurban();                          // 黑头巾
    s += brow(-7, -26, 1, '#1f1f24', 4.2);       // 浓眉上挑（更粗更黑）
    s += brow(7, -26, 0, '#1f1f24', 4.2);
    s += c(-7, -18, 5.2, '#fffdf8');             // 豹眼（更大更白）
    s += c(7, -18, 5.2, '#fffdf8');
    s += c(-7, -18, 2.6, '#111');
    s += c(7, -18, 2.6, '#111');
    s += p('M-2.5,-10 L2.5,-10 L0,-7.5 Z', '#5a3c24'); // 鼻
    s += mouthLine(0, -4, 4.2, '#3a2a1a');
    s += zhangBeard();                           // 络腮胡（更黑）
    return svgWrap(s);
  }

  function zhaoYun() {
    var s = '';
    s += body('#cfd8e6', '#f6efe0');             // 银白袍 + 白领
    s += head('#f7dcc0');                        // 白脸
    s += blush();
    s += zhaoHelmet();                           // 银盔红缨
    s += brow(-7, -25, 1, '#5a4636', 3);         // 剑眉
    s += brow(7, -25, 0, '#5a4636', 3);
    s += roundEye(-7, -18);                      // 明亮圆眼
    s += roundEye(7, -18);
    s += p('M-2.5,-11 L2.5,-11 L0,-8.5 Z', '#d9ac7e');
    s += smile(0, -3, 4.5, '#8a5a30');           // 微笑
    return svgWrap(s, true);                     // 银盔红缨高，用 tall viewBox
  }

  function maChao() {
    var s = '';
    s += body('#5b3fa8', '#e8c98a');             // 紫袍 + 金领
    s += head('#f7dcc0');                        // 白脸
    s += blush();
    s += maCrown();                              // 紫金冠
    s += brow(-7, -25, 0, '#3a3a42', 2.8);       // 细剑眉
    s += brow(7, -25, 0, '#3a3a42', 2.8);
    s += slantEye(-7, -19, 1);                   // 俊秀上挑眼
    s += slantEye(7, -19, 1);
    s += p('M-2.5,-11 L2.5,-11 L0,-8.5 Z', '#d9ac7e');
    s += smile(0, -3.5, 5, '#7a4a2a');
    return svgWrap(s, true);                     // 紫金冠雉翎高，用 tall viewBox
  }

  function huangZhong() {
    var s = '';
    s += body('#c97a2e', '#f6efe0');             // 橙袍 + 米领
    s += head('#e8b887');                        // 黄褐脸
    s += huangTurban();                          // 黄头巾
    s += p('M-9,-26 Q-4,-30 0,-27', 'none', ''); // 白眉（弧线用细条）
    s += brow(-7, -26, 0, '#f2f2f2', 3.4);       // 白粗眉
    s += brow(7, -26, 0, '#f2f2f2', 3.4);
    s += p('M-7,-19 Q-4,-17 0,-19 Q4,-17 7,-19', 'none', ''); // 慈祥弯眼
    s += e(-7, -18, 4, 2, '#5a4636');
    s += e(7, -18, 4, 2, '#5a4636');
    s += p('M-2.5,-11 L2.5,-11 L0,-8.5 Z', '#c98f5a');
    s += mouthLine(0, -4, 4.5, '#8a5a30');
    s += huangBeard();                           // 白山羊胡
    return svgWrap(s);
  }

  function soldier() {
    var s = '';
    s += bodySoldier('#8a6a3a');                 // 土黄兵袍（暖色，区别于蓝巾）
    s += head('#f2d0a9');
    s += blush();
    s += soldierTurban();                        // 蓝头巾
    s += brow(-7, -25, 0, '#5a4636', 2.8);
    s += brow(7, -25, 0, '#5a4636', 2.8);
    s += roundEye(-7, -18);
    s += roundEye(7, -18);
    s += p('M-2.5,-11 L2.5,-11 L0,-8.5 Z', '#e0b184');
    s += smile(0, -3, 5.5, '#7a4a2a');           // 憨笑
    return svgWrap(s);
  }

  return {
    caoCao: caoCao,      // 曹操 2×2
    guanYu: guanYu,      // 关羽 2×1（横）
    zhangFei: zhangFei,  // 张飞 1×2
    zhaoYun: zhaoYun,    // 赵云 1×2
    maChao: maChao,      // 马超 1×2
    huangZhong: huangZhong, // 黄忠 1×2
    soldier: soldier     // 小兵 1×1 ×4
  };
})();
