import { Plugin, FileRepository } from 'ckeditor5';

const MAX_WIDTH = 900;
const JPEG_QUALITY = 0.7;

/**
 * Images pasted, dropped or inserted go into the report itself, as data URLs - reports have no image store - shrunk
 * to at most 900 px wide and saved as JPEG at 70% quality, as the EMR's CKEditor 4 did, so a photo doesn't make the
 * report megabytes long.
 */
export class ImageEmbed extends Plugin {
    static get requires() {
        return [FileRepository] as const;
    }

    static get pluginName() {
        return 'ImageEmbed' as const;
    }

    init() {
        this.editor.plugins.get(FileRepository).createUploadAdapter = loader => ({
            upload: () => loader.file.then(file => shrink(file!)).then(url => ({ default: url })),
            abort: () => undefined
        });
    }
}

function shrink(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(reader.error);
        reader.onload = () => {
            const image = new Image();
            image.onerror = () => reject(new Error('Not an image'));
            image.onload = () => {
                const scale = Math.min(1, MAX_WIDTH / image.width);
                const canvas = document.createElement('canvas');
                canvas.width = Math.round(image.width * scale);
                canvas.height = Math.round(image.height * scale);
                canvas.getContext('2d')!.drawImage(image, 0, 0, canvas.width, canvas.height);
                resolve(canvas.toDataURL('image/jpeg', JPEG_QUALITY));
            };
            image.src = reader.result as string;
        };
        reader.readAsDataURL(file);
    });
}
