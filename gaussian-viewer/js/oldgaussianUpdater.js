import { vec3, mat4 } from 'gl-matrix';

class GaussianUpdater {
    constructor(renderer, camera) {
        this.renderer = renderer;
        this.camera = camera;
        this.lastProj = null;
        this.depthIndex = new Uint32Array();
        this.lastVertexCount = 0;
        this.sortRunning = false;
        
        // Pre-allocate buffers for better performance
        this.viewPosBuffer = new Float32Array(3); // For transformed positions
        this.depthBuckets = []; // For depth sorting
        this.maxBuckets = 131072; // Increased from 65536 for better precision
    }

    updateGaussians(viewProj, vertices, forceUpdate = false) {
        if (!vertices || vertices.length === 0) return;
        
        if (!forceUpdate && this.lastVertexCount === vertices.length) {
            const dot = this.lastProj ? 
                this.lastProj[2] * viewProj[2] + 
                this.lastProj[6] * viewProj[6] + 
                this.lastProj[10] * viewProj[10] : 0;
            if (Math.abs(dot - 1) < 0.15) return;
        }
    
        if (this.viewPosBuffer.length < vertices.length * 3) {
            this.viewPosBuffer = new Float32Array(vertices.length * 3);
        }
    
        const view = mat4.create();
        mat4.invert(view, this.camera.projMatrix);
        mat4.multiply(view, viewProj, view);
    
        // Create array for size of guassians
        const viewSpaceSizes = new Float32Array(vertices.length);
        let maxDepth = -Infinity;
        let minDepth = Infinity;
        
        const batchSize = 1024;
        for (let i = 0; i < vertices.length; i += batchSize) {
            const end = Math.min(i + batchSize, vertices.length);
            for (let j = i; j < end; j++) {
                const vertex = vertices[j];
                vec3.transformMat4(this.viewPosBuffer.subarray(j * 3), vertex.position, view);
                
                // Calculate view space size using covariance
                const cov = vertex.covariance;
                const depth = this.viewPosBuffer[j * 3 + 2];
                const size = Math.sqrt(cov[0] + cov[2]) / Math.abs(depth);
                viewSpaceSizes[j] = size;
                
                maxDepth = Math.max(maxDepth, depth + size);
                minDepth = Math.min(minDepth, depth - size);
            }
        }
    
        // Initialize consts and buckets based off of depth range and gaussian size
        const depthRange = maxDepth - minDepth;
        const avgSize = viewSpaceSizes.reduce((a, b) => a + b, 0) / vertices.length;
        const suggestedBuckets = Math.ceil(depthRange / (avgSize * 0.5));
        const bucketCount = Math.min(this.maxBuckets, Math.max(1000, suggestedBuckets));
        
        const depthInv = bucketCount / depthRange;
        const buckets = new Array(bucketCount).fill().map(() => []);
    
        // Put vertices in buckets
        for (let i = 0; i < vertices.length; i++) {
            const depth = this.viewPosBuffer[i * 3 + 2];
            const size = viewSpaceSizes[i];
            
            const startBucket = Math.max(0, Math.floor((depth - size - minDepth) * depthInv));
            const endBucket = Math.min(bucketCount - 1, Math.ceil((depth + size - minDepth) * depthInv));
            
            for (let b = startBucket; b <= endBucket; b++) {
                buckets[b].push({
                    index: i,
                    x: this.viewPosBuffer[i * 3],
                    y: this.viewPosBuffer[i * 3 + 1],
                    depth,
                    size
                });
            }
        }
    
        this.depthIndex = new Uint32Array(vertices.length);
        let currentIndex = 0;
        const seenIndices = new Set();
    
        // Sort bucket items far to near
        for (let i = bucketCount - 1; i >= 0; i--) {
            const bucket = buckets[i];
            if (bucket.length > 0) {
                bucket.sort((a, b) => {
                    const depthDiff = b.depth - a.depth;
                    const combinedSize = (a.size + b.size) * 0.5;
                    
                    if (Math.abs(depthDiff) < combinedSize) {
                        const dx = b.x - a.x;
                        const dy = b.y - a.y;
                        const spatialDist = Math.sqrt(dx * dx + dy * dy);
                        
                        if (spatialDist < combinedSize) {
                            return b.size - a.size; // Larger Gaussians first
                        }
                        return Math.abs(b.x) + Math.abs(b.y) - (Math.abs(a.x) + Math.abs(a.y));
                    }
                    return depthDiff;
                });
    
                for (const item of bucket) {
                    if (!seenIndices.has(item.index)) {
                        this.depthIndex[currentIndex++] = item.index;
                        seenIndices.add(item.index);
                    }
                }
            }
        }
    
        this.lastProj = new Float32Array(viewProj);
        this.lastVertexCount = vertices.length;
        this.updateGPUBuffers(vertices);
    }
    
    // Rest of the class remains unchanged...
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
    
            // If vertex already has covariance, use it directly
            if (vertex.covariance) {
                texdata[8 * i + 4] = this.packHalf2x16(vertex.covariance[0], vertex.covariance[1]);
                texdata[8 * i + 5] = this.packHalf2x16(vertex.covariance[2], vertex.covariance[3]);
                texdata[8 * i + 6] = this.packHalf2x16(0, 0);  // padding
            } else {
                // Calculate covariance if needed
                const covariance = this.computeCovariance(vertex.scale, vertex.rotation);
                texdata[8 * i + 4] = this.packHalf2x16(covariance[0], covariance[1]);
                texdata[8 * i + 5] = this.packHalf2x16(covariance[2], covariance[3]);
                texdata[8 * i + 6] = this.packHalf2x16(0, 0);  // padding
            }
    
            // Pack color and opacity (alpha)
            const r = Math.floor(vertex.color[0] * 255);
            const g = Math.floor(vertex.color[1] * 255);
            const b = Math.floor(vertex.color[2] * 255);
            const a = Math.floor(vertex.alpha * 255);
            texdata[8 * i + 7] = (a << 24) | (b << 16) | (g << 8) | r;
        }
    
        // Update renderer buffers
        this.renderer.updateTextureData(texdata, texwidth, texheight);
        this.renderer.updateIndexBuffer(this.depthIndex);
    }

    computeCovariance(scale, rotation) {
        const [qx, qy, qz, qw] = rotation;
        
        // Compute rotation matrix
        const M = [
            1.0 - 2.0 * (qy * qy + qz * qz),
            2.0 * (qx * qy + qz * qw),
            2.0 * (qx * qz - qy * qw),

            2.0 * (qx * qy - qz * qw),
            1.0 - 2.0 * (qx * qx + qz * qz),
            2.0 * (qy * qz + qx * qw),

            2.0 * (qx * qz + qy * qw),
            2.0 * (qy * qz - qx * qw),
            1.0 - 2.0 * (qx * qx + qy * qy)
        ].map((k, i) => k * scale[Math.floor(i / 3)]);

        // Compute covariance
        const sigma = [
            M[0] * M[0] + M[3] * M[3] + M[6] * M[6],
            M[0] * M[1] + M[3] * M[4] + M[6] * M[7],
            M[0] * M[2] + M[3] * M[5] + M[6] * M[8],
            M[1] * M[1] + M[4] * M[4] + M[7] * M[7]
        ];

        return sigma;
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

export { GaussianUpdater };