import {
    Plugin, Command, ButtonView, View, Dialog, IconTableProperties, IconTableCellProperties,
    _modifyHtmlSupportGhsAttribute as modifyGhsAttribute
} from 'ckeditor5';
import type { Editor, ModelElement, ModelWriter } from 'ckeditor5';

/**
 * Table and cell settings - borders, spacing, padding, width, alignment - written straight into the table's and
 * cells' own HTML attributes and inline styles (General HTML Support keeps those as they are). Only a setting
 * someone changes is written, so a template's tables stay exactly as they were until someone edits them. CKEditor's
 * own table and cell properties plugins are not used: they rewrite every table's HTML when a report opens.
 *
 * A table inserted from the toolbar gets borders (border="1" cellspacing="0"), as the templates' bordered tables
 * have them.
 */

type Values = Record<string, string>;
interface Field { key: string; label: string; options?: [string, string][]; placeholder?: string }

const TABLE_FIELDS: Field[] = [
    { key: 'border', label: 'Borders', options: [['1', 'On'], ['0', 'Off']] },
    // Single: border-collapse: collapse - neighbouring cells share one line, and cell spacing no longer applies
    { key: 'collapse', label: 'Lines', options: [['collapse', 'Single'], ['separate', 'Double (with cell spacing)']] },
    { key: 'cellspacing', label: 'Cell spacing (px)', placeholder: 'e.g. 0' },
    { key: 'cellpadding', label: 'Cell padding (px)', placeholder: 'e.g. 2' },
    { key: 'width', label: 'Width', placeholder: 'e.g. 100% or 600px' },
    { key: 'align', label: 'Alignment', options: [['left', 'Left'], ['center', 'Centre'], ['right', 'Right']] }
];

const CELL_FIELDS: Field[] = [
    {
        key: 'vertical-align', label: 'Vertical alignment',
        options: [['', 'Default'], ['top', 'Top'], ['middle', 'Middle'], ['bottom', 'Bottom']]
    },
    {
        key: 'text-align', label: 'Horizontal alignment',
        options: [['', 'Default'], ['left', 'Left'], ['center', 'Centre'], ['right', 'Right'], ['justify', 'Justify']]
    },
    { key: 'padding', label: 'Padding', placeholder: 'e.g. 4px' },
    { key: 'background-color', label: 'Background colour', placeholder: 'e.g. #f0f0f0' },
    { key: 'width', label: 'Width', placeholder: 'e.g. 120px or 20%' },
    { key: 'border', label: 'Border', options: [['', 'As the table'], ['none', 'None'], ['solid', 'Solid line']] }
];

interface Ghs { attributes?: Record<string, string>; styles?: Record<string, string> }

function ghsOf(item: ModelElement, key: string): Ghs {
    return (item.getAttribute(key) as Ghs | undefined) ?? {};
}

/** Sets (or, for '', removes) the given attributes and styles in the element's GHS attribute `key`. */
function writeGhs(writer: ModelWriter, item: ModelElement, key: string,
                  attributes: Record<string, string | null>, styles: Record<string, string | null>) {
    const apply = (map: Map<string, unknown>, changes: Record<string, string | null>) => {
        for (const [name, value] of Object.entries(changes)) {
            if (value) {
                map.set(name, value);
            } else {
                map.delete(name);
            }
        }
    };
    if (Object.keys(attributes).length) {
        modifyGhsAttribute(writer, item, key, 'attributes', map => apply(map, attributes));
    }
    if (Object.keys(styles).length) {
        modifyGhsAttribute(writer, item, key, 'styles', map => apply(map, styles));
    }
}

/** Every style starting with the given prefix (e.g. "border" for border, border-top-width, ...), set to remove. */
function removeAll(styles: Record<string, string> | undefined, prefix: string): Record<string, null> {
    return Object.fromEntries(Object.keys(styles ?? {})
        .filter(name => name === prefix || name.startsWith(prefix + '-'))
        .map(name => [name, null]));
}

function selectedTable(editor: Editor): ModelElement | null {
    const selection = editor.model.document.selection;
    const selected = selection.getSelectedElement();
    if (selected?.is('element', 'table')) {
        return selected;
    }
    return (selection.getFirstPosition()?.findAncestor('table') as ModelElement | null) ?? null;
}

