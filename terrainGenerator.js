// TerrainGenerator.js
import * as THREE from 'https://cdn.skypack.dev/three@0.134.0';
import { TerrainPlane } from './terrainPlane.js';

export class TerrainGenerator {
    constructor(scene, planeSize, planeGeometry, planeMaterial) {
        this.scene = scene;
        // Slightly higher ground resolution (smaller tiles)
        this.planeSize = 5;
        this.planeGeometry = new THREE.PlaneGeometry(this.planeSize, this.planeSize, 1, 1);
        // Create a lightweight procedural checkerboard texture for visual depth
        const canvas = document.createElement('canvas');
        canvas.width = 32;
        canvas.height = 32;
        const ctx = canvas.getContext('2d');
        for (let y = 0; y < 4; y++) {
            for (let x = 0; x < 4; x++) {
                ctx.fillStyle = (x + y) % 2 === 0 ? '#0f0' : '#003300';
                ctx.fillRect(x * 8, y * 8, 8, 8);
            }
        }
        const texture = new THREE.CanvasTexture(canvas);
        texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(8, 8);
        this.planeMaterial = new THREE.MeshBasicMaterial({
            map: texture,
            color: 0xffffff,
            wireframe: false,
            transparent: false,
            opacity: 1.0,
            side: THREE.DoubleSide
        });
        this.planes = new Map(); // Map<gridKey, TerrainPlane>
        // For networking: track changes since last frame
        this.newPlanes = new Set(); // Track newly created planes for networking
        this.removedPlanes = new Set(); // Track removed planes for networking
        
        // Bad Storm System for terrain effects
        this.stormSystem = {
            storms: [], // Array of active terrain storms
            timer: 0,
            stormSpawnChance: 0.03, // Low chance per second to spawn storm
            maxStorms: 3,
            stormLifetime: 60 // Storm lasts 60 seconds
        };
    }

    // Convert world position to grid coordinates
    getGridKey(x, z) {
        const gridX = Math.floor(x / this.planeSize);
        const gridZ = Math.floor(z / this.planeSize);
        return `${gridX},${gridZ}`;
    }

    // Create a TerrainPlane at a given grid position
    createPlane(gridX, gridZ) {
        const gridKey = this.getGridKey(gridX * this.planeSize, gridZ * this.planeSize);
        if (!this.planes.has(gridKey)) {
            const terrainPlane = new TerrainPlane(gridX, gridZ, this.scene, this.planeSize, this.planeGeometry, this.planeMaterial);
            this.planes.set(gridKey, terrainPlane);
            
            // Track this as a new plane for networking
            this.newPlanes.add({
                gridX: gridX,
                gridZ: gridZ,
                gridKey: gridKey
            });
            console.log(`[TerrainGenerator] Added new plane at (${gridX}, ${gridZ}) for networking`);
            
            return terrainPlane;
        }
        return this.planes.get(gridKey);
    }

    // Generate neighboring planes and ensure a plane under the entity, with a larger radius
    generateNeighboringPlanes(entityPosition) {
        const gridKey = this.getGridKey(entityPosition.x, entityPosition.z);
        const [gridX, gridZ] = gridKey.split(',').map(Number);

        // Always create a plane directly under the entity if it doesn't exist
        const currentGridKey = `${gridX},${gridZ}`;
        if (!this.planes.has(currentGridKey)) {
            this.createPlane(gridX, gridZ);
        }

        // Check if entity is near an edge (within 5 units of plane boundary) to generate neighbors
        const localX = entityPosition.x - gridX * this.planeSize;
        const localZ = entityPosition.z - gridZ * this.planeSize;
        const edgeThreshold = 5;

        // Generate planes in a larger cylinder (circle) around the player for more coverage
        const maxDistance = 90; // 90 grid cells radius (extended)
        for (let dx = -maxDistance; dx <= maxDistance; dx++) {
            for (let dz = -maxDistance; dz <= maxDistance; dz++) {
                if (dx === 0 && dz === 0) continue; // Skip the center (already handled)
                // Only fill within a circle (cylinder) radius
                if (Math.sqrt(dx * dx + dz * dz) > maxDistance) continue;
                const newGridX = gridX + dx;
                const newGridZ = gridZ + dz;
                const newGridKey = `${newGridX},${newGridZ}`;
                if (!this.planes.has(newGridKey)) {
                    this.createPlane(newGridX, newGridZ);
                }
            }
        }
    }

