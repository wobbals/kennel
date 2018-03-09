const config = require('config');
const kue_opts = {
  redis: {
      host: config.get("redis_host"),
      port: config.get("redis_port"),
  }
};
const kue = require('kue');
const job_queue = kue.createQueue(kue_opts);

module.exports = job_queue;
