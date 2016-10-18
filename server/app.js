const server = require('./server');

server.start({ trustProxy: true });

process.on('SIGTERM', server.stop.bind(server, 'SIGTERM')); //kill (terminate)
process.on('SIGINT', server.stop.bind(server, 'SIGINT')); //Ctrl+C (interrupt)
