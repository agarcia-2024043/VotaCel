# Votación en tiempo real — Elección de directivas

Aplicación web accesible para votación en tiempo real en elecciones de directivas de iglesia (HTML + CSS + JS con módulos ES, sin frameworks ni build).
Backend: **Firebase Firestore (plan gratuito Spark) + Firebase Auth**. Alojamiento: **GitHub Pages**.

| Página | Para quién |
|---|---|
| `index.html` | Votantes (celular / móvil, acceso directo tipo formulario sin claves) |
| `admin.html` | Administrador (control de rondas, resultados en vivo, quién ha votado, padrón, auditoría) |
| `pantalla.html` | Modo proyector, solo lectura (requiere sesión de admin activa en el navegador) |

---

## 1. Novedades y modelo de acceso (Tipo Formulario sin claves)

- **Sin códigos de acceso**: Los votantes no necesitan escribir ningún código complejo. Al abrir el enlace ingresan automáticamente vía `signInAnonymously()`.
- **Identificación por nombre**: La primera vez que entra, la persona indica su nombre completo (nombre y apellido). Se almacena en su dispositivo y se reutiliza para todas las rondas. Dispone de un enlace "(No soy yo)" para corregirlo si aún no ha votado en la ronda activa.
- **Doble validación atómica por ronda**:
  1. **Por dispositivo (`uid` anónimo)**: Nadie puede votar dos veces desde el mismo teléfono.
  2. **Por nombre (`nameKey`)**: La clave `nameKey` se calcula en minúsculas, sin tildes ni caracteres especiales (`maria_del_carmen_lopez`). Nadie puede votar dos veces con el mismo nombre aunque use otro celular, modo incógnito o borre sus cookies.
  3. Ambos documentos (`rounds/{roundId}/votes/{nameKey}` y `rounds/{roundId}/devices/{uid}`) se crean en **un solo `writeBatch` atómico** y las reglas de seguridad de Firestore los validan mutuamente mediante `existsAfter()` y `getAfter()`.
- **Padrón electoral opcional**: El administrador puede importar una lista de nombres autorizados (JSON, CSV o lista de texto) y activar el toggle `Exigir padrón electoral`. Con el padrón activo, los votantes buscan y seleccionan su nombre y las reglas de Firebase rechazan cualquier voto fuera de él.
- **Monitoreo en vivo ("Quién ha votado")**: El panel de administración muestra el nombre, hora y candidato de cada voto emitido en la ronda, permitiendo a los administradores habilitar nuevamente a una persona si cometió un error o requirió asistencia.

---

## 2. Configurar Firebase paso a paso

### 2.1 Crear el proyecto
1. Entra a <https://console.firebase.google.com> → **Agregar proyecto** → ponle nombre (ej. `votacion-iglesia`).
2. Desactiva Google Analytics (no se usa).
3. Selecciona el plan **Spark** (gratuito).

### 2.2 Registrar la app web
1. En el panel del proyecto → icono **`</>`** (Web) → registra la app (sin Firebase Hosting).
2. Copia el objeto `firebaseConfig` y pégalo en [`js/firebase-config.js`](js/firebase-config.js), reemplazando los placeholders `TU_...`.

### 2.3 Activar Firestore en modo producción
1. **Compilación → Firestore Database → Crear base de datos**.
2. Ubicación más cercana (ej. `us-central` o `southamerica-east1`).
3. Elige **Modo de producción** (las reglas protegerán toda la información).

### 2.4 Activar Authentication
1. **Compilación → Authentication → Comenzar**.
2. **Método de acceso**: Activa **Anónimo** y **Correo electrónico/contraseña** (sin "vínculo de correo").
3. **Configuración → Acciones de usuario**: **Desactiva** "Habilitar creación (registro) de usuarios". Esto previene que terceros registren cuentas administrativas.

