export class TXTParser {
    static async parseTXT(file) {
        try {
            console.log('Starting to parse TXT file:', file.name, 'size:', file.size);
            const text = await file.text();
            const lines = text.trim().split('\n');
            
            console.log(`Found ${lines.length} splats`);
            
            // Process each line into a splat
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
                
                // Validate quaternion normalization
                const qLen = Math.sqrt(rot_i * rot_i + rot_j * rot_j + rot_k * rot_k + rot_w * rot_w);
                const rotation = qLen > 0 ? [
                    rot_i / qLen,
                    rot_j / qLen,
                    rot_k / qLen,
                    rot_w / qLen
                ] : [0, 0, 0, 1];
                
                // Calculate covariance matrix
                const covariance = this.computeCovariance(
                    [scale_x, scale_y, scale_z],
                    rotation
                );
                
                // Add the splat with normalized values
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
    
    static computeCovariance(scale, rotation) {
        const [qx, qy, qz, qw] = rotation;
        
        // Compute rotation matrix
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

        // Scale matrix elements should be positive and non-zero
        const S = scale.map(s => Math.max(s, 0.0001));
        
        // Apply scaling to rotation matrix
        const M = R.map((k, i) => k * S[Math.floor(i / 3)]);

        // Compute covariance matrix elements with improved numerical stability
        return [
            M[0] * M[0] + M[3] * M[3] + M[6] * M[6],
            M[0] * M[1] + M[3] * M[4] + M[6] * M[7],
            M[1] * M[1] + M[4] * M[4] + M[7] * M[7]
        ];
    }
}