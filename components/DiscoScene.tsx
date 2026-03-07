import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { audioService } from '../services/audioService';
import { visionService } from '../services/visionService';
import { Gesture } from '../types';

interface DiscoSceneProps {
  videoRef: React.RefObject<HTMLVideoElement>;
  isActive: boolean;
  onGestureDetected?: (gesture: Gesture) => void;
}

// Shader for glowing, blinking particles with lifecycle
const particleVertexShader = `
    uniform float uTime;
    uniform float uVolume;
    uniform float uSize;
    
    attribute float aScale;
    attribute float aPhase;
    attribute vec3 aColor;
    attribute float aLife;
    
    varying vec3 vColor;
    varying float vLife;
    
    void main() {
        vColor = aColor;
        vLife = aLife;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        
        // Blink pattern: Speed increases with volume
        float blinkSpeed = 3.0 + uVolume * 10.0;
        float blink = 0.5 + 0.5 * sin(uTime * blinkSpeed + aPhase); // range 0.5 - 1.0
        
        // Reactive size: Pulse with volume
        float beatSize = 1.0 + uVolume * 3.0;
        
        // Robust size attenuation based on distance
        float dist = length(mvPosition.xyz);
        gl_PointSize = uSize * aScale * blink * beatSize * (50.0 / dist);
        
        gl_Position = projectionMatrix * mvPosition;
    }
`;

const particleFragmentShader = `
    uniform sampler2D uTexture;
    varying vec3 vColor;
    varying float vLife;
    
    void main() {
        // Drop fragment if life is over
        if (vLife <= 0.0) discard;

        vec4 texColor = texture2D(uTexture, gl_PointCoord);
        if (texColor.a < 0.01) discard;
        
        // Simple fade out over life
        float alpha = texColor.a * vLife;
        
        // Additive blending feel by multiplying color
        gl_FragColor = vec4(vColor, alpha) * texColor;
    }
`;

// Helper to create a radial gradient texture for the sprite
function createSpriteTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    if (!ctx) return new THREE.Texture();
    
    // Create a soft glow particle texture - reduced opacity for half brightness
    const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255, 255, 255, 0.5)'); 
    grad.addColorStop(0.2, 'rgba(255, 255, 255, 0.4)'); 
    grad.addColorStop(0.5, 'rgba(255, 255, 255, 0.15)'); 
    grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 64, 64);
    
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
}

