import {
    ClassicEditor, Essentials, Paragraph, Heading, Bold, Italic, Underline, Strikethrough, Subscript, Superscript,
    RemoveFormat, FontFamily, FontSize, FontColor, FontBackgroundColor, Alignment, Link, List, Indent, IndentBlock,
    BlockQuote, Image, ImageToolbar, ImageResize, ImageStyle, ImageInsert, ImageUpload, Table, TableToolbar,
    TableColumnResize, PageBreak, SpecialCharacters, SpecialCharactersEssentials,
    PasteFromOffice, GeneralHtmlSupport, Mention, Fullscreen
} from 'ckeditor5';
// The editor's own UI only (toolbar, widgets, table handles) - not CKEditor 5's content styles: the report's
// content is styled as the EMR prints it (content.css), with each table's own attributes and inline styles
import 'ckeditor5/ckeditor5-editor.css';
import './editor.css';
import './content.css';
import { LineHeight } from './plugins/lineheight';
import { TextCase } from './plugins/textcase';
import { ImageEmbed } from './plugins/imageembed';
import { drawPageBreaks } from './pages';
import type { FromEditor, SpecialTerm, ToEditor } from './protocol';

/** The EMR's origin: this page's own (served beside it), or, for local development, VITE_EMR_ORIGIN. */
const EMR_ORIGINS: string[] = [window.location.origin, import.meta.env.VITE_EMR_ORIGIN].filter(Boolean);
/** The EMR that embedded this page - its origin, if it's one of those; messages are sent only there. */
const REFERRER_ORIGIN = document.referrer ? new URL(document.referrer).origin : '';
const EMR_ORIGIN = EMR_ORIGINS.includes(REFERRER_ORIGIN) ? REFERRER_ORIGIN : window.location.origin;

let editor: ClassicEditor | undefined;
let terms: SpecialTerm[] = [];
/** The report footer printed on every page - its height decides where the pages end. */
let footer = '';
/** Set while the EMR's setData is applied, so it isn't sent back as the doctor's change. */
let applyingEmrData = false;
let changeTimer: number | undefined;
let pagesTimer: number | undefined;

/**
 * The content as the EMR saves, previews and prints it - as CKEditor 4 wrote it: CKEditor 5 wraps tables and block
 * images in a <figure>, which the preview, the print and AW know nothing of, so each goes back to the bare table or
 * image, keeping a width the figure was given (a resized table or image).
 */
function printHtml(html: string): string {
    const body = new DOMParser().parseFromString('<body>' + html + '</body>', 'text/html').body;
    body.querySelectorAll<HTMLElement>('figure.table, figure.image').forEach(figure => {
        const inner = figure.querySelector<HTMLElement>(':scope > table, :scope > img');
        if (!inner) {
            return;
        }
        if (figure.style.width && !inner.style.width) {
            inner.style.width = figure.style.width;
        }
        figure.replaceWith(inner);
    });
    return body.innerHTML;
}

/** Redraws the page break lines a moment after the content or its layout changes. */
function schedulePages() {
    window.clearTimeout(pagesTimer);
    pagesTimer = window.setTimeout(() => {
        const page = document.querySelector<HTMLElement>('.ck-editor__main > .ck-editor__editable');
        const layer = document.querySelector<HTMLElement>('.ec-page-breaks');
        if (page && layer) {
            drawPageBreaks(page, layer, footer);
        }
    }, 200);
}

function send(message: FromEditor) {
    window.parent.postMessage(message, EMR_ORIGIN);
}

window.addEventListener('message', (event: MessageEvent<ToEditor>) => {
    if (event.source !== window.parent || event.origin !== EMR_ORIGIN) {
        return;
    }
    const message = event.data;
    switch (message?.type) {
        case 'init':
            terms = message.terms ?? [];
            footer = message.footer ?? '';
            if (!editor) {
                create(message.html ?? '', !!message.readOnly);
            }
            break;
        case 'setData':
            if (editor && printHtml(editor.getData()) !== message.html) {
                applyingEmrData = true;
                editor.setData(message.html ?? '');
                applyingEmrData = false;
            }
            break;
        case 'terms':
            terms = message.terms ?? [];
            break;
        case 'footer':
            footer = message.footer ?? '';
            schedulePages();
            break;
    }
});

