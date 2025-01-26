import { vec3 } from 'gl-matrix';

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
        this.gl.clearColor(0.0, 0.0, 0.0, 1.0);
        this.gl.disable(this.gl.DEPTH_TEST);
        this.gl.enable(this.gl.BLEND);
        this.gl.blendFunc(this.gl.ONE, this.gl.ONE_MINUS_SRC_ALPHA);
        this.gl.blendEquation(this.gl.FUNC_ADD);

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

    updateTextureData(data, width, height) {
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

    updateIndexBuffer(indices) {
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.indexBuffer);
        this.gl.bufferData(this.gl.ARRAY_BUFFER, indices, this.gl.DYNAMIC_DRAW);
        this.splatCount = indices.length;
    }

    render() {
        if (!this.splatCount) {
            console.log('No splats to render');
            return;
        }
    
        // Cache and verify WebGL context
        const gl = this.gl;
        if (!gl) {
            console.error('No WebGL context');
            return;
        }
    
        // Verify program is valid
        if (!this.program) {
            console.error('No valid shader program');
            return;
        }
    
        // Bind program and verify
        gl.useProgram(this.program);
        
        // Check all required uniforms
        const uniforms = this.uniforms;
        for (const [name, location] of Object.entries(uniforms)) {
            if (location === null) {
                console.error(`Missing uniform: ${name}`);
            }
        }
    
        // Set viewport and clear
        gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
        gl.clear(gl.COLOR_BUFFER_BIT);
    
        // Update uniforms
        gl.uniform2f(uniforms.focal, this.camera.fx, this.camera.fy);
        gl.uniform2f(uniforms.viewport, gl.canvas.width, gl.canvas.height);
        gl.uniformMatrix4fv(uniforms.view, false, this.camera.viewMatrix);
        gl.uniformMatrix4fv(uniforms.projection, false, this.camera.projMatrix);
    
        // Verify texture binding
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.texture);
        
        // Verify VAO binding
        gl.bindVertexArray(this.vao);
        
        // Log rendering attempt
        // console.log(`Attempting to render ${this.splatCount} splats`);
    
        // Draw with error checking
        try {
            gl.drawArraysInstanced(gl.TRIANGLE_FAN, 0, 4, this.splatCount);
            const error = gl.getError();
            if (error !== gl.NO_ERROR) {
                console.error('WebGL error:', error);
            }
        } catch (e) {
            console.error('Render error:', e);
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

// Uniforms
uniform usampler2D u_texture;
uniform mat4 projection;
uniform mat4 view;
uniform vec2 focal;
uniform vec2 viewport;

uniform float tan_fovx;
uniform float tan_fovy;

// Inputs
in vec2 position;
in int index;

// Outputs
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

    // Culling check with adjusted margin
    float margin = 5.0;  // Increased margin
    float w = clipPos.w;
    if (clipPos.z < -w * margin || clipPos.z > w * margin ||
        clipPos.x < -w * margin || clipPos.x > w * margin ||
        clipPos.y < -w * margin || clipPos.y > w * margin) {
        gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
        return;
    }

    // Fetch covariance data
    uvec4 covData = texelFetch(u_texture, texCoordCov, 0);
    mat3 covariance = mat3(
        unpackHalf2x16(covData.x).x, unpackHalf2x16(covData.x).y, 0.0,
        unpackHalf2x16(covData.x).y, unpackHalf2x16(covData.y).x, 0.0,
        0.0, 0.0, 1.0
    );

    // Improved Jacobian computation
    float zInv = 1.0 / viewPos.z;
    mat3 J = mat3(
        focal.x * zInv, 0.0, -focal.x * viewPos.x * zInv * zInv,
        0.0, focal.y * zInv, -focal.y * viewPos.y * zInv * zInv,
        0.0, 0.0, 0.0
    );

    // Transform covariance to screen space
    mat3 transformedCov = J * covariance * transpose(J);
    
    // Improved eigenvalue computation with better numerical stability
    float a = transformedCov[0][0];
    float b = transformedCov[0][1];
    float c = transformedCov[1][1];
    
    // Use a more numerically stable method for eigenvalues
    float trace = a + c;
    float det = a * c - b * b;
    float disc = sqrt(max(0.0, trace * trace - 4.0 * det));
    float lambda1 = (trace + disc) * 0.5;
    float lambda2 = (trace - disc) * 0.5;
    
    // Ensure minimum visible size
    lambda1 = max(lambda1, 0.1);
    lambda2 = max(lambda2, 0.1);

    // Compute axes with proper scaling
    vec2 eigenvector = normalize(vec2(lambda1 - c, b));
    if (abs(b) < 1e-6 && abs(lambda1 - c) < 1e-6) {
        eigenvector = vec2(1.0, 0.0);
    }

    vec2 majorAxis = eigenvector * sqrt(2.0 * lambda1);
    vec2 minorAxis = vec2(-eigenvector.y, eigenvector.x) * sqrt(2.0 * lambda2);

    // Scale for screen space
    majorAxis *= (viewPos.w / viewport) * 2.0;
    minorAxis *= (viewPos.w / viewport) * 2.0;

    // Set vertex color and position
    vColor = vec4(
        float(covData.w & 0xFFu) / 255.0,
        float((covData.w >> 8) & 0xFFu) / 255.0,
        float((covData.w >> 16) & 0xFFu) / 255.0,
        float((covData.w >> 24) & 0xFFu) / 255.0
    );
    vPosition = position;

    // Transform to clip space
    vec2 scaledPosition = position * 2.0;
    vec2 offset = (scaledPosition.x * majorAxis + scaledPosition.y * minorAxis);

    gl_Position = vec4(
        clipPos.xy / clipPos.w + offset,
        clipPos.z / clipPos.w,
        1.0
    );
}
`;

const fragmentShaderSource = `#version 300 es
    precision highp float;

    // Inputs
    in vec4 vColor;
    in vec2 vPosition;
    
    uniform int debugMode;

    // Output
    out vec4 fragColor;

    vec3 heatmap(float value) {
        value = clamp(value, 0.0, 1.0);
        return vec3(
            smoothstep(0.5, 0.8, value),
            smoothstep(0.0, 0.5, value) - smoothstep(0.5, 1.0, value),
            1.0 - smoothstep(0.2, 0.5, value)
        );
    }

    void main() {
        float radiusSq = dot(vPosition, vPosition);
        float falloff = exp(-radiusSq);

        if (falloff < 0.01) discard;

        vec4 debugColor;
        switch(debugMode) {
            case 0: // Normal rendering
                debugColor = vColor;
                break;

            case 2: // Gaussian falloff visualization
                debugColor = vec4(vec3(falloff), 1.0);
                break;
            case 3: // Position visualization
                debugColor = vec4(normalize(vec3(abs(vPosition), 0.0)), 1.0);
                break;
            default:
                debugColor = vColor;
        }

        float alpha = falloff * debugColor.a;
        fragColor = vec4(debugColor.rgb * alpha, alpha);
    }
`;
