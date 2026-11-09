#!/usr/bin/env python3
"""agentd M12 office/image helper.

Reads one JSON object from stdin:
  {"kind":"docx|xlsx|pptx|image", "output":"C:/...file", ...args}
Writes the file and prints {"ok":true}; on failure prints {"ok":false,"error":"..."} and exits 0.
No network, no macros, no shell.
"""
import base64
import io
import json
import os
import sys


def emit(payload):
    sys.stdout.buffer.write(json.dumps(payload, ensure_ascii=False).encode("utf-8"))
    sys.stdout.buffer.flush()


def fail(message):
    emit({"ok": False, "error": str(message)})
    sys.exit(0)


def ensure_parent(path):
    parent = os.path.dirname(os.path.abspath(path))
    if parent:
        os.makedirs(parent, exist_ok=True)


def make_docx(payload):
    from docx import Document
    from docx.shared import Pt

    document = Document()
    style = document.styles["Normal"]
    style.font.name = "Microsoft YaHei"
    style.font.size = Pt(11)
    markdown = str(payload.get("markdown", ""))
    for raw in markdown.splitlines():
        line = raw.strip()
        if not line:
            document.add_paragraph("")
            continue
        if line.startswith("### "):
            document.add_heading(line[4:], level=3)
        elif line.startswith("## "):
            document.add_heading(line[3:], level=2)
        elif line.startswith("# "):
            document.add_heading(line[2:], level=1)
        elif line.startswith("- ") or line.startswith("* "):
            document.add_paragraph(line[2:], style="List Bullet")
        else:
            document.add_paragraph(line)
    ensure_parent(payload["output"])
    document.save(payload["output"])


def make_xlsx(payload):
    from openpyxl import Workbook

    workbook = Workbook()
    workbook.remove(workbook.active)
    sheets = payload.get("sheets") or []
    if not isinstance(sheets, list) or not sheets:
        sheets = [{"name": "Sheet1", "rows": [[""]]}]
    for index, sheet in enumerate(sheets):
        title = str(sheet.get("name") or ("Sheet%d" % (index + 1)))
        worksheet = workbook.create_sheet(title=title[:31])
        rows = sheet.get("rows") or []
        for row in rows:
            if isinstance(row, (list, tuple)):
                worksheet.append(list(row))
            else:
                worksheet.append([row])
    ensure_parent(payload["output"])
    workbook.save(payload["output"])


def make_pptx(payload):
    from pptx import Presentation
    from pptx.util import Inches

    presentation = Presentation()
    slides = payload.get("slides") or []
    if not isinstance(slides, list) or not slides:
        slides = [{"title": "标题", "bullets": []}]
    for slide in slides:
        title = str(slide.get("title") or "标题")
        layout = presentation.slide_layouts[1]
        current = presentation.slides.add_slide(layout)
        current.shapes.title.text = title
        body = current.placeholders[1].text_frame
        bullets = slide.get("bullets") or []
        if not isinstance(bullets, list):
            bullets = [bullets]
        body.text = ""
        for index, bullet in enumerate(bullets):
            paragraph = body.paragraphs[0] if index == 0 else body.add_paragraph()
            paragraph.text = str(bullet)
            paragraph.level = 0
    ensure_parent(payload["output"])
    presentation.save(payload["output"])


def load_font(size):
    from PIL import ImageFont

    for candidate in (
        r"C:\Windows\Fonts\msyh.ttc",
        r"C:\Windows\Fonts\msyhbd.ttc",
        r"C:\Windows\Fonts\simhei.ttf",
        r"C:\Windows\Fonts\arial.ttf",
    ):
        if os.path.exists(candidate):
            try:
                return ImageFont.truetype(candidate, size)
            except Exception:
                pass
    return ImageFont.load_default()


def make_image(payload):
    from PIL import Image, ImageDraw

    encoded = payload.get("png_base64")
    if encoded:
        raw = base64.b64decode(str(encoded))
        image = Image.open(io.BytesIO(raw)).convert("RGB")
    else:
        prompt = str(payload.get("prompt") or "agentd image")
        image = Image.new("RGB", (1000, 640), (30, 41, 59))
        draw = ImageDraw.Draw(image)
        for y in range(640):
            ratio = y / 640.0
            draw.line([(0, y), (1000, y)], fill=(int(30 + 40 * ratio), int(41 + 80 * ratio), int(59 + 110 * ratio)))
        title_font = load_font(38)
        body_font = load_font(24)
        draw.text((70, 90), "agentd", font=title_font, fill=(255, 255, 255))
        lines = [prompt[i:i + 34] for i in range(0, len(prompt), 34)][:8]
        y = 210
        for line in lines:
            draw.text((70, y), line, font=body_font, fill=(226, 232, 240))
            y += 44
    ensure_parent(payload["output"])
    image.save(payload["output"], format="PNG")


def main():
    try:
        payload = json.loads(sys.stdin.buffer.read().decode("utf-8", errors="strict") or "{}")
    except Exception as exc:
        fail("bad json: %s" % exc)
    kind = str(payload.get("kind") or "")
    output = payload.get("output")
    if not output:
        fail("missing output path")
    try:
        if kind == "docx":
            make_docx(payload)
        elif kind == "xlsx":
            make_xlsx(payload)
        elif kind == "pptx":
            make_pptx(payload)
        elif kind == "image":
            make_image(payload)
        else:
            fail("unknown kind %s" % kind)
    except Exception as exc:
        fail(exc)
    if not os.path.exists(output):
        fail("helper did not create output")
    emit({"ok": True, "size": os.path.getsize(output)})


if __name__ == "__main__":
    main()