### 2.5 Crear el usuario administrador y su documento
1. **Authentication → Usuarios → Agregar usuario**: Ingresa el correo y una contraseña segura para el admin.
2. Copia el **UID** asignado a ese usuario.
3. **Firestore → Iniciar colección** `admins` → ID del documento = **el UID copiado** → campo `email` (string) = el correo del admin.
   *(Por reglas de seguridad, la colección `admins` solo se puede crear y editar directamente desde la consola).*

### 2.6 Desplegar las reglas de seguridad
```bash
npx firebase login
npx firebase use --add            # selecciona tu proyecto
npx firebase deploy --only firestore:rules
```
Verifica en **Firestore → Reglas** que coincidan con [`firestore.rules`](firestore.rules).

### 2.7 Restringir la API key (Google Cloud Console)
1. <https://console.cloud.google.com/apis/credentials> → selecciona tu proyecto.
2. Abre la clave de API del navegador (**Browser key**).
3. **Restricciones de aplicaciones → Sitios web (referrers HTTP)** y autoriza únicamente:
   - `https://TU_USUARIO.github.io/*`
   - `https://tu-dominio.org/*` (si tienes dominio propio)
   - `http://localhost:*/*` (solo mientras pruebas localmente)
4. **Restricciones de API**: Restringe la clave para usar exclusivamente: *Identity Toolkit API*, *Token Service API* y *Cloud Firestore API*.

### 2.8 Dominios autorizados en Auth
En Firebase Console → **Authentication → Configuración → Dominios autorizados**: Mantén solo tu dominio de GitHub Pages (`TU_USUARIO.github.io`) y tu dominio propio.

### 2.9 ⚠️ Límite de Auth: 100 cuentas nuevas por hora por IP (Fundamental para el evento)
Dado que los asistentes se conectarán al WiFi común de la iglesia (misma IP pública), Firebase Auth limita la creación de cuentas anónimas a **100 cuentas por hora por IP**.

**Pasos para programar el aumento temporal de cuota antes de cada jornada:**
1. Ve a Firebase Console → **Authentication** → pestaña **Usage (Uso)** / **Configuración** y busca la opción de **Límites de registro (Sign-up quota)**.
2. Selecciona **Programar aumento temporal (*Schedule temporary increase*)** para el día y horario del evento (ej. elevar a 500 o 1000 por hora).
3. Realiza esta solicitud con días de anticipación para cada una de las jornadas de elección.
4. **Protección integrada en la app**: Si un dispositivo experimenta `auth/too-many-requests`, la aplicación muestra un aviso amable (*"Hay mucha gente entrando, reintentando…"*) y efectúa reintentos automáticos con espera exponencial progresiva. Además, una vez autenticado, el dispositivo conserva su sesión en el almacenamiento local y no vuelve a consumir cuota de creación.

---

## 3. Pruebas y verificación local

El proyecto cuenta con suite de pruebas automatizadas:
```bash
npm install
npm test              # Ejecuta pruebas de lógica pura
npm run test:emu      # Ejecuta el emulador de Firestore, las reglas completas y la simulación de 120 votantes
```

Para probar la interfaz con el emulador local:
1. Inicia los emuladores: `npx firebase emulators:start --only firestore,auth --project demo-votacion`
2. En otra terminal: `npm start`
3. Abre `http://localhost:3000/index.html?emu=1` y `http://localhost:3000/admin.html?emu=1`.

---

## 4. Publicación en GitHub Pages

1. Sube el repositorio a GitHub:
   ```bash
   git init
   git add .
   git commit -m "Votación directivas lista para producción"
   git branch -M main
   git remote add origin https://github.com/TU_USUARIO/TU_REPO.git
   git push -u origin main
   ```
2. En el repositorio de GitHub: **Settings → Pages → Source → GitHub Actions**.
3. El workflow en [`.github/workflows/static.yml`](.github/workflows/static.yml) se ejecutará automáticamente y publicará el sitio en `https://TU_USUARIO.github.io/TU_REPO/`.

---

## 5. Estimación de consumo vs. límites del plan gratuito (Spark)

Límites diarios del plan gratuito de Firestore:
- **Lecturas**: 50 000 por día.
- **Escrituras**: 20 000 por día.

