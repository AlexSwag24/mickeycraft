"""Mickeycraft 1.20.1 asset helper.
Downloads Minecraft 1.20.1 block/item textures from the public
minecraft-assets mirror, plus the small set of GUI/sound assets used by
Mickeycraft. Existing files are skipped, so rerunning is cheap.
"""
import json, os, ssl, urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed

OUTPUT_DIR = os.path.join("mickeycraft", "assets")
os.makedirs(OUTPUT_DIR, exist_ok=True)
BRANCH = "1.20.1"
REPO = "InventivetalentDev/minecraft-assets"
API = f"https://api.github.com/repos/{REPO}/contents/assets/minecraft/textures"
RAW = f"https://raw.githubusercontent.com/{REPO}/{BRANCH}/assets/minecraft/textures"

HEADERS = {"User-Agent": "Mickeycraft-Asset-Scraper/2.0"}
CTX = ssl.create_default_context()

# These are the extra non-texture files the game uses.
MANUAL = {
    "heart.png":"gui/sprites/hud/heart/container.png", "heart_half.png":"gui/sprites/hud/heart/half.png",
    "heart_full.png":"gui/sprites/hud/heart/full.png", "bubble.png":"gui/sprites/hud/air.png",
    "bubble_pop.png":"gui/sprites/hud/air_bursting.png", "gui_slot.png":"gui/sprites/container/slot.png",
    "diamond_sword.png":"item/diamond_sword.png", "diamond_pickaxe.png":"item/diamond_pickaxe.png",
    "diamond_axe.png":"item/diamond_axe.png", "diamond_shovel.png":"item/diamond_shovel.png",
    "flint_and_steel.png":"item/flint_and_steel.png", "stick.png":"item/stick.png",
    "apple.png":"item/apple.png", "bread.png":"item/bread.png", "cooked_beef.png":"item/cooked_beef.png",
    "golden_apple.png":"item/golden_apple.png", "cookie.png":"item/cookie.png",
}

def request_json(url):
    req=urllib.request.Request(url, headers={**HEADERS, "Accept":"application/vnd.github+json"})
    with urllib.request.urlopen(req, context=CTX, timeout=30) as r:
        return json.load(r)

def fetch(url, dest):
    if os.path.exists(dest): return "skip"
    req=urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, context=CTX, timeout=30) as r, open(dest,"wb") as f:
        f.write(r.read())
    return "ok"

def discover_pngs(folder):
    """Use GitHub's API so new 1.20.1 textures are picked up automatically."""
    data=request_json(f"{API}/{folder}")
    return [x["name"] for x in data if x.get("type")=="file" and x["name"].endswith(".png")]

def main():
    jobs=[]
    for folder in ("block", "item"):
        try:
            names=discover_pngs(folder)
            print(f"[*] Found {len(names)} {folder} textures")
            for name in names:
                # Use basename because Mickeycraft's JS expects assets/foo.png.
                jobs.append((f"{RAW}/{folder}/{name}", os.path.join(OUTPUT_DIR,name)))
        except Exception as e:
            print(f"[!] Could not enumerate {folder}: {e}")

    for local, subpath in MANUAL.items():
        jobs.append((f"{RAW}/{subpath}", os.path.join(OUTPUT_DIR,local)))

    ok=skip=fail=0
    with ThreadPoolExecutor(max_workers=8) as pool:
        futures={pool.submit(fetch,url,dest):(url,dest) for url,dest in jobs}
        for fut in as_completed(futures):
            url,dest=futures[fut]
            try:
                result=fut.result()
                if result=="ok": ok+=1
                else: skip+=1
            except Exception as e:
                fail+=1
                print(f"[!] {url.rsplit('/',1)[-1]}: {e}")

    print(f"[+] Done: {ok} downloaded, {skip} already present, {fail} failed")
    print(f"[+] Assets are in {OUTPUT_DIR}/")

if __name__ == "__main__":
    main()
