# -*- coding: utf-8 -*-
"""
步骤⑦ 组装脚本
输入：内容包 JSON + schedule + assets（图/音）
输出：小程序包 zip（JSON+assets）+ 打印版（HTML/PDF）
"""
import json, sys, os, zipfile

def assemble(pkg_path, schedule_path, assets_dir, out_zip):
    # 读内容包 + schedule
    with open(pkg_path, encoding='utf-8') as f:
        pkg = json.load(f)
    with open(schedule_path, encoding='utf-8') as f:
        sched = json.load(f)

    unit = pkg.get('unit', 'unknown')
    print(f'组装 {unit} ...')

    # 打 zip
    with zipfile.ZipFile(out_zip, 'w', zipfile.ZIP_DEFLATED) as z:
        z.write(pkg_path, 'content_package.json')
        z.write(schedule_path, 'schedule.json')
        # assets 目录全部打进去
        for root, dirs, files in os.walk(assets_dir):
            for fn in files:
                full = os.path.join(root, fn)
                arc = os.path.relpath(full, os.path.dirname(assets_dir))
                z.write(full, arc)
    size_kb = os.path.getsize(out_zip) / 1024
    print(f'  小程序包 -> {out_zip} ({size_kb:.0f} KB)')

    # 打印版：列出 print_version 字段（实际渲染走模板，此处标记）
    pv = pkg.get('print_version', {})
    print(f'  打印版五件套: {list(pv.keys())}')
    print(f'  schedule: {len(sched.get("days", []))} 天')

if __name__ == '__main__':
    pkg_path = sys.argv[1]
    schedule_path = sys.argv[2]
    assets_dir = sys.argv[3]
    out_zip = sys.argv[4]
    assemble(pkg_path, schedule_path, assets_dir, out_zip)
