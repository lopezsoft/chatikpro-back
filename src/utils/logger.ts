import pino from 'pino';
import moment from 'moment-timezone';

// Set the default timezone to 'America/Bogota' if not set in the environment
// process.env.TZ = process.env.TZ || 'America/Bogota';
// Set the default locale to 'es' (Spanish) if not set in the environment
moment.locale(process.env.LANG || 'es');
const timezoned = () => {
  const timeZone = process.env.TZ || 'America/Bogota'; 
  return moment().tz(timeZone).format('DD-MM-YYYY HH:mm:ss');
};

const logger = pino({
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true,
      levelFirst: true,
      translateTime: 'SYS:dd-mm-yyyy HH:MM:ss', 
      ignore: "pid,hostname"
    },
  },
  timestamp: () => `,"time":"${timezoned()}"`, 
});

export default logger;
