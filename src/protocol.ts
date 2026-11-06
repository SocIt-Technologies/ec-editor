/**
 * The messages between the EMR and this editor - the only link between them. The editor runs in an iframe the EMR
 * embeds; each side accepts messages only from the other's window and origin.
 *
 * EMR -> editor
 *   init     {html, readOnly, terms}  - create the editor with this content
 *   setData  {html}                   - replace the content (a change the EMR made, e.g. filling a placeholder);
 *                                       not echoed back as a change
 *   terms    {terms}                  - the special terms typed after "[[" (they may arrive after init)
 *   footer   {footer}                 - the report footer printed on every page, for where the pages end
 *                                       (also in init)
 *   letterhead {mm}                   - height of a letterhead pre-printed on the hospital's sheets: every page
 *                                       starts below it (also in init, as letterheadMm; 0 for plain paper)
 * editor -> EMR
 *   ready                             - listening; send init
 *   change   {html}                   - the doctor changed the content (at most every 300 ms)
 */
export interface SpecialTerm {
    key: string;
    value: string;
}

export type ToEditor =
    | { type: 'init'; html: string; readOnly?: boolean; terms?: SpecialTerm[]; footer?: string; letterheadMm?: number }
    | { type: 'setData'; html: string }
    | { type: 'terms'; terms: SpecialTerm[] }
    | { type: 'footer'; footer: string }
    | { type: 'letterhead'; mm: number };

export type FromEditor =
    | { type: 'ready' }
    | { type: 'change'; html: string };
