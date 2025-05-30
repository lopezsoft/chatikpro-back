// src/config/swagger.ts

import swaggerJsdoc, { Options } from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';
import { Express } from 'express';
import dotenv from 'dotenv';

// Cargar variables de entorno
dotenv.config();

const port: number = parseInt(process.env.PORT || '3000', 10);

// Determinar la URL del servidor API según el entorno
let apiServerUrl: string;
apiServerUrl = process.env.SWAGGER_API_SERVER_URL || `http://localhost:${port}/api/v1`;

const swaggerOptions: Options = {
  definition: {
    openapi: '3.0.3',
    info: {
      title: process.env.APP_NAME || 'API Documentation',
      version: process.env.APP_VERSION || '1.0.0',
      description: process.env.APP_DESCRIPTION || 'A detailed description of your API.',
      contact: {
        name: process.env.API_CONTACT_NAME || 'API Support',
        url: process.env.API_CONTACT_URL || undefined, // Opcional
        email: process.env.API_CONTACT_EMAIL || undefined, // Opcional
      },
    },
    servers: [
      {
        url: apiServerUrl,
        description: process.env.NODE_ENV === 'production' ? 'Servidor de Producción' : 'Servidor de Desarrollo Local',
      },
      // Puedes añadir más servidores aquí si es necesario
    ],
    // (Opcional) Si quieres proteger tus docs con JWT u otro esquema:
   /*  components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
    },
    security: [
      {
        bearerAuth: [],
      },
    ], */
  },
  // Rutas a los archivos que contienen las anotaciones JSDoc para tu API.
  // Ajusta estas rutas según la estructura de tu proyecto.
  apis: ['./src/routes/**/*.ts', './src/controllers/**/*.ts', './src/app.ts'], // Importante que estas rutas sean correctas
};

const openapiSpecification = swaggerJsdoc(swaggerOptions);

export const setupSwagger = (app: Express) => {
    app.use(
    '/api-docs', // La ruta donde se servirá la UI
    swaggerUi.serve, // Middleware para servir los assets de Swagger UI
    swaggerUi.setup(openapiSpecification, { // Middleware para configurar la UI con tu spec
        explorer: true, // Muestra la barra de exploración (útil)
        customCss: '.swagger-ui .topbar { display: none }', // CSS personalizado
    })
    );
    console.log(`Documentación Swagger UI disponible en http://localhost:${port}/api-docs (o la URL de tu servidor)`);
};

// (Opcional) Podrías exportar openapiSpecification si lo necesitas en otro lugar,
// por ejemplo, para herramientas de testing o generación de clientes.
// export { openapiSpecification };