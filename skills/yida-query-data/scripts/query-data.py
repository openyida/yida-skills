#!/usr/bin/env python3
"""
query-yida-data-v3.py - 宜搭表单数据查询工具（V3 - 修正版）

根据浏览器实际调用格式：
/dingtalk/web/{appType}/v1/form/searchFormDatas.json?_api=nattyFetch&_mock=false&...

用法:
  python3 query-yida-data-v3.py <appType> <formUuid> [options]

参数:
  appType    - 应用 ID（必填）
  formUuid   - 表单 UUID（必填）

选项:
  --page NUMBER       当前页码，默认 1
  --size NUMBER       每页记录数，默认 20，最大 100
  --search-json JSON  搜索条件 JSON 字符串
  --inst-id ID        根据实例 ID 查询详情
"""

import json
import os
import sys
import ssl
import time
from pathlib import Path
from urllib import parse, request, error
from subprocess import run

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
# 技能路径: openyida/.claude/skills/skills/yida-query-data/scripts/
# openyida 目录: SCRIPT_DIR/../../../
OPENYIDA_DIR = os.path.normpath(os.path.join(SCRIPT_DIR, "..", "..", "..", ".."))
PROJECT_ROOT = os.path.dirname(OPENYIDA_DIR)

if os.path.exists(os.path.join(OPENYIDA_DIR, ".cache", "cookies.json")):
    COOKIE_FILE = os.path.join(OPENYIDA_DIR, ".cache", "cookies.json")
else:
    COOKIE_FILE = os.path.join(PROJECT_ROOT, ".cache", "cookies.json")

CONFIG_FILE = os.path.join(PROJECT_ROOT, "config.json")


def find_login_script():
    # 登录脚本在 openyida/.claude/skills/skills/yida-login/scripts/login.py
    path = os.path.join(OPENYIDA_DIR, ".claude", "skills", "skills", "yida-login", "scripts", "login.py")
    if os.path.exists(path):
        return path
    return None


LOGIN_SCRIPT = find_login_script()


def load_config():
    if not os.path.exists(CONFIG_FILE):
        return {"defaultBaseUrl": "https://www.aliwork.com"}
    with open(CONFIG_FILE, "r", encoding="utf-8") as f:
        return json.load(f)


CONFIG = load_config()
DEFAULT_BASE_URL = CONFIG.get("defaultBaseUrl", "https://www.aliwork.com")


def load_cookie_data():
    if not os.path.exists(COOKIE_FILE):
        return None
    try:
        with open(COOKIE_FILE, "r", encoding="utf-8") as f:
            content = f.read().strip()
        if not content:
            return None
        data = json.loads(content)
        if isinstance(data, dict) and "cookies" in data:
            return data
        if isinstance(data, list) and data:
            return {"cookies": data, "base_url": DEFAULT_BASE_URL}
        return None
    except (json.JSONDecodeError, ValueError):
        return None


def extract_csrf_token(cookies):
    for cookie in cookies:
        if cookie.get("name") == "tianshu_csrf_token":
            return cookie.get("value")
    return None


def trigger_login():
    print("\n🔐 登录态失效，正在调用 login.py 重新登录...\n", file=sys.stderr)
    if not LOGIN_SCRIPT or not os.path.exists(LOGIN_SCRIPT):
        print(f"  ❌ 登录脚本不存在", file=sys.stderr)
        sys.exit(1)

    result = run(
        ["python3", LOGIN_SCRIPT],
        capture_output=True,
        text=True,
        timeout=180,
    )

    if result.returncode != 0:
        print(f"  ❌ 登录失败：{result.stderr}", file=sys.stderr)
        sys.exit(1)

    lines = result.stdout.strip().split("\n")
    json_line = lines[-1]
    try:
        login_result = json.loads(json_line)
        if not login_result.get("cookies"):
            raise ValueError("登录结果缺少 cookies")
        return login_result
    except Exception as e:
        print(f"  ❌ 解析登录结果失败：{e}", file=sys.stderr)
        sys.exit(1)


def ensure_login():
    cookie_data = load_cookie_data()
    if not cookie_data:
        return trigger_login()
    
    cookies = cookie_data.get("cookies", [])
    csrf_token = extract_csrf_token(cookies)
    
    if not csrf_token:
        return trigger_login()
    
    base_url = cookie_data.get("base_url", DEFAULT_BASE_URL)
    cookie_data["csrf_token"] = csrf_token
    return cookie_data


def search_form_datas(base_url, cookies, csrf_token, app_type, form_uuid, options):
    """
    调用 searchFormDatas 接口查询数据
    URL格式: /dingtalk/web/{appType}/v1/form/searchFormDatas.json?_api=nattyFetch&_mock=false&...
    """
    params = {
        "_api": "nattyFetch",
        "_mock": "false",
        "_csrf_token": csrf_token,
        "_stamp": str(int(time.time() * 1000)),
        "formUuid": form_uuid,
        "appType": app_type,
        "currentPage": str(options.get("page", 1)),
        "pageSize": str(options.get("size", 20)),
    }
    
    if options.get("search_json"):
        params["searchFieldJson"] = options["search_json"]
    
    query_string = parse.urlencode(params)
    path = f"/dingtalk/web/{app_type}/v1/form/searchFormDatas.json?{query_string}"
    url = f"{base_url}{path}"
    
    cookie_header = "; ".join([f"{c['name']}={c['value']}" for c in cookies])
    
    headers = {
        "Origin": base_url,
        "Referer": f"{base_url}/{app_type}/workbench",
        "Cookie": cookie_header,
        "Accept": "application/json",
        "X-Requested-With": "XMLHttpRequest",
    }
    
    req = request.Request(url, headers=headers, method="GET")
    context = ssl.create_default_context()
    
    try:
        with request.urlopen(req, timeout=30, context=context) as response:
            content = response.read().decode("utf-8")
            return json.loads(content)
    except error.HTTPError as e:
        content = e.read().decode("utf-8")
        try:
            return json.loads(content)
        except:
            return {"success": False, "errorMsg": f"HTTP {e.code}: {content[:200]}"}
    except Exception as e:
        return {"success": False, "errorMsg": str(e)}


