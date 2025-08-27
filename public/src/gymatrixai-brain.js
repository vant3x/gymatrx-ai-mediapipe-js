class ExerciseApp {
    constructor() {
        this.pose = null;
        this.mediaPipeCamera = null;
        this.isActive = false;
        this.currentExercise = 'pushups';
        this.repCount = 0;
        this.stage = 'up';
        this.lastStageChange = 0;
        
        this.pushupCount = 0;
        this.pullupCount = 0;
        this.catsCount = 0;
        this.dogsCount = 0;
        
        this.minStageTime = 500;

        this.PUSHUP_DOWN_ANGLE = 90;
        this.PUSHUP_UP_ANGLE = 160;
        this.PULLUP_UP_ANGLE = 90;
        this.PULLUP_DOWN_ANGLE = 160;

        this.scene = null;
        this.threeCamera = null;
        this.renderer = null;
        this.skeletonGroup = new THREE.Group();

        this.availableCameras = [];
        this.currentCameraIndex = 0;

        this.synth = null;
        this.soundEnabled = true;

        this.positionHistory = [];
        this.historySize = 5;
        
        this.initializeElements();
        this.initializeThreeJS();
        this.initializeMediaPipe();
        this.initializeAudio();
        this.bindEvents();
    }

    initializeElements() {
        this.videoElement = document.getElementById('videoElement');
        this.statusIndicator = document.getElementById('statusIndicator');
        this.repCounter = document.getElementById('repCounter');
        this.catCounter = document.getElementById('catCounter');
        this.dogCounter = document.getElementById('dogCounter');
        this.currentExerciseSpan = document.getElementById('currentExercise');
        this.petMessage = document.getElementById('petMessage');
        this.celebration = document.getElementById('celebration');
        this.petEmoji = document.getElementById('petEmoji');
        
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
            minDetectionConfidence: 0.7,
            minTrackingConfidence: 0.7
        });

        this.pose.onResults(this.onResults.bind(this));
        await this.initializeCamera();
    }

    initializeThreeJS() {
        const threeContainer = document.getElementById('threeContainer');
        
        this.scene = new THREE.Scene();
        this.threeCamera = new THREE.PerspectiveCamera(50, threeContainer.clientWidth / threeContainer.clientHeight, 0.1, 10);
        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        
        this.threeCamera.position.z = 1.5; // Set a fixed, reasonable distance for the camera

        threeContainer.appendChild(this.renderer.domElement);

        const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
        this.scene.add(ambientLight);
        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.5);
        directionalLight.position.set(0, 1, 1);
        this.scene.add(directionalLight);

        this.scene.add(this.skeletonGroup);
    }

    initializeAudio() {
        this.synth = new Tone.Synth().toDestination();
    }

    async initializeCamera() {
        try {
            const devices = await navigator.mediaDevices.enumerateDevices();
            this.availableCameras = devices.filter(device => device.kind === 'videoinput');

            if (this.availableCameras.length === 0) throw new Error('No video input devices found.');

            const constraints = {
                video: {
                    deviceId: { exact: this.availableCameras[this.currentCameraIndex].deviceId },
                    width: { ideal: 960 },
                    height: { ideal: 540 },
                    frameRate: { ideal: 30 }
                }
            };

            if (this.videoElement.srcObject) {
                this.videoElement.srcObject.getTracks().forEach(track => track.stop());
            }

            const stream = await navigator.mediaDevices.getUserMedia(constraints);
            this.videoElement.srcObject = stream;

            this.videoElement.addEventListener('loadedmetadata', () => {
                this.videoElement.play(); // Ensure video is playing for the texture
                this.scene.background = new THREE.VideoTexture(this.videoElement);
                this.handleResize(); // Set initial size correctly
                this.updateStatus('ready', '✅ Listo para ejercitar');
            });

            this.mediaPipeCamera = new Camera(this.videoElement, {
                onFrame: async () => {
                    if (this.isActive) {
                        await this.pose.send({ image: this.videoElement });
                    }
                },
                width: 960,
                height: 540
            });

            if (this.isActive) this.mediaPipeCamera.start();

            const switchCameraButton = document.getElementById('switchCameraBtn');
            if (switchCameraButton) {
                switchCameraButton.style.display = this.availableCameras.length > 1 ? 'block' : 'none';
            }

        } catch (error) {
            console.error('Error accessing camera:', error);
            this.updateStatus('error', '❌ Error accediendo a la cámara');
        }
    }

    onResults(results) {
        this.skeletonGroup.clear();

        if (results.poseWorldLandmarks) {
            const landmarks3D = results.poseWorldLandmarks;
            const POSE_CONNECTIONS_3D = window.POSE_CONNECTIONS;

            const sphereGeometry = new THREE.SphereGeometry(0.015, 32, 32);
            const sphereMaterial = new THREE.MeshStandardMaterial({ color: 0x00ff00, roughness: 0.5, metalness: 0.8 });

            landmarks3D.forEach(landmark => {
                if (landmark.visibility > 0.5) {
                    const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
                    sphere.position.set(landmark.x, -landmark.y, -landmark.z);
                    this.skeletonGroup.add(sphere);
                }
            });

            const cylinderMaterial = new THREE.MeshStandardMaterial({ color: 0xff0000, roughness: 0.5, metalness: 0.8 });
            POSE_CONNECTIONS_3D.forEach(connection => {
                const start = landmarks3D[connection[0]];
                const end = landmarks3D[connection[1]];

                if (start && end && start.visibility > 0.5 && end.visibility > 0.5) {
                    const startVec = new THREE.Vector3(start.x, -start.y, -start.z);
                    const endVec = new THREE.Vector3(end.x, -end.y, -end.z);

                    const distance = startVec.distanceTo(endVec);
                    const cylinderGeometry = new THREE.CylinderGeometry(0.005, 0.005, distance, 16);
                    const cylinder = new THREE.Mesh(cylinderGeometry, cylinderMaterial);

                    cylinder.position.lerpVectors(startVec, endVec, 0.5);
                    cylinder.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), endVec.clone().sub(startVec).normalize());
                    
                    this.skeletonGroup.add(cylinder);
                }
            });

            // Apply a fixed vertical offset to the whole skeleton
            this.skeletonGroup.position.y = -0.25;
            
            this.analyzeExercise(landmarks3D);
        }

        this.renderer.render(this.scene, this.threeCamera);
    }

    handleResize() {
        const threeContainer = document.getElementById('threeContainer');
        if (!threeContainer) return;

        const width = threeContainer.clientWidth;
        const height = threeContainer.clientHeight;

        this.renderer.setSize(width, height);
        this.threeCamera.aspect = width / height;
        this.threeCamera.updateProjectionMatrix();
    }

    smoothPosition(currentValue, key) {
        if (!this.positionHistory[key]) this.positionHistory[key] = [];
        
        this.positionHistory[key].push(currentValue);
        if (this.positionHistory[key].length > this.historySize) {
            this.positionHistory[key].shift();
        }
        
        return this.positionHistory[key].reduce((a, b) => a + b) / this.positionHistory[key].length;
    }

    analyzeExercise(landmarks) {
        if (this.currentExercise === 'pushups') this.analyzePushups(landmarks);
        else if (this.currentExercise === 'pullups') this.analyzePullups(landmarks);
    }

    analyzePushups(landmarks) {
        const leftShoulder = landmarks[11];
        const rightShoulder = landmarks[12];
        const leftElbow = landmarks[13];
        const rightElbow = landmarks[14];
        const leftWrist = landmarks[15];
        const rightWrist = landmarks[16];

        if (!leftShoulder || !rightShoulder || !leftElbow || !rightElbow || !leftWrist || !rightWrist) {
            this.updateStatus('waiting', 'Asegúrate de que tu cuerpo sea visible.');
            return;
        }

        const leftArmAngle = this.calculateAngle(leftShoulder, leftElbow, leftWrist);
        const rightArmAngle = this.calculateAngle(rightShoulder, rightElbow, rightWrist);
        const avgArmAngle = this.smoothPosition((leftArmAngle + rightArmAngle) / 2, 'armAngle');

        const isDown = avgArmAngle < this.PUSHUP_DOWN_ANGLE;
        const isUp = avgArmAngle > this.PUSHUP_UP_ANGLE;

        this.updateDebugInfo(this.stage, avgArmAngle.toFixed(1), `3D Angles`);
        this.processStageChange(isUp, isDown, 'pushup');
    }

    analyzePullups(landmarks) {
        const leftShoulder = landmarks[11];
        const rightShoulder = landmarks[12];
        const leftElbow = landmarks[13];
        const rightElbow = landmarks[14];
        const leftWrist = landmarks[15];
        const rightWrist = landmarks[16];

        if (!leftShoulder || !rightShoulder || !leftElbow || !rightElbow || !leftWrist || !rightWrist) {
            this.updateStatus('waiting', 'Asegúrate de que tu torso y brazos sean visibles.');
            return;
        }

        const leftElbowAngle = this.calculateAngle(leftShoulder, leftElbow, leftWrist);
        const rightElbowAngle = this.calculateAngle(rightShoulder, rightElbow, rightWrist);
        const avgElbowAngle = this.smoothPosition((leftElbowAngle + rightElbowAngle) / 2, 'elbowAnglePullup');

        const isUp = avgElbowAngle < this.PULLUP_UP_ANGLE;
        const isDown = avgElbowAngle > this.PULLUP_DOWN_ANGLE;

        this.updateDebugInfo(this.stage, avgElbowAngle.toFixed(1), `3D Angles`);
        this.processStageChange(isUp, isDown, 'pullup');
    }

    processStageChange(isUp, isDown, exerciseType) {
        const now = Date.now();
        
        if (now - this.lastStageChange < this.minStageTime) return;

        if (this.stage === 'up' && isDown) {
            this.stage = 'down';
            this.lastStageChange = now;
            const message = exerciseType === 'pullup' ? '⬆️ ¡Sube!' : '⬇️ ¡Baja!';
            this.updateStatus('exercising', message);
        } else if (this.stage === 'down' && isUp) {
            this.stage = 'up';
            this.lastStageChange = now;
            this.completeRep(exerciseType);
        }
    }

    calculateAngle(a, b, c) {
        const pointA = new THREE.Vector3(a.x, a.y, a.z);
        const pointB = new THREE.Vector3(b.x, b.y, b.z);
        const pointC = new THREE.Vector3(c.x, c.y, c.z);

        const vectorBA = pointA.clone().sub(pointB);
        const vectorBC = pointC.clone().sub(pointB);

        const dotProduct = vectorBA.dot(vectorBC);
        const magnitudeBA = vectorBA.length();
        const magnitudeBC = vectorBC.length();

        if (magnitudeBA === 0 || magnitudeBC === 0) return 0;

        let angleRad = Math.acos(dotProduct / (magnitudeBA * magnitudeBC));
        return angleRad * 180.0 / Math.PI;
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

        setTimeout(() => this.updateStatus('ready', '✅ Listo para la siguiente'), 1500);
        this.playSound();
    }

    playSound() {
        if (this.soundEnabled && this.synth) {
            if (Tone.context.state !== 'running') Tone.start();
            this.synth.triggerAttackRelease('C4', '8n');
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
    }

    showCelebration(message) {
        this.celebration.textContent = message;
        this.celebration.style.animation = 'none';
        setTimeout(() => {
            this.celebration.style.animation = 'celebrate 2s ease-out';
        }, 10);
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
                
                this.stage = 'up';
                this.repCount = 0;
                this.repCounter.textContent = 0;
                this.positionHistory = {};
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
            toggleSoundButton.textContent = this.soundEnabled ? '🔊 Sonido ON' : '🔇 Sonido OFF';
            toggleSoundButton.addEventListener('click', () => {
                this.soundEnabled = !this.soundEnabled;
                toggleSoundButton.textContent = this.soundEnabled ? '🔊 Sonido ON' : '🔇 Sonido OFF';
            });
        }

        window.addEventListener('resize', this.handleResize.bind(this));
    }

    startExercise() {
        this.isActive = true;
        this.stage = 'up';
        this.positionHistory = {};
        if (this.mediaPipeCamera) {
            this.mediaPipeCamera.start();
        }
        document.getElementById('startBtn').textContent = '⏹️ Detener Ejercicio';
        this.updateStatus('exercising', '🔥 ¡Ejercitando!');
    }

    stopExercise() {
        this.isActive = false;
        if (this.mediaPipeCamera) {
            this.mediaPipeCamera.stop();
        }
        document.getElementById('startBtn').textContent = '🚀 Comenzar Ejercicio';
        this.updateStatus('ready', '✅ Listo para ejercitar');
        this.stage = 'up';
        this.positionHistory = {};
    }

    async switchCamera() {
        this.currentCameraIndex = (this.currentCameraIndex + 1) % this.availableCameras.length;
        await this.initializeCamera();
    }
}

function toggleDebug() {
    const debugInfo = document.getElementById('debugInfo');
    debugInfo.style.display = debugInfo.style.display === 'none' ? 'block' : 'none';
}

document.addEventListener('DOMContentLoaded', () => {
    new ExerciseApp();
});

document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key === 'd') {
        e.preventDefault();
        toggleDebug();
    }
});