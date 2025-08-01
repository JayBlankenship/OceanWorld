// TerrainPlane.js
import * as THREE from 'https://cdn.skypack.dev/three@0.134.0';

export class TerrainPlane {
    constructor(gridX, gridZ, scene, planeSize, planeGeometry, planeMaterial) {
        this.gridX = gridX;
        this.gridZ = gridZ;
        this.scene = scene; // Store the scene reference
        this.planeSize = planeSize; // Store planeSize for use in generateBlocks
        this.position = new THREE.Vector3(gridX * planeSize, -2.5, gridZ * planeSize); // Lower terrain islands further
        // Removed static blue plane mesh; only global animated ocean remains

        // Placeholder for future procedural generation (e.g., height, texture)
        this.terrainData = {
            height: 0, // Default flat plane, can be modified later
            // Add more properties (e.g., noise, features) as needed
        };

        // --- Blocky neon terrain generation ---
        this.blockGroup = new THREE.Group();
        // Add blockGroup directly to the scene for proper rendering
        this.scene.add(this.blockGroup);
        this.generateBlocks();
        // Animation state for techno ocean
        this.wavePhase = Math.random() * Math.PI * 2;
        this.waveSpeed = 0.7 + Math.random() * 0.6;
        this.waveAmp = 0.12 + Math.random() * 0.08; // thinner
        this.waveFreq = 0.5 / 2 + Math.random() * 0.2;
        this.rotation = 0;
        this.rotationSpeed = (Math.random() > 0.5 ? 1 : -1) * (0.1 + Math.random() * 0.1);
        this.crashTimer = 0;
        this.crashActive = false;
        
        // Removed cached wireframe geometry (fixes black screen)
    }

    // Static helper to update all terrain tiles (LOD disabled, always update all)
    static updateAllTerrains(tilesArray) {
        // LOD logic removed: always update all terrain tiles
        for (const tile of tilesArray) {
            tile.updateTerrain();
        }
    }

    // Generate a random stack of neon blocks to make the terrain hilly/mountainous
    generateBlocks() {
        // Remove previous blocks from group and scene
        while (this.blockGroup.children.length > 0) {
            const child = this.blockGroup.children[0];
            this.blockGroup.remove(child);
            if (child instanceof THREE.Object3D) {
                this.scene.remove(child);
            }
        }
        this.scene.remove(this.blockGroup);
        this.blockGroup = new THREE.Group();
        this.scene.add(this.blockGroup);

        // Terrain parameters
        const gridCells = 2;
        const blockSize = (this.planeSize / gridCells) * 4.5;
        const blockColor = 0x00ff00; // Neon green

        // Exclusion zone removed: always generate terrain blocks everywhere
        let blockMatrices = [];
        let blockCount = 0;
        // Path generation
        const pathCount = 2 + Math.floor(Math.random() * 3);
        let pathIndices = Array.from({length: pathCount}, () => Math.floor(Math.random() * gridCells));
        const pathDirection = Math.random() > 0.5 ? 'horizontal' : 'vertical';
        for (let x = 0; x < gridCells; x++) {
            for (let z = 0; z < gridCells; z++) {
                // Compute block center in world space
                const spreadFactor = 1.2;
                const blockCenter = new THREE.Vector3(
                    this.position.x + (x - gridCells / 2 + 0.5) * blockSize * spreadFactor,
                    this.position.y + blockSize / 2 + 0.01,
                    this.position.z + (z - gridCells / 2 + 0.5) * blockSize * spreadFactor
                );
                let isPath = (pathDirection === 'horizontal') ? pathIndices.includes(z) : pathIndices.includes(x);
                if (isPath) continue;
                // Only generate a cube for this block with a 10% chance
                // Only generate a cube for this block with a 4% chance (sparser)
                // Only generate a cube for this block with a 1% chance (much sparser)
                if (Math.random() < 0.01) {
                    const stackHeight = 1 + Math.floor(Math.random() * 10);
                    for (let h = 0; h < stackHeight; h++) {
                        const matrix = new THREE.Matrix4();
                        matrix.setPosition(blockCenter.x, blockCenter.y + h * blockSize, blockCenter.z);
                        blockMatrices.push(matrix);
                        blockCount++;
                    }
                }
            }
        }
        // Add cubes as InstancedMesh
        if (blockCount > 0) {
            const blockGeometry = new THREE.BoxGeometry(blockSize, blockSize, blockSize);
            const blockMaterial = new THREE.MeshBasicMaterial({
                color: blockColor,
                transparent: true,
                opacity: 0.18,
                wireframe: false
            });
            const instancedMesh = new THREE.InstancedMesh(blockGeometry, blockMaterial, blockCount);
            for (let i = 0; i < blockMatrices.length; i++) {
                instancedMesh.setMatrixAt(i, blockMatrices[i]);
            }
            this.blockGroup.add(instancedMesh);
        }

        // Add digital landscape wireframe mesh
        this.landscapeWireframe = this.createLandscapeWireframe(gridCells, blockSize, blockColor);
        this.blockGroup.add(this.landscapeWireframe);

    }

