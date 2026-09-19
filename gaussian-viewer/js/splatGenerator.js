const { vec3 } = glMatrix;
import { computeCovariance } from './covariance.js';

export class SplatGenerator {
    constructor(renderer, camera) {
        this.renderer = renderer;
        this.camera = camera;
        this.splatCount = 0;
        this.splats = [];  
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
            
            // custom scaling
            const baseScale = 0.15;
            const scale = baseScale + (t * 0.0005); 
            
            const scaleVector = [
                scale,
                scale * 0.9,
                scale * 0.9  
            ];

            // create the spiral by using a tangent
            const tangentX = -Math.sin(t * 4);
            const tangentZ = Math.cos(t * 4);
            const tangent = vec3.normalize([], [tangentX, 0.2, tangentZ]);
            const quat = this.vectorToQuaternion(tangent);
            
            const covariance = computeCovariance(scaleVector, quat);

            splats.push({
                position: [xPos, yPos, zPos],
                color: color,
                covariance: covariance,
                alpha: 0.9 // Slightly increased opacity
            });
        }


        this.splats = splats;
        this.splatCount = splats.length;
        return splats;
    }

    loadDualGaussianTest() {
        const splats = [];
        
        // Create main gaussian (red)
        const mainGaussian = {
            position: [0, 0, 0],
            color: [1.0, 0.2, 0.2],
            covariance: computeCovariance(
                [0.5, 1.0, 0.5],
                [0, 0, 0, 1]
            ),
            alpha: 1.0
        };
        
        // Create smaller gaussian (blue)
        const smallerGaussian = {
            position: [1, 0, 4],
            color: [0.2, 0.2, 1.0],
            covariance: computeCovariance(
                [0.3, 0.6, 0.3],
                [0, 0, 0, 1]
            ),
            alpha: 1.0
        };
    
        splats.push(mainGaussian);
        splats.push(smallerGaussian);
    
    
        this.splats = splats;
        this.splatCount = splats.length;
        return splats;
    }


    loadGridData(size = 25, spacing = 1.0) {
        const numSplats = size * size;
        const splats = [];
    
        for (let x = 0; x < size; x++) {
            for (let z = 0; z < size; z++) {
                const xPos = (x - size/2) * spacing * 2;
                const zPos = (z - size/2) * spacing * 2;
                const yPos = 0.2 * Math.sin(xPos) * Math.cos(zPos);
                
                // upward-facing normal
                const normal = [0, 1, 0];
                const quat = this.normalToQuaternion(normal);
                
                const scale = [
                    0.3 * spacing,  // narrow in X
                    1.0 * spacing,  // tall in Y
                    0.3 * spacing   // narrow in Z
                ];
                
                const covariance = computeCovariance(scale, quat);
                
                splats.push({
                    position: [xPos, yPos, zPos],
                    color: [
                        Math.abs(xPos/size),
                        Math.abs(yPos),
                        Math.abs(zPos/size)
                    ],
                    covariance: covariance,
                    alpha: 0.9
                });
            }
        }

        
        this.splats = splats;
        this.splatCount = splats.length;
        return splats;
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

    vectorToQuaternion(vector) {
        const up = [0, 1, 0];
        const dot = vector[0] * up[0] + vector[1] * up[1] + vector[2] * up[2];
        
        if (Math.abs(dot - 1) < 0.000001) {
            return [0, 0, 0, 1];
        }
        
        if (Math.abs(dot + 1) < 0.000001) {
            return [1, 0, 0, 0];
        }
        
        const rotationAxis = vec3.cross([], up, vector);
        vec3.normalize(rotationAxis, rotationAxis);
        const angle = Math.acos(dot);
        
        return this.angleAxisToQuaternion(angle, rotationAxis);
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