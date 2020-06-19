function isYes(value) {
  return value && ['true', 'yes', 'y'].includes(value.toLowerCase());
}

const config = {
  passcode: process.env.PASSCODE,
  isDemoMode: (process.env.PASSCODE === 'rpnow demo'),
  multi: (process.argv[3] === 'multi'),
  lockdown: isYes(process.env.LOCKDOWN),
  port: +process.env.PORT || 13000,
  data: process.argv[2] || 'rpdata',
}

if (!config.passcode) {
  console.error('Missing passcode. Exiting...');
  process.exit(1);
}

module.exports = config;