    // Helper to create a single triangulated wireframe mesh for the tile
    createLandscapeWireframe(gridCells, blockSize, blockColor) {
        const geometry = new THREE.BufferGeometry();
        const vertices = [];
        const indices = [];
        for (let x = 0; x <= gridCells; x++) {
            for (let z = 0; z <= gridCells; z++) {
                const spreadFactor = 1.2;
                const px = this.position.x + (x - gridCells / 2) * blockSize * spreadFactor;
                const pz = this.position.z + (z - gridCells / 2) * blockSize * spreadFactor;
                // Initial y, will be animated
                const py = this.position.y + blockSize / 2;
                vertices.push(px, py, pz);
            }
        }
        for (let x = 0; x < gridCells; x++) {
            for (let z = 0; z < gridCells; z++) {
                const i0 = x * (gridCells + 1) + z;
                const i1 = (x + 1) * (gridCells + 1) + z;
                const i2 = (x + 1) * (gridCells + 1) + (z + 1);
                const i3 = x * (gridCells + 1) + (z + 1);
                indices.push(i0, i1, i2);
                indices.push(i0, i2, i3);
            }
        }
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
        geometry.setIndex(indices);
        geometry.computeVertexNormals();
        const wireframe = new THREE.WireframeGeometry(geometry);
        const material = new THREE.LineBasicMaterial({
            color: blockColor,
            linewidth: 2,
            transparent: true,
            opacity: 0.95
        });
        const mesh = new THREE.LineSegments(wireframe, material);
        mesh.geometry = geometry;
        return mesh;

        // ...per-block exclusion logic now handles block and wireframe generation...
    }

    // Method to update terrain (optional, for future use)
    // Dynamically update blocks and wireframes based on player position
    updateTerrain() {
        // Animate techno ocean mesh
        if (this.landscapeWireframe) {
            this.animateLandscapeWireframe(window.deltaTime || 0.016); // fallback to 60fps
        }
        // Optionally animate cubes, but not required for ocean effect
    }

    animateLandscapeWireframe(deltaTime) {
        // Animate phase
        this.wavePhase += deltaTime * this.waveSpeed;
        // Occasionally reverse direction and crash
        this.crashTimer -= deltaTime;
        if (this.crashTimer <= 0) {
            if (Math.random() < 0.2) {
                this.waveSpeed *= -1;
                this.rotationSpeed *= -1;
                this.crashActive = true;
            } else {
                this.crashActive = false;
            }
            this.crashTimer = 2 + Math.random() * 3;
        }
        // Animate rotation
        this.rotation += deltaTime * this.rotationSpeed;
        this.blockGroup.rotation.y = this.rotation;
        // Animate mesh vertices
        const pos = this.landscapeWireframe.geometry.attributes.position;
        const gridCells = 2;
        const blockSize = (this.planeSize / gridCells) * 4.5;
        for (let x = 0; x <= gridCells; x++) {
            for (let z = 0; z <= gridCells; z++) {
                const spreadFactor = 1.2;
                const px = this.position.x + (x - gridCells / 2) * blockSize * spreadFactor;
                const pz = this.position.z + (z - gridCells / 2) * blockSize * spreadFactor;
                // Techno ocean: animated gentle sine wave, random phase/amplitude, crash distortion
                let amp = blockSize * this.waveAmp;
                let freq = this.waveFreq;
                let phase = this.wavePhase;
                let py = this.position.y + blockSize / 2 + Math.sin(px * freq + pz * freq + phase) * amp;
                if (this.crashActive) {
                    py += Math.sin(px * freq * 2 + phase * 2) * amp * 2;
                }
                pos.setY(x * (gridCells + 1) + z, py);
            }
        }
        pos.needsUpdate = true;
        this.landscapeWireframe.geometry.computeVertexNormals();
    }

    remove() {
        this.scene.remove(this.mesh); // Remove the plane
        if (this.blockGroup) {
            this.scene.remove(this.blockGroup); // Remove the blocks
        }
    }
}

// Global helper to update exclusion zone every frame
// Usage: call updateExclusionZoneEveryFrame(tilesArray) in your animation loop
export function updateExclusionZoneEveryFrame(tilesArray) {
    TerrainPlane.updateAllTerrains(tilesArray);
}

// Ensure global access for animation loop
window.updateExclusionZoneEveryFrame = updateExclusionZoneEveryFrame;