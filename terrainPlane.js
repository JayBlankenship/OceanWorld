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

        // --- Animated terrain wireframe only (no formations) ---
        this.blockGroup = new THREE.Group();
        // Add blockGroup directly to the scene for proper rendering
        this.scene.add(this.blockGroup);
        this.generateTerrainWireframe(); // Generate only the animated ocean floor
        // Animation state for techno ocean
        this.wavePhase = Math.random() * Math.PI * 2;
        this.waveSpeed = 0.7 + Math.random() * 0.6;
        this.waveAmp = 0.12 + Math.random() * 0.08; // thinner
        this.waveFreq = 0.5 / 2 + Math.random() * 0.2;
        this.rotation = 0;
        this.rotationSpeed = (Math.random() > 0.5 ? 1 : -1) * (0.1 + Math.random() * 0.1);
        this.crashTimer = 0;
        this.crashActive = false;
        
        // Storm effect variables
        this.stormIntensity = 0;
        this.stormRotation = 0;
        
        // Rocky terrain base heights (will be populated by createLandscapeWireframe)
        this.baseHeights = null;
        
        // Removed cached wireframe geometry (fixes black screen)
    }

    // Static helper to update all terrain tiles with storm system
    static updateAllTerrains(tilesArray, terrainGenerator = null) {
        // If we have a terrain generator, get storm intensities for each tile
        for (const tile of tilesArray) {
            let stormIntensity = 0;
            
            if (terrainGenerator) {
                // Calculate storm intensity at this tile's position
                stormIntensity = terrainGenerator.getStormIntensityAtPosition(
                    tile.position.x, 
                    tile.position.z
                );
            }
            
            tile.updateTerrain(stormIntensity);
        }
    }

    // Generate only the animated terrain wireframe (no rock formations)
    generateTerrainWireframe() {
        // Remove previous objects from group and scene
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

        // Terrain parameters for solid connected terrain
        const gridCells = 6; // Reduced resolution for better performance
        const baseSize = this.planeSize / gridCells; // Exact tile size for seamless connection
        const terrainColor = 0x00ff00; // Neon green

        // Add only the digital landscape wireframe mesh
        this.landscapeWireframe = this.createLandscapeWireframe(gridCells, baseSize, terrainColor);
        this.blockGroup.add(this.landscapeWireframe);
    }

    // Helper to create a single triangulated wireframe mesh for the tile
    createLandscapeWireframe(gridCells, baseSize, terrainColor) {
        const geometry = new THREE.BufferGeometry();
        const vertices = [];
        const indices = [];
        
        // Generate smooth rocky outcrop terrain with flowing features
        for (let x = 0; x <= gridCells; x++) {
            for (let z = 0; z <= gridCells; z++) {
                // Calculate world position to ensure tiles connect seamlessly
                const px = this.position.x + (x - gridCells / 2) * baseSize;
                const pz = this.position.z + (z - gridCells / 2) * baseSize;
                
                // Create flowing rocky outcrop base height (simplified for performance)
                let baseHeight = this.position.y;
                
                // Simplified terrain generation for better performance
                const primaryFlow = this.generateNoise(px * 0.02, pz * 0.02) * 2.5;
                const secondaryFlow = this.generateNoise(px * 0.06, pz * 0.06) * 1.2;
                
                // Simple ridge pattern
                const ridgePattern = Math.sin(px * 0.03 + pz * 0.02) * 0.8;
                
                // Combine for smooth rocky appearance
                const rockyHeight = primaryFlow + secondaryFlow + ridgePattern;
                const py = baseHeight + rockyHeight;
                
                vertices.push(px, py, pz);
            }
        }
        
        // Create indices for triangulated mesh
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
        
        // Create solid mesh material instead of wireframe for connected appearance
        const material = new THREE.MeshBasicMaterial({
            color: terrainColor,
            transparent: true,
            opacity: 0.8,
            side: THREE.DoubleSide,
            wireframe: false // Solid surface instead of lines
        });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.geometry = geometry;
        
        // Store base heights for animation reference
        this.baseHeights = vertices.filter((_, index) => index % 3 === 1); // Y coordinates only
        
        return mesh;
    }

    // Enhanced noise function for smooth flowing rocky outcrops
    generateNoise(x, z) {
        // Simple pseudo-random noise based on position
        const seed = this.gridX * 1000 + this.gridZ; // Tile-specific seed for consistency
        
        // Multiple octaves of smooth sine-based noise for flowing terrain
        let noise = 0;
        
        // Primary flowing waves (large gentle undulations)
        noise += Math.sin(x + seed) * 0.45;
        noise += Math.cos(z + seed * 1.3) * 0.35;
        
        // Secondary cross-patterns (creates ridge-like formations)
        noise += Math.sin(x * 1.8 + z * 1.2 + seed * 0.7) * 0.25;
        noise += Math.cos(x * 1.4 + z * 2.1 + seed * 1.9) * 0.15;
        
        // Tertiary fine detail (subtle surface variation)
        noise += Math.sin(x * 3.2 + z * 2.8 + seed * 0.4) * 0.08;
        
        // Add smooth randomness for natural variation
        const hash1 = Math.sin(x * 12.9898 + z * 78.233 + seed) * 43758.5453;
        const hash2 = Math.cos(x * 93.9898 + z * 67.345 + seed * 1.5) * 28474.3829;
        const smoothRandom = ((hash1 - Math.floor(hash1)) + (hash2 - Math.floor(hash2))) * 0.15;
        noise += smoothRandom;
        
        // Apply smoothing function for more organic curves
        return Math.tanh(noise * 0.8) * 1.25; // tanh creates smooth S-curves
    }

    // Method to update terrain with storm effects for wireframe only
    updateTerrain(stormIntensity = 0) {
        this.stormIntensity = stormIntensity;
        
        // Animate terrain wireframe mesh
        if (this.landscapeWireframe) {
            this.animateLandscapeWireframe(window.deltaTime || 0.016); // fallback to 60fps
        }
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
        
        // Animate rotation (enhanced by storms)
        const stormRotationMultiplier = 1.0 + this.stormIntensity * 2.0;
        this.rotation += deltaTime * this.rotationSpeed * stormRotationMultiplier;
        this.blockGroup.rotation.y = this.rotation;
        
        // Storm color effects on wireframe
        if (this.landscapeWireframe.material && this.stormIntensity > 0) {
            const stormOpacity = 0.95 + this.stormIntensity * 0.05; // Slightly brighter during storms
            this.landscapeWireframe.material.opacity = Math.min(stormOpacity, 1.0);
            
            // Add red tint during severe storms
            if (this.stormIntensity > 1.0) {
                const redTint = (this.stormIntensity - 1.0) * 0.3;
                this.landscapeWireframe.material.color.setRGB(redTint, 1.0 - redTint * 0.3, 0);
            } else {
                this.landscapeWireframe.material.color.setRGB(0, 1.0, 0); // Reset to green
            }
        }
        
        // Animate mesh vertices (enhanced by storms) on top of rocky base
        const pos = this.landscapeWireframe.geometry.attributes.position;
        const gridCells = 6; // Updated to match generateTerrainWireframe
        const baseSize = this.planeSize / gridCells; // Updated to match generateTerrainWireframe
        
        for (let x = 0; x <= gridCells; x++) {
            for (let z = 0; z <= gridCells; z++) {
                const vertexIndex = x * (gridCells + 1) + z;
                // Calculate same world position as terrain generation
                const px = this.position.x + (x - gridCells / 2) * baseSize;
                const pz = this.position.z + (z - gridCells / 2) * baseSize;
                
                // Get the rocky base height for this vertex
                const baseHeight = this.baseHeights ? this.baseHeights[vertexIndex] : (this.position.y + baseSize / 2);
                
                // Techno ocean: animated gentle sine wave on top of rocky terrain
                let amp = baseSize * this.waveAmp * 0.5; // Reduced amplitude for subtle waves over rocks
                let freq = this.waveFreq;
                let phase = this.wavePhase;
                
                // Base wave animation on top of rocky terrain
                let waveHeight = Math.sin(px * freq + pz * freq + phase) * amp;
                
                // Crash effect
                if (this.crashActive) {
                    waveHeight += Math.sin(px * freq * 2 + phase * 2) * amp * 1.5;
                }
                
                // Storm effects - add chaotic movement and higher amplitude
                if (this.stormIntensity > 0) {
                    const stormAmp = amp * this.stormIntensity * 2.5;
                    const stormFreq = freq * (1.0 + this.stormIntensity);
                    const stormPhase = phase * (1.0 + this.stormIntensity * 0.5);
                    
                    // Multiple overlapping waves during storms
                    waveHeight += Math.sin(px * stormFreq + stormPhase) * stormAmp * 0.4;
                    waveHeight += Math.cos(pz * stormFreq * 1.3 + stormPhase * 1.7) * stormAmp * 0.25;
                    waveHeight += Math.sin((px + pz) * stormFreq * 0.7 + stormPhase * 2.1) * stormAmp * 0.15;
                    
                    // Chaotic noise during severe storms - affects the rocky base too
                    if (this.stormIntensity > 1.0) {
                        const chaosAmp = (this.stormIntensity - 1.0) * amp * 1.5;
                        waveHeight += (Math.random() - 0.5) * chaosAmp;
                        
                        // During severe storms, even the rocky base shifts slightly
                        const baseShift = (Math.random() - 0.5) * (this.stormIntensity - 1.0) * 0.3;
                        waveHeight += baseShift;
                    }
                }
                
                // Combine rocky base height with wave animation
                const finalHeight = baseHeight + waveHeight;
                pos.setY(vertexIndex, finalHeight);
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

// Global helper to update terrain with storm effects every frame
// Usage: call updateExclusionZoneEveryFrame(tilesArray, terrainGenerator) in your animation loop
export function updateExclusionZoneEveryFrame(tilesArray, terrainGenerator = null) {
    TerrainPlane.updateAllTerrains(tilesArray, terrainGenerator);
}

// Ensure global access for animation loop
window.updateExclusionZoneEveryFrame = updateExclusionZoneEveryFrame;