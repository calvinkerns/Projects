import { vec3, mat4 } from 'gl-matrix';

export class Camera {
    constructor() {
        this.position = vec3.fromValues(0, 0, 20);
        this.forward = vec3.fromValues(0, 0, -1);
        this.right = vec3.fromValues(1, 0, 0);
        this.up = vec3.fromValues(0, 1, 0);
        this.pitch = 0;
        this.yaw = -90;
        this.viewMatrix = mat4.create();
        this.projMatrix = mat4.create();
        
        // Adjusted focal length parameters for better projection
        this.fx = 800; // Increased from 800
        this.fy = 800; // Increased from 800
        
        // Adjusted perspective parameters
        this.fov = 45 * Math.PI / 180; // Narrower FOV for better detail
        this.near = 0.05;  // Closer near plane
        this.far = 2000.0; // Extended far plane
        
        this.updateMatrices();
    }
    
    updateMatrices() {
        this.updateVectors();
        
        const lookingPoint = vec3.create();
        vec3.add(lookingPoint, this.position, this.forward);
        mat4.lookAt(this.viewMatrix, this.position, lookingPoint, this.up);
        
        const canvas = document.getElementById('glcanvas');
        const aspectRatio = canvas.width / canvas.height;
        mat4.perspective(this.projMatrix, this.fov, aspectRatio, this.near, this.far);
    }

    updateVectors() {
        const pitchRad = this.pitch * Math.PI / 180;
        const yawRad = this.yaw * Math.PI / 180;
        
        // Update forward vector
        this.forward[0] = Math.cos(yawRad) * Math.cos(pitchRad);
        this.forward[1] = Math.sin(pitchRad);
        this.forward[2] = Math.sin(yawRad) * Math.cos(pitchRad);
        vec3.normalize(this.forward, this.forward);
        
        // Update right and up vectors
        vec3.cross(this.right, this.forward, [0, 1, 0]);
        vec3.normalize(this.right, this.right);
        vec3.cross(this.up, this.right, this.forward);
        vec3.normalize(this.up, this.up);
        
        // console.debug('Vectors updated:', {
        //     forward: [...this.forward],
        //     right: [...this.right],
        //     up: [...this.up],
        //     pitch: this.pitch,
        //     yaw: this.yaw
        // });
    }
}