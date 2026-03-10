#!/usr/bin/env python3
"""
logout.py - 宜搭平台退出登录工具。

用法：
  python3 logout.py

功能：
  清空项目根目录下的 .cache/cookies.json 文件内容，使本地登录态失效。
  下次调用 yida-login 时将重新触发扫码登录。
"""

import json
import os
import sys


def find_project_root(start_dir):
    """从 start_dir 向上查找含 README.md 或 .git 的项目根目录。"""
    current = start_dir
    while True:
        if os.path.exists(os.path.join(current, "README.md")) or os.path.isdir(os.path.join(current, ".git")):
            return current
        parent = os.path.dirname(current)
        if parent == current:
            return start_dir
        current = parent


SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
COOKIE_FILE = os.path.join(find_project_root(SCRIPT_DIR), ".cache", "cookies.json")


def main():
    print("=" * 50)
    print("  yida-logout - 宜搭退出登录工具")
    print("=" * 50)
    print(f"\n  Cookie 文件: {COOKIE_FILE}")

    if not os.path.exists(COOKIE_FILE):
        print("\n  ℹ️  Cookie 文件不存在，无需清除。")
        print("=" * 50)
        return

    with open(COOKIE_FILE, "w", encoding="utf-8") as file:
        json.dump([], file)

    print("\n  ✅ 已清空 Cookie，登录态已失效。")
    print("  下次调用 yida-login 时将重新触发扫码登录。")
    print("=" * 50)


if __name__ == "__main__":
    main()
