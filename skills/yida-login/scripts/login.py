#!/usr/bin/env python3
"""
login.py - 宜搭平台登录态管理脚本。

用法：
  python3 login.py

流程：
1. 检查本地缓存（Cookie + base_url），直接用 base_url/myApp 无头验证
2. 若无效或不存在，打开浏览器扫码登录
3. 登录成功后跳转 /myApp 获取 _csrf_token、loginUser、corpId
4. 以 JSON 格式输出到 stdout，供其他脚本通过管道解析

登录地址从项目根目录的 config.json 中读取（loginUrl 字段）
"""

import json
import os
import sys
import time
from urllib.parse import urlparse

from playwright.sync_api import sync_playwright

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))


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

PROJECT_ROOT = find_project_root(SCRIPT_DIR)
CONFIG_FILE = os.path.join(PROJECT_ROOT, "config.json")
COOKIE_FILE = os.path.join(PROJECT_ROOT, ".cache", "cookies.json")


def load_config():
    """从项目根目录的 config.json 读取配置。"""
    if not os.path.exists(CONFIG_FILE):
        print(f"  ⚠️  config.json 不存在: {CONFIG_FILE}，使用默认值", file=sys.stderr)
        return {"loginUrl": "https://www.aliwork.com/workPlatform", "defaultBaseUrl": "https://www.aliwork.com"}
    with open(CONFIG_FILE, "r", encoding="utf-8") as file:
        return json.load(file)


_config = load_config()
LOGIN_URL = _config["loginUrl"]
DEFAULT_BASE_URL = _config["defaultBaseUrl"]

# ── Cookie 持久化 ─────────────────────────────────────


def save_login_cache(cookies, base_url=None):
    """将 Cookie 和 base_url 一起保存到本地缓存文件。"""
    cache_dir = os.path.dirname(COOKIE_FILE)
    if not os.path.exists(cache_dir):
        os.makedirs(cache_dir, exist_ok=True)
    cache = {"cookies": cookies, "base_url": base_url}
    with open(COOKIE_FILE, "w", encoding="utf-8") as file:
        json.dump(cache, file, ensure_ascii=False, indent=2)
    print(f"  Cookie 已保存到 {COOKIE_FILE}", file=sys.stderr)


def load_login_cache():
    """
    从本地文件加载缓存，返回 (cookies, base_url)。

    兼容旧格式（纯 Cookie 数组）和新格式（含 base_url 的字典）。
    不存在或内容为空则返回 (None, None)。
    """
    if not os.path.exists(COOKIE_FILE):
        return None, None
    with open(COOKIE_FILE, "r", encoding="utf-8") as file:
        content = file.read().strip()
    if not content:
        return None, None
    try:
        data = json.loads(content)
    except (json.JSONDecodeError, ValueError):
        return None, None

    # 新格式：{"cookies": [...], "base_url": "..."}
    if isinstance(data, dict) and "cookies" in data:
        cookies = data["cookies"] if data["cookies"] else None
        base_url = data.get("base_url")
        return cookies, base_url

    # 旧格式兼容：纯 Cookie 数组
    if isinstance(data, list) and data:
        return data, None

    return None, None


# ── 从 /myApp 页面提取信息 ────────────────────────────


def fetch_page_info(page, target_url):
    """
    跳转到指定的 /myApp URL，提取 _csrf_token、loginUser、corpId 和 base_url。

    Args:
        page: Playwright Page 对象
        target_url: 要跳转的完整 URL（如 https://abcd.aliwork.com/myApp）

    Returns:
        (csrf_token, login_user, corp_id, base_url) 元组，获取失败的字段返回 None
    """
    print(f"  📄 跳转到 {target_url} 获取 csrf_token、loginUser 和 corpId...", file=sys.stderr)

    try:
        page.goto(target_url, wait_until="networkidle", timeout=600_000)
    except Exception as error:
        print(f"  ⚠️  访问超时，尝试继续提取: {error}", file=sys.stderr)

    # 检查是否被重定向到登录页
    current_url = page.url
    parsed_current = urlparse(current_url)
    if "login" in parsed_current.netloc.lower() or "login" in parsed_current.path.lower():
        print("  ❌ 被重定向到登录页，Cookie 无效。", file=sys.stderr)
        return None, None, None, None

    # 提取 csrf_token
    csrf_token = None
    for _ in range(10):
        try:
            csrf_token = page.evaluate("""
                () => {
                    var input = document.querySelector("input[name='_csrf_token']");
                    return input ? input.value : null;
                }
            """)
            if csrf_token:
                break
        except Exception:
            pass
        time.sleep(1)

    if csrf_token:
        print(f"  ✅ csrf_token 获取成功: {csrf_token[:16]}...", file=sys.stderr)
    else:
        print("  ⚠️  未找到 csrf_token hidden input", file=sys.stderr)

    # 提取 loginUser
    login_user = None
    try:
        login_user = page.evaluate("() => window.loginUser || null")
    except Exception:
        pass

    if login_user:
        print(f"  ✅ loginUser 获取成功: {login_user.get('userName', '?')} ({login_user.get('userId', '?')})", file=sys.stderr)
    else:
        print("  ⚠️  未找到 window.loginUser", file=sys.stderr)

    # 提取 corpId
    corp_id = None
    try:
        corp_id = page.evaluate(
            "() => window.pageConfig && window.pageConfig.corpId ? window.pageConfig.corpId : null"
        )
    except Exception:
        pass

    if corp_id:
        print(f"  ✅ corpId 获取成功: {corp_id}", file=sys.stderr)
    else:
        print("  ⚠️  未找到 window.pageConfig.corpId", file=sys.stderr)

    # 提取 base_url（跳转后的实际域名）
    final_parsed = urlparse(page.url)
    base_url = f"{final_parsed.scheme}://{final_parsed.netloc}" if final_parsed.netloc else None

    if base_url:
        print(f"  ✅ base_url 获取成功: {base_url}", file=sys.stderr)
    else:
        print("  ⚠️  未能获取 base_url", file=sys.stderr)

    return csrf_token, login_user, corp_id, base_url


