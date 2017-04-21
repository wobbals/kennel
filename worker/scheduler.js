const kue = require('kue');
const queue = kue.createQueue();
const cluster = require('../helper/cluster');
const debug = require('debug')('worker:scheduler');
const taskModel = require('../model/taskModel');

queue.process('runTask', function(job, done){
  runTask(job, done);
});

queue.process('clusterResize', function(job, done) {
  cluster.autoResize();
  done();
});

debug(`connected to queue redis at ${queue.client.address}`);
debug(`worker standing by`);

function runTask(job, done) {
  let taskId = job.data.taskId;
  cluster.canRunTaskImmediately(job.data.ecsParams).then((hasResources) => {
    if (!hasResources) {
      debug(`no instances available. launch instance and try again later`);
      // add resources and try again later
      cluster.launchInstance().then(() => {
        tryAgainLater(job, 180);
        done();
      }, (err) => {
        debug(`instance launch failure. what do? ${err}`);
      });
    } else {
      debug(`task ${taskId} can be scheduled immediately. requesting runTask`);
      cluster.runTask(job.data.ecsParams).then((result) => {
        debug(`runTask succeeded. clean up`);
        Instance.addTaskIds(taskId);
        let taskArn = result.tasks[0].taskArn;
        taskModel.setTaskArn(task, taskArn)
        .then(taskModel.setTaskStatus(taskId, 'running'))
        .catch(err => {
          debug(`task model updates failed: ${err}`);
        });
        debug(`runTask succeeded. clean up complete`);
        done();
      }, (err) => {
        debug(`failed to schedule job ${job.id}`);
        taskModel.setTaskError(taskId, 'server error: cluster.runTask');
        done(err);
      });
    }
  });
};

function tryAgainLater(job, seconds) {
  let taskId = job.data.taskId;
  let deferredJob = queue.create('runTask', job.data)
  .delay(seconds * 1000)
  .priority('high')
  .removeOnComplete(true)
  .save();
  taskModel.setStatus(taskId, 'waitingForCluster');
  debug(`Retry task ${taskId} in ${seconds} seconds`);
}

function scheduleCleanup(taskArns, seconds) {
  debug(`scheduleCleanup: check in on tasks ${taskArns} in ${seconds} seconds`);
  let deferredJob = queue.create('cleanup', taskArns)
  .delay(seconds * 1000)
  .removeOnComplete(true)
  .save();
}

function resizeAfter(seconds) {
  debug(`resizeAfter: request cluster resize in ${seconds} seconds`);
  let deferredJob = queue.create('clusterResize', {})
  .delay(seconds * 1000)
  .removeOnComplete(true)
  .save();
}

function daemonMain() {
  taskModel.getActiveTasks().then(taskIds => {
    taskIds.forEach(taskId => {
      debug(`daemon: need to check in on ${taskId}`);
    });
    cluster.autoResize();
  }).catch(err => {
    debug(`daemon: mistakes were made: ${err}`);
  });
}

setInterval(daemonMain, 600000);
daemonMain();
