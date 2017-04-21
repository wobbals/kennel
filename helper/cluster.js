var config = require('config');
var debug = require('debug')('kennel:cluster');
var AWS = require('aws-sdk');
var ecs = new AWS.ECS({
  accessKeyId: config.get("aws_token"),
  secretAccessKey: config.get("aws_secret"),
  region: config.get('ecs_region')
});
var instanceHelper = require('./instance');
var Instance = require('../model/instanceModel');
var Task = require('../model/taskModel');

var getContainerInstances = function() {
  let params = {
    cluster: config.get('ecs_cluster_name')
  };
  return new Promise((resolve, reject) => {
    ecs.listContainerInstances(params, (err, data) => {
      if (err) {
        debug(`listContainerInstances error`);
        reject(err);
      } else {
        debug(`getContainerInstances found ` +
          ` ${data.containerInstanceArns.length} instances`);
        resolve(data.containerInstanceArns);
      }
    });
  });
};
module.exports.getContainerInstances = getContainerInstances;

var describeContainerInstances = function(instances) {
  debug(`describeContainerInstances: describe ${instances.length} instances`);
  return new Promise((resolve, reject) => {
    if (instances.length < 1) {
      debug(`no instances. resolving immediately`);
      return resolve({containerInstances: []});
    }
    let params = {
      cluster: config.get('ecs_cluster_name'),
      containerInstances: instances
    };
    ecs.describeContainerInstances(params, (err, data) => {
      if (err) {
        debug(`describeContainerInstances error`);
        reject(err);
      } else {
        resolve(data);
      }
    });
  });
};
module.exports.describeContainerInstances = describeContainerInstances;

var numAvailableInstances = function() {
  return new Promise((resolve, reject) => {
    getContainerInstances()
    .then(describeContainerInstances)
    .then((instanceDescriptions) => {
      let availableInstances = 0;
      instanceDescriptions.containerInstances.forEach((description) => {
        if ('ACTIVE' === description.status) {
          availableInstances++;
        }
      });
      resolve(availableInstances);
    });
  });
};

var getTaskDescription = function(task) {
  debug(`getTaskDescription ${task}`);
  let params = {
    taskDefinition: task
  };
  return new Promise((resolve, reject) => {
    ecs.describeTaskDefinition(params, (err, data) => {
      if (err) {
        reject(err);
      } else {
        resolve(data);
      }
    });
  });
}

var deregisterContainerInstance = function(containerInstanceId) {
  debug(`deregisterContainerInstance ${containerInstanceId}`);
  var params = {
    cluster: config.get('ecs_cluster_name'),
    containerInstance: containerInstanceId
  };
  return new Promise((resolve, reject) => {
    ecs.deregisterContainerInstance(params, function(err, data) {
      if (err) {
        reject(err);
      } else {
        resolve(data);
      }
    });
  });
}
module.exports.deregisterContainerInstance = deregisterContainerInstance;

var autoResize = function() {
  // TODO: this should take a parameter/config to leave some resources hot
  debug(`autoResize: evict all taskless instances`);
  return new Promise((resolve, reject) => {
    getContainerInstances()
    .then(describeContainerInstances)
    .then((instanceDescriptions) => {
      let promises = [];
      instanceDescriptions.containerInstances.forEach((description) => {
        if (0 == description.runningTasksCount &&
          0 == description.pendingTasksCount)
        {
          promises.push(
            deregisterContainerInstance(description.containerInstanceArn)
          );
          promises.push(
            instanceHelper.terminateInstance(description.ec2InstanceId)
          );
        }
      });
      Promise.all(terminatePromises).then(() => {
        resolve();
      }).catch((err) => {
        reject(err);
      });
    });
  });
}
module.exports.autoResize = autoResize;

var instanceAvailableMemory = function(instanceDescription) {
  let memoryResource =
  instanceDescription.remainingResources.filter((resource) => {
    return "MEMORY" === resource.name;
  });
  return memoryResource[0].integerValue;
};

var instanceAvailableCPU = function(instanceDescription) {
  let cpuResource =
  instanceDescription.remainingResources.filter((resource) => {
    return "CPU" === resource.name;
  });
  return cpuResource[0].integerValue;
}

var taskRequiredCPU = function(taskDescription) {
  let cpuRequired = 0;
  taskDescription.taskDefinition.containerDefinitions.forEach((container) => {
    cpuRequired = container.cpu;
  });
  return cpuRequired;
}

var taskRequiredMemory = function(taskDescription) {
  let memoryRequired = 0;
  taskDescription.taskDefinition.containerDefinitions.forEach((container) => {
    memoryRequired = container.memory;
  });
  return memoryRequired;
}

var canRunTaskImmediately = function(task) {
  return new Promise((resolve, reject) => {
    let taskDescription = getTaskDescription(task.taskDefinition);
    let instanceDescriptions =
    getContainerInstances().then(describeContainerInstances);
    Promise.all([taskDescription, instanceDescriptions]).then((values) => {
      // js nerds: is there a better way to map the promise results back from
      // the original call to Promise.all? Can I rely on the ordering to be
      // preserved here?
      let description = values[0];
      let instances = values[1];
      let availableInstances = 0;
      let requiredMemory = taskRequiredMemory(description);
      let requiredCPU = taskRequiredCPU(description);
      debug(`task: mem=${requiredMemory} cpu=${requiredCPU}`);
      instances.containerInstances.forEach((instance) => {
        let availableMemory = instanceAvailableMemory(instance);
        let availableCPU = instanceAvailableCPU(instance);
        debug(`instance ${instance.ec2InstanceId}: ` +
          `available mem=${availableMemory} cpu=${availableCPU}`
        );
        if (availableCPU >= requiredCPU && availableMemory >= requiredMemory) {
          availableInstances++
        }
      });
      resolve(availableInstances > 0);
    }).catch(reason => {
      reject(reason);
      debug(`canRunTaskImmediately: ${reason}`);
      debug(reason.stack)
    });
  });
};
module.exports.canRunTaskImmediately = canRunTaskImmediately;

var listTasksRunning = function() {
  return new Promise((resolve, reject) => {
    var params = {
      cluster: config.get('ecs_cluster_name')
    };
    ecs.listTasks(params, function(err, data) {
      if (err) {
        debug(`listTasksRunning: ${err}`);
        reject(err);
      } else {
        debug(`listTasksRunning: found ${data.taskArns.length} running tasks`);
        resolve(data);
      }
    });
  });
}

var runTask = function(task) {
  return new Promise((resolve, reject) => {
    ecs.runTask(task, function(err, data) {
      if (err) {
        debug(`runTask: failed with ${err}`);
        reject(err);
      } else {
        let taskArn = data.tasks[0].taskArn;
        debug(`runTask: launched ${taskArn}`);
        resolve(data);
      }
    });
  });
};
module.exports.runTask = runTask;

module.exports.launchInstance = instanceHelper.launchClusterInstance;
