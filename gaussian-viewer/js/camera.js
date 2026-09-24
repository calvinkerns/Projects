const { vec3, mat4 } = glMatrix;

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
        
        // focal length in pixels, recomputed in updateMatrices()
        this.fx = 600;
        this.fy = 600;
        
       
        this.fov = 60 * Math.PI / 180; 
        this.near = 0.01;  
        this.far = 5000.0; 
        
        this.canvas = document.getElementById('glcanvas');

        this.updateMatrices();
    }
    
    updateMatrices() {
        this.updateVectors();
        
        const lookingPoint = vec3.create();
        vec3.add(lookingPoint, this.position, this.forward);
        mat4.lookAt(this.viewMatrix, this.position, lookingPoint, this.up);
        
        const canvas = this.canvas;
        const aspectRatio = canvas.width / canvas.height;
        mat4.perspective(this.projMatrix, this.fov, aspectRatio, this.near, this.far);

        // must match the projection matrix so the shader's covariance is the right scale
        this.fy = (canvas.height * 0.5) / Math.tan(this.fov * 0.5);
        this.fx = this.fy;
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
        

    }
}