function selectedCells(editor: Editor): ModelElement[] {
    return editor.plugins.get('TableUtils').getSelectionAffectedTableCells(editor.model.document.selection);
}

/** The GHS attribute holding a cell's HTML: td's or th's, as the cell is shown. */
function cellKey(editor: Editor, cell: ModelElement): string {
    return editor.editing.mapper.toViewElement(cell)?.name === 'th' ? 'htmlThAttributes' : 'htmlTdAttributes';
}

function tableValues(table: ModelElement): Values {
    const { attributes: a = {}, styles: s = {} } = ghsOf(table, 'htmlTableAttributes');
    const left = s['margin-left'], right = s['margin-right'];
    const align = left === 'auto' && right === 'auto' ? 'center'
        : left === 'auto' ? 'right'
        : (a.align ?? '').toLowerCase() === 'center' ? 'center'
        : (a.align ?? '').toLowerCase() === 'right' ? 'right' : 'left';
    return {
        border: a.border && a.border !== '0' ? '1' : '0',
        collapse: s['border-collapse'] === 'collapse' ? 'collapse' : 'separate',
        cellspacing: a.cellspacing ?? '',
        cellpadding: a.cellpadding ?? '',
        // A width style is kept by the column resize plugin as tableWidth; a width attribute stays in the HTML
        width: (table.getAttribute('tableWidth') as string | undefined) ?? a.width ?? '',
        align
    };
}

/**
 * Borders on: border="1", drawn as single lines (cellspacing="0" and border-collapse: collapse) unless the table
 * has cell spacing of its own, which collapsing would remove; off: border="0".
 */
function setBorders(writer: ModelWriter, table: ModelElement, on: boolean) {
    const { attributes = {} } = ghsOf(table, 'htmlTableAttributes');
    const single = on && (attributes.cellspacing === undefined || attributes.cellspacing.trim() === '0');
    writeGhs(writer, table, 'htmlTableAttributes',
        on ? { border: '1', ...(single && { cellspacing: '0' }) } : { border: '0' },
        single ? { 'border-collapse': 'collapse' } : {});
}

function writeTable(writer: ModelWriter, table: ModelElement, values: Values) {
    if ('border' in values) {
        setBorders(writer, table, values.border === '1');
    }
    const attributes: Record<string, string | null> = {};
    const newStyles: Record<string, string | null> = {};
    if ('collapse' in values) {
        newStyles['border-collapse'] = values.collapse === 'collapse' ? 'collapse' : null;
    }
    for (const key of ['cellspacing', 'cellpadding']) {
        if (key in values) {
            attributes[key] = values[key].trim() || null;
        }
    }
    if ('width' in values) {
        // Kept as tableWidth, as the column resize plugin keeps a table's width style
        const width = values.width.trim();
        if (width) {
            writer.setAttribute('tableWidth', width, table);
        } else {
            writer.removeAttribute('tableWidth', table);
        }
        attributes.width = null;
    }
    if ('align' in values) {
        attributes.align = null;
        Object.assign(newStyles, values.align === 'center' ? { 'margin-left': 'auto', 'margin-right': 'auto' }
            : values.align === 'right' ? { 'margin-left': 'auto', 'margin-right': '0' }
            : { 'margin-left': null, 'margin-right': null });
    }
    writeGhs(writer, table, 'htmlTableAttributes', attributes, newStyles);
}

function cellValues(editor: Editor, cell: ModelElement): Values {
    const { attributes: a = {}, styles: s = {} } = ghsOf(cell, cellKey(editor, cell));
    const borders = Object.keys(s).filter(name => name === 'border' || name.startsWith('border-'));
    const none = s['border-style'] === 'none' || s.border === 'none' || s.border === '0'
        || ['top', 'right', 'bottom', 'left'].every(side => s[`border-${side}-style`] === 'none');
    const sides = ['top', 'right', 'bottom', 'left'].map(side => s[`padding-${side}`]);
    return {
        'vertical-align': s['vertical-align'] ?? a.valign ?? '',
        'text-align': s['text-align'] ?? a.align ?? '',
        padding: s.padding ?? (sides.every(v => v && v === sides[0]) ? sides[0] : ''),
        'background-color': s['background-color'] ?? s.background ?? a.bgcolor ?? '',
        // A width style is kept as tableCellWidth (CKEditor's cell width); a width attribute stays in the HTML
        width: (cell.getAttribute('tableCellWidth') as string | undefined) ?? a.width ?? '',
        border: !borders.length ? '' : none ? 'none' : 'custom'
    };
}

