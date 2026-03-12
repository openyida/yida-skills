import io
import json
import os
import sys
import time
from urllib.parse import urlparse

import inquirer
from PIL import Image
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
                user_id = value[last_underscore + 1:]

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

# ── 二维码 ASCII 渲染 ────────────────────────────────

def render_qrcode_from_image_bytes(image_bytes):
    """
    将二维码图片字节数据转换为 ASCII 字符画并打印到 stderr。

    使用黑白像素映射：黑色像素（二维码模块）→ '██'，白色 → '  '。
    先将图片缩小到适合 terminal 显示的尺寸（约 40 列），再逐像素输出。
    """
    image = Image.open(io.BytesIO(image_bytes)).convert("L")  # 转灰度

    # 缩放到适合 terminal 的尺寸（宽度约 40 个"双字符"块）
    terminal_width = 40
    scale = terminal_width / image.width
    new_width = terminal_width
    new_height = int(image.height * scale * 0.55)  # 0.55 补偿字符高宽比
    image = image.resize((new_width, new_height), Image.LANCZOS)

    pixels = list(image.getdata())
    lines = []
    for row_index in range(new_height):
        row_pixels = pixels[row_index * new_width:(row_index + 1) * new_width]
        # 灰度 < 128 视为黑色（二维码模块），否则为白色（背景）
        row_chars = "".join("  " if pixel > 128 else "██" for pixel in row_pixels)
        lines.append(row_chars)

    border = "─" * (new_width * 2)
    print(f"\n┌{border}┐", file=sys.stderr)
    for line in lines:
        print(f"│{line}│", file=sys.stderr)
    print(f"└{border}┘", file=sys.stderr)


def fetch_qrcode_image_bytes(page):
    """
    从登录页面获取二维码图片字节数据。

    优先尝试截取二维码元素截图；若元素不存在则截取整个页面。
    支持的二维码容器选择器（按优先级）：
      - canvas（钉钉扫码登录常用 canvas 渲染）
      - img[src*="qrcode"]、img[src*="qr"]
      - .qrcode-img、.login-qrcode、.qrcode
    """
    qrcode_selectors = [
        "canvas",
        "img[src*='qrcode']",
        "img[src*='qr']",
        ".qrcode-img",
        ".login-qrcode img",
        ".qrcode img",
        ".qrcode",
    ]
    for selector in qrcode_selectors:
        element = page.query_selector(selector)
        if element:
            return element.screenshot()

    # 兜底：截取整个页面
    return page.screenshot()


# ── 组织选择交互 ──────────────────────────────────────

def select_corp_interactively(page):
    """
    当页面出现组织选择列表（.module-corp-sel-list）时，
    提取所有组织名称，通过 inquirer 交互式列表让用户选择，
    然后点击对应的组织元素完成登录。
    """
    print("\n\n🏢 检测到多个组织，请选择要登录的组织：", file=sys.stderr)

    # 获取所有组织列表项
    corp_items = page.query_selector_all(".module-corp-sel-list li")
    if not corp_items:
        # 兜底：尝试其他常见选择器
        corp_items = page.query_selector_all(".corp-list li, .org-list li, [class*='corp'] li")

    if not corp_items:
        print("  ⚠️  无法获取组织列表，尝试点击第一个可见组织...", file=sys.stderr)
        first_item = page.query_selector(".module-corp-sel-list, .corp-list")
        if first_item:
            first_item.click()
        return

    # 提取组织名称（过滤空文本）
    corp_names = []
    for item in corp_items:
        name = (item.inner_text() or "").strip()
        if name:
            corp_names.append(name)

    if not corp_names:
        print("  ⚠️  组织列表为空，跳过选择。", file=sys.stderr)
        return

    # 用 inquirer 交互式选择
    questions = [
        inquirer.List(
            "corp",
            message="请选择登录组织（↑↓ 选择，Enter 确认）",
            choices=corp_names,
        )
    ]
    answers = inquirer.prompt(questions, render=inquirer.render.console.ConsoleRender())
    if not answers:
        print("  ⚠️  未选择组织，退出。", file=sys.stderr)
        sys.exit(1)

    selected_name = answers["corp"]
    print(f"\n  ✅ 已选择组织：{selected_name}", file=sys.stderr)

    # 点击对应的组织元素
    for item in corp_items:
        if (item.inner_text() or "").strip() == selected_name:
            item.click()
            return

    print(f"  ⚠️  未找到组织「{selected_name}」的点击元素，尝试按索引点击...", file=sys.stderr)
    index = corp_names.index(selected_name)
    corp_items[index].click()


# ── 无头扫码登录（Terminal 模式） ─────────────────────

