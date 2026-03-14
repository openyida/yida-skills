import json
import os
import sys
from urllib.parse import urlparse

from playwright.sync_api import sync_playwright

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))


def find_project_root(start_dir):
    current = start_dir
    while True:
        has_readme = os.path.exists(os.path.join(current, "README.md"))
        has_git = os.path.isdir(os.path.join(current, ".git"))
        is_submodule = current.endswith(".claude/skills")

        if (has_readme or has_git) and not is_submodule:
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
        return {
            "loginUrl": "https://www.aliwork.com/workPlatform",
            "defaultBaseUrl": "https://www.aliwork.com",
        }
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


# ── 从 Cookie 列表中提取登录信息 ──────────────────────


def extract_info_from_cookies(cookies):
    """
    从 Cookie 列表中直接提取 csrf_token、corp_id、user_id。

    提取规则：
    - csrf_token：name="tianshu_csrf_token" 的 cookie value
    - corp_id + user_id：name="tianshu_corp_user" 的 cookie value，
      格式为 "{corpId}_{userId}"，按最后一个 "_" 分隔
      示例：value="ding9a0954b4f9d9d40ef5bf40eda33b7ba0_19552253733782"
            → corp_id="ding9a0954b4f9d9d40ef5bf40eda33b7ba0", user_id="19552253733782"

    Args:
        cookies: Cookie 字典列表（每个元素含 name、value 等字段）

    Returns:
        (csrf_token, corp_id, user_id) 元组，未找到的字段返回 None
    """
    csrf_token = None
    corp_id = None
    user_id = None

    for cookie in cookies:
        if cookie.get("name") == "tianshu_csrf_token":
            csrf_token = cookie.get("value")
        elif cookie.get("name") == "tianshu_corp_user":
            value = cookie.get("value", "")
            # 按最后一个 "_" 分隔，corpId 本身可能包含 "_"
            last_underscore = value.rfind("_")
            if last_underscore > 0:
                corp_id = value[:last_underscore]
                user_id = value[last_underscore + 1 :]

    return csrf_token, corp_id, user_id


# ── 验证本地缓存的 Cookie ─────────────────────────────


def try_cached_login(saved_cookies, saved_base_url):
    """
    尝试直接从本地缓存的 Cookie 中提取登录信息。

    不再需要无头浏览器访问 /myApp，直接检查 Cookie 中是否存在
    tianshu_csrf_token，存在即视为有效。

    Returns:
        成功返回 (csrf_token, corp_id, user_id, base_url, cookies)，失败返回 None
    """
    csrf_token, corp_id, user_id = extract_info_from_cookies(saved_cookies)

    if not csrf_token:
        print("  ❌ Cookie 中无 tianshu_csrf_token，需要重新登录。", file=sys.stderr)
        return None

    base_url = saved_base_url or DEFAULT_BASE_URL
    print(f"  ✅ Cookie 有效！csrf_token: {csrf_token[:16]}...", file=sys.stderr)
    if corp_id:
        print(f"  ✅ corpId: {corp_id}", file=sys.stderr)
    if user_id:
        print(f"  ✅ userId: {user_id}", file=sys.stderr)

    return csrf_token, corp_id, user_id, base_url, saved_cookies


# ── 有头扫码登录 ──────────────────────────────────────


