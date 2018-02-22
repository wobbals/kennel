var config = require('config');
var debug = require('debug')('kennel:cluster');
var ecs = require('./aws').ecs;
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
        debug(`getContainerInstances: found` +
          ` ${data.containerInstanceArns.length} instances`);
        resolve(data.containerInstanceArns);
      }
    });
  });
};
module.exports.getContainerInstances = getContainerInstances;

var describeContainerInstances = function(instances) {
  debug(instances);
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
        //debug(data);
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

var getLocalContainerData = function() {
  return getContainerInstances()
  .then(containerIds => {
    let promises = [];
    containerIds.forEach(containerId => {
      promises.push(
        Instance.getInstanceIdForArn(containerId)
        .then(Instance.getInstance)
      );
    });
    return Promise.all(promises);
  });
}

var autoAddInstances = async function(idleCount) {
  const warmInstances = config.get('warmInstances');
  const launchTimeoutThreshold = config.get('instanceLaunchTimeout') * 1000;
  let numInstancesNeeded = warmInstances - idleCount;
  debug(`autoAddInstances: not enough idle instances. ` +
    `need ${numInstancesNeeded} to meet warmInstances quota`
  );
  let currentLaunchTimeout = await Instance.getLaunchTimeout();
  let now = new Date().getTime();
  // don't launch more instances if we just did recently
  if (now - currentLaunchTimeout < launchTimeoutThreshold) {
    debug(`launch timeout too recent to auto add instances. ` +
      `current: ${now - currentLaunchTimeout} thresh: ${launchTimeoutThreshold}`
    );
    return;
  }
  for (let i = 0; i < numInstancesNeeded; i++) {
    instanceHelper.launchSpotInstance();
  }
  Instance.setLaunchTimeout();
}

var autoResize = async function() {
  const warmIdleTimeout = config.get('warmIdleTimeout');
  const warmInstances = config.get('warmInstances');
  debug(`autoResize: targeting ${warmInstances} warm instances` +
    ` (idleTimeout=${warmIdleTimeout})`
  );
  let containerData = await getLocalContainerData();
  let now = new Date();
  let idleInstances = containerData.filter(instance => {
    if (!instance || !instance.idleSince) {
      return false;
    }
    let idleStart = new Date(parseInt(instance.idleSince));
    debug(`now=${now} idleStart=${idleStart}`);
    debug(`instance ${instance.instanceId}: ${now - idleStart} ms idle`);
    return (now - idleStart) > warmIdleTimeout * 1000;
  });
  let idleCount = idleInstances.length;
  debug(`autoResize: ${idleCount} idle instances:`+
    ` ${JSON.stringify(idleInstances)}`
  );
  if (idleCount < warmInstances) {
    await autoAddInstances(idleCount);
  }
  for (let i = 0; i < idleCount - warmInstances; i++) {
    if (!idleInstances.length) {
      debug(`not enough instances to leave ${warmInstances} warm`);
      break;
    }
    let instance = idleInstances.shift();
    await deregisterContainerInstance(instance.arn)
    await instanceHelper.terminateInstance(instance.instanceId)
  }
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

// TODO: This function probably has about 3x the network calls necessary to
// complete the task. A little caching could go a long way...
const canRunTaskImmediately = async function(ecsTask, taskId) {
  try {
    debug(`canRunTaskImmediately: taskId=${taskId}`);
    let taskDescription = await getTaskDescription(ecsTask.taskDefinition);
    let instances = await getContainerInstances();
    let instanceDescriptions = await describeContainerInstances(instances);
    let availableInstances = 0;
    let requiredMemory = taskRequiredMemory(taskDescription);
    let requiredCPU = taskRequiredCPU(taskDescription);
    debug(`canRunTaskImmediately: task ${taskId} requires: `+
      `mem=${requiredMemory} cpu=${requiredCPU}`);
    let taskIds = await Task.getActiveTaskIds();
    for (let instance of instanceDescriptions.containerInstances) {
      let availableMemory = instanceAvailableMemory(instance);
      let availableCPU = instanceAvailableCPU(instance);
      let instanceTags =
      await instanceHelper.getInstanceTags(instance.ec2InstanceId);
      let instanceEarmark = null;
      for (let tag of instanceTags) {
        if ('EARMARK' === tag.Key) {
          instanceEarmark = tag.Value;
          debug(`canRunTaskImmediately: ${instance.ec2InstanceId} is `+
            `earmarked for ${instanceEarmark}`);
          break;
        }
      }
      let earmarkPermitted =
       (instanceEarmark === taskId || !taskIds.includes(instanceEarmark));

      if (availableCPU >= requiredCPU &&
        availableMemory >= requiredMemory &&
        earmarkPermitted)
      {
        debug(`canRunTaskImmediately: taskId=${taskId}:`+
          `${instance.ec2InstanceId} is available`);
        availableInstances++;
        break;
      }
    }
    debug(`canRunTaskImmediately:  taskId=${taskId}:`+
      ` ret=${availableInstances > 0}`);
    return availableInstances > 0;
  } catch (e) {
    debug(`canRunTaskImmediately: taskId=${taskId}: ${e.message}`);
    return false;
  }
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
  debug(`runTask: task=${JSON.stringify(task)}`);
  return new Promise((resolve, reject) => {
    ecs.runTask(task, function(err, data) {
      if (err) {
        debug(`runTask: failed with ${err}`);
        reject(err);
      } else if (data.failures && data.failures.length > 0) {
        let err = {};
        err.data = data;
        err.causedBy = 'cluster.runTask';
        err.stack = new Error().stack;
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

module.exports.markRunningInstance = function(runTaskResponse) {
  let promises = [];
  runTaskResponse.tasks.forEach(task => {
    promises.push(
      Instance.getInstanceIdForArn(task.containerInstanceArn)
      .then(Instance.clearIdleSince)
    );
  });
  return Promise.all(promises);
}

module.exports.mergeECSInstanceDescriptions = function(ecsDescriptions) {
  debug(`mergeECSInstanceDescriptions: ${JSON.stringify(ecsDescriptions)}`);
  let promises = [];
  ecsDescriptions.containerInstances.forEach(instanceData => {
    let instanceId = instanceData.ec2InstanceId;
    promises.push(
      Instance.setInstanceArn(instanceId, instanceData.containerInstanceArn)
    );
    promises.push(
      Instance.setInstanceData(
        instanceId,
        {
          instanceId: instanceId,
          status: instanceData.status,
          runningTasksCount: instanceData.runningTasksCount,
          pendingTasksCount: instanceData.pendingTasksCount
        }
      )
    );
    promises.push(Instance.clearPendingInstance(instanceId));
    let isPassive = (
      0 == instanceData.runningTasksCount &&
      0 == instanceData.pendingTasksCount
    );
    let p;
    if (isPassive) {
      p = Instance.getIdleSince(instanceId).then(since => {
        debug(`${instanceId} idle since=${since}`);
        if (!since) {
          return Instance.setIdleSince(instanceId, new Date());
        }
      });
    } else {
      p = Instance.clearIdleSince(instanceId);
    }
    promises.push(p);
  });
  return Promise.all(promises);
}
