class ExerciseApp {
    constructor() {
        this.pose = null;
        this.camera = null;
        this.isActive = false;
        this.currentExercise = 'pushups';
        this.repCount = 0;
        // 'stage' rastrea el estado del ejercicio (arriba o abajo) para contar una repetición completa.
        this.stage = 'up'; // Puede ser 'up' o 'down'

        this.pushupCount = 0;
        this.pullupCount = 0;
        this.catsCount = 0;
        this.dogsCount = 0;
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
        this.pushupTotalCounter = document.getElementById('pushupTotal');
        this.pullupTotalCounter = document.getElementById('pullupTotal');
        this.currentExerciseSpan = document.getElementById('currentExercise');
        this.petMessage = document.getElementById('petMessage');
        this.celebration = document.getElementById('celebration');
        this.petEmoji = document.getElementById('petEmoji');

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
            minDetectionConfidence: 0.5,
            minTrackingConfidence: 0.5
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
                    facingMode: 'user'
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
        this.canvasCtx.save();
        this.canvasCtx.clearRect(0, 0, this.canvasElement.width, this.canvasElement.height);

        if (results.poseLandmarks) {
            drawConnectors(this.canvasCtx, results.poseLandmarks, POSE_CONNECTIONS, { color: '#00FF00', lineWidth: 2 });
            drawLandmarks(this.canvasCtx, results.poseLandmarks, { color: '#FF0000', lineWidth: 1, radius: 3 });
            this.analyzeExercise(results.poseLandmarks);
        }

        this.canvasCtx.restore();
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

        // Se calcula la posición vertical (coordenada 'y') promedio de hombros y codos.
        // En MediaPipe, un valor 'y' más bajo significa que está más arriba en la pantalla.
        const shoulderAvgY = (leftShoulder.y + rightShoulder.y) / 2;
        const elbowAvgY = (leftElbow.y + rightElbow.y) / 2;

        // --- Lógica de Detección Multi-ángulo ---
        // En lugar de usar ángulos (que cambian con la perspectiva), comparamos la altura relativa.
        // Esto funciona sin importar si la cámara está de frente o de lado.

        // Condición de bajada: los hombros están al mismo nivel o por debajo de los codos.
        const isDown = shoulderAvgY >= elbowAvgY * 0.98; // El 0.98 da un pequeño margen.
        // Condición de subida: los hombros están notablemente por encima de los codos (brazos estirados).
        const isUp = shoulderAvgY < elbowAvgY * 0.85;

        // --- Máquina de Estados para Contar Repeticiones ---
        // Esto asegura que solo contamos una repetición completa (bajar y luego subir).
        
        // Si estábamos arriba (up) y ahora estamos abajo (isDown), cambiamos el estado a 'down'.
        if (this.stage === 'up' && isDown) {
            this.stage = 'down';
            this.updateStatus('exercising', '⬇️ ¡Baja!');
        } 
        // Si estábamos abajo (down) y ahora estamos arriba (isUp), significa que se completó una repetición.
        else if (this.stage === 'down' && isUp) {
            this.stage = 'up';
            this.completeRep('pushup');
        }
    }

    analyzePullups(landmarks) {
        const nose = landmarks[0];
        const leftShoulder = landmarks[11];
        const rightShoulder = landmarks[12];
        const leftWrist = landmarks[15];
        const rightWrist = landmarks[16];
        const leftElbow = landmarks[13];
        const rightElbow = landmarks[14];

        if (!nose || !leftShoulder || !rightShoulder || !leftWrist || !rightWrist || !leftElbow || !rightElbow) {
            this.updateStatus('waiting', 'Asegúrate de que tu torso y cara sean visibles.');
            return;
        }

        const wristAvgY = (leftWrist.y + rightWrist.y) / 2;
        const shoulderAvgY = (leftShoulder.y + rightShoulder.y) / 2;

        // Se valida que las manos estén por encima de los hombros, como en una barra.
        if (wristAvgY > shoulderAvgY) {
            this.updateStatus('waiting', '🙌 Agarra la barra (manos arriba).');
            return;
        }

        // --- Lógica de Detección Multi-ángulo ---

        // Condición de subida: la nariz está por encima de las muñecas. Es el punto más alto de la dominada.
        const isUp = nose.y <= wristAvgY;
        
        // Condición de bajada: los brazos están casi rectos. Usamos el ángulo para esto.
        const leftElbowAngle = this.calculateAngle(leftShoulder, leftElbow, leftWrist);
        const rightElbowAngle = this.calculateAngle(rightShoulder, rightElbow, rightWrist);
        const avgElbowAngle = (leftElbowAngle + rightElbowAngle) / 2;
        const isDown = avgElbowAngle > 150; // 150 grados indica brazos casi extendidos.

        // --- Máquina de Estados para Contar Repeticiones ---

        // Si estábamos arriba (up) y ahora estamos abajo (isDown), cambiamos el estado a 'down'.
        if (this.stage === 'up' && isDown) { 
            this.stage = 'down';
            this.updateStatus('exercising', '⬇️ ¡Baja por completo!');
        } 
        // Si estábamos abajo (down) y ahora estamos arriba (isUp), se completó la repetición.
        else if (this.stage === 'down' && isUp) { 
            this.stage = 'up';
            this.completeRep('pullup');
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
        if (exerciseType === 'pushup') {
            this.pushupCount++;
            this.pushupTotalCounter.textContent = this.pushupCount;
            this.savePet('cat');
        } else if (exerciseType === 'pullup') {
            this.pullupCount++;
            this.pullupTotalCounter.textContent = this.pullupCount;
            this.savePet('dog');
        }

        this.updateStatus('ready', '✅ ¡Repetición completada!');
        this.updateCurrentPet();
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
        this.repCounter.textContent = 0;
    }

    showCelebration(message) {
        this.celebration.textContent = message;
        this.celebration.style.animation = 'none';
        setTimeout(() => {
            this.celebration.style.animation = 'celebrate 2s ease-out';
        }, 10);
    }

    createParticleEffect() {
        for (let i = 0; i < 10; i++) {
            const particle = document.createElement('div');
            particle.style.cssText = `
                position: fixed;
                width: 10px;
                height: 10px;
                background: ${['#ff6b6b', '#ffd700', '#00b894', '#74b9ff'][Math.floor(Math.random() * 4)]};
                border-radius: 50%;
                pointer-events: none;
                z-index: 999;
                left: ${Math.random() * window.innerWidth}px;
                top: ${Math.random() * window.innerHeight}px;
                animation: particle-fall 3s ease-out forwards;
            `;
            document.body.appendChild(particle);
            setTimeout(() => particle.remove(), 3000);
        }
    }

    updateStatus(type, message) {
        this.statusIndicator.className = `status-indicator status-${type}`;
        this.statusIndicator.textContent = message;
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
        this.stage = 'up'; // Reset stage on start
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
    }
}


const style = document.createElement('style');
style.textContent = `
    @keyframes particle-fall {
        to {
            transform: translateY(100vh) rotate(360deg);
            opacity: 0;
        }
    }
`;
document.head.appendChild(style);

document.addEventListener('DOMContentLoaded', () => {
    new ExerciseApp();
});