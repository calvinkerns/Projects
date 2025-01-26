import { vec3, mat4 } from 'gl-matrix';

export class GaussianUpdater {
    constructor(renderer, camera) {
        this.renderer = renderer;
        this.camera = camera;
        this.lastProj = null;
        this.lastVertexCount = 0;

        // Tile configuration
        this.TILE_SIZE = 16;
        this.MAX_TILES_X = Math.ceil(this.renderer.gl.canvas.width / this.TILE_SIZE);
        this.MAX_TILES_Y = Math.ceil(this.renderer.gl.canvas.height / this.TILE_SIZE);
        
        // Pre-allocate buffers
        this.viewPosBuffer = new Float32Array(3);
        this.tileInstances = []; // Will store splat instances per tile
        this.sortKeys = new BigUint64Array(1024); // Will be resized as needed
        this.sortedIndices = new Uint32Array(1024);
    }

    getTileIndex(screenX, screenY) {
        const tileX = Math.floor(screenX / this.TILE_SIZE);
        const tileY = Math.floor(screenY / this.TILE_SIZE);
        return tileY * this.MAX_TILES_X + tileX;
    }

    createSortKey(tileIndex, depth) {
        // Create 64-bit key: upper 32 bits for tile, lower 32 for depth
        const depthBits = Math.floor((1.0 - depth) * 0xFFFFFFFF);
        return BigInt(tileIndex) << 32n | BigInt(depthBits);
    }

    projectToScreen(position, viewProj) {
        const clipSpace = vec3.transformMat4(vec3.create(), position, viewProj);
        if (clipSpace[2] >= -1.0 && clipSpace[2] <= 1.0) {
            // Convert to screen space
            const w = clipSpace[2];
            const screenX = (clipSpace[0] / w + 1.0) * 0.5 * this.renderer.gl.canvas.width;
            const screenY = (clipSpace[1] / w + 1.0) * 0.5 * this.renderer.gl.canvas.height;
            return { x: screenX, y: screenY, depth: w };
        }
        return null;
    }

    getSplatTiles(position, radius, viewProj) {
        const screenPos = this.projectToScreen(position, viewProj);
        if (!screenPos) {
            return { tiles: [], depth: 1.0 }; // Return default depth when projection fails
        }

        // Calculate tile range that this splat might overlap
        const minTileX = Math.max(0, Math.floor((screenPos.x - radius) / this.TILE_SIZE));
        const maxTileX = Math.min(this.MAX_TILES_X - 1, Math.floor((screenPos.x + radius) / this.TILE_SIZE));
        const minTileY = Math.max(0, Math.floor((screenPos.y - radius) / this.TILE_SIZE));
        const maxTileY = Math.min(this.MAX_TILES_Y - 1, Math.floor((screenPos.y + radius) / this.TILE_SIZE));

        const tiles = [];
        for (let y = minTileY; y <= maxTileY; y++) {
            for (let x = minTileX; x <= maxTileX; x++) {
                tiles.push(y * this.MAX_TILES_X + x);
            }
        }
        return { tiles, depth: screenPos.depth };
    }

    resizeBuffers(totalInstances) {
        if (this.sortKeys.length < totalInstances) {
            const newSize = Math.max(totalInstances, this.sortKeys.length * 2);
            this.sortKeys = new BigUint64Array(newSize);
            this.sortedIndices = new Uint32Array(newSize);
        }
    }

    radixSort(keys, indices, n) {
        // Implement GPU-style radix sort in JavaScript
        const RADIX_BITS = 8;
        const RADIX_SIZE = 1 << RADIX_BITS;
        const RADIX_MASK = RADIX_SIZE - 1;
        
        const tempKeys = new BigUint64Array(n);
        const tempIndices = new Uint32Array(n);
        
        // Sort 64-bit keys in 8 passes (8 bits per pass)
        for (let shift = 0; shift < 64; shift += RADIX_BITS) {
            const count = new Uint32Array(RADIX_SIZE);
            
            // Count digits
            for (let i = 0; i < n; i++) {
                const digit = Number((keys[i] >> BigInt(shift)) & BigInt(RADIX_MASK));
                count[digit]++;
            }
            
            // Compute offsets
            let total = 0;
            for (let i = 0; i < RADIX_SIZE; i++) {
                const oldCount = count[i];
                count[i] = total;
                total += oldCount;
            }
            
            // Move elements
            for (let i = 0; i < n; i++) {
                const digit = Number((keys[i] >> BigInt(shift)) & BigInt(RADIX_MASK));
                const dest = count[digit]++;
                tempKeys[dest] = keys[i];
                tempIndices[dest] = indices[i];
            }
            
            // Copy back
            keys.set(tempKeys.subarray(0, n));
            indices.set(tempIndices.subarray(0, n));
        }
    }

