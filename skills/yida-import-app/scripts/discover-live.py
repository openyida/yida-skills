import json
import sys
from html import escape
from pathlib import Path
from urllib.parse import urlencode

from playwright.sync_api import sync_playwright


def find_project_root(start_dir: Path) -> Path:
    current = start_dir
    while True:
        if (current / "README.md").exists() or (current / ".git").exists():
            return current
        if current.parent == current:
            return start_dir
        current = current.parent


PROJECT_ROOT = find_project_root(Path(__file__).resolve().parent)
COOKIE_FILE = PROJECT_ROOT / ".cache" / "cookies.json"
DEFAULT_BASE_URL = "https://www.aliwork.com"


def load_cookie_data():
    if not COOKIE_FILE.exists():
        raise RuntimeError(f"未找到 cookies 缓存: {COOKIE_FILE}")
    data = json.loads(COOKIE_FILE.read_text(encoding="utf-8"))
    if isinstance(data, list):
        return {"cookies": data, "base_url": DEFAULT_BASE_URL}
    return data


def normalize_title(value, fallback=""):
    if not value:
        return fallback
    if isinstance(value, str):
        return value
    return value.get("zh_CN") or value.get("en_US") or fallback


def browser_fetch_json(page, url):
    payload = page.evaluate(
        """
        async (targetUrl) => {
          const response = await fetch(targetUrl, {
            credentials: 'include',
            headers: {
              'x-requested-with': 'XMLHttpRequest'
            }
          });
          const text = await response.text();
          return {
            status: response.status,
            url: response.url,
            text
          };
        }
        """,
        url,
    )
    if payload["status"] >= 400:
        raise RuntimeError(f"请求失败: {payload['status']} {payload['url']}")
    return json.loads(payload["text"])


def goto_with_fallback(page, url, timeout=90000):
    # Some entry pages keep long-running requests alive, so networkidle can hang.
    try:
        page.goto(url, wait_until="domcontentloaded", timeout=timeout)
        page.wait_for_load_state("load", timeout=min(timeout, 30000))
    except Exception:
        page.goto(url, wait_until="commit", timeout=timeout)
    page.wait_for_timeout(2000)


def fetch_app_list(page):
    apps = []
    page_index = 1
    page_size = 100

    while True:
        params = urlencode(
            {
                "_api": "App.getList",
                "_mock": "false",
                "_csrf_token": page.evaluate("() => (window.g_config && window.g_config._csrf_token) || ''"),
                "_locale_time_zone_offset": 28800000,
                "pageIndex": page_index,
                "pageSize": page_size,
                "orderField": "data_gmt_create",
                "appStatus": "",
                "isAdmin": "true",
                "creator": "",
                "key": "",
                "_stamp": page.evaluate("() => Date.now()"),
            }
        )
        payload = browser_fetch_json(page, f"/query/app/getAppList.json?{params}")
        content = (payload or {}).get("content", {})
        data = content.get("data", [])
        apps.extend(data)
        if not data or len(data) < page_size:
            break
        page_index += 1

    return apps


def ensure_app_exists(apps, app_type):
    for app in apps:
        if app.get("appType") == app_type:
            return {
                "appType": app_type,
                "appName": normalize_title(app.get("appName"), app_type),
                "description": normalize_title(app.get("description"), ""),
                "systemLink": app.get("systemLink", ""),
                "corpId": app.get("corpId", ""),
            }
    raise RuntimeError(f"在当前组织的我的应用中未找到 {app_type}")


def classify_nav_item(item):
    form_type = (item.get("formType") or "").lower()
    display_type = (item.get("displayType") or "").lower()
    if form_type in {"display", "custom"} or display_type == "display":
        return "custom"
    return "form"


