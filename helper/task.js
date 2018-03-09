const validator = require('validator');
const debug = require('debug')('kennel:task');
const config = require('config');
const queue = require('./jobQueue');
const uuidV4 = require('uuid/v4');
const ecs = require('./aws').ecs;
const taskModel = require('../model/taskModel');

module.exports.describeECSTasks = function(taskIds) {
  debug(`describeECSTasks ${taskIds}`);
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

module.exports.createTask = async function(request) {
  let taskId = uuidV4();
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
  let command = [];
  for (let i in request.command) {
    command.push(validator.stripLow(request.command[i]));
  }
  debug(`command passed: ${request.command}`);
  debug(`command parsed: ${JSON.stringify(command)}`);
  request.environment.TASK_ID = taskId;
  let environment = [];
  for (let key in request.environment) {
    let entry = {};
    entry.name = validator.stripLow(key + '');
    entry.value = validator.stripLow(request.environment[key] + '');
    environment.push(entry);
  }

  debug(`new task request ${taskId} for ${taskDefinition}`);
  let ecsParams =
  {
    taskDefinition: taskDefinition,
    cluster: config.get("ecs_cluster_name"),
    count: 1,
    overrides: {
      containerOverrides: [
        {
          command: command,
          environment: environment,
          name: containerName
        }
      ]
    },
    startedBy: 'kennel-ws',
  };
  let jobData = {
    ecsParams: JSON.stringify(ecsParams),
    taskId: taskId,
    status: 'queued'
  };

  let responseData = {
    taskId: taskId,
    status: 'accepted'
  };

  let jobDelay = 0;
  let launchTime = null;
  debug(`request.requestedLaunchTime: ${request.requestedLaunchTime}`);
  if (validator.isISO8601(`${request.requestedLaunchTime}`))
  {
    launchTime = new Date(`${request.requestedLaunchTime}`);
    let launchDelay = launchTime - new Date();
    // queue the runTask in advance of the requested job start, in case
    // more instances need launching in order to land the job on the cluster
    launchDelay -= 180000;
    jobDelay = Math.max(0, launchDelay);
  }
  debug(`createTask: taskId=${taskId}; jobDelay=${jobDelay}`);
  if (jobDelay > 0) {
    jobData.requestedLaunchTime = launchTime.toISOString();
    jobData.status = 'deferred';
  }

  await taskModel.createTask(taskId);
  await taskModel.registerActiveTask(taskId);
  await taskModel.setTaskData(taskId, jobData);

  return new Promise((resolve, reject) => {
    let job = queue.create('runTask', taskId)
    .removeOnComplete(true)
    .delay(jobDelay)
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
};