function writeCell(editor: Editor, writer: ModelWriter, cell: ModelElement, values: Values) {
    const key = cellKey(editor, cell);
    const { styles } = ghsOf(cell, key);
    const attributes: Record<string, string | null> = {};
    const newStyles: Record<string, string | null> = {};
    // Each setting replaces the cell's old attribute for it (valign, align, bgcolor, width), so they can't clash
    const legacy: Record<string, string> = { 'vertical-align': 'valign', 'text-align': 'align', 'background-color': 'bgcolor' };
    for (const name of ['vertical-align', 'text-align', 'background-color']) {
        if (name in values) {
            newStyles[name] = values[name].trim() || null;
            attributes[legacy[name]] = null;
        }
    }
    if ('width' in values) {
        const width = values.width.trim();
        if (width) {
            writer.setAttribute('tableCellWidth', width, cell);
        } else {
            writer.removeAttribute('tableCellWidth', cell);
        }
        attributes.width = null;
    }
    if ('padding' in values) {
        Object.assign(newStyles, removeAll(styles, 'padding'), { padding: values.padding.trim() || null });
    }
    if ('border' in values && values.border !== 'custom') {
        Object.assign(newStyles, removeAll(styles, 'border'),
            values.border === 'none' ? { 'border-style': 'none' }
            : values.border === 'solid' ? { border: '1px solid #000000' } : {});
    }
    writeGhs(writer, cell, key, attributes, newStyles);
}

/** Table settings: `values` holds only the settings to change (TABLE_FIELDS keys). */
class TableFormatCommand extends Command {
    declare value: Values | null;

    override refresh() {
        const table = selectedTable(this.editor);
        this.isEnabled = !!table;
        this.value = table ? tableValues(table) : null;
    }

    override execute({ values }: { values: Values }) {
        const table = selectedTable(this.editor);
        if (table) {
            this.editor.model.change(writer => writeTable(writer, table, values));
        }
    }
}

/** Cell settings for the selected cells: `values` holds only the settings to change (CELL_FIELDS keys). */
class CellFormatCommand extends Command {
    declare value: Values | null;

    override refresh() {
        const cells = selectedCells(this.editor);
        this.isEnabled = cells.length > 0;
        this.value = cells.length ? cellValues(this.editor, cells[0]) : null;
    }

    override execute({ values }: { values: Values }) {
        const cells = selectedCells(this.editor);
        this.editor.model.change(writer => cells.forEach(cell => writeCell(this.editor, writer, cell, values)));
    }
}

/** Turns the selected table's borders on or off. */
class TableBordersCommand extends Command {
    declare value: boolean;

    override refresh() {
        const table = selectedTable(this.editor);
        this.isEnabled = !!table;
        this.value = !!table && tableValues(table).border === '1';
    }

    override execute() {
        const table = selectedTable(this.editor);
        if (table) {
            this.editor.model.change(writer => setBorders(writer, table, !this.value));
        }
    }
}

/** A small form of labelled fields, for the dialog. */
class FormView extends View {
    private inputs = new Map<string, HTMLInputElement | HTMLSelectElement>();

    constructor(private fields: Field[], private initial: Values) {
        super();
        this.setTemplate({ tag: 'form', attributes: { class: 'ec-format-form' } });
    }

    override render() {
        super.render();
        const form = this.element as HTMLFormElement;
        form.addEventListener('submit', evt => evt.preventDefault());
        for (const field of this.fields) {
            const label = document.createElement('label');
            label.textContent = field.label;
            let input: HTMLInputElement | HTMLSelectElement;
            if (field.options) {
                input = document.createElement('select');
                const options = [...field.options];
                // A value the form has no option for (e.g. a cell's own border styles) is kept unless changed
                if (!options.some(([value]) => value === this.initial[field.key])) {
                    options.push([this.initial[field.key], 'As it is']);
                }
                for (const [value, text] of options) {
                    input.add(new Option(text, value));
                }
            } else {
                input = document.createElement('input');
                input.type = 'text';
                input.placeholder = field.placeholder ?? '';
            }
            input.value = this.initial[field.key] ?? '';
            label.appendChild(input);
            form.appendChild(label);
            this.inputs.set(field.key, input);
        }
    }

