#!/usr/bin/env python3
"""
yida-seed-data - 宜搭表单测试数据写入脚本

通过 Playwright 在已登录的浏览器上下文中调用宜搭内部 API 批量写入表单数据。
这是向宜搭表单写入数据的唯一正确方式（直接 HTTP 请求会被 302/404 拒绝）。

用法：
    python3 seed-data.py --app-type APP_XXX --page-url "https://..." --records '[...]'

records 格式：
    [
      {
        "formUuid": "FORM-XXX",
        "label": "可选的记录描述（用于日志输出）",
        "data": {
          "fieldId_1": "字符串值",
          "fieldId_2": 100,
          "fieldId_3": 1700000000000
        }
      }
    ]
"""

import argparse
import asyncio
import json
import os
import sys

# 查找项目根目录（向上查找 README.md 或 .git）
def find_project_root():
    current = os.path.dirname(os.path.abspath(__file__))
    while current != os.path.dirname(current):
        if os.path.exists(os.path.join(current, 'README.md')) or \
           os.path.exists(os.path.join(current, '.git')):
            return current
        current = os.path.dirname(current)
    return os.getcwd()

PROJECT_ROOT = find_project_root()
COOKIE_FILE = os.path.join(PROJECT_ROOT, '.cache', 'cookies.json')
LOGIN_SCRIPT = os.path.join(PROJECT_ROOT, '.claude', 'skills', 'yida-login', 'scripts', 'login.py')


def load_cookies():
    """读取 .cache/cookies.json，返回 (cookies列表, base_url)"""
    if not os.path.exists(COOKIE_FILE):
        return None, None
    with open(COOKIE_FILE, 'r') as f:
        raw = f.read().strip()
    if not raw:
        return None, None
    data = json.loads(raw)
    if isinstance(data, list):
        return data, 'https://www.aliwork.com'
    cookies = data.get('cookies', [])
    base_url = data.get('base_url', 'https://www.aliwork.com').rstrip('/')
    return cookies if cookies else None, base_url


def trigger_login():
    """调用 login.py 触发扫码登录，返回 (cookies列表, base_url)"""
    print('\n🔐 未找到登录态，正在触发扫码登录...\n', file=sys.stderr)
    if not os.path.exists(LOGIN_SCRIPT):
        print(f'❌ 登录脚本不存在: {LOGIN_SCRIPT}', file=sys.stderr)
        sys.exit(1)
    import subprocess
    result = subprocess.run(
        ['python3', LOGIN_SCRIPT],
        capture_output=False,
        stdout=subprocess.PIPE,
        text=True,
        timeout=180,
    )
    lines = result.stdout.strip().split('\n')
    login_data = json.loads(lines[-1])
    cookies = login_data.get('cookies', [])
    base_url = login_data.get('base_url', 'https://www.aliwork.com').rstrip('/')
    return cookies, base_url


def cookies_to_playwright_format(cookies, default_domain):
    """将 cookies.json 格式转换为 Playwright 需要的格式"""
    pw_cookies = []
    for cookie in cookies:
        domain = cookie.get('domain', default_domain)
        # Playwright 要求 domain 不能以 . 开头（某些情况）
        pw_cookie = {
            'name': cookie['name'],
            'value': cookie['value'],
            'domain': domain,
            'path': cookie.get('path', '/'),
        }
        if cookie.get('secure'):
            pw_cookie['secure'] = True
        if cookie.get('httpOnly'):
            pw_cookie['httpOnly'] = True
        pw_cookies.append(pw_cookie)
    return pw_cookies


async def write_records(page_url, app_type, records):
    """
    打开宜搭页面，在浏览器上下文中逐条写入表单数据。
    返回 (成功数, 失败数)
    """
    from playwright.async_api import async_playwright

    cookies, base_url = load_cookies()
    if not cookies:
        cookies, base_url = trigger_login()

    from urllib.parse import urlparse
    parsed = urlparse(base_url)
    default_domain = parsed.hostname

    pw_cookies = cookies_to_playwright_format(cookies, default_domain)

    success_count = 0
    fail_count = 0

    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch(headless=True)
        context = await browser.new_context()
        await context.add_cookies(pw_cookies)
        page = await context.new_page()

        print(f'🌐 打开页面: {page_url}')
        await page.goto(page_url, wait_until='networkidle', timeout=30000)
        print('✅ 页面加载完成，开始写入数据...\n')

        for index, record in enumerate(records):
            form_uuid = record['formUuid']
            form_data = record['data']
            label = record.get('label', f'记录 {index + 1}')

            # 在浏览器上下文中通过 fetch 调用宜搭内部 saveFormData 接口
            js_code = f"""
            new Promise((resolve, reject) => {{
                const appType = '{app_type}';
                const formUuid = '{form_uuid}';
                const formDataJson = JSON.stringify({json.dumps(form_data, ensure_ascii=False)});

                // 获取 csrf_token（从页面全局变量中读取）
                const csrfToken = (window.g_config && window.g_config._csrf_token) || '';

                const body = new URLSearchParams({{
                    _csrf_token: csrfToken,
                    formUuid: formUuid,
                    appType: appType,
                    formDataJson: formDataJson,
                }}).toString();

                fetch('/dingtalk/web/' + appType + '/query/form/saveFormData.json', {{
                    method: 'POST',
                    headers: {{ 'Content-Type': 'application/x-www-form-urlencoded' }},
                    body: body,
                }})
                .then(r => r.json())
                .then(resolve)
                .catch(reject);
            }})
            """

            try:
                result = await page.evaluate(js_code)
                if result and (result.get('success') or result.get('result')):
                    print(f'  ✅ {label}')
                    success_count += 1
                else:
                    error_msg = result.get('errorMsg', '未知错误') if result else '请求失败'
                    print(f'  ❌ {label}: {error_msg}')
                    fail_count += 1
            except Exception as error:
                print(f'  ❌ {label}: {str(error)[:100]}')
                fail_count += 1

            # 避免请求过快
            await asyncio.sleep(0.3)

        await browser.close()

    return success_count, fail_count


def main():
    parser = argparse.ArgumentParser(
        description='宜搭表单测试数据写入工具',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument('--app-type', required=True, help='应用 ID，如 APP_XXX')
    parser.add_argument('--page-url', required=True, help='已发布的宜搭自定义页面完整 URL')
    parser.add_argument('--records', required=True, help='JSON 格式的数据列表')

    args = parser.parse_args()

    try:
        records = json.loads(args.records)
    except json.JSONDecodeError as error:
        print(f'❌ --records 参数不是合法的 JSON: {error}', file=sys.stderr)
        sys.exit(1)

    if not isinstance(records, list) or len(records) == 0:
        print('❌ --records 必须是非空的 JSON 数组', file=sys.stderr)
        sys.exit(1)

    for i, record in enumerate(records):
        if 'formUuid' not in record or 'data' not in record:
            print(f'❌ records[{i}] 缺少必填字段 formUuid 或 data', file=sys.stderr)
            sys.exit(1)

    print(f'\n📋 准备写入 {len(records)} 条记录到宜搭表单...')
    print(f'   应用 ID: {args.app_type}')
    print(f'   页面 URL: {args.page_url}\n')

    success_count, fail_count = asyncio.run(
        write_records(args.page_url, args.app_type, records)
    )

    print(f'\n{"=" * 50}')
    print(f'✅ 写入完成：成功 {success_count} 条，失败 {fail_count} 条')
    print(f'{"=" * 50}\n')

    if fail_count > 0:
        sys.exit(1)


if __name__ == '__main__':
    main()
