module.exports = [{
  script: 'dist/server.js',
  name: 'chatikpro-back',
  exec_mode: 'cluster',            // ✅ Modo de ejecución en clúster
  instances: 'max',                // ✅ Usar el máximo número de instancias disponibles
  max_memory_restart: '2G',        // ✅ Reinicio si la memoria supera 2 GB
  node_args: '--max-old-space-size=2048', // ✅ Argumentos de Node.js para limitar el espacio de memoria
  cron_restart: '05 00 * * *',     // ✅ Reinicio programado a las 00:05 todos los días
  watch: false                     // ✅ Desactivado el modo de vigilancia
}]
