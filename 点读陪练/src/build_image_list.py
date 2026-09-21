# -*- coding: utf-8 -*-
"""
步骤④b 配图清单生成：遍历内容包所有 {image, image_prompt} 节点
→ 拼统一画风后缀 → 生成 LoongMediaTools 批量生图工具任务目录
   （config.json + jobs.json，input_image=null 走纯文生图）。

用法：python build_image_list.py <build_dir> <out_task_dir> [--size 1:1]
  <build_dir>   单元构建目录（读 u01_content_package.json / 04_content_package.json）
  <out_task_dir> 任务目录输出位置（推荐 build_dir/image_task/，执行后产物直落 assets/images/）

对接工具：LoongMediaTools/批量生图工具 v1.2（execute_task(task_dir) 或 batch_cli.py run <名>）
"""
import json, sys, os, argparse

# 统一画风后缀（规格文档步骤④，拼接到每个 prompt 末尾）
STYLE_SUFFIX = "扁平卡通暖色调、圆角白底卡片、简洁可爱、画面无任何文字、原创儿童插画风格"


def walk_images(node, out):
    """递归收集 {image, image_prompt} 节点"""
    if isinstance(node, dict):
        if node.get('image') and node.get('image_prompt'):
            out.append((node['image'], node['image_prompt']))
        for v in node.values():
            walk_images(v, out)
    elif isinstance(node, list):
        for it in node:
            walk_images(it, out)


def build_image_list(build_dir, out_task_dir, size="1:1"):
    pkg_path = os.path.join(build_dir, 'u01_content_package.json')
    if not os.path.exists(pkg_path):
        pkg_path = os.path.join(build_dir, '04_content_package.json')
    if not os.path.exists(pkg_path):
        print(f'❌ 缺内容包: {pkg_path}')
        sys.exit(1)

    with open(pkg_path, encoding='utf-8') as f:
        pkg = json.load(f)
    unit = pkg.get('unit', 'uXX')

    items = []
    walk_images(pkg, items)
    items.sort(key=lambda x: x[0])
    if not items:
        print(f'❌ 内容包无任何 image+image_prompt 节点: {pkg_path}')
        sys.exit(1)

    # 去重（同名 image 只保留首个 prompt）
    seen, uniq = set(), []
    for name, prompt in items:
        if name not in seen:
            seen.add(name)
            uniq.append((name, prompt))

    # 任务目录
    os.makedirs(out_task_dir, exist_ok=True)
    task_name = f'{unit}_images'

    images_dir = os.path.join(build_dir, 'assets', 'images')
    os.makedirs(images_dir, exist_ok=True)

    jobs = []
    for name, prompt in uniq:
        jobs.append({
            "id": name[:-4],                     # 去 .png 作 job id
            "prompt": f"{prompt}，{STYLE_SUFFIX}",
            "input_image": None,                  # 纯文生图
            "output_path": os.path.join(images_dir, name),  # 绝对路径直落资产目录
            "params": {"size": size},
        })

    config = {
        "task_name": task_name,
        "provider": "sensenova",
        "model": "sensenova-u1.5-lite",
        "size": size,
        "concurrency": "auto",
    }

    with open(os.path.join(out_task_dir, 'config.json'), 'w', encoding='utf-8') as f:
        json.dump(config, f, ensure_ascii=False, indent=2)
    with open(os.path.join(out_task_dir, 'jobs.json'), 'w', encoding='utf-8') as f:
        json.dump({"jobs": jobs}, f, ensure_ascii=False, indent=2)

    print(f'✅ 配图清单: {len(jobs)} 张 -> {out_task_dir}')
    print(f'   任务名: {task_name}   输出目录: {images_dir}')
    return out_task_dir


if __name__ == '__main__':
    ap = argparse.ArgumentParser(description='生成批量生图任务目录（config+jobs）')
    ap.add_argument('build_dir', help='单元构建目录（含内容包 JSON）')
    ap.add_argument('out_task_dir', help='任务目录输出位置')
    ap.add_argument('--size', default='1:1', help='图片尺寸写法（默认 1:1）')
    args = ap.parse_args()
    build_image_list(args.build_dir, args.out_task_dir, args.size)