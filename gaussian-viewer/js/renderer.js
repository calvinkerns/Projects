
// extra logging + GL error checks (slow)
const DEBUG = false;

export class Renderer {
    constructor(gl, camera) {
        this.gl = gl;
        this.camera = camera;
        
        // Create shader program first
        this.program = this.createShaderProgram();
        if (!this.program) {
            throw new Error('Failed to create shader program');
        }

        // Get uniform locations
        this.uniforms = {
            projection: this.gl.getUniformLocation(this.program, 'projection'),
            view: this.gl.getUniformLocation(this.program, 'view'),
            focal: this.gl.getUniformLocation(this.program, 'focal'),
            viewport: this.gl.getUniformLocation(this.program, 'viewport'),
            texture: this.gl.getUniformLocation(this.program, 'u_texture'),
            debugMode: this.gl.getUniformLocation(this.program, 'debugMode'),
        };

        // Setup GL state and buffers
        this.setupGL();
        
        // Initialize debugMode
        this.gl.useProgram(this.program);
        this.gl.uniform1i(this.uniforms.debugMode, 0);
        this.gl.uniform1i(this.uniforms.texture, 0);
        this.gl.getExtension('EXT_color_buffer_float');
        this.gl.getExtension('OES_texture_float_linear');

        this.splatCount = 0;
    }

    setupGL() {
        this.gl.clearColor(0.0, 0.0, 0.0, 0.0);
        this.gl.disable(this.gl.DEPTH_TEST);
        this.gl.enable(this.gl.BLEND);

        // front-to-back blending, splats must be sorted nearest first
        this.gl.blendFuncSeparate(
            this.gl.ONE_MINUS_DST_ALPHA,  // src RGB
            this.gl.ONE,                  // dst RGB
            this.gl.ONE_MINUS_DST_ALPHA,  // src Alpha
            this.gl.ONE                   // dst Alpha
        );
        
        this.gl.blendEquationSeparate(
            this.gl.FUNC_ADD,  // RGB equation
            this.gl.FUNC_ADD   // Alpha equation
        );
    
        // Ensure program is bound
        this.gl.useProgram(this.program);
    
        // Create and setup vertex buffer
        const triangleVertices = new Float32Array([-2, -2, 2, -2, 2, 2, -2, 2]);
        this.vertexBuffer = this.gl.createBuffer();
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.vertexBuffer);
        this.gl.bufferData(this.gl.ARRAY_BUFFER, triangleVertices, this.gl.STATIC_DRAW);
    
        // Create and setup VAO
        this.vao = this.gl.createVertexArray();
        this.gl.bindVertexArray(this.vao);
    
        // Setup position attribute
        const positionLocation = this.gl.getAttribLocation(this.program, "position");
        this.gl.enableVertexAttribArray(positionLocation);
        this.gl.vertexAttribPointer(positionLocation, 2, this.gl.FLOAT, false, 0, 0);
    
