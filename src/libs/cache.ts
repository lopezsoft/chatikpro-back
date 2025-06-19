// Archivo: /libs/cache.ts (MEJORADO)
import Redis from "ioredis";
import hmacSHA512 from "crypto-js/hmac-sha512";
import Base64 from "crypto-js/enc-base64";
import { REDIS_URI_CONNECTION } from "../config/redis";
import logger from "../utils/logger";

interface SetOptions {
  ttl?: number; // Time to Live en segundos
}

class CacheSingleton {
  private readonly redis: Redis;
  private static instance: CacheSingleton;

  private constructor(redisInstance: Redis) {
    this.redis = redisInstance;
    logger.info("CacheSingleton (Redis) inicializado correctamente.");
  }

  /**
   * Obtiene la instancia Singleton del gestor de caché.
   * @param redisInstance La instancia de ioredis a utilizar.
   * @returns La instancia única de CacheSingleton.
   */
  public static getInstance(redisInstance: Redis): CacheSingleton {
    if (!CacheSingleton.instance) {
      CacheSingleton.instance = new CacheSingleton(redisInstance);
    }
    return CacheSingleton.instance;
  }

  /**
   * Crea una clave única y segura a partir de un objeto de parámetros.
   * Útil para cachear resultados de funciones con múltiples argumentos.
   */
  private static createKeyFromParams(params: any): string {
    const str = JSON.stringify(params);
    // Usar el string como mensaje y una clave secreta (si la tuvieras) sería más seguro,
    // pero para generar una clave única, esto es funcional.
    return Base64.stringify(hmacSHA512(str, str));
  }

  /**
   * Guarda un par clave-valor en Redis.
   * @param key La clave.
   * @param value El valor (string).
   * @param options Opciones adicionales, como el TTL (tiempo de vida en segundos).
   * @returns Promise que resuelve con 'OK' si fue exitoso.
   */
  public async set(key: string, value: string, options?: SetOptions): Promise<string | null> {
    if (options?.ttl) {
      // Usa el comando 'SET' con el parámetro 'EX' para la expiración.
      return this.redis.set(key, value, "EX", options.ttl);
    }
    return this.redis.set(key, value);
  }

  /**
   * Obtiene un valor de Redis a partir de una clave.
   * @param key La clave.
   * @returns Promise que resuelve con el valor o null si no se encuentra.
   */
  public async get(key: string): Promise<string | null> {
    return this.redis.get(key);
  }

  /**
   * Obtiene todas las claves que coinciden con un patrón.
   * ¡PRECAUCIÓN! Usar con cuidado en producción, puede ser lento con muchas claves.
   * @param pattern El patrón (ej: 'sessions:*').
   */
  public async getKeys(pattern: string): Promise<string[]> {
    return this.redis.keys(pattern);
  }

  /**
   * Elimina una clave de Redis.
   * @param key La clave a eliminar.
   */
  public async del(key: string): Promise<number> {
    return this.redis.del(key);
  }

  /**
   * Elimina todas las claves que coinciden con un patrón.
   */
  public async delFromPattern(pattern: string): Promise<void> {
    const keys = await this.getKeys(pattern);
    if (keys.length > 0) {
      await Promise.all(keys.map(key => this.del(key)));
    }
  }

  /**
   * Guarda un valor usando una clave base y un objeto de parámetros para generar una clave final única.
   */
  public async setFromParams(
    key: string,
    params: any,
    value: string,
    options?: SetOptions
  ): Promise<string | null> {
    const finalKey = `${key}:${CacheSingleton.createKeyFromParams(params)}`;
    return this.set(finalKey, value, options);
  }

  /**
   * Obtiene un valor usando una clave base y un objeto de parámetros.
   */
  public async getFromParams(key: string, params: any): Promise<string | null> {
    const finalKey = `${key}:${CacheSingleton.createKeyFromParams(params)}`;
    return this.get(finalKey);
  }

  /**
   * Elimina un valor usando una clave base y un objeto de parámetros.
   */
  public async delFromParams(key: string, params: any): Promise<number> {
    const finalKey = `${key}:${CacheSingleton.createKeyFromParams(params)}`;
    return this.del(finalKey);
  }

  public getRedisInstance(): Redis {
    return this.redis;
  }
}

// Se crea la instancia de Redis una sola vez y se pasa al Singleton.
const redisInstance = new Redis(REDIS_URI_CONNECTION, {
  // Opciones recomendadas para ioredis
  maxRetriesPerRequest: 2,
  enableReadyCheck: true,
});

redisInstance.on('error', err => {
  logger.error('Error de Conexión con Redis:', err);
});

export default CacheSingleton.getInstance(redisInstance);