    focus() {
        this.inputs.values().next().value?.focus();
    }

    /** The settings changed from what the form opened with. */
    changes(): Values {
        const changed: Values = {};
        for (const [key, input] of this.inputs) {
            if (input.value !== (this.initial[key] ?? '')) {
                changed[key] = input.value;
            }
        }
        return changed;
    }
}

export class TableFormat extends Plugin {
    static get pluginName() {
        return 'TableFormat' as const;
    }

    static get requires() {
        return [Dialog] as const;
    }

    init() {
        const editor = this.editor;
        editor.commands.add('ecTableFormat', new TableFormatCommand(editor));
        editor.commands.add('ecCellFormat', new CellFormatCommand(editor));
        editor.commands.add('ecTableBorders', new TableBordersCommand(editor));

        // A cell's width="40%" attribute stays an attribute: CKEditor's cell width (needed by the column resize
        // plugin) takes it as its own setting and would write it back as a width style
        editor.conversion.for('upcast').add(dispatcher => {
            for (const name of ['td', 'th']) {
                dispatcher.on(`element:${name}`, (_evt, data: any, conversionApi) => {
                    const width = data.viewItem.getAttribute('width');
                    const cell = data.modelRange?.start.nodeAfter as ModelElement | undefined;
                    if (!width || !cell || data.viewItem.getStyle('width') || cell.getAttribute('tableCellWidth') !== width) {
                        return;
                    }
                    const key = name === 'th' ? 'htmlThAttributes' : 'htmlTdAttributes';
                    conversionApi.writer.removeAttribute('tableCellWidth', cell);
                    writeGhs(conversionApi.writer, cell, key, { width }, {});
                }, { priority: 'lowest' });
            }
        });

        // A table inserted from the toolbar gets borders and the page's full width (as 90 of the templates' tables
        // have; with no width, its empty cells would shrink to nothing), in the same undo step as the insert
        editor.commands.get('insertTable')!.on('execute', () => {
            const table = selectedTable(editor);
            const batch = editor.model.document.history.getOperations().at(-1)?.batch;
            if (table && batch) {
                editor.model.enqueueChange(batch, writer => {
                    setBorders(writer, table, true);
                    writer.setAttribute('tableWidth', '100%', table);
                });
            }
        }, { priority: 'low' });

        editor.ui.componentFactory.add('ecTableBorders', locale => {
            const command = editor.commands.get('ecTableBorders') as TableBordersCommand;
            const button = new ButtonView(locale);
            button.set({ label: 'Borders', withText: true, tooltip: 'Table borders on or off', isToggleable: true });
            button.bind('isOn', 'isEnabled').to(command, 'value', 'isEnabled');
            this.listenTo(button, 'execute', () => {
                editor.execute('ecTableBorders');
                editor.editing.view.focus();
            });
            return button;
        });
        this.addDialogButton('ecTableFormat', 'Table properties', IconTableProperties, TABLE_FIELDS);
        this.addDialogButton('ecCellFormat', 'Cell properties', IconTableCellProperties, CELL_FIELDS);
    }

    private addDialogButton(name: string, label: string, icon: string, fields: Field[]) {
        const editor = this.editor;
        editor.ui.componentFactory.add(name, locale => {
            const command = editor.commands.get(name) as TableFormatCommand | CellFormatCommand;
            const button = new ButtonView(locale);
            button.set({ label, icon, tooltip: true });
            button.bind('isEnabled').to(command);
            this.listenTo(button, 'execute', () => {
                const dialog = editor.plugins.get(Dialog);
                const form = new FormView(fields, command.value ?? {});
                dialog.show({
                    id: name,
                    title: label,
                    content: form,
                    isModal: true,
                    onShow: () => form.focus(),
                    actionButtons: [
                        { label: 'Cancel', withText: true, onExecute: () => dialog.hide() },
                        {
                            label: 'Apply', class: 'ck-button-action', withText: true,
                            onExecute: () => {
                                const values = form.changes();
                                dialog.hide();
                                if (Object.keys(values).length) {
                                    editor.execute(name, { values });
                                }
                                editor.editing.view.focus();
                            }
                        }
                    ]
                });
            });
            return button;
        });
    }
}
