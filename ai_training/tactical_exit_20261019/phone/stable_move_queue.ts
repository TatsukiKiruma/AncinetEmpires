import type { Position } from '../../../src/game/types';

interface MoveEntry { pos: Position; cost: number; }
interface OrderedEntry { value: MoveEntry; order: number; }

/** 同代价严格按入队次序取出，与原稳定排序队列保持一致。 */
export class StableMoveQueue {
    private items: OrderedEntry[] = [];
    private sequence = 0;
    get length() { return this.items.length; }
    private before(a: OrderedEntry, b: OrderedEntry) {
        return a.value.cost < b.value.cost || (a.value.cost === b.value.cost && a.order < b.order);
    }
    push(value: MoveEntry) {
        const entry = { value, order: this.sequence++ };
        let index = this.items.length;
        this.items.push(entry);
        while (index > 0) {
            const parent = (index - 1) >> 1;
            if (!this.before(entry, this.items[parent])) break;
            this.items[index] = this.items[parent];
            index = parent;
        }
        this.items[index] = entry;
    }
    shift(): MoveEntry | undefined {
        const first = this.items[0], last = this.items.pop();
        if (!last || !this.items.length) return first?.value;
        let index = 0;
        while (index * 2 + 1 < this.items.length) {
            let child = index * 2 + 1;
            if (child + 1 < this.items.length && this.before(this.items[child + 1], this.items[child])) child++;
            if (!this.before(this.items[child], last)) break;
            this.items[index] = this.items[child];
            index = child;
        }
        this.items[index] = last;
        return first.value;
    }
}
