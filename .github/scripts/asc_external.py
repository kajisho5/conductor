"""TestFlight の外部テスター（パブリックリンク）にビルドを出す（conductor 用。cutline の同名スクリプトを元にした）。

1. アプリ（bundle id）とビルドを探す（ビルド番号を省くと、いちばん新しくアップロードしたもの）。処理が VALID になるまで待つ
2. 輸出規制の回答（usesNonExemptEncryption = false。独自の暗号は使っていない）
3. 外部グループ（既定 "External"）を作るか探し、パブリックリンクを有効にしてリンクを表示
4. Beta App Review の前提：ベータ版の説明（ja）と審査用の連絡先・メモ。連絡先は環境変数 BETA_CONTACT_EMAIL / _FIRST / _LAST / _PHONE、
   無ければ App Store Connect に入っている値を使う。どちらにも無ければ提出せずに止まる
5. ビルドの「テスト内容」（ja）を入れ、グループに入れて、未提出なら Beta App Review に出す

使い方：asc_external.py <bundle id> [build number] [group name]
環境変数：ASC_KEY_ID, ASC_ISSUER_ID, ASC_KEY_P8（.p8 の中身）, 任意で BETA_CONTACT_*, BETA_WHATS_NEW
"""

import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

import jwt

API = "https://api.appstoreconnect.apple.com"
KEY_ID = os.environ["ASC_KEY_ID"]
ISSUER_ID = os.environ["ASC_ISSUER_ID"]
KEY = os.environ["ASC_KEY_P8"]

REVIEW_NOTES = (
    "This app is a button panel and automation tool that controls video switchers, cameras and audio mixers on the local network. "
    "No hardware is needed for review: open the Devices tab (機器), add a device and choose \"デモ機器\" (demo device), "
    "then place its buttons on a page (ボタン) and press them on the Show screen (本番). "
    "The app is not affiliated with any equipment manufacturer."
)
BETA_DESCRIPTION = (
    "iPhone / iPad だけで、LAN の映像スイッチャー・カメラ・音響ミキサーなどをボタンで操作するアプリのベータ版です。"
    "実機が無くても、機器に「デモ機器」を足すと全画面を確かめられます。"
)
DEFAULT_WHATS_NEW = (
    "テスト版です。使う機器を「機器」に足して、ボタンを置いて試してください。うまく動かない時は、機器の画面の「最近のログ」を添えてフィードバックしてください。"
)


def token():
    now = int(time.time())
    return jwt.encode({"iss": ISSUER_ID, "iat": now, "exp": now + 600, "aud": "appstoreconnect-v1"},
                      KEY, algorithm="ES256", headers={"kid": KEY_ID, "typ": "JWT"})