### Escenario de uso real (120 votantes, 2 directivas, 12 rondas):
- **Lecturas por votante durante todo el evento**:
  - `config/state` (escucha en tiempo real durante la sesión): ~14 lecturas.
  - Ronda activa (`rounds/{roundId}`): ~48 lecturas.
  - Candidatos y directivas (descargados una sola vez por directiva): ~62 lecturas.
  - Verificación de voto al inicio de cada ronda (`devices/{uid}`): ~12 lecturas.
  - Evaluación de reglas de seguridad en Firestore (2-3 lecturas internas por voto): ~30 lecturas.
  - **Subtotal por votante**: ~166 lecturas.
  - **120 votantes**: 120 × 166 ≈ **19 920 lecturas**.
- **Admin y pantalla de proyección**:
  - Escucha de votos y candidatos en tiempo real + cierres de servidor: ~**4 200 lecturas**.
- **Total diario estimado de lecturas**: **~24 120 lecturas** (equivalente al **48%** de la cuota diaria gratuita; margen disponible de más del doble).
- **Total diario estimado de escrituras**:
  - 120 votantes × 12 rondas × 2 documentos (`votes` + `devices`) = 2 880 escrituras.
  - Operaciones de administración y bitácora: ~200 escrituras.
  - **Total escrituras**: **~3 080 escrituras** (apenas el **15.4%** de la cuota de 20 000).

---

## 6. Operación durante el evento

### Gestión de Rondas
1. **Activar directiva**: En `admin.html`, selecciona la directiva a elegir y pulsa **Activar / cambiar de directiva**.
2. **Abrir ronda**: Al pulsar **Abrir ronda**, el sistema calcula automáticamente los candidatos disponibles (aquellos con `elected = false`).
3. **Cerrar ronda**: Al cerrar la votación, Firestore ejecuta los pasos en orden estricto:
   - Marca `status = 'closed'` (bloqueo instantáneo por reglas).
   - Lee todos los votos directamente del servidor.
   - Computa resultados y escribe `tallies`, `rounds.winnerId` y actualiza el candidato como electo en un batch único.
4. **Empates**:
   - **Segunda vuelta**: Crea automáticamente una ronda del mismo cargo con únicamente los candidatos empatados.
   - **Desempate manual**: Permite al administrador seleccionar al ganador indicando el motivo justificado (registrado en auditoría).
5. **Reabrir cargo / Repetir ronda**:
   - **Repetir ronda**: Anula todos los votos emitidos en la ronda activa y la reabre limpia.
   - **Reabrir cargo**: Si ya se había cerrado y declarado un ganador, solicita confirmación por seguridad escribiendo `REINICIAR`, revierte el estado de electo del ganador, anula los votos y abre una nueva ronda para ese cargo.
6. **Habilitar votante individual**: En la tabla "Quién ha votado", el administrador puede pulsar "Habilitar de nuevo" en cualquier votante para anular su voto previo y permitirle votar otra vez en la misma ronda.

---

## 7. Lista de verificación previa al evento

- [ ] Credenciales de Firebase actualizadas en `js/firebase-config.js`.
- [ ] Reglas desplegadas y verificadas en Firebase Console (`firebase deploy --only firestore:rules`).
- [ ] Cuenta de administrador creada en Authentication y documento en `admins/{uid}` registrado.
- [ ] Aumento temporal de cuota de creación de cuentas por IP solicitado en Firebase Auth.
- [ ] Directivas y candidatos importados desde la pestaña "Directivas y candidatos".
- [ ] Fotos de candidatos cargadas en `img/candidatos/` (formato WebP, máx 80 KB) o iniciales verificadas.
- [ ] Si se utilizará padrón, lista de votantes importada en la pestaña "Padrón electoral" y toggle activado.
- [ ] Prueba de votación completa realizada con 2 teléfonos: ingreso de nombre, emisión de voto, verificación en proyector y cierre de ronda.
#   V o t a C e l  
 