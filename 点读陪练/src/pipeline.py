# -*- coding: utf-8 -*-
"""
端到端管线主编排（一条命令跑完全流程）
用法：python pipeline.py <build_dir> <grade> <unit> <vocab_path>
流程：
  ① 读骨架（人工填 01_skeleton.json）
  ② 补全枚举（complete_layer_enum）
  ③ 扩展层打标（review_tag，扩展句 LLM 生成后接入）
  ⑥ schedule 编排（schedule_build）
  ⑤ 音频批量（调 LoongMediaTools tts_batch，子进程）
  ⑤b 配图批量（调 LoongMediaTools 批量生图工具 v1.2，纯文生图）
  ⑦ 组装打包（assemble）
  ⑧ QA（qa_check）
"""
import json, sys, os, subprocess, re

HERE = os.path.dirname(os.path.abspath(__file__))
TTS_TOOL = r"F:\LoongBa_Git\LoongMediaTools\音频批量生成工具\tts_batch.py"
TTS_VOICE = "en-GB-SoniaNeural"
TTS_RATE = "-15%"
# 批量生图工具 v1.2（LoongMediaTools，文生图）
IMAGE_TOOL_PARENT = r"F:\LoongBa_Git\LoongMediaTools"

def run(cmd, cwd=None):
    print(f'  $ {" ".join(cmd[:2])}...')
    r = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True, encoding='utf-8')
    print(r.stdout.strip().split('\n')[-1] if r.stdout else r.stderr.strip()[:200])
    return r.returncode


def release_name(pkg_path):
    """按内容包 grade/unit 生成发布包名：点读陪练_四年级上Unit01.zip"""
    with open(pkg_path, encoding='utf-8') as f:
        pkg = json.load(f)
    year_map = {'1': '一', '2': '二', '3': '三', '4': '四', '5': '五', '6': '六'}
    term_map = {'A': '上', 'B': '下'}
    grade_raw = str(pkg.get('grade', ''))
    unit_raw = str(pkg.get('unit', ''))
    m = re.match(r'(\d)([AB]?)', grade_raw)
    if m:
        year = year_map.get(m.group(1), m.group(1))
        term = term_map.get(m.group(2), '')
        grade_label = f'{year}年级{term}'
    else:
        grade_label = grade_raw
    um = re.match(r'[Uu]?(\d+)', unit_raw)
    unit_label = f'Unit{um.group(1).zfill(2)}' if um else unit_raw
    return f'点读陪练_{grade_label}{unit_label}.zip'

def main(build_dir, grade, unit, vocab_path):
    g, u = int(grade), int(unit)
    print(f'=== 端到端管线 build {build_dir} (g{g}u{u}) ===')

    # ① 骨架
    sk = os.path.join(build_dir, '01_skeleton.json')
    if not os.path.exists(sk):
        print('① 缺 01_skeleton.json（人工填），退出'); return

    # ② 补全枚举
    complete = os.path.join(build_dir, '02_complete_layer.json')
    run(['python', os.path.join(HERE, 'complete_layer_enum.py'), sk, complete])

    # ③ 扩展层打标
    ext_in = os.path.join(build_dir, '03_extend_input.json')
    ext_tagged = os.path.join(build_dir, '03_extend_tagged.json')
    if os.path.exists(ext_in):
        run(['python', os.path.join(HERE, 'review_tag.py'), vocab_path, str(g), str(u), ext_in, ext_tagged])

    # ⑥ schedule 编排
    pkg = os.path.join(build_dir, 'u01_content_package.json')
    if not os.path.exists(pkg): pkg = os.path.join(build_dir, '04_content_package.json')
    schedule = os.path.join(build_dir, '05_schedule.json')
    run(['python', os.path.join(HERE, 'schedule_build.py'), pkg, schedule])

    # ⑤ 音频批量（从 assets_tts_list.csv 转 JSON 调 tts_batch）
    tts_list = os.path.join(build_dir, 'assets_tts_list.json')
    if os.path.exists(tts_list):
        audio_dir = os.path.join(build_dir, 'sample')
        run(['python', TTS_TOOL, '--engine', 'edge', '--voice', TTS_VOICE,
             f'--rate={TTS_RATE}', '--list', tts_list, '--out', audio_dir])

    # ⑤b 配图批量（内容包 image_prompt → 纯文生图 → assets/images/）
    # 依赖 LoongMediaTools 批量生图工具 v1.2（文生图模式已发布）
    try:
        sys.path.insert(0, IMAGE_TOOL_PARENT)
        from 批量生图工具 import execute_task as _exec_img
        # 生成任务目录（config + jobs，input_image=null 纯文生图）
        img_task = os.path.join(build_dir, 'image_task')
        img_list = os.path.join(HERE, 'build_image_list.py')
        rc = run(['python', img_list, build_dir, img_task])
        if rc == 0 and os.path.exists(os.path.join(img_task, 'jobs.json')):
            from pathlib import Path
            _exec_img(Path(img_task), resume=True, concurrency=None)
    except Exception as e:
        print(f'  ⚠ 配图步骤跳过（缺 tools 或执行失败）: {e}')

    # ⑦ 组装（输出名对齐发布命名：点读陪练_四年级上Unit01.zip）
    out_zip = os.path.join(build_dir, release_name(pkg))
    assets = os.path.join(build_dir, 'assets')
    run(['python', os.path.join(HERE, 'assemble.py'), pkg, schedule, assets, out_zip])

    # ⑧ QA
    qa = os.path.join(build_dir, '07_qa_report.md')
    run(['python', os.path.join(HERE, 'qa_check.py'), pkg, assets, vocab_path, qa])

    print('=== 管线完成 ===')

if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4])
