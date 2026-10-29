import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { HostProgramPicker } from '../js/ui/HostProgramPicker.js';
import { BackendClient } from '../js/api/BackendClient.js';

vi.mock('../js/api/BackendClient.js', () => ({ BackendClient: { get: vi.fn(), post: vi.fn() } }));
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
describe('host program selection', () => {
    beforeEach(() => {
        HTMLDialogElement.prototype.showModal = function () {
            this.open = true;
        };
        HTMLDialogElement.prototype.close = function () {
            this.dispatchEvent(new Event('close'));
        };
        const folder = {
            path: 'C:/Games',
            parent: 'C:/',
            entries: [
                { name: 'Folder', path: 'C:/Games/Folder', directory: true },
                { name: 'My Game.exe', path: 'C:/Games/My Game.exe', directory: false },
            ],
        };
        const program = {
            name: 'My Game',
            command: '"C:\\Games\\My Game.exe"',
            png: 'abc',
        };
        BackendClient.post.mockImplementation(async (path) =>
            path.endsWith('/browse') ? folder : program,
        );
    });
    afterEach(() => {
        vi.clearAllMocks();
        document.body.replaceChildren();
    });
    it('selects the precise host executable and returns its metadata without adding or launching it', async () => {
        const selected = vi.fn();
        const root = HostProgramPicker.open(selected);
        await flush();
        root.querySelectorAll('.host-program-entry')[1].click();
        await flush();
        expect(
            BackendClient.post.mock.calls.filter(([path]) => path.endsWith('/inspect')),
        ).toHaveLength(1);
        expect(BackendClient.post).toHaveBeenCalledWith('/api/host-apps/inspect', {
            path: 'C:/Games/My Game.exe',
        });
        expect(selected).toHaveBeenCalledWith({
            name: 'My Game',
            command: '"C:\\Games\\My Game.exe"',
            png: 'abc',
        });
        expect(root.isConnected).toBe(false);
    });
    it('navigates host folders and filters names', async () => {
        const root = HostProgramPicker.open(vi.fn());
        await flush();
        root.querySelector('.host-program-entry').click();
        await flush();
        expect(BackendClient.post).toHaveBeenLastCalledWith('/api/host-apps/browse', {
            path: 'C:/Games/Folder',
        });
        const filter = root.querySelector('[data-filter]');
        filter.value = 'my game';
        filter.dispatchEvent(new Event('input'));
        expect(root.querySelectorAll('.host-program-entry')).toHaveLength(1);
        expect(BackendClient.post.mock.calls.some(([path]) => path.endsWith('/inspect'))).toBe(
            false,
        );
    });
    it('keeps the dialog open and shows an inspect error', async () => {
        const previous = BackendClient.post.getMockImplementation();
        BackendClient.post.mockImplementation((path, body) =>
            path.endsWith('/inspect')
                ? Promise.reject(new Error('File missing'))
                : previous(path, body),
        );
        const selected = vi.fn();
        const root = HostProgramPicker.open(selected);
        await flush();
        root.querySelectorAll('.host-program-entry')[1].click();
        await flush();
        expect(root.querySelector('[data-error]').textContent).toBe('File missing');
        expect(selected).not.toHaveBeenCalled();
        expect(root.isConnected).toBe(true);
    });
});