def fetch_navigation(page, app_type):
    params = urlencode(
        {
            "_api": "Nav.queryList",
            "_mock": "false",
            "_csrf_token": page.evaluate("() => (window.g_config && window.g_config._csrf_token) || ''"),
            "_locale_time_zone_offset": 28800000,
            "_stamp": page.evaluate("() => Date.now()"),
        }
    )
    payload = browser_fetch_json(
        page,
        f"/dingtalk/web/{app_type}/query/formnav/getFormNavigationListByOrder.json?{params}",
    )
    result = []
    app_root = page.url.split("/admin")[0]
    for item in (payload or {}).get("content", []):
        if item.get("navType") != "PAGE":
            continue
        form_uuid = item.get("formUuid") or item.get("relateFormUuid")
        if not form_uuid:
            continue
        page_type = classify_nav_item(item)
        result.append(
            {
                "name": normalize_title(item.get("title"), form_uuid),
                "title": normalize_title(item.get("title"), form_uuid),
                "type": page_type,
                "formType": item.get("formType", ""),
                "formUuid": form_uuid,
                "hidden": item.get("hidden") == "y",
                "url": f"{app_root}/{'custom' if page_type == 'custom' else 'submission'}/{form_uuid}",
                "discoveryNote": "browser-formnav",
            }
        )
    return result


def render_selector_html(apps):
    cards = []
    for app in apps:
        app_type = escape(app.get("appType", ""))
        app_name = escape(normalize_title(app.get("appName"), app_type))
        description = escape(normalize_title(app.get("description"), "暂无描述") or "暂无描述")
        cards.append(
            f"""
            <button class="app-card" data-app-type="{app_type}" data-app-name="{app_name}">
              <span class="app-name">{app_name}</span>
              <span class="app-type">{app_type}</span>
              <span class="app-desc">{description}</span>
            </button>
            """
        )

    return f"""
    <!doctype html>
    <html lang="zh-CN">
    <head>
      <meta charset="utf-8" />
      <title>选择宜搭应用</title>
      <style>
        :root {{
          --bg: #f5efe6;
          --panel: #fffaf4;
          --text: #1e293b;
          --muted: #6b7280;
          --line: #e7d9c8;
          --accent: #af4d1f;
          --accent-soft: #f3d8c6;
        }}
        * {{ box-sizing: border-box; }}
        body {{
          margin: 0;
          font-family: "Microsoft YaHei", "PingFang SC", sans-serif;
          background:
            radial-gradient(circle at top left, #f7d9bf 0, transparent 35%),
            linear-gradient(180deg, var(--bg), #efe5d6);
          color: var(--text);
        }}
        .shell {{
          max-width: 1180px;
          margin: 0 auto;
          padding: 32px 24px 40px;
        }}
        .hero {{
          background: rgba(255,255,255,0.72);
          backdrop-filter: blur(8px);
          border: 1px solid rgba(175,77,31,0.15);
          border-radius: 24px;
          padding: 28px;
          box-shadow: 0 18px 48px rgba(94, 58, 22, 0.08);
        }}
        h1 {{
          margin: 0 0 10px;
          font-size: 34px;
        }}
        .desc {{
          margin: 0;
          color: var(--muted);
          line-height: 1.7;
        }}
        .toolbar {{
          display: flex;
          gap: 12px;
          margin-top: 22px;
          flex-wrap: wrap;
        }}
        #search {{
          flex: 1 1 320px;
          min-height: 48px;
          border-radius: 14px;
          border: 1px solid var(--line);
          background: #fff;
          padding: 0 16px;
          font-size: 15px;
        }}
        .hint {{
          align-self: center;
          color: var(--muted);
          font-size: 14px;
        }}
        .grid {{
          margin-top: 24px;
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
          gap: 16px;
        }}
        .app-card {{
          text-align: left;
          border: 1px solid var(--line);
          background: var(--panel);
          border-radius: 20px;
          padding: 18px;
          display: flex;
          flex-direction: column;
          gap: 8px;
          cursor: pointer;
          transition: transform .16s ease, box-shadow .16s ease, border-color .16s ease;
          box-shadow: 0 8px 24px rgba(94, 58, 22, 0.05);
        }}
        .app-card:hover {{
          transform: translateY(-2px);
          border-color: rgba(175,77,31,0.35);
          box-shadow: 0 16px 30px rgba(94, 58, 22, 0.12);
        }}
        .app-name {{
          font-size: 18px;
          font-weight: 700;
        }}
        .app-type {{
          display: inline-flex;
          width: fit-content;
          padding: 4px 10px;
          border-radius: 999px;
          background: var(--accent-soft);
          color: var(--accent);
          font-size: 12px;
          font-weight: 700;
        }}
        .app-desc {{
          color: var(--muted);
          line-height: 1.6;
          font-size: 14px;
        }}
        .empty {{
          display: none;
          margin-top: 20px;
          color: var(--muted);
        }}
      </style>
    </head>
    <body>
      <div class="shell">
        <div class="hero">
          <h1>选择要导入的宜搭应用</h1>
          <p class="desc">请点击一个应用卡片。脚本会在你选择后自动继续导入，不需要再回终端输入 appType。</p>
          <div class="toolbar">
            <input id="search" placeholder="搜索应用名称或 appType" />
            <div class="hint">共 {len(apps)} 个应用</div>
          </div>
          <div class="grid" id="grid">
            {''.join(cards)}
          </div>
          <div class="empty" id="empty">没有匹配的应用</div>
        </div>
      </div>
      <script>
        window.__selectedAppType = null;
        const search = document.getElementById('search');
        const grid = document.getElementById('grid');
        const empty = document.getElementById('empty');
        const cards = Array.from(document.querySelectorAll('.app-card'));

        function refresh() {{
          const keyword = search.value.trim().toLowerCase();
          let visibleCount = 0;
          cards.forEach((card) => {{
            const text = card.innerText.toLowerCase();
            const visible = !keyword || text.includes(keyword);
            card.style.display = visible ? 'flex' : 'none';
            if (visible) visibleCount += 1;
          }});
          empty.style.display = visibleCount ? 'none' : 'block';
        }}

        search.addEventListener('input', refresh);
        cards.forEach((card) => {{
          card.addEventListener('click', () => {{
            window.__selectedAppType = card.dataset.appType;
            window.__selectedAppName = card.dataset.appName;
            document.body.setAttribute('data-selected-app-type', card.dataset.appType);
          }});
        }});
      </script>
    </body>
    </html>
    """


