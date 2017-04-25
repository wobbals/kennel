const validator = require('validator');
const debug = require('debug')('kennel:task');
const config = require('config');
const queue = require('./jobQueue');
const uuidV4 = require('uuid/v4');
const AWS = require('aws-sdk');
const ecs = new AWS.ECS({
  accessKeyId: config.get("aws_token"),
  secretAccessKey: config.get("aws_secret"),
  region: config.get('ecs_region')
});
const taskModel = require('../model/taskModel');

module.exports.describeTasks = function(taskIds) {
  debug(`describeTasks ${taskIds}`);
  if (taskIds.length < 1) {
    return Promise.resolve({tasks: []});
  }
  return new Promise((resolve, reject) => {
    var params = {
      tasks: taskIds,
      cluster: config.get('ecs_cluster_name')
    };
    ecs.describeTasks(params, function(err, data) {
      if (err) {
        reject(err);
      } else {
        resolve(data);
      }
    });
  });
}

module.exports.createTask = function(request) {
  let result = {};
  if (!request.task) {
    return {error: 'missing request parameter: task'};
  }
  let taskDefinition = validator.stripLow(request.task);
  if (!request.container) {
    return {error: 'missing request parameter: container'};
  }
  let containerName = validator.stripLow(request.container);
  if (!request.command) {
    return {error: 'missing request parameter: command'};
  }
  let command = validator.stripLow(request.command);
  let environment = [];
  for (let key in request.environment) {
    let entry = {};
    entry.name = validator.stripLow(key + '');
    entry.value = validator.stripLow(request.environment[key] + '');
    environment.push(entry);
  }

  let taskId = uuidV4();
  debug(`new task request ${taskId} for ${taskDefinition}`);
  let ecsParams =
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
    startedBy: 'kennel-ws',
  };
  let jobData = {
    ecsParams: ecsParams,
    taskId: taskId
  };

  let p = new Promise((resolve, reject) => {
    let job = queue.create('runTask', jobData)
    .removeOnComplete(true)
    .save((err) => {
      if (err) {
        debug(`error queueing runTask: ${err}`);
        result.error = `failed to enqueue task`;
        reject(result);
      } else {
        debug(`job ${job.id} accepted`);
        result.status = 'accepted';
        result.taskId = taskId;
        resolve(result);
      }
    });
  });
  return p.then(taskModel.createTask(taskId))
  .then(taskModel.registerActiveTask(taskId))
  .then(taskModel.setTaskData(taskId, {
    status: 'queued'
  }));
};
