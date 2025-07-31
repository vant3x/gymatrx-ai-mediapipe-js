class ExerciseApp {
    constructor() {
        this.pose = null;
        this.camera = null;
        this.isActive = false;
        this.currentExercise = 'pushups';
        this.repCount = 0;
        this.petsCounter = 0;
        this.isInPosition = false;
        this.lastPosition = null;
        
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
            

         /*   this.petMessage.textContent = `¡Ayúdame a salvar este gatito con flexiones! (${5 - (this.pushupCount % 5)} restantes)`;*/
        } else {
            this.petEmoji.textContent = '🐶';
            this.petMessage.textContent = '¡Cada dominada salva un perrito!';
        }
    }

    async initializeMediaPipe() {
        this.pose = new Pose({
            locateFile: (file) => {
                return `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`;
            }
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
            // Dibujar pose
            drawConnectors(this.canvasCtx, results.poseLandmarks, POSE_CONNECTIONS, {color: '#00FF00', lineWidth: 2});
            drawLandmarks(this.canvasCtx, results.poseLandmarks, {color: '#FF0000', lineWidth: 1, radius: 3});
         
            // Analizar ejercicio
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
        // Puntos clave: hombros (11,12), codos (13,14), muñecas (15,16), caderas (23,24)
        const leftShoulder = landmarks[11];
        const rightShoulder = landmarks[12];
        const leftElbow = landmarks[13];
        const rightElbow = landmarks[14];
        const leftWrist = landmarks[15];
        const rightWrist = landmarks[16];
        const leftHip = landmarks[23];
        const rightHip = landmarks[24];

        if (!leftShoulder || !rightShoulder || !leftElbow || !rightElbow || 
            !leftWrist || !rightWrist || !leftHip || !rightHip) return;

        // Verificar posición horizontal (cuerpo paralelo al suelo)
        const avgShoulderY = (leftShoulder.y + rightShoulder.y) / 2;
        const avgHipY = (leftHip.y + rightHip.y) / 2;
        const bodyAngle = Math.abs(avgShoulderY - avgHipY);
        
        if (bodyAngle > 0.15) {
            this.updateStatus('waiting', '🔄 Ponte en posición de plancha');
            return;
        }

        // Calcular ángulo del codo
        const leftElbowAngle = this.calculateAngle(leftShoulder, leftElbow, leftWrist);
        const rightElbowAngle = this.calculateAngle(rightShoulder, rightElbow, rightWrist);
        const avgElbowAngle = (leftElbowAngle + rightElbowAngle) / 2;

        // Verificar que ambos brazos estén sincronizados
        const elbowDifference = Math.abs(leftElbowAngle - rightElbowAngle);
        if (elbowDifference > 30) {
            this.updateStatus('waiting', '⚖️ Mantén ambos brazos sincronizados');
            return;
        }

        // Verificar que las manos estén en el suelomás abajo que los hombros
        const avgWristY = (leftWrist.y + rightWrist.y) / 2;
        if (avgWristY < avgShoulderY) {
            this.updateStatus('waiting', '👐 Coloca las manos en el suelo');
            return;
        }

        // Detectar flexión (más estricto)
        if (avgElbowAngle < 70 && !this.isInPosition) {
            this.isInPosition = true;
            this.updateStatus('exercising', '⬇️ Bajando... ¡Bien!');
        } else if (avgElbowAngle > 150 && this.isInPosition) {
            this.isInPosition = false;
            this.completeRep('pushup');
        }
    }

    analyzePullups(landmarks) {
        // Puntos clave: hombros (11,12), muñecas (15,16), codos (13,14)
        const leftShoulder = landmarks[11];
        const rightShoulder = landmarks[12];
        const leftWrist = landmarks[15];
        const rightWrist = landmarks[16];
        const leftElbow = landmarks[13];
        const rightElbow = landmarks[14];

        if (!leftShoulder || !rightShoulder || !leftWrist || !rightWrist || 
            !leftElbow || !rightElbow) return;

        // Verificar que las manos estén arriba (por encima de los hombros)
        const avgShoulderY = (leftShoulder.y + rightShoulder.y) / 2;
        const avgWristY = (leftWrist.y + rightWrist.y) / 2;
        
        if (avgWristY > avgShoulderY - 0.1) {
            this.updateStatus('waiting', '🙌 Agarra la barra (manos arriba)');
            return;
        }

        // Calcular la diferencia de altura (más preciso)
        const heightDiff = avgShoulderY - avgWristY;
        
        // Verificar que ambos brazos estén sincronizados
        const wristDifference = Math.abs(leftWrist.y - rightWrist.y);
        if (wristDifference > 0.1) {
            this.updateStatus('waiting', '⚖️ Mantén ambas manos al mismo nivel');
            return;
        }

        // Calcular ángulo de los codos para más precisión
        const leftElbowAngle = this.calculateAngle(leftShoulder, leftElbow, leftWrist);
        const rightElbowAngle = this.calculateAngle(rightShoulder, rightElbow, rightWrist);
        const avgElbowAngle = (leftElbowAngle + rightElbowAngle) / 2;

        // Detectar dominada completa (más estricto)
        if (heightDiff < 0.15 && avgElbowAngle < 100 && !this.isInPosition) {
            this.isInPosition = true;
            this.updateStatus('exercising', '⬆️ Subiendo... ¡Fuerza!');
        } else if (heightDiff > 0.25 && avgElbowAngle > 140 && this.isInPosition) {
            this.isInPosition = false;
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
        
        // Mostrar celebración
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
        
        // Actualizar mascota actual
        this.updateCurrentPet();
        
        // Efecto de partículas
        this.createParticleEffect();
        
        // Reset contador de repeticiones actuales
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
        
        
        this.isInPosition = false;
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