        // Setup index buffer for instancing
        this.indexBuffer = this.gl.createBuffer();
        this.indexCapacityBytes = 0;
        const indexLocation = this.gl.getAttribLocation(this.program, "index");
        this.gl.enableVertexAttribArray(indexLocation);
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.indexBuffer);
        this.gl.vertexAttribIPointer(indexLocation, 1, this.gl.INT, false, 0, 0);
        this.gl.vertexAttribDivisor(indexLocation, 1);
    
        // Create and setup texture
        this.texture = this.gl.createTexture();
        this.gl.bindTexture(this.gl.TEXTURE_2D, this.texture);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_S, this.gl.CLAMP_TO_EDGE);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_T, this.gl.CLAMP_TO_EDGE);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.gl.NEAREST);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, this.gl.NEAREST);
    }

    // upload splat data, once per scene
    uploadSplatTexture(data, width, height) {
        this.gl.bindTexture(this.gl.TEXTURE_2D, this.texture);
        this.gl.texImage2D(
            this.gl.TEXTURE_2D,
            0,
            this.gl.RGBA32UI,
            width,
            height,
            0,
            this.gl.RGBA_INTEGER,
            this.gl.UNSIGNED_INT,
            data
        );
    }

    ensureIndexCapacity(count) {
        const bytes = count * 4;
        if (bytes <= this.indexCapacityBytes) return;
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.indexBuffer);
        this.gl.bufferData(this.gl.ARRAY_BUFFER, bytes, this.gl.DYNAMIC_DRAW);
        this.indexCapacityBytes = bytes;
    }

    // upload draw order each frame
    uploadOrder(indices, count) {
        if (!indices) {
            console.error('uploadOrder: received null indices');
            return;
        }
        this.ensureIndexCapacity(count);
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.indexBuffer);
        this.gl.bufferSubData(this.gl.ARRAY_BUFFER, 0, indices, 0, count);
        this.splatCount = count;

        if (DEBUG) {
            console.log(`uploadOrder: ${count} indices`);
        }
    }

    setDrawCount(count) {
        this.splatCount = count;
    }

    // used by the tiled updater
    updateTextureData(data, width, height) {
        this.uploadSplatTexture(data, width, height);
    }

    updateIndexBuffer(indices) {
        this.uploadOrder(indices, indices.length);
    }

    render() {
        if (!this.splatCount) return;

        const gl = this.gl;
        const uniforms = this.uniforms;

        gl.useProgram(this.program);

        gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
        gl.clear(gl.COLOR_BUFFER_BIT);

        gl.uniform2f(uniforms.focal, this.camera.fx, this.camera.fy);
        gl.uniform2f(uniforms.viewport, gl.canvas.width, gl.canvas.height);
        gl.uniformMatrix4fv(uniforms.view, false, this.camera.viewMatrix);
        gl.uniformMatrix4fv(uniforms.projection, false, this.camera.projMatrix);

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.texture);
        gl.bindVertexArray(this.vao);

        gl.drawArraysInstanced(gl.TRIANGLE_FAN, 0, 4, this.splatCount);

        if (DEBUG) {
            // gl.getError() forces a synchronous flush -- debug builds only.
            const error = gl.getError();
            if (error !== gl.NO_ERROR) {
                console.error('WebGL error:', error);
            }
        }
    }

    // Add this method to check WebGL state
    checkWebGLState() {
        const gl = this.gl;
        console.log('WebGL State Check:');
        console.log('- Canvas size:', gl.canvas.width, 'x', gl.canvas.height);
        console.log('- Viewport:', gl.getParameter(gl.VIEWPORT));
        console.log('- Active Texture:', gl.getParameter(gl.ACTIVE_TEXTURE));
        console.log('- Current Program:', gl.getParameter(gl.CURRENT_PROGRAM));
        console.log('- Blend Enabled:', gl.isEnabled(gl.BLEND));
        console.log('- Depth Test:', gl.isEnabled(gl.DEPTH_TEST));
        
        // Check texture state
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.texture);
        console.log('- Texture Bound:', gl.getParameter(gl.TEXTURE_BINDING_2D));
    }
    

    compileShader(type, source) {
        const shader = this.gl.createShader(type);
        if (!shader) {
            console.error('Failed to create shader');
            return null;
        }
    
        this.gl.shaderSource(shader, source);
        this.gl.compileShader(shader);
    
        if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
            console.error('Shader compilation failed:', 
                this.gl.getShaderInfoLog(shader),
                '\nShader source:', source
            );
            this.gl.deleteShader(shader);
            return null;
        }
    
        return shader;
    }
    
    createShaderProgram() {
        // First compile shaders
        const vertexShader = this.compileShader(this.gl.VERTEX_SHADER, vertexShaderSource);
        const fragmentShader = this.compileShader(this.gl.FRAGMENT_SHADER, fragmentShaderSource);
    
        // Check if compilation was successful
        if (!vertexShader || !fragmentShader) {
            console.error('Failed to compile shaders');
            return null;
        }
    
        // Create and link program
        const program = this.gl.createProgram();
        if (!program) {
            console.error('Failed to create shader program');
            return null;
        }
    
        this.gl.attachShader(program, vertexShader);
        this.gl.attachShader(program, fragmentShader);
        this.gl.linkProgram(program);
    
        // Check if linking was successful
        if (!this.gl.getProgramParameter(program, this.gl.LINK_STATUS)) {
            console.error('Shader program linking failed:', this.gl.getProgramInfoLog(program));
            this.gl.deleteProgram(program);
            return null;
        }
    
        // Clean up shaders
        this.gl.detachShader(program, vertexShader);
        this.gl.detachShader(program, fragmentShader);
        this.gl.deleteShader(vertexShader);
        this.gl.deleteShader(fragmentShader);
    
        return program;
    }
    
    setDebugMode(mode) {
        this.gl.useProgram(this.program);
        const debugModeLocation = this.gl.getUniformLocation(this.program, 'debugMode');
        if (debugModeLocation) {
            this.gl.uniform1i(debugModeLocation, mode);
        }
    }
    
}