def get_form_data_by_id(base_url, cookies, csrf_token, app_type, form_inst_id):
    """
    调用 getFormDataById 接口查询单个实例详情
    URL格式: /dingtalk/web/{appType}/v1/form/getFormDataById.json?...
    """
    params = {
        "_api": "nattyFetch",
        "_mock": "false",
        "_csrf_token": csrf_token,
        "_stamp": str(int(time.time() * 1000)),
        "formInstId": form_inst_id,
    }
    
    query_string = parse.urlencode(params)
    path = f"/dingtalk/web/{app_type}/v1/form/getFormDataById.json?{query_string}"
    url = f"{base_url}{path}"
    
    cookie_header = "; ".join([f"{c['name']}={c['value']}" for c in cookies])
    
    headers = {
        "Origin": base_url,
        "Referer": f"{base_url}/{app_type}/workbench",
        "Cookie": cookie_header,
        "Accept": "application/json",
        "X-Requested-With": "XMLHttpRequest",
    }
    
    req = request.Request(url, headers=headers, method="GET")
    context = ssl.create_default_context()
    
    try:
        with request.urlopen(req, timeout=30, context=context) as response:
            content = response.read().decode("utf-8")
            return json.loads(content)
    except error.HTTPError as e:
        content = e.read().decode("utf-8")
        try:
            return json.loads(content)
        except:
            return {"success": False, "errorMsg": f"HTTP {e.code}: {content[:200]}"}
    except Exception as e:
        return {"success": False, "errorMsg": str(e)}


def parse_args():
    args = sys.argv[1:]
    
    if len(args) < 2:
        print(__doc__, file=sys.stderr)
        sys.exit(1)
    
    app_type = args[0]
    form_uuid = args[1]
    
    options = {
        "page": 1,
        "size": 20,
        "search_json": None,
        "inst_id": None,
    }
    
    i = 2
    while i < len(args):
        if args[i] == "--page" and i + 1 < len(args):
            options["page"] = int(args[i + 1])
            i += 2
        elif args[i] == "--size" and i + 1 < len(args):
            options["size"] = int(args[i + 1])
            i += 2
        elif args[i] == "--search-json" and i + 1 < len(args):
            options["search_json"] = args[i + 1]
            i += 2
        elif args[i] == "--inst-id" and i + 1 < len(args):
            options["inst_id"] = args[i + 1]
            i += 2
        else:
            i += 1
    
    if options["size"] > 100:
        options["size"] = 100
    
    return app_type, form_uuid, options


def main():
    app_type, form_uuid, options = parse_args()
    
    print("=" * 50, file=sys.stderr)
    print("  query-yida-data-v3 - 宜搭表单数据查询工具", file=sys.stderr)
    print("=" * 50, file=sys.stderr)
    print(f"\n  应用 ID:    {app_type}", file=sys.stderr)
    print(f"  表单 UUID:  {form_uuid}", file=sys.stderr)
    
    print("\n🔑 Step 1: 获取登录态", file=sys.stderr)
    cookie_data = ensure_login()
    cookies = cookie_data["cookies"]
    base_url = cookie_data.get("base_url", DEFAULT_BASE_URL).rstrip("/")
    csrf_token = cookie_data.get("csrf_token")
    print(f"  ✅ 登录态已就绪（{base_url}）", file=sys.stderr)
    
    print("\n📊 Step 2: 查询数据", file=sys.stderr)
    
    if options["inst_id"]:
        print(f"  查询实例详情：{options['inst_id']}", file=sys.stderr)
        result = get_form_data_by_id(base_url, cookies, csrf_token, app_type, options["inst_id"])
    else:
        print(f"  查询数据列表（第 {options['page']} 页，每页 {options['size']} 条）...", file=sys.stderr)
        result = search_form_datas(base_url, cookies, csrf_token, app_type, form_uuid, options)
    
    print("\n" + "=" * 50, file=sys.stderr)
    if result.get("success"):
        if options["inst_id"]:
            print("  ✅ 实例详情查询成功！", file=sys.stderr)
        else:
            total = result.get("content", {}).get("totalCount", 0)
            print(f"  ✅ 查询成功！共 {total} 条记录", file=sys.stderr)
        print("=" * 50, file=sys.stderr)
        print(json.dumps(result, ensure_ascii=False, indent=2))
    else:
        error_msg = result.get("errorMsg", "未知错误")
        error_code = result.get("errorCode", "")
        print(f"  ❌ 查询失败：{error_msg}", file=sys.stderr)
        if error_code:
            print(f"  错误码：{error_code}", file=sys.stderr)
        print("=" * 50, file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
