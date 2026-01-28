import React, { useRef, useEffect } from 'react';

const ParticleNetwork = ({
    particleCount = 120,
    connectionDistance = 200,
    particleColor = 'rgba(255, 255, 255, 0.8)',
    lineColor = '255, 255, 255',
    lineWidth = 1.5,
    particleSpeedRange = 0.5,
    particleSizeRange = [2, 3],
}) => {
    const canvasRef = useRef(null);
    const animationRef = useRef(null);
    const particlesRef = useRef([]);
    const mouseRef = useRef({ x: null, y: null });

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        let width = 0;
        let height = 0;

        // Initialize canvas size
        const resizeCanvas = () => {
            const parent = canvas.parentElement;
            width = parent.clientWidth;
            height = parent.clientHeight;
            canvas.width = width;
            canvas.height = height;

            // Reinitialize particles if canvas size changed significantly
            if (particlesRef.current.length === 0) {
                initParticles();
            }
        };

        // Create particles with random positions and velocities
        const initParticles = () => {
            particlesRef.current = [];
            for (let i = 0; i < particleCount; i++) {
                particlesRef.current.push({
                    x: Math.random() * width,
                    y: Math.random() * height,
                    vx: (Math.random() - 0.5) * particleSpeedRange * 2,
                    vy: (Math.random() - 0.5) * particleSpeedRange * 2,
                    size: Math.random() * (particleSizeRange[1] - particleSizeRange[0]) + particleSizeRange[0],
                });
            }
        };

        // Update particle positions and handle wall bouncing
        const updateParticles = () => {
            particlesRef.current.forEach(particle => {
                // Move particle
                particle.x += particle.vx;
                particle.y += particle.vy;

                // Bounce off walls
                if (particle.x < 0 || particle.x > width) {
                    particle.vx *= -1;
                    particle.x = Math.max(0, Math.min(width, particle.x));
                }
                if (particle.y < 0 || particle.y > height) {
                    particle.vy *= -1;
                    particle.y = Math.max(0, Math.min(height, particle.y));
                }
            });
        };

        // Draw all particles as circles
        const drawParticles = () => {
            ctx.fillStyle = particleColor;
            particlesRef.current.forEach(particle => {
                ctx.beginPath();
                ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
                ctx.fill();
            });
        };

        // Draw lines from mouse to nearby particles
        const drawConnections = () => {
            const mouse = mouseRef.current;
            if (mouse.x === null || mouse.y === null) return;

            particlesRef.current.forEach(particle => {
                const dx = mouse.x - particle.x;
                const dy = mouse.y - particle.y;
                const distance = Math.hypot(dx, dy);

                if (distance < connectionDistance) {
                    // Calculate opacity based on distance (closer = more opaque)
                    const alpha = 1 - (distance / connectionDistance);

                    ctx.beginPath();
                    ctx.moveTo(mouse.x, mouse.y);
                    ctx.lineTo(particle.x, particle.y);
                    ctx.strokeStyle = `rgba(${lineColor}, ${alpha})`;
                    ctx.lineWidth = lineWidth;
                    ctx.stroke();
                }
            });
        };

        // Animation loop
        const animate = () => {
            // Clear canvas
            ctx.clearRect(0, 0, width, height);

            // Update and draw
            updateParticles();
            drawConnections();
            drawParticles();

            // Continue animation
            animationRef.current = requestAnimationFrame(animate);
        };

        // Mouse event handlers - use document level since canvas has pointer-events: none
        const handleMouseMove = (e) => {
            const rect = canvas.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;

            // Only update if mouse is within canvas bounds
            if (x >= 0 && x <= width && y >= 0 && y <= height) {
                mouseRef.current = { x, y };
            } else {
                mouseRef.current = { x: null, y: null };
            }
        };

        // Initialize
        resizeCanvas();
        animate();

        // Event listeners - attach to document to capture mouse even with pointer-events: none
        window.addEventListener('resize', resizeCanvas);
        document.addEventListener('mousemove', handleMouseMove);

        // Cleanup
        return () => {
            if (animationRef.current) {
                cancelAnimationFrame(animationRef.current);
            }
            window.removeEventListener('resize', resizeCanvas);
            document.removeEventListener('mousemove', handleMouseMove);
        };
    }, [particleCount, connectionDistance, particleColor, lineColor, lineWidth, particleSpeedRange, particleSizeRange]);

    return (
        <canvas
            ref={canvasRef}
            style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                zIndex: 0,
                pointerEvents: 'none',
            }}
        />
    );
};

export default ParticleNetwork;
