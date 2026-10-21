# Avisos por correo con Microsoft 365

Cuando un lanzamiento europeo entra en la ventana de 15 días, la tarea de GitHub añade un aviso a `docs/data/avisos.xml` (un feed RSS). Power Automate lee ese feed y envía el correo a la lista de suscriptores, que vive en SharePoint. Las direcciones nunca pasan por GitHub.

Todo se hace con conectores estándar de Microsoft 365: Microsoft Forms, SharePoint, RSS y Outlook. Los nombres de las acciones pueden variar un poco según el idioma y la versión de tu tenant.

## Antes de empezar (con TI)
- Un sitio de SharePoint donde crear una lista, y permiso para usar Forms y Power Automate.
- Recomendable: un buzón compartido (por ejemplo avisos-lanzamientos@…) para enviar los correos.
- Si los destinatarios son solo personal de la AEE, el formulario se limita a la organización y Microsoft verifica la dirección de cada persona. Si habrá destinatarios externos, el formulario tiene que estar abierto a cualquiera y entonces hace falta una confirmación por correo (doble opt-in) que esta guía no cubre.

## 1. Lista de suscriptores
En SharePoint, crea una lista "Suscriptores avisos". Usa la columna Título para guardar el correo.

## 2. Formulario
En Microsoft Forms crea un formulario con una pregunta de elección: "Quiero recibir avisos" / "Quiero darme de baja". En Configuración: solo personas de tu organización pueden responder, y registrar el nombre (así llega el correo de quien responde). Copia el enlace y pégalo en `AVISOS_URL` dentro de `docs/index.html`.

## 3. Flujo A: altas y bajas
Flujo automatizado con el desencadenador "Cuando se envía una respuesta nueva" (Forms):
1. "Obtener los detalles de la respuesta".
2. SharePoint "Obtener elementos", filtrando Título igual al correo de quien responde.
3. Condición por la respuesta:
   - Alta y no existe: "Crear elemento" con el correo en Título.
   - Baja y existe: "Eliminar elemento".
4. Opcional: un correo de confirmación a la persona.

## 4. Flujo B: enviar el aviso
Flujo automatizado con "Cuando se publica un elemento de fuente" (RSS). La dirección del feed es:
`https://TU-USUARIO.github.io/TU-REPO/data/avisos.xml`
1. SharePoint "Obtener elementos" de la lista de suscriptores.
2. "Seleccionar": desde el valor de la lista, asigna el campo Título.
3. Outlook "Enviar un correo electrónico (V2)" (o desde el buzón compartido):
   - Para: el propio buzón de avisos.
   - CCO: la expresión `join(body('Seleccionar'), ';')`. Así los suscriptores no ven las direcciones de los demás.
   - Asunto: el título del elemento del feed.
   - Cuerpo: el resumen del elemento del feed, y al final una línea con el enlace al formulario para darse de baja.

Exchange Online limita los destinatarios por mensaje y por día. Si la lista es grande, pregunta a TI los límites de tu tenant.

## 5. Ajustes opcionales en GitHub
En Settings → Secrets and variables → Actions → pestaña Variables:
- `ALERT_DAYS`: días de antelación (por defecto 15).
- `SITE_URL`: dirección de la web (por defecto se deduce de la repo).

## 6. Probarlo
Lanza "Actualizar datos" en Actions. Si hay un lanzamiento europeo confirmado a menos de 15 días, aparecerá en `docs/data/avisos.xml` y el flujo B enviará el correo en su siguiente comprobación del feed. Un lanzamiento solo genera un aviso, aunque cambie de fecha después. Los lanzamientos con fecha "por determinar" no generan avisos.

## Protección de datos
Antes de publicar el formulario, conviene que el delegado de protección de datos de la AEE revise la finalidad, la base jurídica, el plazo de conservación y la información que se da a quien se suscribe.
