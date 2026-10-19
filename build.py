"""
Build script: inline assets/*.js + style.css into a single self-contained HTML.

开发态: index.html (引用 assets/) + assets/*.js + style.css
交付态: dist/task-board.html (单一 HTML, 双击即用)

用法: python build.py
加新 render-*.js 后只需在 index.html 加 <script src="assets/render-X.js"></script>,
build.py 自动按引用顺序内联, 不用改 build.py.
"""
import os
import re

BASE = os.path.dirname(os.path.abspath(__file__))

with open(os.path.join(BASE, "index.html"), encoding="utf-8") as f:
    html = f.read()

# 内联 CSS
with open(os.path.join(BASE, "assets/style.css"), encoding="utf-8") as f:
    css = f.read()
html = html.replace(
    '<link rel="stylesheet" href="assets/style.css">',
    f'<style>\n{css}\n</style>'
)

# 按 index.html 引用顺序合并 JS (加 render 文件只改 index.html, 不用改这里)
refs = re.findall(r'<script src="assets/([^"]+\.js)"></script>', html)
parts = []
for name in refs:
    with open(os.path.join(BASE, "assets", name), encoding="utf-8") as f:
        parts.append(f.read().rstrip("\n"))
js_combined = "\n\n".join(parts)

# 替换 assets script 引用块为单个内联 <script>
first_ref = html.find('<script src="assets/')
last_ref_start = html.rfind('<script src="assets/')
last_ref_end = html.find('</script>', last_ref_start) + len('</script>')
assert first_ref > 0 and last_ref_end > first_ref, "assets script refs not found"

out = html[:first_ref] + f'<script>\n{js_combined}\n</script>' + html[last_ref_end:]

# 输出: dist/ 单文件交付 + docs/index.html (GitHub Pages, 网址直达)
dist_dir = os.path.join(BASE, "dist")
os.makedirs(dist_dir, exist_ok=True)
out_path = os.path.join(dist_dir, "task-board.html")
with open(out_path, "w", encoding="utf-8") as f:
    f.write(out)

docs_dir = os.path.join(BASE, "docs")
os.makedirs(docs_dir, exist_ok=True)
docs_path = os.path.join(docs_dir, "index.html")
with open(docs_path, "w", encoding="utf-8") as f:
    f.write(out)
print(f"also wrote: {docs_path}")

print(f"built: {out_path}")
print(f"size: {len(out):,} chars ({len(out)/1024:.1f} KB)")
