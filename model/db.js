const config = require('config');
const redis = require('redis').createClient({
  host: config.get('redis_host'),
  port: config.get('redis_port')
});

module.exports = redis;
