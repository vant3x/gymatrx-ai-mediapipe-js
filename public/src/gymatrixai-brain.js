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
        
        // Smoothing para reducir jitter
        this.positionHistory = [];
        this.historySize = 5;
        
        this.initializeElements();
        this.initializeMediaPipe();
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

    async initializeCamera() {
        try {
            const constraints = {
                video: {
                    width: window.innerWidth <= 768 ? { ideal: 480 } : { ideal: 740 },
                    height: window.innerWidth <= 768 ? { ideal: 360 } : { ideal: 480 },
                    facingMode: 'user',
                    frameRate: { ideal: 30, max: 30 } // Limitar FPS para mejor rendimiento
                }
            };

            const stream = await navigator.mediaDevices.getUserMedia(constraints);
            this.videoElement.srcObject = stream;

            this.videoElement.addEventListener('loadedmetadata', () => {
                this.canvasElement.width = this.videoElement.videoWidth;
                this.canvasElement.height = this.videoElement.videoHeight;
                this.updateStatus('ready', '✅ Listo para ejercitar');
            });

            this.camera = new Camera(this.videoElement, {
                onFrame: async () => {
                    if (this.isActive) {
                        await this.pose.send({ image: this.videoElement });
                    }
                },
                width: window.innerWidth <= 768 ? 480 : 740,
                height: window.innerWidth <= 768 ? 360 : 480
            });

        } catch (error) {
            console.error('Error accessing camera:', error);
            this.updateStatus('error', '❌ Error accediendo a la cámara');
        }
    }

    onResults(results) {
        // Optimizar el rendering
        this.canvasCtx.save();
        this.canvasCtx.clearRect(0, 0, this.canvasElement.width, this.canvasElement.height);

        if (results.poseLandmarks) {
            // Dibujar con menos detalle para mejor performance
            drawConnectors(this.canvasCtx, results.poseLandmarks, POSE_CONNECTIONS, 
                { color: '#00FF00', lineWidth: 2 });
            drawLandmarks(this.canvasCtx, results.poseLandmarks, 
                { color: '#FF0000', lineWidth: 1, radius: 2 });
            
            this.analyzeExercise(results.poseLandmarks);
        }

        this.canvasCtx.restore();
    }

    // Función para suavizar posiciones y reducir jitter
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

        // Suavizar posiciones
        const shoulderAvgY = this.smoothPosition((leftShoulder.y + rightShoulder.y) / 2, 'shoulderY');
        const elbowAvgY = this.smoothPosition((leftElbow.y + rightElbow.y) / 2, 'elbowY');

        // Calcular ángulo del brazo para mejor detección
        const leftArmAngle = this.calculateAngle(leftShoulder, leftElbow, landmarks[15]);
        const rightArmAngle = this.calculateAngle(rightShoulder, rightElbow, landmarks[16]);
        const avgArmAngle = this.smoothPosition((leftArmAngle + rightArmAngle) / 2, 'armAngle');

        // Lógica mejorada con ángulos y posición
        const isDown = avgArmAngle < this.PUSHUP_DOWN_ANGLE && shoulderAvgY >= elbowAvgY * this.PUSHUP_SHOULDER_ELBOW_RATIO_DOWN;
        const isUp = avgArmAngle > this.PUSHUP_UP_ANGLE && shoulderAvgY < elbowAvgY * this.PUSHUP_SHOULDER_ELBOW_RATIO_UP;

        // Debug info
        this.updateDebugInfo(this.stage, avgArmAngle.toFixed(1), `S:${shoulderAvgY.toFixed(3)} E:${elbowAvgY.toFixed(3)}`);

        this.processStageChange(isUp, isDown, 'pushup');
    }

    analyzePullups(landmarks) {
        const leftShoulder = landmarks[11];
        const rightShoulder = landmarks[12];
        const leftWrist = landmarks[15];
        const rightWrist = landmarks[16];

        if (!leftShoulder || !rightShoulder || !leftWrist || !rightWrist) {
            this.updateStatus('waiting', 'Asegúrate de que tu torso y brazos sean visibles.');
            return;
        }

        const shoulderAvgY = (leftShoulder.y + rightShoulder.y) / 2;
        const wristAvgY = (leftWrist.y + rightWrist.y) / 2;

        // Validar que las manos estén por encima de los hombros (agarrando la barra).
        if (wristAvgY > shoulderAvgY) {
            this.updateStatus('waiting', '🙌 Agarra la barra (manos arriba).');
            return;
        }

        // --- Lógica de Detección Multi-ángulo por Distancia Vertical ---
        // Se calcula la diferencia de altura normalizada entre hombros y muñecas.
        const heightDiff = Math.abs(shoulderAvgY - wristAvgY);

        // Condición de subida: La distancia vertical entre hombros y muñecas es pequeña.
        const isUp = heightDiff < this.PULLUP_HEIGHT_DIFF_UP;

        // Condición de bajada: La distancia vertical es grande (brazos extendidos).
        const isDown = heightDiff > this.PULLUP_HEIGHT_DIFF_DOWN;

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
        const radians = Math.atan2(c.y - b.y, c.x - b.x) - Math.atan2(a.y - b.y, a.x - b.x);
        let angle = Math.abs(radians * 180.0 / Math.PI);
        if (angle > 180.0) {
            angle = 360 - angle;
        }
        return angle;
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