def interactive_login():
    """
    打开有头浏览器让用户扫码登录。

    登录成功后直接从 Cookie 中提取 csrf_token、corpId、userId，
    无需跳转 /myApp。

    Returns:
        (csrf_token, corp_id, user_id, base_url, cookies) 元组
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
        base_url = f"{post_login_parsed.scheme}://{post_login_parsed.netloc}"

        # 直接从 Cookie 中提取所需信息，无需跳转 /myApp
        cookies = context.cookies()
        browser.close()

    csrf_token, corp_id, user_id = extract_info_from_cookies(cookies)

    if not csrf_token:
        print(
            "  ❌ 登录成功但 Cookie 中无 tianshu_csrf_token，请重试。", file=sys.stderr
        )
        sys.exit(1)

    print(f"  ✅ csrf_token: {csrf_token[:16]}...", file=sys.stderr)
    if corp_id:
        print(f"  ✅ corpId: {corp_id}", file=sys.stderr)
    if user_id:
        print(f"  ✅ userId: {user_id}", file=sys.stderr)

    save_login_cache(cookies, base_url)
    return csrf_token, corp_id, user_id, base_url, cookies


# ── 核心入口 ──────────────────────────────────────────


def ensure_login():
    """
    确保拥有有效的登录态。

    优先从本地缓存 Cookie 中直接提取，无需无头浏览器验证。
    若 Cookie 中无 tianshu_csrf_token，则触发扫码登录。

    Returns:
        (csrf_token, corp_id, user_id, base_url, cookies) 元组
    """
    saved_cookies, saved_base_url = load_login_cache()

    if saved_cookies:
        print("🔍 检测到本地 Cookie，尝试直接提取登录信息...", file=sys.stderr)
        result = try_cached_login(saved_cookies, saved_base_url)
        if result:
            return result

    return interactive_login()


# ── 刷新 csrf_token（TIANSHU_000030 场景） ────────────


def refresh_csrf_token():
    """
    从本地缓存 Cookie 中重新提取 csrf_token。

    适用于接口响应体 errorCode 为 "TIANSHU_000030"（csrf 校验失败）的场景：
    Cookie 仍有效，但 csrf_token 已过期，无需重新扫码登录。
    直接从 Cookie 中读取最新的 tianshu_csrf_token 值。

    Returns:
        成功返回 (csrf_token, corp_id, user_id, base_url, cookies)，失败退出进程
    """
    print("🔄 csrf_token 已过期，正在从 Cookie 重新提取...", file=sys.stderr)

    saved_cookies, saved_base_url = load_login_cache()
    if not saved_cookies:
        print("  ❌ 本地无有效 Cookie，无法刷新，需要重新登录。", file=sys.stderr)
        sys.exit(1)

    csrf_token, corp_id, user_id = extract_info_from_cookies(saved_cookies)

    if not csrf_token:
        print("  ❌ Cookie 中无 tianshu_csrf_token，需要重新登录。", file=sys.stderr)
        sys.exit(1)

    base_url = saved_base_url or DEFAULT_BASE_URL
    print(f"  ✅ csrf_token 提取成功: {csrf_token[:16]}...", file=sys.stderr)
    return csrf_token, corp_id, user_id, base_url, saved_cookies


# ── CLI 入口 ──────────────────────────────────────────


def main():
    # 支持 --refresh-csrf 模式：仅重新提取 csrf_token，不重新扫码登录
    if "--refresh-csrf" in sys.argv:
        print("=" * 50, file=sys.stderr)
        print("  yida-login - csrf_token 刷新模式", file=sys.stderr)
        print("=" * 50, file=sys.stderr)

        csrf_token, corp_id, user_id, base_url, cookies = refresh_csrf_token()
    else:
        print("=" * 50, file=sys.stderr)
        print("  yida-login - 宜搭登录态管理工具", file=sys.stderr)
        print("=" * 50, file=sys.stderr)
        print(f"\n  登录地址: {LOGIN_URL}", file=sys.stderr)

        csrf_token, corp_id, user_id, base_url, cookies = ensure_login()

    print(f"\n  _csrf_token: {csrf_token}", file=sys.stderr)
    if corp_id:
        print(f"  corpId: {corp_id}", file=sys.stderr)
    if user_id:
        print(f"  userId: {user_id}", file=sys.stderr)
    if base_url:
        print(f"  base_url: {base_url}", file=sys.stderr)
    print("=" * 50, file=sys.stderr)

    output = {
        "csrf_token": csrf_token,
        "corp_id": corp_id,
        "user_id": user_id,
        "base_url": base_url,
        "cookies": cookies,
    }
    print(json.dumps(output, ensure_ascii=False))


if __name__ == "__main__":
    main()
