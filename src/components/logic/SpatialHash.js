export class SpatialHash {
    constructor(cellSize) {
        this.cellSize = cellSize;
        this.cells = new Map();
    }

    _key(x, z) {
        const cx = Math.floor(x / this.cellSize);
        const cz = Math.floor(z / this.cellSize);
        return `${cx},${cz}`;
    }

    clear() {
        this.cells.clear();
    }

    insert(id, item, x, z) {
        const key = this._key(x, z);
        let cell = this.cells.get(key);
        if (!cell) {
            cell = new Map();
            this.cells.set(key, cell);
        }
        cell.set(id, item);
    }

    remove(id, x, z) {
        const key = this._key(x, z);
        const cell = this.cells.get(key);
        if (cell) {
            cell.delete(id);
        }
    }

    query(x, z, radius) {
        const result = [];
        const cx = Math.floor(x / this.cellSize);
        const cz = Math.floor(z / this.cellSize);
        const range = Math.ceil(radius / this.cellSize);

        const rSq = radius * radius;

        for (let i = cx - range; i <= cx + range; i++) {
            for (let j = cz - range; j <= cz + range; j++) {
                const key = `${i},${j}`;
                const cell = this.cells.get(key);
                if (cell) {
                    for (const item of cell.values()) {
                        // Support both raw vectors and unit objects
                        const px = item.position ? item.position.x : item.x;
                        const pz = item.position ? item.position.z : item.z;

                        const dx = px - x;
                        const dz = pz - z;

                        if (dx * dx + dz * dz <= rSq) {
                            result.push(item);
                        }
                    }
                }
            }
        }
        return result;
    }
}
