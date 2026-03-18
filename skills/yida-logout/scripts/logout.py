#!/usr/bin/env python3
"""
logout.py - 宜搭平台退出登录工具。

用法：
  python3 logout.py

功能：
  清空项目级和全局级的 Cookie 文件内容，使本地登录态失效。
  下次调用 yida-login 时将重新触发扫码登录。
"""

import os
import sys


def find_project_root(start_dir):
    """查找项目根目录（向上查找 README.md 或 .git）"""
    current = start_dir
    while True:
        if ".claude/skills" in current:
            parent = os.path.dirname(current)
            if parent == current:
                return start_dir
            current = parent
            continue

        if os.path.exists(os.path.join(current, "README.md")) or os.path.isdir(
            os.path.join(current, ".git")
        ):
            return current
        parent = os.path.dirname(current)
        if parent == current:
            return start_dir
        current = parent


def get_global_credentials_dir():
    """获取全局凭据目录路径"""
    home = os.path.expanduser("~")
    return os.path.join(home, ".config", "openyida", "credentials")


def clear_cookie_file(file_path, description):
    """清空指定的 Cookie 文件"""
    if not os.path.exists(file_path):
        print(f"  ℹ️  {description} Cookie 文件不存在，跳过。")
        return False

    with open(file_path, "w", encoding="utf-8") as file:
        file.write("")

    print(f"  ✅ 已清空 {description} Cookie：{file_path}")
    return True


def main():
    print("=" * 50)
    print("  yida-logout - 宜搭退出登录工具")
    print("=" * 50)

    cleared = False

    # 1. 清空项目级 Cookie
    script_dir = os.path.dirname(os.path.abspath(__file__))
    project_root = find_project_root(script_dir)
    project_cookie = os.path.join(project_root, ".cache", "cookies.json")
    print(f"\n  项目级 Cookie: {project_cookie}")
    if clear_cookie_file(project_cookie, "项目级"):
        cleared = True

    # 2. 清空全局级 Cookie
    global_credentials_dir = get_global_credentials_dir()
    global_cookie = os.path.join(global_credentials_dir, "cookies.json")
    print(f"  全局级 Cookie: {global_cookie}")
    if clear_cookie_file(global_cookie, "全局级"):
        cleared = True

    if cleared:
        print("\n  ✅ 已清空 Cookie，登录态已失效。")
        print("  下次调用 yida-login 时将重新触发扫码登录。")
    else:
        print("\n  ℹ️  未找到任何 Cookie 文件。")

    print("=" * 50)


if __name__ == "__main__":
    main()
