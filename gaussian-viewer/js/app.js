const { vec3, mat4, vec4 } = glMatrix;
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
        this.animatestart = false;
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

            // Bound once: `() => this.animate()` inside animate() allocated a new
            // closure every single frame.
            this.boundAnimate = () => this.animate();

            // Test initial render
            this.loadSplats(this.splatGenerator.loadGridData(5, 1.0)); // Start with a small grid
            this.animate();
        } catch (e) {
            console.error('Initialization error:', e);
        }
    }
    

    handleResize() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
        // The projection depends on canvas aspect, so it has to be rebuilt here.
        // Previously it stayed stale until the camera happened to move.
        if (this.camera) {
            this.camera.updateMatrices();
        }
    }

    // Single entry point for "new splat data". Packs and uploads the static
    // texture once, then computes the first draw order.
    loadSplats(splats, mode) {
        if (!splats) return;
        this.splatGenerator.splats = splats;
        this.splatGenerator.splatCount = splats.length;
        if (mode) this.splatGenerator.currentMode = mode;

        this.gaussianUpdater.setSplats(splats);
        this.gaussianUpdater.updateOrder(this.camera);
        mat4.copy(this.lastViewMatrix, this.camera.viewMatrix);
        this.forceUpdate = false;

        this.updateDebugStats();
    }

    reinitializeCamera() {
        this.camera = new Camera();
        this.renderer.camera = this.camera;
        this.gaussianUpdater.camera = this.camera;
        this.controls = new Controls(this.camera);
        mat4.copy(this.lastViewMatrix, this.camera.viewMatrix);
    }
    
    setupEventListeners() {
        // Existing event listeners
        document.getElementById('loadSpiralBtn').onclick = () => {
            this.reinitializeCamera();
            this.loadSplats(this.splatGenerator.loadSpiralData());
        };
          
        document.getElementById('loadGridBtn').onclick = () => {
            this.reinitializeCamera();
            this.loadSplats(this.splatGenerator.loadGridData());
        };
          
        document.getElementById('loadPlyBtn').onclick = () => {
            this.reinitializeCamera();
            document.getElementById('plyInput').click();
        };

        document.getElementById('loadDualGaussianBtn').onclick = () => {
            this.reinitializeCamera();
            this.loadSplats(this.splatGenerator.loadDualGaussianTest());
        };

        document.getElementById('updateBtn').onclick = () => {
            this.gaussianUpdater.updateOrder(this.camera);
            mat4.copy(this.lastViewMatrix, this.camera.viewMatrix);
            this.forceUpdate = false;
        };

        document.getElementById('startAnimationBtn').onclick = () => {
            const button = document.getElementById('startAnimationBtn');
            if(this.animatestart){
                this.animatestart = false;
                button.textContent = "Toggle Updating: Off";
                button.className = "animation-button-off";
            } else {
                this.animatestart = true;
                button.textContent = "Toggle Updating: On";
                button.className = "animation-button-on";
            }
        };        
        
        document.getElementById('plyInput').addEventListener('change', async (event) => {
            const file = event.target.files[0];
            if (file) {
                const loadingOverlay = document.getElementById('loadingOverlay');
                const loadingText = document.getElementById('loadingText');
                
                try {
                    loadingOverlay.style.display = 'flex';
                    loadingText.textContent = 'Reading PLY file...';
        
                    console.time('PLY Loading');
                    const splats = await PLYParser.parsePLY(file);
                    console.timeEnd('PLY Loading');
                    
                    if (splats) {
                        loadingText.textContent = 'Initializing scene...';
                        console.time('Initial Gaussian Update');
                        this.loadSplats(splats, 'ply');
                        console.timeEnd('Initial Gaussian Update');
                    }
                } catch (error) {
                    loadingText.textContent = 'Error loading model: ' + error.message;
                    console.error('Failed to load PLY file:', error);
                } finally {
                    // Hide loading overlay after a short delay to ensure user sees completion
                    setTimeout(() => {
                        loadingOverlay.style.display = 'none';
                    }, 500);
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
                        console.time('Initial Gaussian Update');
                        this.loadSplats(splats, 'txt');
                        console.timeEnd('Initial Gaussian Update');
                    }
                } catch (error) {
                    console.error('Failed to load TXT file:', error);
                }
            }
        });
        
        document.getElementById('loadVanGoghBtn').onclick = async () => {
            this.reinitializeCamera();
            const loadingOverlay = document.getElementById('loadingOverlay');
            const loadingText = document.getElementById('loadingText');
            
            try {
                loadingOverlay.style.display = 'flex';
                loadingText.textContent = 'Fetching PLY file...';
                
                const response = await fetch('van_gogh_room.ply');
                const blob = await response.blob();
                
                loadingText.textContent = 'Processing PLY data...';
                console.time('PLY Loading');
                const splats = await PLYParser.parsePLY(blob);
                console.timeEnd('PLY Loading');
                
                if (splats) {
                    loadingText.textContent = 'Initializing scene...';
                    console.time('Initial Gaussian Update');
                    this.loadSplats(splats, 'ply');
                    console.timeEnd('Initial Gaussian Update');
                }
            } catch (error) {
                loadingText.textContent = 'Error loading model: ' + error.message;
                console.error('Failed to load Van Gogh room PLY file:', error);
            } finally {
                // Hide loading overlay after a short delay to ensure user sees completion
                setTimeout(() => {
                    loadingOverlay.style.display = 'none';
                }, 500);
            }
        };
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
        const hadMovement = this.controls.updateMovement();

        if (this.animatestart && this.gaussianUpdater.count > 0) {
            // hasViewChanged() already refreshes lastViewMatrix when it reports true.
            if (hadMovement || this.hasViewChanged() || this.forceUpdate) {
                this.gaussianUpdater.updateOrder(this.camera);
                this.forceUpdate = false;
            }
        }

        this.renderer.render();
        requestAnimationFrame(this.boundAnimate);
    }
}

new App();