def interactive_login():
    """
    以 headless 模式运行浏览器，在 terminal 中渲染二维码供用户扫码登录。

    流程：
    1. headless 模式打开登录页
    2. 自动勾选"自动登录"复选框（若存在）
    3. 截取二维码图片，转 ASCII 渲染到 terminal
    4. 轮询检测二维码刷新，自动重新渲染
    5. 若出现组织选择列表，交互式询问用户选择
    6. 等待登录完成，提取 Cookie

    Returns:
        (csrf_token, corp_id, user_id, base_url, cookies) 元组
    """
    print("\n🔐 正在启动无头浏览器，准备渲染二维码...", file=sys.stderr)

    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 1280, "height": 800})
        page = context.new_page()

        print(f"  正在加载登录页面: {LOGIN_URL}", file=sys.stderr)
        page.goto(LOGIN_URL, timeout=60_000)
        page.wait_for_load_state("domcontentloaded")

        # ── 自动勾选"自动登录"复选框 ──────────────────
        auto_login_selectors = [
            "input[type='checkbox']",
            ".auto-login input",
            "[class*='auto'] input[type='checkbox']",
            "label:has-text('自动登录') input",
            "label:has-text('自动登录')",
        ]
        for selector in auto_login_selectors:
            try:
                checkbox = page.query_selector(selector)
                if checkbox:
                    is_checked = checkbox.is_checked() if checkbox.get_attribute("type") == "checkbox" else False
                    if not is_checked:
                        checkbox.click()
                        print("  ✅ 已勾选「自动登录」", file=sys.stderr)
                    else:
                        print("  ✅ 「自动登录」已勾选", file=sys.stderr)
                    break
            except Exception:
                continue

        # ── 渲染二维码 ────────────────────────────────
        print("\n📱 请使用钉钉扫描以下二维码登录：\n", file=sys.stderr)
        try:
            qrcode_bytes = fetch_qrcode_image_bytes(page)
            render_qrcode_from_image_bytes(qrcode_bytes)
            print("\n  ⏳ 等待扫码中（二维码有效期约 3 分钟）...", file=sys.stderr)
        except Exception as render_error:
            print(f"  ⚠️  二维码渲染失败: {render_error}", file=sys.stderr)
            print("  请手动打开浏览器访问登录页面扫码。", file=sys.stderr)

        # ── 轮询：检测二维码刷新 & 组织选择 & 登录完成 ──
        last_qrcode_bytes = qrcode_bytes if 'qrcode_bytes' in dir() else None
        login_completed = False
        corp_selected = False
        deadline = time.time() + 600  # 最长等待 10 分钟

        while time.time() < deadline:
            current_url = page.url

            # 检测是否已跳转到 workPlatform（登录完成）
            if "workPlatform" in current_url or "workbench" in current_url.lower():
                login_completed = True
                break

            # 检测组织选择列表
            corp_list = page.query_selector(".module-corp-sel-list")
            if corp_list and not corp_selected:
                corp_selected = True
                select_corp_interactively(page)
                # 等待跳转
                try:
                    page.wait_for_url("**/workPlatform**", timeout=30_000)
                    login_completed = True
                    break
                except Exception:
                    pass

            # 检测二维码是否刷新（每 5 秒检查一次）
            try:
                new_qrcode_bytes = fetch_qrcode_image_bytes(page)
                if last_qrcode_bytes and new_qrcode_bytes != last_qrcode_bytes:
                    print("\n\n🔄 二维码已刷新，请重新扫码：\n", file=sys.stderr)
                    render_qrcode_from_image_bytes(new_qrcode_bytes)
                    print("\n  ⏳ 等待扫码中...", file=sys.stderr)
                    last_qrcode_bytes = new_qrcode_bytes
            except Exception:
                pass

            time.sleep(5)

        if not login_completed:
            # 最后再检查一次 URL
            if "workPlatform" not in page.url:
                print("\n  ⏰ 登录超时（10分钟），请重试。", file=sys.stderr)
                browser.close()
                sys.exit(1)

        page.wait_for_load_state("networkidle", timeout=15_000)
        print("\n  ✅ 登录成功！", file=sys.stderr)

        # 获取登录后的实际域名（可能从 www 跳转到 ding）
        post_login_parsed = urlparse(page.url)
        base_url = f"{post_login_parsed.scheme}://{post_login_parsed.netloc}"

        cookies = context.cookies()
        browser.close()

    csrf_token, corp_id, user_id = extract_info_from_cookies(cookies)

    if not csrf_token:
        print("  ❌ 登录成功但 Cookie 中无 tianshu_csrf_token，请重试。", file=sys.stderr)
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