const vertexShaderSource = `#version 300 es
precision highp float;
precision highp int;
precision highp usampler2D;

uniform usampler2D u_texture;
uniform mat4 projection;
uniform mat4 view;
uniform vec2 focal;
uniform vec2 viewport;
uniform float tan_fovx;
uniform float tan_fovy;

in vec2 position;
in int index;

out vec4 vColor;
out vec2 vPosition;

void main() {
    // Decode texture coordinates
    ivec2 texCoordCenter = ivec2((uint(index) & 0x3FFu) << 1, uint(index) >> 10);
    ivec2 texCoordCov = ivec2(((uint(index) & 0x3FFu) << 1) | 1u, uint(index) >> 10);
    
    // Fetch center data and decode to float
    uvec4 centerData = texelFetch(u_texture, texCoordCenter, 0);
    vec3 center = uintBitsToFloat(centerData.xyz);
    
    // Transform to view space
    vec4 viewPos = view * vec4(center, 1.0);
    vec4 clipPos = projection * viewPos;
    
    // Modified culling check - make it less aggressive
    float margin = 1.5; // Increased from 1.2
    float w = clipPos.w;
    if (clipPos.z < -w * margin || clipPos.z > w * margin ||
        clipPos.x < -w * margin || clipPos.x > w * margin ||
        clipPos.y < -w * margin || clipPos.y > w * margin) {
        gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
        return;
    }

    // Rest of your original shader code unchanged
    uvec4 covData = texelFetch(u_texture, texCoordCov, 0);

    // Six unique terms of the symmetric 3D covariance, in WORLD space.
    vec2 covA = unpackHalf2x16(covData.x);   // 00, 01
    vec2 covB = unpackHalf2x16(covData.y);   // 02, 11
    vec2 covC = unpackHalf2x16(covData.z);   // 12, 22
    mat3 covariance = mat3(
        covA.x, covA.y, covB.x,
        covA.y, covB.y, covC.x,
        covB.x, covC.x, covC.y
    );

    // EWA splatting: Sigma_2D = J * (W * Sigma_3D * W^T) * J^T
    mat3 W = mat3(view);
    mat3 covView = W * covariance * transpose(W);

    // projection jacobian
    float zInv = 1.0 / viewPos.z;
    float zInv2 = zInv * zInv;
    mat3 J = mat3(
        -focal.x * zInv,               0.0,                           0.0,
         0.0,                         -focal.y * zInv,                0.0,
         focal.x * viewPos.x * zInv2,  focal.y * viewPos.y * zInv2,   0.0
    );

    mat3 transformedCov = J * covView * transpose(J);
    
    float low_pass_filter = 0.5;
    transformedCov[0][0] += low_pass_filter;
    transformedCov[1][1] += low_pass_filter;

    float a = transformedCov[0][0];
    float b = transformedCov[0][1];
    float c = transformedCov[1][1];
    float trace = a + c;
    float det = a * c - b * b;
    float disc = sqrt(max(0.0, trace * trace - 4.0 * det));
    float lambda1 = (trace + disc) * 0.5;
    float lambda2 = (trace - disc) * 0.5;
    
    lambda1 = max(lambda1, 0.05);
    lambda2 = max(lambda2, 0.05);

    vec2 eigenvector = normalize(vec2(lambda1 - c, b));
    if (abs(b) < 1e-6 && abs(lambda1 - c) < 1e-6) {
        eigenvector = vec2(1.0, 0.0);
    }

    vec2 majorAxis = eigenvector * sqrt(2.0 * lambda1);
    vec2 minorAxis = vec2(-eigenvector.y, eigenvector.x) * sqrt(2.0 * lambda2);

    majorAxis *= (viewPos.w / viewport) * 2.0;
    minorAxis *= (viewPos.w / viewport) * 2.0;

    vColor = vec4(
        float(covData.w & 0xFFu) / 255.0,
        float((covData.w >> 8) & 0xFFu) / 255.0,
        float((covData.w >> 16) & 0xFFu) / 255.0,
        float((covData.w >> 24) & 0xFFu) / 255.0
    );
    vPosition = position;

    vec2 scaledPosition = position * 2.0;
    vec2 offset = (scaledPosition.x * majorAxis + scaledPosition.y * minorAxis);
    
    // Modified final position to handle depth better
    gl_Position = vec4(
        clipPos.xy / clipPos.w + offset,
        clipPos.z / clipPos.w,  // Keep z-depth from projection
        1.0
    );
}
`;

const fragmentShaderSource = `#version 300 es
    precision highp float;

    in vec4 vColor;
    in vec2 vPosition;
    
    uniform int debugMode;
    out vec4 fragColor;

    void main() {
        // More gradual falloff calculation
        float radiusSq = dot(vPosition, vPosition);
        float falloff = exp(-radiusSq * 1.0); // Adjust the 1.0 multiplier to control falloff rate
        
        // Increased discard threshold for cleaner edges
        if (falloff < 0.005) discard; // Increased from 0.01 for softer cutoff

        vec4 debugColor;
        switch(debugMode) {
            case 0: // Normal rendering
                debugColor = vColor;
                break;
            case 2: // Gaussian falloff visualization
                debugColor = vec4(vec3(falloff), 1.0);
                break;
            default:
                debugColor = vColor;
        }

        float alpha = falloff * debugColor.a;
    
        vec3 rgb = debugColor.rgb * alpha;
        
        fragColor = vec4(rgb, alpha);
    }
`;
