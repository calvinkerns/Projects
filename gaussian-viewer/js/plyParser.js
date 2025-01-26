export class PLYParser {

    static sh_to_rgb(dc0, dc1, dc2) {
        // Improved spherical harmonics to RGB conversion with proper scaling
        const r = Math.exp(dc0 - 0.5);
        const g = Math.exp(dc1 - 0.5);
        const b = Math.exp(dc2 - 0.5);
        
        // Improved color normalization with gamma correction
        const maxVal = Math.max(r, g, b, 1e-5);
        const scale = Math.min(1.0, 1.0 / maxVal);
        
        // Apply gamma correction (assuming sRGB space)
        const gamma = 1.0 / 2.2;
        return [
            Math.pow(r * scale, gamma),
            Math.pow(g * scale, gamma),
            Math.pow(b * scale, gamma)
        ];
    }
    
    static parseHeader(headerText) {
        const lines = headerText.split('\n');
        const header = {
            vertexCount: 0,
            properties: [],
            propertyIndices: {}
        };

        let propertyIndex = 0;
        for (const line of lines) {
            const tokens = line.trim().split(/\s+/);
            if (tokens[0] === 'element' && tokens[1] === 'vertex') {
                header.vertexCount = parseInt(tokens[2]);
                console.log(`Found ${header.vertexCount} vertices`);
            } else if (tokens[0] === 'property' && tokens[1] === 'float') {
                header.properties.push({
                    type: tokens[1],
                    name: tokens[2]
                });
                header.propertyIndices[tokens[2]] = propertyIndex++;
                console.log(`Found property: ${tokens[2]} at index ${propertyIndex-1}`);
            }
        }

        return header;
    }

    static async parsePLY(file) {
        try {
            console.log('Starting to parse PLY file:', file.name, 'size:', file.size);
            const buffer = await file.arrayBuffer();
            const decoder = new TextDecoder();
            
            // Find header end
            let headerEnd = 0;
            let headerText = '';
            const headerView = new Uint8Array(buffer);
            
            // Look for end_header\n
            const endHeaderStr = 'end_header\n';
            for (let i = 0; i < Math.min(1000, headerView.length - endHeaderStr.length); i++) {
                let found = true;
                for (let j = 0; j < endHeaderStr.length; j++) {
                    if (headerView[i + j] !== endHeaderStr.charCodeAt(j)) {
                        found = false;
                        break;
                    }
                }
                if (found) {
                    headerEnd = i + endHeaderStr.length;
                    headerText = decoder.decode(headerView.slice(0, headerEnd));
                    break;
                }
            }

            if (!headerEnd) {
                throw new Error('Could not find end of header');
            }

            console.log('Header found:', headerText);
            const header = this.parseHeader(headerText);

            // Calculate expected data size
            const expectedBytes = header.vertexCount * header.properties.length * 4; // 4 bytes per float
            const actualBytes = buffer.byteLength - headerEnd;
            console.log(`Expected ${expectedBytes} bytes of data, got ${actualBytes} bytes`);

            // Read vertex data
            const dataView = new DataView(buffer, headerEnd);
            const floatArray = new Float32Array(header.vertexCount * header.properties.length);
            
            // Read and verify first vertex
            console.log('Reading first vertex data:');
            for (let j = 0; j < header.properties.length; j++) {
                const value = dataView.getFloat32(j * 4, true); 
                floatArray[j] = value;
                console.log(`${header.properties[j].name}: ${value}`);
            }

            // Read all vertices
            let offset = 0;
            for (let i = 0; i < header.vertexCount; i++) {
                for (let j = 0; j < header.properties.length; j++) {
                    try {
                        floatArray[offset] = dataView.getFloat32((i * header.properties.length + j) * 4, true);
                    } catch (e) {
                        console.error(`Error reading vertex ${i} property ${j}:`, e);
                        throw e;
                    }
                    offset++;
                }
            }

            console.log(`Successfully read ${header.vertexCount} vertices`);
            return this.processVertices(floatArray, header);
        } catch (error) {
            console.error('Error parsing PLY:', error);
            throw error;
        }
    }

    static processVertices(floatArray, header) {
        const splats = [];
        const vertexSize = header.properties.length;
        
        // Get indices for required properties
        const indices = {
            x: header.propertyIndices['x'],
            y: header.propertyIndices['y'],
            z: header.propertyIndices['z'],
            nx: header.propertyIndices['nx'],
            ny: header.propertyIndices['ny'],
            nz: header.propertyIndices['nz'],
            f_dc_0: header.propertyIndices['f_dc_0'],
            f_dc_1: header.propertyIndices['f_dc_1'],
            f_dc_2: header.propertyIndices['f_dc_2'],
            opacity: header.propertyIndices['opacity'],
            scale_0: header.propertyIndices['scale_0'],
            scale_1: header.propertyIndices['scale_1'],
            scale_2: header.propertyIndices['scale_2'],
            rot_0: header.propertyIndices['rot_0'],
            rot_1: header.propertyIndices['rot_1'],
            rot_2: header.propertyIndices['rot_2'],
            rot_3: header.propertyIndices['rot_3']
        };

        // Find bounds for centering
        let minX = Infinity, maxX = -Infinity;
        let minY = Infinity, maxY = -Infinity;
        let minZ = Infinity, maxZ = -Infinity;

        // First pass: find bounds
        for (let i = 0; i < floatArray.length; i += vertexSize) {
            minX = Math.min(minX, floatArray[i + indices.x]);
            maxX = Math.max(maxX, floatArray[i + indices.x]);
            minY = Math.min(minY, floatArray[i + indices.y]);
            maxY = Math.max(maxY, floatArray[i + indices.y]);
            minZ = Math.min(minZ, floatArray[i + indices.z]);
            maxZ = Math.max(maxZ, floatArray[i + indices.z]);
        }

        const centerX = (minX + maxX) / 2;
        const centerY = (minY + maxY) / 2;
        const centerZ = (minZ + maxZ) / 2;

        // Calculate scale to normalize the model size
        const maxSize = Math.max(maxX - minX, maxY - minY, maxZ - minZ);
        const scale_factor = 10.0 / maxSize; //keep at ten, good size

        // Second pass: process vertices with adjusted scaling
        for (let i = 0; i < floatArray.length; i += vertexSize) {
            // Position with adjusted scaling
            const position = [
                (floatArray[i + indices.x] - centerX) * scale_factor,
                (floatArray[i + indices.y] - centerY) * scale_factor,
                (floatArray[i + indices.z] - centerZ) * scale_factor
            ];

            // Scale values with increased base size
            const scaleMultiplier = 6.0; //try increasing this if the gaussians look small
            const scales = [
                Math.exp(floatArray[i + indices.scale_0]) * scaleMultiplier,
                Math.exp(floatArray[i + indices.scale_1]) * scaleMultiplier,
                Math.exp(floatArray[i + indices.scale_2]) * scaleMultiplier
            ];

            // Normalize rotation quaternion
            const rotation = [
                floatArray[i + indices.rot_0],
                floatArray[i + indices.rot_1],
                floatArray[i + indices.rot_2],
                floatArray[i + indices.rot_3]
            ];
            const qLen = Math.sqrt(rotation.reduce((sum, v) => sum + v * v, 0));
            if (qLen > 0) {
                rotation[0] /= qLen;
                rotation[1] /= qLen;
                rotation[2] /= qLen;
                rotation[3] /= qLen;
            }

            // Compute covariance with adjusted scales
            const covariance = this.computeCovariance(scales, rotation);

            // Convert colors using SH coefficients
            const color = this.sh_to_rgb(
                floatArray[i + indices.f_dc_0],
                floatArray[i + indices.f_dc_1],
                floatArray[i + indices.f_dc_2]
            );

            // Adjust opacity for better coverage
            const rawOpacity = floatArray[i + indices.opacity];
            const opacity = Math.min(1.0, Math.exp(rawOpacity) * 1.2); // Increased opacity

            // Only add splat if opacity is significant
            if (opacity > 0.001) {
                splats.push({
                    position: position,
                    color: color,
                    covariance: covariance,
                    alpha: opacity
                });
            }
        }

        return splats;
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

        // Ensure minimum scale values
        // const minScale = 0.001;
        // const S = scale.map(s => Math.max(s, minScale));

        const S = scale;

        // Apply scaling to rotation matrix
        const M = R.map((k, i) => k * S[Math.floor(i / 3)]);

        // Compute covariance matrix elements with overlap factor
        const overlapFactor = 1.0; // Increase for more overlap between Gaussians
        return [
            (M[0] * M[0] + M[3] * M[3] + M[6] * M[6]) * overlapFactor,
            M[0] * M[1] + M[3] * M[4] + M[6] * M[7],
            M[1] * M[1] + M[4] * M[4] + M[7] * M[7]
        ];
    }

}