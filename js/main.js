// ========================================
// CONFIGURACIÓN SUPABASE
// ========================================
const SUPABASE_URL = 'https://kkmppwpubwsknqumjblw.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtrbXBwd3B1Yndza25xdW1qYmx3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUwNDcwMDIsImV4cCI6MjA4MDYyMzAwMn0.4CtdZFN9TjU6jyMszl_V6fC4wiqlbaH0yYyrm9Tui2E';

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ========================================
// NAVEGACIÓN MÓVIL
// ========================================
const hamburger = document.getElementById('hamburger');
const navMenu = document.getElementById('navMenu');

if (hamburger) {
    hamburger.addEventListener('click', () => {
        navMenu.classList.toggle('active');
        hamburger.classList.toggle('active');
    });
}

document.querySelectorAll('.nav-menu a').forEach(link => {
    link.addEventListener('click', () => {
        navMenu.classList.remove('active');
        hamburger.classList.remove('active');
    });
});

// ========================================
// SCROLL SUAVE + NAVBAR SCROLL
// ========================================
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        const href = this.getAttribute('href');
        if (href === '#' || href === '#!') return;
        const target = document.querySelector(href);
        if (!target) return;
        e.preventDefault();
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
});

let lastScroll = 0;
const navbar = document.querySelector('.navbar');
if (navbar) {
    window.addEventListener('scroll', () => {
        const currentScroll = window.pageYOffset;
        if (currentScroll > 100) {
            navbar.style.background = 'rgba(10, 22, 40, 0.98)';
            navbar.style.boxShadow = '0 2px 20px rgba(0, 0, 0, 0.3)';
        } else {
            navbar.style.background = 'rgba(10, 22, 40, 0.95)';
            navbar.style.boxShadow = 'none';
        }
        lastScroll = currentScroll;
    });
}

// ========================================
// REGISTRO DE EMPRESA (Auth + DB)
// ========================================
const registroForm = document.getElementById('registroForm');
if (registroForm) {
    registroForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const submitBtn = registroForm.querySelector('button[type="submit"]');
        const originalText = submitBtn.textContent;
        submitBtn.textContent = 'Registrando...';
        submitBtn.disabled = true;
        
        try {
            const formData = new FormData(registroForm);
            const email = formData.get('email').trim();
            const password = formData.get('password');

            // 1. Crear usuario en Auth
            const { data: authData, error: authError } = await supabase.auth.signUp({
                email,
                password,
                options: {
                    data: { role: 'empresa' },
                    emailRedirectTo: window.location.origin + '/empresa-panel.html'
                }
            });

            if (authError) throw authError;

            // 2. Guardar datos en tabla empresas
            const empresaData = {
                user_id: authData.user.id,
                nombre_empresa: formData.get('nombreEmpresa'),
                cif: formData.get('cif'),
                industria: formData.get('industria'),
                tamano: formData.get('tamano'),
                nombre_contacto: formData.get('nombreContacto'),
                cargo_contacto: formData.get('cargoContacto'),
                email,
                telefono: formData.get('telefono'),
                sitio_web: formData.get('sitioWeb') || null,
                necesidades: formData.get('necesidades'),
                presupuesto: formData.get('presupuesto'),
                aprobado: false
            };

            const { error: dbError } = await supabase
                .from('empresas')
                .insert([empresaData]);

            if (dbError) throw dbError;

            showNotification('¡Solicitud enviada! Revisa tu email para confirmar.', 'success');
            registroForm.reset();
            setTimeout(() => window.location.href = 'index.html', 3000);

        } catch (error) {
            console.error('Error registro:', error);
            showNotification('Error: ' + error.message, 'error');
        } finally {
            submitBtn.textContent = originalText;
            submitBtn.disabled = false;
        }
    });
}

// ========================================
// LOGIN (Supabase Auth)
// ========================================
const loginForm = document.getElementById('loginForm');
if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const submitBtn = loginForm.querySelector('button[type="submit"]');
        const originalText = submitBtn.textContent;
        submitBtn.textContent = 'Iniciando sesión...';
        submitBtn.disabled = true;

        try {
            const email = document.getElementById('email').value.trim();
            const password = document.getElementById('password').value;

            const { data, error } = await supabase.auth.signInWithPassword({ email, password });
            if (error) throw error;

            // Guardar sesión
            localStorage.setItem('userSession', JSON.stringify(data.session));

            // Admin directo
            if (email === 'jrollon@gmail.com' || data.user?.user_metadata?.role === 'admin') {
                window.location.href = 'admin-dashboard.html';
            } else {
                // Verificar si está aprobado
                const { data: empresa } = await supabase
                    .from('empresas')
                    .select('aprobado')
                    .eq('email', email)
                    .single();

                if (empresa && !empresa.aprobado) {
                    throw new Error('Tu cuenta aún no ha sido aprobada.');
                }

                window.location.href = 'empresa-panel.html';
            }

        } catch (error) {
            showNotification('Error: ' + error.message, 'error');
        } finally {
            submitBtn.textContent = originalText;
            submitBtn.disabled = false;
        }
    });
}

// ========================================
// PROTECCIÓN DE RUTAS
// ========================================
document.addEventListener('DOMContentLoaded', async () => {
    const protectedPages = ['empresa-panel.html', 'admin-dashboard.html'];
    const currentPage = window.location.pathname.split('/').pop();

    if (protectedPages.includes(currentPage)) {
        const session = localStorage.getItem('userSession');
        if (!session) {
            window.location.href = 'login.html';
            return;
        }

        try {
            const parsed = JSON.parse(session);
            const { data: { user } } = await supabase.auth.getUser(parsed.access_token);
            if (!user) throw new Error('Sesión inválida');
        } catch {
            localStorage.removeItem('userSession');
            window.location.href = 'login.html';
        }
    }
});

// ========================================
// LOGOUT
// ========================================
async function logout() {
    if (confirm('¿Cerrar sesión?')) {
        await supabase.auth.signOut();
        localStorage.removeItem('userSession');
        window.location.href = 'index.html';
    }
}

// ========================================
// RESTO DE TU CÓDIGO ORIGINAL (notificaciones, FAQ, etc.)
// ========================================
function showNotification(message, type = 'info') {
    const existing = document.querySelector('.notification');
    if (existing) existing.remove();
    
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.textContent = message;
    document.body.appendChild(notification);
    
    setTimeout(() => notification.classList.add('show'), 10);
    setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => notification.remove(), 300);
    }, 4000);
}

// FAQ Accordion, animaciones, contacto simulado, etc. (todo lo que ya tenías)
document.querySelectorAll('.faq-item').forEach(item => {
    const question = item.querySelector('.faq-question');
    if (question) {
        question.addEventListener('click', () => {
            const isActive = item.classList.contains('active');
            document.querySelectorAll('.faq-item').forEach(i => i.classList.remove('active'));
            if (!isActive) item.classList.add('active');
        });
    }
});

console.log('Big Agents Studio - Sistema inicializado con Supabase Auth');