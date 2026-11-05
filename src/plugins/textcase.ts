import { Plugin, Command, createDropdown, addListToDropdown, UIModel, Collection } from 'ckeditor5';
import type { ListDropdownItemDefinition } from 'ckeditor5';

/** The cases offered, each a transform of a piece of text that keeps its length (so the selection stays put). */
const CASES: Record<string, { label: string; transform: (text: string) => string }> = {
    upper: { label: 'UPPER CASE', transform: text => text.toUpperCase() },
    lower: { label: 'lower case', transform: text => text.toLowerCase() },
    capitalize: {
        label: 'Capitalize Words',
        transform: text => text.toLowerCase().replace(/(^|[\s(\[{"'-])(\p{L})/gu, (_m, before, letter) => before + letter.toUpperCase())
    }
};

/**
 * Changes the case of the selected text - as CKEditor 4's texttransform plugin did (upper, lower, capitalize),
 * keeping its formatting. Not in CKEditor 5's open source plugins.
 */
export class TextCase extends Plugin {
    static get pluginName() {
        return 'TextCase' as const;
    }

    init() {
        const editor = this.editor;
        editor.commands.add('textCase', new TextCaseCommand(editor));

        editor.ui.componentFactory.add('textCase', locale => {
            const command = editor.commands.get('textCase')!;
            const dropdown = createDropdown(locale);
            dropdown.buttonView.set({ label: 'Aa', withText: true, tooltip: 'Change case' });
            const items = new Collection<ListDropdownItemDefinition>();
            for (const [key, { label }] of Object.entries(CASES)) {
                items.add({ type: 'button', model: new UIModel({ label, withText: true, caseKey: key }) });
            }
            addListToDropdown(dropdown, items);
            dropdown.bind('isEnabled').to(command);
            this.listenTo(dropdown, 'execute', evt => {
                editor.execute('textCase', { to: (evt.source as any).caseKey });
                editor.editing.view.focus();
            });
            return dropdown;
        });
    }
}

class TextCaseCommand extends Command {
    override refresh() {
        this.isEnabled = !this.editor.model.document.selection.isCollapsed;
    }

    override execute({ to }: { to: string }) {
        const transform = CASES[to]?.transform;
        if (!transform) {
            return;
        }
        const model = this.editor.model;
        model.change(writer => {
            // Every transform keeps the text's length, so these ranges stay valid as the pieces are replaced
            const selected = Array.from(model.document.selection.getRanges());
            const pieces = selected.flatMap(range => Array.from(range.getItems()))
                .filter(item => item.is('$textProxy'))
                .map((item: any) => ({
                    range: writer.createRange(writer.createPositionBefore(item), writer.createPositionAfter(item)),
                    text: item.data as string,
                    attributes: Object.fromEntries(item.getAttributes())
                }));
            for (const piece of pieces) {
                writer.remove(piece.range);
                writer.insertText(transform(piece.text), piece.attributes, piece.range.start);
            }
            writer.setSelection(selected);
        });
    }
}
