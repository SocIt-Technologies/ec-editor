/**
 * Where the printed report's pages end, drawn on the editing page as dashed "Page N" lines - the same cuts the EMR's
 * print preview makes (report.component.ts paginatePreview): A4 less the print margins, less the footer, with the
 * page shrunk to fit when the content is wider than the page, and each cut moved up above any line, image or block
 * it would cut through.
 */
const MM = 96 / 25.4;
const PAGE_HEIGHT_MM = 297;
const PAGE_WIDTH_MM = 210;
const PAGE_MARGIN_SIDE_MM = 16;
const PAGE_MARGIN_TOP_MM = 10;
const PAGE_MARGIN_BOTTOM_MM = 10;
/** Elements the print moves to the next page whole (break-inside: avoid) */
const BREAK_UNITS = 'p,li,h1,h2,h3,h4,h5,h6,pre,blockquote,div,td,th';

/**
 * CKEditor's own elements inside the content - column resizers, widget handles, the page break widget and its
 * label - which take no room in print
 */
const EDITOR_UI = '.ck-table-column-resizer, .ck-widget__type-around, .ck-widget__selection-handle, .ck-fake-selection-container, .page-break';
/** break-before / break-after values that start a new page */
const PAGE = ['page', 'always', 'left', 'right', 'recto', 'verso'];

/** A page break the author put in: the page must end by `fit` (the break's top), and the next starts at `at`. */
interface Forced { fit: number; at: number }

interface Box { top: number; bottom: number; text: boolean }

/**
 * Redraws the page break lines over the editing page, on layer - an element beside the page, not in it: CKEditor
 * owns the page's DOM and would remove or re-render anything added there. footerHtml is the report footer printed
 * on every page; letterheadMm the height of a letterhead pre-printed at the top of every sheet, which print leaves
 * room for.
 */
export function drawPageBreaks(page: HTMLElement, layer: HTMLElement, footerHtml: string, letterheadMm: number) {
    layer.replaceChildren();
    layer.style.top = page.offsetTop + 'px';
    layer.style.left = page.offsetLeft + 'px';
    layer.style.width = page.offsetWidth + 'px';
    layer.style.height = page.offsetHeight + 'px';

    const cs = getComputedStyle(page);
    const padTop = parseFloat(cs.borderTopWidth) + parseFloat(cs.paddingTop);
    const padLeft = parseFloat(cs.borderLeftWidth) + parseFloat(cs.paddingLeft);
    const contentW = (PAGE_WIDTH_MM - 2 * PAGE_MARGIN_SIDE_MM) * MM;
    const rect = page.getBoundingClientRect();
    const top0 = rect.top + padTop;

    // Same shrink-to-fit as print when the content is wider than the page
    const contentLeft = rect.left + padLeft;
    const widest = Array.from(page.children)
        .reduce((w, el) => Math.max(w, el.getBoundingClientRect().right - contentLeft), contentW);
    const scale = widest > contentW + 1 ? contentW / widest : 1;
    const footerH = footerHtml ? footerHeight(page, footerHtml, contentW / scale) : 0;
    const usableH = (PAGE_HEIGHT_MM - PAGE_MARGIN_TOP_MM - letterheadMm - PAGE_MARGIN_BOTTOM_MM) * MM / scale - footerH;
    if (usableH <= 0) {
        return;
    }

    const range = document.createRange();
    range.selectNodeContents(page);
    const total = range.getBoundingClientRect().bottom - top0;
    const boxes = unbreakableBoxes(page, usableH, top0);

    // The editor's page break (a widget: class page-break) and any break-before/after a report's HTML carries.
    // In print the widget takes no room, so the page must hold what comes before it, and the next page starts
    // below it. As in print, two in a row leave a blank page, and one at the very end adds a blank last page.
    const forced: Forced[] = [];
    page.querySelectorAll<HTMLElement>('.page-break, [style*="break-"]').forEach(el => {
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        if (el.classList.contains('page-break') || PAGE.includes(cs.breakAfter)) {
            forced.push({ fit: r.top - top0, at: r.bottom - top0 });
        } else if (PAGE.includes(cs.breakBefore)) {
            forced.push({ fit: r.top - top0, at: r.top - top0 });
        }
    });
    forced.sort((a, b) => a.at - b.at);

    let start = 0;
    let next = 0;
    let afterBreak = false;
    for (let n = 2; n < 200; n++) {
        // Skip breaks already behind this page; one right at its top changes nothing, unless a break began the page
        while (next < forced.length && forced[next].fit < start + (afterBreak ? -0.5 : 0.5)) {
            next++;
        }
        if (next < forced.length && forced[next].fit <= start + usableH) {
            start = forced[next++].at;
            afterBreak = true;
        } else if (start + usableH < total) {
            start = cutAbove(boxes, start, start + usableH);
            afterBreak = false;
        } else {
            break;
        }
        const line = document.createElement('div');
        line.className = 'ec-page-break';
        line.style.top = (padTop + start) + 'px';
        const label = document.createElement('span');
        label.textContent = 'Page ' + n;
        line.appendChild(label);
        layer.appendChild(line);
    }
}

/** The highest point at or above limit that cuts through no line, image or block starting below start. */
function cutAbove(boxes: Box[], start: number, limit: number): number {
    let y = limit;
    for (let moved = true; moved;) {
        moved = false;
        for (const box of boxes) {
            // A line of text may be cut in its outer quarters - the print does the same
            const inset = box.text ? (box.bottom - box.top) / 4 : 0;
            if (box.top + inset < y - 0.5 && box.bottom - inset > y + 0.5 && box.top > start + 0.5) {
                y = box.top;
                moved = true;
            }
        }
    }
    return y > start + 1 ? y : limit;
}

/** The lines of text, images and innermost blocks no taller than a page, as offsets from the content's top. */
function unbreakableBoxes(page: HTMLElement, maxH: number, top0: number): Box[] {
    const boxes: Box[] = [];
    const add = (r: DOMRect, text = false) => {
        if (r.height > 0 && r.height <= maxH) {
            boxes.push({ top: r.top - top0, bottom: r.bottom - top0, text });
        }
    };
    const walker = document.createTreeWalker(page, NodeFilter.SHOW_TEXT);
    const range = document.createRange();
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        if (node.textContent?.trim() && !node.parentElement?.closest(EDITOR_UI)) {
            range.selectNodeContents(node);
            Array.from(range.getClientRects()).forEach(r => add(r, true));
        }
    }
    page.querySelectorAll('img').forEach(img => add(img.getBoundingClientRect()));
    const units = Array.from(page.querySelectorAll<HTMLElement>(BREAK_UNITS)).filter(el => !el.closest(EDITOR_UI));
    // The innermost ones: no other (content) block inside
    units.filter(el => !units.some(other => other !== el && el.contains(other)))
        .forEach(el => add(el.getBoundingClientRect()));
    return boxes;
}

/**
 * The footer's height at the page's content width, laid out with the page's own styles - beside the page, in the
 * desk (.ck-editor__main), where the content rules (content.css) apply.
 */
function footerHeight(page: HTMLElement, footerHtml: string, width: number): number {
    const cs = getComputedStyle(page);
    const probe = document.createElement('div');
    probe.className = 'ck-content';
    probe.style.cssText = `position:absolute;visibility:hidden;left:-10000px;top:0;width:${width}px;`
        + `font-family:${cs.fontFamily};font-size:${cs.fontSize};line-height:${cs.lineHeight};color:${cs.color};`;
    probe.innerHTML = footerHtml;
    page.parentElement!.appendChild(probe);
    const height = probe.offsetHeight;
    probe.remove();
    return height;
}
