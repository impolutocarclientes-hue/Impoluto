# Impoluto · Números

Sistema contable de Impoluto. Trae las ventas de Shopify y el gasto de Meta Ads por su cuenta, y con eso calcula:

- la ganancia real de cada pedido
- ROAS, ROAS de equilibrio y CPA máximo
- las ofertas y el semáforo de anuncios
- la caja semana por semana
- IVA, IIBB y la provisión de Ganancias
- el reparto 50/50 entre socios

Además trae la calculadora de costos de ESA y la carga de gastos y de aportes y retiros de la app anterior (impoluto-gastos).

- **Diseño:** sale de Escalafy.
- **Conexiones con Shopify y Meta:** usan el mismo método que ESA.
- **Calculadora:** es idéntica a la de ESA (los tests lo comprueban con los valores de su pantalla).

## Deploy en Vercel (unos 15 minutos)

### 1. Crear el proyecto
1. En vercel.com entrá a **Add New → Project** e importá el repo `Impoluto`.
2. En Framework Preset dejá **Other** y tocá **Deploy**. El primer deploy va a mostrar "Falta configurar", y es normal.

### 2. Base de datos
Tenés dos caminos:

- **Para conservar los gastos y los socios de impoluto-gastos:** en **Storage**, conectá a este proyecto la **misma** base Upstash Redis que usa `impoluto-gastos` (**Connect Project** → `Impoluto`). Las dos apps comparten los gastos, los aportes, los retiros y los nombres de los socios.
- **Para arrancar de cero:** **Storage → Create Database → Upstash for Redis** (plan gratis) → **Connect** a `Impoluto`, con todos los entornos tildados.

Vercel carga solas las variables `KV_REST_API_URL` y `KV_REST_API_TOKEN`.

### 3. Variables
En **Settings → Environment Variables**, cargá dos variables con Production, Preview y Development tildados:

| Variable | Valor |
|---|---|
| `APP_PASSWORD` | La clave para entrar. Usá una de 12 caracteres o más. Puede ser la misma de impoluto-gastos. |
| `CRON_SECRET` | Cualquier texto largo y al azar. Con esto la app se actualiza sola todos los días a las 6 de la mañana. |

### 4. Volver a desplegar
En **Deployments**, sobre el último deploy, tocá **⋯ → Redeploy**. Después entrá a la URL con la clave.

### 5. Conectar Shopify y Meta
En la app, entrá a **Configuración → Conexiones** y seguí los pasos que aparecen en pantalla.

- **Shopify:** creás una app propia en dev.shopify.com, con permisos de solo lectura (`read_orders,read_products,read_inventory,read_reports`), la instalás en la tienda y pegás el Client ID y el Client secret. El token se renueva solo cada 24 horas.
- **Meta:** pegás un token de un usuario del sistema con permiso `ads_read` (que no vence) y el ID de la cuenta publicitaria.
- **Mercado Pago (solo lectura):** en tu aplicación de Mercado Pago cargás la URL de redireccionamiento `https://TU-APP.vercel.app/api/mp-callback`, pegás en la app el Client ID y el Client secret, y autorizás en la pantalla oficial de Mercado Pago. La app **rechaza y no guarda cualquier acceso con permiso de escritura**: solo acepta tokens `read`. Con eso usa la comisión real de cada cobro, separa las retenciones (pagos a cuenta) y la caja cuenta la plata el día que se libera. El token se renueva solo.

Apenas conectás, la app trae los últimos 60 días.

### 6. Cargar tus números
En **Configuración**:

- **Productos:** el costo por unidad de cada producto. Marcá como "Agregado" el pad, el e-book y la protección de envío. Ahí también va el stock.
- **Costos y comisiones:**
  - tu dólar
  - el envío y el armado por pedido
  - el % de Mercado Pago, con y sin cuotas
  - Shopify, IIBB y régimen de IVA
  - el beneficio de IVA y la provisión de Ganancias
  - el CPA objetivo por oferta
- **Gastos fijos:** Shopify, apps y el contador.
- **General:** los nombres de los socios, el reparto, el saldo inicial de la caja y quién paga la tarjeta de Meta.

## De dónde sale cada número

- **Ganancia de un pedido:** venta − producto − envío − armado − Mercado Pago − Shopify − IIBB − IVA a pagar.
  - El IVA a pagar es el IVA de venta × (100 − beneficio) % menos el IVA de comisiones, del envío y de lo que te facturen.
- **Ganancia del período:** la suma de los pedidos − anuncios (pasados a pesos, con el recargo) − gastos fijos repartidos día a día.
- **ROAS de equilibrio:** facturación ÷ lo que queda antes de pagar anuncios.
- **Ofertas:** se reconocen por las unidades del producto principal en cada pedido (1, 2, o 3 y más).
- **Semáforo de anuncios:** la ganancia de cada anuncio es lo que vendió según el píxel × el % que queda antes del anuncio, menos lo que gastó. Usa los umbrales de ESA: 25, 20, 15 y 10 %, y US$70.
- **Caja:** lo cobrado (sin comisiones) + aportes − gastos que pagó la caja − anuncios − retiros.
- **Impuestos (pantalla para el contador):** usa los gastos con Factura A que cargaste de verdad. El dashboard, en cambio, estima el IVA pedido por pedido.
- **Socios:** ganancia − provisión de Ganancias = ganancia neta, que se reparte según el %. Saldo de cada socio = lo que puso + su parte − lo que retiró.

## Probar en tu compu

```
npm install
node dev/server.js      # http://localhost:3000, clave impoluto-dev-1234, con datos de ejemplo
npm test                # tests de la calculadora y de las métricas
```

## Seguridad

- Las credenciales de Shopify y Meta se guardan en la base del lado del servidor y nunca vuelven al navegador.
- Todo es de solo lectura: la app no cambia nada en Shopify ni en Meta.
- No se guardan nombres, mails ni direcciones de clientes.
