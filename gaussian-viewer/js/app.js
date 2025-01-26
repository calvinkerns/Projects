import { vec3, mat4 } from 'gl-matrix';
import { Camera } from './camera.js';
import { Controls } from './controls.js';
import { Renderer } from './renderer.js';
import { SplatGenerator } from './splatGenerator.js';
import { PLYParser } from './plyParser.js';
import { GaussianUpdater } from './gaussianUpdater.js';
import { DiagnosticRenderer } from './diagnosticRenderer.js';
import { TXTParser } from './txtParser.js';

class App {
    constructor() {
        this.canvas = document.getElementById('glcanvas');
        if (!this.canvas) {
            console.error('Failed to get canvas element');
            return;
        }
    
        this.gl = this.canvas.getContext('webgl2');
        if (!this.gl) {
            console.error('Failed to get WebGL2 context');
            return;
        }
    
        // Log WebGL capabilities
        console.log('WebGL2 Context:', {
            'MAX_TEXTURE_SIZE': this.gl.getParameter(this.gl.MAX_TEXTURE_SIZE),
            'MAX_VIEWPORT_DIMS': this.gl.getParameter(this.gl.MAX_VIEWPORT_DIMS),
            'MAX_VARYING_VECTORS': this.gl.getParameter(this.gl.MAX_VARYING_VECTORS)
        });
    
        this.handleResize();
        window.addEventListener('resize', () => this.handleResize());
        
        try {
            // Initialize components with error checking
            this.camera = new Camera();
            this.renderer = new Renderer(this.gl, this.camera);
            
            // Test renderer state
            this.renderer.checkWebGLState();
            
            this.diagnosticRenderer = new DiagnosticRenderer(this.renderer);
            this.gaussianUpdater = new GaussianUpdater(this.renderer, this.camera);
            this.controls = new Controls(this.camera);
            this.splatGenerator = new SplatGenerator(this.renderer, this.camera);
            
            // Add last view matrix for tracking changes
            this.lastViewMatrix = new Float32Array(16);
            mat4.copy(this.lastViewMatrix, this.camera.viewMatrix);
            
            this.setupEventListeners();
            
            // Test initial render
            this.splatGenerator.loadGridData(5, 1.0); // Start with a small grid
            this.animate();
        } catch (e) {
            console.error('Initialization error:', e);
        }
    }
    

    handleResize() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
    }

    reinitializeCamera() {
        this.camera = new Camera();
        this.renderer.camera = this.camera;
        this.controls = new Controls(this.camera);
    }
    
    setupEventListeners() {
        // Existing event listeners
        document.getElementById('loadSpiralBtn').onclick = () => {
            this.reinitializeCamera();
            this.splatGenerator.loadSpiralData();
            this.updateDebugStats();
        };
          
        document.getElementById('loadGridBtn').onclick = () => {
            this.reinitializeCamera();
            this.splatGenerator.loadGridData();
            this.updateDebugStats();
        };
          
        document.getElementById('loadPlyBtn').onclick = () => {
            this.reinitializeCamera();
            document.getElementById('plyInput').click();
        };
        
        document.getElementById('plyInput').addEventListener('change', async (event) => {
            const file = event.target.files[0];
            if (file) {
                try {
                    console.time('PLY Loading');
                    const splats = await PLYParser.parsePLY(file);
                    console.timeEnd('PLY Loading');
                    
                    if (splats) {
                        this.splatGenerator.splats = splats;
                        this.splatGenerator.splatCount = splats.length;
                        
                        // Initial view-dependent update
                        const viewProj = mat4.multiply(
                            mat4.create(),
                            this.camera.projMatrix,
                            this.camera.viewMatrix
                        );
                        
                        console.time('Initial Gaussian Update');
                        this.gaussianUpdater.updateGaussians(viewProj, splats, true);
                        console.timeEnd('Initial Gaussian Update');
                        
                        this.splatGenerator.currentMode = 'ply';
                        this.updateDebugStats();
                    
                        this.diagnosticRenderer.updateStats(splats);
                    }
                } catch (error) {
                    console.error('Failed to load PLY file:', error);
                }
            }
        });
        document.getElementById('loadTxtBtn').onclick = () => {
            this.reinitializeCamera();
            document.getElementById('txtInput').click();
        };
        
        document.getElementById('txtInput').addEventListener('change', async (event) => {
            const file = event.target.files[0];
            if (file) {
                try {
                    console.time('TXT Loading');
                    const splats = await TXTParser.parseTXT(file);
                    console.timeEnd('TXT Loading');
                    
                    if (splats) {
                        this.splatGenerator.splats = splats;
                        this.splatGenerator.splatCount = splats.length;
                        
                        const viewProj = mat4.multiply(
                            mat4.create(),
                            this.camera.projMatrix,
                            this.camera.viewMatrix
                        );
                        
                        console.time('Initial Gaussian Update');
                        this.gaussianUpdater.updateGaussians(viewProj, splats, true);
                        console.timeEnd('Initial Gaussian Update');
                        
                        this.splatGenerator.currentMode = 'txt';
                        this.updateDebugStats();
                        this.diagnosticRenderer.updateStats(splats);
                    }
                } catch (error) {
                    console.error('Failed to load TXT file:', error);
                }
            }
        });
    }

    hasViewChanged() {
        const epsilon = 0.01; // Threshold for considering a change significant
        const view = this.camera.viewMatrix;
        const last = this.lastViewMatrix;
        
        // Check if view matrix has changed significantly
        for (let i = 0; i < 16; i++) {
            if (Math.abs(last[i] - view[i]) > epsilon) {
                mat4.copy(this.lastViewMatrix, this.camera.viewMatrix);
                return true;
            }
        }
        return false;
    }

    updateDebugStats() {
        if (this.splatGenerator.splats) {
            this.diagnosticRenderer.updateStats(this.splatGenerator.splats);
        }
    }

    animate() {        
        // Update movement and get whether camera moved
        const hadMovement = this.controls.updateMovement();
        
        // Always get the current viewProj matrix
        const viewProj = mat4.multiply(
            mat4.create(),
            this.camera.projMatrix,
            this.camera.viewMatrix
        );
        
        if (this.splatGenerator.splats?.length > 0) {
            // Check for view changes
            const viewChanged = this.hasViewChanged();
            
            // Update gaussians if there was movement or view changed
            if (hadMovement || viewChanged) {
                this.gaussianUpdater.updateGaussians(
                    viewProj, 
                    this.splatGenerator.splats,
                    hadMovement
                );
                mat4.copy(this.lastViewMatrix, this.camera.viewMatrix);
            }
        }
        
        this.renderer.render(this.splatGenerator.splatCount);
        requestAnimationFrame(() => this.animate());
    }
}

new App();