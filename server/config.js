function isYes(value) {
  return value && ['true', 'yes', 'y'].includes(value.toLowerCase());
}

const config = {
  chatScrollback: 10,
  pageLength: 20,
  passcode: process.env.PASSCODE,
  isDemoMode: (process.env.PASSCODE === 'rpnow demo'),
  lockdown: isYes(process.env.LOCKDOWN),
  port: +process.env.PORT || 13000,
  data: '.data',
}

if (!config.passcode) {
  console.error('Missing passcode. Exiting...');
  process.exit(1);
}

module.exports = config;