def choose_app_interactively(page, apps):
    selector_html = render_selector_html(apps)
    page.set_content(selector_html, wait_until="domcontentloaded")
    page.wait_for_function("() => Boolean(window.__selectedAppType)", timeout=0)
    selected_app_type = page.evaluate("() => window.__selectedAppType")
    return ensure_app_exists(apps, selected_app_type)


def discover(app_type=None, interactive=False):
    cookie_data = load_cookie_data()
    base_url = (cookie_data.get("base_url") or DEFAULT_BASE_URL).rstrip("/")

    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=not interactive)
        context = browser.new_context()
        context.add_cookies(cookie_data.get("cookies", []))
        page = context.new_page()

        goto_with_fallback(page, base_url + "/myApp", timeout=90000)
        apps = fetch_app_list(page)
        app_meta = choose_app_interactively(page, apps) if interactive else ensure_app_exists(apps, app_type)
        app_type = app_meta["appType"]

        goto_with_fallback(page, f"{base_url}/{app_type}/admin", timeout=90000)
        page.wait_for_timeout(3000)
        final_url = page.url
        body_text = page.locator("body").inner_text(timeout=10000)
        if "error.htm" in final_url or "应用不存在" in body_text:
            raise RuntimeError(f"应用不可访问或不存在: {app_type}")

        pages = fetch_navigation(page, app_type)
        browser.close()

    return {
        "success": True,
        "appType": app_type,
        "appName": app_meta["appName"],
        "description": app_meta["description"],
        "corpId": app_meta["corpId"],
        "baseUrl": base_url,
        "pages": pages,
    }


def main():
    args = sys.argv[1:]
    interactive = False
    app_type = None
    for arg in args:
        if arg == "--select-app":
            interactive = True
        elif not arg.startswith("--"):
            app_type = arg
    if not app_type:
        interactive = True
    print(json.dumps(discover(app_type=app_type, interactive=interactive), ensure_ascii=False))


if __name__ == "__main__":
    main()
