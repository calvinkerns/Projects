import { vec3 } from 'gl-matrix';

export class SplatGenerator {
    constructor(renderer, camera) {
        this.renderer = renderer;
        this.camera = camera;
        this.splatCount = 0;
        this.splats = [];  
    }

    static floatToHalf(float) {
        var floatView = new Float32Array(1);
        var int32View = new Int32Array(floatView.buffer);
        
        floatView[0] = float;
        var f = int32View[0];
        
        var sign = (f >> 31) & 0x0001;
        var exp = (f >> 23) & 0x00ff;
        var frac = f & 0x007fffff;
        
        var newExp;
        if (exp === 0) {
            newExp = 0;
        } else if (exp < 113) {
            newExp = 0;
            frac |= 0x00800000;
            frac = frac >> (113 - exp);
            if (frac & 0x01000000) {
                newExp = 1;
                frac = 0;
            }
        } else if (exp < 142) {
            newExp = exp - 112;
        } else {
            newExp = 31;
            frac = 0;
        }
        
        return (sign << 15) | (newExp << 10) | (frac >> 13);
    }

    static packHalf2x16(x, y) {
        return (SplatGenerator.floatToHalf(x) | (SplatGenerator.floatToHalf(y) << 16)) >>> 0;
    }

    loadSpiralData() {
        const numPoints = 10000;
        const splats = [];
        
        for (let i = 0; i < numPoints; i++) {
            const t = i * 0.1;
            const r = Math.sqrt(t) * 2;
            
            const xPos = r * Math.cos(t * 4);
            const yPos = t * 0.2 - 5;
            const zPos = r * Math.sin(t * 4);
            
            const hue = t * 0.1 % 1;
            const color = this.hslToRgb(hue, 0.8, 0.5);
            
            const angle = t * 4;
            const quat = this.angleAxisToQuaternion(angle, [0, 1, 0]);
            const scale = 1.0 + (t * 0.002); // Increased base scale and growth rate
            const covariance = this.computeCovariance(
                [scale, scale * 0.7, scale * 0.5], // Increased relative scales
                quat
            );

            splats.push({
                position: [xPos, yPos, zPos],
                color: color,
                covariance: covariance,
                alpha: 0.8
            });
        }

        const textureData = this.generateTextureData(splats);
        this.renderer.updateTextureData(textureData.data, textureData.width, textureData.height);
        
        const indices = new Uint32Array(splats.length);
        for (let i = 0; i < splats.length; i++) indices[i] = i;
        this.renderer.updateIndexBuffer(indices);

        this.splats = splats;  
        this.splatCount = splats.length;
    }

    loadGridData(size = 25, spacing = 1.0) {
        const numSplats = size * size;
        const splats = [];
    
        for (let x = 0; x < size; x++) {
            for (let z = 0; z < size; z++) {
                const xPos = (x - size/2) * spacing;
                const zPos = (z - size/2) * spacing;
                const yPos = 0.2 * Math.sin(xPos) * Math.cos(zPos);
                
                // Calculate surface normal for orientation
                const dx = 0.2 * Math.cos(xPos) * Math.cos(zPos);
                const dz = -0.2 * Math.sin(xPos) * Math.sin(zPos);
                const normal = vec3.normalize([], [dx, 1, dz]);
                
                const quat = this.normalToQuaternion(normal);
                const scale = [2.0 * spacing, 0.5 * spacing, 1.0 * spacing];
                
                const covariance = this.computeCovariance(scale, quat);
                
                splats.push({
                    position: [xPos, yPos, zPos],
                    color: [
                        Math.abs(xPos/size),
                        Math.abs(yPos),
                        Math.abs(zPos/size)
                    ],
                    covariance: covariance,
                    alpha: 1.0
                });
            }
        }

        const textureData = this.generateTextureData(splats);
        this.renderer.updateTextureData(textureData.data, textureData.width, textureData.height);
        
        const indices = new Uint32Array(splats.length);
        for (let i = 0; i < splats.length; i++) indices[i] = i;
        this.renderer.updateIndexBuffer(indices);
        
        this.splats = splats;  
        this.splatCount = splats.length;
    }

    generateTextureData(splats) {
        const texwidth = 1024 * 2;
        const texheight = Math.ceil((2 * splats.length) / texwidth);
        const texdata = new Uint32Array(texwidth * texheight * 4);
        const texdata_f = new Float32Array(texdata.buffer);

        for (let i = 0; i < splats.length; i++) {
            const splat = splats[i];
            
            // Position data
            texdata_f[8 * i + 0] = splat.position[0];
            texdata_f[8 * i + 1] = splat.position[1];
            texdata_f[8 * i + 2] = splat.position[2];

            // Covariance data
            texdata[8 * i + 4] = SplatGenerator.packHalf2x16(splat.covariance[0], splat.covariance[1]);
            texdata[8 * i + 5] = SplatGenerator.packHalf2x16(splat.covariance[2], splat.covariance[3]);
            texdata[8 * i + 6] = SplatGenerator.packHalf2x16(0, 0);  // padding

            // Color and alpha
            const r = Math.floor(splat.color[0] * 255);
            const g = Math.floor(splat.color[1] * 255);
            const b = Math.floor(splat.color[2] * 255);
            const a = Math.floor(splat.alpha * 255);
            texdata[8 * i + 7] = (a << 24) | (b << 16) | (g << 8) | r;
        }

        return {
            data: texdata,
            width: texwidth,
            height: texheight
        };
    }

    hslToRgb(h, s, l) {
        if (s === 0) return [l, l, l];
        const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
        const p = 2 * l - q;
        const hue2rgb = (t) => {
            if (t < 0) t += 1;
            if (t > 1) t -= 1;
            if (t < 1/6) return p + (q - p) * 6 * t;
            if (t < 1/2) return q;
            if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
            return p;
        };
        return [
            hue2rgb(h + 1/3),
            hue2rgb(h),
            hue2rgb(h - 1/3)
        ];
    }

    computeCovariance(scale, rotation) {
        const [qx, qy, qz, qw] = rotation;
        
        // Create rotation matrix
        const R = [
            1.0 - 2.0 * (qy * qy + qz * qz),
            2.0 * (qx * qy + qz * qw),
            2.0 * (qx * qz - qy * qw),
    
            2.0 * (qx * qy - qz * qw),
            1.0 - 2.0 * (qx * qx + qz * qz),
            2.0 * (qy * qz + qx * qw),
    
            2.0 * (qx * qz + qy * qw),
            2.0 * (qy * qz - qx * qw),
            1.0 - 2.0 * (qx * qx + qy * qy)
        ];
    
        // Scale matrix with original scales
        const S = scale.map(s => Math.max(s, 0.0001)); // Prevent zero scales
        const M = R.map((k, i) => k * S[Math.floor(i / 3)]);
    
        // Compute upper triangular part of covariance matrix
        return [
            M[0] * M[0] + M[3] * M[3] + M[6] * M[6],
            M[0] * M[1] + M[3] * M[4] + M[6] * M[7],
            M[1] * M[1] + M[4] * M[4] + M[7] * M[7]
        ];
    }

    angleAxisToQuaternion(angle, axis) {
        const halfAngle = angle * 0.5;
        const s = Math.sin(halfAngle);
        return [
            axis[0] * s,
            axis[1] * s,
            axis[2] * s,
            Math.cos(halfAngle)
        ];
    }

    normalToQuaternion(normal) {
        const up = [0, 1, 0];
        const axis = vec3.cross([], up, normal);
        const angle = Math.acos(vec3.dot(up, normal));
        return this.angleAxisToQuaternion(angle, axis);
    }
}