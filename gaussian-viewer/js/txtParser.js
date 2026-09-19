import { computeCovariance } from './covariance.js';

export class TXTParser {
    static async parseTXT(file) {
        try {
            console.log('Starting to parse TXT file:', file.name, 'size:', file.size);
            const text = await file.text();
            const lines = text.trim().split('\n');
            
            console.log(`Found ${lines.length} splats`);
            
            const splats = [];
            
            for (let i = 0; i < lines.length; i++) {
                const values = lines[i].trim().split(/\s+/).map(Number);
                
                // Each line should have 14 values
                if (values.length !== 14) {
                    console.error(`Line ${i + 1} has incorrect number of values: ${values.length}, expected 14`);
                    continue;
                }
                
                const [
                    pos_x, pos_y, pos_z,          // Position (0-2)
                    rot_i, rot_j, rot_k, rot_w,   // Rotation quaternion (3-6)
                    scale_x, scale_y, scale_z,    // Scale (7-9)
                    r, g, b,                      // Color (10-12)
                    alpha                         // Alpha (13)
                ] = values;
                
                //  quaternion normalization
                const qLen = Math.sqrt(rot_i * rot_i + rot_j * rot_j + rot_k * rot_k + rot_w * rot_w);
                const rotation = qLen > 0 ? [
                    rot_i / qLen,
                    rot_j / qLen,
                    rot_k / qLen,
                    rot_w / qLen
                ] : [0, 0, 0, 1];
                
                const covariance = computeCovariance(
                    [scale_x, scale_y, scale_z],
                    rotation
                );
                
                splats.push({
                    position: [pos_x, pos_y, pos_z],
                    color: [
                        Math.max(0, Math.min(1, r)),
                        Math.max(0, Math.min(1, g)),
                        Math.max(0, Math.min(1, b))
                    ],
                    covariance: covariance,
                    alpha: Math.max(0, Math.min(1, alpha))  
                });
            }
            
            console.log(`Successfully processed ${splats.length} splats`);
            return splats;
            
        } catch (error) {
            console.error('Error parsing TXT file:', error);
            throw error;
        }
    }
    
}