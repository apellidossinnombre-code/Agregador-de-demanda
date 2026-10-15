# AEE · Lanzamientos europeos (GitHub Pages + GitHub Actions)

Sin servidor. Una tarea programada de GitHub (Actions) consulta Launch Library 2 y Spaceflight News API y guarda los resultados en `docs/data/*.json`. La web (GitHub Pages, carpeta `docs/`) solo lee esos archivos, así que recargarla no gasta ninguna petición a las APIs.

## Publicar desde la web de GitHub (sin instalar nada)
1. Crea un repositorio nuevo en github.com (botón "New").
2. Sube el contenido de esta carpeta: "Add file → Upload files" y arrastra las carpetas `docs`, `lib`, `scripts`, `config` y el README.
3. La carpeta oculta `.github` puede no subirse al arrastrar. Crea ese archivo a mano: "Add file → Create new file", escribe el nombre `.github/workflows/update-data.yml` y pega el contenido del archivo del mismo nombre.
4. Settings → Actions → General → "Workflow permissions" → marca "Read and write permissions" → Save.
5. Pestaña Actions → "Actualizar datos" → "Run workflow". Tras unos segundos habrá datos reales en `docs/data/`.
6. Settings → Pages → Source: "Deploy from a branch", rama `main`, carpeta `/docs` → Save. La URL aparece en esa misma pantalla.

## Frecuencia y límite de la API
- Cada 10 min (6 peticiones/hora a LL2 de las 15 permitidas). Cambiar en `cron` de `.github/workflows/update-data.yml`; GitHub no permite menos de 5 min y puede retrasar las ejecuciones.
- Los servidores de GitHub comparten IP con otros usuarios, y el límite anónimo de LL2 es por IP, así que a veces recibirás 429. En ese caso se conservan los últimos datos buenos. Para evitarlo, pide una clave de LL2 (The Space Devs) y guárdala en Settings → Secrets and variables → Actions → New secret `LL2_API_KEY`.
- Se hace commit solo si los datos cambian (o cada ~1 h como latido).
- GitHub desactiva las tareas programadas tras 60 días sin actividad en el repo. Si pasa, actívala de nuevo en la pestaña Actions.

## Criterio europeo y correcciones
La lógica está en `lib/classify.js` (listas de países, agencias y cohetes europeos). Para corregir un lanzamiento a mano edita `config/overrides.json`, p. ej. `{"<id-LL2>": {"payEU": true}}`. El id aparece en cada elemento de `docs/data/launches.json`.

## Privacidad
En planes gratuitos, un repositorio con Pages es público y la web también lo será. Los datos son públicos, pero no pongas nada interno en el repo. Las webs privadas de Pages requieren GitHub Enterprise Cloud.

## Traducción automática y entradas manuales
- Las descripciones y las noticias vienen en inglés. Al generar los datos se traducen al castellano con DeepL (`DEEPL_API_KEY`, la clave gratuita termina en `:fx`) o con la API de Anthropic (`ANTHROPIC_API_KEY`). Basta una de las dos, como secreto de la repo. Cada texto se traduce una sola vez y se guarda en `config/traducciones-*.json`. Sin clave, los textos quedan en inglés.
- `config/manual.json` contiene agencias, empresas y operadores añadidos a mano, con su enlace oficial. Si ya existen en los datos descargados, su descripción y enlaces se sustituyen por los manuales.

## Créditos
Datos de lanzamientos, agencias y cohetes: Launch Library 2 (The Space Devs). Noticias: Spaceflight News API. Sus condiciones de uso animan a citar la fuente. La web no la muestra; se deja constancia aquí.
