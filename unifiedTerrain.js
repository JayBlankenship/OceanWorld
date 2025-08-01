// UnifiedTerrain.js - Single dynamic mesh for seamless terrain
import * as THREE from 'https://cdn.skypack.dev/three@0.134.0';

export class UnifiedTerrain {
    constructor(scene, size = 400, resolution = 64) {
        this.scene = scene;
        this.size = size; // Total terrain size (e.g., 400x400 units)
        this.resolution = resolution; // Grid resolution (e.g., 64x64 vertices)
        this.cellSize = this.size / this.resolution;
        
        // Animation variables
        this.wavePhase = 0;
        this.waveSpeed = 0.8;
        this.waveAmp = 0.15;
        this.waveFreq = 0.4;
        
        // Storm system
        this.stormIntensity = 0;
        this.storms = [];
        
        // Create the unified terrain mesh
        this.createUnifiedMesh();
        
        // Store original heights for animation
        this.originalHeights = [];
        this.storeOriginalHeights();
    }
    
    createUnifiedMesh() {
        const geometry = new THREE.BufferGeometry();
        const vertices = [];
        const indices = [];
        const colors = []; // Add colors array for vertex coloring
        
        // Generate vertices in a grid
        for (let z = 0; z <= this.resolution; z++) {
            for (let x = 0; x <= this.resolution; x++) {
                // World position
                const px = (x - this.resolution / 2) * this.cellSize;
                const pz = (z - this.resolution / 2) * this.cellSize;
                
                // Generate terrain height using noise
                const height = this.generateTerrainHeight(px, pz);
                
                vertices.push(px, height, pz);
                
                // Generate color based on height for depth visualization
                const normalizedHeight = (height + 6) / 12; // Normalize height range (-6 to 6) to (0 to 1)
                const clampedHeight = Math.max(0, Math.min(1, normalizedHeight));
                
                // Color gradient: deep blue -> green -> yellow -> red
                let r, g, b;
                if (clampedHeight < 0.25) {
                    // Deep areas: dark blue to blue
                    const t = clampedHeight * 4;
                    r = 0;
                    g = t * 0.3;
                    b = 0.4 + t * 0.6;
                } else if (clampedHeight < 0.5) {
                    // Mid-deep areas: blue to cyan/green
                    const t = (clampedHeight - 0.25) * 4;
                    r = 0;
                    g = 0.3 + t * 0.7;
                    b = 1.0 - t * 0.5;
                } else if (clampedHeight < 0.75) {
                    // Mid areas: green to yellow
                    const t = (clampedHeight - 0.5) * 4;
                    r = t * 0.8;
                    g = 1.0;
                    b = 0.5 - t * 0.5;
                } else {
                    // High areas: yellow to red
                    const t = (clampedHeight - 0.75) * 4;
                    r = 0.8 + t * 0.2;
                    g = 1.0 - t * 0.5;
                    b = 0;
                }
                
                colors.push(r, g, b);
            }
        }
        
        // Generate indices for triangulated mesh
        for (let z = 0; z < this.resolution; z++) {
            for (let x = 0; x < this.resolution; x++) {
                const i0 = z * (this.resolution + 1) + x;
                const i1 = z * (this.resolution + 1) + (x + 1);
                const i2 = (z + 1) * (this.resolution + 1) + x;
                const i3 = (z + 1) * (this.resolution + 1) + (x + 1);
                
                // Two triangles per quad
                indices.push(i0, i1, i2);
                indices.push(i1, i3, i2);
            }
        }
        
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
        geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3)); // Add color attribute
        geometry.setIndex(indices);
        geometry.computeVertexNormals();
        
        // Create material with vertex colors enabled
        const material = new THREE.MeshBasicMaterial({
            vertexColors: true, // Enable vertex colors
            transparent: true,
            opacity: 0.85,
            side: THREE.DoubleSide,
            wireframe: false
        });
        
        // Create mesh
        this.mesh = new THREE.Mesh(geometry, material);
        this.mesh.position.y = -2.5; // Match original terrain height
        this.scene.add(this.mesh);
    }
    
    generateTerrainHeight(x, z) {
        // Multi-scale noise for realistic terrain
        let height = 0;
        
        // Large scale features (hills and valleys)
        height += Math.sin(x * 0.01) * Math.cos(z * 0.01) * 3.0;
        height += Math.sin(x * 0.015 + z * 0.01) * 2.0;
        
        // Medium scale rocky features
        height += Math.sin(x * 0.03) * Math.cos(z * 0.025) * 1.5;
        height += Math.cos(x * 0.025 + z * 0.035) * 1.2;
        
        // Small scale surface detail
        height += Math.sin(x * 0.08) * Math.cos(z * 0.06) * 0.6;
        height += Math.sin(x * 0.05 + z * 0.07) * 0.8;
        
        // Smooth the result
        return height;
    }
    
    storeOriginalHeights() {
        const positions = this.mesh.geometry.attributes.position.array;
        for (let i = 1; i < positions.length; i += 3) {
            this.originalHeights.push(positions[i]);
        }
    }
    
    update(deltaTime, playerPosition, storms = []) {
        this.wavePhase += deltaTime * this.waveSpeed;
        this.storms = storms;
        
        // Update dynamic position based on player
        this.updatePosition(playerPosition);
        
        // Animate terrain
        this.animateTerrain();
    }
    
    updatePosition(playerPosition) {
        // Keep terrain centered on player
        this.mesh.position.x = Math.round(playerPosition.x / this.cellSize) * this.cellSize;
        this.mesh.position.z = Math.round(playerPosition.z / this.cellSize) * this.cellSize;
    }
    
    animateTerrain() {
        const positions = this.mesh.geometry.attributes.position;
        const colors = this.mesh.geometry.attributes.color;
        const posArray = positions.array;
        const colorArray = colors.array;
        
        for (let i = 0; i < this.originalHeights.length; i++) {
            const vertexIndex = i * 3 + 1; // Y coordinate
            const colorIndex = i * 3; // Color index (RGB)
            const x = posArray[i * 3]; // X coordinate
            const z = posArray[i * 3 + 2]; // Z coordinate
            
            // Get original height
            const baseHeight = this.originalHeights[i];
            
            // Calculate storm intensity at this position
            let stormIntensity = 0;
            for (const storm of this.storms) {
                const dist = Math.sqrt((x - storm.x) ** 2 + (z - storm.z) ** 2);
                if (dist < storm.radius) {
                    const intensity = (1 - dist / storm.radius) * storm.amp;
                    stormIntensity = Math.max(stormIntensity, intensity);
                }
            }
            
            // Animate waves on top of base terrain
            let waveHeight = 0;
            
            // Base wave animation
            waveHeight += Math.sin(x * this.waveFreq + z * this.waveFreq + this.wavePhase) * this.waveAmp;
            waveHeight += Math.cos(x * this.waveFreq * 1.3 + this.wavePhase * 1.2) * this.waveAmp * 0.6;
            
            // Storm effects
            if (stormIntensity > 0) {
                const stormAmp = this.waveAmp * stormIntensity * 3.0;
                const stormFreq = this.waveFreq * (1.0 + stormIntensity);
                const stormPhase = this.wavePhase * (1.0 + stormIntensity * 0.7);
                
                waveHeight += Math.sin(x * stormFreq + stormPhase) * stormAmp * 0.5;
                waveHeight += Math.cos(z * stormFreq * 1.4 + stormPhase * 1.8) * stormAmp * 0.3;
                waveHeight += Math.sin((x + z) * stormFreq * 0.8 + stormPhase * 2.2) * stormAmp * 0.2;
                
                // Chaotic movement during severe storms
                if (stormIntensity > 1.5) {
                    waveHeight += (Math.random() - 0.5) * stormAmp * 0.4;
                }
            }
            
            // Apply final height
            const finalHeight = baseHeight + waveHeight;
            posArray[vertexIndex] = finalHeight;
            
            // Update color based on new height for dynamic depth visualization
            const normalizedHeight = (finalHeight + 6) / 12; // Normalize height range (-6 to 6) to (0 to 1)
            const clampedHeight = Math.max(0, Math.min(1, normalizedHeight));
            
            // Color gradient: deep blue -> green -> yellow -> red
            let r, g, b;
            if (clampedHeight < 0.25) {
                // Deep areas: dark blue to blue
                const t = clampedHeight * 4;
                r = 0;
                g = t * 0.3;
                b = 0.4 + t * 0.6;
            } else if (clampedHeight < 0.5) {
                // Mid-deep areas: blue to cyan/green
                const t = (clampedHeight - 0.25) * 4;
                r = 0;
                g = 0.3 + t * 0.7;
                b = 1.0 - t * 0.5;
            } else if (clampedHeight < 0.75) {
                // Mid areas: green to yellow
                const t = (clampedHeight - 0.5) * 4;
                r = t * 0.8;
                g = 1.0;
                b = 0.5 - t * 0.5;
            } else {
                // High areas: yellow to red
                const t = (clampedHeight - 0.75) * 4;
                r = 0.8 + t * 0.2;
                g = 1.0 - t * 0.5;
                b = 0;
            }
            
            // Add storm color effects
            if (stormIntensity > 0) {
                const stormTint = stormIntensity * 0.3;
                r = Math.min(1.0, r + stormTint); // Add red tint during storms
                g = Math.max(0, g - stormTint * 0.5); // Reduce green
            }
            
            colorArray[colorIndex] = r;
            colorArray[colorIndex + 1] = g;
            colorArray[colorIndex + 2] = b;
        }
        
        positions.needsUpdate = true;
        colors.needsUpdate = true; // Update colors
        this.mesh.geometry.computeVertexNormals();
    }
    
    getStormIntensityAtPosition(x, z) {
        let maxIntensity = 0;
        for (const storm of this.storms) {
            const dist = Math.sqrt((x - storm.x) ** 2 + (z - storm.z) ** 2);
            if (dist < storm.radius) {
                const intensity = (1 - dist / storm.radius) * storm.amp;
                maxIntensity = Math.max(maxIntensity, intensity);
            }
        }
        return maxIntensity;
    }
    
    remove() {
        if (this.mesh) {
            this.scene.remove(this.mesh);
            this.mesh.geometry.dispose();
            this.mesh.material.dispose();
        }
    }
}
