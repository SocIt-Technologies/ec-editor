import { Plugin, Command, createDropdown, addListToDropdown, UIModel, Collection } from 'ckeditor5';
import type { ListDropdownItemDefinition, DowncastAttributeDescriptor } from 'ckeditor5';

/** The line heights offered; "Default" removes it. */
const LINE_HEIGHTS = ['1', '1.15', '1.5', '2', '2.5', '3'];

/**
 * Line height of the selected paragraphs, headings and list items, kept as style="line-height: X" on the block -
 * as CKEditor 4's lineheight plugin wrote it in the reports. Not in CKEditor 5's open source plugins.
 */
export class LineHeight extends Plugin {
    static get pluginName() {
        return 'LineHeight' as const;
    }

    init() {
        const editor = this.editor;
        editor.model.schema.extend('$block', { allowAttributes: 'lineHeight' });
        editor.model.schema.setAttributeProperties('lineHeight', { isFormatting: true });

        editor.conversion.for('upcast').attributeToAttribute({
            view: { styles: { 'line-height': /[\s\S]+/ } },
            model: {
                key: 'lineHeight',
                value: (viewElement: any) => viewElement.getStyle('line-height')
            }
        });
        editor.conversion.for('downcast').attributeToAttribute({
            model: 'lineHeight',
            view: (value: unknown): DowncastAttributeDescriptor => ({ key: 'style', value: { 'line-height': String(value) } })
        });

        editor.commands.add('lineHeight', new LineHeightCommand(editor));

        editor.ui.componentFactory.add('lineHeight', locale => {
            const command = editor.commands.get('lineHeight') as LineHeightCommand;
            const dropdown = createDropdown(locale);
            dropdown.buttonView.set({ label: 'Line height', withText: true, tooltip: true });
            const items = new Collection<ListDropdownItemDefinition>();
            for (const value of [null, ...LINE_HEIGHTS]) {
                const model = new UIModel({ label: value ?? 'Default', withText: true, commandValue: value });
                model.bind('isOn').to(command, 'value', current => current === value);
                items.add({ type: 'button', model });
            }
            addListToDropdown(dropdown, items);
            dropdown.bind('isEnabled').to(command);
            this.listenTo(dropdown, 'execute', evt => {
                editor.execute('lineHeight', { value: (evt.source as any).commandValue });
                editor.editing.view.focus();
            });
            return dropdown;
        });
    }
}

class LineHeightCommand extends Command {
    declare value: string | null;

    override refresh() {
        const blocks = Array.from(this.editor.model.document.selection.getSelectedBlocks());
        this.isEnabled = blocks.some(block => this.editor.model.schema.checkAttribute(block, 'lineHeight'));
        const first = blocks[0];
        this.value = first ? (first.getAttribute('lineHeight') as string) ?? null : null;
    }

    override execute({ value }: { value: string | null }) {
        const model = this.editor.model;
        model.change(writer => {
            for (const block of model.document.selection.getSelectedBlocks()) {
                if (!model.schema.checkAttribute(block, 'lineHeight')) {
                    continue;
                }
                if (value) {
                    writer.setAttribute('lineHeight', value, block);
                } else {
                    writer.removeAttribute('lineHeight', block);
                }
            }
        });
    }
}
