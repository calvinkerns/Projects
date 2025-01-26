import { vec3 } from 'gl-matrix';

export class Controls { 
    constructor(camera) {
        this.camera = camera;
        this.keys = new Set();
        this.isMouseDown = false;
        this.speed = 0.5;
        this.sensitivity = 0.1;
        this.setupEventListeners(); 
    }

    setupEventListeners() {
        document.onmousedown = () => this.isMouseDown = true;
        document.onmouseup = () => this.isMouseDown = false;
        document.onmousemove = (e) => this.handleMouseMove(e);
        document.onkeydown = (e) => this.keys.add(e.key.toLowerCase());
        document.onkeyup = (e) => this.keys.delete(e.key.toLowerCase());
    }

    handleMouseMove(e) {
        if (this.isMouseDown) {
            this.camera.yaw += e.movementX * this.sensitivity;
            this.camera.pitch -= e.movementY * this.sensitivity;
            this.camera.pitch = Math.max(-89, Math.min(89, this.camera.pitch));
            this.camera.updateMatrices();
        }
    }

    updateMovement() {
        if (this.keys.size === 0) return;
        
        if (this.keys.has('w')) {
            vec3.scaleAndAdd(this.camera.position, this.camera.position, 
                this.camera.forward, this.speed);
        }
        if (this.keys.has('s')) {
            vec3.scaleAndAdd(this.camera.position, this.camera.position, 
                this.camera.forward, -this.speed);
        }
        if (this.keys.has('a')) {
            vec3.scaleAndAdd(this.camera.position, this.camera.position, 
                this.camera.right, -this.speed);
        }
        if (this.keys.has('d')) {
            vec3.scaleAndAdd(this.camera.position, this.camera.position, 
                this.camera.right, this.speed);
        }
        if (this.keys.has(' ')) {
            vec3.scaleAndAdd(this.camera.position, this.camera.position, 
                [0, 1, 0], this.speed);
        }
        if (this.keys.has('shift')) {
            vec3.scaleAndAdd(this.camera.position, this.camera.position, 
                [0, 1, 0], -this.speed);
        }
        
        this.camera.updateMatrices();
    }
}