def api(method, path, body=None, ok=(200, 201, 204)):
    data = None if body is None else json.dumps(body).encode()
    req = urllib.request.Request(API + path, data=data, method=method,
                                 headers={"Authorization": f"Bearer {token()}", "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=60) as res:
            raw = res.read()
            return res.status, (json.loads(raw) if raw else {})
    except urllib.error.HTTPError as e:
        raw = e.read().decode(errors="replace")
        try:
            body = json.loads(raw)
        except ValueError:
            body = {"raw": raw[:2000]}
        if e.code not in ok:
            print(f"{method} {path} -> HTTP {e.code}")
            print(json.dumps(body, ensure_ascii=False, indent=2)[:3000])
            sys.exit(1)
        return e.code, body


def q(**params):
    return urllib.parse.urlencode(params)


def find_app(bundle_id):
    _, res = api("GET", f"/v1/apps?{q(**{'filter[bundleId]': bundle_id, 'fields[apps]': 'bundleId,name'})}")
    if not res["data"]:
        print(f"::error::No App Store Connect app with bundle ID {bundle_id}")
        sys.exit(1)
    return res["data"][0]


def wait_build(app_id, build, timeout_s=1800):
    """build が空なら、いちばん新しくアップロードしたビルド"""
    deadline = time.time() + timeout_s
    last = None
    while True:
        params = {"filter[app]": app_id, "fields[builds]": "version,processingState,usesNonExemptEncryption,expired",
                  "sort": "-uploadedDate", "limit": 1}
        if build:
            params["filter[version]"] = build
        _, res = api("GET", "/v1/builds?" + q(**params))
        if not res["data"]:
            print(f"::error::No build found ({build or 'latest'})")
            sys.exit(1)
        for b in res["data"]:
            st = b["attributes"].get("processingState")
            if st != last:
                print(f"build {b['attributes'].get('version')}: {st}")
                last = st
            if st == "VALID":
                return b
            if st in ("FAILED", "INVALID"):
                print(f"::error::Build processing ended in {st}")
                sys.exit(1)
        if time.time() > deadline:
            print("::error::Timed out waiting for the build to finish processing")
            sys.exit(1)
        time.sleep(30)


def ensure_compliance(build):
    if build["attributes"].get("usesNonExemptEncryption") is None:
        api("PATCH", f"/v1/builds/{build['id']}", {"data": {
            "type": "builds", "id": build["id"], "attributes": {"usesNonExemptEncryption": False}}})
        print("export compliance: set usesNonExemptEncryption=false")
    else:
        print(f"export compliance: usesNonExemptEncryption={build['attributes']['usesNonExemptEncryption']}")


def ensure_group(app_id, name):
    _, res = api("GET", f"/v1/apps/{app_id}/betaGroups?{q(**{'fields[betaGroups]': 'name,isInternalGroup,publicLinkEnabled,publicLink,publicLinkLimit,publicLinkLimitEnabled', 'limit': 50})}")
    group = next((g for g in res["data"] if g["attributes"]["name"] == name and not g["attributes"]["isInternalGroup"]), None)
    if group is None:
        _, res = api("POST", "/v1/betaGroups", {"data": {
            "type": "betaGroups",
            "attributes": {"name": name, "isInternalGroup": False, "publicLinkEnabled": True,
                           "publicLinkLimitEnabled": True, "publicLinkLimit": 1000, "feedbackEnabled": True},
            "relationships": {"app": {"data": {"type": "apps", "id": app_id}}},
        }})
        group = res["data"]
        print(f"beta group created: {name}")
    elif not group["attributes"].get("publicLinkEnabled"):
        _, res = api("PATCH", f"/v1/betaGroups/{group['id']}", {"data": {
            "type": "betaGroups", "id": group["id"],
            "attributes": {"publicLinkEnabled": True, "publicLinkLimitEnabled": True, "publicLinkLimit": 1000, "feedbackEnabled": True}}})
        group = res["data"]
        print(f"beta group public link enabled: {name}")
    link = group["attributes"].get("publicLink")
    print(f"PUBLIC LINK: {link or '(not issued yet; check App Store Connect → TestFlight → ' + name + ')'}")
    return group, link


def ensure_beta_localization(app_id, email):
    _, res = api("GET", f"/v1/apps/{app_id}/betaAppLocalizations?{q(**{'fields[betaAppLocalizations]': 'locale,feedbackEmail,description'})}")
    ja = next((l for l in res["data"] if l["attributes"]["locale"] == "ja"), None)
    attrs = {"description": BETA_DESCRIPTION}
    if email:
        attrs["feedbackEmail"] = email
    if ja is None:
        attrs["locale"] = "ja"
        api("POST", "/v1/betaAppLocalizations", {"data": {
            "type": "betaAppLocalizations", "attributes": attrs,
            "relationships": {"app": {"data": {"type": "apps", "id": app_id}}}}})
        print("beta app localization (ja): created")
    else:
        api("PATCH", f"/v1/betaAppLocalizations/{ja['id']}", {"data": {
            "type": "betaAppLocalizations", "id": ja["id"], "attributes": attrs}})
        print("beta app localization (ja): updated")


def ensure_review_detail(app_id):
    _, res = api("GET", f"/v1/apps/{app_id}/betaAppReviewDetail")
    detail = res["data"]
    cur = detail["attributes"]
    env = {k: os.environ.get(f"BETA_CONTACT_{k.upper()}", "").strip() for k in ("email", "first", "last", "phone")}
    attrs = {"demoAccountRequired": False, "notes": REVIEW_NOTES}
    if env["email"]:
        attrs["contactEmail"] = env["email"]
    if env["first"]:
        attrs["contactFirstName"] = env["first"]
    if env["last"]:
        attrs["contactLastName"] = env["last"]
    if env["phone"]:
        attrs["contactPhone"] = env["phone"]
    merged = {**cur, **attrs}
    missing = [k for k in ("contactEmail", "contactFirstName", "contactLastName", "contactPhone") if not merged.get(k)]
    if missing:
        # App Store Connect は連絡先が揃っていない PATCH を 409 で拒否する。欠けていれば触らずに警告だけ出す
        print(f"beta app review detail: not updated; missing contact fields: {', '.join(missing)}")
        return missing
    api("PATCH", f"/v1/betaAppReviewDetails/{detail['id']}", {"data": {
        "type": "betaAppReviewDetails", "id": detail["id"], "attributes": attrs}})
    print("beta app review detail: contact + notes set")
    return missing


def ensure_whats_new(build_id, text):
    _, res = api("GET", f"/v1/builds/{build_id}/betaBuildLocalizations?{q(**{'fields[betaBuildLocalizations]': 'locale,whatsNew'})}")
    ja = next((l for l in res["data"] if l["attributes"]["locale"] == "ja"), None)
    if ja is None:
        api("POST", "/v1/betaBuildLocalizations", {"data": {
            "type": "betaBuildLocalizations", "attributes": {"locale": "ja", "whatsNew": text},
            "relationships": {"build": {"data": {"type": "builds", "id": build_id}}}}})
    else:
        api("PATCH", f"/v1/betaBuildLocalizations/{ja['id']}", {"data": {
            "type": "betaBuildLocalizations", "id": ja["id"], "attributes": {"whatsNew": text}}})
    print("what to test (ja): set")


def add_to_group(group_id, build_id):
    # 409 = already in the group
    status, _ = api("POST", f"/v1/betaGroups/{group_id}/relationships/builds",
                    {"data": [{"type": "builds", "id": build_id}]}, ok=(200, 201, 204, 409))
    print("build added to group" if status != 409 else "build already in group")


def submit_review(build_id):
    status, res = api("GET", f"/v1/builds/{build_id}/betaAppReviewSubmission", ok=(200, 404))
    if status == 200 and res.get("data"):
        print(f"beta app review: already submitted ({res['data']['attributes'].get('betaReviewState')})")
        return
    _, res = api("POST", "/v1/betaAppReviewSubmissions", {"data": {
        "type": "betaAppReviewSubmissions",
        "relationships": {"build": {"data": {"type": "builds", "id": build_id}}}}})
    print(f"beta app review: submitted ({res['data']['attributes'].get('betaReviewState')})")


def main():
    bundle_id = sys.argv[1]
    build = sys.argv[2].strip() if len(sys.argv) > 2 else ""
    group_name = (sys.argv[3].strip() if len(sys.argv) > 3 else "") or "External"
    app = find_app(bundle_id)
    app_id = app["id"]
    print("app:", app["attributes"].get("name"))

    b = wait_build(app_id, build)
    ensure_compliance(b)
    group, link = ensure_group(app_id, group_name)
    ensure_beta_localization(app_id, os.environ.get("BETA_CONTACT_EMAIL", "").strip())
    missing = ensure_review_detail(app_id)
    ensure_whats_new(b["id"], os.environ.get("BETA_WHATS_NEW", "").strip() or DEFAULT_WHATS_NEW)
    add_to_group(group["id"], b["id"])
    if missing:
        print("::warning::Beta App Review needs contact info. Set repository secrets BETA_CONTACT_EMAIL / BETA_CONTACT_FIRST / "
              "BETA_CONTACT_LAST / BETA_CONTACT_PHONE (or fill App Store Connect → TestFlight → Test Information) and re-run.")
        print("The build is in the group; the public link works once the build passes Beta App Review.")
        return
    submit_review(b["id"])
    if link:
        print(f"Done. Share this link after approval: {link}")


if __name__ == "__main__":
    main()