export const DiscoScene: React.FC<DiscoSceneProps> = ({ videoRef, isActive, onGestureDetected }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const horseRef = useRef<THREE.Group | null>(null);
  const discoBallRef = useRef<THREE.Mesh | null>(null);
  const spotlightRef = useRef<THREE.SpotLight | null>(null);
  const raysGroupRef = useRef<THREE.Group | null>(null);
  const floorMeshRef = useRef<THREE.InstancedMesh | null>(null);
  const ambientLightRef = useRef<THREE.AmbientLight | null>(null);
  
  // Particle System Refs (Floor)
  const particlesRef = useRef<THREE.Points | null>(null);
  const particleUniformsRef = useRef<any>(null);
  const particleVelocitiesRef = useRef<Float32Array | null>(null);
  const particleLivesRef = useRef<Float32Array | null>(null);
  const spawnAccumulatorRef = useRef(0);

  // Particle System Refs (Disco Ball)
  const discoParticlesRef = useRef<THREE.Points | null>(null);
  const discoParticleUniformsRef = useRef<any>(null);
  
  // Floor State
  const floorColorsRef = useRef<THREE.Color[]>([]);
  const tilePositionsRef = useRef<{x: number, z: number}[]>([]);
  
  // Animation state
  const frameIdRef = useRef<number>(0);
  const targetPosRef = useRef(new THREE.Vector3(0, 0, 0));
  const currentGestureRef = useRef<Gesture>(Gesture.None);
  const jumpTimeRef = useRef(0);
  const spinTimeRef = useRef(0);
  const danceTimeRef = useRef(0);

  useEffect(() => {
    if (!containerRef.current) return;

    // --- Scene Setup ---
    const scene = new THREE.Scene();
    const bgColor = new THREE.Color(0x1a0b2e);
    scene.background = bgColor; 
    scene.fog = new THREE.FogExp2(0x1a0b2e, 0.025); 
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 100);
    camera.position.set(0, 5, 14); 
    camera.lookAt(0, 2, 0);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping; 
    renderer.toneMappingExposure = 1.0;
    containerRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // --- Lighting ---
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);
    ambientLightRef.current = ambientLight;

    const spotLight = new THREE.SpotLight(0xffaa00, 80); 
    spotLight.position.set(0, 20, 5);
    spotLight.angle = Math.PI / 4; 
    spotLight.penumbra = 0.5; 
    spotLight.decay = 1;
    spotLight.distance = 50;
    spotLight.castShadow = true;
    spotLight.shadow.mapSize.width = 2048; 
    spotLight.shadow.mapSize.height = 2048;
    scene.add(spotLight);
    spotlightRef.current = spotLight;

    // --- Floor ---
    const gridSize = 12;
    const tileStep = 2.0;
    const tileGeo = new THREE.BoxGeometry(1.9, 0.2, 1.9);
    const tileMat = new THREE.MeshStandardMaterial({ 
        roughness: 0.1, 
        metalness: 0.2,
    });
    
    const floorMesh = new THREE.InstancedMesh(tileGeo, tileMat, gridSize * gridSize);
    floorMesh.receiveShadow = true;
    
    const dummy = new THREE.Object3D();
    const colors: THREE.Color[] = [];
    const colorPalette = [
        new THREE.Color(0xFFA500).multiplyScalar(0.5), 
        new THREE.Color(0xFF00FF).multiplyScalar(0.5), 
        new THREE.Color(0xFFFF00).multiplyScalar(0.5), 
        new THREE.Color(0x00FFFF).multiplyScalar(0.5), 
        new THREE.Color(0xFF4500).multiplyScalar(0.5)
    ];

    let index = 0;
    const offset = (gridSize * tileStep) / 2 - (tileStep / 2);
    
    tilePositionsRef.current = [];
    for (let x = 0; x < gridSize; x++) {
        for (let z = 0; z < gridSize; z++) {
            dummy.position.set(x * tileStep - offset, -0.1, z * tileStep - offset);
            dummy.updateMatrix();
            floorMesh.setMatrixAt(index, dummy.matrix);
            tilePositionsRef.current.push({ x: dummy.position.x, z: dummy.position.z });
            
            const col = colorPalette[Math.floor(Math.random() * colorPalette.length)];
            floorMesh.setColorAt(index, col);
            colors.push(col.clone());
            index++;
        }
    }
    floorMesh.instanceMatrix.needsUpdate = true;
    floorMesh.instanceColor!.needsUpdate = true;
    scene.add(floorMesh);
    floorMeshRef.current = floorMesh;
    floorColorsRef.current = colors;

    // --- Disco Ball ---
    const ballGeo = new THREE.SphereGeometry(1.5, 32, 32);
    const ballMat = new THREE.MeshPhysicalMaterial({ 
      color: 0xffffff,
      roughness: 0.0, 
      metalness: 1.0, 
      reflectivity: 1.0,
      clearcoat: 1.0,
      emissive: 0x111111,
      emissiveIntensity: 0.5
    });
    const discoBall = new THREE.Mesh(ballGeo, ballMat);
    discoBall.position.set(0, 9, 0);
    scene.add(discoBall);
    discoBallRef.current = discoBall;

    const ballLight1 = new THREE.PointLight(0xff00ff, 5, 10);
    ballLight1.position.set(2, 9, 2);
    scene.add(ballLight1);
    const ballLight2 = new THREE.PointLight(0x00ffff, 5, 10);
    ballLight2.position.set(-2, 9, -2);
    scene.add(ballLight2);

    // --- Rays ---
    const raysGroup = new THREE.Group();
    raysGroup.position.set(0, 9, 0);
    const rayCount = 12;
    const rayGeo = new THREE.ConeGeometry(0.5, 25, 32, 1, true);
    rayGeo.translate(0, -12.5, 0);
    
    const rayMat = new THREE.MeshBasicMaterial({
        color: 0xffaa00,
        transparent: true,
        opacity: 0.1,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending
    });

    for(let i=0; i<rayCount; i++) {
        const ray = new THREE.Mesh(rayGeo, rayMat);
        ray.rotation.x = (Math.random() * 0.4 + 0.3);
        ray.rotation.z = (Math.random() - 0.5) * 1.0;
        const wrapper = new THREE.Group();
        wrapper.rotation.y = (Math.PI * 2 / rayCount) * i;
        wrapper.add(ray);
        raysGroup.add(wrapper);
    }
    scene.add(raysGroup);
    raysGroupRef.current = raysGroup;

    // --- Particles (Local Character System) ---
    const PARTICLE_COUNT = 75; 
    const particleGeo = new THREE.BufferGeometry();
    const pPositions = new Float32Array(PARTICLE_COUNT * 3);
    const pColors = new Float32Array(PARTICLE_COUNT * 3);
    const pScales = new Float32Array(PARTICLE_COUNT);
    const pPhases = new Float32Array(PARTICLE_COUNT);
    const pVelocities = new Float32Array(PARTICLE_COUNT * 3);
    const pLives = new Float32Array(PARTICLE_COUNT);

    const baseColor = new THREE.Color();
    for(let i = 0; i < PARTICLE_COUNT; i++) {
        const i3 = i * 3;
        pPositions[i3] = (Math.random() - 0.5) * 10;
        pPositions[i3 + 1] = Math.random() * 5 + 0.5;
        pPositions[i3 + 2] = (Math.random() - 0.5) * 10;
        pVelocities[i3] = (Math.random() - 0.5) * 0.05; 
        pVelocities[i3 + 1] = 0.02 + Math.random() * 0.03; 
        pVelocities[i3 + 2] = (Math.random() - 0.5) * 0.05;
        baseColor.setHSL(Math.random(), 1.0, 0.7);
        pColors[i3] = baseColor.r;
        pColors[i3 + 1] = baseColor.g;
        pColors[i3 + 2] = baseColor.b;
        pScales[i] = 0.5 + Math.random() * 1.0;
        pPhases[i] = Math.random() * Math.PI * 2;
        pLives[i] = Math.random(); 
    }

    particleGeo.setAttribute('position', new THREE.BufferAttribute(pPositions, 3));
    particleGeo.setAttribute('aColor', new THREE.BufferAttribute(pColors, 3));
    particleGeo.setAttribute('aScale', new THREE.BufferAttribute(pScales, 1));
    particleGeo.setAttribute('aPhase', new THREE.BufferAttribute(pPhases, 1));
    particleGeo.setAttribute('aLife', new THREE.BufferAttribute(pLives, 1));

    const particleMaterial = new THREE.ShaderMaterial({
        uniforms: {
            uTime: { value: 0 },
            uVolume: { value: 0 },
            uSize: { value: 50.0 },
            uTexture: { value: createSpriteTexture() }
        },
        vertexShader: particleVertexShader,
        fragmentShader: particleFragmentShader,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending
    });

    const particles = new THREE.Points(particleGeo, particleMaterial);
    particles.frustumCulled = false;
    scene.add(particles);
    particlesRef.current = particles;
    particleUniformsRef.current = particleMaterial.uniforms;
    particleVelocitiesRef.current = pVelocities;
    particleLivesRef.current = pLives;

    // --- Particles (Disco Ball System) ---
    const DB_PARTICLE_COUNT = 50;
    const dbGeo = new THREE.BufferGeometry();
    const dbPos = new Float32Array(DB_PARTICLE_COUNT * 3);
    const dbCol = new Float32Array(DB_PARTICLE_COUNT * 3);
    const dbScl = new Float32Array(DB_PARTICLE_COUNT);
    const dbPhs = new Float32Array(DB_PARTICLE_COUNT);
    const dbLif = new Float32Array(DB_PARTICLE_COUNT);

    for(let i=0; i<DB_PARTICLE_COUNT; i++) {
        const r = 2.0 + Math.random() * 0.5;
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(2 * Math.random() - 1);
        dbPos[i*3] = r * Math.sin(phi) * Math.cos(theta);
        dbPos[i*3+1] = 9 + r * Math.sin(phi) * Math.sin(theta); 
        dbPos[i*3+2] = r * Math.cos(phi);
        dbCol[i*3] = 0.9 + Math.random()*0.1; 
        dbCol[i*3+1] = 0.9 + Math.random()*0.1;
        dbCol[i*3+2] = 1.0;
        dbScl[i] = 0.5 + Math.random() * 0.5;
        dbPhs[i] = Math.random() * Math.PI * 2;
        dbLif[i] = 1.0; 
    }
    dbGeo.setAttribute('position', new THREE.BufferAttribute(dbPos, 3));
    dbGeo.setAttribute('aColor', new THREE.BufferAttribute(dbCol, 3));
    dbGeo.setAttribute('aScale', new THREE.BufferAttribute(dbScl, 1));
    dbGeo.setAttribute('aPhase', new THREE.BufferAttribute(dbPhs, 1));
    dbGeo.setAttribute('aLife', new THREE.BufferAttribute(dbLif, 1));

    const dbMaterial = new THREE.ShaderMaterial({
        uniforms: {
            uTime: { value: 0 },
            uVolume: { value: 0 },
            uSize: { value: 25.0 },
            uTexture: { value: particleMaterial.uniforms.uTexture.value }
        },
        vertexShader: particleVertexShader,
        fragmentShader: particleFragmentShader,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending
    });

    const dbParticles = new THREE.Points(dbGeo, dbMaterial);
    dbParticles.frustumCulled = false;
    scene.add(dbParticles);
    discoParticlesRef.current = dbParticles;
    discoParticleUniformsRef.current = dbMaterial.uniforms;

    // --- Procedural Horse (Bipedal Cartoon Style) ---
    const horseGroup = new THREE.Group();
    const coatColor = 0x8B5A2B; 
    const bellyColor = 0xE6C288; 
    const darkColor = 0x3E2723;
    const coatMat = new THREE.MeshStandardMaterial({ color: coatColor, roughness: 0.4 });
    const bellyMat = new THREE.MeshStandardMaterial({ color: bellyColor, roughness: 0.5 });
    const darkMat = new THREE.MeshStandardMaterial({ color: darkColor, roughness: 0.6 });
    // Shiny black material for sunglasses
    const glassMat = new THREE.MeshStandardMaterial({ color: 0x000000, roughness: 0.1, metalness: 0.8 });
    
    // Body
    const bodyGeo = new THREE.CapsuleGeometry(1.0, 1.2, 4, 16); 
    const body = new THREE.Mesh(bodyGeo, coatMat); 
    body.position.y = 2.0; 
    body.castShadow = true; 
    horseGroup.add(body);
    
    // Belly
    const bellyGeo = new THREE.SphereGeometry(0.85, 32, 32); 
    const belly = new THREE.Mesh(bellyGeo, coatMat); 
    belly.scale.set(1, 1.1, 0.4); 
    belly.position.set(0, -0.2, 0.7); 
    body.add(belly);
    
    // Head Group
    const headGroup = new THREE.Group(); 
    headGroup.position.set(0, 0.8, 0); 
    body.add(headGroup);
    
    const headGeo = new THREE.SphereGeometry(1.15, 32, 32); 
    const head = new THREE.Mesh(headGeo, coatMat); 
    head.position.y = 0.6; 
    head.castShadow = true; 
    headGroup.add(head);
    
    // Snout
    const snoutGeo = new THREE.SphereGeometry(0.7, 32, 32); 
    const snout = new THREE.Mesh(snoutGeo, bellyMat); 
    snout.scale.set(1.3, 0.85, 1.0); 
    snout.position.set(0, -0.3, 0.9); 
    head.add(snout);
    
    const nostrilGeo = new THREE.SphereGeometry(0.08); 
    const n1 = new THREE.Mesh(nostrilGeo, darkMat); 
    n1.position.set(-0.35, 0.2, 0.6); 
    snout.add(n1); 
    const n2 = n1.clone(); 
    n2.position.set(0.35, 0.2, 0.6); 
    snout.add(n2);
    
    // Ears
    const earGeo = new THREE.ConeGeometry(0.25, 0.7, 16); 
    const earL = new THREE.Mesh(earGeo, coatMat); 
    earL.name = "earL"; 
    earL.position.set(-0.6, 1.25, 0); 
    earL.rotation.z = 0.5; 
    earL.rotation.x = -0.2; 
    head.add(earL); 
    
    const earR = new THREE.Mesh(earGeo, coatMat); 
    earR.name = "earR"; 
    earR.position.set(0.6, 1.25, 0); 
    earR.rotation.z = -0.5; 
    earR.rotation.x = -0.2; 
    head.add(earR);
    
    // Hair
    const hairGeo = new THREE.SphereGeometry(0.35); 
    const hair = new THREE.Mesh(hairGeo, darkMat); 
    hair.scale.set(1, 0.8, 0.8); 
    hair.position.set(0, 1.35, 0.4); 
    hair.rotation.x = -0.3; 
    head.add(hair);
    
    // Sunglasses (Prominent, Wide, Dark)
    const glassesGroup = new THREE.Group();
    glassesGroup.position.set(0, 0.25, 1.05); // Positioned on nose bridge area
    head.add(glassesGroup);

    // Create lens shape using a scaled Capsule/Box
    const lensShape = new THREE.CapsuleGeometry(0.28, 0.45, 4, 8);
    const lensL = new THREE.Mesh(lensShape, glassMat);
    lensL.rotation.z = Math.PI / 2; // Horizontal
    lensL.position.set(-0.35, 0, 0);
    lensL.scale.set(1, 1, 0.4); // Flatten
    glassesGroup.add(lensL);

    const lensR = lensL.clone();
    lensR.position.set(0.35, 0, 0);
    glassesGroup.add(lensR);

    // Bridge
    const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.08, 0.05), glassMat);
    glassesGroup.add(bridge);
    
    // Limbs
    // Arms - Long and Extended by default
    const armGeo = new THREE.CapsuleGeometry(0.25, 1.4, 4, 8); // Elongated
    
    const armLGroup = new THREE.Group();
    armLGroup.name = 'armL_group';
    armLGroup.position.set(-0.95, 0.4, 0);
    body.add(armLGroup);
    
    const armL = new THREE.Mesh(armGeo, coatMat);
    armL.position.set(0, -0.7, 0); // Pivot at top
    armL.castShadow = true;
    armLGroup.add(armL);
    
    const hoofL = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.32, 0.3, 16), darkMat);
    hoofL.position.y = -0.8;
    armL.add(hoofL);
    
    const armRGroup = new THREE.Group();
    armRGroup.name = 'armR_group';
    armRGroup.position.set(0.95, 0.4, 0);
    body.add(armRGroup);
    
    const armR = new THREE.Mesh(armGeo, coatMat);
    armR.position.set(0, -0.7, 0);
    armR.castShadow = true;
    armRGroup.add(armR);

    const hoofR = hoofL.clone();
    armR.add(hoofR);
    
    // Legs
    const legGeo = new THREE.CapsuleGeometry(0.28, 0.9, 4, 8);
    const createLeg = (name: string, x: number) => {
        const group = new THREE.Group();
        group.name = name;
        group.position.set(x, -0.6, 0);
        const l = new THREE.Mesh(legGeo, coatMat);
        l.position.y = -0.45;
        l.castShadow = true;
        group.add(l);
        const h = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.38, 0.35, 16), darkMat);
        h.position.y = -1.0;
        h.castShadow = true;
        group.add(h);
        return group; 
    };
    
    const legL = createLeg('legL', -0.5);
    body.add(legL);
    const legR = createLeg('legR', 0.5);
    body.add(legR);
    
    // Tail
    const tailGeo = new THREE.ConeGeometry(0.4 * 1.25, 1.2 * 1.25, 16); 
    const tail = new THREE.Mesh(tailGeo, darkMat); 
    tail.position.set(0, -0.5, -0.7 - 0.25); 
    tail.rotation.x = -1.2; 
    tail.name = 'tail'; 
    body.add(tail);
    
    scene.add(horseGroup);
    horseRef.current = horseGroup;

    // --- Animation Loop ---
    const animate = () => {
        frameIdRef.current = requestAnimationFrame(animate);

        try {
            const time = performance.now() * 0.001;
            const analysis = audioService.getAnalysis();
            
            // Update uniforms
            if (particleUniformsRef.current) {
                particleUniformsRef.current.uTime.value = time;
                particleUniformsRef.current.uVolume.value = analysis.volume;
            }
            if (discoParticleUniformsRef.current) {
                discoParticleUniformsRef.current.uTime.value = time;
                discoParticleUniformsRef.current.uVolume.value = analysis.volume;
            }
            
            if (discoParticlesRef.current) {
                 discoParticlesRef.current.rotation.y += 0.005 + (analysis.volume * 0.1);
            }

            // Gesture Detection
            if (videoRef.current && videoRef.current.readyState >= 2 && videoRef.current.videoWidth > 0) {
                 const result = visionService.detect(videoRef.current);
                 if (result) {
                     if (onGestureDetected) onGestureDetected(result.gesture);
                     currentGestureRef.current = result.gesture;
                     // Smooth movement
                     const targetX = (1 - result.x) * 10 - 5;
                     const targetZ = result.y * 10 - 5;
                     targetPosRef.current.set(targetX, 0, targetZ);
                 } else {
                     currentGestureRef.current = Gesture.None;
                 }
            }

            // Scene Logic based on Gesture
            // Move Horse
            if (horseRef.current) {
                if (isActive) {
                    const cur = horseRef.current.position;
                    cur.lerp(targetPosRef.current, 0.05);
                    const tilt = (targetPosRef.current.x - cur.x) * -0.1;
                    horseRef.current.rotation.z = tilt;
                    horseRef.current.rotation.y = 0;
                } else {
                     horseRef.current.position.lerp(new THREE.Vector3(0,0,0), 0.05);
                }
            
                // Spin logic (Peace sign / Victory)
                if (currentGestureRef.current === Gesture.Victory) {
                     spinTimeRef.current += 0.05;
                     horseRef.current.rotation.y += spinTimeRef.current * 10;
                } else {
                     spinTimeRef.current *= 0.9;
                     horseRef.current.rotation.y += spinTimeRef.current; // Momentum
                }
                
                // Jump logic (Fist)
                if (currentGestureRef.current === Gesture.Closed_Fist) {
                     jumpTimeRef.current = Math.min(jumpTimeRef.current + 0.1, 1.0);
                } else {
                     jumpTimeRef.current = Math.max(jumpTimeRef.current - 0.1, 0.0);
                }
                
                // Jump displacement
                if (jumpTimeRef.current > 0) {
                     // Jump from floor (0) upwards. Multiplier adjusted for nice height.
                     horseRef.current.position.y = Math.abs(Math.sin(time * 10)) * 4.0 * jumpTimeRef.current;
                } else if (currentGestureRef.current === Gesture.Open_Palm) {
                     // Dance bounce
                     horseRef.current.position.y = Math.abs(Math.sin(time * 10)) * 0.5;
                } else {
                     // Idle breath (on floor)
                     horseRef.current.position.y = Math.sin(time * 2) * 0.05;
                }

                // --- ANIMATIONS ---
                const body = horseRef.current.children[0];
                const armLGroup = body.getObjectByName('armL_group');
                const armRGroup = body.getObjectByName('armR_group');
                const legL = body.getObjectByName('legL');
                const legR = body.getObjectByName('legR');
                const tail = body.getObjectByName('tail');

                // Default Arm State: Slightly Extended outwards
                let targetArmRot = 0.5; // About 30 degrees out
                
                if (currentGestureRef.current === Gesture.Open_Palm) {
                     danceTimeRef.current += 0.1;
                     // Swinging Arms High and Low
                     const swing = Math.sin(time * 12) * 1.5;
                     targetArmRot = 1.5 + swing; 

                     if (armLGroup) armLGroup.rotation.z = THREE.MathUtils.lerp(armLGroup.rotation.z, targetArmRot, 0.2);
                     if (armRGroup) armRGroup.rotation.z = THREE.MathUtils.lerp(armRGroup.rotation.z, -targetArmRot, 0.2);

                     if (legL) legL.rotation.x = Math.sin(time * 15) * 0.5;
                     if (legR) legR.rotation.x = Math.cos(time * 15) * 0.5;
                } else if (currentGestureRef.current === Gesture.Victory) {
                     // Arms up for victory spin
                     if (armLGroup) armLGroup.rotation.z = 2.5; 
                     if (armRGroup) armRGroup.rotation.z = -2.5;
                } else {
                     // Idle / Walking
                     const walk = Math.sin(time * 5) * 0.1;
                     if (armLGroup) armLGroup.rotation.z = 0.5 + walk;
                     if (armRGroup) armRGroup.rotation.z = -0.5 - walk;
                     
                     if (legL) legL.rotation.x = Math.sin(time * 4) * 0.2;
                     if (legR) legR.rotation.x = Math.cos(time * 4) * 0.2;
                }

                if (tail) tail.rotation.z = Math.sin(time * 8) * 0.2;
            }

            if (discoBallRef.current) {
                discoBallRef.current.rotation.y += 0.01 + spinTimeRef.current * 0.2;
            }
            if (raysGroupRef.current) {
                 raysGroupRef.current.rotation.y -= 0.005;
            }

            // Floor pulses on beat
            if (analysis.beatDetected && floorMeshRef.current) {
                 const count = gridSize * gridSize;
                 for(let i=0; i<count; i++) {
                     if (Math.random() > 0.8) {
                        const col = floorColorsRef.current[i].clone();
                        col.multiplyScalar(2.0); // flash
                        floorMeshRef.current.setColorAt(i, col);
                     } else {
                        floorMeshRef.current.setColorAt(i, floorColorsRef.current[i]);
                     }
                 }
                 floorMeshRef.current.instanceColor!.needsUpdate = true;
            } else if (floorMeshRef.current) {
                 const count = gridSize * gridSize;
                 for(let i=0; i<count; i++) {
                      floorMeshRef.current.setColorAt(i, floorColorsRef.current[i]);
                 }
                 floorMeshRef.current.instanceColor!.needsUpdate = true;
            }
            
            // Particles follow horse
            if (particlesRef.current && horseRef.current && particleVelocitiesRef.current && particleLivesRef.current) {
                 const pos = particlesRef.current.geometry.attributes.position.array as Float32Array;
                 const lives = particlesRef.current.geometry.attributes.aLife.array as Float32Array;
                 const vels = particleVelocitiesRef.current;
                 const horsePos = horseRef.current.position;
                 
                 spawnAccumulatorRef.current += 0.016;
                 let spawnCount = 0;

                 for(let i=0; i<PARTICLE_COUNT; i++) {
                     if (lives[i] > 0) {
                         lives[i] -= 0.01 + analysis.volume * 0.02;
                         pos[i*3] += vels[i*3];
                         pos[i*3+1] += vels[i*3+1];
                         pos[i*3+2] += vels[i*3+2];
                     } else if (spawnAccumulatorRef.current > 0.05 && spawnCount < 2) {
                         lives[i] = 1.0;
                         const angle = Math.random() * Math.PI * 2;
                         const rad = 1.5 + Math.random();
                         pos[i*3] = horsePos.x + Math.cos(angle)*rad;
                         pos[i*3+1] = 0.5 + Math.random();
                         pos[i*3+2] = horsePos.z + Math.sin(angle)*rad;
                         spawnCount++;
                     }
                 }
                 if (spawnCount > 0) spawnAccumulatorRef.current = 0;
                 particlesRef.current.geometry.attributes.position.needsUpdate = true;
                 particlesRef.current.geometry.attributes.aLife.needsUpdate = true;
            }
        } catch (err) {
            console.error("Error in animate loop:", err);
        } finally {
            renderer.render(scene, camera);
        }
    };

    animate();

    const handleResize = () => {
        if (!cameraRef.current || !rendererRef.current) return;
        cameraRef.current.aspect = window.innerWidth / window.innerHeight;
        cameraRef.current.updateProjectionMatrix();
        rendererRef.current.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener('resize', handleResize);

    return () => {
        window.removeEventListener('resize', handleResize);
        cancelAnimationFrame(frameIdRef.current);
        if (containerRef.current) {
            containerRef.current.innerHTML = '';
        }
        if (rendererRef.current) {
            rendererRef.current.dispose();
        }
    };
  }, [isActive, videoRef, onGestureDetected]); 

  return <div ref={containerRef} className="absolute inset-0 w-full h-full" />;
};