# ── 无头验证 ──────────────────────────────────────────


def try_headless_login(saved_cookies, saved_base_url):
    """
    使用已有 Cookie 无头验证登录态。

    关键改进：直接用保存的 base_url 跳转 /myApp，不再重走 LOGIN_URL，
    避免域名跳转导致 Cookie 域不匹配的问题。

    Returns:
        成功返回 (csrf_token, login_user, corp_id, base_url, cookies)，失败返回 None
    """
    # 确定验证用的基础 URL
    verify_base = saved_base_url or DEFAULT_BASE_URL
    verify_url = f"{verify_base.rstrip('/')}/myApp"

    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True)
        context = browser.new_context()
        context.add_cookies(saved_cookies)
        page = context.new_page()

        csrf_token, login_user, corp_id, base_url = fetch_page_info(page, verify_url)

        if csrf_token:
            print("  ✅ Cookie 有效！", file=sys.stderr)
            cookies = context.cookies()
            final_base = base_url or verify_base
            save_login_cache(cookies, final_base)
            browser.close()
            return csrf_token, login_user, corp_id, final_base, cookies

        # 如果用保存的 base_url 失败了，再尝试默认域名（可能 base_url 过期）
        if saved_base_url and saved_base_url != DEFAULT_BASE_URL:
            print("  🔄 尝试使用默认域名验证...", file=sys.stderr)
            fallback_url = f"{DEFAULT_BASE_URL}/myApp"
            csrf_token, login_user, corp_id, base_url = fetch_page_info(page, fallback_url)

            if csrf_token:
                print("  ✅ Cookie 有效（通过默认域名）！", file=sys.stderr)
                cookies = context.cookies()
                final_base = base_url or DEFAULT_BASE_URL
                save_login_cache(cookies, final_base)
                browser.close()
                return csrf_token, login_user, corp_id, final_base, cookies

        print("  ❌ Cookie 已失效，需要重新登录。", file=sys.stderr)
        browser.close()
        return None


# ── 有头扫码登录 ──────────────────────────────────────


def interactive_login():
    """
    打开有头浏览器让用户扫码登录。

    登录成功后在同一浏览器上下文中跳转 /myApp 获取信息，
    确保所有域（www/ding）的 Cookie 都被保存。

    Returns:
        (csrf_token, login_user, corp_id, base_url, cookies) 元组
    """
    print("\n🔐 正在打开浏览器，请扫码登录...", file=sys.stderr)
    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=False)
        context = browser.new_context()
        page = context.new_page()
        page.goto(LOGIN_URL, timeout=120_000)

        print("  等待登录完成（最长等待 10 分钟）...", file=sys.stderr)
        try:
            page.wait_for_url("**/workPlatform**", timeout=600_000)
        except Exception:
            print("  ⏰ 登录超时（10分钟），请重试。", file=sys.stderr)
            browser.close()
            sys.exit(1)

        page.wait_for_load_state("networkidle")
        print("  ✅ 登录成功！", file=sys.stderr)

        # 获取登录后的实际域名（可能从 www 跳转到 ding）
        post_login_parsed = urlparse(page.url)
        post_login_base = f"{post_login_parsed.scheme}://{post_login_parsed.netloc}"
        my_app_url = f"{post_login_base}/myApp"

        # 在同一上下文中跳转 /myApp 获取信息
        csrf_token, login_user, corp_id, base_url = fetch_page_info(page, my_app_url)

        # 保存所有域的 Cookie
        cookies = context.cookies()
        final_base = base_url or post_login_base
        save_login_cache(cookies, final_base)
        browser.close()

    if not csrf_token:
        print("  ❌ 登录成功但无法获取 csrf_token，请重试。", file=sys.stderr)
        sys.exit(1)

    return csrf_token, login_user, corp_id, final_base, cookies


# ── 核心入口 ──────────────────────────────────────────


def ensure_login():
    """
    确保拥有有效的登录态。

    Returns:
        (csrf_token, login_user, corp_id, base_url, cookies) 元组
    """
    saved_cookies, saved_base_url = load_login_cache()

    if saved_cookies:
        print("🔍 检测到本地 Cookie，尝试无头模式验证...", file=sys.stderr)
        result = try_headless_login(saved_cookies, saved_base_url)
        if result:
            return result

    return interactive_login()


# ── CLI 入口 ──────────────────────────────────────────


def main():
    print("=" * 50, file=sys.stderr)
    print("  yida-login - 宜搭登录态管理工具", file=sys.stderr)
    print("=" * 50, file=sys.stderr)
    print(f"\n  登录地址: {LOGIN_URL}", file=sys.stderr)

    csrf_token, login_user, corp_id, base_url, cookies = ensure_login()

    print(f"\n  _csrf_token: {csrf_token}", file=sys.stderr)
    if login_user:
        print(f"  loginUser: {login_user.get('userName', '?')} ({login_user.get('userId', '?')})", file=sys.stderr)
    if corp_id:
        print(f"  corpId: {corp_id}", file=sys.stderr)
    if base_url:
        print(f"  base_url: {base_url}", file=sys.stderr)
    print("=" * 50, file=sys.stderr)

    output = {
        "csrf_token": csrf_token,
        "login_user": login_user,
        "corp_id": corp_id,
        "base_url": base_url,
        "cookies": cookies,
    }
    print(json.dumps(output, ensure_ascii=False))


if __name__ == "__main__":
    main()