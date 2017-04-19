var validator = require('validator');
var debug = require('debug')('kennel:task');
var config = require('config');
var kue = require('kue');
var queue = kue.createQueue();

module.exports.createTask = function(request) {
  var result = {};
  if (!request.task) {
    return {error: 'missing request parameter: task'};
  }
  var taskDefinition = validator.stripLow(request.task);
  if (!request.container) {
    return {error: 'missing request parameter: container'};
  }
  var containerName = validator.stripLow(request.container);
  if (!request.command) {
    return {error: 'missing request parameter: command'};
  }
  var command = validator.stripLow(request.command);
  var environment = [];
  for (let key in request.environment) {
    var entry = {};
    entry.name = validator.stripLow(key + '');
    entry.value = validator.stripLow(request.environment[key] + '');
    environment.push(entry);
  }

  var params =
  {
    taskDefinition: taskDefinition,
    cluster: config.get("ecs_cluster_name"),
    count: 1,
    overrides: {
      containerOverrides: [
        {
          command: command.split(' '),
          environment: environment,
          name: containerName
        }
      ]
    },
    startedBy: 'kennel-ws'
  };

  var job = queue.create('runTask', params)
  .removeOnComplete(true)
  .save((err) => {
    if (err) {
      debug(`error queueing runTask: ${errr}`);
    } else {
      debug(`job ${job.id} accepted`);
    }
  });

  result.status = 'accepted';
  return result;
}
