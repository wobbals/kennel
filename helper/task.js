var validator = require('validator');
var debug = require('debug')('kennel:task');
var AWS = require('aws-sdk');
var config = require('config');
var ecs = new AWS.ECS({
  accessKeyId: config.get("aws_token"),
  secretAccessKey: config.get("aws_secret"),
  region: config.get('ecs_region')
});

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
  // this should get pushed to an async worker - if there are no nodes
  // available, then it's necessary to spin up new instances or wait.
  ecs.runTask(params, function(err, data) {
    if (err) console.log(err, err.stack); // an error occurred
    else     console.log(data);           // successful response
  });
  return params;
}