    updateGaussians(viewProj, vertices, forceUpdate = false) {
        if (!vertices || vertices.length === 0) return;

        // Check if update is needed
        if (!forceUpdate && this.lastVertexCount === vertices.length) {
            const dot = this.lastProj ? 
                this.lastProj[2] * viewProj[2] + 
                this.lastProj[6] * viewProj[6] + 
                this.lastProj[10] * viewProj[10] : 0;
            if (Math.abs(dot - 1) < 0.15) return;
        }

        // Clear previous instances
        this.tileInstances = [];

        // Calculate splat instances for each tile
        let totalInstances = 0;
        for (let i = 0; i < vertices.length; i++) {
            const vertex = vertices[i];
            const radius = Math.sqrt(vertex.covariance[0] + vertex.covariance[2]); // Approximate radius
            const result = this.getSplatTiles(vertex.position, radius, viewProj);
            
            for (const tileIndex of result.tiles) {
                this.tileInstances.push({
                    vertexIndex: i,
                    tileIndex: tileIndex,
                    depth: result.depth
                });
                totalInstances++;
            }
        }

        // If no instances were created, use simple front-to-back order
        if (totalInstances === 0) {
            const indices = new Uint32Array(vertices.length);
            for (let i = 0; i < vertices.length; i++) {
                indices[i] = i;
            }
            this.renderer.updateIndexBuffer(indices);
            return;
        }

        // Resize buffers if needed
        this.resizeBuffers(totalInstances);

        // Create sort keys
        for (let i = 0; i < totalInstances; i++) {
            const instance = this.tileInstances[i];
            this.sortKeys[i] = this.createSortKey(instance.tileIndex, instance.depth);
            this.sortedIndices[i] = instance.vertexIndex;
        }

        // Sort instances
        this.radixSort(this.sortKeys, this.sortedIndices, totalInstances);

        // Update GPU buffers
        this.updateGPUBuffers(vertices);
        
        // Store state for next frame
        this.lastProj = new Float32Array(viewProj);
        this.lastVertexCount = vertices.length;
    }

    updateGPUBuffers(vertices) {
        const texwidth = 1024 * 2;
        const texheight = Math.ceil((2 * vertices.length) / texwidth);
        const texdata = new Uint32Array(texwidth * texheight * 4);
        const texdata_f = new Float32Array(texdata.buffer);

        for (let i = 0; i < vertices.length; i++) {
            const vertex = vertices[i];
            
            // Position data
            texdata_f[8 * i + 0] = vertex.position[0];
            texdata_f[8 * i + 1] = vertex.position[1];
            texdata_f[8 * i + 2] = vertex.position[2];

            // Covariance data
            if (vertex.covariance) {
                texdata[8 * i + 4] = this.packHalf2x16(vertex.covariance[0], vertex.covariance[1]);
                texdata[8 * i + 5] = this.packHalf2x16(vertex.covariance[2], 0);
            }

            // Color and opacity
            const r = Math.floor(vertex.color[0] * 255);
            const g = Math.floor(vertex.color[1] * 255);
            const b = Math.floor(vertex.color[2] * 255);
            const a = Math.floor(vertex.alpha * 255);
            texdata[8 * i + 7] = (a << 24) | (b << 16) | (g << 8) | r;
        }

        this.renderer.updateTextureData(texdata, texwidth, texheight);
        this.renderer.updateIndexBuffer(this.sortedIndices);
    }

    packHalf2x16(x, y) {
        return (this.floatToHalf(x) | (this.floatToHalf(y) << 16)) >>> 0;
    }

    floatToHalf(float) {
        const floatView = new Float32Array(1);
        const int32View = new Int32Array(floatView.buffer);
        
        floatView[0] = float;
        const f = int32View[0];
        
        const sign = (f >> 31) & 0x0001;
        const exp = (f >> 23) & 0x00ff;
        let frac = f & 0x007fffff;
        
        let newExp;
        if (exp === 0) {
            newExp = 0;
        } else if (exp < 113) {
            newExp = 0;
            frac |= 0x00800000;
            const shift = 113 - exp;
            frac = frac >> shift;
            if (frac & (1 << (shift - 1))) {
                newExp = 1;
            }
        } else if (exp < 142) {
            newExp = exp - 112;
        } else {
            newExp = 31;
            frac = 0;
        }
        
        return (sign << 15) | (newExp << 10) | (frac >> 13);
    }
}