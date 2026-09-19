// Splat ordering + GPU upload.
//
// Static per-splat data (position / covariance / colour) is packed and uploaded
// ONCE per scene in setSplats(). Per frame we only recompute the draw ORDER and
// upload the index buffer -- the texture never changes when the camera moves.

const DEBUG = false;

// Scratch views for float->half conversion. Hoisted to module scope: allocating
// these per call was ~2.7M throwaway typed arrays per frame.
const HALF_F32 = new Float32Array(1);
const HALF_I32 = new Int32Array(HALF_F32.buffer);

function floatToHalf(value) {
    HALF_F32[0] = value;
    const f = HALF_I32[0];

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

function packHalf2x16(x, y) {
    return (floatToHalf(x) | (floatToHalf(y) << 16)) >>> 0;
}

// Splats are bucketed by depth into 2^16 bins and counting-sorted. One pass,
// no comparisons, no BigInt -- ~4ms for 341k splats vs ~135ms for the previous
// 8-pass BigInt radix sort.
const DEPTH_BINS = 65536;

// Must match the frustum margin in the vertex shader, so the CPU drops exactly
// the splats the shader would have degenerate-culled (no visible change).
const CULL_MARGIN = 1.5;

export class GaussianUpdater {
    constructor(renderer, camera) {
        this.renderer = renderer;
        this.camera = camera;

        this.count = 0;          // number of splats in the scene
        this.positions = null;   // Float32Array(3n), flat SoA
        this.depths = null;      // Float32Array(n), scratch
        this.bins = null;        // Uint32Array(n), scratch
        this.visible = null;     // Uint32Array(n), scratch (splat indices)
        this.order = null;       // Uint32Array(n), scratch (sorted output)
        this.counts = new Uint32Array(DEPTH_BINS);

        this.viewProj = new Float32Array(16);
    }

    // ---- scene load: pack + upload everything that does not depend on the camera ----
    setSplats(splats) {
        if (!splats || splats.length === 0) {
            this.count = 0;
            this.renderer.setDrawCount(0);
            return;
        }

        const n = splats.length;
        this.count = n;

        this.positions = new Float32Array(n * 3);
        this.depths = new Float32Array(n);
        this.bins = new Uint32Array(n);
        this.visible = new Uint32Array(n);
        this.order = new Uint32Array(n);

        // Texture layout must stay byte-identical to what the vertex shader
        // decodes: texel (2*(i&0x3FF), i>>10) holds the centre, the next texel
        // holds covariance + packed colour. That works out to a flat stride of 8.
        const texwidth = 1024 * 2;
        const texheight = Math.ceil((2 * n) / texwidth);
        const texdata = new Uint32Array(texwidth * texheight * 4);
        const texdata_f = new Float32Array(texdata.buffer);

        for (let i = 0; i < n; i++) {
            const splat = splats[i];
            const p = splat.position;

            this.positions[3 * i + 0] = p[0];
            this.positions[3 * i + 1] = p[1];
            this.positions[3 * i + 2] = p[2];

            texdata_f[8 * i + 0] = p[0];
            texdata_f[8 * i + 1] = p[1];
            texdata_f[8 * i + 2] = p[2];

            // Six unique terms of the symmetric 3x3 covariance, two per texel
            // channel. Channel .z was previously unused padding.
            const cov = splat.covariance;
            if (cov) {
                texdata[8 * i + 4] = packHalf2x16(cov[0], cov[1]);   // 00, 01
                texdata[8 * i + 5] = packHalf2x16(cov[2], cov[3]);   // 02, 11
                texdata[8 * i + 6] = packHalf2x16(cov[4], cov[5]);   // 12, 22
            }

            const c = splat.color;
            const r = Math.floor(c[0] * 255);
            const g = Math.floor(c[1] * 255);
            const b = Math.floor(c[2] * 255);
            const a = Math.floor(splat.alpha * 255);
            texdata[8 * i + 7] = (a << 24) | (b << 16) | (g << 8) | r;
        }

        this.renderer.uploadSplatTexture(texdata, texwidth, texheight);
        this.renderer.ensureIndexCapacity(n);

        // Start in submission order so something is on screen before the first sort.
        for (let i = 0; i < n; i++) this.order[i] = i;
        this.renderer.uploadOrder(this.order, n);

        if (DEBUG) {
            console.log(`setSplats: ${n} splats, texture ${texwidth}x${texheight} ` +
                        `(${(texdata.byteLength / 1048576).toFixed(1)} MB, uploaded once)`);
        }
    }

    // ---- per frame: cull, depth-sort, upload indices only ----
    updateOrder(camera) {
        const n = this.count;
        if (!n) return;

        const cam = camera || this.camera;
        const view = cam.viewMatrix;
        const proj = cam.projMatrix;

        // viewProj = proj * view, written into a reused scratch (column-major).
        const vp = this.viewProj;
        for (let c = 0; c < 4; c++) {
            const v0 = view[c * 4 + 0], v1 = view[c * 4 + 1];
            const v2 = view[c * 4 + 2], v3 = view[c * 4 + 3];
            vp[c * 4 + 0] = proj[0] * v0 + proj[4] * v1 + proj[8] * v2 + proj[12] * v3;
            vp[c * 4 + 1] = proj[1] * v0 + proj[5] * v1 + proj[9] * v2 + proj[13] * v3;
            vp[c * 4 + 2] = proj[2] * v0 + proj[6] * v1 + proj[10] * v2 + proj[14] * v3;
            vp[c * 4 + 3] = proj[3] * v0 + proj[7] * v1 + proj[11] * v2 + proj[15] * v3;
        }

        const pos = this.positions;
        const depths = this.depths;
        const visible = this.visible;

        // View-space z row, for a linear (and always positive in front) depth.
        const vz0 = view[2], vz1 = view[6], vz2 = view[10], vz3 = view[14];

        let visCount = 0;
        let minDepth = Infinity;
        let maxDepth = -Infinity;

        for (let i = 0; i < n; i++) {
            const x = pos[3 * i + 0], y = pos[3 * i + 1], z = pos[3 * i + 2];

            const cw = vp[3] * x + vp[7] * y + vp[11] * z + vp[15];
            if (cw <= 0) continue;                       // behind the camera

            const limit = cw * CULL_MARGIN;

            const cx = vp[0] * x + vp[4] * y + vp[8] * z + vp[12];
            if (cx < -limit || cx > limit) continue;
            const cy = vp[1] * x + vp[5] * y + vp[9] * z + vp[13];
            if (cy < -limit || cy > limit) continue;
            const cz = vp[2] * x + vp[6] * y + vp[10] * z + vp[14];
            if (cz < -limit || cz > limit) continue;

            // Distance along the view axis, positive and increasing away from
            // the camera. Linear, so it bins far better than NDC z did.
            const d = -(vz0 * x + vz1 * y + vz2 * z + vz3);

            visible[visCount] = i;
            depths[visCount] = d;
            if (d < minDepth) minDepth = d;
            if (d > maxDepth) maxDepth = d;
            visCount++;
        }

        if (visCount === 0) {
            this.renderer.setDrawCount(0);
            return;
        }

        // Counting sort, ascending depth => NEAREST FIRST. That is the order the
        // front-to-back "under" blend in setupGL() requires.
        const span = maxDepth - minDepth;
        const scale = span > 0 ? (DEPTH_BINS - 1) / span : 0;

        const bins = this.bins;
        const counts = this.counts;
        counts.fill(0);

        for (let k = 0; k < visCount; k++) {
            const bin = ((depths[k] - minDepth) * scale) | 0;
            bins[k] = bin;
            counts[bin]++;
        }

        let running = 0;
        for (let b = 0; b < DEPTH_BINS; b++) {
            const c = counts[b];
            counts[b] = running;
            running += c;
        }

        const order = this.order;
        for (let k = 0; k < visCount; k++) {
            order[counts[bins[k]]++] = visible[k];
        }

        this.renderer.uploadOrder(order, visCount);
    }

    // Back-compat shim for the old signature. Re-packs the static texture only
    // when the splat array actually changed identity.
    updateGaussians(viewProj, vertices, forceUpdate = false) {
        if (!vertices || vertices.length === 0) return;
        if (vertices !== this._lastSplats) {
            this._lastSplats = vertices;
            this.setSplats(vertices);
        }
        this.updateOrder(this.camera);
    }
}