    // Update the storm system
    updateStormSystem(deltaTime, playerPosition) {
        this.stormSystem.timer += deltaTime;
        
        // Try to spawn new storms
        if (Math.random() < deltaTime * this.stormSystem.stormSpawnChance && 
            this.stormSystem.storms.length < this.stormSystem.maxStorms) {
            
            // Spawn storm at random location around player
            const angle = Math.random() * Math.PI * 2;
            const distance = 200 + Math.random() * 300; // 200-500 units from player
            
            const storm = {
                id: Math.random().toString(36).substr(2, 9),
                x: playerPosition.x + Math.cos(angle) * distance,
                z: playerPosition.z + Math.sin(angle) * distance,
                intensity: 0.5 + Math.random() * 1.0, // Storm intensity 0.5-1.5
                radius: 100 + Math.random() * 150, // Storm radius 100-250
                age: 0,
                maxAge: this.stormSystem.stormLifetime,
                rotationSpeed: (Math.random() - 0.5) * 2.0, // Random rotation
                pulsePhase: Math.random() * Math.PI * 2
            };
            
            this.stormSystem.storms.push(storm);
            console.log(`[TerrainGenerator] Spawned bad storm at (${storm.x.toFixed(1)}, ${storm.z.toFixed(1)}) with intensity ${storm.intensity.toFixed(2)}`);
        }
        
        // Update existing storms
        this.stormSystem.storms.forEach(storm => {
            storm.age += deltaTime;
            storm.pulsePhase += deltaTime * 3.0; // Fast pulsing for dramatic effect
            
            // Storms slowly drift toward player for more dynamic gameplay
            const dx = playerPosition.x - storm.x;
            const dz = playerPosition.z - storm.z;
            const distance = Math.sqrt(dx * dx + dz * dz);
            
            if (distance > 50) {
                const driftSpeed = 2.0; // Slow drift toward player
                storm.x += (dx / distance) * driftSpeed * deltaTime;
                storm.z += (dz / distance) * driftSpeed * deltaTime;
            }
        });
        
        // Remove expired storms
        this.stormSystem.storms = this.stormSystem.storms.filter(storm => storm.age < storm.maxAge);
    }

    // Get storm intensity at a given world position
    getStormIntensityAtPosition(x, z) {
        let totalIntensity = 0;
        
        this.stormSystem.storms.forEach(storm => {
            const dx = x - storm.x;
            const dz = z - storm.z;
            const distance = Math.sqrt(dx * dx + dz * dz);
            
            if (distance < storm.radius) {
                // Calculate falloff from storm center
                const falloff = 1.0 - (distance / storm.radius);
                const stormEffect = falloff * storm.intensity;
                
                // Add pulsing effect
                const pulse = Math.sin(storm.pulsePhase) * 0.3 + 0.7; // 0.4-1.0 multiplier
                
                totalIntensity += stormEffect * pulse;
            }
        });
        
        return Math.min(totalIntensity, 2.0); // Cap at 2.0 for extreme storms
    }

    // Remove distant planes (disabled: keep all terrain tiles loaded)
    removeDistantPlanes(playerPosition, aiPlayers) {
        // Terrain removal disabled to prevent ocean floor from disappearing
    }

    // Get terrain changes since last frame (for networking)
    getTerrainChanges() {
        const changes = {
            newPlanes: Array.from(this.newPlanes),
            removedPlanes: Array.from(this.removedPlanes)
        };
        
        // Log if there are changes for debugging
        if (changes.newPlanes.length > 0 || changes.removedPlanes.length > 0) {
            console.log(`[TerrainGenerator] Getting terrain changes: ${changes.newPlanes.length} new, ${changes.removedPlanes.length} removed`);
        }
        
        // Limit the number of changes to prevent network spam
        const maxChanges = 50;
        if (changes.newPlanes.length > maxChanges) {
            console.warn(`[TerrainGenerator] Too many new planes (${changes.newPlanes.length}), limiting to ${maxChanges}`);
            changes.newPlanes = changes.newPlanes.slice(0, maxChanges);
        }
        if (changes.removedPlanes.length > maxChanges) {
            console.warn(`[TerrainGenerator] Too many removed planes (${changes.removedPlanes.length}), limiting to ${maxChanges}`);
            changes.removedPlanes = changes.removedPlanes.slice(0, maxChanges);
        }
        
        // Clear the change tracking sets after getting changes
        this.newPlanes.clear();
        this.removedPlanes.clear();
        
        return changes;
    }

    // Apply terrain changes from network (for receiving updates from other players)
    applyTerrainChanges(changes) {
        if (!changes) return;
        
        console.log(`[TerrainGenerator] Applying terrain changes: ${changes.newPlanes?.length || 0} new, ${changes.removedPlanes?.length || 0} removed`);
        
        // Create new planes
        if (changes.newPlanes && Array.isArray(changes.newPlanes)) {
            changes.newPlanes.forEach(planeData => {
                if (!planeData || typeof planeData.gridX !== 'number' || typeof planeData.gridZ !== 'number') {
                    console.warn('[TerrainGenerator] Invalid plane data:', planeData);
                    return;
                }
                
                const gridKey = this.getGridKey(planeData.gridX * this.planeSize, planeData.gridZ * this.planeSize);
                if (!this.planes.has(gridKey)) {
                    try {
                        // Create plane without tracking it as our own change
                        const terrainPlane = new TerrainPlane(planeData.gridX, planeData.gridZ, this.scene, this.planeSize, this.planeGeometry, this.planeMaterial);
                        this.planes.set(gridKey, terrainPlane);
                        console.log(`[TerrainGenerator] Created networked plane at (${planeData.gridX}, ${planeData.gridZ})`);
                    } catch (error) {
                        console.error('[TerrainGenerator] Error creating plane:', error);
                    }
                }
            });
        }

        // Remove planes
        if (changes.removedPlanes && Array.isArray(changes.removedPlanes)) {
            changes.removedPlanes.forEach(planeData => {
                if (!planeData) return;
                
                const gridKey = planeData.gridKey || this.getGridKey(planeData.gridX * this.planeSize, planeData.gridZ * this.planeSize);
                const terrainPlane = this.planes.get(gridKey);
                if (terrainPlane) {
                    try {
                        terrainPlane.remove();
                        this.planes.delete(gridKey);
                    } catch (error) {
                        console.error('[TerrainGenerator] Error removing plane:', error);
                    }
                }
            });
        }
    }
}