async function create(html: string, readOnly: boolean) {
    editor = await ClassicEditor.create(document.querySelector('#editor') as HTMLElement, {
        licenseKey: 'GPL',
        plugins: [
            Essentials, Paragraph, Heading, Bold, Italic, Underline, Strikethrough, Subscript, Superscript, RemoveFormat,
            FontFamily, FontSize, FontColor, FontBackgroundColor, Alignment, Link, List, Indent, IndentBlock, BlockQuote,
            Image, ImageToolbar, ImageResize, ImageStyle, ImageInsert, ImageUpload, ImageEmbed, Table, TableToolbar,
            TableColumnResize, PageBreak, SpecialCharacters,
            SpecialCharactersEssentials, PasteFromOffice, GeneralHtmlSupport, Mention, Fullscreen, LineHeight, TextCase
        ],
        toolbar: {
            items: [
                'undo', 'redo', '|', 'heading', 'fontFamily', 'fontSize', '|',
                'bold', 'italic', 'underline', 'strikethrough', 'subscript', 'superscript', 'removeFormat', 'textCase', '|',
                'fontColor', 'fontBackgroundColor', '|', 'alignment', 'lineHeight', '|', 'link', '|',
                'numberedList', 'bulletedList', 'outdent', 'indent', 'blockQuote', '|',
                'insertImage', 'insertTable', 'pageBreak', 'specialCharacters', '|', 'fullscreen'
            ],
            shouldNotGroupWhenFull: false
        },
        heading: {
            options: [
                { model: 'paragraph', title: 'Paragraph', class: 'ck-heading_paragraph' },
                { model: 'heading1', view: 'h1', title: 'Heading 1', class: 'ck-heading_heading1' },
                { model: 'heading2', view: 'h2', title: 'Heading 2', class: 'ck-heading_heading2' },
                { model: 'heading3', view: 'h3', title: 'Heading 3', class: 'ck-heading_heading3' }
            ]
        },
        // Any font or size the CKEditor 4 reports used is kept as it is
        fontFamily: { supportAllValues: true },
        fontSize: { options: [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 36], supportAllValues: true },
        image: {
            toolbar: ['imageStyle:inline', 'imageStyle:block', '|', 'imageTextAlternative'],
            insert: { integrations: ['upload', 'url'] }
        },
        // No table/cell properties: they turn a table's inline styles into their own settings and lose some on the
        // way (e.g. margin-left/right: auto, which centres the templates' tables); without them each table keeps
        // its inline styles exactly (General HTML Support below), as the preview and print need
        // CKEditor's "hidden borders" draw a real border on borderless cells, which makes the rows taller than in
        // print; content.css draws its guides as outlines instead, which take no room
        table: {
            contentToolbar: ['tableColumn', 'tableRow', 'mergeTableCells'],
            showHiddenBorders: false
        },
        // Whatever the CKEditor 4 reports hold that CKEditor 5 has no feature for (classes, inline styles, other
        // elements) is kept rather than dropped - except event handler attributes. The EMR cleans the HTML again
        // (DOMPurify) wherever it shows it.
        htmlSupport: {
            allow: [{ name: /.*/, attributes: true, classes: true, styles: true }],
            disallow: [{ name: /.*/, attributes: [{ key: /^on/i, value: true }] }]
        },
        // Special terms: typing "[[" offers the hospital's terms; picking one inserts its text
        mention: {
            feeds: [{
                marker: '[',
                minimumCharacters: 1,
                feed: query => query.startsWith('[')
                    ? terms.filter(term => ('[[' + term.key).startsWith('[' + query.toUpperCase()))
                        .map(term => ({ id: '[[' + term.key, text: term.value, key: term.key, value: term.value }))
                    : [],
                itemRenderer: (item: any) => {
                    const element = document.createElement('div');
                    element.className = 'special-term';
                    element.innerHTML = '<strong></strong><i></i>';
                    element.querySelector('strong')!.textContent = item.key;
                    element.querySelector('i')!.textContent = item.value;
                    return element;
                }
            }]
        },
        initialData: html
    });

    // A special term goes in as plain text, not as a mention element
    editor.commands.get('mention')!.on('execute', (evt, args: any[]) => {
        evt.stop();
        const { mention, range } = args[0];
        editor!.model.change(writer => {
            editor!.model.insertContent(writer.createText(mention.value + ' '), range);
        });
    }, { priority: 'high' });

    // Pasted HTML loses the empty line breaks and blank paragraphs Word and other editors add, as before
    editor.editing.view.document.on('clipboardInput', (_evt, data: any) => {
        const pasted = data.dataTransfer.getData('text/html');
        if (pasted) {
            data.content = editor!.data.htmlProcessor.toView(
                pasted.replace(/(<br ?\/?>)+/gi, '').replace(/<p[^>]*>+<span[^>]*>+<\/span><\/p>/gi, ''));
        }
    });

    if (readOnly) {
        editor.enableReadOnlyMode('emr');
    }

    // The doctor's changes go to the EMR, at most every 300 ms, as the EMR saves them
    editor.model.document.on('change:data', () => {
        schedulePages();
        if (applyingEmrData) {
            return;
        }
        window.clearTimeout(changeTimer);
        changeTimer = window.setTimeout(() => send({ type: 'change', html: printHtml(editor!.getData()) }), 300);
    });

    // The page break lines, over the page; redrawn as the content, an image in it or the window changes
    const main = document.querySelector<HTMLElement>('.ck-editor__main')!;
    const layer = document.createElement('div');
    layer.className = 'ec-page-breaks';
    main.appendChild(layer);
    main.addEventListener('load', schedulePages, true);
    schedulePages();

    fitToWindow();
    window.addEventListener('resize', () => {
        fitToWindow();
        schedulePages();
    });
}

/** The desk the page sits on fills the iframe below the toolbar, and scrolls. */
function fitToWindow() {
    const toolbar = document.querySelector<HTMLElement>('.ck-editor__top');
    const main = document.querySelector<HTMLElement>('.ck-editor__main');
    if (toolbar && main) {
        main.style.height = `${window.innerHeight - toolbar.offsetHeight - 2}px`;
    }
}

send({ type: 'ready' });
