#!/usr/bin/env python3
"""质检工具：检测重绘效果异常（变化过小/对话框无字等）

功能：
1. 文件大小对比（重绘图 vs 原图，差异<20%可能没变化）
2. 图片相似度检测（SSIM，>0.85 可能没变化）
3. 生成 HTML 对比报告（人工复核）

用法：
  python quality_check.py --grade 二年级 --vol 上册
  python quality_check.py --all
"""
import argparse
import json
import os
import sys
from pathlib import Path

import cv2
import numpy as np

MAT = Path(r"F:\_教材素材\人教版（PEP）（主编：吴欣）")


def compute_ssim(img1: np.ndarray, img2: np.ndarray) -> float:
    """计算两图 SSIM（简化版，无需 skimage）"""
    C1 = (0.01 * 255) ** 2
    C2 = (0.03 * 255) ** 2
    
    img1 = img1.astype(np.float64)
    img2 = img2.astype(np.float64)
    
    mu1 = cv2.GaussianBlur(img1, (11, 11), 1.5)
    mu2 = cv2.GaussianBlur(img2, (11, 11), 1.5)
    
    mu1_sq = mu1 ** 2
    mu2_sq = mu2 ** 2
    mu1_mu2 = mu1 * mu2
    
    sigma1_sq = cv2.GaussianBlur(img1 ** 2, (11, 11), 1.5) - mu1_sq
    sigma2_sq = cv2.GaussianBlur(img2 ** 2, (11, 11), 1.5) - mu2_sq
    sigma12 = cv2.GaussianBlur(img1 * img2, (11, 11), 1.5) - mu1_mu2
    
    ssim_map = ((2 * mu1_mu2 + C1) * (2 * sigma12 + C2)) / \
               ((mu1_sq + mu2_sq + C1) * (sigma1_sq + sigma2_sq + C2))
    
    return float(ssim_map.mean())


def check_page(original: Path, redrawn: Path) -> dict:
    """检测单页重绘质量"""
    result = {
        "page": original.stem,
        "original_size_kb": original.stat().st_size / 1024,
        "redrawn_size_kb": redrawn.stat().st_size / 1024,
        "size_ratio": 0,
        "ssim": 0,
        "issues": [],
    }
    
    # 文件大小对比
    if result["original_size_kb"] > 0:
        result["size_ratio"] = result["redrawn_size_kb"] / result["original_size_kb"]
        if result["size_ratio"] < 1.2:  # 重绘后大小增加不到20%
            result["issues"].append("大小变化过小")
    
    # SSIM 检测
    try:
        img_orig = cv2.imread(str(original), cv2.IMREAD_GRAYSCALE)
        img_redr = cv2.imread(str(redrawn), cv2.IMREAD_GRAYSCALE)
        if img_orig is not None and img_redr is not None:
            # 缩放到相同尺寸
            h = min(img_orig.shape[0], img_redr.shape[0])
            w = min(img_orig.shape[1], img_redr.shape[1])
            img_orig = cv2.resize(img_orig, (w, h))
            img_redr = cv2.resize(img_redr, (w, h))
            
            result["ssim"] = compute_ssim(img_orig, img_redr)
            if result["ssim"] > 0.85:
                result["issues"].append(f"相似度过高({result['ssim']:.2f})")
    except Exception as e:
        result["issues"].append(f"SSIM检测失败: {e}")
    
    return result


def generate_html_report(results: list, output_path: Path):
    """生成 HTML 对比报告"""
    html = """<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>重绘质检报告</title>
    <style>
        body { font-family: Arial; margin: 20px; }
        .page { border: 1px solid #ccc; margin: 10px 0; padding: 10px; }
        .issue { color: red; font-weight: bold; }
        .ok { color: green; }
        .images { display: flex; gap: 20px; }
        .images img { max-width: 400px; max-height: 300px; }
        .stats { background: #f5f5f5; padding: 10px; margin: 10px 0; }
    </style>
</head>
<body>
    <h1>重绘质检报告</h1>
    <div class="stats">
"""
    # 统计
    total = len(results)
    issues = [r for r in results if r["issues"]]
    html += f"    <p>总计: {total} 页 | 异常: {len(issues)} 页 | 正常: {total - len(issues)} 页</p>\n"
    html += "    </div>\n"
    
    # 异常页优先显示
    for r in sorted(results, key=lambda x: len(x["issues"]), reverse=True):
        status = "❌" if r["issues"] else "✅"
        html += f"""
    <div class="page">
        <h3>{status} {r['page']}</h3>
        <p>原图: {r['original_size_kb']:.0f}KB | 重绘: {r['redrawn_size_kb']:.0f}KB | 
           大小比: {r['size_ratio']:.2f} | SSIM: {r['ssim']:.3f}</p>
"""
        if r["issues"]:
            for issue in r["issues"]:
                html += f'        <p class="issue">⚠️ {issue}</p>\n'
        else:
            html += '        <p class="ok">✅ 正常</p>\n'
        
        html += """        <div class="images">
"""
        # 原图和重绘图对比
        orig_path = MAT / r["grade"] / r["vol"] / "_图片素材" / f"{r['page']}.png"
        redr_path = MAT / r["grade"] / r["vol"] / "_重绘图片素材" / f"{r['page']}.png"
        html += f'            <div><b>原图</b><br><img src="file:///{orig_path}"></div>\n'
        html += f'            <div><b>重绘</b><br><img src="file:///{redr_path}"></div>\n'
        html += "        </div>\n    </div>\n"
    
    html += """
</body>
</html>"""
    
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as f:
        f.write(html)
    print(f"✅ 报告已生成: {output_path}")


def main():
    ap = argparse.ArgumentParser(description="重绘质检工具")
    ap.add_argument("--grade", help="年级（如 二年级）")
    ap.add_argument("--vol", help="册（上册/下册）")
    ap.add_argument("--all", action="store_true", help="检测所有已重绘册次")
    args = ap.parse_args()
    
    results = []
    
    if args.all or (args.grade and args.vol):
        # 检测指定或所有册次
        grades = [args.grade] if args.grade else ["一年级","二年级","三年级","四年级","五年级","六年级"]
        vols = [args.vol] if args.vol else ["上册","下册"]
        
        for grade in grades:
            for vol in vols:
                orig_dir = MAT / grade / vol / "_图片素材"
                redr_dir = MAT / grade / vol / "_重绘图片素材"
                
                if not redr_dir.exists():
                    continue
                
                print(f"\n📚 {grade}{vol}:")
                for redr_file in sorted(redr_dir.glob("*.png")):
                    orig_file = orig_dir / redr_file.name
                    if orig_file.exists():
                        r = check_page(orig_file, redr_file)
                        r["grade"] = grade
                        r["vol"] = vol
                        results.append(r)
                        
                        status = "❌" if r["issues"] else "✅"
                        print(f"  {status} {r['page']}: 大小比={r['size_ratio']:.2f} SSIM={r['ssim']:.3f}")
                        if r["issues"]:
                            for issue in r["issues"]:
                                print(f"      ⚠️ {issue}")
    else:
        print("请指定 --grade 和 --vol，或使用 --all")
        return
    
    # 生成报告
    if results:
        report_path = Path(r"F:\LoongBa_Git\LoongEduTools\RedTools\重绘工具\quality_report.html")
        generate_html_report(results, report_path)


if __name__ == "__main__":
    main()
