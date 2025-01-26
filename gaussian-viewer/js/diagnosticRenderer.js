export class DiagnosticRenderer {
    constructor(renderer) {
        this.renderer = renderer;
        this.gl = renderer.gl;
        this.debugMode = 'normal';
        this.setupDebugUI();
    }

    setupDebugUI() {
        const controls = document.getElementById('controls');
        
        const debugContainer = document.createElement('div');
        debugContainer.style.marginTop = '10px';
        
        const debugSelect = document.createElement('select');
        debugSelect.className = 'file-input'; // Use same style as other controls
        debugSelect.innerHTML = `
            <option value="normal">Normal Rendering</option>
            <option value="falloff">Gaussian Falloff</option>
            <option value="position">Position Debug</option>
        `;
        
        debugSelect.addEventListener('change', (e) => {
            this.debugMode = e.target.value;
            switch(this.debugMode) {
                case 'falloff':
                    this.renderer.setDebugMode(2); 1
                    break;
                case 'position':
                    this.renderer.setDebugMode(3);
                    break;
                default:
                    this.renderer.setDebugMode(0);
            }
        });

        const label = document.createElement('div');
        label.textContent = 'Debug Mode:';
        label.style.color = 'white';
        label.style.marginBottom = '5px';

        debugContainer.appendChild(label);
        debugContainer.appendChild(debugSelect);
        controls.appendChild(debugContainer);

        // Add stats display
        this.statsDisplay = document.createElement('div');
        this.statsDisplay.style.color = 'white';
        this.statsDisplay.style.marginTop = '10px';
        controls.appendChild(this.statsDisplay);
    }

    updateStats(vertices) {
        if (!vertices || !vertices.length) return;

        let stats = {
            count: vertices.length,
            averageScale: [0, 0, 0],
            minScale: [Infinity, Infinity, Infinity],
            maxScale: [-Infinity, -Infinity, -Infinity],
            positions: {
                min: [Infinity, Infinity, Infinity],
                max: [-Infinity, -Infinity, -Infinity]
            }
        };

        vertices.forEach(v => {
            // Update position bounds
            for (let i = 0; i < 3; i++) {
                stats.positions.min[i] = Math.min(stats.positions.min[i], v.position[i]);
                stats.positions.max[i] = Math.max(stats.positions.max[i], v.position[i]);
            }

            // If vertex has scale property
            if (v.scale) {
                for (let i = 0; i < 3; i++) {
                    stats.averageScale[i] += v.scale[i];
                    stats.minScale[i] = Math.min(stats.minScale[i], v.scale[i]);
                    stats.maxScale[i] = Math.max(stats.maxScale[i], v.scale[i]);
                }
            }
        });

        // Finalize averages
        stats.averageScale = stats.averageScale.map(s => s / vertices.length);

        this.statsDisplay.innerHTML = `
            <div>Splat Count: ${stats.count}</div>
            <div>Position Range: 
                X: ${stats.positions.min[0].toFixed(2)} to ${stats.positions.max[0].toFixed(2)}
                Y: ${stats.positions.min[1].toFixed(2)} to ${stats.positions.max[1].toFixed(2)}
                Z: ${stats.positions.min[2].toFixed(2)} to ${stats.positions.max[2].toFixed(2)}
            </div>
            ${stats.averageScale[0] !== 0 ? `
            <div>Scale Stats:
                Avg: [${stats.averageScale.map(s => s.toFixed(2)).join(', ')}]
                Min: [${stats.minScale.map(s => s.toFixed(2)).join(', ')}]
                Max: [${stats.maxScale.map(s => s.toFixed(2)).join(', ')}]
            </div>` : ''}
        `;
    }
}
