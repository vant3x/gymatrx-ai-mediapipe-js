class ExerciseApp {
    constructor() {
        this.pose = null;
        this.camera = null;
        this.isActive = false;
        this.currentExercise = 'pushups';
        this.repCount = 0;
        this.stage = 'up';
        this.lastStageChange = 0;
        
        // Contadores específicos
        this.pushupCount = 0;
        this.pullupCount = 0;
        this.catsCount = 0;
        this.dogsCount = 0;
        
        // Anti-bounce: evita cambios muy rápidos
        this.minStageTime = 500; // 500ms mínimo entre cambios de stage

        // Umbrales de ángulo para ejercicios
        this.PUSHUP_DOWN_ANGLE = 90;   // Ángulo del codo cuando está abajo (flexión)
        this.PUSHUP_UP_ANGLE = 160;    // Ángulo del codo cuando está arriba (extensión)
        this.PULLUP_UP_ANGLE = 90;     // Ángulo del codo cuando está arriba (dominada)
        this.PULLUP_DOWN_ANGLE = 160;  // Ángulo del codo cuando está abajo (extensión)

        // Umbrales de posición vertical para flexiones (hombro vs codo)
        this.PUSHUP_SHOULDER_ELBOW_RATIO_DOWN = 0.95; // Hombro >= codo * ratio (para abajo)
        this.PUSHUP_SHOULDER_ELBOW_RATIO_UP = 0.90;   // Hombro < codo * ratio (para arriba)

        // Umbrales de distancia vertical para dominadas (hombro vs muñeca)
        this.PULLUP_HEIGHT_DIFF_UP = 0.15;   // Diferencia de altura pequeña (arriba)
        this.PULLUP_HEIGHT_DIFF_DOWN = 0.25; // Diferencia de altura grande (abajo)
        
        // Three.js properties
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.skeletonGroup = new THREE.Group(); // Group to hold all skeleton parts

        // Camera switching properties
        this.availableCameras = [];
        this.currentCameraIndex = 0;

        // Audio properties
        this.synth = null;
        this.soundEnabled = true; // Sound is enabled by default

        // Smoothing para reducir jitter
        this.positionHistory = [];
        this.historySize = 5;
        
        this.initializeElements();
        this.initializeMediaPipe();
        this.initializeThreeJS(); // Initialize Three.js
        this.initializeAudio(); // Initialize Tone.js audio
        this.bindEvents();
    }

    initializeElements() {
        this.videoElement = document.getElementById('videoElement');
        this.canvasElement = document.getElementById('canvasElement');
        this.canvasCtx = this.canvasElement.getContext('2d');
        this.statusIndicator = document.getElementById('statusIndicator');
        this.repCounter = document.getElementById('repCounter');
        this.catCounter = document.getElementById('catCounter');
        this.dogCounter = document.getElementById('dogCounter');
        this.currentExerciseSpan = document.getElementById('currentExercise');
        this.petMessage = document.getElementById('petMessage');
        this.celebration = document.getElementById('celebration');
        this.petEmoji = document.getElementById('petEmoji');
        
        // Debug elements
        this.debugInfo = document.getElementById('debugInfo');
        this.debugStage = document.getElementById('debugStage');
        this.debugAngle = document.getElementById('debugAngle');
        this.debugPosition = document.getElementById('debugPosition');

        this.updateCurrentPet();
    }

    updateCurrentPet() {
        if (this.currentExercise === 'pushups') {
            this.petEmoji.textContent = '🐱';
            this.petMessage.textContent = '¡Cada flexión salva un gatito!';
        } else {
            this.petEmoji.textContent = '🐶';
            this.petMessage.textContent = '¡Cada dominada salva un perrito!';
        }
    }

    async initializeMediaPipe() {
        this.pose = new Pose({
            locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`
        });

        this.pose.setOptions({
            modelComplexity: 1,
            smoothLandmarks: true,
            enableSegmentation: false,
            smoothSegmentation: false,
            minDetectionConfidence: 0.7, // Aumentado para mejor detección
            minTrackingConfidence: 0.7  // Aumentado para mejor tracking
        });

        this.pose.onResults(this.onResults.bind(this));
        await this.initializeCamera();
    }

    initializeThreeJS() {
        const threeContainer = document.getElementById('threeContainer');
        const width = threeContainer.clientWidth;
        const height = threeContainer.clientHeight;

        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        this.renderer.setSize(width, height);
        threeContainer.appendChild(this.renderer.domElement);

        // Add some basic lighting
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
        this.scene.add(ambientLight);
        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.5);
        directionalLight.position.set(0, 1, 0);
        this.scene.add(directionalLight);

        // Set camera position (adjust as needed)
        this.camera.position.z = 2; // Adjust based on your scene scale
        this.scene.add(this.skeletonGroup);

        // Handle window resize
        window.addEventListener('resize', () => {
            const newWidth = threeContainer.clientWidth;
            const newHeight = threeContainer.clientHeight;
            this.camera.aspect = newWidth / newHeight;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(newWidth, newHeight);
        });
    }

    initializeAudio() {
        this.synth = new Tone.Synth().toDestination();
    }

    async initializeCamera() {
        try {
            // Enumerate devices to find available cameras
            const devices = await navigator.mediaDevices.enumerateDevices();
            this.availableCameras = devices.filter(device => device.kind === 'videoinput');

            if (this.availableCameras.length === 0) {
                console.error('No video input devices found.');
                this.updateStatus('error', '❌ No se encontraron cámaras');
                return;
            }

            // Determine which camera to use
            let constraints = {};
            if (this.availableCameras.length > 0) {
                const camera = this.availableCameras[this.currentCameraIndex];
                constraints = {
                    video: {
                        deviceId: { exact: camera.deviceId },
                        width: window.innerWidth <= 768 ? { ideal: 480 } : { ideal: 740 },
                        height: window.innerWidth <= 768 ? { ideal: 360 } : { ideal: 480 },
                        frameRate: { ideal: 30, max: 30 }
                    }
                };
            } else {
                // Fallback to facingMode if no specific deviceId is available
                constraints = {
                    video: {
                        width: window.innerWidth <= 768 ? { ideal: 480 } : { ideal: 740 },
                        height: window.innerWidth <= 768 ? { ideal: 360 } : { ideal: 480 },
                        facingMode: 'user',
                        frameRate: { ideal: 30, max: 30 }
                    }
                };
            }

            // Stop existing stream if any
            if (this.videoElement.srcObject) {
                this.videoElement.srcObject.getTracks().forEach(track => track.stop());
            }

            const stream = await navigator.mediaDevices.getUserMedia(constraints);
            this.videoElement.srcObject = stream;

            this.videoElement.addEventListener('loadedmetadata', () => {
                this.canvasElement.width = this.videoElement.videoWidth;
                this.canvasElement.height = this.videoElement.videoHeight;
                this.updateStatus('ready', '✅ Listo para ejercitar');
            });

            // Re-initialize Camera object from MediaPipe for new stream
            if (this.camera) {
                this.camera.stop(); // Stop previous camera instance
            }
            this.camera = new Camera(this.videoElement, {
                onFrame: async () => {
                    if (this.isActive) {
                        await this.pose.send({ image: this.videoElement });
                    }
                },
                width: window.innerWidth <= 768 ? 480 : 740,
                height: window.innerWidth <= 768 ? 360 : 480
            });
            this.camera.start(); // Start the new camera instance

            // Show/hide switch camera button based on available cameras
            const switchCameraButton = document.getElementById('switchCameraBtn');
            if (switchCameraButton) {
                if (this.availableCameras.length > 1) {
                    switchCameraButton.style.display = 'block';
                } else {
                    switchCameraButton.style.display = 'none';
                }
            }

        } catch (error) {
            console.error('Error accessing camera:', error);
            this.updateStatus('error', '❌ Error accediendo a la cámara');
        }
    }

    onResults(results) {
        // Clear 2D canvas
        this.canvasCtx.clearRect(0, 0, this.canvasElement.width, this.canvasElement.height);

        // Clear previous skeleton from Three.js scene
        this.skeletonGroup.clear();

        if (results.poseWorldLandmarks) {
            // Use poseWorldLandmarks for 3D visualization
            const landmarks3D = results.poseWorldLandmarks;

            // Define connections for the skeleton (same as POSE_CONNECTIONS for 2D)
            const POSE_CONNECTIONS_3D = [
                [POSE_LANDMARKS.NOSE, POSE_LANDMARKS.LEFT_EYE],
                [POSE_LANDMARKS.LEFT_EYE, POSE_LANDMARKS.LEFT_EAR],
                [POSE_LANDMARKS.NOSE, POSE_LANDMARKS.RIGHT_EYE],
                [POSE_LANDMARKS.RIGHT_EYE, POSE_LANDMARKS.RIGHT_EAR],
                [POSE_LANDMARKS.LEFT_EAR, POSE_LANDMARKS.LEFT_SHOULDER],
                [POSE_LANDMARKS.RIGHT_EAR, POSE_LANDMARKS.RIGHT_SHOULDER],
                [POSE_LANDMARKS.LEFT_SHOULDER, POSE_LANDMARKS.RIGHT_SHOULDER],
                [POSE_LANDMARKS.LEFT_SHOULDER, POSE_LANDMARKS.LEFT_ELBOW],
                [POSE_LANDMARKS.LEFT_ELBOW, POSE_LANDMARKS.LEFT_WRIST],
                [POSE_LANDMARKS.RIGHT_SHOULDER, POSE_LANDMARKS.RIGHT_ELBOW],
                [POSE_LANDMARKS.RIGHT_ELBOW, POSE_LANDMARKS.RIGHT_WRIST],
                [POSE_LANDMARKS.LEFT_HIP, POSE_LANDMARKS.RIGHT_HIP],
                [POSE_LANDMARKS.LEFT_SHOULDER, POSE_LANDMARKS.LEFT_HIP],
                [POSE_LANDMARKS.RIGHT_SHOULDER, POSE_LANDMARKS.RIGHT_HIP],
                [POSE_LANDMARKS.LEFT_HIP, POSE_LANDMARKS.LEFT_KNEE],
                [POSE_LANDMARKS.LEFT_KNEE, POSE_LANDMARKS.LEFT_ANKLE],
                [POSE_LANDMARKS.RIGHT_HIP, POSE_LANDMARKS.RIGHT_KNEE],
                [POSE_LANDMARKS.RIGHT_KNEE, POSE_LANDMARKS.RIGHT_ANKLE],
                [POSE_LANDMARKS.LEFT_ANKLE, POSE_LANDMARKS.LEFT_FOOT_INDEX],
                [POSE_LANDMARKS.RIGHT_ANKLE, POSE_LANDMARKS.RIGHT_FOOT_INDEX],
            ];

            // Add spheres for each landmark
            const sphereGeometry = new THREE.SphereGeometry(0.02, 32, 32); // Adjust size as needed
            const sphereMaterial = new THREE.MeshBasicMaterial({ color: 0x00ff00 });

            landmarks3D.forEach(landmark => {
                const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
                // MediaPipe's Z-axis is depth, Three.js Z-axis is typically forward/backward
                // You might need to adjust coordinates based on your camera setup
                sphere.position.set(landmark.x, -landmark.y, -landmark.z); // Invert Y and Z for typical 3D view
                this.skeletonGroup.add(sphere);
            });

            // Add cylinders for connections
            const cylinderMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000 });
            POSE_CONNECTIONS_3D.forEach(connection => {
                const start = landmarks3D[connection[0]];
                const end = landmarks3D[connection[1]];

                if (start && end) {
                    const startVec = new THREE.Vector3(start.x, -start.y, -start.z);
                    const endVec = new THREE.Vector3(end.x, -end.y, -end.z);

                    const distance = startVec.distanceTo(endVec);
                    const cylinderGeometry = new THREE.CylinderGeometry(0.01, 0.01, distance, 32);
                    const cylinder = new THREE.Mesh(cylinderGeometry, cylinderMaterial);

                    cylinder.position.lerpVectors(startVec, endVec, 0.5);
                    cylinder.lookAt(endVec);
                    cylinder.rotateX(Math.PI / 2); // Align cylinder with connection

                    this.skeletonGroup.add(cylinder);
                }
            });

            // Render the Three.js scene
            this.renderer.render(this.scene, this.camera);

            // Analyze exercise using 3D landmarks
            this.analyzeExercise(results.poseWorldLandmarks);
        }

        // Render the Three.js scene even if no pose is detected, to show background/empty scene
        if (this.renderer && this.scene && this.camera) {
            this.renderer.render(this.scene, this.camera);
        }
    smoothPosition(currentValue, key) {
        if (!this.positionHistory[key]) {
            this.positionHistory[key] = [];
        }
        
        this.positionHistory[key].push(currentValue);
        if (this.positionHistory[key].length > this.historySize) {
            this.positionHistory[key].shift();
        }
        
        return this.positionHistory[key].reduce((a, b) => a + b) / this.positionHistory[key].length;
    }

    analyzeExercise(landmarks) {
        if (this.currentExercise === 'pushups') {
            this.analyzePushups(landmarks);
        } else if (this.currentExercise === 'pullups') {
            this.analyzePullups(landmarks);
        }
    }

    analyzePushups(landmarks) {
        const leftShoulder = landmarks[11];
        const rightShoulder = landmarks[12];
        const leftElbow = landmarks[13];
        const rightElbow = landmarks[14];
        const leftHip = landmarks[23];
        const rightHip = landmarks[24];

        if (!leftShoulder || !rightShoulder || !leftElbow || !rightElbow || !leftHip || !rightHip) {
            this.updateStatus('waiting', 'Asegúrate de que tu cuerpo sea visible.');
            return;
        }

        // Calcular ángulo del brazo para mejor detección
        const leftArmAngle = this.calculateAngle(leftShoulder, leftElbow, landmarks[POSE_LANDMARKS.LEFT_WRIST]);
        const rightArmAngle = this.calculateAngle(rightShoulder, rightElbow, landmarks[POSE_LANDMARKS.RIGHT_WRIST]);
        const avgArmAngle = this.smoothPosition((leftArmAngle + rightArmAngle) / 2, 'armAngle');

        // Lógica mejorada con ángulos 3D
        const isDown = avgArmAngle < this.PUSHUP_DOWN_ANGLE;
        const isUp = avgArmAngle > this.PUSHUP_UP_ANGLE;

        // Debug info
        this.updateDebugInfo(this.stage, avgArmAngle.toFixed(1), `3D Angles`);

        this.processStageChange(isUp, isDown, 'pushup');
    }

    analyzePullups(landmarks) {
        const leftShoulder = landmarks[POSE_LANDMARKS.LEFT_SHOULDER];
        const rightShoulder = landmarks[POSE_LANDMARKS.RIGHT_SHOULDER];
        const leftElbow = landmarks[POSE_LANDMARKS.LEFT_ELBOW];
        const rightElbow = landmarks[POSE_LANDMARKS.RIGHT_ELBOW];
        const leftWrist = landmarks[POSE_LANDMARKS.LEFT_WRIST];
        const rightWrist = landmarks[POSE_LANDMARKS.RIGHT_WRIST];

        if (!leftShoulder || !rightShoulder || !leftElbow || !rightElbow || !leftWrist || !rightWrist) {
            this.updateStatus('waiting', 'Asegúrate de que tu torso y brazos sean visibles.');
            return;
        }

        // Calculate elbow angles for pullups
        const leftElbowAngle = this.calculateAngle(leftShoulder, leftElbow, leftWrist);
        const rightElbowAngle = this.calculateAngle(rightShoulder, rightElbow, rightWrist);
        const avgElbowAngle = this.smoothPosition((leftElbowAngle + rightElbowAngle) / 2, 'elbowAnglePullup');

        // Lógica mejorada con ángulos 3D
        // For pullups, 'up' means elbows are bent (chin above bar), 'down' means arms extended.
        const isUp = avgElbowAngle < this.PULLUP_UP_ANGLE;
        const isDown = avgElbowAngle > this.PULLUP_DOWN_ANGLE;

        // Debug info
        this.updateDebugInfo(this.stage, avgElbowAngle.toFixed(1), `3D Angles`);

        // Usar el procesador de cambio de etapa común
        this.processStageChange(isUp, isDown, 'pullup');
    }

    processStageChange(isUp, isDown, exerciseType) {
        const now = Date.now();
        
        // Anti-bounce: evitar cambios muy rápidos
        if (now - this.lastStageChange < this.minStageTime) {
            return;
        }

        if (this.stage === 'up' && isDown) {
            this.stage = 'down';
            this.lastStageChange = now;
            this.updateStatus('exercising', '⬇️ ¡Baja!');
        } else if (this.stage === 'down' && isUp) {
            this.stage = 'up';
            this.lastStageChange = now;
            this.completeRep(exerciseType);
        }
    }

    calculateAngle(a, b, c) {
        // Ensure landmarks have z-coordinate for 3D calculation
        const pointA = new THREE.Vector3(a.x, a.y, a.z || 0);
        const pointB = new THREE.Vector3(b.x, b.y, b.z || 0);
        const pointC = new THREE.Vector3(c.x, c.y, c.z || 0);

        const vectorBA = pointA.clone().sub(pointB);
        const vectorBC = pointC.clone().sub(pointB);

        const dotProduct = vectorBA.dot(vectorBC);
        const magnitudeBA = vectorBA.length();
        const magnitudeBC = vectorBC.length();

        // Avoid division by zero
        if (magnitudeBA === 0 || magnitudeBC === 0) {
            return 0;
        }

        const angleRad = Math.acos(dotProduct / (magnitudeBA * magnitudeBC));
        let angleDeg = angleRad * 180.0 / Math.PI;

        // Ensure angle is within 0-180 range
        if (isNaN(angleDeg)) { // Handle potential NaN from acos due to floating point inaccuracies
            angleDeg = 0;
        }

        return angleDeg;
    }

    completeRep(exerciseType) {
        this.repCount++;
        this.repCounter.textContent = this.repCount;

        if (exerciseType === 'pushup') {
            this.pushupCount++;
            this.savePet('cat');
        } else if (exerciseType === 'pullup') {
            this.pullupCount++;
            this.savePet('dog');
        }

        this.updateStatus('ready', '✅ ¡Repetición completada!');
        this.showCelebration('💪 ¡Bien hecho!');

        setTimeout(() => {
            this.updateStatus('ready', '✅ Listo para la siguiente');
        }, 1500);

        this.playSound();
    }

    playSound() {
        if (this.soundEnabled && this.synth) {
            // Ensure audio context is running
            if (Tone.context.state !== 'running') {
                Tone.start();
            }
            this.synth.triggerAttackRelease('C4', '8n'); // Play a C4 note for an 8th note duration
        }
    }

    savePet(petType) {
        if (petType === 'cat') {
            this.catsCount++;
            this.catCounter.textContent = this.catsCount;
            this.showCelebration('🎉 ¡GATITO SALVADO! 🐱✨');
        } else if (petType === 'dog') {
            this.dogsCount++;
            this.dogCounter.textContent = this.dogsCount;
            this.showCelebration('🎉 ¡PERRITO SALVADO! 🐶✨');
        }

        this.updateCurrentPet();
        this.createParticleEffect();
    }

    showCelebration(message) {
        this.celebration.textContent = message;
        this.celebration.style.animation = 'none';
        setTimeout(() => {
            this.celebration.style.animation = 'celebrate 2s ease-out';
        }, 10);
    }

    createParticleEffect() {
        for (let i = 0; i < 8; i++) {
            const particle = document.createElement('div');
            particle.style.cssText = `
                position: fixed;
                width: 8px;
                height: 8px;
                background: ${['#ff6b6b', '#ffd700', '#00b894', '#74b9ff'][Math.floor(Math.random() * 4)]};
                border-radius: 50%;
                pointer-events: none;
                z-index: 999;
                left: ${Math.random() * window.innerWidth}px;
                top: ${Math.random() * window.innerHeight}px;
                animation: particle-fall 2s ease-out forwards;
            `;
            document.body.appendChild(particle);
            setTimeout(() => particle.remove(), 2000);
        }
    }

    updateStatus(type, message) {
        this.statusIndicator.className = `status-indicator status-${type}`;
        this.statusIndicator.textContent = message;
    }

    updateDebugInfo(stage, angle, position) {
        if (this.debugInfo.style.display !== 'none') {
            this.debugStage.textContent = stage;
            this.debugAngle.textContent = angle;
            this.debugPosition.textContent = position;
        }
    }

    bindEvents() {
        document.querySelectorAll('.exercise-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelector('.exercise-btn.active').classList.remove('active');
                e.target.classList.add('active');

                this.currentExercise = e.target.dataset.exercise;
                this.currentExerciseSpan.textContent = e.target.textContent.replace('💪 ', '').replace('🏋️ ', '');
                
                // Reset state for new exercise
                this.stage = 'up';
                this.repCount = 0;
                this.repCounter.textContent = 0;
                this.positionHistory = {}; // Clear smoothing history
                this.updateStatus('ready', '✅ Listo para ejercitar');
                this.updateCurrentPet();
            });
        });

        document.getElementById('startBtn').addEventListener('click', () => {
            if (this.isActive) {
                this.stopExercise();
            } else {
                this.startExercise();
            }
        });

        const switchCameraButton = document.getElementById('switchCameraBtn');
        if (switchCameraButton) {
            switchCameraButton.addEventListener('click', () => this.switchCamera());
        }

        const toggleSoundButton = document.getElementById('toggleSoundBtn');
        if (toggleSoundButton) {
            // Set initial button text
            toggleSoundButton.textContent = this.soundEnabled ? '🔊 Sonido ON' : '🔇 Sonido OFF';

            toggleSoundButton.addEventListener('click', () => {
                this.soundEnabled = !this.soundEnabled;
                toggleSoundButton.textContent = this.soundEnabled ? '🔊 Sonido ON' : '🔇 Sonido OFF';
            });
        }
    }

    startExercise() {
        this.isActive = true;
        this.stage = 'up';
        this.positionHistory = {}; // Clear smoothing history
        this.camera.start();
        document.getElementById('startBtn').textContent = '⏹️ Detener Ejercicio';
        this.updateStatus('exercising', '🔥 ¡Ejercitando!');
    }

    stopExercise() {
        this.isActive = false;
        if (this.camera) {
            this.camera.stop();
        }
        this.canvasCtx.clearRect(0, 0, this.canvasElement.width, this.canvasElement.height);

        document.getElementById('startBtn').textContent = '🚀 Comenzar Ejercicio';
        this.updateStatus('ready', '✅ Listo para ejercitar');
        this.stage = 'up';
        this.positionHistory = {}; // Clear smoothing history
    }

    async switchCamera() {
        this.currentCameraIndex = (this.currentCameraIndex + 1) % this.availableCameras.length;
        await this.initializeCamera();
    }
}

// Función global para toggle debug
function toggleDebug() {
    const debugInfo = document.getElementById('debugInfo');
    debugInfo.style.display = debugInfo.style.display === 'none' ? 'block' : 'none';
}

// Inicializar la aplicación cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', () => {
    new ExerciseApp();
});