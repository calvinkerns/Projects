const { vec3 } = glMatrix;

export class Controls { 
    constructor(camera) {
        this.camera = camera;
        this.keys = new Set();
        this.lookPointer = null; // the mouse or finger dragging to look around
        this.lastX = 0;
        this.lastY = 0;
        this.speed = 0.5;
        this.sensitivity = 0.1;
        // a swipe covers far fewer pixels than a mouse drag, so turn faster
        this.touchSensitivity = 0.25;
        this.setupEventListeners();
    }

    // Handlers are assigned rather than added, so the Controls made for a
    // new camera replace the old ones instead of stacking on top of them.
    setupEventListeners() {
        // Drag on the scene to look around, with the mouse or one finger.
        // Pointer capture keeps the drag going if it leaves the canvas.
        const canvas = this.camera.canvas;
        canvas.onpointerdown = (e) => {
            if (this.lookPointer !== null) return; // already dragging
            this.lookPointer = e.pointerId;
            this.lastX = e.clientX;
            this.lastY = e.clientY;
            canvas.setPointerCapture(e.pointerId);
        };
        canvas.onpointermove = (e) => {
            if (e.pointerId !== this.lookPointer) return;
            // A mouse turns the way it moves; on a touch screen the scene
            // follows the finger instead, like Street View.
            const s = e.pointerType === 'mouse' ? this.sensitivity : -this.touchSensitivity;
            this.look((e.clientX - this.lastX) * s, (e.clientY - this.lastY) * s);
            this.lastX = e.clientX;
            this.lastY = e.clientY;
        };
        canvas.onpointerup = canvas.onpointercancel = canvas.onlostpointercapture = (e) => {
            if (e.pointerId === this.lookPointer) this.lookPointer = null;
        };

        document.onkeydown = (e) => this.keys.add(e.key.toLowerCase());
        document.onkeyup = (e) => this.keys.delete(e.key.toLowerCase());

        // On-screen move buttons (touch screens) hold their key down while
        // pressed, so they drive the same movement as the keyboard.
        for (const button of document.querySelectorAll('[data-key]')) {
            const key = button.dataset.key;
            button.onpointerdown = (e) => {
                button.setPointerCapture(e.pointerId);
                button.classList.add('pressed');
                this.keys.add(key);
            };
            button.onpointerup = button.onpointercancel = button.onlostpointercapture = () => {
                button.classList.remove('pressed');
                this.keys.delete(key);
            };
            button.oncontextmenu = (e) => e.preventDefault(); // long press
        }

        // A key or button released while the page was in the background
        // would otherwise keep the camera moving.
        window.onblur = () => this.keys.clear();
    }

    look(dx, dy) {
        this.camera.yaw += dx;
        this.camera.pitch -= dy;
        this.camera.pitch = Math.max(-89, Math.min(89, this.camera.pitch));
        this.camera.updateMatrices();
    }

    updateMovement() {
        let moved = false;
        const moveSpeed = 0.75; // Change this value to control movement speed

        if (this.keys.has('w')) {
            vec3.scaleAndAdd(this.camera.position, this.camera.position, 
                this.camera.forward, moveSpeed);
            moved = true;
        }
        if (this.keys.has('s')) {
            vec3.scaleAndAdd(this.camera.position, this.camera.position, 
                this.camera.forward, -moveSpeed);
            moved = true;
        }
        if (this.keys.has('a')) {
            vec3.scaleAndAdd(this.camera.position, this.camera.position, 
                this.camera.right, -moveSpeed);
            moved = true;
        }
        if (this.keys.has('d')) {
            vec3.scaleAndAdd(this.camera.position, this.camera.position, 
                this.camera.right, moveSpeed);
            moved = true;
        }
        if (this.keys.has(' ')) {
            vec3.scaleAndAdd(this.camera.position, this.camera.position, 
                [0, 1, 0], moveSpeed);
            moved = true;
        }
        if (this.keys.has('shift')) {
            vec3.scaleAndAdd(this.camera.position, this.camera.position, 
                [0, 1, 0], -moveSpeed);
            moved = true;
        }

        if (moved) {
            this.camera.updateMatrices();
        }

        return moved;
    }
}