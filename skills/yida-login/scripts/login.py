import json
import os
import sys
from urllib.parse import urlparse

from playwright.sync_api import sync_playwright

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))


def find_project_root(start_dir):
    """从 start_dir 向上查找含 README.md 或 .git 的项目根目录。"""
    current = start_dir
    while True:
        if os.path.exists(os.path.join(current, "README.md")) or os.path.isdir(
            os.path.join(current, ".git")
        ):
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


# ── 仅检查登录态（不触发登录）────────────────────────────


def check_login_only():
    """
    仅检查登录态，不触发登录。

    用于 AI Agent 判断是否需要登录。
    Returns:
        返回登录信息字典，包含 can_auto_use 字段供 AI 判断
    """
    saved_cookies, saved_base_url = load_login_cache()

    if not saved_cookies:
        return {
            "status": "not_logged_in",
            "can_auto_use": False,
            "message": "本地无 Cookie 缓存，需要扫码登录",
        }

    csrf_token, corp_id, user_id = extract_info_from_cookies(saved_cookies)

    if not csrf_token:
        return {
            "status": "not_logged_in",
            "can_auto_use": False,
            "message": "Cookie 中无 tianshu_csrf_token，需要重新登录",
        }

    base_url = saved_base_url or DEFAULT_BASE_URL
    return {
        "status": "ok",
        "can_auto_use": True,
        "csrf_token": csrf_token,
        "corp_id": corp_id,
        "user_id": user_id,
        "base_url": base_url,
        "cookies": saved_cookies,
        "message": f"✅ 已有有效登录态，可直接使用\n  组织: {corp_id}\n  用户: {user_id}\n  域名: {base_url}",
    }


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


# ── 终端 ASCII 二维码登录 ─────────────────────────────


def qrcode_login():
    """在终端显示二维码，供用户扫码登录。"""
    print("\n📱 正在获取登录二维码...", file=sys.stderr)

    import time
    import os

    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True)
        context = browser.new_context()
        page = context.new_page()

        qr_url = [None]
        qr_response_body = [None]

        def handle_response(response):
            if qr_url[0]:
                return
            if "generate_qrcode" in response.url:
                try:
                    qr_response_body[0] = response.body()
                except:
                    pass

        page.on("response", handle_response)

        dingtalk_login_url = "https://login.dingtalk.com/oauth2/challenge.htm?redirect_uri=https%3A%2F%2Fwww.aliwork.com%2Fdingtalk_sso_call_back%3Fcontinue%3Dhttps%253A%252F%252Fwww.aliwork.com%252FworkPlatform&response_type=code&client_id=suite9xvlxxerybljwheo&scope=openid+corpid&lang=zh_CN"
        page.goto(dingtalk_login_url, timeout=120_000)
        page.wait_for_selector(".module-qrcode-code canvas", timeout=15000)
        time.sleep(2)

        # 解析响应获取二维码 URL
        if qr_response_body[0]:
            try:
                import json

                data = json.loads(qr_response_body[0])
                if data.get("success") and data.get("result"):
                    qr_url[0] = data["result"]
            except:
                pass

        if not qr_url[0]:
            print("  ❌ 无法获取二维码", file=sys.stderr)
            browser.close()
            sys.exit(1)

        print(f"  ✅ 获取成功: {qr_url[0][:40]}...\n", file=sys.stderr)

        # 生成 PNG
        import qrcode

        qr = qrcode.QRCode(version=1, box_size=10, border=1)
        qr.add_data(qr_url[0])
        qr.make(fit=True)

        qr_img = qr.make_image(fill_color="black", back_color="white")
        qr_path = "/tmp/yida_login_qr.png"
        qr_img.save(qr_path)

        # 渲染到终端
        render_terminal_qr(qr_path)

        print("\n" + "─" * 40, file=sys.stderr)
        print("  请扫码登录（最长 10 分钟）...", file=sys.stderr)

        start_time = time.time()
        while time.time() - start_time < 600:
            if "workPlatform" in page.url:
                break
            time.sleep(2)

        if "workPlatform" not in page.url:
            print("  ⏰ 登录超时", file=sys.stderr)
            browser.close()
            sys.exit(1)

        page.wait_for_load_state("networkidle")
        print("  ✅ 登录成功！", file=sys.stderr)

        post_login_parsed = urlparse(page.url)
        base_url = f"{post_login_parsed.scheme}://{post_login_parsed.netloc}"
        cookies = context.cookies()
        browser.close()

    csrf_token, corp_id, user_id = extract_info_from_cookies(cookies)
    if not csrf_token:
        print("  ❌ 登录成功但无 csrf_token", file=sys.stderr)
        sys.exit(1)

    save_login_cache(cookies, base_url)
    return csrf_token, corp_id, user_id, base_url, cookies


def detect_terminal_type():
    """检测终端类型。"""
    term = os.environ.get("TERM", "")
    term_program = os.environ.get("TERM_PROGRAM", "")

    if term_program in ("iTerm.app", "iTerm2"):
        return "iterm2"
    elif "kitty" in term:
        return "kitty"
    elif "wezterm" in term.lower():
        return "wezterm"
    elif "xterm" in term:
        return "sixel"
    else:
        return "unknown"


def render_terminal_qr(qr_path):
    """根据终端类型渲染二维码。"""
    term_type = detect_terminal_type()

    try:
        if term_type == "iterm2":
            import base64

            with open(qr_path, "rb") as f:
                img_data = base64.b64encode(f.read()).decode()
            print(
                f"\033]1337;File=inline=1;width=20%;preserveAspectRatio=1:{img_data}\a\n"
            )
            return
        elif term_type == "kitty":
            import subprocess

            subprocess.run(["kitty", "+launch", "--stdin", "cat", qr_path], check=False)
            return
        elif term_type == "wezterm":
            import base64

            with open(qr_path, "rb") as f:
                img_data = base64.b64encode(f.read()).decode()
            print(
                f"\033]1337;File=inline=1;width=20%;preserveAspectRatio=1:{img_data}\a\n"
            )
            return
    except Exception:
        pass

    try:
        import subprocess

        subprocess.run(["imgcat", qr_path], check=False, capture_output=True)
        return
    except:
        pass

    print("  ℹ️ 终端不支持图片，降级到 ASCII", file=sys.stderr)
    render_ascii_qr(qr_path)


def render_ascii_qr(qr_path):
    """降级方案：ASCII 渲染。"""
    try:
        from PIL import Image
        import numpy as np

        img = Image.open(qr_path).convert("L")
        img = img.resize((21, 21))
        arr = np.array(img)
        arr = arr > 128

        print(file=sys.stderr)
        for row in arr:
            line = "".join("██" if cell else "  " for cell in row)
            print(line, file=sys.stderr)
        print(file=sys.stderr)
    except Exception as e:
        print(f"  ⚠️ ASCII 渲染失败: {e}", file=sys.stderr)


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
    if "--check-only" in sys.argv:
        result = check_login_only()
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return
    elif "--refresh-csrf" in sys.argv:
        print("=" * 50, file=sys.stderr)
        print("  yida-login - csrf_token 刷新模式", file=sys.stderr)
        print("=" * 50, file=sys.stderr)

        csrf_token, corp_id, user_id, base_url, cookies = refresh_csrf_token()
    elif "--qrcode" in sys.argv:
        print("=" * 50, file=sys.stderr)
        print("  yida-login - 终端二维码登录", file=sys.stderr)
        print("=" * 50, file=sys.stderr)
        print(f"\n  登录地址: {LOGIN_URL}", file=sys.stderr)

        csrf_token, corp_id, user_id, base_url, cookies = qrcode_login()
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
