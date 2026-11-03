# 3GPP EN-DC Configurations Explorer & Filter

Aplicación web desarrollada con **Python Flask**, **HTML5**, **JavaScript (ES6+)** y **CSS3** para consultar, filtrar, inspeccionar y exportar combinaciones de **E-UTRA / NR Dual Connectivity (EN-DC)** definidas por **3GPP TS 38.101-3** a partir de los datos de [sqimway.com/nr_endc.php](https://www.sqimway.com/nr_endc.php).

---

## 🚀 Características Principales

1. **Filtro Avanzado por Bandas (LTE y/o 5G NR)**:
   - Permite ingresar bandas LTE (ej. `1, 3, 7, 28` o `B1, B3`) y/o bandas 5G NR (ej. `n78, n77, n1` o `78, 77`).
   - Botones tipo *chips* interactivos para selección rápida de las bandas más comunes.
   - **Criterios de coincidencia**:
     - **Contiene todas las bandas (AND)** *(Recomendado)*: Encuentra todas las combinaciones que incluyan conjuntamente las bandas solicitadas (ideal para resolver dudas técnicas de despliegue).
     - **Contiene cualquiera de las bandas (OR)**: Encuentra combinaciones que contengan al menos una de las bandas indicadas.
     - **Coincidencia exacta**: Encuentra únicamente combinaciones formadas exclusivamente por el conjunto exacto de bandas.

2. **Categorías 3GPP y Búsqueda Libre**:
   - Filtro por categoría: Intra-banda contigua, Intra-banda no contigua, Inter-banda (2, 3, 4, 5 y 6 bandas).
   - Búsqueda en texto instantánea (por ejemplo: `n78(2A)`, `1C`, `DC_3A`, etc.).

3. **Detalles Completos por Combinación**:
   - Nombre de configuración Downlink (ej. `DC_1A-3A_n78A`).
   - Configuración Uplink (UL EN-DC) con detalle de rutas soportadas.
   - Desglose de Component Carriers (CC) y Clases de Ancho de Banda (A, B, C, (2A)...).
   - Anchos de banda de canal y anchos de banda agregados máximos (en intra-banda).
   - Modal interactivo con referencia técnica a la especificación 3GPP TS 38.101-3.

4. **Exportación y Copia Rápida**:
   - **Copiar Lista**: Copia todas las combinaciones filtradas directamente al portapapeles en formato TSV tabular listo para pegar en Excel, Word o correo.
   - **Exportar a CSV**: Descarga inmediata de un archivo `.csv` con codificación UTF-8 con BOM (`utf-8-sig`) para compatibilidad nativa con Microsoft Excel en Windows.

5. **Actualización en Tiempo Real**:
   - Botón de actualización con indicador animado de carga (spinner).
   - Consulta el endpoint remoto de `sqimway.com/nr_endc.php`, analiza las tablas y guarda en caché local (`data/endc_cache.json`) para arranques instantáneos.

---

## 📋 Requisitos e Instalación

### Requisitos:
- Python 3.9 o superior
- Paquetes en `requirements.txt` (`Flask`, `requests`, `beautifulsoup4`)

### Instalación:
```bash
pip install -r requirements.txt
```

---

## 💻 Ejecución

Para iniciar el servidor de desarrollo Flask:
```bash
python app.py
```

Luego abre en tu navegador web:
```
http://localhost:5000
```

---

## 📂 Estructura del Proyecto

```
CombosENDC/
│
├── app.py                   # Servidor Flask principal y API REST
├── data_manager.py          # Módulo de extracción (scraping), parseo y caché JSON
├── requirements.txt         # Dependencias Python
├── README.md                # Documentación del proyecto
│
├── data/
│   └── endc_cache.json      # Base de datos local en caché (4,526 combinaciones)
│
├── static/
│   ├── css/
│   │   └── style.css        # Estilos modernos, diseño responsivo y tema telecom
│   └── js/
│       └── app.js           # Lógica interactiva en cliente (filtros, paginación, modales, CSV)
│
└── templates/
    └── index.html           # Interfaz web Single Page Application (SPA)
```

---

## 📡 Endpoints de la API

| Método | Endpoint | Descripción |
|---|---|---|
| `GET` | `/` | Interfaz web principal |
| `GET` | `/api/status` | Estado de la base de datos, total de combinaciones y fecha |
| `POST` | `/api/refresh` | Actualiza la base de datos desde `sqimway.com` |
| `POST` | `/api/filter` | Filtra combinaciones según bandas, modo y texto |
| `GET` | `/api/export/csv` | Descarga el archivo CSV con las combinaciones filtradas |
